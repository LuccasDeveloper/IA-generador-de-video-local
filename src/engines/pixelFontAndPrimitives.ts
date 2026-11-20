/**
 * Native 16-bit Pixel Art Primitives, Ordered Bayer 4x4 Dithering & Crisp 5x7 Bitmap Pixel Font
 * Operates directly on an integer pixel canvas (e.g., 180x320) so nearest-neighbor scaling
 * to 1080x1920 produces authentic, razor-sharp retro arcade pixel art with zero blur.
 */

export const BAYER_4X4: number[][] = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];

export function bayerThreshold(x: number, y: number): number {
  const xi = ((Math.floor(x) % 4) + 4) % 4;
  const yi = ((Math.floor(y) % 4) + 4) % 4;
  return (BAYER_4X4[yi][xi] + 0.5) / 16;
}

export function px(n: number): number {
  return Math.round(n);
}

export function putPixel(ctx: CanvasRenderingContext2D, x: number, y: number, color: string): void {
  ctx.fillStyle = color;
  ctx.fillRect(Math.floor(x), Math.floor(y), 1, 1);
}

export function fillPixelRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string
): void {
  const rx = Math.floor(x);
  const ry = Math.floor(y);
  const rw = Math.max(0, Math.round(w));
  const rh = Math.max(0, Math.round(h));
  if (rw <= 0 || rh <= 0) return;
  ctx.fillStyle = color;
  ctx.fillRect(rx, ry, rw, rh);
}

/**
 * Draws a vertical gradient using authentic Bayer 4x4 ordered dithering between top & bottom colors.
 */
export function fillDitheredVerticalGradient(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  stops: string[]
): void {
  if (stops.length === 0 || w <= 0 || h <= 0) return;
  if (stops.length === 1) {
    fillPixelRect(ctx, x, y, w, h, stops[0]);
    return;
  }
  const rx = Math.floor(x);
  const ry = Math.floor(y);
  const rw = Math.round(w);
  const rh = Math.round(h);
  const segs = stops.length - 1;

  for (let py = 0; py < rh; py++) {
    const t = rh > 1 ? py / (rh - 1) : 0;
    const scaled = t * segs;
    const idx = Math.min(segs - 1, Math.floor(scaled));
    const localT = scaled - idx;
    const cA = stops[idx];
    const cB = stops[idx + 1];

    // Fast path when outside dithering band
    if (localT < 0.06) {
      ctx.fillStyle = cA;
      ctx.fillRect(rx, ry + py, rw, 1);
    } else if (localT > 0.94) {
      ctx.fillStyle = cB;
      ctx.fillRect(rx, ry + py, rw, 1);
    } else {
      ctx.fillStyle = cA;
      ctx.fillRect(rx, ry + py, rw, 1);
      ctx.fillStyle = cB;
      for (let ix = 0; ix < rw; ix++) {
        if (localT > bayerThreshold(rx + ix, ry + py)) {
          ctx.fillRect(rx + ix, ry + py, 1, 1);
        }
      }
    }
  }
}

/**
 * Draws a crisp dithered neon glow halo (characteristic of 16-bit SNES/arcade lighting).
 */
export function drawDitheredHalo(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  color: string,
  intensity = 0.75
): void {
  const r = Math.max(2, Math.round(radius));
  const x0 = Math.round(cx);
  const y0 = Math.round(cy);
  ctx.fillStyle = color;
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > r) continue;
      const falloff = Math.pow(1 - dist / r, 1.55) * intensity;
      if (falloff > bayerThreshold(x0 + dx, y0 + dy)) {
        ctx.fillRect(x0 + dx, y0 + dy, 1, 1);
      }
    }
  }
}

/**
 * Draws a 16-bit pixel-art shaded sphere/ellipse with dark outline, base tone,
 * Bayer-dithered directional shadow, highlight, and crisp specular sparkle.
 */
