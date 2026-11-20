import type { AspectRatio, CaptionConfig, ProjectPlan, SceneSpec, ValidationIssue } from '../types/studio';

export interface WordTiming {
  word: string;
  cleanLower: string;
  isEmphasis: boolean;
  startSec: number;
  endSec: number;
}

const TECHNICAL_DIRECTION_RX =
  /\b(c[aâ]mera\s+(acompanha|segue|aproxima|afasta)|plano\s+(geral|m[eé]dio|detalhe)|dolly_in|dolly_out|tracking|close_up|fade_black|crossfade|corte\s+seco\s+para)\b/i;

export function getMaxCharsPerLine(aspectRatio: AspectRatio): number {
  if (aspectRatio === '9:16') return 32;
  if (aspectRatio === '1:1') return 36;
  return 44;
}

/**
 * Splits words into balanced, natural lines respecting maxCharsPerLine AND preventing
 * awkward 1-word orphan lines at the end of captions.
 */
export function wrapBalancedLines(words: WordTiming[], maxCharsPerLine: number): WordTiming[][] {
  if (words.length === 0) return [];
  const fullText = words.map((w) => w.word).join(' ');
  if (fullText.length <= maxCharsPerLine) {
    return [words];
  }

  // Greedy first pass respecting character budget
  const lines: WordTiming[][] = [];
  let current: WordTiming[] = [];
  let curLen = 0;

  for (const wt of words) {
    const addLen = current.length === 0 ? wt.word.length : curLen + 1 + wt.word.length;
    if (current.length > 0 && addLen > maxCharsPerLine) {
      lines.push(current);
      current = [wt];
      curLen = wt.word.length;
    } else {
      current.push(wt);
      curLen = addLen;
    }
  }
  if (current.length > 0) lines.push(current);

  // Rebalance 2-line captions so line lengths are balanced and never leave a 1-word orphan
  if (lines.length === 2 && lines[1].length === 1 && lines[0].length >= 3) {
    const moved = lines[0].pop()!;
    const newLine2Len = moved.word.length + 1 + lines[1][0].word.length;
    if (newLine2Len <= maxCharsPerLine + 2) {
      lines[1].unshift(moved);
    } else {
      lines[0].push(moved);
    }
  } else if (lines.length === 2) {
    // Try optimal midpoint split minimizing line length difference within budget
    let bestSplit = -1;
    let bestDiff = Infinity;
    for (let split = 1; split < words.length; split++) {
      const l1 = words.slice(0, split).map((w) => w.word).join(' ');
      const l2 = words.slice(split).map((w) => w.word).join(' ');
      if (l1.length <= maxCharsPerLine && l2.length <= maxCharsPerLine && split >= 2 && words.length - split >= 2) {
        const diff = Math.abs(l1.length - l2.length);
        if (diff < bestDiff) {
          bestDiff = diff;
          bestSplit = split;
        }
      }
    }
    if (bestSplit > 0) {
      return [words.slice(0, bestSplit), words.slice(bestSplit)];
    }
  }

  return lines.slice(0, 3);
}

