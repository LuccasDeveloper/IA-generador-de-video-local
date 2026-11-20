import type {
  AnimationState,
  CharacterDefinition,
  EasingType,
  ExpressionType,
  LookDirection,
  SceneActor,
} from '../types/studio';

const spriteImageCache = new Map<string, HTMLImageElement>();

export function getCachedImage(dataUrl: string): HTMLImageElement | null {
  if (!dataUrl) return null;
  let img = spriteImageCache.get(dataUrl);
  if (!img) {
    img = new Image();
    img.src = dataUrl;
    spriteImageCache.set(dataUrl, img);
  }
  return img.complete && img.naturalWidth > 0 ? img : null;
}

export function applyEasing(t: number, easing: EasingType): number {
  const x = Math.max(0, Math.min(1, t));
  switch (easing) {
    case 'ease_in':
      return x * x * x;
    case 'ease_out':
      return 1 - Math.pow(1 - x, 3);
    case 'ease_in_out':
      return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
    case 'spring':
      return 1 - Math.exp(-6 * x) * Math.cos(x * Math.PI * 3.5);
    default:
      return x;
  }
}

export interface PoseAngles {
  hipY: number;
  hipX: number;
  torsoTilt: number;
  shoulderTwist: number;
  headTilt: number;
  leftLegUpper: number;
  leftLegLower: number;
  leftFootAngle: number;
  rightLegUpper: number;
  rightLegLower: number;
  rightFootAngle: number;
  leftArmUpper: number;
  leftArmLower: number;
  rightArmUpper: number;
  rightArmLower: number;
  mouthOpen: number;
  squashX: number;
  squashY: number;
  capeWave: number;
}

/**
 * Validates that every joint rotation stays within natural human anatomical limits
 * (prevents impossible 180-degree backward knees, dislocated elbows, or broken necks).
 */
export function validatePoseAnatomicalBounds(pose: PoseAngles): { valid: boolean; reason?: string } {
  if (Math.abs(pose.headTilt) > 0.72) {
    return { valid: false, reason: `Inclinação de cabeça fora do limite anatômico (${pose.headTilt.toFixed(2)} rad)` };
  }
  if (Math.abs(pose.torsoTilt) > 1.55) {
    return { valid: false, reason: `Inclinação de tronco fora do limite anatômico (${pose.torsoTilt.toFixed(2)} rad)` };
  }
  if (pose.leftLegLower < -0.18 || pose.leftLegLower > 2.15 || pose.rightLegLower < -0.18 || pose.rightLegLower > 2.15) {
    return { valid: false, reason: 'Hiperextensão impossível no joelho detectada.' };
  }
  if (Math.abs(pose.leftLegUpper) > 1.65 || Math.abs(pose.rightLegUpper) > 1.65) {
    return { valid: false, reason: 'Rotação de quadril fora do limite anatômico.' };
  }
  if (Math.abs(pose.leftArmLower) > 2.4 || Math.abs(pose.rightArmLower) > 2.4) {
    return { valid: false, reason: 'Ângulo de cotovelo fora do limite anatômico.' };
  }
  return { valid: true };
}

/**
 * Biomechanical 4-phase animation pose solver (Contact -> Down/Recoil -> Passing -> Up/Push-off)
 * with realistic center-of-gravity weight drop, ankle roll, counter-rotating arms,
 * follow-through head lag, and stride cadence synchronized to actor travel speed.
 */
