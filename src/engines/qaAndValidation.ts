import type {
  CharacterDefinition,
  ContactSheetFrame,
  ProjectPlan,
  QACheckItem,
  QAReport,
  ScenarioDefinition,
  ValidationIssue,
} from '../types/studio';
import { resolveDimensions } from '../data/presets';
import { validateCharacterVisualSheets, validateScriptFidelity } from '../contracts/projectContract';
import { computeBiomechanicalPose, validatePoseAnatomicalBounds } from './characterRenderer';
import { validateCaptionsCoherence } from './captionsEngine';
import { renderProjectFrame } from './sceneRenderer';

/**
 * Validates spatial & temporal continuity across consecutive scenes.
 */
export function validateContinuity(project: ProjectPlan): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const scenes = project.scenes ?? [];
  let sumDur = 0;

  for (let i = 0; i < scenes.length; i++) {
    const sc = scenes[i];
    const safeDur = Number.isFinite(sc.duration) && sc.duration > 0 ? sc.duration : 0;
    sumDur += safeDur;

    if (i > 0) {
      const prev = scenes[i - 1];

      // 1. Abrupt scenario cut without smooth transition
      if (prev.scenarioId !== sc.scenarioId && sc.transitionIn === 'cut') {
        issues.push({
          severity: 'warning',
          code: 'ABRUPT_SCENARIO_CUT',
          sceneIndex: i,
          message: `Cena ${i + 1} muda de cenário com corte seco abrupto ("cut"); recomenda-se crossfade ou fade_black.`,
        });
      }

      // 2. Sudden lighting jump inside the exact same scenario
      if (
        prev.scenarioId === sc.scenarioId &&
        Math.abs(prev.lighting.ambientIntensity - sc.lighting.ambientIntensity) > 0.42
      ) {
        issues.push({
          severity: 'warning',
          code: 'LIGHTING_DISCONTINUITY',
          sceneIndex: i,
          message: `Cena ${i + 1} apresenta salto brusco de iluminação ambiente no mesmo cenário.`,
        });
      }

      // 3. Spatial teleportation of same actor in same scenario
      if (prev.scenarioId === sc.scenarioId) {
        for (const actor of sc.actors) {
          const prevActor = prev.actors.find((a) => a.characterId === actor.characterId);
          if (prevActor && Math.abs(prevActor.targetX - actor.x) > 0.55) {
            issues.push({
              severity: 'warning',
              code: 'SPATIAL_TELEPORT',
              sceneIndex: i,
              message: `Cena ${i + 1}: personagem salta abruptamente de X=${prevActor.targetX.toFixed(2)} para X=${actor.x.toFixed(2)} no mesmo cenário.`,
            });
          }
        }
      }
    }
  }

  if (Math.abs(sumDur - project.totalDuration) > 0.5) {
    issues.push({
      severity: 'info',
      code: 'DURATION_SYNC',
      message: `Soma das cenas (${sumDur.toFixed(1)}s) difere do total nominal (${project.totalDuration.toFixed(1)}s).`,
    });
  }

  return issues;
}

/**
 * Mirrors original_skill/scripts/validate_plan.py with full script fidelity,
 * visual sheet lock, continuity, sprite alignment, and anti-excessive-FX validation.
 */
