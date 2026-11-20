import type { InfographicSpec } from '../types/studio';
import {
  bayerThreshold,
  drawDitheredHalo,
  drawPixelArrow,
  drawPixelLine,
  drawPixelShadedEllipse,
  drawPixelText,
  fillPixelRect,
  formatCounterValue,
} from './pixelFontAndPrimitives';

/**
 * Dedicated Animated Scientific Pixel Art Infographics Engine.
 * Draws coherent, stylized 16-bit pixel art diagrams (organs, cells, nerves,
 * molecules, space orbits, circuits, digestive energy, and custom process flows)
 * directly onto the native pixel buffer (e.g., 180x320).
 */

function drawLiveCounter(
  ctx: CanvasRenderingContext2D,
  infographic: InfographicSpec,
  progress: number,
  w: number,
  yTop: number
): void {
  const counter = infographic.liveCounter;
  if (!counter) return;
  const val = counter.startValue + (counter.endValue - counter.startValue) * Math.min(1, Math.max(0, progress));
  const formatted = `${counter.prefix ?? ''}${formatCounterValue(val)}${counter.suffix ?? ''}`;
  const accent = counter.color ?? '#FFD23F';

  // Crisp big arcade numeric display
  drawPixelText(ctx, formatted, w / 2, yTop, {
    color: accent,
    outlineColor: '#0A071A',
    scale: w >= 240 ? 3 : 2,
    align: 'center',
  });
  drawPixelText(ctx, counter.label.toUpperCase(), w / 2, yTop + (w >= 240 ? 24 : 17), {
    color: '#FFE5CC',
    outlineColor: '#0A071A',
    scale: 1,
    align: 'center',
  });
}

function drawCallouts(
  ctx: CanvasRenderingContext2D,
  infographic: InfographicSpec,
  w: number,
  h: number,
  localTime: number
): void {
  const pulse = 0.5 + 0.5 * Math.sin(localTime * 6);
  for (let i = 0; i < infographic.callouts.length; i++) {
    const c = infographic.callouts[i];
    if (localTime < 0.25 + i * 0.18) continue; // Staggered animated reveal
    const cx = Math.round(c.x * w);
    const cy = Math.round(c.y * h);

    if (c.targetX !== undefined && c.targetY !== undefined) {
      const tx = Math.round(c.targetX * w);
      const ty = Math.round(c.targetY * h);
      drawPixelArrow(ctx, cx, cy + 4, tx, ty, c.color);
      // Pulsing highlight pixel dot at target structure
      if (pulse > 0.35) {
        fillPixelRect(ctx, tx - 1, ty - 1, 3, 3, '#FFFFFF');
      }
    }

    const labelText = c.label.toUpperCase();
    const boxW = Math.min(w - 10, labelText.length * 6 + 6);
    const bx = Math.max(4, Math.min(w - boxW - 4, cx - Math.floor(boxW / 2)));
    const by = Math.max(4, Math.min(h - 14, cy - 5));
    fillPixelRect(ctx, bx - 1, by - 1, boxW + 2, 11, '#0A071A');
    fillPixelRect(ctx, bx, by, boxW, 9, '#1A103C');
    fillPixelRect(ctx, bx, by, boxW, 1, c.color);
    drawPixelText(ctx, labelText, bx + 3, by + 1, {
      color: c.color,
      outlineColor: '#0A071A',
      scale: 1,
      align: 'left',
    });
  }
}

/**
 * 1. Brain Freeze / Palate -> Blood Vessels -> Trigeminal Nerve -> Brain -> Referred Pain
 */