export function computeBiomechanicalPose(
  state: AnimationState,
  timeSec: number,
  talking: boolean,
  options?: {
    strideSpeedFactor?: number; // 0.65..1.65 syncs leg cycle to ground speed
    lookDirection?: LookDirection;
  }
): PoseAngles {
  const speedMul = Math.max(0.65, Math.min(1.65, options?.strideSpeedFactor ?? 1.0));
  const look = options?.lookDirection ?? 'forward';

  const base: PoseAngles = {
    hipY: 0,
    hipX: 0,
    torsoTilt: 0,
    shoulderTwist: 0,
    headTilt: 0,
    leftLegUpper: 0.04,
    leftLegLower: -0.04,
    leftFootAngle: 0,
    rightLegUpper: -0.04,
    rightLegLower: 0.04,
    rightFootAngle: 0,
    leftArmUpper: 0.14,
    leftArmLower: -0.2,
    rightArmUpper: -0.14,
    rightArmLower: -0.22,
    mouthOpen: 0,
    squashX: 1,
    squashY: 1,
    capeWave: Math.sin(timeSec * 3.0) * 6,
  };

  const w = timeSec;
  switch (state) {
    case 'idle': {
      // Organic breathing + subtle weight shift + attentive micro-motion (never frozen)
      const breath = Math.sin(w * 2.3);
      const weightShift = Math.sin(w * 1.15);
      base.hipY = breath * 2.8 + Math.abs(weightShift) * 1.1;
      base.hipX = weightShift * 2.2;
      base.torsoTilt = breath * 0.03 + weightShift * 0.025;
      base.shoulderTwist = weightShift * 0.04;
      base.headTilt = Math.sin(w * 1.65) * 0.055;
      base.leftLegUpper = 0.06 + weightShift * 0.04;
      base.leftLegLower = 0.06;
      base.rightLegUpper = -0.06 + weightShift * 0.04;
      base.rightLegLower = 0.08;
      base.leftArmUpper = 0.15 + breath * 0.045;
      base.leftArmLower = -0.24 - breath * 0.03;
      base.rightArmUpper = -0.22 - breath * 0.05;
      base.rightArmLower = -0.34 + Math.sin(w * 1.9) * 0.06;
      base.capeWave = Math.sin(w * 2.6) * 5;
      break;
    }
    case 'walk': {
      // Full 4-phase walk cycle: Contact -> Down (weight absorption) -> Passing -> Up
      const phase = w * 5.2 * speedMul;
      const s = Math.sin(phase);
      const c = Math.cos(phase);
      // Center of gravity drops sharply after heel contact (2x frequency with phase lag for recoil)
      const verticalBounce = -Math.cos(2 * phase - 0.55);
      const impactCompression = Math.max(0, Math.cos(2 * phase - 0.35));

      base.hipY = verticalBounce * 6.5 + impactCompression * 2.8;
      base.hipX = c * 2.0;
      base.torsoTilt = 0.095 + Math.sin(2 * phase - 0.4) * 0.032;
      base.shoulderTwist = -s * 0.08;
      // Head stabilizes & lags behind torso bob (overlapping action)
      base.headTilt = -0.05 - Math.sin(2 * phase - 0.9) * 0.035;

      // Asymmetric stance (planted push-back) vs swing (lifted knee)
      const leftSwing = Math.max(0, s);
      const rightSwing = Math.max(0, -s);
      base.leftLegUpper = s * 0.56;
      base.leftLegLower = leftSwing * 0.34 + Math.max(0, -c) * 0.52 + 0.06;
      base.leftFootAngle = c * 0.24 - leftSwing * 0.14;

      base.rightLegUpper = -s * 0.56;
      base.rightLegLower = rightSwing * 0.34 + Math.max(0, c) * 0.52 + 0.06;
      base.rightFootAngle = -c * 0.24 - rightSwing * 0.14;

      // Natural counter-swinging arms with elbow lag
      base.leftArmUpper = -s * 0.46;
      base.leftArmLower = -0.26 - Math.max(0, s - 0.15) * 0.32;
      base.rightArmUpper = s * 0.42 - 0.08;
      base.rightArmLower = -0.32 - Math.max(0, -s - 0.15) * 0.28;

      base.squashX = 1 + impactCompression * 0.028;
      base.squashY = 1 - impactCompression * 0.025;
      base.capeWave = -11 - speedMul * 4 + Math.sin(phase - 0.7) * 8;
      break;
    }
    case 'run': {
      // Airborne flight + heavy landing compression
      const phase = w * 9.0 * speedMul;
      const s = Math.sin(phase);
      const c = Math.cos(phase);
      const flightBounce = -Math.cos(2 * phase - 0.45);
      const landingRecoil = Math.max(0, Math.cos(2 * phase - 0.25));

      base.hipY = flightBounce * 11.5 - 3 + landingRecoil * 4.5;
      base.hipX = c * 3.2;
      base.torsoTilt = 0.26 + Math.sin(2 * phase) * 0.05;
      base.shoulderTwist = -s * 0.14;
      base.headTilt = -0.14 - Math.sin(2 * phase - 0.8) * 0.04;

      base.leftLegUpper = s * 0.88 + 0.06;
      base.leftLegLower = Math.max(0, -c) * 0.98 + 0.14;
      base.leftFootAngle = c * 0.32;

      base.rightLegUpper = -s * 0.88 + 0.06;
      base.rightLegLower = Math.max(0, c) * 0.98 + 0.14;
      base.rightFootAngle = -c * 0.32;

      base.leftArmUpper = -s * 0.82;
      base.leftArmLower = -0.92 + Math.sin(phase - 0.5) * 0.18;
      base.rightArmUpper = s * 0.82;
      base.rightArmLower = -0.92 - Math.sin(phase - 0.5) * 0.18;

      base.squashX = 1 + landingRecoil * 0.045;
      base.squashY = 1 - landingRecoil * 0.04;
      base.capeWave = -24 + Math.sin(phase - 0.6) * 10;
      break;
    }
    case 'sprint': {
      const phase = w * 12.6 * speedMul;
      const s = Math.sin(phase);
      const c = Math.cos(phase);
      const bounce = -Math.cos(2 * phase - 0.4);
      base.hipY = bounce * 14 - 4;
      base.torsoTilt = 0.38 + Math.sin(2 * phase) * 0.05;
      base.shoulderTwist = -s * 0.18;
      base.headTilt = -0.2;
      base.leftLegUpper = s * 1.04 + 0.08;
      base.leftLegLower = Math.max(0, -c) * 1.18 + 0.16;
      base.leftFootAngle = c * 0.36;
      base.rightLegUpper = -s * 1.04 + 0.08;
      base.rightLegLower = Math.max(0, c) * 1.18 + 0.16;
      base.rightFootAngle = -c * 0.36;
      base.leftArmUpper = -s * 1.02;
      base.leftArmLower = -1.08;
      base.rightArmUpper = s * 1.02;
      base.rightArmLower = -1.08;
      base.squashX = 1.05;
      base.squashY = 0.96;
      base.capeWave = -32 + Math.sin(phase - 0.5) * 11;
      break;
    }
    case 'jump': {
      // Anticipation crouch -> takeoff stretch -> apex tuck
      const cyc = (w * 1.35) % 1;
      if (cyc < 0.22) {
        const p = cyc / 0.22;
        base.hipY = p * 16;
        base.torsoTilt = 0.24 * p;
        base.leftLegUpper = -0.45 * p;
        base.leftLegLower = 0.85 * p;
        base.rightLegUpper = -0.35 * p;
        base.rightLegLower = 0.78 * p;
        base.squashX = 1 + 0.07 * p;
        base.squashY = 1 - 0.08 * p;
      } else {
        const air = Math.sin(((cyc - 0.22) / 0.78) * Math.PI);
        base.hipY = -52 * air - 6;
        base.torsoTilt = 0.12 - air * 0.08;
        base.leftLegUpper = -0.58;
        base.leftLegLower = 0.98;
        base.leftFootAngle = 0.28;
        base.rightLegUpper = 0.34;
        base.rightLegLower = 0.56;
        base.rightFootAngle = 0.22;
        base.leftArmUpper = -1.15;
        base.leftArmLower = -0.45;
        base.rightArmUpper = -0.85;
        base.rightArmLower = -0.45;
        base.squashX = 0.93;
        base.squashY = 1.08;
      }
      base.capeWave = -20;
      break;
    }
    case 'fall': {
      const flail = Math.sin(w * 8.5);
      base.hipY = -18 + Math.sin(w * 4.2) * 5;
      base.torsoTilt = -0.15;
      base.leftLegUpper = 0.26 + flail * 0.2;
      base.leftLegLower = 0.55;
      base.leftFootAngle = 0.25;
      base.rightLegUpper = -0.22 - flail * 0.2;
      base.rightLegLower = 0.45;
      base.rightFootAngle = 0.2;
      base.leftArmUpper = -2.1 + flail * 0.24;
      base.leftArmLower = -0.35;
      base.rightArmUpper = -1.95 - flail * 0.24;
      base.rightArmLower = -0.35;
      base.capeWave = -26;
      break;
    }
    case 'attack': {
      // Anticipation windup -> strike -> follow-through
      const cyc = (w * 1.6) % 1;
      const swing = cyc < 0.3 ? -Math.sin((cyc / 0.3) * Math.PI * 0.5) : Math.sin(((cyc - 0.3) / 0.7) * Math.PI * 1.15);
      base.hipY = 5 + Math.abs(swing) * 3;
      base.torsoTilt = 0.24 + swing * 0.18;
      base.shoulderTwist = swing * 0.22;
      base.leftLegUpper = -0.44;
      base.leftLegLower = 0.38;
      base.rightLegUpper = 0.46;
      base.rightLegLower = 0.18;
      base.rightArmUpper = -1.35 + swing * 1.2;
      base.rightArmLower = -0.3 + Math.max(0, swing) * 0.32;
      base.leftArmUpper = 0.52;
      base.leftArmLower = -0.62;
      base.capeWave = -18 + swing * 16;
      break;
    }
    case 'hit': {
      // Startle / recoil jolt with realistic torso snap-back and defensive arms
      const jolt = Math.exp(-((w * 2.4) % 1.8) * 2.5) * Math.sin(w * 15);
      base.hipY = 7 + Math.abs(jolt) * 4;
      base.hipX = -5 - jolt * 4;
      base.torsoTilt = -0.32 - Math.abs(jolt) * 0.14;
      base.headTilt = -0.22 + jolt * 0.1;
      base.leftArmUpper = -0.78;
      base.leftArmLower = -0.88;
      base.rightArmUpper = -0.96;
      base.rightArmLower = -0.65;
      base.leftLegUpper = -0.28;
      base.leftLegLower = 0.35;
      base.rightLegUpper = 0.24;
      base.rightLegLower = 0.18;
      base.mouthOpen = 0.68;
      base.squashX = 1.05;
      base.squashY = 0.94;
      break;
    }
    case 'death': {
      const collapse = Math.min(1, (w % 3.5) / 1.1);
      base.hipY = collapse * 56;
      base.torsoTilt = -collapse * 1.38;
      base.headTilt = -collapse * 0.35;
      base.leftArmUpper = -collapse * 0.9;
      base.rightArmUpper = collapse * 0.6;
      base.leftLegUpper = collapse * 0.3;
      base.rightLegUpper = -collapse * 0.2;
      break;
    }
    case 'talk': {
      const gesture = Math.sin(w * 3.8);
      const emph = Math.cos(w * 2.3);
      base.hipY = Math.sin(w * 2.1) * 2.2;
      base.torsoTilt = gesture * 0.05;
      base.headTilt = Math.sin(w * 2.9) * 0.09;
      base.rightArmUpper = -0.58 + gesture * 0.28;
      base.rightArmLower = -0.78 + emph * 0.24;
      base.leftArmUpper = 0.22 - gesture * 0.16;
      base.leftArmLower = -0.48 + emph * 0.12;
      base.mouthOpen = 0.24 + Math.abs(Math.sin(w * 11.2)) * 0.72;
      break;
    }
    case 'custom': {
      const sway = Math.sin(w * 3.4);
      base.hipY = Math.sin(w * 3.4) * 4;
      base.torsoTilt = sway * 0.1;
      base.rightArmUpper = -0.92 + sway * 0.26;
      base.rightArmLower = -0.45;
      base.leftArmUpper = 0.45 - sway * 0.2;
      base.leftArmLower = -0.35;
      break;
    }
  }

  // Expressive lookDirection overrides (looking upstairs, scanning room, glancing over shoulder)
  if (look === 'up') {
    base.headTilt -= 0.28;
    base.torsoTilt -= 0.05;
    base.rightArmUpper -= 0.35; // raises flashlight/lantern upward toward upstairs sound
  } else if (look === 'back') {
    base.headTilt -= 0.14;
    base.shoulderTwist -= 0.18;
    base.rightArmUpper -= 0.18;
  } else if (look === 'scan') {
    const scanOsc = Math.sin(w * 2.1);
    base.headTilt += scanOsc * 0.16;
    base.rightArmUpper += scanOsc * 0.24;
    base.rightArmLower += Math.cos(w * 2.1) * 0.12;
  }

  if (talking && state !== 'death') {
    base.mouthOpen = Math.max(base.mouthOpen, 0.2 + Math.abs(Math.sin(w * 12.2)) * 0.7);
  }
  return base;
}