export function drawPixelShadedEllipse(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  colors: {
    base: string;
    light: string;
    shadow: string;
    outline?: string;
    specular?: string;
  },
  ditherStrength = 0.72
): void {
  const irx = Math.max(2, Math.round(rx));
  const iry = Math.max(2, Math.round(ry));
  const icx = Math.round(cx);
  const icy = Math.round(cy);

  for (let dy = -iry - 1; dy <= iry + 1; dy++) {
    for (let dx = -irx - 1; dx <= irx + 1; dx++) {
      const nx = dx / irx;
      const ny = dy / iry;
      const distSq = nx * nx + ny * ny;

      if (distSq > 1.0) {
        // 1px crisp dark pixel outline
        if (colors.outline) {
          const outNx = dx / (irx + 1);
          const outNy = dy / (iry + 1);
          if (outNx * outNx + outNy * outNy <= 1.02) {
            ctx.fillStyle = colors.outline;
            ctx.fillRect(icx + dx, icy + dy, 1, 1);
          }
        }
        continue;
      }

      // Directional lighting from upper-left (-0.42, -0.45)
      const lx = nx + 0.36;
      const ly = ny + 0.38;
      const lightDist = Math.sqrt(lx * lx + ly * ly);
      const bayer = bayerThreshold(icx + dx, icy + dy);

      let fill = colors.base;
      if (lightDist < 0.34 && colors.specular) {
        fill = colors.specular;
      } else if (lightDist < 0.62 + (bayer - 0.5) * 0.25 * ditherStrength) {
        fill = colors.light;
      } else if (ny > 0.28 + (bayer - 0.5) * 0.38 * ditherStrength || nx > 0.45 + (bayer - 0.5) * 0.3 * ditherStrength) {
        fill = colors.shadow;
      }

      ctx.fillStyle = fill;
      ctx.fillRect(icx + dx, icy + dy, 1, 1);
    }
  }
}

export function drawPixelLine(
  ctx: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  color: string,
  thickness = 1
): void {
  let ix0 = Math.round(x0);
  let iy0 = Math.round(y0);
  const ix1 = Math.round(x1);
  const iy1 = Math.round(y1);
  const dx = Math.abs(ix1 - ix0);
  const dy = Math.abs(iy1 - iy0);
  const sx = ix0 < ix1 ? 1 : -1;
  const sy = iy0 < iy1 ? 1 : -1;
  let err = dx - dy;
  const half = Math.floor(thickness / 2);

  ctx.fillStyle = color;
  let guard = 0;
  while (guard++ < 1200) {
    ctx.fillRect(ix0 - half, iy0 - half, thickness, thickness);
    if (ix0 === ix1 && iy0 === iy1) break;
    const e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      ix0 += sx;
    }
    if (e2 < dx) {
      err += dx;
      iy0 += sy;
    }
  }
}

export function drawPixelArrow(
  ctx: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  color: string,
  outlineColor = '#0A071A'
): void {
  drawPixelLine(ctx, x0, y0 + 1, x1, y1 + 1, outlineColor, 2);
  drawPixelLine(ctx, x0, y0, x1, y1, color, 1);
  const angle = Math.atan2(y1 - y0, x1 - x0);
  const headLen = 5;
  const ax1 = x1 - Math.cos(angle - 0.6) * headLen;
  const ay1 = y1 - Math.sin(angle - 0.6) * headLen;
  const ax2 = x1 - Math.cos(angle + 0.6) * headLen;
  const ay2 = y1 - Math.sin(angle + 0.6) * headLen;
  drawPixelLine(ctx, x1, y1, ax1, ay1, color, 1);
  drawPixelLine(ctx, x1, y1, ax2, ay2, color, 1);
}