function drawBrainNerveFreezeInfographic(
  ctx: CanvasRenderingContext2D,
  stage: number,
  w: number,
  h: number,
  progress: number,
  t: number
): void {
  const cx = Math.round(w * 0.5);

  if (stage === 0) {
    // Stage 0: Subtle glowing zero-sensor icon badge floating above character scene
    drawDitheredHalo(ctx, cx, Math.round(h * 0.28), 26, '#38E8FF', 0.35);
    return;
  }

  if (stage === 1) {
    // Stage 1: Roof of mouth cutaway with animated frost wave & cute shivering tongue + cold scoop
    const mouthTopY = Math.round(h * 0.42);
    // Dark throat cavity
    fillPixelRect(ctx, 0, mouthTopY, w, h - mouthTopY, '#140812');

    // Arched pink palate roof
    for (let x = 0; x < w; x++) {
      const norm = (x - cx) / (w * 0.55);
      const archY = Math.round(mouthTopY + norm * norm * 22);
      fillPixelRect(ctx, x, archY - 12, 1, 14, '#F48FB1');
      fillPixelRect(ctx, x, archY - 14, 1, 3, '#FFCDD2');
      fillPixelRect(ctx, x, archY + 2, 1, 3, '#AD1457');

      // Spreading ice/frost wave along roof of mouth
      const freezeSpread = Math.min(1, progress * 1.35);
      if (Math.abs(norm) < freezeSpread * 0.92) {
        const icicleLen = 3 + ((x * 7 + 3) % 5);
        fillPixelRect(ctx, x, archY - 4, 1, 7, '#38E8FF');
        fillPixelRect(ctx, x, archY - 2, 1, 3, '#E0FBFF');
        if (x % 6 === 0) {
          fillPixelRect(ctx, x, archY + 3, 2, icicleLen, '#7DF3FF');
        }
      }
    }

    // Top blood vessel strip above palate
    fillPixelRect(ctx, 0, Math.round(h * 0.16), w, 16, '#880E2F');
    fillPixelRect(ctx, 0, Math.round(h * 0.16) + 2, w, 12, '#D92B4B');
    for (let i = 0; i < 6; i++) {
      const rx = ((i * 34 + Math.floor(t * 28)) % (w + 16)) - 8;
      drawPixelShadedEllipse(ctx, rx, Math.round(h * 0.16) + 8, 5, 4, {
        base: '#FF5D5D',
        light: '#FF99AC',
        shadow: '#991B36',
        outline: '#4A0E22',
      });
    }

    // Cute pink ice-cream blob touching palate with cold vapor dithering
    const shiver = Math.round(Math.sin(t * 36) * 1.2);
    drawDitheredHalo(ctx, cx + shiver, mouthTopY + 18, 22, '#38E8FF', 0.45);
    drawPixelShadedEllipse(ctx, cx + shiver, mouthTopY + 18, 17, 13, {
      base: '#FF8FB1',
      light: '#FFD1E1',
      shadow: '#C23B6E',
      outline: '#2B0B24',
      specular: '#FFFFFF',
    });
    // Blinking cute eyes on scoop
    fillPixelRect(ctx, cx + shiver - 6, mouthTopY + 16, 2, 3, '#1A103C');
    fillPixelRect(ctx, cx + shiver + 4, mouthTopY + 16, 2, 3, '#1A103C');
    fillPixelRect(ctx, cx + shiver - 2, mouthTopY + 21, 4, 2, '#1A103C');

    // Cute shivering tongue at bottom
    const tongueY = Math.round(h * 0.86);
    drawPixelShadedEllipse(ctx, cx, tongueY + 14, w * 0.48, 38, {
      base: '#FF9EB5',
      light: '#FFD6E0',
      shadow: '#D86382',
      outline: '#4A1228',
    });
    drawPixelLine(ctx, cx, tongueY - 8, cx, h, '#D86382', 1);
    // Worried eyes on tongue
    fillPixelRect(ctx, cx - 15 + shiver, tongueY - 8, 3, 4, '#1A103C');
    fillPixelRect(ctx, cx + 12 + shiver, tongueY - 8, 3, 4, '#1A103C');
    fillPixelRect(ctx, cx - 4, tongueY, 8, 1, '#7D1935');
    return;
  }

  if (stage === 2) {
    // Stage 2: Blood vessels SQUEEZE from cold (0..0.48) then FLOOD WIDE OPEN (0.48..1.0)!
    const squeezePhase = progress < 0.48 ? Math.sin((progress / 0.48) * Math.PI) : 0;
    const expandPhase = progress >= 0.48 ? Math.min(1, (progress - 0.48) / 0.25) : 0;
    const vesselHalfH = Math.round(13 - squeezePhase * 6 + expandPhase * 8);
    const vesselY = Math.round(h * 0.48);

    // Golden nerve root hovering above vessel
    drawPixelLine(ctx, cx, Math.round(h * 0.14), cx, vesselY - vesselHalfH - 12, '#FFD23F', 4);
    drawPixelLine(ctx, cx - 1, Math.round(h * 0.14), cx - 1, vesselY - vesselHalfH - 12, '#FFF3B0', 1);
    // Nerve sensor bulbs
    const sensorXs = [cx - 32, cx, cx + 32];
    for (const sx of sensorXs) {
      drawPixelLine(ctx, cx, vesselY - vesselHalfH - 12, sx, vesselY - vesselHalfH - 4, '#FFD23F', 1);
      drawPixelShadedEllipse(ctx, sx, vesselY - vesselHalfH - 3, 4, 4, {
        base: '#FFD23F',
        light: '#FFF7C2',
        shadow: '#C28200',
        outline: '#1A103C',
      });
      if (expandPhase > 0.4) {
        drawPixelText(ctx, '!', sx, vesselY - vesselHalfH - 16, { color: '#FFD23F', align: 'center', scale: 1 });
      }
    }

    // Blood vessel tube
    fillPixelRect(ctx, 0, vesselY - vesselHalfH - 2, w, vesselHalfH * 2 + 4, '#4A0E22');
    fillPixelRect(ctx, 0, vesselY - vesselHalfH, w, vesselHalfH * 2, squeezePhase > 0.3 ? '#8E3A64' : '#C91F42');
    fillPixelRect(ctx, 0, vesselY - vesselHalfH + 2, w, 3, squeezePhase > 0.3 ? '#B57BA6' : '#F45B7A');

    // Frost sparkles under vessel during squeeze
    if (squeezePhase > 0.2) {
      for (let i = 0; i < 8; i++) {
        const fx = Math.round(((i + 0.5) / 8) * w);
        const fy = vesselY + vesselHalfH + 6 + (i % 2) * 5;
        drawPixelText(ctx, '+', fx, fy, { color: '#38E8FF', align: 'center', scale: 1 });
      }
    }

    // Animated smiling/surprised red blood cells flowing inside vessel
    const speed = expandPhase > 0.2 ? 58 : 24;
    for (let i = 0; i < 7; i++) {
      const rx = ((i * 30 + Math.floor(t * speed)) % (w + 20)) - 10;
      const ry = vesselY + Math.round(Math.sin(t * 5 + i) * Math.max(1, vesselHalfH - 6));
      drawPixelShadedEllipse(ctx, rx, ry, 5, 4, {
        base: '#FF5D5D',
        light: '#FFA6B8',
        shadow: '#991B36',
        outline: '#3A0918',
      });
      fillPixelRect(ctx, rx - 2, ry - 1, 1, 1, '#1A103C');
      fillPixelRect(ctx, rx + 1, ry - 1, 1, 1, '#1A103C');
    }

    // Cold mouth roof visible below for spatial continuity
    fillPixelRect(ctx, 0, Math.round(h * 0.84), w, h, '#38E8FF');
    fillPixelRect(ctx, 0, Math.round(h * 0.87), w, h, '#FF8FB1');
    return;
  }

  if (stage === 3) {
    // Stage 3: Golden Trigeminal Nerve vertical climb with electric lightning alarm rushing UP!
    const topY = Math.round(h * 0.08);
    const botY = Math.round(h * 0.82);

    // Wavy golden nerve trunk
    for (let y = topY; y <= botY; y++) {
      const waveX = cx + Math.round(Math.sin(y * 0.045) * 6);
      fillPixelRect(ctx, waveX - 4, y, 8, 1, '#4A2B00');
      fillPixelRect(ctx, waveX - 3, y, 6, 1, '#EAB308');
      fillPixelRect(ctx, waveX - 2, y, 2, 1, '#FFF3B0');
      if (y % 14 === 0) {
        fillPixelRect(ctx, waveX - 3, y, 6, 2, '#B45309'); // myelin segment node
      }
    }

    // Base vessel anchor at bottom
    fillPixelRect(ctx, 0, botY + 6, w, 16, '#B81D3A');
    fillPixelRect(ctx, 0, botY + 8, w, 3, '#FF5D5D');

    // Electric lightning impulse rushing upward!
    const pulseY = Math.round(botY - progress * (botY - topY - 12));
    const pulseX = cx + Math.round(Math.sin(pulseY * 0.045) * 6);
    drawDitheredHalo(ctx, pulseX, pulseY, 24, '#FFD23F', 0.85);
    drawDitheredHalo(ctx, pulseX, pulseY, 12, '#FFFFFF', 0.9);
    // Cute lightning bolt character
    drawPixelLine(ctx, pulseX + 4, pulseY - 10, pulseX - 3, pulseY, '#FFFFFF', 3);
    drawPixelLine(ctx, pulseX - 3, pulseY, pulseX + 4, pulseY + 2, '#FFD23F', 3);
    drawPixelLine(ctx, pulseX + 4, pulseY + 2, pulseX - 4, pulseY + 12, '#FFFFFF', 2);
    // Determined eyes on lightning bolt
    fillPixelRect(ctx, pulseX - 2, pulseY - 4, 2, 2, '#1A103C');
    fillPixelRect(ctx, pulseX + 2, pulseY - 4, 2, 2, '#1A103C');
    return;
  }

  // Stage 4: Expressive Pink Pixel Brain with sulci + blinking eyes receiving alarm and blaming forehead!
  const brainY = Math.round(h * 0.48);
  // Nerve stem entering from bottom
  for (let y = brainY + 16; y < h; y++) {
    const wx = cx + Math.round(Math.sin(y * 0.06) * 3);
    fillPixelRect(ctx, wx - 2, y, 5, 1, '#FFD23F');
    fillPixelRect(ctx, wx - 1, y, 2, 1, '#FFF7C2');
  }
  drawDitheredHalo(ctx, cx, brainY + 20, 18, '#FFD23F', 0.65);

  // Cerebellum lobe
  drawPixelShadedEllipse(ctx, cx + 24, brainY + 14, 13, 10, {
    base: '#E87EA1',
    light: '#FFB3CA',
    shadow: '#9E375C',
    outline: '#2B0B24',
  });
  for (let i = -6; i <= 6; i += 3) {
    drawPixelLine(ctx, cx + 14, brainY + 14 + i, cx + 34, brainY + 14 + i, '#9E375C', 1);
  }

  // Main expressive brain hemisphere
  const bounce = Math.round(Math.sin(t * 6) * 2);
  drawPixelShadedEllipse(ctx, cx - 2, brainY + bounce, 36, 26, {
    base: '#FF8FB1',
    light: '#FFC2D4',
    shadow: '#C94B77',
    outline: '#2B0B24',
    specular: '#FFE5EE',
  });

  // Pixel brain sulci folds
  drawPixelLine(ctx, cx - 26, brainY - 6 + bounce, cx - 10, brainY - 14 + bounce, '#AD3360', 2);
  drawPixelLine(ctx, cx + 4, brainY - 18 + bounce, cx + 22, brainY - 8 + bounce, '#AD3360', 2);
  drawPixelLine(ctx, cx - 16, brainY + 10 + bounce, cx + 14, brainY + 6 + bounce, '#AD3360', 2);
  drawPixelLine(ctx, cx + 12, brainY - 4 + bounce, cx + 26, brainY + 6 + bounce, '#AD3360', 2);

  // Expressive surprised eyes & "?" floating above brain
  const blink = Math.sin(t * 2.4) > 0.94;
  if (blink) {
    fillPixelRect(ctx, cx - 18, brainY - 2 + bounce, 6, 2, '#1A103C');
    fillPixelRect(ctx, cx - 4, brainY - 2 + bounce, 6, 2, '#1A103C');
  } else {
    fillPixelRect(ctx, cx - 17, brainY - 5 + bounce, 5, 6, '#1A103C');
    fillPixelRect(ctx, cx - 16, brainY - 4 + bounce, 2, 2, '#FFFFFF');
    fillPixelRect(ctx, cx - 3, brainY - 5 + bounce, 5, 6, '#1A103C');
    fillPixelRect(ctx, cx - 2, brainY - 4 + bounce, 2, 2, '#FFFFFF');
  }
  // Small surprised 'o' mouth
  fillPixelRect(ctx, cx - 9, brainY + 5 + bounce, 4, 4, '#590D22');
  fillPixelRect(ctx, cx - 8, brainY + 6 + bounce, 2, 2, '#FF4F9A');

  drawPixelText(ctx, '?', cx - 4, brainY - 38 + Math.round(Math.sin(t * 5) * 2), {
    color: '#FFD23F',
    scale: 2,
    align: 'center',
  });
}