function lerpPose(a: PoseAngles, b: PoseAngles, t: number): PoseAngles {
  const mix = (x: number, y: number) => x + (y - x) * t;
  return {
    hipY: mix(a.hipY, b.hipY),
    hipX: mix(a.hipX, b.hipX),
    torsoTilt: mix(a.torsoTilt, b.torsoTilt),
    shoulderTwist: mix(a.shoulderTwist, b.shoulderTwist),
    headTilt: mix(a.headTilt, b.headTilt),
    leftLegUpper: mix(a.leftLegUpper, b.leftLegUpper),
    leftLegLower: mix(a.leftLegLower, b.leftLegLower),
    leftFootAngle: mix(a.leftFootAngle, b.leftFootAngle),
    rightLegUpper: mix(a.rightLegUpper, b.rightLegUpper),
    rightLegLower: mix(a.rightLegLower, b.rightLegLower),
    rightFootAngle: mix(a.rightFootAngle, b.rightFootAngle),
    leftArmUpper: mix(a.leftArmUpper, b.leftArmUpper),
    leftArmLower: mix(a.leftArmLower, b.leftArmLower),
    rightArmUpper: mix(a.rightArmUpper, b.rightArmUpper),
    rightArmLower: mix(a.rightArmLower, b.rightArmLower),
    mouthOpen: mix(a.mouthOpen, b.mouthOpen),
    squashX: mix(a.squashX, b.squashX),
    squashY: mix(a.squashY, b.squashY),
    capeWave: mix(a.capeWave, b.capeWave),
  };
}

/**
 * Draws a seamless tapered anatomical limb segment (organic curve + subtle inner crease shade)
 * WITHOUT harsh dark joint rings that make 2D rigs look like bolted wooden puppets.
 */