// ============================================================================
// CRISP 5x7 BITMAP PIXEL FONT (FULL PT-BR SUPPORT, ZERO BLUR)
// ============================================================================
const PIXEL_FONT_5X7: Record<string, string[]> = {
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  B: ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
  C: ['01110', '10001', '10000', '10000', '10000', '10001', '01110'],
  D: ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  F: ['11111', '10000', '10000', '11110', '10000', '10000', '10000'],
  G: ['01110', '10001', '10000', '10111', '10001', '10001', '01111'],
  H: ['10001', '10001', '10001', '11111', '10001', '10001', '10001'],
  I: ['01110', '00100', '00100', '00100', '00100', '00100', '01110'],
  J: ['00111', '00010', '00010', '00010', '10010', '10010', '01100'],
  K: ['10001', '10010', '10100', '11000', '10100', '10010', '10001'],
  L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  M: ['10001', '11011', '10101', '10101', '10001', '10001', '10001'],
  N: ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
  Q: ['01110', '10001', '10001', '10001', '10101', '10010', '01101'],
  R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  U: ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
  V: ['10001', '10001', '10001', '10001', '10001', '01010', '00100'],
  W: ['10001', '10001', '10001', '10101', '10101', '11011', '10001'],
  X: ['10001', '10001', '01010', '00100', '01010', '10001', '10001'],
  Y: ['10001', '10001', '01010', '00100', '00100', '00100', '00100'],
  Z: ['11111', '00001', '00010', '00100', '01000', '10000', '11111'],
  '0': ['01110', '10011', '10101', '10101', '11001', '10001', '01110'],
  '1': ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  '2': ['01110', '10001', '00001', '00110', '01000', '10000', '11111'],
  '3': ['11110', '00001', '00001', '01110', '00001', '00001', '11110'],
  '4': ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  '5': ['11111', '10000', '11110', '00001', '00001', '10001', '01110'],
  '6': ['01110', '10000', '11110', '10001', '10001', '10001', '01110'],
  '7': ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  '8': ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
  '9': ['01110', '10001', '10001', '01111', '00001', '00010', '01100'],
  '!': ['00100', '00100', '00100', '00100', '00100', '00000', '00100'],
  '?': ['01110', '10001', '00001', '00110', '00100', '00000', '00100'],
  '.': ['00000', '00000', '00000', '00000', '00000', '01100', '01100'],
  ',': ['00000', '00000', '00000', '00000', '00100', '00100', '01000'],
  ':': ['00000', '00100', '00100', '00000', '00100', '00100', '00000'],
  '-': ['00000', '00000', '00000', '11111', '00000', '00000', '00000'],
  '—': ['00000', '00000', '00000', '11111', '00000', '00000', '00000'],
  '+': ['00000', '00100', '00100', '11111', '00100', '00100', '00000'],
  '%': ['11001', '11010', '00100', '00100', '01011', '10011', '00000'],
  '/': ['00001', '00010', '00100', '00100', '01000', '10000', '00000'],
  '(': ['00010', '00100', '01000', '01000', '01000', '00100', '00010'],
  ')': ['01000', '00100', '00010', '00010', '00010', '00100', '01000'],
  ' ': ['00000', '00000', '00000', '00000', '00000', '00000', '00000'],
  Á: ['00100', '01010', '10001', '11111', '10001', '10001', '10001'],
  À: ['01000', '00100', '01110', '10001', '11111', '10001', '10001'],
  Â: ['00100', '01010', '01110', '10001', '11111', '10001', '10001'],
  Ã: ['01101', '10010', '01110', '10001', '11111', '10001', '10001'],
  É: ['00010', '00100', '11111', '10000', '11110', '10000', '11111'],
  Ê: ['00100', '01010', '11111', '10000', '11110', '10000', '11111'],
  Í: ['00010', '00100', '01110', '00100', '00100', '00100', '01110'],
  Ó: ['00010', '00100', '01110', '10001', '10001', '10001', '01110'],
  Ô: ['00100', '01010', '01110', '10001', '10001', '10001', '01110'],
  Õ: ['01101', '10010', '01110', '10001', '10001', '10001', '01110'],
  Ú: ['00010', '00100', '10001', '10001', '10001', '10001', '01110'],
  Ç: ['01110', '10001', '10000', '10000', '10001', '01110', '00100'],
};

function resolveGlyph(char: string): string[] {
  const upper = char.toUpperCase();
  if (PIXEL_FONT_5X7[upper]) return PIXEL_FONT_5X7[upper];
  const base = upper.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return PIXEL_FONT_5X7[base] ?? PIXEL_FONT_5X7[' '];
}

export function measurePixelText(text: string, scale = 1): number {
  if (!text) return 0;
  return text.length * 6 * scale - scale;
}

