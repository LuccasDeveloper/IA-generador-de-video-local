import type {
  CameraMove,
  CharacterDefinition,
  FramingType,
  PerformanceProfile,
  ProjectPlan,
  ScenarioDefinition,
  ScenarioProp,
  SceneActor,
  SceneSpec,
} from '../types/studio';
import { PERFORMANCE_LIMITS, STARTER_CHARACTERS, STARTER_SCENARIOS } from '../data/presets';
import {
  applyEasing,
  drawArticulatedCharacter,
  getCachedImage,
  resolveActorStateAtProgress,
} from './characterRenderer';
import { drawWordByWordCaption } from './captionsEngine';
import { renderRetroPixelProjectFrame } from './retroPixelRenderer';

interface CameraTransform {
  zoom: number;
  panX: number; // -1..1 normalized shift
  panY: number;
  tiltDeg: number;
}

// Reusable lightweight offscreen buffer for real dual-frame crossfade / wipe transitions
let transitionBufferCanvas: HTMLCanvasElement | null = null;
function getTransitionBuffer(
  width: number,
  height: number,
  createOffscreenCanvas?: (w: number, h: number) => HTMLCanvasElement
): CanvasRenderingContext2D | null {
  if (createOffscreenCanvas) {
    if (!transitionBufferCanvas || transitionBufferCanvas.width !== width || transitionBufferCanvas.height !== height) {
      transitionBufferCanvas = createOffscreenCanvas(width, height);
    }
    return transitionBufferCanvas.getContext('2d');
  }
  if (typeof document === 'undefined') return null;
  if (!transitionBufferCanvas) {
    transitionBufferCanvas = document.createElement('canvas');
  }
  if (transitionBufferCanvas.width !== width || transitionBufferCanvas.height !== height) {
    transitionBufferCanvas.width = width;
    transitionBufferCanvas.height = height;
  }
  return transitionBufferCanvas.getContext('2d');
}

function smoothstep(t: number): number {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
}

function applySingleCameraMove(
  move: CameraMove,
  amp: number,
  progress: number,
  timeSec: number
): { zoom: number; panX: number; panY: number; tiltDeg: number } {
  const ease = applyEasing(progress, 'ease_in_out');
  let zoom = 0;
  let panX = 0;
  let panY = 0;
  let tiltDeg = 0;

  switch (move) {
    case 'dolly_in':
      zoom += ease * 0.24 * amp;
      break;
    case 'dolly_out':
      zoom += (1 - ease) * 0.22 * amp;
      break;
    case 'pan':
      panX += (ease - 0.5) * 0.22 * amp;
      break;
    case 'tilt':
      panY += (ease - 0.5) * 0.14 * amp;
      break;
    case 'zoom':
      zoom += Math.pow(progress, 1.45) * 0.3 * amp;
      break;
    case 'orbit':
      panX += Math.sin(ease * Math.PI) * 0.15 * amp;
      zoom += Math.sin(ease * Math.PI) * 0.12 * amp;
      break;
    case 'handheld':
      panX += Math.sin(timeSec * 2.6) * 0.014 * amp;
      panY += Math.cos(timeSec * 2.0) * 0.011 * amp;
      tiltDeg += Math.sin(timeSec * 1.5) * 1.2 * amp;
      break;
    case 'dutch_angle':
      tiltDeg += (2.5 + ease * 4.5) * amp;
      zoom += 0.1 + ease * 0.1;
      break;
    case 'tracking':
      panX += (ease - 0.38) * 0.24 * amp;
      zoom += 0.06 + ease * 0.06 * amp;
      break;
    case 'static':
      // Even static tripod shots preserve subtle cinematic lens breathing so frames never look dead
      zoom += Math.sin(progress * Math.PI) * 0.03;
      break;
  }

  return { zoom, panX, panY, tiltDeg };
}

function computeCameraTransform(
  scene: SceneSpec,
  progress: number,
  timeSec: number,
  subjectNormX: number
): CameraTransform {
  let zoom = 1.0;
  let panX = 0;
  let panY = 0;
  let tiltDeg = 0;

  // True dramatic cinematic shot-scale framing (distinct visual scales, never flat!)
  switch (scene.framing) {
    case 'wide':
      zoom = 0.94;
      panY = -0.02;
      break;
    case 'medium':
      zoom = 1.18;
      panY = -0.04;
      break;
    case 'over_shoulder':
      zoom = 1.42;
      panX = scene.focusTarget === 'reflection' ? 0.11 : 0.05;
      panY = -0.08;
      break;
    case 'detail':
      zoom = 1.88;
      panX = scene.focusTarget === 'reflection' || scene.focusTarget === 'prop_clue' ? 0.14 : 0.04;
      panY = -0.06;
      break;
    case 'close_up':
      zoom = 1.78;
      panY = scene.focusTarget === 'reflection' ? -0.14 : -0.17;
      if (scene.focusTarget === 'reflection') panX = 0.09;
      break;
    case 'extreme_close_up':
      zoom = 2.15;
      panY = scene.focusTarget === 'reflection' ? -0.16 : -0.21;
      if (scene.focusTarget === 'reflection') panX = 0.1;
      break;
    case 'low_angle':
      zoom = 1.15;
      panY = 0.05;
      break;
    case 'high_angle':
      zoom = 1.12;
      panY = -0.09;
      break;
  }

  const amp = Math.max(0.2, scene.cameraIntensity);
  const primary = applySingleCameraMove(scene.cameraMove, amp, progress, timeSec);
  zoom += primary.zoom;
  panX += primary.panX;
  panY += primary.panY;
  tiltDeg += primary.tiltDeg;

  // 2-stage camera evolution on longer shots (>= 2.8s) prevents static/stale framing
  if (scene.secondaryCameraMove && scene.secondaryCameraMove !== scene.cameraMove && progress > 0.45) {
    const subProg = smoothstep((progress - 0.45) / 0.55);
    const secondary = applySingleCameraMove(scene.secondaryCameraMove, amp * 0.5, subProg, timeSec);
    zoom += secondary.zoom;
    panX += secondary.panX;
    panY += secondary.panY;
    tiltDeg += secondary.tiltDeg;
  }

  // Intelligent subject tracking (tighter lead-room follow on close/medium shots)
  const trackWeight =
    scene.framing === 'close_up' || scene.framing === 'extreme_close_up'
      ? 0.42
      : scene.framing === 'detail'
      ? 0.22
      : 0.28;
  panX += (subjectNormX - 0.5) * trackWeight;

  // Controlled subtle camera shake (never violent jitter that hides detail)
  const safeShake = Math.min(0.32, scene.effects.cameraShake);
  if (safeShake > 0.02) {
    panX += Math.sin(timeSec * 29.3) * 0.01 * safeShake;
    panY += Math.cos(timeSec * 33.1) * 0.01 * safeShake;
    tiltDeg += Math.sin(timeSec * 23.7) * 1.0 * safeShake;
  }

  return { zoom, panX, panY, tiltDeg };
}

interface VitrineRenderContext {
  scene: SceneSpec;
  progress: number;
  protagonistDef?: CharacterDefinition;
  protagonistActor?: SceneActor;
  shadowDef?: CharacterDefinition;
  unitScale: number;
}