export function validateProjectPlan(
  project: ProjectPlan,
  allCharacters: CharacterDefinition[],
  allScenarios: ScenarioDefinition[]
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (!project.title.trim()) {
    issues.push({ severity: 'error', code: 'EMPTY_TITLE', message: 'O projeto não possui título definido.' });
  }

  if (project.scenes.length === 0) {
    issues.push({ severity: 'error', code: 'NO_SCENES', message: 'O plano precisa conter pelo menos uma cena.' });
    return issues;
  }

  const charMap = new Map<string, CharacterDefinition>();
  for (const c of [...allCharacters, ...project.characterBible]) {
    charMap.set(c.id, c);
  }
  const scenMap = new Map<string, ScenarioDefinition>();
  for (const s of [...allScenarios, ...project.scenarios]) {
    scenMap.set(s.id, s);
  }
  const scenIds = new Set(scenMap.keys());

  // 4-stage script fidelity + visual sheet consistency + continuity + captions coherence
  issues.push(...validateScriptFidelity(project).issues);
  issues.push(...validateCharacterVisualSheets(project));
  issues.push(...validateContinuity(project));
  issues.push(...validateCaptionsCoherence(project));

  // Project-wide framing diversity check (prevents nearly identical framing across all scenes)
  if (project.scenes.length >= 4) {
    const uniqueFramings = new Set(project.scenes.map((s) => s.framing));
    if (uniqueFramings.size < 2) {
      issues.push({
        severity: 'warning',
        code: 'FLAT_FRAMING_VARIETY',
        message: `Todas as ${project.scenes.length} cenas usam o mesmo tipo de enquadramento (${Array.from(uniqueFramings)[0]}); falta variação cinematográfica.`,
      });
    }
  }

  for (let i = 0; i < project.scenes.length; i++) {
    const sc = project.scenes[i];
    const scenario = scenMap.get(sc.scenarioId);

    if (!Number.isFinite(sc.duration) || sc.duration <= 0) {
      issues.push({
        severity: 'error',
        code: 'INVALID_SCENE_DURATION',
        sceneIndex: i,
        message: `Cena ${i + 1} (${sc.title}) possui duração inválida (${String(sc.duration)}).`,
      });
    } else if (sc.duration < 1.2) {
      issues.push({
        severity: 'warning',
        code: 'SHORT_SCENE',
        sceneIndex: i,
        message: `Cena ${i + 1} (${sc.title}) tem duração muito curta (${sc.duration.toFixed(1)}s).`,
      });
    }

    if (sc.actors.length === 0 && !(sc.sceneVisualMode === 'infographic_focus' && sc.infographic)) {
      issues.push({
        severity: 'warning',
        code: 'EMPTY_SCENE',
        sceneIndex: i,
        message: `Cena ${i + 1} (${sc.title}) não possui personagens posicionados.`,
      });
    }

    if (!scenIds.has(sc.scenarioId)) {
      issues.push({
        severity: 'error',
        code: 'MISSING_SCENARIO',
        sceneIndex: i,
        message: `Cena ${i + 1} referencia cenário inexistente (${sc.scenarioId}).`,
      });
    }

    // Prolonged static camera detection
    if (sc.cameraMove === 'static' && sc.duration >= 3.5 && !sc.secondaryCameraMove) {
      issues.push({
        severity: 'warning',
        code: 'PROLONGED_STATIC_CAMERA',
        sceneIndex: i,
        message: `Cena ${i + 1} mantém câmera estática por ${sc.duration.toFixed(1)}s sem evolução de enquadramento.`,
      });
    }

    // Excessive FX / artificial glitch / volumetric overwash detection
    if (sc.effects.glitch > 0.08 || sc.transitionIn === 'glitch_cut') {
      issues.push({
        severity: 'warning',
        code: 'EXCESSIVE_GLITCH',
        sceneIndex: i,
        message: `Cena ${i + 1} possui efeito glitch ativo que pode gerar artefatos/faixas visuais.`,
      });
    }
    if (sc.effects.scanlines > 0.08) {
      issues.push({
        severity: 'warning',
        code: 'EXCESSIVE_SCANLINES',
        sceneIndex: i,
        message: `Cena ${i + 1} possui scanlines excessivas (${Math.round(sc.effects.scanlines * 100)}%).`,
      });
    }
    if (sc.effects.fog + sc.effects.smoke > 0.65 || sc.lighting.bloomIntensity > 0.45) {
      issues.push({
        severity: 'warning',
        code: 'EXCESSIVE_VOLUMETRIC_FX',
        sceneIndex: i,
        message: `Cena ${i + 1} possui névoa/fumaça/bloom excessivos que ocultam detalhes da imagem.`,
      });
    }
    if (sc.lighting.pointLightFlicker > 0.35) {
      issues.push({
        severity: 'warning',
        code: 'EXCESSIVE_FLICKER',
        sceneIndex: i,
        message: `Cena ${i + 1} tem oscilação de luz elevada (risco de flickering).`,
      });
    }

    // Unmotivated camera check
    if (!sc.cameraMotivation || !sc.cameraMotivation.trim()) {
      issues.push({
        severity: 'warning',
        code: 'UNMOTIVATED_CAMERA',
        sceneIndex: i,
        message: `Cena ${i + 1} (${sc.title}) não documenta motivação narrativa para o movimento de câmera (${sc.cameraMove}).`,
      });
    }

    // 1. Unintended duplicate character instances in the same scene
    const seenCharIds = new Set<string>();
    for (const actor of sc.actors) {
      if (seenCharIds.has(actor.characterId)) {
        issues.push({
          severity: 'error',
          code: 'DUPLICATE_ACTOR_ID',
          sceneIndex: i,
          message: `Cena ${i + 1} (${sc.title}): personagem duplicado na mesma cena (${actor.characterId}).`,
        });
      }
      seenCharIds.add(actor.characterId);

      // 2. Solid prop collision / pass-through detection (midground solid obstacles like pillars/crates)
      if (scenario && !actor.isShadowEntity) {
        const minX = Math.min(actor.x, actor.targetX);
        const maxX = Math.max(actor.x, actor.targetX);
        const solidProps = scenario.props.filter(
          (p) => p.depth === 'midground' && (p.kind === 'pillar' || p.kind === 'crate')
        );
        for (const prop of solidProps) {
          const passesThrough = minX < prop.x - 0.04 && maxX > prop.x + 0.04 && Math.abs(actor.y - prop.y) < 0.12;
          if (passesThrough) {
            issues.push({
              severity: 'warning',
              code: 'PROP_COLLISION_PASSTHROUGH',
              sceneIndex: i,
              message: `Cena ${i + 1}: trajetória do personagem cruza objeto sólido "${prop.label}" em X=${prop.x.toFixed(2)}.`,
            });
          }
        }
      }

      // 3. Anatomical joint pose bounds validation (prevents impossible poses)
      const poseCheck = validatePoseAnatomicalBounds(
        computeBiomechanicalPose(actor.state, 0.4, false, { lookDirection: actor.lookDirection })
      );
      if (!poseCheck.valid) {
        issues.push({
          severity: 'error',
          code: 'IMPOSSIBLE_POSE',
          sceneIndex: i,
          message: `Cena ${i + 1}: pose anatomicamente inválida para "${actor.characterId}" — ${poseCheck.reason}.`,
        });
      }

      const charDef = charMap.get(actor.characterId);
      if (!charDef) {
        issues.push({
          severity: 'error',
          code: 'MISSING_CHARACTER',
          sceneIndex: i,
          message: `Cena ${i + 1} referencia personagem inexistente (${actor.characterId}).`,
        });
      } else if (charDef.kind === 'spritesheet' && charDef.spritesheet) {
        const sp = charDef.spritesheet;
        if (!sp.validated || sp.frameWidth <= 0 || sp.frameHeight <= 0 || sp.pivotX < 0 || sp.pivotX > 1 || sp.pivotY < 0 || sp.pivotY > 1) {
          issues.push({
            severity: 'error',
            code: 'SPRITE_MISALIGNED',
            sceneIndex: i,
            message: `Cena ${i + 1}: spritesheet de "${charDef.name}" com pivô ou grade desalinhada.`,
          });
        }
        if (!sp.hasTransparency) {
          issues.push({
            severity: 'warning',
            code: 'SPRITE_NO_TRANSPARENCY',
            sceneIndex: i,
            message: `Cena ${i + 1}: spritesheet de "${charDef.name}" sem canal alpha transparente (risco de caixa opaca).`,
          });
        }
      }

      if (actor.x < -0.15 || actor.x > 1.15 || actor.targetX < -0.15 || actor.targetX > 1.15) {
        issues.push({
          severity: 'warning',
          code: 'OFFSCREEN_ACTOR',
          sceneIndex: i,
          message: `Cena ${i + 1}: personagem pode ficar fora da área visível da tela.`,
        });
      }

      if (actor.scale < 0.55 || actor.scale > 1.85) {
        issues.push({
          severity: 'warning',
          code: 'PROPORTION_OUT_OF_RANGE',
          sceneIndex: i,
          message: `Cena ${i + 1}: escala desproporcional do personagem (${actor.scale.toFixed(2)}x).`,
        });
      }

      // Check frozen actor (idle only with zero travel and no actionPhases over long scene)
      const travel = Math.hypot(actor.targetX - actor.x, actor.targetY - actor.y);
      const hasMultiPhases = (actor.actionPhases?.length ?? 0) >= 2;
      if (
        actor.state === 'idle' &&
        (!actor.nextState || actor.nextState === 'idle') &&
        !hasMultiPhases &&
        travel < 0.01 &&
        sc.duration >= 4.0 &&
        !actor.isShadowEntity
      ) {
        issues.push({
          severity: 'warning',
          code: 'FROZEN_CHARACTER',
          sceneIndex: i,
          message: `Cena ${i + 1}: personagem permanece parado em pose única durante ${sc.duration.toFixed(1)}s.`,
        });
      }
    }

    // 4. Repetitive motion loop detection across 3+ consecutive scenes
    if (i >= 2) {
      const a0 = project.scenes[i - 2].actors[0];
      const a1 = project.scenes[i - 1].actors[0];
      const a2 = sc.actors[0];
      if (
        a0 &&
        a1 &&
        a2 &&
        a0.state === a1.state &&
        a1.state === a2.state &&
        (a0.nextState ?? a0.state) === (a1.nextState ?? a1.state) &&
        (a1.nextState ?? a1.state) === (a2.nextState ?? a2.state) &&
        (a2.actionPhases?.length ?? 0) < 2
      ) {
        issues.push({
          severity: 'warning',
          code: 'REPETITIVE_MOTION',
          sceneIndex: i,
          message: `Cenas ${i - 1}–${i + 1} repetem exatamente o mesmo ciclo de movimento (${a2.state}) sem variação de atuação.`,
        });
      }
    }

    if (i > 0) {
      const prev = project.scenes[i - 1];
      if (prev.cameraMove === sc.cameraMove && prev.framing === sc.framing) {
        issues.push({
          severity: 'warning',
          code: 'REPETITIVE_CAMERA',
          sceneIndex: i,
          message: `Cena ${i + 1} repete enquadramento e movimento de câmera da cena anterior.`,
        });
      }
    }
  }

  if (project.audio.musicStyle === 'none' && project.scenes.every((s) => s.sfxEvents.length === 0)) {
    issues.push({
      severity: 'warning',
      code: 'SILENT_PROJECT',
      message: 'Nenhuma trilha sonora ou efeito sonoro configurado no projeto.',
    });
  }

  // Retro Pixel Educational integrity validations (strictly isolated to retro_pixel_educational)
  if (project.visualStyle === 'retro_pixel_educational') {
    const px = project.pixelConfig;
    if (
      !px ||
      px.scalingMode !== 'nearest' ||
      px.logicalWidth < 96 ||
      px.logicalHeight < 96 ||
      px.logicalWidth > 480 ||
      px.logicalHeight > 480
    ) {
      issues.push({
        severity: 'error',
        code: 'PIXEL_GRID_INVALID',
        message: 'Perfil RETRO PIXEL EDUCATIONAL exige grade nativa 16-bit válida (ex.: 180×320) com escalonamento nearest-neighbor sem borrão.',
      });
    }

    const infographicCount = project.scenes.filter((s) => Boolean(s.infographic && s.infographic.kind !== 'none')).length;
    if (project.scenes.length >= 2 && infographicCount === 0) {
      issues.push({
        severity: 'warning',
        code: 'EDUCATIONAL_INFOGRAPHIC_MISSING',
        message: 'Nenhuma cena educativa possui infográfico animado para ilustrar os conceitos explicados.',
      });
    }

    const edu = project.educationalContext;
    if (
      !edu ||
      !Array.isArray(edu.verifiedFacts) ||
      edu.verifiedFacts.length === 0 ||
      (edu.factSource !== 'verified_offline_db' && edu.factSource !== 'user_supplied' && edu.factSource !== 'hybrid')
    ) {
      issues.push({
        severity: 'error',
        code: 'EDUCATIONAL_UNVERIFIED_CLAIM',
        message: 'Conteúdo educativo sem origem factual verificada (base científica offline ou fatos fornecidos pelo usuário).',
      });
    }

    for (let i = 0; i < project.scenes.length; i++) {
      const cap = project.scenes[i].captionText.trim();
      if (cap.length > 78) {
        issues.push({
          severity: 'warning',
          code: 'PIXEL_CAPTION_OVERFLOW',
          sceneIndex: i,
          message: `Cena ${i + 1}: legenda pixel (${cap.length} caracteres) excede o limite de legibilidade retrô (78 caracteres).`,
        });
      }
    }
  }

  return issues;
}