export function buildSceneWordTimings(scene: SceneSpec, sceneStartSec: number): WordTiming[] {
  const words = scene.captionText
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return [];

  const emphasisSet = new Set((scene.captionEmphasisWords ?? []).map((w) => w.toLowerCase()));
  const padStart = Math.min(0.32, scene.duration * 0.08);
  const padEnd = Math.min(0.32, scene.duration * 0.08);
  const usable = Math.max(0.4, scene.duration - padStart - padEnd);
  const totalChars = words.reduce((acc, w) => acc + Math.max(2, w.length), 0);

  let cursor = sceneStartSec + padStart;
  return words.map((word) => {
    const cleanLower = word.toLowerCase().replace(/[.,;:!?…"“”()]/g, '');
    const weight = Math.max(2, word.length) / totalChars;
    const dur = usable * weight;
    const item: WordTiming = {
      word,
      cleanLower,
      isEmphasis: emphasisSet.has(cleanLower),
      startSec: cursor,
      endSec: cursor + dur,
    };
    cursor += dur;
    return item;
  });
}

function formatSrtTime(sec: number): string {
  const totalMs = Math.max(0, Math.round(sec * 1000));
  const hours = Math.floor(totalMs / 3600000);
  const mins = Math.floor((totalMs % 3600000) / 60000);
  const secs = Math.floor((totalMs % 60000) / 1000);
  const ms = totalMs % 1000;
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
}

function formatAssTime(sec: number): string {
  const totalCs = Math.max(0, Math.round(sec * 100));
  const hours = Math.floor(totalCs / 360000);
  const mins = Math.floor((totalCs % 360000) / 6000);
  const secs = Math.floor((totalCs % 6000) / 100);
  const cs = totalCs % 100;
  return `${hours}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

function hexToAssColor(hex: string): string {
  const clean = hex.replace('#', '');
  if (clean.length !== 6) return '&H00FFFFFF';
  const r = clean.slice(0, 2);
  const g = clean.slice(2, 4);
  const b = clean.slice(4, 6);
  return `&H00${b}${g}${r}`.toUpperCase();
}

export function generateSRT(project: ProjectPlan): string {
  if (!project.captions.enabled) return '';
  const maxChars = getMaxCharsPerLine(project.format.aspectRatio);
  let index = 1;
  let cursor = 0;
  const blocks: string[] = [];

  for (const scene of project.scenes) {
    const timings = buildSceneWordTimings(scene, cursor);
    if (timings.length > 0) {
      const lines = wrapBalancedLines(timings, maxChars).map((ln) => ln.map((w) => w.word).join(' '));
      const start = cursor + Math.min(0.25, scene.duration * 0.06);
      const end = cursor + scene.duration - Math.min(0.25, scene.duration * 0.06);
      blocks.push(`${index}\n${formatSrtTime(start)} --> ${formatSrtTime(end)}\n${lines.join('\n')}\n`);
      index++;
    }
    cursor += scene.duration;
  }

  return blocks.join('\n');
}

export function generateASS(project: ProjectPlan, width = 1080, height = 1920): string {
  const cfg = project.captions;
  const maxChars = getMaxCharsPerLine(project.format.aspectRatio);
  const primary = hexToAssColor(cfg.highlightColor);
  const secondary = hexToAssColor(cfg.textColor);
  const marginV = Math.round(height * (1 - cfg.positionY));
  const marginH = Math.round(width * cfg.safeAreaMargin);

  const header = `[Script Info]
Title: ${project.title}
ScriptType: v4.00+
PlayResX: ${width}
PlayResY: ${height}
WrapStyle: 2
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,DM Sans,${Math.round(cfg.fontSize * (width / 540))},${primary},${secondary},&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,${cfg.outlineWidth},${Math.max(1, Math.round(cfg.shadowBlur / 4))},2,${marginH},${marginH},${marginV},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  if (!cfg.enabled) return header;

  let cursor = 0;
  const lines: string[] = [];

  for (const scene of project.scenes) {
    const timings = buildSceneWordTimings(scene, cursor);
    if (timings.length > 0) {
      const wrapped = wrapBalancedLines(timings, maxChars);
      const start = formatAssTime(timings[0].startSec);
      const end = formatAssTime(timings[timings.length - 1].endSec);
      const formattedLines = wrapped
        .map((line) =>
          line
            .map((w) => {
              const cs = Math.max(5, Math.round((w.endSec - w.startSec) * 100));
              if (cfg.preset === 'bold_karaoke') {
                return `{\\kf${cs}}${w.word}`;
              }
              return w.isEmphasis ? `{\\c${primary}}${w.word}{\\c${secondary}}` : w.word;
            })
            .join(' ')
        )
        .join('\\N');
      lines.push(`Dialogue: 0,${start},${end},Default,,0,0,0,,{\\fad(140,180)}${formattedLines}`);
    }
    cursor += scene.duration;
  }

  return header + lines.join('\n') + '\n';
}

/**
 * Validates caption formatting, line limits, natural PT-BR integrity, and visual-scene compatibility.
 */
export function validateCaptionsCoherence(project: ProjectPlan): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!project.captions.enabled) return issues;

  const maxChars = getMaxCharsPerLine(project.format.aspectRatio);

  for (let i = 0; i < project.scenes.length; i++) {
    const sc = project.scenes[i];
    const text = sc.captionText.trim();
    if (!text) continue;

    // 1. Detect technical camera/editing stage directions leaked into visible subtitles
    if (TECHNICAL_DIRECTION_RX.test(text)) {
      issues.push({
        severity: 'warning',
        code: 'CAPTION_STAGE_DIRECTION_LEAK',
        sceneIndex: i,
        message: `Cena ${i + 1}: legenda contém instrução técnica de câmera/edição ("${text.slice(0, 48)}...").`,
      });
    }

    // 2. Detect excessively long captions (> 2.8x max line budget => cramped or truncated on vertical video)
    if (text.length > maxChars * 3) {
      issues.push({
        severity: 'warning',
        code: 'CAPTION_TOO_LONG',
        sceneIndex: i,
        message: `Cena ${i + 1}: legenda longa demais (${text.length} caracteres; limite recomendado ${maxChars * 2} para ${project.format.aspectRatio}).`,
      });
    }

    // 3. Detect semantic mismatch: caption inventing events completely disconnected from scene summary/sourceBeat
    const sceneContext = `${sc.title} ${sc.summary} ${sc.sourceBeat ?? ''}`
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
    const captionTokens = text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length >= 5);

    if (captionTokens.length >= 3) {
      const overlap = captionTokens.filter((tok) => sceneContext.includes(tok));
      if (overlap.length === 0) {
        issues.push({
          severity: 'warning',
          code: 'CAPTION_VISUAL_MISMATCH',
          sceneIndex: i,
          message: `Cena ${i + 1}: texto da legenda não corresponde às ações visuais descritas na cena.`,
        });
      }
    }
  }

  return issues;
}