function drawStorefrontVitrine(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  timeSec: number,
  accent: string,
  vitrineCtx?: VitrineRenderContext
) {
  const mode = vitrineCtx?.scene.reflectionMode ?? 'mirror';
  const progress = vitrineCtx?.progress ?? 0;

  // Storefront brick/stone outer facade around the glass
  ctx.fillStyle = '#0d111a';
  ctx.fillRect(-108, -168, 216, 282);
  ctx.strokeStyle = '#1f2937';
  ctx.lineWidth = 4;
  ctx.strokeRect(-108, -168, 216, 282);

  // Dark awning above vitrine
  ctx.fillStyle = '#111827';
  ctx.beginPath();
  ctx.moveTo(-116, -172);
  ctx.lineTo(116, -172);
  ctx.lineTo(124, -138);
  ctx.lineTo(-124, -138);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Warm dim shop interior glass background
  const glassX = -94;
  const glassY = -126;
  const glassW = 188;
  const glassH = 224;

  ctx.save();
  ctx.beginPath();
  ctx.rect(glassX, glassY, glassW, glassH);
  ctx.clip();

  const interiorGrad = ctx.createLinearGradient(glassX, glassY, glassX, glassY + glassH);
  interiorGrad.addColorStop(0, '#070b14');
  interiorGrad.addColorStop(0.55, '#0e1726');
  interiorGrad.addColorStop(1, '#090e18');
  ctx.fillStyle = interiorGrad;
  ctx.fillRect(glassX, glassY, glassW, glassH);

  // Dim interior shop shelves/mannequin silhouettes for real spatial depth
  ctx.fillStyle = 'rgba(20, 30, 48, 0.72)';
  ctx.fillRect(glassX + 12, glassY + 135, glassW - 24, 10);
  ctx.fillRect(glassX + 26, glassY + 95, 30, 40);
  ctx.fillRect(glassX + 124, glassY + 82, 34, 53);
  const warmLamp = ctx.createRadialGradient(glassX + glassW * 0.5, glassY + 24, 4, glassX + glassW * 0.5, glassY + 24, 115);
  warmLamp.addColorStop(0, `${accent}2C`);
  warmLamp.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = warmLamp;
  ctx.fillRect(glassX, glassY, glassW, glassH);

  // Live mirrored reflection inside the glass pane
  if (vitrineCtx?.protagonistDef && vitrineCtx.protagonistActor && mode !== 'none') {
    const protDef = vitrineCtx.protagonistDef;
    const protActor = vitrineCtx.protagonistActor;
    const choreo = resolveActorStateAtProgress(protActor, progress);

    const isFocusedVitrine =
      mode === 'figure_behind' || mode === 'autonomous_smile' || mode === 'hand_grab';

    // 1. In 'figure_behind', render the looming shadow figure behind the protagonist's reflection INSIDE the glass
    if (mode === 'figure_behind' && vitrineCtx.shadowDef) {
      const figAppear = smoothstep(Math.max(0, Math.min(1, (progress - 0.16) / 0.42)));
      if (figAppear > 0.02) {
        const figScale = 0.76 + figAppear * 0.1;
        drawArticulatedCharacter(ctx, vitrineCtx.shadowDef, {
          x: 28 - figAppear * 14,
          y: 112 - figAppear * 6,
          scale: figScale,
          flipX: true,
          rotationDeg: 0,
          opacity: 0.76 * figAppear,
          state: progress > 0.65 ? 'attack' : 'idle',
          nextState: 'attack',
          blendProgress: figAppear,
          expression: 'angry',
          lookDirection: 'forward',
          timeSec,
          talking: false,
          rimLightColor: '#ef4444',
          rimLightIntensity: 0.75,
          shadowsEnabled: false,
        });
      }
    }

    // 2. Protagonist's own mirrored reflection inside the glass
    let reflExpression = choreo.expression;
    let reflTiltDeg = 0;
    let reflScale = isFocusedVitrine ? 0.86 : 0.68;
    let reflY = isFocusedVitrine ? 126 : 118;
    let reflX = isFocusedVitrine ? -12 : 4;
    let reflOpacity = isFocusedVitrine ? 0.68 : 0.28;
    let reflRim = '#93c5fd';

    if (mode === 'autonomous_smile') {
      const smileStart = 0.22;
      const smileRamp = smoothstep(Math.max(0, Math.min(1, (progress - smileStart) / 0.35)));
      if (progress >= smileStart) {
        reflExpression = 'sinister_smile';
        reflTiltDeg = smileRamp * 8.5;
        reflScale = 0.88 + smileRamp * 0.08;
        reflOpacity = 0.66 + smileRamp * 0.18;
        reflRim = smileRamp > 0.4 ? '#f87171' : '#93c5fd';
      }
    } else if (mode === 'hand_grab') {
      const lunge = smoothstep(Math.max(0, Math.min(1, progress / 0.32)));
      reflExpression = 'sinister_smile';
      reflTiltDeg = 9 - lunge * 4;
      reflScale = 0.94 + lunge * 0.16;
      reflX = -10 - lunge * 16;
      reflOpacity = Math.max(0.28, 0.84 - Math.max(0, progress - 0.5) * 0.5);
      reflRim = '#ef4444';
    }

    drawArticulatedCharacter(ctx, protDef, {
      x: reflX,
      y: reflY,
      scale: reflScale,
      flipX: true, // mirrored across the vitrine glass facing back at protagonist!
      rotationDeg: reflTiltDeg,
      opacity: reflOpacity,
      state: mode === 'autonomous_smile' || mode === 'hand_grab' ? 'idle' : choreo.state,
      nextState: 'idle',
      blendProgress: 0,
      expression: reflExpression,
      lookDirection: 'forward',
      timeSec: mode === 'autonomous_smile' ? timeSec * 0.4 : timeSec, // uncanny stillness as reflection smiles on its own
      talking: false,
      rimLightColor: reflRim,
      rimLightIntensity: 0.65,
      shadowsEnabled: false,
    });

    // Subtle atmospheric sinister glow behind reflection head when autonomous_smile peaks
    if ((mode === 'autonomous_smile' && progress > 0.38) || mode === 'hand_grab') {
      const glint = mode === 'hand_grab' ? 0.65 : smoothstep((progress - 0.38) / 0.4) * 0.55;
      ctx.save();
      const headGx = reflX + 10;
      const headGy = reflY - 128 * reflScale;
      const gRad = ctx.createRadialGradient(headGx, headGy, 2, headGx, headGy, 38);
      gRad.addColorStop(0, `rgba(239, 68, 68, ${glint * 0.28})`);
      gRad.addColorStop(1, 'rgba(239, 68, 68, 0)');
      ctx.fillStyle = gRad;
      ctx.beginPath();
      ctx.arc(headGx, headGy, 38, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  // Cool nocturnal glass tint + diagonal specular window reflection streaks
  ctx.fillStyle = 'rgba(147, 197, 253, 0.08)';
  ctx.fillRect(glassX, glassY, glassW, glassH);

  ctx.save();
  ctx.fillStyle = 'rgba(226, 232, 240, 0.11)';
  ctx.beginPath();
  ctx.moveTo(glassX + 18, glassY);
  ctx.lineTo(glassX + 52, glassY);
  ctx.lineTo(glassX - 18, glassY + glassH);
  ctx.lineTo(glassX - 46, glassY + glassH);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = 'rgba(226, 232, 240, 0.06)';
  ctx.beginPath();
  ctx.moveTo(glassX + 124, glassY);
  ctx.lineTo(glassX + 144, glassY);
  ctx.lineTo(glassX + 74, glassY + glassH);
  ctx.lineTo(glassX + 56, glassY + glassH);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // Fine wet rain streaks trickling down the glass pane
  ctx.strokeStyle = 'rgba(186, 230, 253, 0.2)';
  ctx.lineWidth = 0.7;
  ctx.beginPath();
  for (let i = 0; i < 24; i++) {
    const dx = glassX + ((i * 29 + 9) % (glassW - 10)) + 5;
    const dy = glassY + (((i * 47 + timeSec * (14 + (i % 5) * 7)) % (glassH - 14)) + 4);
    const streakLen = 5 + (i % 4) * 3;
    ctx.moveTo(dx, dy);
    ctx.lineTo(dx - 0.5, dy + streakLen);
  }
  ctx.stroke();

  // Jagged realistic glass fracture web when hand bursts out in 'hand_grab' mode
  if (mode === 'hand_grab' && progress >= 0.18) {
    const crackProg = smoothstep(Math.min(1, (progress - 0.18) / 0.2));
    const cx = -30;
    const cy = -8;
    ctx.save();

    // Irregular shattered breakthrough hole
    ctx.fillStyle = `rgba(4, 6, 12, ${0.92 * crackProg})`;
    ctx.beginPath();
    const holePts = 9;
    for (let k = 0; k < holePts; k++) {
      const a = (k / holePts) * Math.PI * 2;
      const r = (12 + ((k * 13) % 7)) * crackProg;
      const hx = cx + Math.cos(a) * r;
      const hy = cy + Math.sin(a) * r;
      if (k === 0) ctx.moveTo(hx, hy);
      else ctx.lineTo(hx, hy);
    }
    ctx.closePath();
    ctx.fill();

    // Razor-sharp irregular jagged crack lines with forked splinters
    const rays = 13;
    for (let r = 0; r < rays; r++) {
      const ang = (r / rays) * Math.PI * 2 + (r % 3) * 0.09;
      const len = (36 + ((r * 31) % 68)) * crackProg;
      const midDist = len * 0.48;
      const midX = cx + Math.cos(ang + 0.05) * midDist;
      const midY = cy + Math.sin(ang + 0.05) * midDist;
      const endX = cx + Math.cos(ang - 0.08) * len;
      const endY = cy + Math.sin(ang - 0.08) * len;

      ctx.strokeStyle = `rgba(226, 242, 255, ${(0.5 + (r % 3) * 0.16) * crackProg})`;
      ctx.lineWidth = r % 2 === 0 ? 1.15 : 0.7;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(ang) * 9 * crackProg, cy + Math.sin(ang) * 9 * crackProg);
      ctx.lineTo(midX, midY);
      ctx.lineTo(endX, endY);
      ctx.stroke();

      // Secondary angular cross-fracture (broken glass polygon shard, not a circle!)
      if (r % 2 === 0 && crackProg > 0.35) {
        const nextAng = ((r + 1) / rays) * Math.PI * 2 + ((r + 1) % 3) * 0.09;
        const crossDist = (19 + (r % 3) * 11) * crackProg;
        ctx.strokeStyle = `rgba(186, 230, 253, ${0.42 * crackProg})`;
        ctx.lineWidth = 0.65;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(ang) * crossDist, cy + Math.sin(ang) * crossDist);
        ctx.lineTo(cx + Math.cos(nextAng) * (crossDist * 1.08), cy + Math.sin(nextAng) * (crossDist * 1.08));
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  ctx.restore(); // end glass clip

  // Metallic window mullions & sill
  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 5;
  ctx.strokeRect(glassX, glassY, glassW, glassH);
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(-102, 96, 204, 18);
  // Subtle edge rim highlight along window frame
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.25)';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(glassX + 2, glassY + 2, glassW - 4, glassH - 4);
}

/**
 * Renders an organic, anatomically proportioned 2D shadow forearm & articulated clawed hand
 * bursting OUT of the shattered vitrine glass and seizing the protagonist's shoulder/collar.
 */
function drawVitrineHandGrabOverlay(
  ctx: CanvasRenderingContext2D,
  vitrineProp: ScenarioProp,
  mgShift: number,
  w: number,
  h: number,
  actorX: number,
  actorY: number,
  progress: number,
  timeSec: number
) {
  if (progress < 0.2) return;
  const burst = smoothstep(Math.min(1, (progress - 0.2) / 0.26));
  const gripPulse = progress > 0.45 ? Math.sin(timeSec * 22) * 2.5 : 0;

  const s = (h / 720) * vitrineProp.scale;
  const originX = vitrineProp.x * w + mgShift + -30 * s;
  const originY = vitrineProp.y * h + -8 * s;

  // Target: protagonist's shoulder/upper chest collar
  const targetX = actorX + 18;
  const targetY = actorY - h * 0.165 + gripPulse;

  const wristX = originX + (targetX - originX) * burst;
  const wristY = originY + (targetY - originY) * burst;

  ctx.save();

  // Dark shadowy wisp emerging from shattered glass opening
  const smokeGrad = ctx.createRadialGradient(originX, originY, 4, originX, originY, 68 * burst);
  smokeGrad.addColorStop(0, 'rgba(5, 7, 13, 0.92)');
  smokeGrad.addColorStop(0.55, 'rgba(35, 10, 18, 0.36)');
  smokeGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = smokeGrad;
  ctx.beginPath();
  ctx.arc(originX, originY, 68 * burst, 0, Math.PI * 2);
  ctx.fill();

  // Sharp glinting glass splinters flying outward
  ctx.fillStyle = 'rgba(226, 242, 255, 0.88)';
  const shardFly = Math.min(1, (progress - 0.2) / 0.45);
  for (let i = 0; i < 14; i++) {
    const ang = Math.PI * 0.62 + (i - 7) * 0.2;
    const dist = (22 + (i % 5) * 30) * shardFly * (h / 720);
    const sx = originX + Math.cos(ang) * dist;
    const sy = originY + Math.sin(ang) * dist + shardFly * shardFly * 42;
    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(ang + shardFly * 4.2);
    ctx.globalAlpha = Math.max(0, 0.9 - shardFly * 0.72);
    ctx.beginPath();
    ctx.moveTo(-6, -1.8);
    ctx.lineTo(7, 0);
    ctx.lineTo(-1, 3.8);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // Sculpted organic shadow forearm tapering cleanly from glass hole to wrist
  const dx = wristX - originX;
  const dy = wristY - originY;
  const armAngle = Math.atan2(dy, dx);
  const armLen = Math.hypot(dx, dy);
  const scaleUnit = h / 720;
  const baseThick = scaleUnit * 10.5;
  const wristThick = scaleUnit * 5.8;

  ctx.save();
  ctx.translate(originX, originY);
  ctx.rotate(armAngle);

  const armGrad = ctx.createLinearGradient(0, -baseThick, 0, baseThick);
  armGrad.addColorStop(0, '#070910');
  armGrad.addColorStop(0.45, '#181c2b');
  armGrad.addColorStop(1, '#040509');
  ctx.fillStyle = armGrad;
  ctx.strokeStyle = 'rgba(239, 68, 68, 0.42)';
  ctx.lineWidth = 1.6;

  ctx.beginPath();
  ctx.moveTo(0, -baseThick);
  ctx.bezierCurveTo(armLen * 0.35, -baseThick * 0.95, armLen * 0.72, -wristThick * 1.15, armLen, -wristThick);
  ctx.lineTo(armLen, wristThick);
  ctx.bezierCurveTo(armLen * 0.72, wristThick * 1.1, armLen * 0.35, baseThick * 0.85, 0, baseThick * 0.92);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Organic sculpted palm + opposable thumb + 4 articulated tapered fingers curving to grab!
  const handScale = scaleUnit * (0.64 + burst * 0.14);
  ctx.translate(armLen, 0);
  ctx.scale(handScale, handScale);

  // Sculpted metacarpal palm (trapezoid/organic, not a circle!)
  ctx.fillStyle = '#090c14';
  ctx.strokeStyle = 'rgba(248, 113, 113, 0.55)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(-2, -9);
  ctx.quadraticCurveTo(10, -15, 22, -13);
  ctx.quadraticCurveTo(28, 0, 22, 13);
  ctx.quadraticCurveTo(10, 14, -2, 9);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  const gripClose = smoothstep(Math.max(0, Math.min(1, (progress - 0.34) / 0.24)));

  // Opposable thumb on lower side curving inward to pinch shoulder
  const drawTaperedFinger = (
    startX: number,
    startY: number,
    ang1: number,
    len1: number,
    ang2: number,
    len2: number,
    baseW: number
  ) => {
    const jx = startX + Math.cos(ang1) * len1;
    const jy = startY + Math.sin(ang1) * len1;
    const tx = jx + Math.cos(ang2) * len2;
    const ty = jy + Math.sin(ang2) * len2;

    const nx1 = -Math.sin(ang1);
    const ny1 = Math.cos(ang1);
    const nx2 = -Math.sin(ang2);
    const ny2 = Math.cos(ang2);

    ctx.fillStyle = '#070910';
    ctx.strokeStyle = 'rgba(248, 113, 113, 0.58)';
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(startX + nx1 * baseW, startY + ny1 * baseW);
    ctx.lineTo(jx + nx2 * (baseW * 0.68), jy + ny2 * (baseW * 0.68));
    ctx.lineTo(tx, ty); // sharp claw tip
    ctx.lineTo(jx - nx2 * (baseW * 0.68), jy - ny2 * (baseW * 0.68));
    ctx.lineTo(startX - nx1 * baseW, startY - ny1 * baseW);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  };

  // Opposable thumb
  drawTaperedFinger(11, 11, 0.92 - gripClose * 0.35, 16, 0.45 - gripClose * 0.55, 14, 3.6);
  // Index, middle, ring, pinky fingers curling dynamically inward around collar
  const fingerSpecs = [
    { sy: -10, a1: -0.36 + gripClose * 0.22, l1: 21, a2: -0.05 + gripClose * 0.48, l2: 18, w: 3.1 },
    { sy: -3.5, a1: -0.1 + gripClose * 0.16, l1: 24, a2: 0.12 + gripClose * 0.44, l2: 20, w: 3.2 },
    { sy: 3, a1: 0.14 + gripClose * 0.08, l1: 22, a2: 0.32 + gripClose * 0.36, l2: 18, w: 3.0 },
    { sy: 8.5, a1: 0.38 - gripClose * 0.04, l1: 17, a2: 0.52 + gripClose * 0.22, l2: 14, w: 2.5 },
  ];
  for (const fn of fingerSpecs) {
    drawTaperedFinger(21, fn.sy, fn.a1, fn.l1, fn.a2, fn.l2, fn.w);
  }

  ctx.restore();
  ctx.restore();
}

function drawScenarioProp(
  ctx: CanvasRenderingContext2D,
  prop: ScenarioProp,
  w: number,
  h: number,
  offsetX: number,
  accent: string,
  timeSec: number,
  volumetricCap: number,
  vitrineCtx?: VitrineRenderContext
) {
  const px = prop.x * w + offsetX;
  const py = prop.y * h;
  const s = (h / 720) * prop.scale;

  ctx.save();
  ctx.translate(px, py);
  ctx.scale(s, s);

  switch (prop.kind) {
    case 'door_ajar': {
      ctx.fillStyle = '#07090f';
      ctx.fillRect(-52, -135, 104, 245);
      // Controlled light spill through the door crack (never washes out midground)
      const spill = ctx.createLinearGradient(-44, 0, 58, 40);
      const alphaHex = Math.round(Math.min(0.45, volumetricCap * 2.1) * 255)
        .toString(16)
        .padStart(2, '0');
      spill.addColorStop(0, `${accent}${alphaHex}`);
      spill.addColorStop(0.55, `${accent}1A`);
      spill.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = spill;
      ctx.beginPath();
      ctx.moveTo(-42, -125);
      ctx.lineTo(14, -125);
      ctx.lineTo(125, 145);
      ctx.lineTo(-42, 110);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#231b18';
      ctx.strokeStyle = '#3a2d27';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(48, -130);
      ctx.lineTo(-10, -116);
      ctx.lineTo(-10, 108);
      ctx.lineTo(48, 110);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#d4a149';
      ctx.beginPath();
      ctx.arc(-2, 4, 4.5, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'staircase': {
      ctx.fillStyle = '#1b1615';
      ctx.strokeStyle = '#2e2523';
      ctx.lineWidth = 2;
      for (let i = 0; i < 8; i++) {
        ctx.fillRect(-70 + i * 16, 95 - i * 24, 110 - i * 6, 22);
        ctx.strokeRect(-70 + i * 16, 95 - i * 24, 110 - i * 6, 22);
      }
      ctx.strokeStyle = '#3c302c';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(-72, 45);
      ctx.lineTo(66, -135);
      ctx.stroke();
      break;
    }
    case 'window_moon': {
      // Restrained moonlight shaft
      const moonGrad = ctx.createLinearGradient(0, -80, 140, 220);
      moonGrad.addColorStop(0, `rgba(147, 197, 253, ${Math.min(0.22, volumetricCap * 1.1)})`);
      moonGrad.addColorStop(1, 'rgba(147, 197, 253, 0)');
      ctx.fillStyle = moonGrad;
      ctx.beginPath();
      ctx.moveTo(-45, -70);
      ctx.lineTo(45, -70);
      ctx.lineTo(170, 240);
      ctx.lineTo(15, 240);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#1e3a5f';
      ctx.fillRect(-45, -85, 90, 140);
      ctx.fillStyle = '#dbeafe';
      ctx.beginPath();
      ctx.arc(12, -45, 18, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#0f141e';
      ctx.lineWidth = 6;
      ctx.strokeRect(-45, -85, 90, 140);
      ctx.beginPath();
      ctx.moveTo(0, -85);
      ctx.lineTo(0, 55);
      ctx.moveTo(-45, -15);
      ctx.lineTo(45, -15);
      ctx.stroke();
      break;
    }
    case 'lamp_post': {
      const windSway = Math.sin(timeSec * 1.8 + prop.x * 5) * 2.2;
      ctx.fillStyle = '#1e2430';
      ctx.fillRect(-6, -150, 12, 300);
      ctx.fillRect(-6, -150, 48, 8);
      // Subtle swaying downward volumetric light cone reacting to rain & breeze
      const coneGrad = ctx.createLinearGradient(34, -140, 34 + windSway * 5, 130);
      coneGrad.addColorStop(0, `${accent}44`);
      coneGrad.addColorStop(0.55, `${accent}12`);
      coneGrad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = coneGrad;
      ctx.beginPath();
      ctx.moveTo(26, -138);
      ctx.lineTo(42, -138);
      ctx.lineTo(106 + windSway * 4, 148);
      ctx.lineTo(-34 + windSway * 4, 148);
      ctx.closePath();
      ctx.fill();

      const glow = ctx.createRadialGradient(34, -138, 4, 34, -138, 102);
      glow.addColorStop(0, `${accent}77`);
      glow.addColorStop(0.35, `${accent}1E`);
      glow.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(34, -138, 102, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fef3c7';
      ctx.beginPath();
      ctx.arc(34, -142, 8.5, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'holo_sign': {
      const pulse = 0.84 + Math.sin(timeSec * 4.5) * 0.16;
      ctx.globalAlpha = pulse;
      ctx.strokeStyle = accent;
      ctx.lineWidth = 3;
      ctx.fillStyle = 'rgba(14, 165, 233, 0.14)';
      ctx.beginPath();
      ctx.roundRect(-62, -32, 124, 64, 6);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = accent;
      ctx.fillRect(-44, -12, 88, 7);
      ctx.fillRect(-44, 4, 58, 5);
      break;
    }
    case 'tree_gnarled': {
      const sway = Math.sin(timeSec * 1.4 + prop.x * 8) * 3;
      ctx.fillStyle = '#0e1614';
      ctx.beginPath();
      ctx.moveTo(-28, 160);
      ctx.quadraticCurveTo(-18, 20, -45 + sway, -90);
      ctx.lineTo(-10 + sway, -145);
      ctx.lineTo(15 + sway, -95);
      ctx.quadraticCurveTo(22, 30, 32, 160);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#142621';
      ctx.beginPath();
      ctx.arc(-20 + sway, -110, 62, 0, Math.PI * 2);
      ctx.arc(28 + sway, -95, 52, 0, Math.PI * 2);
      ctx.arc(0 + sway, -145, 56, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'pillar': {
      ctx.fillStyle = '#1b2029';
      ctx.fillRect(-26, -170, 52, 340);
      ctx.fillStyle = '#272f3d';
      ctx.fillRect(-34, -175, 68, 22);
      ctx.fillRect(-34, 148, 68, 22);
      break;
    }
    case 'crate': {
      ctx.fillStyle = '#1e293b';
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 2;
      ctx.fillRect(-38, -32, 76, 64);
      ctx.strokeRect(-38, -32, 76, 64);
      ctx.beginPath();
      ctx.moveTo(-38, -32);
      ctx.lineTo(38, 32);
      ctx.stroke();
      break;
    }
    case 'storefront_vitrine': {
      drawStorefrontVitrine(ctx, w, h, timeSec, accent, vitrineCtx);
      break;
    }
  }
  ctx.restore();
}

function drawDepthFogBand(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  fogIntensity: number,
  timeSec: number,
  yRatio: number,
  maxOpacity: number
) {
  if (fogIntensity <= 0.03) return;
  const alpha = Math.min(maxOpacity, fogIntensity * maxOpacity * 2.2);
  ctx.save();
  for (let i = 0; i < 2; i++) {
    const drift = ((timeSec * (11 + i * 6) + i * 260) % (w * 1.4)) - w * 0.2;
    const g = ctx.createRadialGradient(drift, h * yRatio, 12, drift, h * yRatio, w * 0.48);
    g.addColorStop(0, `rgba(186, 204, 224, ${alpha})`);
    g.addColorStop(1, 'rgba(186, 204, 224, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, h * (yRatio - 0.28), w, h * 0.56);
  }
  ctx.restore();
}

function drawScenarioBackgroundAndMidground(
  ctx: CanvasRenderingContext2D,
  scenario: ScenarioDefinition,
  scene: SceneSpec,
  w: number,
  h: number,
  panX: number,
  timeSec: number,
  vitrineCtx?: VitrineRenderContext
) {
  const volumetricCap = Math.min(0.24, scene.lighting.volumetricIntensity ?? 0.16);

  // Layer 1: Independent Sky / Deep Backdrop
  const sky = ctx.createLinearGradient(0, 0, 0, h * 0.8);
  sky.addColorStop(0, scenario.skyTop);
  sky.addColorStop(1, scenario.skyBottom);
  ctx.fillStyle = sky;
  ctx.fillRect(-w * 0.2, -h * 0.2, w * 1.4, h * 1.4);

  const bgLayer = scenario.layers.find((l) => l.depth === 'background');
  const bgShift = -panX * w * (bgLayer?.parallaxFactor ?? 0.24);

  if (bgLayer?.customImageUrl) {
    const img = getCachedImage(bgLayer.customImageUrl);
    if (img) {
      ctx.save();
      ctx.globalAlpha = bgLayer.opacity;
      ctx.drawImage(img, bgShift - w * 0.12, 0, w * 1.24, h);
      ctx.restore();
    }
  } else {
    ctx.save();
    ctx.translate(bgShift, 0);
    if (scenario.theme === 'haunted_manor_hall' || scenario.theme === 'abandoned_attic_door') {
      // Architectural wood paneling & wainscoting with depth contrast
      ctx.strokeStyle = 'rgba(255,255,255,0.05)';
      ctx.lineWidth = 2;
      for (let x = -w * 0.2; x < w * 1.3; x += w * 0.11) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h * 0.78);
        ctx.stroke();
      }
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      ctx.fillRect(-w * 0.2, h * 0.56, w * 1.4, h * 0.2);
      // Baseboard trim
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      ctx.fillRect(-w * 0.2, h * 0.74, w * 1.4, 3);
    } else if (
      scenario.theme === 'dark_rain_street' ||
      scenario.theme === 'cyberpunk_rain_street' ||
      scenario.theme === 'noir_rain_alley'
    ) {
      // Stormy distant clouds + nocturnal urban skyline
      if (scenario.theme === 'dark_rain_street') {
        const moonHaze = ctx.createRadialGradient(w * 0.26, h * 0.14, 10, w * 0.26, h * 0.14, w * 0.36);
        moonHaze.addColorStop(0, 'rgba(148, 163, 184, 0.16)');
        moonHaze.addColorStop(1, 'rgba(15, 23, 42, 0)');
        ctx.fillStyle = moonHaze;
        ctx.fillRect(-w * 0.2, 0, w * 1.4, h * 0.45);
      }

      // Drifting nocturnal storm clouds in far background sky
      ctx.save();
      for (let c = 0; c < 4; c++) {
        const cx = (((c * 310 + timeSec * (8 + c * 3)) % (w * 1.6)) - w * 0.3);
        const cy = h * (0.09 + (c % 2) * 0.08);
        const cg = ctx.createRadialGradient(cx, cy, 10, cx, cy, w * 0.28);
        cg.addColorStop(0, 'rgba(51, 65, 85, 0.22)');
        cg.addColorStop(1, 'rgba(15, 23, 42, 0)');
        ctx.fillStyle = cg;
        ctx.beginPath();
        ctx.ellipse(cx, cy, w * 0.28, h * 0.08, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

      const buildings = [-0.08, 0.08, 0.24, 0.4, 0.56, 0.72, 0.88, 1.04];
      buildings.forEach((bx, idx) => {
        const bw = w * 0.18;
        const bh = h * (0.4 + ((idx * 19) % 26) / 100);
        ctx.fillStyle =
          scenario.theme === 'dark_rain_street'
            ? idx % 2 === 0
              ? '#0b111d'
              : '#0f1726'
            : idx % 2 === 0
            ? '#0d1524'
            : '#111b2e';
        ctx.fillRect(bx * w - bw / 2, h * 0.76 - bh, bw, bh);
        ctx.strokeStyle = 'rgba(148, 163, 184, 0.06)';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(bx * w - bw / 2, h * 0.76 - bh, bw, bh);

        for (let wy = h * 0.76 - bh + 22; wy < h * 0.68; wy += 32) {
          for (let wx = bx * w - bw / 2 + 16; wx < bx * w + bw / 2 - 16; wx += 24) {
            const hash = Math.floor(wx + wy) + idx;
            if (hash % 4 === 0) {
              // Subtle living apartment window flicker (only on 1 in 6 lit windows)
              const dimPulse = hash % 6 === 0 ? 0.65 + 0.35 * Math.sin(timeSec * 3.1 + hash) : 1;
              ctx.save();
              ctx.globalAlpha = dimPulse;
              ctx.fillStyle =
                scenario.theme === 'dark_rain_street'
                  ? idx % 4 === 1
                    ? 'rgba(229, 160, 50, 0.26)'
                    : 'rgba(148, 163, 184, 0.12)'
                  : idx % 3 === 0
                  ? `${scenario.accentColor}55`
                  : 'rgba(226, 232, 240, 0.18)';
              ctx.fillRect(wx, wy, 9, 14);
              ctx.restore();
            }
          }
        }
      });
    } else if (scenario.theme === 'orbital_deck') {
      ctx.fillStyle = 'rgba(226, 232, 240, 0.65)';
      for (let i = 0; i < 42; i++) {
        const sx = (((i * 197) % 100) / 100) * w;
        const sy = (((i * 89) % 58) / 100) * h;
        const tw = 0.5 + 0.5 * Math.sin(timeSec * 2 + i);
        ctx.globalAlpha = tw * 0.8;
        ctx.fillRect(sx, sy, 2, 2);
      }
      ctx.globalAlpha = 1;
      const pGrad = ctx.createRadialGradient(w * 0.72, h * 0.34, 15, w * 0.72, h * 0.34, w * 0.28);
      pGrad.addColorStop(0, '#38bdf8');
      pGrad.addColorStop(0.5, '#1e3a8a');
      pGrad.addColorStop(1, 'rgba(4,7,17,0)');
      ctx.fillStyle = pGrad;
      ctx.beginPath();
      ctx.arc(w * 0.72, h * 0.34, w * 0.28, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 10;
      ctx.strokeRect(w * 0.06, h * 0.08, w * 0.88, h * 0.54);
    } else {
      ctx.fillStyle = '#0f2027';
      ctx.beginPath();
      ctx.moveTo(-w * 0.2, h * 0.78);
      ctx.lineTo(w * 0.12, h * 0.42);
      ctx.lineTo(w * 0.38, h * 0.56);
      ctx.lineTo(w * 0.68, h * 0.36);
      ctx.lineTo(w * 1.15, h * 0.62);
      ctx.lineTo(w * 1.25, h * 0.78);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  // Background props
  scenario.props
    .filter((p) => p.depth === 'background')
    .forEach((p) => drawScenarioProp(ctx, p, w, h, bgShift, scenario.accentColor, timeSec, volumetricCap, vitrineCtx));

  // Depth-ordered distant fog BETWEEN background and midground (adds depth without hiding actors!)
  drawDepthFogBand(ctx, w, h, scene.effects.fog, timeSec, 0.68, 0.15);

  // Layer 2: Independent Midground + Floor plane
  const mgLayer = scenario.layers.find((l) => l.depth === 'midground');
  const mgShift = -panX * w * (mgLayer?.parallaxFactor ?? 0.62);

  if (mgLayer?.customImageUrl) {
    const img = getCachedImage(mgLayer.customImageUrl);
    if (img) {
      ctx.save();
      ctx.globalAlpha = mgLayer.opacity;
      ctx.drawImage(img, mgShift - w * 0.12, 0, w * 1.24, h);
      ctx.restore();
    }
  }

  const floorY = h * 0.75;
  const floorGrad = ctx.createLinearGradient(0, floorY, 0, h * 1.15);
  floorGrad.addColorStop(0, scenario.groundColor);
  floorGrad.addColorStop(1, '#05070b');
  ctx.fillStyle = floorGrad;
  ctx.fillRect(-w * 0.25, floorY, w * 1.5, h * 0.45);

  // Sidewalk curb & wet puddle reflections for dark_rain_street
  if (scenario.theme === 'dark_rain_street') {
    ctx.save();
    // Sidewalk strip along storefront
    ctx.fillStyle = '#171e2b';
    ctx.fillRect(-w * 0.25, floorY - 4, w * 1.5, h * 0.048);
    ctx.fillStyle = '#0c1018';
    ctx.fillRect(-w * 0.25, floorY + h * 0.044, w * 1.5, 4);

    // Warm streetlamp puddle shimmer on rain-wet asphalt
    const puddleX = w * 0.24 + mgShift * 0.55;
    const puddleGrad = ctx.createRadialGradient(puddleX, floorY + h * 0.12, 8, puddleX, floorY + h * 0.12, w * 0.34);
    puddleGrad.addColorStop(0, 'rgba(229, 160, 50, 0.22)');
    puddleGrad.addColorStop(0.5, 'rgba(147, 197, 253, 0.09)');
    puddleGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = puddleGrad;
    ctx.fillRect(-w * 0.2, floorY + h * 0.04, w * 1.4, h * 0.25);

    const puddle2X = w * 0.76 + mgShift * 0.7;
    const puddle2 = ctx.createRadialGradient(puddle2X, floorY + h * 0.13, 6, puddle2X, floorY + h * 0.13, w * 0.28);
    puddle2.addColorStop(0, 'rgba(229, 160, 50, 0.24)');
    puddle2.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = puddle2;
    ctx.fillRect(-w * 0.2, floorY + h * 0.04, w * 1.4, h * 0.25);
    ctx.restore();
  }

  // Horizon floor line + perspective planks / road reflections
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.07)';
  ctx.lineWidth = 1.5;
  for (let i = -4; i <= 10; i++) {
    ctx.beginPath();
    ctx.moveTo(w * 0.5 + (i - 3) * (w * 0.11) + mgShift * 0.4, floorY);
    ctx.lineTo(w * 0.5 + (i - 3) * (w * 0.26) + mgShift, h * 1.05);
    ctx.stroke();
  }
  ctx.restore();

  scenario.props
    .filter((p) => p.depth === 'midground')
    .forEach((p) => drawScenarioProp(ctx, p, w, h, mgShift, scenario.accentColor, timeSec, volumetricCap, vitrineCtx));
}

function drawParticlesAndAtmosphere(
  ctx: CanvasRenderingContext2D,
  scene: SceneSpec,
  w: number,
  h: number,
  timeSec: number,
  profile: PerformanceProfile
) {
  const limits = PERFORMANCE_LIMITS[profile];
  const fx = scene.effects;

  // Low subtle ground mist (strictly capped so character anatomy and faces stay crisp)
  if (fx.fog > 0.08) {
    drawDepthFogBand(ctx, w, h, Math.min(0.32, fx.fog), timeSec * 1.25, 0.84, 0.09);
  }

  // Floating dust motes
  if (fx.dust > 0.04) {
    const count = Math.round(limits.maxParticles * 0.4 * Math.min(0.65, fx.dust));
    ctx.save();
    ctx.fillStyle = 'rgba(241, 245, 249, 0.38)';
    for (let i = 0; i < count; i++) {
      const x = (((i * 97.3 + timeSec * (11 + (i % 7) * 3)) % w) + w) % w;
      const y = (((i * 61.7 + Math.sin(timeSec + i) * 16) % h) + h) % h;
      const r = 0.9 + (i % 3) * 0.55;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // 3-Depth-Layer Parallax Rain + Ground Puddle Ripples (distant mist veil -> mid slanted streaks -> foreground fast drops)
  if (fx.rain > 0.04) {
    const rainStrength = Math.min(0.85, fx.rain);
    const totalDrops = Math.round(limits.maxParticles * 0.9 * rainStrength);
    const bgCount = Math.max(8, Math.round(totalDrops * 0.35));
    const midCount = Math.max(10, Math.round(totalDrops * 0.45));
    const fgCount = Math.max(4, Math.round(totalDrops * 0.2));

    // Layer A: Distant fine rain veil (slower, shorter, low alpha)
    ctx.save();
    ctx.strokeStyle = `rgba(148, 197, 255, ${0.09 + rainStrength * 0.11})`;
    ctx.lineWidth = 0.75;
    ctx.beginPath();
    for (let i = 0; i < bgCount; i++) {
      const speed = 320 + (i % 4) * 45;
      const rx = (((i * 61.7 - timeSec * 65) % w) + w) % w;
      const ry = (((i * 37.3 + timeSec * speed) % (h * 0.8)) + h * 0.8) % (h * 0.8);
      ctx.moveTo(rx, ry);
      ctx.lineTo(rx - 2.5, ry + 11);
    }
    ctx.stroke();

    // Layer B: Midground slanted rain streaks
    ctx.strokeStyle = `rgba(176, 214, 255, ${0.16 + rainStrength * 0.22})`;
    ctx.lineWidth = 1.15;
    ctx.beginPath();
    for (let i = 0; i < midCount; i++) {
      const speed = 560 + (i % 5) * 95;
      const rx = (((i * 73.1 - timeSec * 120) % w) + w) % w;
      const ry = (((i * 41.9 + timeSec * speed) % h) + h) % h;
      ctx.moveTo(rx, ry);
      ctx.lineTo(rx - 5.5, ry + 22);
    }
    ctx.stroke();

    // Layer C: Foreground fast wind-driven drops (near camera lens)
    ctx.strokeStyle = `rgba(219, 234, 254, ${0.2 + rainStrength * 0.24})`;
    ctx.lineWidth = 1.7;
    ctx.beginPath();
    for (let i = 0; i < fgCount; i++) {
      const speed = 820 + (i % 3) * 140;
      const rx = (((i * 127.4 - timeSec * 190) % w) + w) % w;
      const ry = (((i * 83.1 + timeSec * speed) % h) + h) % h;
      ctx.moveTo(rx, ry);
      ctx.lineTo(rx - 9.5, ry + 34);
    }
    ctx.stroke();

    // Ground puddle impact ripples on wet floor plane (y = 0.77..0.95)
    const rippleCount = Math.max(6, Math.round(14 * rainStrength));
    ctx.lineWidth = 1.0;
    for (let r = 0; r < rippleCount; r++) {
      const life = (timeSec * (1.2 + (r % 4) * 0.22) + r * 0.37) % 1;
      const px = (((r * 139.7 + 42) % (w * 0.92)) + w * 0.04);
      const py = h * (0.78 + ((r * 23) % 16) / 100);
      const rad = 2 + life * 16;
      ctx.strokeStyle = `rgba(186, 230, 253, ${(1 - life) * 0.28 * rainStrength})`;
      ctx.beginPath();
      ctx.ellipse(px, py, rad, rad * 0.28, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  // Snowflakes
  if (fx.snow > 0.04) {
    const count = Math.round(limits.maxParticles * 0.55 * Math.min(0.8, fx.snow));
    ctx.save();
    ctx.fillStyle = 'rgba(248, 250, 252, 0.7)';
    for (let i = 0; i < count; i++) {
      const sx = (((i * 83.4 + Math.sin(timeSec * 1.5 + i) * 30) % w) + w) % w;
      const sy = (((i * 59.1 + timeSec * (45 + (i % 4) * 15)) % h) + h) % h;
      ctx.beginPath();
      ctx.arc(sx, sy, 1.6 + (i % 3) * 0.7, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // Subtle low smoke wisps (capped so smoke never hides actors)
  if (fx.smoke > 0.04) {
    const cappedSmoke = Math.min(0.28, fx.smoke);
    ctx.save();
    const puffs = Math.max(2, Math.round(6 * cappedSmoke));
    for (let i = 0; i < puffs; i++) {
      const p = (timeSec * 0.22 + i / puffs) % 1;
      const sx = w * (0.2 + ((i * 29) % 60) / 100) + Math.sin(timeSec + i) * 18;
      const sy = h * (0.9 - p * 0.32);
      const rad = 28 + p * 40;
      const g = ctx.createRadialGradient(sx, sy, 2, sx, sy, rad);
      g.addColorStop(0, `rgba(148, 163, 184, ${(1 - p) * cappedSmoke * 0.24})`);
      g.addColorStop(1, 'rgba(148, 163, 184, 0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(sx, sy, rad, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // Fire & sparks
  if (fx.fire > 0.04 || fx.sparks > 0.04) {
    const count = Math.round(limits.maxParticles * 0.45 * Math.min(0.75, Math.max(fx.fire, fx.sparks)));
    ctx.save();
    for (let i = 0; i < count; i++) {
      const life = (timeSec * (0.8 + (i % 4) * 0.25) + i * 0.13) % 1;
      const sx = (((i * 113.7 + Math.sin(timeSec * 4 + i) * 24) % w) + w) % w;
      const sy = h * (0.95 - life * 0.6);
      ctx.fillStyle = i % 2 === 0 ? `rgba(251, 191, 36, ${(1 - life) * 0.85})` : `rgba(239, 68, 68, ${(1 - life) * 0.85})`;
      ctx.beginPath();
      ctx.arc(sx, sy, fx.fire > 0.1 ? 2.4 : 1.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}

/**
 * Clean, high-clarity per-scene lighting and post-processing:
 * - Strictly prevents volumetric overwash, white bloom blowout, and darkness crushing.
 * - Eliminates artificial horizontal glitch rectangle bars and forced scanlines.
 */
function drawLightingAndPostFX(
  ctx: CanvasRenderingContext2D,
  scene: SceneSpec,
  progress: number,
  w: number,
  h: number,
  timeSec: number,
  profile: PerformanceProfile
) {
  const limits = PERFORMANCE_LIMITS[profile];
  const light = scene.lighting;
  const fx = scene.effects;
  const volumetricCap = Math.min(0.24, light.volumetricIntensity ?? 0.16);

  // Subtle ambient mood wash (capped at 0.34 so scene details stay legible)
  ctx.save();
  const darkness = Math.max(0, Math.min(0.34, 0.56 - light.ambientIntensity * 0.65));
  if (darkness > 0.02) {
    ctx.fillStyle = light.ambientColor;
    ctx.globalAlpha = darkness;
    ctx.fillRect(0, 0, w, h);
  }
  ctx.restore();

  // Restrained directional key-light gradient
  if (light.directionalIntensity > 0.05) {
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    const rad = (light.directionalAngle * Math.PI) / 180;
    const x1 = w * 0.5 - Math.cos(rad) * w * 0.7;
    const y1 = h * 0.08 - Math.sin(rad) * h * 0.45;
    const x2 = w * 0.5 + Math.cos(rad) * w * 0.55;
    const y2 = h * 0.78 + Math.sin(rad) * h * 0.45;
    const dirGrad = ctx.createLinearGradient(x1, y1, x2, y2);
    dirGrad.addColorStop(0, `${light.directionalColor}33`);
    dirGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = Math.min(0.32, light.directionalIntensity * volumetricCap * 2.2);
    ctx.fillStyle = dirGrad;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }

  // Controlled point light (smooth low-flicker, no white blowout)
  let endingLightFactor = 1;
  if (scene.endingImpact === 'light_extinguish' && progress > 0.52) {
    const p = (progress - 0.52) / 0.48;
    // Brief tension stutter then deliberate extinguish
    endingLightFactor = p < 0.25 ? 0.55 + Math.sin(p * 30) * 0.25 : Math.max(0.06, 1 - (p - 0.25) / 0.5);
  }

  if (light.pointLightEnabled && endingLightFactor > 0.04) {
    const safeFlicker = Math.min(0.18, light.pointLightFlicker);
    const flicker =
      safeFlicker > 0
        ? 1 - Math.abs(Math.sin(timeSec * 11.3) * Math.cos(timeSec * 5.7)) * safeFlicker * 0.35
        : 1;
    const lx = light.pointLightX * w;
    const ly = light.pointLightY * h;
    const radius = Math.max(w, h) * Math.min(0.42, light.pointLightRadius) * flicker * (0.4 + 0.6 * endingLightFactor);

    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    const pGrad = ctx.createRadialGradient(lx, ly, 4, lx, ly, radius);
    pGrad.addColorStop(0, `${light.pointLightColor}3B`);
    pGrad.addColorStop(0.48, `${light.pointLightColor}14`);
    pGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = endingLightFactor;
    ctx.fillStyle = pGrad;
    ctx.fillRect(0, 0, w, h);

    // Subtle colored bloom (never opaque white wash)
    if (limits.enableBloom && (light.bloomIntensity > 0.08 || light.glowIntensity > 0.08)) {
      ctx.globalAlpha = Math.min(0.16, (light.bloomIntensity + light.glowIntensity) * 0.22) * endingLightFactor;
      const bGrad = ctx.createRadialGradient(lx, ly, 2, lx, ly, radius * 0.72);
      bGrad.addColorStop(0, light.pointLightColor);
      bGrad.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = bGrad;
      ctx.fillRect(0, 0, w, h);
    }
    ctx.restore();
  }

  // Subtle film grain (skipped in Econômico profile)
  if (limits.enableFilmGrain && fx.filmGrain > 0.05) {
    ctx.save();
    const safeGrain = Math.min(0.24, fx.filmGrain);
    const specks = Math.round(90 * safeGrain);
    ctx.fillStyle = `rgba(255, 255, 255, ${safeGrain * 0.1})`;
    for (let i = 0; i < specks; i++) {
      const gx = ((((Math.sin(timeSec * 91 + i * 12.9898) * 43758.5453) % 1) + 1) % 1) * w;
      const gy = ((((Math.cos(timeSec * 73 + i * 78.233) * 43758.5453) % 1) + 1) % 1) * h;
      ctx.fillRect(gx, gy, 1.3, 1.3);
    }
    ctx.restore();
  }

  // Clean framing vignette (capped so corners never crush to muddy black)
  if (fx.vignette > 0.04) {
    ctx.save();
    const extraEndingVignette =
      scene.endingImpact && scene.endingImpact !== 'none' && progress > 0.55
        ? smoothstep((progress - 0.55) / 0.45) * 0.24
        : 0;
    const vStrength = Math.min(0.76, fx.vignette * 0.72 + extraEndingVignette);
    const vGrad = ctx.createRadialGradient(
      w * 0.5,
      h * 0.5,
      Math.min(w, h) * 0.34,
      w * 0.5,
      h * 0.5,
      Math.max(w, h) * 0.74
    );
    vGrad.addColorStop(0, 'rgba(0,0,0,0)');
    vGrad.addColorStop(1, `rgba(0,0,0,${vStrength})`);
    ctx.fillStyle = vGrad;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }

  // High-impact ending visual beat (dramatic climax hold, crisp fade-out, or instant hard cut to black)
  if (scene.endingImpact && scene.endingImpact !== 'none') {
    const remainingSec = Math.max(0, scene.duration * (1 - progress));
    if (scene.endingImpact === 'cut_to_black') {
      // Brief crimson-tension pulse right before impact cut, then instant pure-black smash-cut
      if (remainingSec <= 0.36) {
        ctx.save();
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, w, h);
        ctx.restore();
        return;
      } else if (remainingSec <= 0.55) {
        ctx.save();
        ctx.fillStyle = 'rgba(220, 38, 38, 0.14)';
        ctx.fillRect(0, 0, w, h);
        ctx.restore();
      }
      return;
    }

    if (scene.endingImpact === 'dramatic_reveal' && progress > 0.62 && remainingSec > 0.45) {
      const glowPulse = Math.sin(((progress - 0.62) / 0.38) * Math.PI) * 0.16;
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      const rGrad = ctx.createRadialGradient(w * 0.5, h * 0.45, 10, w * 0.5, h * 0.45, Math.max(w, h) * 0.55);
      rGrad.addColorStop(0, `${light.rimLightColor}55`);
      rGrad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalAlpha = glowPulse;
      ctx.fillStyle = rGrad;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }

    if (remainingSec < 0.45) {
      const fadeOutAlpha = smoothstep(1 - remainingSec / 0.45);
      ctx.save();
      ctx.fillStyle = `rgba(5, 7, 12, ${fadeOutAlpha})`;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }
  }
}

function computeActorRevealOpacity(actor: SceneActor, progress: number): { opacity: number; depthShift: number } {
  const mode = actor.revealMode ?? 'visible';
  if (mode === 'foreshadow') {
    const enter = actor.enterProgress ?? 0.3;
    const exit = actor.exitProgress ?? 0.74;
    if (progress < enter || progress > exit) {
      return { opacity: 0, depthShift: -0.06 };
    }
    const mid = (enter + exit) * 0.5;
    const half = Math.max(0.05, (exit - enter) * 0.5);
    const bell = 1 - Math.abs(progress - mid) / half;
    return {
      opacity: actor.opacity * smoothstep(bell),
      depthShift: -0.04 * (1 - bell),
    };
  }

  if (mode === 'emerge') {
    const enter = actor.enterProgress ?? 0.22;
    if (progress < enter) {
      return { opacity: 0, depthShift: -0.08 };
    }
    const ramp = smoothstep(Math.min(1, (progress - enter) / 0.28));
    return {
      opacity: actor.opacity * ramp,
      depthShift: -0.06 * (1 - ramp),
    };
  }

  return { opacity: actor.opacity, depthShift: 0 };
}

/**
 * Renders a single standalone scene frame (used both directly and inside dual-frame crossfades).
 */
function renderSingleSceneContent(
  ctx: CanvasRenderingContext2D,
  project: ProjectPlan,
  scene: SceneSpec,
  localTime: number,
  globalTimeSec: number,
  width: number,
  height: number,
  allCharacters: CharacterDefinition[],
  allScenarios: ScenarioDefinition[]
): void {
  const progress = scene.duration > 0 ? Math.max(0, Math.min(1, localTime / scene.duration)) : 0;
  const scenario =
    allScenarios.find((s) => s.id === scene.scenarioId) ??
    project.scenarios.find((s) => s.id === scene.scenarioId) ??
    STARTER_SCENARIOS[0];

  // Primary actor current normalized X for intelligent camera subject tracking
  const primaryActor = scene.actors[0];
  const primaryEased = primaryActor ? applyEasing(progress, primaryActor.easing) : 0.5;
  const subjectNormX = primaryActor
    ? primaryActor.x + (primaryActor.targetX - primaryActor.x) * primaryEased
    : 0.5;

  const cam = computeCameraTransform(scene, progress, globalTimeSec, subjectNormX);
  const volumetricCap = Math.min(0.24, scene.lighting.volumetricIntensity ?? 0.16);
  const isWetFloor =
    scenario.theme === 'dark_rain_street' ||
    scenario.theme === 'cyberpunk_rain_street' ||
    scenario.theme === 'noir_rain_alley' ||
    scene.effects.rain > 0.12;

  const unitScale = height / 640;
  const protagonistDef = primaryActor
    ? project.characterBible.find((c) => c.id === primaryActor.characterId) ??
      allCharacters.find((c) => c.id === primaryActor.characterId) ??
      STARTER_CHARACTERS[0]
    : undefined;
  const shadowDef =
    project.characterBible.find((c) => c.id === 'char_shadow_entity') ??
    allCharacters.find((c) => c.id === 'char_shadow_entity') ??
    STARTER_CHARACTERS.find((c) => c.id === 'char_shadow_entity');

  const vitrineCtx: VitrineRenderContext = {
    scene,
    progress,
    protagonistDef,
    protagonistActor: primaryActor,
    shadowDef,
    unitScale,
  };

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = '#07090f';
  ctx.fillRect(0, 0, width, height);

  // Camera world transform
  ctx.save();
  ctx.translate(width / 2, height / 2);
  ctx.rotate((cam.tiltDeg * Math.PI) / 180);
  ctx.scale(cam.zoom, cam.zoom);
  ctx.translate(-width / 2 - cam.panX * width * 0.42, -height / 2 - cam.panY * height * 0.42);

  // 1. Background, depth fog, and midground layers (including live storefront vitrine reflection!)
  drawScenarioBackgroundAndMidground(ctx, scenario, scene, width, height, cam.panX, globalTimeSec, vitrineCtx);

  // 2. Characters (sorted by ground Y depth, scaled by perspective depth, synced stride speed)
  const sortedActors = [...scene.actors].sort((a, b) => a.y - b.y);
  let primaryScreenX = width * 0.42;
  let primaryScreenY = height * 0.77;

  for (const actor of sortedActors) {
    const reveal = computeActorRevealOpacity(actor, progress);
    if (reveal.opacity <= 0.01) continue;

    // Always prefer locked characterBible definition to guarantee cross-scene visual consistency
    const charDef =
      project.characterBible.find((c) => c.id === actor.characterId) ??
      allCharacters.find((c) => c.id === actor.characterId) ??
      STARTER_CHARACTERS[0];

    const eased = applyEasing(progress, actor.easing);
    const normX = actor.x + (actor.targetX - actor.x) * eased;
    const normY = actor.y + (actor.targetY - actor.y) * eased + reveal.depthShift;
    const ax = normX * width;
    const ay = normY * height;

    if (actor.id === primaryActor?.id) {
      primaryScreenX = ax;
      primaryScreenY = ay;
    }

    // Perspective depth multiplier based on Y distance from horizon (0.70..0.82)
    const depthPerspective = 0.88 + Math.max(-0.12, Math.min(0.18, (normY - 0.72) * 1.4));

    // Synchronize leg cycle cadence to real horizontal speed (prevents foot sliding)
    const distX = Math.abs(actor.targetX - actor.x);
    const speedPerSec = distX / Math.max(0.5, scene.duration);
    const strideSpeedFactor = Math.max(0.72, Math.min(1.5, 0.75 + speedPerSec * 4.2));

    const choreography = resolveActorStateAtProgress(actor, progress);

    drawArticulatedCharacter(ctx, charDef, {
      x: ax,
      y: ay,
      scale: actor.scale * unitScale * depthPerspective,
      flipX: actor.flipX,
      rotationDeg: actor.rotation,
      opacity: reveal.opacity,
      state: choreography.state,
      nextState: choreography.nextState,
      blendProgress: choreography.blend,
      expression: choreography.expression,
      lookDirection: choreography.lookDirection,
      strideSpeedFactor,
      timeSec: globalTimeSec,
      talking: Boolean(actor.dialogue && project.captions.enabled),
      rimLightColor: scene.lighting.rimLightColor,
      rimLightIntensity: scene.lighting.rimLightIntensity,
      shadowsEnabled: scene.lighting.shadowsEnabled,
      environmentLight: {
        ambientTint: scenario.ambientTint,
        directionalAngle: scene.lighting.directionalAngle,
        directionalColor: scene.lighting.directionalColor,
        directionalIntensity: scene.lighting.directionalIntensity,
        shadowIntensity: scene.lighting.shadowIntensity ?? 0.65,
        volumetricIntensity: volumetricCap,
        floorReflection: isWetFloor ? 0.55 : 0.15,
      },
    });

    // Wet ground footstep splash interaction when walking/running on rainy streets
    if (
      isWetFloor &&
      !actor.isShadowEntity &&
      (choreography.state === 'walk' || choreography.state === 'run' || choreography.state === 'sprint')
    ) {
      const stepFreq = choreography.state === 'walk' ? 5.2 : choreography.state === 'run' ? 9.0 : 12.6;
      const impactPhase = (globalTimeSec * stepFreq * strideSpeedFactor) % Math.PI;
      if (impactPhase < 0.7) {
        const splashProg = impactPhase / 0.7;
        ctx.save();
        ctx.strokeStyle = `rgba(186, 230, 253, ${(1 - splashProg) * 0.42})`;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.ellipse(ax, ay + 4 * unitScale, (6 + splashProg * 18) * unitScale, (2 + splashProg * 5) * unitScale, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    }
  }

  // 2b. Climax overlay: articulated shadow hand bursting OUT of vitrine glass to grab protagonist
  if (scene.reflectionMode === 'hand_grab') {
    const vitrineProp = scenario.props.find((p) => p.kind === 'storefront_vitrine');
    const mgLayer = scenario.layers.find((l) => l.depth === 'midground');
    const mgShift = -cam.panX * width * (mgLayer?.parallaxFactor ?? 0.58);
    if (vitrineProp) {
      drawVitrineHandGrabOverlay(
        ctx,
        vitrineProp,
        mgShift,
        width,
        height,
        primaryScreenX,
        primaryScreenY,
        progress,
        globalTimeSec
      );
    }
  }

  // 3. Independent Foreground parallax layer & framing silhouettes
  const fgLayer = scenario.layers.find((l) => l.depth === 'foreground');
  const fgShift = -cam.panX * width * (fgLayer?.parallaxFactor ?? 1.22);
  if (fgLayer?.customImageUrl) {
    const img = getCachedImage(fgLayer.customImageUrl);
    if (img) {
      ctx.save();
      ctx.globalAlpha = fgLayer.opacity;
      ctx.drawImage(img, fgShift - width * 0.12, 0, width * 1.24, height);
      ctx.restore();
    }
  }
  scenario.props
    .filter((p) => p.depth === 'foreground')
    .forEach((p) => drawScenarioProp(ctx, p, width, height, fgShift, scenario.accentColor, globalTimeSec, volumetricCap));

  ctx.restore(); // end camera world transform

  // 4. Controlled atmospheric particles
  drawParticlesAndAtmosphere(ctx, scene, width, height, globalTimeSec, project.performanceProfile);

  // 5. Clean per-scene lighting & post-FX
  drawLightingAndPostFX(ctx, scene, progress, width, height, globalTimeSec, project.performanceProfile);
}

export function findSceneAtTime(
  project: ProjectPlan,
  timeSec: number
): {
  scene: SceneSpec;
  sceneIndex: number;
  prevScene: SceneSpec | null;
  sceneStartSec: number;
  localTime: number;
  progress: number;
} | null {
  if (!project.scenes.length) return null;
  let cursor = 0;
  for (let i = 0; i < project.scenes.length; i++) {
    const sc = project.scenes[i];
    const end = cursor + sc.duration;
    if (timeSec < end || i === project.scenes.length - 1) {
      const local = Math.max(0, Math.min(sc.duration, timeSec - cursor));
      return {
        scene: sc,
        sceneIndex: i,
        prevScene: i > 0 ? project.scenes[i - 1] : null,
        sceneStartSec: cursor,
        localTime: local,
        progress: sc.duration > 0 ? local / sc.duration : 0,
      };
    }
    cursor = end;
  }
  return null;
}

export function renderProjectFrame(
  ctx: CanvasRenderingContext2D,
  project: ProjectPlan,
  timeSec: number,
  width: number,
  height: number,
  allCharacters: CharacterDefinition[],
  allScenarios: ScenarioDefinition[],
  options?: {
    showSafeArea?: boolean;
    createOffscreenCanvas?: (w: number, h: number) => HTMLCanvasElement;
  }
): void {
  const located = findSceneAtTime(project, timeSec);
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = '#07090f';
  ctx.fillRect(0, 0, width, height);

  if (!located) return;

  const { scene, prevScene, sceneStartSec, localTime } = located;

  // Complete style isolation: RETRO PIXEL EDUCATIONAL routes to its dedicated native 16-bit pixel engine
  if (project.visualStyle === 'retro_pixel_educational') {
    renderRetroPixelProjectFrame(
      ctx,
      project,
      scene,
      prevScene,
      sceneStartSec,
      localTime,
      timeSec,
      width,
      height,
      allCharacters,
      allScenarios,
      options
    );
    return;
  }

  // Render current scene frame (Cinematográfico 2D — preserved 100%)
  renderSingleSceneContent(ctx, project, scene, localTime, timeSec, width, height, allCharacters, allScenarios);

  // 6. True dual-frame smooth scene entry transitions (no fake grey flashes or horizontal glitch bars!)
  const transDur = Math.min(0.65, scene.duration * 0.24);
  if (localTime < transDur && scene.transitionIn !== 'cut') {
    const t = smoothstep(localTime / Math.max(0.01, transDur));

    if ((scene.transitionIn === 'crossfade' || scene.transitionIn === 'glitch_cut' || scene.transitionIn === 'wipe_left') && prevScene) {
      const prevCtx = getTransitionBuffer(width, height, options?.createOffscreenCanvas);
      if (prevCtx && transitionBufferCanvas) {
        // Render real outgoing frame from end of previous scene
        renderSingleSceneContent(
          prevCtx,
          project,
          prevScene,
          Math.max(0, prevScene.duration - 0.04),
          Math.max(0, sceneStartSec - 0.04),
          width,
          height,
          allCharacters,
          allScenarios
        );

        ctx.save();
        if (scene.transitionIn === 'wipe_left') {
          const splitX = width * (1 - t);
          ctx.beginPath();
          ctx.rect(0, 0, splitX, height);
          ctx.clip();
          ctx.drawImage(transitionBufferCanvas, 0, 0);
        } else {
          // Real optical crossfade dissolve
          ctx.globalAlpha = 1 - t;
          ctx.drawImage(transitionBufferCanvas, 0, 0);
        }
        ctx.restore();
      }
    } else if (scene.transitionIn === 'fade_black') {
      ctx.save();
      ctx.fillStyle = `rgba(5, 7, 12, ${1 - t})`;
      ctx.fillRect(0, 0, width, height);
      ctx.restore();
    } else if (scene.transitionIn === 'flash_white') {
      ctx.save();
      ctx.fillStyle = `rgba(255, 250, 240, ${(1 - t) * 0.45})`;
      ctx.fillRect(0, 0, width, height);
      ctx.restore();
    }
  }

  // 7. Word-by-word captions
  drawWordByWordCaption(ctx, scene, sceneStartSec, timeSec, width, height, project.captions);

  // 8. Optional Safe Area guide
  if (options?.showSafeArea) {
    ctx.save();
    const mx = width * project.captions.safeAreaMargin;
    const my = height * 0.06;
    ctx.strokeStyle = 'rgba(229, 160, 50, 0.55)';
    ctx.lineWidth = 1.25;
    ctx.setLineDash([6, 4]);
    ctx.strokeRect(mx, my, width - mx * 2, height - my * 2);
    ctx.restore();
  }
}
