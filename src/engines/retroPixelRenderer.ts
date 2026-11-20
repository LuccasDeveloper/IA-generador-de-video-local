import type {
  AnimationState,
  CharacterDefinition,
  ExpressionType,
  ProjectPlan,
  ScenarioDefinition,
  SceneActor,
  SceneSpec,
} from '../types/studio';
import { STARTER_CHARACTERS, STARTER_SCENARIOS } from '../data/presets';
import { resolvePixelGridForAspectRatio } from '../data/retroEducationalKnowledge';
import { applyEasing, getCachedImage, resolveActorStateAtProgress } from './characterRenderer';
import {
  bayerThreshold,
  drawDitheredHalo,
  drawPixelLine,
  drawPixelShadedEllipse,
  drawPixelText,
  drawRetroPixelCaption,
  fillDitheredVerticalGradient,
  fillPixelRect,
} from './pixelFontAndPrimitives';
import { drawRetroPixelInfographic } from './retroPixelInfographics';

// Reusable offscreen native pixel canvases (zero GC pressure on Ryzen 3 / Vega 8)
let pixelMainCanvas: HTMLCanvasElement | null = null;
let pixelPrevCanvas: HTMLCanvasElement | null = null;

function getPixelBuffer(
  slot: 'main' | 'prev',
  w: number,
  h: number,
  createOffscreenCanvas?: (width: number, height: number) => HTMLCanvasElement
): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } | null {
  let canvas = slot === 'main' ? pixelMainCanvas : pixelPrevCanvas;
  if (!canvas || canvas.width !== w || canvas.height !== h) {
    if (createOffscreenCanvas) {
      canvas = createOffscreenCanvas(w, h);
    } else if (typeof document !== 'undefined') {
      canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
    } else {
      return null;
    }
    if (slot === 'main') pixelMainCanvas = canvas;
    else pixelPrevCanvas = canvas;
  }
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.imageSmoothingEnabled = false;
  return { canvas, ctx };
}

function smoothstep(t: number): number {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
}