function drawLimbSegment(
  ctx: CanvasRenderingContext2D,
  length: number,
  topWidth: number,
  bottomWidth: number,
  fill: string,
  shadeColor = 'rgba(0,0,0,0.22)',
  cuffColor?: string
) {
  ctx.beginPath();
  ctx.moveTo(-topWidth * 0.5, -topWidth * 0.12);
  ctx.bezierCurveTo(
    -topWidth * 0.58,
    length * 0.34,
    -bottomWidth * 0.56,
    length * 0.72,
    -bottomWidth * 0.5,
    length
  );
  ctx.quadraticCurveTo(0, length + bottomWidth * 0.35, bottomWidth * 0.5, length);
  ctx.bezierCurveTo(
    bottomWidth * 0.56,
    length * 0.72,
    topWidth * 0.58,
    length * 0.34,
    topWidth * 0.5,
    -topWidth * 0.12
  );
  ctx.quadraticCurveTo(0, -topWidth * 0.42, -topWidth * 0.5, -topWidth * 0.12);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();

  // Soft directional volume shading along back edge (replaces rigid black cartoon border)
  ctx.save();
  ctx.clip();
  ctx.fillStyle = shadeColor;
  ctx.fillRect(-topWidth * 0.65, -topWidth * 0.5, topWidth * 0.42, length + topWidth);
  if (cuffColor) {
    ctx.fillStyle = cuffColor;
    ctx.fillRect(-bottomWidth * 0.6, length - 4.5, bottomWidth * 1.2, 4.5);
  }
  ctx.restore();
}

/**
 * Draws an articulated 2D human hand with sculpted palm, opposable thumb, and curled fingers
 * (replaces flat oval blob hands).
 */
function drawExpressiveHand(
  ctx: CanvasRenderingContext2D,
  skinColor: string,
  skinShadow: string,
  isGripping: boolean
) {
  ctx.save();
  // Palm
  ctx.fillStyle = skinColor;
  ctx.beginPath();
  ctx.moveTo(-3.2, -1);
  ctx.quadraticCurveTo(-4.2, 3.8, -2.2, 6.2);
  ctx.lineTo(3.4, 5.8);
  ctx.quadraticCurveTo(4.8, 2.6, 3.5, -1);
  ctx.closePath();
  ctx.fill();

  // Opposable thumb
  ctx.fillStyle = skinShadow;
  ctx.beginPath();
  ctx.ellipse(3.6, 2.2, 1.5, 3.1, isGripping ? 0.55 : -0.35, 0, Math.PI * 2);
  ctx.fill();

  // Curled fingers (4 subtle articulated digits)
  ctx.fillStyle = skinColor;
  const fingerCurl = isGripping ? 2.6 : 4.2;
  for (let f = 0; f < 3; f++) {
    const fx = -2.2 + f * 2.0;
    ctx.beginPath();
    ctx.roundRect(fx, 4.4, 1.65, fingerCurl, 0.8);
    ctx.fill();
  }
  ctx.restore();
}

export interface CharacterEnvironmentLight {
  ambientTint?: string;
  directionalAngle?: number;
  directionalColor?: string;
  directionalIntensity?: number;
  shadowIntensity?: number;
  volumetricIntensity?: number;
  floorReflection?: number;
}