function measureCanvasStats(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const data = ctx.getImageData(0, 0, w, h).data;
  let lumSum = 0;
  let samples = 0;
  const signature: number[] = [];

  for (let i = 0; i < data.length; i += 64) {
    const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    lumSum += lum;
    samples++;
    if (signature.length < 120) signature.push(lum);
  }

  // Horizontal band / glitch row artifact detector:
  // Scans rows for sharp artificial chroma-shifted horizontal stripes spanning the full frame width
  let suspiciousBandRows = 0;
  for (let y = 2; y < h - 2; y += 3) {
    let rowSharpChroma = 0;
    const sampleStep = Math.max(1, Math.floor(w / 24));
    let colsChecked = 0;
    for (let x = 0; x < w; x += sampleStep) {
      const idx = (y * w + x) * 4;
      const upIdx = ((y - 2) * w + x) * 4;
      const dr = Math.abs(data[idx] - data[upIdx]);
      const db = Math.abs(data[idx + 2] - data[upIdx + 2]);
      const dg = Math.abs(data[idx + 1] - data[upIdx + 1]);
      // Cyan/red glitch bars have huge R/B jump relative to G across the entire horizontal row
      if (Math.abs(dr - dg) > 38 || Math.abs(db - dg) > 38) {
        rowSharpChroma++;
      }
      colsChecked++;
    }
    if (colsChecked > 0 && rowSharpChroma / colsChecked > 0.75) {
      suspiciousBandRows++;
    }
  }

  return {
    avgLum: samples > 0 ? lumSum / samples : 0,
    signature,
    hasHorizontalBandArtifact: suspiciousBandRows >= 3,
  };
}