/**
 * 2. Bloodstream & Bone Marrow Red Blood Cell Cycle (Bone Cutaway -> Nucleus Eject -> Capillary Fold -> 120 Days -> Spleen Fe Recycle)
 */
function drawBloodstreamCellsInfographic(
  ctx: CanvasRenderingContext2D,
  stage: number,
  w: number,
  h: number,
  progress: number,
  t: number
): void {
  const cx = Math.round(w * 0.5);

  if (stage === 0) {
    // Bone cross-section cutaway emitting blood cells
    const boneCx = Math.round(w * 0.44);
    const boneCy = Math.round(h * 0.52);
    // Bone shaft
    drawPixelLine(ctx, boneCx - 18, h, boneCx + 2, boneCy, '#F3E5AB', 24);
    drawPixelLine(ctx, boneCx - 24, h, boneCx - 4, boneCy, '#FFF9E2', 6);
    drawPixelLine(ctx, boneCx - 8, h, boneCx + 12, boneCy, '#C9B27A', 6);
    // Bone head with marrow window
    drawPixelShadedEllipse(ctx, boneCx + 6, boneCy - 8, 28, 25, {
      base: '#F3E5AB',
      light: '#FFFDF0',
      shadow: '#BFA66B',
      outline: '#2B1E12',
    });
    // Cutaway marrow core
    drawPixelShadedEllipse(ctx, boneCx + 8, boneCy - 8, 17, 15, {
      base: '#B8332A',
      light: '#E85D3F',
      shadow: '#66111B',
      outline: '#2B0910',
    });
    // Vessel spout curving right & pouring red blood cells
    drawPixelLine(ctx, boneCx + 20, boneCy - 4, w - 16, boneCy + 34, '#A61C3C', 10);
    drawPixelLine(ctx, boneCx + 20, boneCy - 4, w - 16, boneCy + 34, '#E83B5C', 6);
    for (let i = 0; i < 6; i++) {
      const p = (progress * 1.8 + i / 6) % 1;
      const rx = Math.round(boneCx + 22 + p * (w - boneCx - 28));
      const ry = Math.round(boneCy - 4 + p * 74 + Math.sin(p * 6) * 5);
      drawPixelShadedEllipse(ctx, rx, ry, 7, 5, {
        base: '#FF4F5E',
        light: '#FFA6B0',
        shadow: '#99142B',
        outline: '#360612',
      });
    }
    return;
  }

  if (stage === 1) {
    // Bone marrow chamber: baby purple/pink cell ejecting its nucleus to make room for O2!
    fillPixelRect(ctx, 14, 24, w - 28, h - 48, '#A63A24');
    // Warm dithered marrow dots
    for (let i = 0; i < 36; i++) {
      const dx = 18 + ((i * 47) % (w - 36));
      const dy = 34 + ((i * 71) % (h - 68));
      fillPixelRect(ctx, dx, dy, 3, 3, i % 2 === 0 ? '#5C1824' : '#7A2433');
    }
    // Central nurse macrophage
    drawPixelShadedEllipse(ctx, cx, Math.round(h * 0.6), 28, 24, {
      base: '#F5B89E',
      light: '#FFE0D1',
      shadow: '#C2745A',
      outline: '#3D1518',
    });
    fillPixelRect(ctx, cx - 6, Math.round(h * 0.6) - 2, 2, 3, '#1A103C');
    fillPixelRect(ctx, cx + 4, Math.round(h * 0.6) - 2, 2, 3, '#1A103C');
    fillPixelRect(ctx, cx - 2, Math.round(h * 0.6) + 4, 4, 1, '#5C1824');

    // Baby cell orbiting at top & ejecting blue nucleus!
    const cellX = cx + 8;
    const cellY = Math.round(h * 0.44);
    const isRed = progress > 0.45;
    drawPixelShadedEllipse(ctx, cellX, cellY, 12, 10, {
      base: isRed ? '#FF5D5D' : '#8E88F0',
      light: isRed ? '#FFA6B8' : '#C7C4FF',
      shadow: isRed ? '#A61B38' : '#4E47A3',
      outline: '#1A103C',
    });
    fillPixelRect(ctx, cellX - 4, cellY - 1, 2, 2, '#1A103C');
    fillPixelRect(ctx, cellX + 2, cellY - 1, 2, 2, '#1A103C');

    // Ejected nucleus flying up-left!
    const nucDist = Math.round(progress * 36);
    drawPixelShadedEllipse(ctx, cellX - 6 - nucDist * 0.7, cellY - 6 - nucDist * 0.45, 5, 5, {
      base: '#38E8FF',
      light: '#B5F8FF',
      shadow: '#1D6FA5',
      outline: '#0A071A',
    });
    return;
  }

  if (stage === 2) {
    // Capillary squeeze + dropping glowing O2 bubbles!
    const pipeHalfW = 11;
    // Vertical muscle/tissue fibers on sides
    for (let x = 8; x < cx - pipeHalfW - 4; x += 8) {
      fillPixelRect(ctx, x, Math.round(h * 0.25), 6, Math.round(h * 0.56), '#C97B70');
      fillPixelRect(ctx, x + 1, Math.round(h * 0.25), 2, Math.round(h * 0.56), '#F5B5AA');
    }
    for (let x = cx + pipeHalfW + 6; x < w - 8; x += 8) {
      fillPixelRect(ctx, x, Math.round(h * 0.25), 6, Math.round(h * 0.56), '#C97B70');
      fillPixelRect(ctx, x + 1, Math.round(h * 0.25), 2, Math.round(h * 0.56), '#F5B5AA');
    }

    // Narrow capillary pipe in center
    fillPixelRect(ctx, cx - pipeHalfW - 2, 0, pipeHalfW * 2 + 4, h, '#4A0E22');
    fillPixelRect(ctx, cx - pipeHalfW, 0, pipeHalfW * 2, h, '#8E1D39');
    fillPixelRect(ctx, cx - pipeHalfW + 2, 0, 2, h, '#D94366');

    // Folded cute red blood cell squeezing upward
    const cellY = Math.round(h * 0.76 - progress * h * 0.44);
    drawPixelShadedEllipse(ctx, cx, cellY, 6, 12, {
      base: '#FF5D5D',
      light: '#FFB5C2',
      shadow: '#A61B38',
      outline: '#2B0814',
    });
    fillPixelRect(ctx, cx - 2, cellY - 2, 1, 2, '#1A103C');
    fillPixelRect(ctx, cx + 1, cellY - 2, 1, 2, '#1A103C');

    // O2 molecules drifting out to surrounding tissue
    const o2Offset = Math.round(Math.max(0, progress - 0.35) * 44);
    if (o2Offset > 0) {
      drawDitheredHalo(ctx, cx + 14 + o2Offset * 0.5, cellY + 4, 10, '#38E8FF', 0.65);
      drawPixelShadedEllipse(ctx, cx + 14 + o2Offset * 0.5, cellY + 4, 3, 3, {
        base: '#38E8FF',
        light: '#FFFFFF',
        shadow: '#0284C7',
        outline: '#0A071A',
      });
      drawPixelShadedEllipse(ctx, cx + 19 + o2Offset * 0.5, cellY + 4, 3, 3, {
        base: '#38E8FF',
        light: '#FFFFFF',
        shadow: '#0284C7',
        outline: '#0A071A',
      });
    }
    return;
  }

  if (stage === 3) {
    // Highway bloodstream with 120-day counter & hero cell with glowing dither aura
    const tubeHalfW = Math.round(w * 0.24);
    fillPixelRect(ctx, cx - tubeHalfW - 3, 0, tubeHalfW * 2 + 6, h, '#4A0E22');
    fillPixelRect(ctx, cx - tubeHalfW, 0, tubeHalfW * 2, h, '#871836');

    for (let i = 0; i < 12; i++) {
      const rx = cx - tubeHalfW + 8 + ((i * 29) % (tubeHalfW * 2 - 16));
      const ry = ((Math.round(i * 34 + t * 90) % (h + 24)) + (h + 24)) % (h + 24) - 12;
      drawPixelShadedEllipse(ctx, rx, ry, 6, 4, {
        base: '#D92B4B',
        light: '#FF758F',
        shadow: '#7D1229',
        outline: '#2B0610',
      });
    }

    // Hero RBC in center getting slightly tired/sweaty near day 120
    const heroY = Math.round(h * 0.56);
    drawDitheredHalo(ctx, cx, heroY, 20, '#FFD23F', 0.55);
    drawPixelShadedEllipse(ctx, cx, heroY, 12, 12, {
      base: '#FF5D5D',
      light: '#FFB5C2',
      shadow: '#99142B',
      outline: '#2B0610',
    });
    fillPixelRect(ctx, cx - 4, heroY - 2, 2, 2, '#1A103C');
    fillPixelRect(ctx, cx + 2, heroY - 2, 2, 2, '#1A103C');
    if (progress > 0.65) {
      // Cute pixel sweat drop
      fillPixelRect(ctx, cx + 9, heroY - 6, 2, 4, '#38E8FF');
    }
    return;
  }

  // Stage 4: Spleen filter bars & macrophage recycling golden Fe iron orbs!
  const slitY = Math.round(h * 0.44);
  for (let x = 6; x < w - 6; x += 14) {
    drawPixelShadedEllipse(ctx, x + 5, slitY, 5, 16, {
      base: '#E8B8A8',
      light: '#FFE5DC',
      shadow: '#A66F60',
      outline: '#361316',
    });
  }
  // Friendly macrophage below slits recycling golden Fe orbs upward
  drawPixelShadedEllipse(ctx, cx, slitY + 34, 24, 20, {
    base: '#F5B89E',
    light: '#FFE0D1',
    shadow: '#B86B52',
    outline: '#3D1518',
  });
  fillPixelRect(ctx, cx - 5, slitY + 30, 2, 3, '#1A103C');
  fillPixelRect(ctx, cx + 4, slitY + 30, 2, 3, '#1A103C');

  for (let i = 0; i < 5; i++) {
    const p = (progress * 1.4 + i * 0.16) % 1;
    const fx = cx + Math.round(Math.sin(i * 2.1 + t * 3) * 8);
    const fy = Math.round(slitY + 26 - p * 82);
    drawDitheredHalo(ctx, fx, fy, 8, '#FFD23F', 0.7);
    drawPixelShadedEllipse(ctx, fx, fy, 4, 4, {
      base: '#FFD23F',
      light: '#FFFFFF',
      shadow: '#B45309',
      outline: '#1A103C',
    });
  }
}