export function drawWordByWordCaption(
  ctx: CanvasRenderingContext2D,
  scene: SceneSpec,
  sceneStartSec: number,
  currentTimeSec: number,
  width: number,
  height: number,
  config: CaptionConfig
): void {
  if (!config.enabled || !scene.captionText.trim()) return;
  const timings = buildSceneWordTimings(scene, sceneStartSec);
  if (timings.length === 0) return;

  const firstStart = timings[0].startSec;
  const lastEnd = timings[timings.length - 1].endSec;
  if (currentTimeSec < firstStart - 0.08 || currentTimeSec > lastEnd + 0.14) return;

  const aspectRatio: AspectRatio = height > width ? '9:16' : width === height ? '1:1' : '16:9';
  const maxCharsPerLine = getMaxCharsPerLine(aspectRatio);
  const scaleFactor = width / 540;
  const fontSize = Math.max(14, Math.round(config.fontSize * scaleFactor * 0.68));
  const safePx = Math.round(width * config.safeAreaMargin);
  const maxWidth = width - safePx * 2;

  ctx.save();
  ctx.font =
    config.preset === 'retro_arcade'
      ? `700 ${fontSize}px "JetBrains Mono", monospace`
      : config.preset === 'noir_minimal'
      ? `500 ${fontSize}px "DM Sans", sans-serif`
      : `600 ${fontSize}px "Plus Jakarta Sans", sans-serif`;
  ctx.textBaseline = 'middle';

  // Smooth fade-in / fade-out envelope
  const enterAlpha = Math.min(1, Math.max(0, (currentTimeSec - firstStart) / 0.24));
  const exitAlpha = Math.min(1, Math.max(0, (lastEnd - currentTimeSec) / 0.24));
  const alpha = Math.min(enterAlpha, exitAlpha);
  const slideOffset =
    config.enterAnimation === 'slide_up' ? (1 - enterAlpha) * 10 * scaleFactor : 0;

  ctx.globalAlpha = Math.max(0, Math.min(1, alpha));

  // Balanced line wrapping respecting both character budget and pixel safe-area width
  const spaceW = ctx.measureText(' ').width;
  const charLines = wrapBalancedLines(timings, maxCharsPerLine);
  const lines: WordTiming[][] = [];
  for (const candidateLine of charLines) {
    let cur: WordTiming[] = [];
    let lw = 0;
    for (const wt of candidateLine) {
      const w = ctx.measureText(wt.word).width;
      if (cur.length > 0 && lw + spaceW + w > maxWidth) {
        lines.push(cur);
        cur = [wt];
        lw = w;
      } else {
        lw += (cur.length > 0 ? spaceW : 0) + w;
        cur.push(wt);
      }
    }
    if (cur.length > 0) lines.push(cur);
  }

  const lineHeight = fontSize * 1.36;
  const totalHeight = lines.length * lineHeight;
  const baseY = height * config.positionY - totalHeight / 2 + slideOffset;

  // Clean restrained translucent scrim for legibility across bright/dark backgrounds
  const padX = 16 * scaleFactor;
  const padY = 9 * scaleFactor;
  const maxLineW = Math.max(
    ...lines.map((line) =>
      line.reduce((acc, wt, idx) => acc + ctx.measureText(wt.word).width + (idx > 0 ? spaceW : 0), 0)
    )
  );
  ctx.fillStyle =
    config.preset === 'retro_arcade'
      ? 'rgba(8, 12, 22, 0.84)'
      : config.preset === 'noir_minimal'
      ? 'rgba(5, 8, 15, 0.52)'
      : 'rgba(7, 10, 18, 0.66)';
  const boxX = (width - maxLineW) / 2 - padX;
  const boxY = baseY - lineHeight / 2 - padY;
  ctx.beginPath();
  ctx.roundRect(boxX, boxY, maxLineW + padX * 2, totalHeight + padY * 2, 7 * scaleFactor);
  ctx.fill();

  const isKaraokePreset = config.preset === 'bold_karaoke';

  lines.forEach((line, lineIdx) => {
    const totalW = line.reduce(
      (acc, wt, idx) => acc + ctx.measureText(wt.word).width + (idx > 0 ? spaceW : 0),
      0
    );
    let drawX = (width - totalW) / 2;
    const drawY = baseY + lineIdx * lineHeight;

    line.forEach((wt) => {
      const w = ctx.measureText(wt.word).width;
      const isReached = currentTimeSec >= wt.startSec;
      const isActiveWord = currentTimeSec >= wt.startSec && currentTimeSec <= wt.endSec;

      // Intentional emphasis ONLY on curated content words (or progressive karaoke when explicitly chosen)
      const shouldHighlight = isKaraokePreset
        ? isActiveWord && wt.isEmphasis
        : wt.isEmphasis && isReached;

      ctx.save();
      ctx.lineJoin = 'round';
      ctx.lineWidth = Math.max(1, config.outlineWidth * scaleFactor * 0.65);
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.9)';
      ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
      ctx.shadowBlur = config.shadowBlur * scaleFactor * 0.5;
      ctx.strokeText(wt.word, drawX, drawY);

      if (shouldHighlight) {
        ctx.fillStyle = config.highlightColor;
      } else if (isKaraokePreset && !isReached) {
        ctx.fillStyle = 'rgba(226, 232, 240, 0.72)';
      } else {
        ctx.fillStyle = config.textColor;
      }
      ctx.fillText(wt.word, drawX, drawY);
      ctx.restore();

      drawX += w + spaceW;
    });
  });

  ctx.restore();
}