// ============================================================================
// 8 DETAILED 3-LAYER PARALLAX PIXEL ART SCENARIOS
// ============================================================================
export function drawRetroPixelScenario(
  ctx: CanvasRenderingContext2D,
  scenario: ScenarioDefinition,
  w: number,
  h: number,
  t: number,
  panX: number
): void {
  const bgShift = Math.round(panX * w * 0.16);
  const mgShift = Math.round(panX * w * 0.42);
  const fgShift = Math.round(panX * w * 0.72);
  const horizonY = Math.round(h * 0.72);

  switch (scenario.theme) {
    case 'retro_ice_cream_diner': {
      // Background: deep night sky with Bayer dithering + twinkling stars + retro skyline
      fillDitheredVerticalGradient(ctx, 0, 0, w, horizonY, ['#0B1030', '#18184A', '#2E1E5C']);
      for (let i = 0; i < 28; i++) {
        const sx = (((i * 41 + bgShift) % w) + w) % w;
        const sy = 14 + ((i * 23) % Math.round(horizonY * 0.55));
        const twinkle = Math.sin(t * 3 + i * 1.7) > 0.35;
        fillPixelRect(ctx, sx, sy, 1, 1, twinkle ? '#FFE5CC' : '#7C85B8');
      }
      // City skyline silhouettes + glowing pixel windows
      for (let b = -1; b < 9; b++) {
        const bx = b * 24 + (bgShift % 24);
        const bh = 36 + ((b * 17 + 25) % 44);
        const by = horizonY - bh;
        fillPixelRect(ctx, bx, by, 21, bh, '#17143D');
        fillPixelRect(ctx, bx, by, 21, 1, '#312A70');
        for (let wy = by + 5; wy < horizonY - 8; wy += 6) {
          for (let wx = bx + 3; wx < bx + 17; wx += 5) {
            if ((wx + wy) % 3 !== 0) {
              fillPixelRect(ctx, wx, wy, 2, 3, (wx + wy) % 5 === 0 ? '#FF4F9A' : '#6A67B3');
            }
          }
        }
      }

      // Midground: retro ice cream parlor booth, menu board, display tubs & neon ice cream sign
      const boothW = Math.round(w * 0.52);
      const boothX = Math.round(-6 + mgShift * 0.4);
      fillPixelRect(ctx, boothX, Math.round(h * 0.24), boothW, horizonY - Math.round(h * 0.24), '#1D1836');
      fillPixelRect(ctx, boothX, Math.round(h * 0.24), boothW, 2, '#3C3268');
      // Chalkboard menu
      fillPixelRect(ctx, boothX + 8, Math.round(h * 0.34), boothW - 22, 34, '#111528');
      fillPixelRect(ctx, boothX + 7, Math.round(h * 0.34) - 1, boothW - 20, 1, '#584B8C');
      for (let m = 0; m < 4; m++) {
        fillPixelRect(ctx, boothX + 12, Math.round(h * 0.34) + 6 + m * 7, 28 + (m % 2) * 14, 2, '#9BA5CC');
        fillPixelRect(ctx, boothX + boothW - 24, Math.round(h * 0.34) + 6 + m * 7, 6, 2, '#FFD23F');
      }
      // Ice cream flavor freezer case
      const caseY = horizonY - 22;
      fillPixelRect(ctx, boothX + 6, caseY, boothW - 14, 22, '#383059');
      const scoopColors = ['#FFE5CC', '#5EEAD4', '#8EC5FF', '#FF8FB1'];
      for (let s = 0; s < 4; s++) {
        const sx = boothX + 10 + s * 19;
        if (sx + 14 < boothX + boothW - 6) {
          fillPixelRect(ctx, sx, caseY + 7, 14, 12, '#DDE3F0');
          drawPixelShadedEllipse(ctx, sx + 7, caseY + 7, 6, 4, {
            base: scoopColors[s % scoopColors.length],
            light: '#FFFFFF',
            shadow: '#645A8E',
          });
        }
      }

      // Striped pastel mint/cream awning at top-left
      const awnY = Math.round(h * 0.20);
      for (let s = 0; s < 10; s++) {
        const ax = boothX + s * 10;
        if (ax > boothX + boothW + 8) break;
        fillPixelRect(ctx, ax, awnY, 10, 11, s % 2 === 0 ? '#5EEAD4' : '#FFE5CC');
        fillPixelRect(ctx, ax, awnY + 11, 10, 3, s % 2 === 0 ? '#2E9E8F' : '#D6B89C');
      }

      // Glowing Neon Ice Cream Sign on right wall
      const neonX = Math.round(w * 0.74 + mgShift * 0.3);
      const neonY = Math.round(h * 0.42);
      const neonPulse = 0.65 + 0.25 * Math.sin(t * 4);
      drawDitheredHalo(ctx, neonX, neonY, 18, '#FF4F9A', neonPulse * 0.65);
      drawPixelShadedEllipse(ctx, neonX, neonY - 4, 6, 5, {
        base: '#FF4F9A',
        light: '#FFB3D9',
        shadow: '#9E1954',
      });
      drawPixelLine(ctx, neonX - 5, neonY, neonX, neonY + 11, '#FFD23F', 2);
      drawPixelLine(ctx, neonX + 5, neonY, neonX, neonY + 11, '#FFD23F', 2);

      // Hanging string fairy bulbs swaying softly near top
      const wireY = Math.round(h * 0.14);
      for (let i = 0; i < 8; i++) {
        const lx = Math.round(((i + 0.5) / 8) * w + (fgShift % 12) * 0.2);
        const sag = Math.round(Math.sin((i / 7) * Math.PI) * 5);
        const bulbY = wireY + sag;
        drawDitheredHalo(ctx, lx, bulbY, 7, '#FFD23F', 0.48 + 0.15 * Math.sin(t * 3 + i));
        fillPixelRect(ctx, lx - 1, bulbY - 1, 2, 2, '#FFF7C2');
      }

      // Foreground: Warm wooden parlor counter planks with pixel highlights
      fillPixelRect(ctx, 0, horizonY, w, h - horizonY, '#B97848');
      fillPixelRect(ctx, 0, horizonY, w, 3, '#E8B07D');
      for (let py = horizonY + 8; py < h; py += 9) {
        fillPixelRect(ctx, 0, py, w, 1, '#8C522B');
        fillPixelRect(ctx, 0, py + 1, w, 1, '#CF8E5B');
      }
      // Front counter fascia shadow
      const frontY = Math.round(h * 0.88);
      fillPixelRect(ctx, 0, frontY, w, 3, '#63371B');
      fillPixelRect(ctx, 0, frontY + 3, w, h - frontY, '#7C4928');
      for (let vx = (fgShift % 16); vx < w; vx += 16) {
        fillPixelRect(ctx, vx, frontY + 3, 1, h - frontY, '#5A3117');
      }
      break;
    }

    case 'human_body_interior': {
      // Rich organic cellular mosaic background (inspired by anatomical cutaway aesthetic)
      fillDitheredVerticalGradient(ctx, 0, 0, w, h, ['#1E0718', '#3B0E24', '#5C1430']);
      // Subtle organic cell tile pattern
      const tile = 22;
      for (let gy = -tile; gy < h + tile; gy += tile) {
        for (let gx = -tile; gx < w + tile; gx += tile) {
          const ox = gx + (bgShift % tile) + ((Math.floor(gy / tile) % 2) * 10);
          drawPixelLine(ctx, ox, gy, ox + tile - 4, gy + 4, '#2A091C', 1);
          drawPixelLine(ctx, ox, gy, ox + 3, gy + tile - 2, '#2A091C', 1);
        }
      }
      // Floating glowing bio-particles in depth
      for (let i = 0; i < 18; i++) {
        const px = (((i * 37 + Math.floor(t * 8 + mgShift)) % w) + w) % w;
        const py = (((i * 59 - Math.floor(t * 6)) % h) + h) % h;
        fillPixelRect(ctx, px, py, 2, 2, i % 3 === 0 ? '#FF8FB1' : '#FFD23F');
      }
      break;
    }

    case 'pixel_science_lab': {
      fillDitheredVerticalGradient(ctx, 0, 0, w, horizonY, ['#110B2E', '#1D144D', '#281E66']);
      // Oscilloscope monitor on back wall
      const monX = Math.round(w * 0.56 + bgShift * 0.4);
      const monY = Math.round(h * 0.30);
      fillPixelRect(ctx, monX - 2, monY - 2, 54, 34, '#0A071A');
      fillPixelRect(ctx, monX, monY, 50, 30, '#092433');
      for (let ox = 2; ox < 48; ox++) {
        const wy = monY + 15 + Math.round(Math.sin(ox * 0.25 + t * 8) * 8);
        fillPixelRect(ctx, monX + ox, wy, 1, 2, '#5EEAD4');
      }
      // Shelves with glowing bubbling neon flasks
      const shelfY = Math.round(h * 0.48);
      fillPixelRect(ctx, 8 + mgShift * 0.3, shelfY, Math.round(w * 0.45), 4, '#433878');
      const flaskColors = ['#FF4F9A', '#38E8FF', '#FFD23F'];
      for (let f = 0; f < 3; f++) {
        const fx = Math.round(22 + f * 22 + mgShift * 0.3);
        drawDitheredHalo(ctx, fx, shelfY - 9, 10, flaskColors[f], 0.45);
        fillPixelRect(ctx, fx - 2, shelfY - 18, 4, 6, '#CFE9FF');
        drawPixelShadedEllipse(ctx, fx, shelfY - 7, 7, 6, {
          base: flaskColors[f],
          light: '#FFFFFF',
          shadow: '#1A103C',
          outline: '#0A071A',
        });
        // Animated rising bubble
        const by = shelfY - 10 - Math.floor((t * 14 + f * 5) % 10);
        fillPixelRect(ctx, fx, by, 2, 2, '#FFFFFF');
      }
      // Lab workbench floor
      fillPixelRect(ctx, 0, horizonY, w, h - horizonY, '#262C4E');
      fillPixelRect(ctx, 0, horizonY, w, 3, '#38E8FF');
      for (let gx = (fgShift % 18); gx < w; gx += 18) {
        fillPixelRect(ctx, gx, horizonY + 3, 1, h - horizonY, '#1A1F3B');
      }
      break;
    }

    case 'retro_outer_space': {
      fillDitheredVerticalGradient(ctx, 0, 0, w, h, ['#05071A', '#130D36', '#21114A']);
      // Dithered magenta/cyan nebula clouds
      drawDitheredHalo(ctx, Math.round(w * 0.25 + bgShift * 0.4), Math.round(h * 0.35), 42, '#FF4F9A', 0.28);
      drawDitheredHalo(ctx, Math.round(w * 0.78 + bgShift * 0.4), Math.round(h * 0.62), 38, '#38E8FF', 0.24);
      // Multi-layer twinkling starfield
      for (let i = 0; i < 48; i++) {
        const speed = (i % 3) + 1;
        const sx = (((i * 31 + Math.floor(bgShift * speed * 0.4)) % w) + w) % w;
        const sy = (i * 53) % h;
        const col = i % 5 === 0 ? '#FFD23F' : i % 4 === 0 ? '#38E8FF' : '#FFFFFF';
        const sz = i % 7 === 0 && Math.sin(t * 4 + i) > 0 ? 2 : 1;
        fillPixelRect(ctx, sx, sy, sz, sz, col);
      }
      // Distant ringed pixel planet in midground
      const px = Math.round(w * 0.78 + mgShift * 0.25);
      const py = Math.round(h * 0.32);
      drawPixelShadedEllipse(ctx, px, py, 14, 14, {
        base: '#FF4F9A',
        light: '#FFC2DD',
        shadow: '#5E1848',
        outline: '#0A071A',
      });
      drawPixelLine(ctx, px - 22, py + 4, px + 22, py - 4, '#FFD23F', 2);
      break;
    }

    case 'pixel_neon_city': {
      fillDitheredVerticalGradient(ctx, 0, 0, w, horizonY, ['#0A0E2E', '#21124D', '#3D1766']);
      // Moon + glowing pixel skyline
      drawDitheredHalo(ctx, Math.round(w * 0.8), Math.round(h * 0.22), 20, '#FFE5CC', 0.45);
      drawPixelShadedEllipse(ctx, Math.round(w * 0.8), Math.round(h * 0.22), 11, 11, {
        base: '#FFE5CC',
        light: '#FFFFFF',
        shadow: '#C2A88C',
      });
      for (let b = -1; b < 9; b++) {
        const bx = b * 24 + (mgShift % 24);
        const bh = 44 + ((b * 29 + 19) % 52);
        const by = horizonY - bh;
        fillPixelRect(ctx, bx, by, 22, bh, '#16133B');
        fillPixelRect(ctx, bx, by, 22, 2, b % 2 === 0 ? '#38E8FF' : '#FF4F9A');
        for (let wy = by + 6; wy < horizonY - 6; wy += 6) {
          fillPixelRect(ctx, bx + 4, wy, 3, 3, '#FFD23F');
          fillPixelRect(ctx, bx + 13, wy, 3, 3, (b + wy) % 2 === 0 ? '#38E8FF' : '#FF4F9A');
        }
      }
      // Neon sidewalk foreground
      fillPixelRect(ctx, 0, horizonY, w, h - horizonY, '#1C2245');
      fillPixelRect(ctx, 0, horizonY, w, 2, '#FF4F9A');
      for (let x = 0; x < w; x += 24) {
        fillPixelRect(ctx, x, horizonY + 14, 12, 2, '#FFD23F');
      }
      break;
    }

    case 'pixel_fantasy_forest': {
      fillDitheredVerticalGradient(ctx, 0, 0, w, horizonY, ['#111542', '#1C3059', '#255261']);
      // Layered pixel pine/canopy trees
      for (let i = -1; i < 7; i++) {
        const tx = i * 32 + (mgShift % 32);
        fillPixelRect(ctx, tx + 11, horizonY - 38, 6, 38, '#5C3828');
        drawPixelShadedEllipse(ctx, tx + 14, horizonY - 44, 16, 15, {
          base: '#1E7A56',
          light: '#5EEAD4',
          shadow: '#0D3B2B',
          outline: '#0A071A',
        });
      }
      // Glowing mushrooms & grass floor
      fillPixelRect(ctx, 0, horizonY, w, h - horizonY, '#1C4A3B');
      fillPixelRect(ctx, 0, horizonY, w, 3, '#5EEAD4');
      for (let m = 0; m < 3; m++) {
        const mx = Math.round(((m + 0.5) / 3) * w + fgShift * 0.2);
        drawDitheredHalo(ctx, mx, horizonY + 8, 9, '#FF4F9A', 0.5);
        fillPixelRect(ctx, mx - 2, horizonY + 8, 4, 6, '#FFE5CC');
        drawPixelShadedEllipse(ctx, mx, horizonY + 6, 6, 4, {
          base: '#FF4F9A',
          light: '#FFC2DD',
          shadow: '#8F194D',
        });
      }
      // Animated fireflies
      for (let f = 0; f < 10; f++) {
        const fx = Math.round(((f * 29 + Math.sin(t * 2 + f) * 14) % w + w) % w);
        const fy = Math.round(h * 0.35 + ((f * 23) % Math.round(h * 0.38)) + Math.cos(t * 3 + f) * 5);
        drawDitheredHalo(ctx, fx, fy, 5, '#FFD23F', 0.65);
        fillPixelRect(ctx, fx, fy, 2, 2, '#FFF7C2');
      }
      break;
    }

    case 'pixel_tech_circuit': {
      fillDitheredVerticalGradient(ctx, 0, 0, w, h, ['#061126', '#0B1F42', '#102D5E']);
      // Crisp PCB trace grid
      for (let y = 18; y < h; y += 22) {
        fillPixelRect(ctx, 0, y, w, 1, '#163D73');
        const pulseX = Math.round(((t * 48 + y * 5) % (w + 20)) - 10);
        fillPixelRect(ctx, pulseX, y - 1, 8, 3, y % 44 === 18 ? '#38E8FF' : '#5EEAD4');
      }
      for (let x = (bgShift % 26) + 26; x < w; x += 26) {
        fillPixelRect(ctx, x, 0, 1, h, '#133463');
        fillPixelRect(ctx, x - 1, (x * 3) % (h - 20) + 10, 3, 3, '#FFD23F');
      }
      break;
    }

    case 'pixel_history_observatory': {
      fillDitheredVerticalGradient(ctx, 0, 0, w, horizonY, ['#120E30', '#27174A', '#3D225E']);
      // Open observatory dome night sky window
      drawPixelShadedEllipse(ctx, w * 0.5, Math.round(h * 0.36), Math.round(w * 0.38), Math.round(h * 0.24), {
        base: '#0A0D2B',
        light: '#171C4D',
        shadow: '#05071A',
        outline: '#FFD23F',
      });
      for (let i = 0; i < 16; i++) {
        const sx = Math.round(w * 0.22 + ((i * 23) % Math.round(w * 0.56)));
        const sy = Math.round(h * 0.2 + ((i * 17) % Math.round(h * 0.28)));
        fillPixelRect(ctx, sx, sy, 1, 1, i % 3 === 0 ? '#FFD23F' : '#FFFFFF');
      }
      // Brass pixel telescope silhouette
      const telX = Math.round(w * 0.72 + mgShift * 0.25);
      const telY = horizonY - 26;
      drawPixelLine(ctx, telX, telY, telX - 10, horizonY, '#5C3828', 2);
      drawPixelLine(ctx, telX, telY, telX + 10, horizonY, '#5C3828', 2);
      drawPixelLine(ctx, telX - 18, telY - 12, telX + 12, telY + 4, '#FFD23F', 5);
      drawPixelLine(ctx, telX - 18, telY - 12, telX + 12, telY + 4, '#FFF3B0', 2);
      // Antique wooden floor & glowing candle
      fillPixelRect(ctx, 0, horizonY, w, h - horizonY, '#5C3828');
      fillPixelRect(ctx, 0, horizonY, w, 2, '#9E6240');
      drawDitheredHalo(ctx, Math.round(w * 0.2), horizonY - 8, 12, '#FFD23F', 0.55);
      fillPixelRect(ctx, Math.round(w * 0.2) - 2, horizonY - 8, 4, 8, '#FFE5CC');
      fillPixelRect(ctx, Math.round(w * 0.2) - 1, horizonY - 12, 2, 4, '#FFD23F');
      break;
    }

    default: {
      fillDitheredVerticalGradient(ctx, 0, 0, w, horizonY, [scenario.skyTop, scenario.skyBottom]);
      fillPixelRect(ctx, 0, horizonY, w, h - horizonY, scenario.groundColor);
      break;
    }
  }
}