function signatureDiff(a: number[], b: number[]): number {
  const len = Math.min(a.length, b.length);
  if (len === 0) return 100;
  let diff = 0;
  for (let i = 0; i < len; i++) {
    diff += Math.abs(a[i] - b[i]);
  }
  return diff / len;
}

/**
 * Complete Pre-Export Quality Assurance Engine (10 mandatory verification categories):
 * 1. Script-to-scene fidelity
 * 2. Character visual sheet consistency (appearance drift)
 * 3. Frozen characters / continuous animation
 * 4. Duplicate consecutive frames
 * 5. Flickering detection (3-frame luminance delta + flicker params)
 * 6. Excessive FX / horizontal band & glitch artifact scan
 * 7. Sprite alignment & pivot validation
 * 8. Transparency / alpha integrity
 * 9. Spatial/temporal continuity & abrupt scenario cuts
 * 10. Proportions, framing & resolution/audio metrics
 */
export function runQualityAssurance(
  project: ProjectPlan,
  allCharacters: CharacterDefinition[],
  allScenarios: ScenarioDefinition[]
): QAReport {
  const issues = validateProjectPlan(project, allCharacters, allScenarios);
  const scriptFidelity = validateScriptFidelity(project);
  const continuityIssues = validateContinuity(project);
  const exportDims = resolveDimensions(project.format.aspectRatio, project.format.exportResolution);

  let blackFrameCount = 0;
  let frozenFrameCount = 0;
  let duplicateFrameCount = 0;
  let flickerCount = 0;
  let horizontalBandCount = 0;
  const contactSheet: ContactSheetFrame[] = [];

  // Real pixel-level sampling whenever running in a DOM/Canvas environment
  if (typeof document !== 'undefined') {
    const thumbW = project.format.aspectRatio === '9:16' ? 180 : project.format.aspectRatio === '1:1' ? 220 : 280;
    const thumbH = project.format.aspectRatio === '9:16' ? 320 : project.format.aspectRatio === '1:1' ? 220 : 158;
    const canvas = document.createElement('canvas');
    canvas.width = thumbW;
    canvas.height = thumbH;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    if (ctx) {
      const frameStep = 1 / Math.max(12, project.format.fps);
      let cursor = 0;
      for (let i = 0; i < project.scenes.length; i++) {
        const sc = project.scenes[i];
        const tMid = cursor + sc.duration * 0.5;
        const tNextFrame = Math.min(cursor + sc.duration - 0.02, tMid + frameStep);
        const tNextFrame2 = Math.min(cursor + sc.duration - 0.01, tMid + frameStep * 2);
        const tLate = cursor + Math.min(sc.duration - 0.12, sc.duration * 0.82);

        renderProjectFrame(ctx, project, tMid, thumbW, thumbH, allCharacters, allScenarios);
        const s1 = measureCanvasStats(ctx, thumbW, thumbH);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.82);

        contactSheet.push({
          timeSec: Number(tMid.toFixed(1)),
          sceneIndex: i,
          sceneTitle: sc.title,
          dataUrl,
        });

        if (s1.avgLum < 5.5) blackFrameCount++;
        if (s1.hasHorizontalBandArtifact && project.visualStyle !== 'retro_pixel_educational') {
          horizontalBandCount++;
        }

        renderProjectFrame(ctx, project, tNextFrame, thumbW, thumbH, allCharacters, allScenarios);
        const s2 = measureCanvasStats(ctx, thumbW, thumbH);
        if (signatureDiff(s1.signature, s2.signature) < 0.04) {
          duplicateFrameCount++;
        }

        renderProjectFrame(ctx, project, tNextFrame2, thumbW, thumbH, allCharacters, allScenarios);
        const s3 = measureCanvasStats(ctx, thumbW, thumbH);
        const lumDelta1 = s2.avgLum - s1.avgLum;
        const lumDelta2 = s3.avgLum - s2.avgLum;
        if (lumDelta1 * lumDelta2 < 0 && Math.abs(lumDelta1) > 10 && Math.abs(lumDelta2) > 10) {
          flickerCount++;
        }

        renderProjectFrame(ctx, project, tLate, thumbW, thumbH, allCharacters, allScenarios);
        const sLate = measureCanvasStats(ctx, thumbW, thumbH);
        if (signatureDiff(s1.signature, sLate.signature) < 0.3) {
          frozenFrameCount++;
        }

        cursor += sc.duration;
      }
    }
  }

  const totalSfx = project.scenes.reduce((acc, s) => acc + s.sfxEvents.length, 0);
  const estimatedPeakDb = project.audio.normalize
    ? -1.2
    : Number((-12 + Math.max(project.audio.musicVolume, project.audio.sfxVolume) * 11).toFixed(1));

  const countByCodes = (codes: string[]) => issues.filter((x) => codes.includes(x.code)).length;

  const appearanceDriftCount = countByCodes(['APPEARANCE_DRIFT', 'MISSING_VISUAL_SHEET', 'DUPLICATE_ACTOR_ID', 'IMPOSSIBLE_POSE']);
  const spriteAlignCount = countByCodes(['SPRITE_MISALIGNED', 'PROP_COLLISION_PASSTHROUGH']);
  const transparencyCount = countByCodes(['SPRITE_NO_TRANSPARENCY']);
  const frozenActorCount = countByCodes(['FROZEN_CHARACTER', 'REPETITIVE_MOTION']) + frozenFrameCount;
  const excessiveFxCount = countByCodes(['EXCESSIVE_GLITCH', 'EXCESSIVE_SCANLINES', 'EXCESSIVE_VOLUMETRIC_FX']) + horizontalBandCount;
  const flickerIssues = countByCodes(['EXCESSIVE_FLICKER']) + flickerCount;
  const framingIssues = countByCodes([
    'OFFSCREEN_ACTOR',
    'PROPORTION_OUT_OF_RANGE',
    'PROLONGED_STATIC_CAMERA',
    'EMPTY_SCENE',
    'UNMOTIVATED_CAMERA',
    'FLAT_FRAMING_VARIETY',
  ]);
  const abruptCutIssues = countByCodes(['ABRUPT_SCENARIO_CUT', 'SPATIAL_TELEPORT', 'LIGHTING_DISCONTINUITY']);
  const captionIssues = countByCodes(['CAPTION_STAGE_DIRECTION_LEAK', 'CAPTION_TOO_LONG', 'CAPTION_VISUAL_MISMATCH']);

  const checks: QACheckItem[] = [
    {
      id: 'script_fidelity',
      label: 'Fidelidade 4 etapas (prompt ↔ roteiro ↔ storyboard ↔ cenas)',
      status: scriptFidelity.score >= 85 && scriptFidelity.issues.every((i) => i.severity !== 'error') ? 'pass' : scriptFidelity.score >= 60 ? 'warn' : 'fail',
      detail: `Aderência ${scriptFidelity.score}% (${project.script.length} entradas ↔ ${project.scenes.length} cenas com cadeia causal)`,
    },
    {
      id: 'character_consistency',
      label: 'Ficha visual, poses anatômicas e anti-duplicação',
      status: appearanceDriftCount === 0 ? 'pass' : 'fail',
      detail:
        appearanceDriftCount === 0
          ? `${project.characterBible.length} personagem(ns) íntegros, sem duplicação ou poses impossíveis`
          : `${appearanceDriftCount} falha(s) de aparência, pose ou duplicação detectada(s)`,
    },
    {
      id: 'frozen_characters',
      label: 'Movimentação contínua (anti-repetição e congelamento)',
      status: frozenActorCount === 0 ? 'pass' : 'warn',
      detail:
        frozenActorCount === 0
          ? 'Ciclos ativos e atuação variada sem repetição mecânica'
          : `${frozenActorCount} alerta(s) de congelamento ou ciclo repetitivo`,
    },
    {
      id: 'duplicate_frames',
      label: 'Quadros duplicados e quadros pretos',
      status: blackFrameCount > 0 ? 'fail' : duplicateFrameCount === 0 ? 'pass' : 'warn',
      detail: `${blackFrameCount} quadro(s) preto(s) · ${duplicateFrameCount} par(es) duplicado(s) consecutivos`,
    },
    {
      id: 'flickering',
      label: 'Estabilidade luminosa (anti-flickering)',
      status: flickerIssues === 0 ? 'pass' : 'warn',
      detail: flickerIssues === 0 ? 'Sem oscilações bruscas de brilho entre quadros' : `${flickerIssues} alerta(s) de flickering detectado(s)`,
    },
    {
      id: 'excessive_fx',
      label: 'Efeitos visuais limpos e anti-faixas/glitch',
      status: horizontalBandCount > 0 ? 'fail' : excessiveFxCount === 0 ? 'pass' : 'warn',
      detail:
        excessiveFxCount === 0
          ? 'Zero faixas horizontais, glitch artificial ou excesso volumétrico'
          : `${excessiveFxCount} alerta(s) de FX excessivo ou faixas horizontais`,
    },
    {
      id: 'sprite_alignment',
      label: 'Sprites, transparência e colisão de cenário',
      status: spriteAlignCount > 0 ? 'fail' : transparencyCount > 0 ? 'warn' : 'pass',
      detail:
        spriteAlignCount === 0 && transparencyCount === 0
          ? 'Pivôs, transparência e trajetórias livres de colisão validados'
          : `${spriteAlignCount} desalinhamento(s)/colisão · ${transparencyCount} alerta(s) de transparência`,
    },
    {
      id: 'continuity',
      label: 'Continuidade espacial, causal e transições suaves',
      status: abruptCutIssues === 0 ? 'pass' : 'warn',
      detail:
        abruptCutIssues === 0
          ? 'Transições suaves, ledger persistente e continuidade espacial íntegra'
          : `${abruptCutIssues} quebra(s) de continuidade ou corte brusco`,
    },
    {
      id: 'framing_proportions',
      label: 'Direção de câmera motivada e variedade de planos',
      status: framingIssues === 0 ? 'pass' : 'warn',
      detail: `${exportDims.width}×${exportDims.height} (${project.format.fps} FPS) · ${framingIssues} alerta(s) de câmera/enquadramento`,
    },
    {
      id: 'audio',
      label: 'Áudio, mixagem e coerência de legendas PT-BR',
      status: captionIssues > 0 ? 'warn' : project.audio.musicStyle !== 'none' || totalSfx > 0 ? 'pass' : 'warn',
      detail: `Pico ${estimatedPeakDb} dB · ${totalSfx} SFX · ${
        project.captions.enabled
          ? captionIssues === 0
            ? 'Legendas sincronizadas e coerentes'
            : `${captionIssues} alerta(s) nas legendas`
          : 'Sem legendas (modo visual/sonoro)'
      }`,
    },
  ];

  if (project.visualStyle === 'retro_pixel_educational') {
    const pixelErrors = countByCodes(['PIXEL_GRID_INVALID', 'EDUCATIONAL_UNVERIFIED_CLAIM']);
    const pixelWarns = countByCodes(['EDUCATIONAL_INFOGRAPHIC_MISSING', 'PIXEL_CAPTION_OVERFLOW']);
    const px = project.pixelConfig;
    const infoCount = project.scenes.filter((s) => Boolean(s.infographic)).length;
    checks.push({
      id: 'retro_pixel_educational',
      label: 'Integridade Retro Pixel Art 16-bit e Fatos Verificados',
      status: pixelErrors > 0 ? 'fail' : pixelWarns > 0 ? 'warn' : 'pass',
      detail:
        pixelErrors === 0 && pixelWarns === 0
          ? `Grade ${px?.logicalWidth ?? 180}×${px?.logicalHeight ?? 320} (nearest) · ${infoCount} infográfico(s) · ${project.educationalContext?.verifiedFacts.length ?? 0} fato(s) verificado(s)`
          : `${pixelErrors} erro(s) crítico(s) · ${pixelWarns} alerta(s) educativo(s)/pixel`,
    });
  }

  const hasErrors = issues.some((x) => x.severity === 'error');
  const passed = !hasErrors && blackFrameCount === 0 && horizontalBandCount === 0 && checks.every((c) => c.status !== 'fail');

  return {
    timestamp: new Date().toISOString(),
    passed,
    checks,
    issues,
    contactSheet,
    metrics: {
      durationSec: project.totalDuration,
      width: exportDims.width,
      height: exportDims.height,
      fps: project.format.fps,
      sceneCount: project.scenes.length,
      blackFrameCount,
      frozenFrameCount,
      duplicateFrameCount,
      flickerCount,
      horizontalBandCount,
      scriptFidelityScore: scriptFidelity.score,
      continuityIssuesCount: continuityIssues.length,
      estimatedPeakDb,
    },
  };
}