export function drawPixelText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  options?: {
    color?: string;
    outlineColor?: string;
    shadowColor?: string;
    scale?: number;
    align?: 'left' | 'center' | 'right';
  }
): void {
  const scale = Math.max(1, Math.round(options?.scale ?? 1));
  const color = options?.color ?? '#FFFFFF';
  const outlineColor = options?.outlineColor ?? '#0A071A';
  const shadowColor = options?.shadowColor ?? 'rgba(6, 4, 16, 0.88)';
  const align = options?.align ?? 'left';

  const totalW = measurePixelText(text, scale);
  let startX = Math.round(x);
  if (align === 'center') startX = Math.round(x - totalW / 2);
  else if (align === 'right') startX = Math.round(x - totalW);
  const startY = Math.round(y);

  const drawPass = (ox: number, oy: number, fill: string) => {
    ctx.fillStyle = fill;
    let cx = startX + ox;
    for (let i = 0; i < text.length; i++) {
      const glyph = resolveGlyph(text[i]);
      for (let row = 0; row < glyph.length; row++) {
        const line = glyph[row];
        for (let col = 0; col < line.length; col++) {
          if (line[col] === '1') {
            ctx.fillRect(cx + col * scale, startY + oy + row * scale, scale, scale);
          }
        }
      }
      cx += 6 * scale;
    }
  };

  // Crisp drop shadow + 8-neighbor dark outline
  drawPass(scale, scale * 2, shadowColor);
  drawPass(-scale, 0, outlineColor);
  drawPass(scale, 0, outlineColor);
  drawPass(0, -scale, outlineColor);
  drawPass(0, scale, outlineColor);
  drawPass(-scale, -scale, outlineColor);
  drawPass(scale, -scale, outlineColor);
  drawPass(-scale, scale, outlineColor);
  drawPass(scale, scale, outlineColor);
  // Foreground crisp pixels
  drawPass(0, 0, color);
}

/**
 * Wraps caption text cleanly to fit inside the native pixel buffer width with zero overflow.
 */
export function wrapPixelCaptionLines(text: string, maxCharsPerLine: number): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (cur && next.length > maxCharsPerLine) {
      lines.push(cur);
      cur = w;
    } else {
      cur = next;
    }
  }
  if (cur) lines.push(cur);
  return lines.slice(0, 3);
}

/**
 * Draws retro arcade educational caption with keyword highlights (golden/cyan),
 * crisp 1px dark outline, drop shadow, and smooth pop/slide entry animation.
 */
export function drawRetroPixelCaption(
  ctx: CanvasRenderingContext2D,
  text: string,
  emphasisWords: string[],
  localTime: number,
  logicalW: number,
  topY: number,
  options?: {
    highlightColor?: string;
    textColor?: string;
    scale?: number;
  }
): void {
  if (!text.trim()) return;
  const scale = options?.scale ?? (logicalW >= 240 ? 2 : 1);
  const maxChars = Math.max(14, Math.floor((logicalW - 18) / (6 * scale)));
  const lines = wrapPixelCaptionLines(text, maxChars);
  const emphasisSet = new Set(
    emphasisWords.map((w) => w.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, ''))
  );

  // Entry pop/slide animation (first 0.25s of scene)
  const enterT = Math.min(1, Math.max(0, localTime / 0.24));
  const slideOffset = Math.round((1 - enterT) * 6);
  const highlightColor = options?.highlightColor ?? '#FFD23F';
  const textColor = options?.textColor ?? '#FFFFFF';
  const lineHeight = 9 * scale;

  lines.forEach((line, li) => {
    const words = line.split(/\s+/);
    const totalW = measurePixelText(line, scale);
    let cursorX = Math.round((logicalW - totalW) / 2);
    const ly = Math.round(topY + li * lineHeight + slideOffset);

    words.forEach((w, wi) => {
      const clean = w.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
      const isNum = /\d/.test(w);
      const isEmph = emphasisSet.has(clean) || isNum;
      const wordColor = isNum ? '#38E8FF' : isEmph ? highlightColor : textColor;

      drawPixelText(ctx, w, cursorX, ly, {
        color: wordColor,
        outlineColor: '#0A071A',
        scale,
        align: 'left',
      });
      cursorX += measurePixelText(w, scale) + 6 * scale;
      if (wi < words.length - 1) {
        // Space already accounted for by + 6*scale
      }
    });
  });
}

export function formatCounterValue(n: number): string {
  return Math.round(n).toLocaleString('pt-BR');
}