// ============================================================================
// EXPRESSIVE 16-BIT PIXEL ART CHARACTERS & MASCOTS
// (Anticipation, Squash & Stretch, Blinking Eyes, Animated Mouth & Limbs!)
// ============================================================================
function drawExpressivePixelFace(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  expression: ExpressionType,
  state: AnimationState,
  t: number
): void {
  const blink = Math.sin(t * 2.7 + cx * 0.1) > 0.94;
  const eyeY = Math.round(cy - 2);
  const mouthY = Math.round(cy + 6);

  // Rosy pixel blush cheeks
  fillPixelRect(ctx, cx - 12, eyeY + 4, 4, 2, '#FF8FB1');
  fillPixelRect(ctx, cx + 8, eyeY + 4, 4, 2, '#FF8FB1');

  // Eyes by expression
  if (expression === 'scared' || state === 'hit') {
    // Squeezed > < pain / shiver eyes!
    drawPixelLine(ctx, cx - 9, eyeY - 2, cx - 5, eyeY, '#1A103C', 1);
    drawPixelLine(ctx, cx - 5, eyeY, cx - 9, eyeY + 2, '#1A103C', 1);
    drawPixelLine(ctx, cx + 9, eyeY - 2, cx + 5, eyeY, '#1A103C', 1);
    drawPixelLine(ctx, cx + 5, eyeY, cx + 9, eyeY + 2, '#1A103C', 1);
  } else if (expression === 'happy') {
    // Happy curved arcade eyes (^ ^)
    if (blink) {
      fillPixelRect(ctx, cx - 9, eyeY, 5, 1, '#1A103C');
      fillPixelRect(ctx, cx + 4, eyeY, 5, 1, '#1A103C');
    } else {
      fillPixelRect(ctx, cx - 8, eyeY - 2, 4, 5, '#1A103C');
      fillPixelRect(ctx, cx - 7, eyeY - 1, 2, 2, '#FFFFFF');
      fillPixelRect(ctx, cx + 4, eyeY - 2, 4, 5, '#1A103C');
      fillPixelRect(ctx, cx + 5, eyeY - 1, 2, 2, '#FFFFFF');
    }
  } else if (expression === 'surprised') {
    // Wide bright eyes with raised eyebrows
    fillPixelRect(ctx, cx - 9, eyeY - 6, 5, 1, '#4A2545');
    fillPixelRect(ctx, cx + 4, eyeY - 6, 5, 1, '#4A2545');
    fillPixelRect(ctx, cx - 9, eyeY - 3, 5, 6, '#1A103C');
    fillPixelRect(ctx, cx - 8, eyeY - 2, 2, 2, '#FFFFFF');
    fillPixelRect(ctx, cx + 4, eyeY - 3, 5, 6, '#1A103C');
    fillPixelRect(ctx, cx + 5, eyeY - 2, 2, 2, '#FFFFFF');
  } else if (expression === 'sad') {
    fillPixelRect(ctx, cx - 8, eyeY - 1, 4, 4, '#1A103C');
    fillPixelRect(ctx, cx + 4, eyeY - 1, 4, 4, '#1A103C');
    // Tiny tear pixel
    fillPixelRect(ctx, cx + 8, eyeY + 2, 2, 3, '#38E8FF');
  } else {
    if (blink) {
      fillPixelRect(ctx, cx - 8, eyeY, 4, 1, '#1A103C');
      fillPixelRect(ctx, cx + 4, eyeY, 4, 1, '#1A103C');
    } else {
      fillPixelRect(ctx, cx - 8, eyeY - 2, 4, 4, '#1A103C');
      fillPixelRect(ctx, cx - 7, eyeY - 1, 1, 2, '#FFFFFF');
      fillPixelRect(ctx, cx + 4, eyeY - 2, 4, 4, '#1A103C');
      fillPixelRect(ctx, cx + 5, eyeY - 1, 1, 2, '#FFFFFF');
    }
  }

  // Animated mouth
  const talkOpen = state === 'talk' ? Math.sin(t * 14) > 0 : false;
  if (expression === 'scared' || state === 'hit') {
    // Gritted teeth / shivering wave mouth
    fillPixelRect(ctx, cx - 5, mouthY - 1, 10, 4, '#FFFFFF');
    fillPixelRect(ctx, cx - 6, mouthY - 2, 12, 1, '#1A103C');
    fillPixelRect(ctx, cx - 6, mouthY + 3, 12, 1, '#1A103C');
    fillPixelRect(ctx, cx - 2, mouthY - 1, 1, 4, '#1A103C');
    fillPixelRect(ctx, cx + 2, mouthY - 1, 1, 4, '#1A103C');
  } else if (expression === 'surprised' || talkOpen) {
    fillPixelRect(ctx, cx - 4, mouthY - 2, 8, 6, '#3B0A20');
    fillPixelRect(ctx, cx - 2, mouthY + 1, 4, 2, '#FF5D5D');
  } else if (expression === 'happy') {
    fillPixelRect(ctx, cx - 4, mouthY, 8, 1, '#1A103C');
    fillPixelRect(ctx, cx - 3, mouthY + 1, 6, 2, '#FF5D5D');
  } else if (expression === 'sad') {
    fillPixelRect(ctx, cx - 3, mouthY + 1, 6, 1, '#1A103C');
    fillPixelRect(ctx, cx - 4, mouthY + 2, 2, 1, '#1A103C');
    fillPixelRect(ctx, cx + 2, mouthY + 2, 2, 1, '#1A103C');
  } else {
    fillPixelRect(ctx, cx - 3, mouthY, 6, 1, '#1A103C');
  }
}