/**
 * 3. Solar / Black Hole Relativistic Orbit Infographic
 */
function drawSolarOrbitInfographic(
  ctx: CanvasRenderingContext2D,
  stage: number,
  w: number,
  h: number,
  progress: number,
  t: number
): void {
  const cx = Math.round(w * 0.5);
  const cy = Math.round(h * 0.52);

  // Gravitational grid distortion lines
  for (let gx = 12; gx < w; gx += 18) {
    drawPixelLine(ctx, gx, Math.round(h * 0.28), gx, Math.round(h * 0.82), '#241854', 1);
  }
  for (let gy = Math.round(h * 0.28); gy < Math.round(h * 0.82); gy += 18) {
    drawPixelLine(ctx, 8, gy, w - 8, gy, '#241854', 1);
  }

  if (stage === 0) {
    // Jupiter & 4 Galilean moons orbiting cleanly
    drawDitheredHalo(ctx, cx, cy, 42, '#FFD23F', 0.45);
    drawPixelShadedEllipse(ctx, cx, cy, 24, 24, {
      base: '#E89B5A',
      light: '#FFE5CC',
      shadow: '#9E4C24',
      outline: '#1A103C',
    });
    // Jupiter cloud bands
    fillPixelRect(ctx, cx - 20, cy - 8, 40, 4, '#C9683A');
    fillPixelRect(ctx, cx - 22, cy + 4, 44, 4, '#FFD23F');
    for (let m = 0; m < 4; m++) {
      const ang = t * (1.2 + m * 0.35) + m * 1.5;
      const radX = 36 + m * 11;
      const radY = 12 + m * 4;
      const mx = Math.round(cx + Math.cos(ang) * radX);
      const my = Math.round(cy + Math.sin(ang) * radY);
      drawPixelShadedEllipse(ctx, mx, my, 4, 4, {
        base: '#38E8FF',
        light: '#FFFFFF',
        shadow: '#1D4ED8',
        outline: '#0A071A',
      });
    }
    return;
  }

  // Black hole accretion disk + event horizon + relativistic clock
  drawDitheredHalo(ctx, cx, cy, 52, '#FF4F9A', 0.65);
  drawDitheredHalo(ctx, cx, cy, 36, '#FFD23F', 0.78);
  // Tilted accretion disk ellipse
  for (let a = 0; a < 64; a++) {
    const theta = (a / 64) * Math.PI * 2 + t * 2.2;
    const rx = Math.round(cx + Math.cos(theta) * 48);
    const ry = Math.round(cy + Math.sin(theta) * 14);
    fillPixelRect(ctx, rx - 1, ry - 1, 3, 2, a % 3 === 0 ? '#FFFFFF' : a % 2 === 0 ? '#FFD23F' : '#FF4F9A');
  }
  // Event horizon pitch-black core
  drawPixelShadedEllipse(ctx, cx, cy, 20, 20, {
    base: '#060412',
    light: '#140B2E',
    shadow: '#03020A',
    outline: '#FF4F9A',
  });

  // Orbiting pixel clock comparing time dilation in stage 2
  if (stage >= 2) {
    const clockX = cx + 44;
    const clockY = cy - 34;
    drawPixelShadedEllipse(ctx, clockX, clockY, 13, 13, {
      base: '#FFE5CC',
      light: '#FFFFFF',
      shadow: '#BFA694',
      outline: '#38E8FF',
    });
    const handAngle = progress * Math.PI * 2;
    drawPixelLine(
      ctx,
      clockX,
      clockY,
      clockX + Math.cos(handAngle) * 8,
      clockY + Math.sin(handAngle) * 8,
      '#FF4F9A',
      2
    );
  }
}