export function drawArticulatedCharacter(
  ctx: CanvasRenderingContext2D,
  character: CharacterDefinition,
  options: {
    x: number;
    y: number;
    scale: number;
    flipX?: boolean;
    rotationDeg?: number;
    opacity?: number;
    state: AnimationState;
    nextState?: AnimationState;
    blendProgress?: number; // 0..1
    expression: ExpressionType;
    lookDirection?: LookDirection;
    strideSpeedFactor?: number;
    timeSec: number;
    talking?: boolean;
    rimLightColor?: string;
    rimLightIntensity?: number;
    shadowsEnabled?: boolean;
    environmentLight?: CharacterEnvironmentLight;
  }
): void {
  const effectiveOpacity = options.opacity ?? 1;
  if (effectiveOpacity <= 0.01) return;

  // Enforce locked palette & canonical proportions from persistent visualSheet when available
  const sheet = character.visualSheet;
  const pal = sheet?.lockedPalette ?? character.palette;
  const outfitStyle = sheet?.lockedOutfitStyle ?? character.outfitStyle;
  const hairStyle = sheet?.lockedHairStyle ?? character.hairStyle;
  const accessory = sheet?.lockedAccessory ?? character.accessory;

  const isSpectral = outfitStyle === 'spectral' || character.build === 'ethereal';
  const buildWidth = sheet?.shoulderWidthRatio ?? (character.build === 'slim' ? 0.88 : character.build === 'tall' ? 1.02 : 1.0);
  const buildHeight = sheet?.heightRatio ?? (character.build === 'tall' || isSpectral ? 1.12 : 1.0);

  const env = options.environmentLight;
  const shadowStrength = Math.max(0, Math.min(1, env?.shadowIntensity ?? 0.65));
  const dirAngleRad = ((env?.directionalAngle ?? 35) * Math.PI) / 180;
  const volumetricCap = Math.max(0.05, Math.min(0.24, env?.volumetricIntensity ?? 0.16));

  ctx.save();
  ctx.globalAlpha = effectiveOpacity;

  // 1. Directional cast shadow + grounded contact occlusion shadow (integrates actor into floor plane)
  if (options.shadowsEnabled !== false) {
    // Ground contact shadow directly beneath feet
    ctx.save();
    ctx.translate(options.x, options.y + 4 * options.scale);
    ctx.scale(1, 0.24);
    const shGrad = ctx.createRadialGradient(0, 0, 3, 0, 0, 44 * options.scale);
    shGrad.addColorStop(0, `rgba(0, 0, 0, ${0.62 * shadowStrength})`);
    shGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = shGrad;
    ctx.beginPath();
    ctx.arc(0, 0, 44 * options.scale, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Directional projected shadow skewed opposite to scene key light
    ctx.save();
    const skewX = Math.cos(dirAngleRad) * 1.15;
    ctx.translate(options.x + skewX * 26 * options.scale, options.y + 7 * options.scale);
    ctx.rotate(Math.sin(dirAngleRad) * 0.12);
    ctx.scale(1.35, 0.22);
    const castGrad = ctx.createRadialGradient(0, 0, 6, 0, 0, 72 * options.scale);
    castGrad.addColorStop(0, `rgba(0, 0, 0, ${0.42 * shadowStrength})`);
    castGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = castGrad;
    ctx.beginPath();
    ctx.arc(0, 0, 72 * options.scale, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Subtle floor reflection for wet/dark environments
  if (env?.floorReflection && env.floorReflection > 0.04 && !isSpectral) {
    ctx.save();
    ctx.globalAlpha = effectiveOpacity * env.floorReflection * 0.22;
    ctx.translate(options.x, options.y + 6 * options.scale);
    ctx.scale(1, -0.34);
    const refGrad = ctx.createLinearGradient(0, 0, 0, -135 * options.scale);
    refGrad.addColorStop(0, pal.outfitPrimary);
    refGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = refGrad;
    ctx.beginPath();
    ctx.ellipse(0, -48 * options.scale, 22 * options.scale, 58 * options.scale, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // If character is a PNG spritesheet, render cropped frame with real pivot & FPS
  if (character.kind === 'spritesheet' && character.spritesheet) {
    const sp = character.spritesheet;
    const img = getCachedImage(sp.imageDataUrl);
    if (img) {
      const clip = sp.clips[options.state] ?? sp.clips.idle;
      const frames = clip && clip.frames.length > 0 ? clip.frames : sp.frameOrder;
      const fps = clip?.fps ?? sp.fps ?? 12;
      const idx = frames.length > 0 ? Math.floor(options.timeSec * fps) % frames.length : 0;
      const frameNum = frames[idx] ?? 0;
      const col = frameNum % Math.max(1, sp.cols);
      const row = Math.floor(frameNum / Math.max(1, sp.cols));
      const sx = col * sp.frameWidth;
      const sy = row * sp.frameHeight;

      const targetH = 185 * options.scale * buildHeight;
      const aspect = sp.frameWidth / Math.max(1, sp.frameHeight);
      const targetW = targetH * aspect;

      ctx.translate(options.x, options.y);
      if (options.rotationDeg) ctx.rotate((options.rotationDeg * Math.PI) / 180);
      if (options.flipX) ctx.scale(-1, 1);

      ctx.drawImage(
        img,
        sx,
        sy,
        sp.frameWidth,
        sp.frameHeight,
        -targetW * sp.pivotX,
        -targetH * sp.pivotY,
        targetW,
        targetH
      );
      ctx.restore();
      return;
    }
  }

  // Compute smooth blended biomechanical pose
  const p1 = computeBiomechanicalPose(options.state, options.timeSec, Boolean(options.talking), {
    strideSpeedFactor: options.strideSpeedFactor,
    lookDirection: options.lookDirection,
  });
  const pose =
    options.nextState && options.blendProgress && options.blendProgress > 0
      ? lerpPose(
          p1,
          computeBiomechanicalPose(options.nextState, options.timeSec, Boolean(options.talking), {
            strideSpeedFactor: options.strideSpeedFactor,
            lookDirection: options.lookDirection,
          }),
          applyEasing(options.blendProgress, 'ease_in_out')
        )
      : p1;

  ctx.translate(options.x + pose.hipX * options.scale, options.y);
  if (options.rotationDeg) ctx.rotate((options.rotationDeg * Math.PI) / 180);
  if (options.flipX) ctx.scale(-1, 1);
  ctx.scale(options.scale * pose.squashX * buildWidth, options.scale * pose.squashY * buildHeight);

  // Clean directional rim light edge (no washed-out halo)
  if (options.rimLightIntensity && options.rimLightIntensity > 0.08) {
    ctx.shadowColor = options.rimLightColor ?? '#60a5fa';
    ctx.shadowBlur = Math.min(10, 9 * options.rimLightIntensity);
    ctx.shadowOffsetX = Math.cos(dirAngleRad) * 2.2;
    ctx.shadowOffsetY = -1.2;
  }

  // Controlled spectral shadow wisp (never obscures character silhouette)
  if (accessory.type === 'shadow_aura' || isSpectral) {
    ctx.save();
    ctx.shadowBlur = 0;
    for (let i = 0; i < 3; i++) {
      const sway = Math.sin(options.timeSec * 2.8 + i * 1.5) * 10;
      const g = ctx.createRadialGradient(sway, -92 - i * 16, 4, sway, -92 - i * 16, 42);
      g.addColorStop(0, 'rgba(6, 8, 16, 0.56)');
      g.addColorStop(1, 'rgba(6, 8, 16, 0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(sway, -92 - i * 16, 42, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  const hipOriginY = -78 + pose.hipY;

  // Dual-layered flowing coat / cape tail behind legs with realistic fabric weight lag
  if (outfitStyle === 'coat' || accessory.type === 'cape' || outfitStyle === 'spectral') {
    ctx.save();
    ctx.translate(0, hipOriginY - 38);
    ctx.rotate(pose.torsoTilt * 0.58);
    // Inner dark coat lining
    ctx.beginPath();
    ctx.moveTo(-12, 6);
    ctx.quadraticCurveTo(-20 + pose.capeWave * 0.45, 50, -18 + pose.capeWave * 0.82, 92);
    ctx.lineTo(13 + pose.capeWave * 0.35, 89);
    ctx.quadraticCurveTo(16, 48, 11, 6);
    ctx.closePath();
    ctx.fillStyle = '#090d16';
    ctx.fill();

    // Outer tailored trench coat silhouette
    ctx.beginPath();
    ctx.moveTo(-15, 2);
    ctx.quadraticCurveTo(-27 + pose.capeWave * 0.55, 48, -25 + pose.capeWave, 96);
    ctx.lineTo(14 + pose.capeWave * 0.4, 92);
    ctx.quadraticCurveTo(18, 46, 13, 2);
    ctx.closePath();
    ctx.fillStyle = pal.outfitPrimary;
    ctx.fill();
    ctx.restore();
  }

  // Seamless anatomical leg with knee crease + sculpted boot & sole
  const drawLeg = (upperAngle: number, lowerAngle: number, footAngle: number, shade: boolean) => {
    ctx.save();
    ctx.translate(shade ? -4.5 : 4.5, hipOriginY);
    ctx.rotate(upperAngle);
    drawLimbSegment(ctx, 36, 13.5, 9.8, shade ? pal.boots : pal.pants, 'rgba(0,0,0,0.28)');
    ctx.translate(0, 35);
    ctx.rotate(lowerAngle);
    drawLimbSegment(ctx, 34, 9.6, 7.2, shade ? pal.boots : pal.pants, 'rgba(0,0,0,0.26)', pal.boots);
    // Sculpted ankle & boot with heel + sole edge
    ctx.translate(0, 33);
    ctx.rotate(footAngle);
    ctx.beginPath();
    ctx.moveTo(-5.2, -3);
    ctx.lineTo(5, -2);
    ctx.quadraticCurveTo(11, 1.5, 15.5, 4.5);
    ctx.quadraticCurveTo(17.5, 7.6, 13.5, 9.5);
    ctx.lineTo(-6.2, 9.5);
    ctx.closePath();
    ctx.fillStyle = pal.boots;
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(-5, 7.4, 19, 1.6);
    ctx.restore();
  };

  // Seamless anatomical arm with jacket cuff + expressive articulated hand
  const drawArm = (upperAngle: number, lowerAngle: number, isFront: boolean) => {
    ctx.save();
    const twistShift = pose.shoulderTwist * (isFront ? 13 : -13);
    ctx.translate((isFront ? 6 : -6.5) + twistShift, -44);
    ctx.rotate(upperAngle);
    drawLimbSegment(ctx, 27, 10.6, 8.2, isFront ? pal.outfitPrimary : pal.outfitSecondary, 'rgba(0,0,0,0.24)');
    ctx.translate(0, 26);
    ctx.rotate(lowerAngle);
    drawLimbSegment(
      ctx,
      24,
      8.0,
      6.2,
      isFront ? pal.outfitPrimary : pal.outfitSecondary,
      'rgba(0,0,0,0.22)',
      pal.outfitSecondary
    );
    // Expressive hand with thumb & fingers
    ctx.translate(0, 24);
    const holdsTool = isFront && (accessory.type === 'flashlight' || accessory.type === 'lantern' || accessory.type === 'sword');
    drawExpressiveHand(ctx, pal.skin, pal.skinShadow, holdsTool);

    if (isFront) {
      if (accessory.type === 'flashlight') {
        ctx.save();
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#334155';
        ctx.fillRect(0, -1, 16, 6);
        ctx.fillStyle = '#fde68a';
        ctx.fillRect(15, -2, 3, 8);
        // Clean, restrained volumetric flashlight cone (never overwashing details)
        const beamGrad = ctx.createLinearGradient(18, 2, 165, 2);
        beamGrad.addColorStop(0, `rgba(254, 240, 138, ${volumetricCap})`);
        beamGrad.addColorStop(0.5, `rgba(254, 240, 138, ${volumetricCap * 0.35})`);
        beamGrad.addColorStop(1, 'rgba(254, 240, 138, 0)');
        ctx.fillStyle = beamGrad;
        ctx.beginPath();
        ctx.moveTo(18, -1);
        ctx.lineTo(165, -36);
        ctx.lineTo(165, 40);
        ctx.lineTo(18, 5);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      } else if (accessory.type === 'lantern') {
        ctx.save();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = '#92400e';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(4, 5);
        ctx.lineTo(4, 16);
        ctx.stroke();
        ctx.fillStyle = '#fef08a';
        ctx.fillRect(-2, 16, 12, 15);
        ctx.strokeRect(-2, 16, 12, 15);
        const halo = ctx.createRadialGradient(4, 23, 2, 4, 23, 38);
        halo.addColorStop(0, `rgba(251, 191, 36, ${volumetricCap * 1.4})`);
        halo.addColorStop(1, 'rgba(251, 191, 36, 0)');
        ctx.fillStyle = halo;
        ctx.beginPath();
        ctx.arc(4, 23, 38, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      } else if (accessory.type === 'sword') {
        ctx.fillStyle = '#94a3b8';
        ctx.beginPath();
        ctx.moveTo(4, 0);
        ctx.lineTo(48, -10);
        ctx.lineTo(54, -7);
        ctx.lineTo(46, -2);
        ctx.lineTo(4, 5);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = pal.accent;
        ctx.fillRect(0, -5, 5, 14);
      }
    }
    ctx.restore();
  };

  // 1. Back leg
  drawLeg(pose.leftLegUpper, pose.leftLegLower, pose.leftFootAngle, true);

  // 2. Torso root (pivots at hips)
  ctx.save();
  ctx.translate(0, hipOriginY);
  ctx.rotate(pose.torsoTilt);

  // Back arm behind torso
  drawArm(pose.leftArmUpper, pose.leftArmLower, false);

  // Front leg
  ctx.save();
  ctx.rotate(-pose.torsoTilt);
  ctx.translate(0, -hipOriginY);
  drawLeg(pose.rightLegUpper, pose.rightLegLower, pose.rightFootAngle, false);
  ctx.restore();

  // Sculpted anatomical torso with natural trapezius shoulders, tapered waist, and lapel depth
  const torsoGrad = ctx.createLinearGradient(-18, -52, 18, 6);
  torsoGrad.addColorStop(0, pal.outfitSecondary);
  torsoGrad.addColorStop(0.55, pal.outfitPrimary);
  torsoGrad.addColorStop(1, '#0b101b');
  ctx.fillStyle = torsoGrad;
  ctx.beginPath();
  ctx.moveTo(-7, -53);
  ctx.lineTo(-17, -47);
  ctx.quadraticCurveTo(-18, -32, -13, -12);
  ctx.lineTo(-13.5, 5);
  ctx.quadraticCurveTo(0, 9, 13.5, 5);
  ctx.lineTo(13, -12);
  ctx.quadraticCurveTo(18, -32, 17, -47);
  ctx.lineTo(7, -53);
  ctx.closePath();
  ctx.fill();

  // Ambient scene tint integration on torso shadow side
  if (env?.ambientTint) {
    ctx.save();
    ctx.globalAlpha = effectiveOpacity * 0.22;
    ctx.fillStyle = env.ambientTint;
    ctx.fill();
    ctx.restore();
  }

  // Tailored coat lapels, inner shirt collar, buttons & belt
  if (outfitStyle === 'cyber_suit') {
    ctx.fillStyle = pal.accent;
    ctx.fillRect(-10, -34, 20, 2.8);
    ctx.fillRect(-6, -22, 12, 2.2);
  } else {
    // Inner dark shirt V
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.moveTo(-6, -52);
    ctx.lineTo(1.5, -31);
    ctx.lineTo(7, -52);
    ctx.closePath();
    ctx.fill();
    // Structured notched coat lapels
    ctx.fillStyle = pal.outfitSecondary;
    ctx.beginPath();
    ctx.moveTo(-7, -52);
    ctx.lineTo(-12, -37);
    ctx.lineTo(-2, -31);
    ctx.closePath();
    ctx.moveTo(7, -52);
    ctx.lineTo(12, -37);
    ctx.lineTo(2, -31);
    ctx.closePath();
    ctx.fill();
    // Subtle vertical coat seam & buttons
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(1.5, -31);
    ctx.lineTo(1.5, 5);
    ctx.stroke();
    ctx.fillStyle = pal.accent;
    ctx.beginPath();
    ctx.arc(4.2, -21, 1.3, 0, Math.PI * 2);
    ctx.arc(4.2, -12, 1.3, 0, Math.PI * 2);
    ctx.fill();
    // Belt
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(-13.2, -6, 26.4, 4.5);
    ctx.fillStyle = pal.accent;
    ctx.fillRect(-2.5, -6, 5.5, 4.5);
  }

  // Flowing scarf if equipped
  if (accessory.type === 'scarf') {
    ctx.fillStyle = accessory.color;
    ctx.beginPath();
    ctx.roundRect(-12, -53, 24, 8.5, 4);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-10, -48);
    ctx.quadraticCurveTo(-24 + pose.capeWave * 0.4, -36, -28 + pose.capeWave * 0.7, -18);
    ctx.lineTo(-18 + pose.capeWave * 0.6, -15);
    ctx.quadraticCurveTo(-14, -32, -4, -44);
    ctx.closePath();
    ctx.fill();
  }

  // Tapered anatomical neck with under-chin shadow
  ctx.fillStyle = pal.skinShadow;
  ctx.beginPath();
  ctx.moveTo(-4.8, -62);
  ctx.lineTo(4.8, -62);
  ctx.lineTo(6.2, -49);
  ctx.lineTo(-6.2, -49);
  ctx.closePath();
  ctx.fill();

  // 3. Sculpted Head & Expressive Face (refined 1:7 proportions, defined jaw, nose bridge & eyelids)
  ctx.save();
  ctx.translate(0, -70);
  ctx.rotate(pose.headTilt);

  const headGrad = ctx.createRadialGradient(4, -6, 2, 0, 0, 21);
  headGrad.addColorStop(0, pal.skin);
  headGrad.addColorStop(0.75, pal.skin);
  headGrad.addColorStop(1, pal.skinShadow);
  ctx.fillStyle = headGrad;
  ctx.beginPath();
  // Defined cranium, cheekbone, and sculpted chin/jawline (less cartoon-balloon round)
  ctx.moveTo(-12.5, -7);
  ctx.quadraticCurveTo(-13.5, -22, 0, -23.5);
  ctx.quadraticCurveTo(13.5, -22, 13, -6);
  ctx.lineTo(11.8, 3.5);
  ctx.quadraticCurveTo(8, 10.5, 2.5, 11.8);
  ctx.quadraticCurveTo(-5, 11, -10.2, 4.5);
  ctx.closePath();
  ctx.fill();

  // Subtle cheekbone & nose bridge contour for realistic depth in close-ups
  if (!isSpectral) {
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.22)';
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(5.8, -6.5);
    ctx.lineTo(7.1, 0.4);
    ctx.lineTo(5.2, 1.3);
    ctx.stroke();
  }

  // Subtle scene directional bounce highlight on face edge
  if (env?.directionalColor && (env.directionalIntensity ?? 0) > 0.1) {
    ctx.save();
    ctx.globalAlpha = effectiveOpacity * Math.min(0.24, (env.directionalIntensity ?? 0.3) * 0.42);
    ctx.strokeStyle = env.directionalColor;
    ctx.lineWidth = 2.0;
    ctx.beginPath();
    ctx.arc(1.5, -5, 12.2, -Math.PI * 0.38, Math.PI * 0.32);
    ctx.stroke();
    ctx.restore();
  }

  // Ear
  ctx.fillStyle = pal.skinShadow;
  ctx.beginPath();
  ctx.ellipse(-11.8, -2.5, 2.6, 4.6, 0, 0, Math.PI * 2);
  ctx.fill();

  // Hair styles
  ctx.fillStyle = pal.hair;
  if (hairStyle === 'hooded' || isSpectral) {
    ctx.beginPath();
    ctx.arc(0, -7, 19, Math.PI * 0.85, Math.PI * 2.15);
    ctx.lineTo(15, 11);
    ctx.lineTo(-18, 12);
    ctx.closePath();
    ctx.fill();
  } else if (hairStyle === 'long') {
    ctx.beginPath();
    ctx.arc(0, -10, 16.5, Math.PI, Math.PI * 2);
    ctx.lineTo(16, 16);
    ctx.lineTo(9, 14);
    ctx.lineTo(11, -8);
    ctx.lineTo(-10, -8);
    ctx.lineTo(-12, 18);
    ctx.lineTo(-18, 14);
    ctx.closePath();
    ctx.fill();
  } else if (hairStyle === 'spiky') {
    ctx.beginPath();
    ctx.moveTo(-15, -8);
    ctx.lineTo(-18, -22);
    ctx.lineTo(-7, -20);
    ctx.lineTo(-2, -31);
    ctx.lineTo(5, -22);
    ctx.lineTo(15, -27);
    ctx.lineTo(14, -10);
    ctx.closePath();
    ctx.fill();
  } else if (hairStyle === 'bob') {
    ctx.beginPath();
    ctx.arc(0, -10, 16.5, Math.PI * 0.9, Math.PI * 2.1);
    ctx.lineTo(16, 6);
    ctx.lineTo(11, 5);
    ctx.lineTo(10, -10);
    ctx.lineTo(-10, -10);
    ctx.lineTo(-12, 7);
    ctx.lineTo(-17, 5);
    ctx.closePath();
    ctx.fill();
  } else {
    ctx.beginPath();
    ctx.arc(0, -11, 16, Math.PI * 0.95, Math.PI * 2.05);
    ctx.quadraticCurveTo(6, -15, -15, -8);
    ctx.closePath();
    ctx.fill();
  }

  // Eyes with natural blink + directional pupil tracking
  const blinkPhase = options.timeSec % 4.2;
  const isBlinking = !isSpectral && blinkPhase > 4.02;
  const pupilShiftX = options.lookDirection === 'back' ? -1.1 : options.lookDirection === 'scan' ? Math.sin(options.timeSec * 2.2) * 1.1 : 0.6;
  const pupilShiftY = options.lookDirection === 'up' ? -1.1 : 0;

  const eyePositions = [1, 10];
  eyePositions.forEach((ex) => {
    if (isSpectral) {
      ctx.save();
      ctx.shadowColor = pal.eyes;
      ctx.shadowBlur = 10;
      ctx.fillStyle = pal.eyes;
      ctx.beginPath();
      ctx.ellipse(ex, -5, 3.2, 2.1, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    } else if (isBlinking) {
      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(ex - 3, -5);
      ctx.lineTo(ex + 3, -5);
      ctx.stroke();
    } else {
      const eyeH =
        options.expression === 'scared' || options.expression === 'surprised'
          ? 3.8
          : options.expression === 'sinister_smile'
          ? 2.2
          : 2.9;
      ctx.fillStyle = options.expression === 'sinister_smile' ? '#fef2f2' : '#f8fafc';
      ctx.beginPath();
      ctx.ellipse(ex, -5, 3.2, eyeH, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = options.expression === 'sinister_smile' ? '#dc2626' : pal.eyes;
      ctx.beginPath();
      ctx.arc(ex + pupilShiftX, -5 + pupilShiftY, 1.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#0f172a';
      ctx.beginPath();
      ctx.arc(ex + pupilShiftX + 0.2, -5 + pupilShiftY, 0.95, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(ex + pupilShiftX + 0.7, -6 + pupilShiftY, 0.55, 0, Math.PI * 2);
      ctx.fill();
    }
  });

  // Eyebrows driven by expression
  if (!isSpectral) {
    ctx.strokeStyle = pal.hair;
    ctx.lineWidth = 1.8;
    const browSlope =
      options.expression === 'angry' || options.expression === 'determined' || options.expression === 'sinister_smile'
        ? 2.4
        : options.expression === 'scared' || options.expression === 'sad'
        ? -2.2
        : 0;
    const browLift = options.expression === 'surprised' ? -2.5 : options.expression === 'sinister_smile' ? -0.8 : 0;
    ctx.beginPath();
    ctx.moveTo(-2.5, -10 + browLift - browSlope * 0.5);
    ctx.lineTo(4.2, -10 + browLift + browSlope * 0.5);
    ctx.moveTo(6.8, -10 + browLift + browSlope * 0.5);
    ctx.lineTo(13.2, -10 + browLift - browSlope * 0.5);
    ctx.stroke();
  }

  // Sci-fi visor accessory
  if (accessory.type === 'visor') {
    ctx.fillStyle = `${accessory.color}88`;
    ctx.strokeStyle = accessory.color;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.roundRect(-3, -9, 19, 8, 3);
    ctx.fill();
    ctx.stroke();
  }

  // Mouth & lip-sync
  if (!isSpectral) {
    ctx.fillStyle = '#3b1518';
    ctx.strokeStyle = '#5c2427';
    ctx.lineWidth = 1.5;
    if (options.expression === 'sinister_smile') {
      // Wide eerie autonomous grin clearly visible in close-up reflection
      ctx.fillStyle = '#1f0b0e';
      ctx.beginPath();
      ctx.moveTo(-1.2, 2.2);
      ctx.quadraticCurveTo(5.5, 11.2, 12.2, 1.8);
      ctx.quadraticCurveTo(5.5, 6.2, -1.2, 2.2);
      ctx.closePath();
      ctx.fill();
      // Pale teeth gleam inside grin
      ctx.strokeStyle = '#e2e8f0';
      ctx.lineWidth = 1.35;
      ctx.beginPath();
      ctx.moveTo(0.2, 3.8);
      ctx.quadraticCurveTo(5.5, 8.2, 10.8, 3.5);
      ctx.stroke();
    } else if (pose.mouthOpen > 0.12 || options.expression === 'scared' || options.expression === 'surprised') {
      const mh = Math.max(2.5, pose.mouthOpen * 6.5);
      ctx.beginPath();
      ctx.ellipse(5.5, 5, 3.8, mh * 0.65, 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (options.expression === 'happy') {
      ctx.beginPath();
      ctx.arc(5.5, 3.5, 4.2, 0.15 * Math.PI, 0.85 * Math.PI);
      ctx.stroke();
    } else if (options.expression === 'sad' || options.expression === 'angry') {
      ctx.beginPath();
      ctx.arc(5.5, 7.5, 4, 1.15 * Math.PI, 1.85 * Math.PI);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.moveTo(2, 5);
      ctx.lineTo(9, 5);
      ctx.stroke();
    }
  }

  ctx.restore(); // end head

  // 4. Front arm on top of torso
  drawArm(pose.rightArmUpper, pose.rightArmLower, true);

  ctx.restore(); // end torso
  ctx.restore(); // end character root
}

/**
 * Resolves multi-phase actor choreography (state, nextState, blend, expression, lookDirection)
 * so characters perform rich, non-repetitive acting beats within a scene.
 */
export function resolveActorStateAtProgress(
  actor: SceneActor,
  progress: number
): {
  state: AnimationState;
  nextState?: AnimationState;
  blend: number;
  expression: ExpressionType;
  lookDirection: LookDirection;
} {
  const phases = actor.actionPhases;
  if (phases && phases.length >= 2) {
    const sorted = [...phases].sort((a, b) => a.atProgress - b.atProgress);
    let currentIdx = 0;
    for (let i = 0; i < sorted.length; i++) {
      if (progress >= sorted[i].atProgress) {
        currentIdx = i;
      }
    }
    const curr = sorted[currentIdx];
    const next = sorted[currentIdx + 1];
    if (next) {
      const windowHalf = 0.06;
      const distToNext = next.atProgress - progress;
      if (distToNext >= 0 && distToNext <= windowHalf * 2) {
        const blend = 1 - distToNext / (windowHalf * 2);
        return {
          state: curr.state,
          nextState: next.state,
          blend: Math.max(0, Math.min(1, blend)),
          expression: blend > 0.5 ? (next.expression ?? actor.expression) : (curr.expression ?? actor.expression),
          lookDirection: blend > 0.5 ? (next.lookDirection ?? actor.lookDirection ?? 'forward') : (curr.lookDirection ?? actor.lookDirection ?? 'forward'),
        };
      }
    }
    return {
      state: curr.state,
      blend: 0,
      expression: curr.expression ?? actor.expression,
      lookDirection: curr.lookDirection ?? actor.lookDirection ?? 'forward',
    };
  }

  const pivot = actor.stateTransitionRatio ?? 0.6;
  const fallbackLook = actor.lookDirection ?? 'forward';
  if (!actor.nextState || actor.nextState === actor.state) {
    return { state: actor.state, blend: 0, expression: actor.expression, lookDirection: fallbackLook };
  }
  const blendWindow = 0.12;
  if (progress < pivot - blendWindow) {
    return { state: actor.state, blend: 0, expression: actor.expression, lookDirection: fallbackLook };
  }
  if (progress > pivot + blendWindow) {
    return { state: actor.nextState, blend: 0, expression: actor.expression, lookDirection: fallbackLook };
  }
  const blend = (progress - (pivot - blendWindow)) / (blendWindow * 2);
  return {
    state: actor.state,
    nextState: actor.nextState,
    blend,
    expression: actor.expression,
    lookDirection: fallbackLook,
  };
}