export function drawRetroPixelCharacter(
  ctx: CanvasRenderingContext2D,
  char: CharacterDefinition,
  x: number,
  y: number,
  scale: number,
  state: AnimationState,
  expression: ExpressionType,
  t: number,
  flipX = false
): void {
  const s = Math.max(0.55, Math.min(2.2, scale));

  // Custom spritesheet support rendered with nearest-neighbor crispness
  if (char.kind === 'spritesheet' && char.spritesheet?.imageDataUrl) {
    const img = getCachedImage(char.spritesheet.imageDataUrl);
    if (img && img.complete && img.naturalWidth > 0) {
      const sp = char.spritesheet;
      const clip = sp.clips[state] || sp.clips.idle || { frames: sp.frameOrder, fps: sp.fps, loop: true };
      const frames = clip.frames.length > 0 ? clip.frames : [0];
      const idx = frames[Math.floor(t * Math.max(1, clip.fps)) % frames.length];
      const col = idx % sp.cols;
      const row = Math.floor(idx / sp.cols);
      const dw = Math.round(34 * s);
      const dh = Math.round((34 * (sp.frameHeight / Math.max(1, sp.frameWidth))) * s);
      ctx.save();
      ctx.imageSmoothingEnabled = false;
      ctx.translate(Math.round(x), Math.round(y));
      if (flipX) ctx.scale(-1, 1);
      ctx.drawImage(
        img,
        col * sp.frameWidth,
        row * sp.frameHeight,
        sp.frameWidth,
        sp.frameHeight,
        -Math.round(dw * sp.pivotX),
        -Math.round(dh * sp.pivotY),
        dw,
        dh
      );
      ctx.restore();
      return;
    }
  }

  // Anticipation, bounce, shiver & squash-and-stretch physics
  const walkCycle = state === 'walk' || state === 'run' || state === 'sprint';
  const freq = state === 'sprint' ? 12 : state === 'run' ? 9 : state === 'walk' ? 6 : 3.2;
  const phase = t * freq;
  const bounceY =
    state === 'jump'
      ? -Math.round(Math.abs(Math.sin(t * 5)) * 14 * s)
      : walkCycle
      ? -Math.round(Math.abs(Math.sin(phase)) * 4 * s)
      : Math.round(Math.sin(t * 3.5) * 1.6 * s);
  const shiverX = state === 'hit' || expression === 'scared' ? Math.round(Math.sin(t * 42) * 1.5) : 0;
  const squashX = state === 'jump' ? 0.92 : state === 'hit' ? 1.08 : 1 + Math.sin(phase) * (walkCycle ? 0.04 : 0.02);
  const squashY = state === 'jump' ? 1.1 : state === 'hit' ? 0.92 : 1 / squashX;

  const cx = Math.round(x + shiverX);
  const footY = Math.round(y);
  const archetype = char.pixelArchetype ?? (char.genre === 'educational' ? 'human_kid' : 'human_scientist');

  // Grounded pixel contact shadow
  fillPixelRect(ctx, cx - Math.round(14 * s), footY - 2, Math.round(28 * s), 4, 'rgba(10, 7, 26, 0.45)');

  if (archetype === 'ice_cream_treat') {
    const cy = footY - Math.round(24 * s) + bounceY;
    // Pixel waffle cone
    for (let row = 0; row < Math.round(22 * s); row++) {
      const halfW = Math.max(1, Math.round((11 * s) * (1 - row / (22 * s))));
      fillPixelRect(ctx, cx - halfW - 1, cy + row + 6, halfW * 2 + 2, 1, '#5A3117');
      fillPixelRect(ctx, cx - halfW, cy + row + 6, halfW * 2, 1, row % 4 < 2 ? '#F5B971' : '#D99348');
    }
    // Mint lower scoop
    drawPixelShadedEllipse(ctx, cx, cy + 2, 12 * s * squashX, 10 * s * squashY, {
      base: '#5EEAD4',
      light: '#B5FFF2',
      shadow: '#239E8C',
      outline: '#1A103C',
    });
    // Pink top scoop with cute face
    drawPixelShadedEllipse(ctx, cx, cy - Math.round(12 * s), 13 * s * squashX, 11 * s * squashY, {
      base: '#FF8FB1',
      light: '#FFD1E1',
      shadow: '#C23B6E',
      outline: '#1A103C',
      specular: '#FFFFFF',
    });
    drawExpressivePixelFace(ctx, cx, cy - Math.round(11 * s), expression, state, t);
    return;
  }

  if (archetype === 'red_blood_cell') {
    const cy = footY - Math.round(20 * s) + bounceY;
    drawDitheredHalo(ctx, cx, cy, Math.round(18 * s), '#FF5D5D', 0.4);
    drawPixelShadedEllipse(ctx, cx, cy, 15 * s * squashX, 14 * s * squashY, {
      base: '#FF5D5D',
      light: '#FFA6B8',
      shadow: '#99142B',
      outline: '#2B0610',
      specular: '#FFE5EC',
    });
    // Biconcave dimple ring
    drawPixelShadedEllipse(ctx, cx, cy, 7 * s, 6 * s, {
      base: '#D92B4B',
      light: '#FF758F',
      shadow: '#7D1229',
    });
    drawExpressivePixelFace(ctx, cx, cy, expression, state, t);
    return;
  }

  if (archetype === 'neuron_spark') {
    const cy = footY - Math.round(22 * s) + bounceY;
    drawDitheredHalo(ctx, cx, cy, Math.round(20 * s), '#FFD23F', 0.72);
    // Electric star rays
    for (let a = 0; a < 6; a++) {
      const ang = t * 2.5 + (a * Math.PI) / 3;
      drawPixelLine(
        ctx,
        cx,
        cy,
        cx + Math.cos(ang) * 16 * s,
        cy + Math.sin(ang) * 16 * s,
        a % 2 === 0 ? '#FFD23F' : '#38E8FF',
        2
      );
    }
    drawPixelShadedEllipse(ctx, cx, cy, 11 * s * squashX, 11 * s * squashY, {
      base: '#FFD23F',
      light: '#FFFFFF',
      shadow: '#D97706',
      outline: '#1A103C',
    });
    drawExpressivePixelFace(ctx, cx, cy, expression, state, t);
    return;
  }

  // Articulated 16-bit Pixel Human / Mascot (human_kid or human_scientist)
  const legSwing = walkCycle ? Math.round(Math.sin(phase) * 5 * s) : 0;
  const armSwing = walkCycle ? -legSwing : state === 'talk' ? Math.round(Math.sin(t * 8) * 3 * s) : 0;
  const torsoY = footY - Math.round(22 * s) + bounceY;
  const headY = torsoY - Math.round(16 * s);

  // Articulated Pixel Legs & Boots
  fillPixelRect(ctx, cx - Math.round(7 * s) + legSwing, footY - Math.round(12 * s), Math.round(5 * s), Math.round(10 * s), char.palette.pants);
  fillPixelRect(ctx, cx + Math.round(2 * s) - legSwing, footY - Math.round(12 * s), Math.round(5 * s), Math.round(10 * s), char.palette.pants);
  fillPixelRect(ctx, cx - Math.round(8 * s) + legSwing, footY - Math.round(4 * s), Math.round(7 * s), Math.round(4 * s), char.palette.boots);
  fillPixelRect(ctx, cx + Math.round(1 * s) - legSwing, footY - Math.round(4 * s), Math.round(7 * s), Math.round(4 * s), char.palette.boots);

  // Articulated Pixel Torso (Coat / Arcade Jacket)
  const torsoW = Math.round(20 * s * squashX);
  const torsoH = Math.round(15 * s * squashY);
  fillPixelRect(ctx, cx - Math.floor(torsoW / 2) - 1, torsoY - 1, torsoW + 2, torsoH + 2, '#0A071A');
  fillPixelRect(ctx, cx - Math.floor(torsoW / 2), torsoY, torsoW, torsoH, char.palette.outfitPrimary);
  // Center shirt stripe / scientist lab coat collar
  fillPixelRect(ctx, cx - Math.round(3 * s), torsoY + 1, Math.round(6 * s), torsoH - 2, char.palette.outfitSecondary);

  // Articulated Pixel Arms
  const leftArmY = torsoY + Math.round(3 * s) + (state === 'jump' ? -Math.round(8 * s) : armSwing);
  const rightArmY = torsoY + Math.round(3 * s) + (state === 'jump' ? -Math.round(8 * s) : -armSwing);
  fillPixelRect(ctx, cx - Math.floor(torsoW / 2) - Math.round(5 * s), leftArmY, Math.round(5 * s), Math.round(9 * s), char.palette.outfitPrimary);
  fillPixelRect(ctx, cx - Math.floor(torsoW / 2) - Math.round(5 * s), leftArmY + Math.round(7 * s), Math.round(4 * s), Math.round(4 * s), char.palette.skin);
  fillPixelRect(ctx, cx + Math.floor(torsoW / 2), rightArmY, Math.round(5 * s), Math.round(9 * s), char.palette.outfitPrimary);
  fillPixelRect(ctx, cx + Math.floor(torsoW / 2) + 1, rightArmY + Math.round(7 * s), Math.round(4 * s), Math.round(4 * s), char.palette.skin);

  // Expressive Stylized Rounded 16-bit Head (like reference arcade mascot!)
  const headRx = Math.round(17 * s * squashX);
  const headRy = Math.round(15 * s * squashY);
  // Ears
  drawPixelShadedEllipse(ctx, cx - headRx, headY + 1, 3 * s, 4 * s, {
    base: char.palette.skin,
    light: '#FFF3E6',
    shadow: char.palette.skinShadow,
    outline: '#1A103C',
  });
  drawPixelShadedEllipse(ctx, cx + headRx, headY + 1, 3 * s, 4 * s, {
    base: char.palette.skin,
    light: '#FFF3E6',
    shadow: char.palette.skinShadow,
    outline: '#1A103C',
  });
  // Main shaded pixel head
  drawPixelShadedEllipse(ctx, cx, headY, headRx, headRy, {
    base: char.palette.skin,
    light: '#FFF3E6',
    shadow: char.palette.skinShadow,
    outline: '#1A103C',
  });

  // Scalloped pixel hair cap
  for (let hx = -headRx + 2; hx <= headRx - 2; hx++) {
    const nx = hx / headRx;
    const capTop = -Math.round(Math.sqrt(Math.max(0, 1 - nx * nx)) * headRy);
    const bangWave = Math.round(Math.sin(hx * 0.45) * 2.5);
    const capBot = -Math.round(headRy * 0.36) + bangWave;
    if (capBot > capTop) {
      fillPixelRect(ctx, cx + hx, headY + capTop, 1, capBot - capTop, char.palette.hair);
    }
  }

  // Scientist glowing cyan glasses if human_scientist
  if (archetype === 'human_scientist') {
    fillPixelRect(ctx, cx - 11, headY - 5, 9, 7, '#0A071A');
    fillPixelRect(ctx, cx + 2, headY - 5, 9, 7, '#0A071A');
    fillPixelRect(ctx, cx - 10, headY - 4, 7, 5, '#38E8FF');
    fillPixelRect(ctx, cx + 3, headY - 4, 7, 5, '#38E8FF');
    fillPixelRect(ctx, cx - 2, headY - 2, 4, 2, '#0A071A');
  }

  drawExpressivePixelFace(ctx, cx, headY + 2, expression, state, t);

  // Expressive arcade reaction icons (! / ? / frost stars)
  if (expression === 'scared' || state === 'hit') {
    // Brain-freeze pain spark marks on forehead!
    drawPixelText(ctx, '+', cx - 11, headY - headRy - 4, { color: '#FF5D5D', align: 'center', scale: 1 });
    drawPixelText(ctx, '+', cx + 11, headY - headRy - 4, { color: '#FF5D5D', align: 'center', scale: 1 });
    drawPixelText(ctx, '!', cx, headY - headRy - 12, { color: '#38E8FF', align: 'center', scale: 1 });
  } else if (expression === 'surprised') {
    drawPixelText(ctx, '!', cx, headY - headRy - 11, { color: '#FFD23F', align: 'center', scale: 1 });
  }
}