/**
 * 4. Circuit Flow / Microchip Transistors 0 & 1 Infographic
 */
function drawCircuitFlowInfographic(
  ctx: CanvasRenderingContext2D,
  stage: number,
  w: number,
  h: number,
  _progress: number,
  t: number
): void {
  const cx = Math.round(w * 0.5);
  const cy = Math.round(h * 0.54);

  // PCB copper traces
  const lanes = [-36, -12, 12, 36];
  for (let i = 0; i < lanes.length; i++) {
    const ly = cy + lanes[i];
    drawPixelLine(ctx, 10, ly, w - 10, ly, '#1D4E7A', 2);
    // Moving binary data packets (0/1)
    const pxPos = Math.round(((t * (42 + i * 9) + i * 33) % (w - 24)) + 12);
    const bitVal = Math.floor(t * 3 + i) % 2 === 0 ? '1' : '0';
    drawDitheredHalo(ctx, pxPos, ly, 7, bitVal === '1' ? '#38E8FF' : '#FF4F9A', 0.7);
    drawPixelText(ctx, bitVal, pxPos, ly - 3, {
      color: bitVal === '1' ? '#38E8FF' : '#FFD23F',
      align: 'center',
      scale: 1,
    });
  }

  // Central Silicon CPU Die
  const boxSize = stage >= 2 ? 46 : 38;
  const half = Math.floor(boxSize / 2);
  drawDitheredHalo(ctx, cx, cy, half + 16, '#38E8FF', 0.55);
  fillPixelRect(ctx, cx - half - 2, cy - half - 2, boxSize + 4, boxSize + 4, '#FFD23F');
  fillPixelRect(ctx, cx - half, cy - half, boxSize, boxSize, '#0F173A');
  // Metallic pins
  for (let p = -half + 4; p <= half - 6; p += 7) {
    fillPixelRect(ctx, cx + p, cy - half - 6, 3, 4, '#FFD23F');
    fillPixelRect(ctx, cx + p, cy + half + 2, 3, 4, '#FFD23F');
  }
  drawPixelText(ctx, stage >= 2 ? 'ALU' : 'CPU', cx, cy - 4, {
    color: '#5EEAD4',
    scale: 2,
    align: 'center',
  });
}

/**
 * 5. Molecule Reaction / Photosynthesis / Chemical Process Infographic
 */
function drawMoleculeReactionInfographic(
  ctx: CanvasRenderingContext2D,
  stage: number,
  w: number,
  h: number,
  _progress: number,
  t: number
): void {
  const cx = Math.round(w * 0.5);
  const cy = Math.round(h * 0.54);

  // Chloroplast / Reaction Chamber capsule
  drawPixelShadedEllipse(ctx, cx, cy, 52, 36, {
    base: '#1E7A56',
    light: '#34D399',
    shadow: '#0D4532',
    outline: '#0A071A',
  });

  // Animated photon rays from top-left
  for (let i = 0; i < 4; i++) {
    const p = ((t * 1.4 + i * 0.25) % 1);
    const rx = Math.round(24 + p * (cx - 24));
    const ry = Math.round(h * 0.28 + p * (cy - h * 0.28));
    drawDitheredHalo(ctx, rx, ry, 8, '#FFD23F', 0.75);
    fillPixelRect(ctx, rx - 2, ry - 2, 4, 4, '#FFF7C2');
  }

  // Molecules inside reaction chamber (H2O + CO2 -> Glucose + O2)
  const bob = Math.round(Math.sin(t * 4) * 3);
  if (stage <= 1) {
    drawPixelShadedEllipse(ctx, cx - 18, cy + bob, 9, 9, {
      base: '#38E8FF',
      light: '#E0FBFF',
      shadow: '#0284C7',
      outline: '#0A071A',
    });
    drawPixelText(ctx, 'H2O', cx - 18, cy + 12 + bob, { color: '#38E8FF', align: 'center', scale: 1 });
    drawPixelShadedEllipse(ctx, cx + 18, cy - bob, 9, 9, {
      base: '#FF4F9A',
      light: '#FFC2DD',
      shadow: '#9D174D',
      outline: '#0A071A',
    });
    drawPixelText(ctx, 'CO2', cx + 18, cy + 12 - bob, { color: '#FF4F9A', align: 'center', scale: 1 });
  } else {
    // Golden Glucose Hexagon + rising O2 bubbles!
    drawDitheredHalo(ctx, cx, cy, 24, '#FFD23F', 0.7);
    drawPixelShadedEllipse(ctx, cx, cy + bob, 16, 14, {
      base: '#FFD23F',
      light: '#FFF7C2',
      shadow: '#B45309',
      outline: '#1A103C',
    });
    drawPixelText(ctx, 'C6H12', cx, cy - 3 + bob, { color: '#1A103C', outlineColor: '#FFD23F', align: 'center', scale: 1 });

    for (let b = 0; b < 4; b++) {
      const bp = (t * 0.8 + b * 0.25) % 1;
      const bx = cx - 24 + b * 16;
      const by = Math.round(cy - 18 - bp * 54);
      drawPixelShadedEllipse(ctx, bx, by, 5, 5, {
        base: '#38E8FF',
        light: '#FFFFFF',
        shadow: '#0284C7',
        outline: '#0A071A',
      });
    }
  }
}