// ============================================================================
// SINGLE PIXEL SCENE COMPOSITOR
// ============================================================================
function renderRetroPixelSingleScene(
  ctx: CanvasRenderingContext2D,
  project: ProjectPlan,
  scene: SceneSpec,
  localTime: number,
  globalTime: number,
  lw: number,
  lh: number,
  allCharacters: CharacterDefinition[],
  allScenarios: ScenarioDefinition[]
): void {
  const progress = scene.duration > 0 ? Math.max(0, Math.min(1, localTime / scene.duration)) : 0;
  const scenario =
    allScenarios.find((s) => s.id === scene.scenarioId) ||
    project.scenarios.find((s) => s.id === scene.scenarioId) ||
    STARTER_SCENARIOS.find((s) => s.theme === 'retro_ice_cream_diner') ||
    STARTER_SCENARIOS[0];

  const charMap = new Map<string, CharacterDefinition>();
  for (const c of [...STARTER_CHARACTERS, ...allCharacters, ...project.characterBible]) {
    charMap.set(c.id, c);
  }

  // Smooth pixel-friendly camera motion (quantized so pixel alignment never jitters destructively)
  const ease = applyEasing(progress, 'ease_in_out');
  const amp = scene.cameraIntensity;
  let panX = 0;
  let zoom = 1;
  if (scene.cameraMove === 'pan' || scene.cameraMove === 'tracking') panX = (ease - 0.5) * 0.25 * amp;
  if (scene.cameraMove === 'dolly_in' || scene.cameraMove === 'zoom') zoom = 1 + ease * 0.14 * amp;
  if (scene.cameraMove === 'dolly_out') zoom = 1.12 - ease * 0.12 * amp;

  ctx.save();
  ctx.imageSmoothingEnabled = false;
  if (Math.abs(zoom - 1) > 0.005) {
    ctx.translate(Math.round(lw / 2), Math.round(lh / 2));
    ctx.scale(zoom, zoom);
    ctx.translate(-Math.round(lw / 2), -Math.round(lh / 2));
  }

  // 1. Multi-layer 16-bit pixel scenario
  drawRetroPixelScenario(ctx, scenario, lw, lh, globalTime, panX);

  const isInfographicFocus =
    scene.sceneVisualMode === 'infographic_focus' && scene.infographic && scene.infographic.kind !== 'none';

  // 2. Animated Scientific Infographic (when scene focuses on explanation cutaway)
  if (scene.infographic && scene.infographic.kind !== 'none') {
    drawRetroPixelInfographic(ctx, scene.infographic, lw, lh, progress, localTime, globalTime);
  }

  // 3. Expressive Pixel Characters (drawn in character_scenario & split_cutaway modes, or stage 0)
  if (!isInfographicFocus || (scene.infographic?.kind === 'brain_nerve_freeze' && scene.infographic.stage === 0)) {
    const sortedActors: SceneActor[] = [...scene.actors].sort((a, b) => a.y - b.y);
    for (const actor of sortedActors) {
      const charDef = charMap.get(actor.characterId);
      if (!charDef) continue;
      const moveT = applyEasing(progress, actor.easing);
      const ax = (actor.x + (actor.targetX - actor.x) * moveT) * lw;
      const ay = (actor.y + (actor.targetY - actor.y) * moveT) * lh;
      const resolved = resolveActorStateAtProgress(actor, progress);
      drawRetroPixelCharacter(
        ctx,
        charDef,
        ax,
        ay,
        actor.scale * (lw >= 240 ? 1.1 : 1.0),
        resolved.state,
        resolved.expression,
        globalTime,
        actor.flipX
      );
    }
  }

  // 4. Crisp Retro Environmental Particles (stars, frost sparks, joy sparkles)
  if (scene.effects.sparks > 0.05 || scene.effects.snow > 0.05) {
    const count = 12;
    for (let i = 0; i < count; i++) {
      const px = Math.round(((i * 31 + globalTime * 16) % (lw - 8)) + 4);
      const py = Math.round(((i * 47 + globalTime * (scene.effects.snow > 0 ? 22 : -14)) % (lh - 16) + (lh - 16)) % (lh - 16) + 8);
      fillPixelRect(ctx, px, py, 2, 2, scene.effects.snow > 0.05 ? '#38E8FF' : '#FFD23F');
    }
  }

  ctx.restore();
}