/**
 * 6. Neural Network & Synapse Plasticity Infographic
 */
function drawNeuralNetworkInfographic(
  ctx: CanvasRenderingContext2D,
  stage: number,
  w: number,
  h: number,
  _progress: number,
  t: number
): void {
  const nodes = [
    { x: Math.round(w * 0.24), y: Math.round(h * 0.44) },
    { x: Math.round(w * 0.76), y: Math.round(h * 0.42) },
    { x: Math.round(w * 0.5), y: Math.round(h * 0.56) },
    { x: Math.round(w * 0.28), y: Math.round(h * 0.74) },
    { x: Math.round(w * 0.74), y: Math.round(h * 0.72) },
  ];
  const edges = [
    [0, 2],
    [1, 2],
    [2, 3],
    [2, 4],
    [0, 1],
  ];

  const thickness = stage >= 2 ? 3 : 2;
  for (let i = 0; i < edges.length; i++) {
    const a = nodes[edges[i][0]];
    const b = nodes[edges[i][1]];
    drawPixelLine(ctx, a.x, a.y, b.x, b.y, stage >= 2 ? '#FF4F9A' : '#38E8FF', thickness);
    const p = (t * 1.5 + i * 0.2) % 1;
    const sx = Math.round(a.x + (b.x - a.x) * p);
    const sy = Math.round(a.y + (b.y - a.y) * p);
    drawDitheredHalo(ctx, sx, sy, 9, '#FFD23F', 0.8);
    fillPixelRect(ctx, sx - 2, sy - 2, 4, 4, '#FFFFFF');
  }

  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    drawDitheredHalo(ctx, n.x, n.y, 14, i === 2 ? '#FF4F9A' : '#38E8FF', 0.55);
    drawPixelShadedEllipse(ctx, n.x, n.y, i === 2 ? 12 : 9, i === 2 ? 12 : 9, {
      base: i === 2 ? '#FF4F9A' : '#38E8FF',
      light: '#FFFFFF',
      shadow: '#1A103C',
      outline: '#0A071A',
    });
  }
}

/**
 * 7. Nutrition -> Enzymes -> Mitochondria ATP Energy Infographic
 */
function drawNutritionEnergyInfographic(
  ctx: CanvasRenderingContext2D,
  stage: number,
  w: number,
  h: number,
  progress: number,
  t: number
): void {
  const cx = Math.round(w * 0.5);
  const cy = Math.round(h * 0.54);

  if (stage <= 1) {
    // Food particle broken down into glucose gems by golden enzyme sparks
    drawPixelShadedEllipse(ctx, cx - 26, cy, 16, 14, {
      base: '#F8B88B',
      light: '#FFE5CC',
      shadow: '#B97848',
      outline: '#2B150A',
    });
    drawPixelArrow(ctx, cx - 6, cy, cx + 12, cy, '#FFD23F');
    for (let i = 0; i < 4; i++) {
      const gx = cx + 22 + (i % 2) * 14;
      const gy = cy - 10 + Math.floor(i / 2) * 18 + Math.round(Math.sin(t * 6 + i) * 2);
      drawPixelShadedEllipse(ctx, gx, gy, 6, 6, {
        base: '#FFD23F',
        light: '#FFFFFF',
        shadow: '#B45309',
        outline: '#1A103C',
      });
    }
    return;
  }

  // Mitochondria powerhouse generating pulsing ATP battery bar
  drawDitheredHalo(ctx, cx, cy, 42, '#FFD23F', 0.5);
  drawPixelShadedEllipse(ctx, cx, cy, 44, 24, {
    base: '#FF5D5D',
    light: '#FFA6A6',
    shadow: '#9E1F32',
    outline: '#1A103C',
  });
  // Inner cristae folds
  for (let x = cx - 28; x <= cx + 24; x += 10) {
    drawPixelLine(ctx, x, cy - 10, x + 5, cy + 10, '#FFD23F', 2);
  }
  // Charging ATP pixel meter below
  const barW = 76;
  const bx = cx - Math.floor(barW / 2);
  const by = cy + 34;
  fillPixelRect(ctx, bx - 2, by - 2, barW + 4, 14, '#0A071A');
  fillPixelRect(ctx, bx, by, barW, 10, '#1A103C');
  fillPixelRect(ctx, bx + 1, by + 1, Math.round((barW - 2) * Math.min(1, 0.25 + progress * 0.75)), 8, '#5EEAD4');
  drawPixelText(ctx, 'ATP', cx, by + 1, { color: '#1A103C', outlineColor: '#5EEAD4', align: 'center', scale: 1 });
}

/**
 * 8. Generic Scientific Process Diagram / Organ Zoom (works cleanly for any custom user topic!)
 */
function drawGenericProcessDiagram(
  ctx: CanvasRenderingContext2D,
  infographic: InfographicSpec,
  w: number,
  h: number,
  progress: number,
  t: number
): void {
  const nodes =
    infographic.diagramNodes && infographic.diagramNodes.length >= 2
      ? infographic.diagramNodes.slice(0, 3)
      : ['ESTIMULO', 'PROCESSO', 'RESULTADO'];
  const cx = Math.round(w * 0.5);
  const startY = Math.round(h * 0.38);
  const gap = Math.round(h * 0.18);
  const activeIdx = Math.min(nodes.length - 1, Math.floor(progress * nodes.length));

  nodes.forEach((label, idx) => {
    const ny = startY + idx * gap;
    const isActive = idx === activeIdx;
    const boxW = Math.min(w - 28, Math.max(82, label.length * 6 + 18));
    const bx = cx - Math.floor(boxW / 2);

    if (isActive) {
      drawDitheredHalo(ctx, cx, ny, 28, infographic.accentColor, 0.45);
    }

    fillPixelRect(ctx, bx - 2, ny - 11, boxW + 4, 22, '#0A071A');
    fillPixelRect(ctx, bx, ny - 9, boxW, 18, isActive ? '#2D1A66' : '#161138');
    fillPixelRect(ctx, bx, ny - 9, boxW, 2, isActive ? '#FFD23F' : infographic.accentColor);

    drawPixelText(ctx, label.toUpperCase().slice(0, 18), cx, ny - 3, {
      color: isActive ? '#FFD23F' : '#FFE5CC',
      outlineColor: '#0A071A',
      align: 'center',
      scale: 1,
    });

    if (idx < nodes.length - 1) {
      const pulseY = Math.round(ny + 12 + ((t * 24) % Math.max(8, gap - 26)));
      drawPixelArrow(ctx, cx, ny + 12, cx, ny + gap - 13, '#38E8FF');
      fillPixelRect(ctx, cx - 1, pulseY, 3, 3, '#FFD23F');
    }
  });
}

/**
 * Main entry point: renders the scene's animated pixel art scientific infographic
 * directly onto the native pixel buffer.
 */
export function drawRetroPixelInfographic(
  ctx: CanvasRenderingContext2D,
  infographic: InfographicSpec | undefined,
  logicalW: number,
  logicalH: number,
  progress: number,
  localTime: number,
  globalTime: number
): void {
  if (!infographic || infographic.kind === 'none') return;

  // Optional subtle pixel dithered vignette behind diagram focus
  const topSafe = Math.round(logicalH * 0.24);
  if (infographic.kind !== 'brain_nerve_freeze' || infographic.stage > 0) {
    // Draw subtle animated scan/star dust inside infographic field
    for (let i = 0; i < 14; i++) {
      const sx = ((i * 37 + Math.floor(globalTime * 5)) % (logicalW - 8)) + 4;
      const sy = ((i * 53) % (logicalH - 40)) + 20;
      if (bayerThreshold(sx, sy + Math.floor(globalTime * 4)) > 0.5) {
        fillPixelRect(ctx, sx, sy, 1, 1, 'rgba(255, 229, 204, 0.35)');
      }
    }
  }

  switch (infographic.kind) {
    case 'brain_nerve_freeze':
      drawBrainNerveFreezeInfographic(ctx, infographic.stage, logicalW, logicalH, progress, globalTime);
      break;
    case 'bloodstream_cells':
    case 'bone_marrow_cycle':
      drawBloodstreamCellsInfographic(ctx, infographic.stage, logicalW, logicalH, progress, globalTime);
      break;
    case 'solar_orbit':
      drawSolarOrbitInfographic(ctx, infographic.stage, logicalW, logicalH, progress, globalTime);
      break;
    case 'circuit_flow':
      drawCircuitFlowInfographic(ctx, infographic.stage, logicalW, logicalH, progress, globalTime);
      break;
    case 'molecule_reaction':
      drawMoleculeReactionInfographic(ctx, infographic.stage, logicalW, logicalH, progress, globalTime);
      break;
    case 'neural_network':
      drawNeuralNetworkInfographic(ctx, infographic.stage, logicalW, logicalH, progress, globalTime);
      break;
    case 'nutrition_energy':
      drawNutritionEnergyInfographic(ctx, infographic.stage, logicalW, logicalH, progress, globalTime);
      break;
    case 'organ_zoom':
    case 'process_diagram':
    default:
      drawGenericProcessDiagram(ctx, infographic, logicalW, logicalH, progress, globalTime);
      break;
  }

  // Animated live counter (e.g. 2,400,000 or DIA 1 -> 120)
  drawLiveCounter(ctx, infographic, progress, logicalW, topSafe);

  // Staggered callout tags with pixel arrows
  drawCallouts(ctx, infographic, logicalW, logicalH, localTime);
}