// ============================================================================
// MASTER RETRO PIXEL EDUCATIONAL FRAME RENDERER (Nearest-Neighbor 6x Blit)
// ============================================================================
export function renderRetroPixelProjectFrame(
  ctx: CanvasRenderingContext2D,
  project: ProjectPlan,
  scene: SceneSpec,
  prevScene: SceneSpec | null,
  sceneStartSec: number,
  localTime: number,
  globalTime: number,
  targetWidth: number,
  targetHeight: number,
  allCharacters: CharacterDefinition[],
  allScenarios: ScenarioDefinition[],
  options?: {
    showSafeArea?: boolean;
    createOffscreenCanvas?: (w: number, h: number) => HTMLCanvasElement;
  }
): void {
  const grid = project.pixelConfig ?? resolvePixelGridForAspectRatio(project.format.aspectRatio);
  const lw = Math.max(120, Math.round(grid.logicalWidth));
  const lh = Math.max(120, Math.round(grid.logicalHeight));

  const mainBuf = getPixelBuffer('main', lw, lh, options?.createOffscreenCanvas);
  if (!mainBuf) return;

  const pctx = mainBuf.ctx;
  pctx.clearRect(0, 0, lw, lh);
  fillPixelRect(pctx, 0, 0, lw, lh, '#0F173A');

  // Render active scene onto native 180x320 pixel grid
  renderRetroPixelSingleScene(pctx, project, scene, localTime, globalTime, lw, lh, allCharacters, allScenarios);

  // Authentic Pixel Art Scene Transitions
  const transDur = Math.min(0.5, scene.duration * 0.22);
  if (localTime < transDur && scene.transitionIn !== 'cut') {
    const t = smoothstep(localTime / Math.max(0.01, transDur));
    if (
      prevScene &&
      (scene.transitionIn === 'pixel_wipe' ||
        scene.transitionIn === 'dither_dissolve' ||
        scene.transitionIn === 'iris_zoom' ||
        scene.transitionIn === 'crossfade' ||
        scene.transitionIn === 'wipe_left')
    ) {
      const prevBuf = getPixelBuffer('prev', lw, lh, options?.createOffscreenCanvas);
      if (prevBuf) {
        prevBuf.ctx.clearRect(0, 0, lw, lh);
        renderRetroPixelSingleScene(
          prevBuf.ctx,
          project,
          prevScene,
          Math.max(0, prevScene.duration - 0.04),
          Math.max(0, sceneStartSec - 0.04),
          lw,
          lh,
          allCharacters,
          allScenarios
        );

        if (scene.transitionIn === 'pixel_wipe' || scene.transitionIn === 'wipe_left') {
          const splitX = Math.round(lw * (1 - t));
          if (splitX > 0) {
            pctx.drawImage(prevBuf.canvas, 0, 0, splitX, lh, 0, 0, splitX, lh);
            fillPixelRect(pctx, splitX, 0, 2, lh, '#FFD23F');
          }
        } else if (scene.transitionIn === 'iris_zoom') {
          // Expanding pixel iris circle from center revealing new scene!
          const maxR = Math.hypot(lw / 2, lh / 2);
          const curR = t * maxR;
          pctx.save();
          pctx.beginPath();
          pctx.rect(0, 0, lw, lh);
          pctx.arc(lw / 2, lh / 2, curR, 0, Math.PI * 2, true);
          pctx.clip();
          pctx.drawImage(prevBuf.canvas, 0, 0);
          pctx.restore();
        } else if (scene.transitionIn === 'dither_dissolve') {
          // Real Bayer 4x4 pixel dissolve!
          const block = 4;
          for (let by = 0; by < lh; by += block) {
            for (let bx = 0; bx < lw; bx += block) {
              if (t < bayerThreshold(bx / block, by / block)) {
                pctx.drawImage(prevBuf.canvas, bx, by, block, block, bx, by, block, block);
              }
            }
          }
        } else {
          pctx.save();
          pctx.globalAlpha = 1 - t;
          pctx.drawImage(prevBuf.canvas, 0, 0);
          pctx.restore();
        }
      }
    } else if (scene.transitionIn === 'fade_black') {
      // Stepped pixel fade
      const alpha = Math.round((1 - t) * 5) / 5;
      pctx.fillStyle = `rgba(10, 7, 26, ${alpha})`;
      pctx.fillRect(0, 0, lw, lh);
    } else if (scene.transitionIn === 'flash_white') {
      const alpha = Math.round((1 - t) * 4) / 8;
      pctx.fillStyle = `rgba(255, 245, 224, ${alpha})`;
      pctx.fillRect(0, 0, lw, lh);
    }
  }

  // Crisp 5x7 Bitmap Pixel Typography Captions (Upper Safe Zone, Mobile-Legible!)
  if (project.captions.enabled && scene.captionText.trim()) {
    const captionTopY = Math.round(lh * (project.captions.positionY < 0.5 ? project.captions.positionY : 0.08));
    drawRetroPixelCaption(
      pctx,
      scene.captionText,
      scene.captionEmphasisWords ?? [],
      localTime,
      lw,
      captionTopY,
      {
        highlightColor: project.captions.highlightColor || '#FFD23F',
        textColor: project.captions.textColor || '#FFFFFF',
      }
    );
  }

  // Blit native pixel buffer onto output canvas using STRICT NEAREST-NEIGHBOR scaling (ZERO BLUR!)
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, targetWidth, targetHeight);
  ctx.drawImage(mainBuf.canvas, 0, 0, lw, lh, 0, 0, targetWidth, targetHeight);
  ctx.restore();

  if (options?.showSafeArea) {
    ctx.save();
    const mx = targetWidth * project.captions.safeAreaMargin;
    const my = targetHeight * 0.06;
    ctx.strokeStyle = 'rgba(255, 210, 63, 0.7)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 4]);
    ctx.strokeRect(mx, my, targetWidth - mx * 2, targetHeight - my * 2);
    ctx.restore();
  }
}
