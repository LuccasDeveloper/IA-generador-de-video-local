export type StudioSection =
  | 'home'
  | 'new_project'
  | 'projects'
  | 'editor'
  | 'characters'
  | 'scenarios'
  | 'audio'
  | 'memory'
  | 'templates'
  | 'settings';

export type Genre = 'horror' | 'scifi' | 'adventure' | 'drama' | 'educational';

export type VisualStyleProfile = 'cinematic_2d' | 'retro_pixel_educational';

export type EducationalDomain =
  | 'corpo_humano'
  | 'ciencia'
  | 'espaco'
  | 'tecnologia'
  | 'alimentacao'
  | 'natureza'
  | 'historia'
  | 'curiosidades';

export type PixelMascotArchetype =
  | 'human_kid'
  | 'human_scientist'
  | 'red_blood_cell'
  | 'ice_cream_treat'
  | 'neuron_spark';

export type InfographicKind =
  | 'none'
  | 'brain_nerve_freeze'
  | 'bloodstream_cells'
  | 'bone_marrow_cycle'
  | 'organ_zoom'
  | 'molecule_reaction'
  | 'neural_network'
  | 'solar_orbit'
  | 'circuit_flow'
  | 'nutrition_energy'
  | 'process_diagram';

export interface InfographicCallout {
  id: string;
  label: string;
  x: number; // 0..1
  y: number; // 0..1
  targetX?: number; // 0..1 arrow tip
  targetY?: number; // 0..1 arrow tip
  color: string;
}

export interface InfographicLiveCounter {
  label: string;
  startValue: number;
  endValue: number;
  prefix?: string;
  suffix?: string;
  color?: string;
}

export interface InfographicSpec {
  kind: InfographicKind;
  stage: number; // 0..4 progressive animation stage
  title: string;
  accentColor: string;
  zoomFocus?: { x: number; y: number; scale: number };
  callouts: InfographicCallout[];
  liveCounter?: InfographicLiveCounter;
  diagramNodes?: string[];
}

export interface PixelGridConfig {
  logicalWidth: number; // e.g., 180 for 9:16
  logicalHeight: number; // e.g., 320 for 9:16
  ditherStrength: number; // 0..1 ordered Bayer 4x4 dithering
  scalingMode: 'nearest';
  paletteName: 'arcade_90s_neon';
  outlinePx: number;
}

export interface EducationalContext {
  topicId: string;
  domain: EducationalDomain;
  topicTitle: string;
  sourceCitation: string;
  factSource: 'verified_offline_db' | 'user_supplied' | 'hybrid';
  verifiedFacts: string[];
}

export type AspectRatio = '9:16' | '16:9' | '1:1';

export type ResolutionPreset = '480p' | '540p' | '720p' | '1080p';

export type FPSOption = 12 | 24 | 30 | 60;

export type PerformanceProfile = 'economico' | 'equilibrado' | 'qualidade';

export type AnimationState =
  | 'idle'
  | 'walk'
  | 'run'
  | 'sprint'
  | 'jump'
  | 'fall'
  | 'attack'
  | 'hit'
  | 'death'
  | 'talk'
  | 'custom';

export type ExpressionType =
  | 'neutral'
  | 'scared'
  | 'angry'
  | 'happy'
  | 'surprised'
  | 'determined'
  | 'sad'
  | 'sinister_smile';

export type CameraMove =
  | 'dolly_in'
  | 'dolly_out'
  | 'pan'
  | 'tilt'
  | 'zoom'
  | 'orbit'
  | 'handheld'
  | 'dutch_angle'
  | 'tracking'
  | 'static';

export type FramingType =
  | 'wide'
  | 'medium'
  | 'close_up'
  | 'extreme_close_up'
  | 'over_shoulder'
  | 'low_angle'
  | 'high_angle'
  | 'detail';

export type TransitionType =
  | 'cut'
  | 'fade_black'
  | 'crossfade'
  | 'wipe_left'
  | 'flash_white'
  | 'glitch_cut'
  | 'pixel_wipe'
  | 'dither_dissolve'
  | 'iris_zoom';

export type SfxType =
  | 'whoosh'
  | 'impact'
  | 'boom'
  | 'riser'
  | 'heartbeat'
  | 'glitch'
  | 'pop'
  | 'boing'
  | 'wind'
  | 'knock'
  | 'creak'
  | 'sting'
  | 'arcade_blip'
  | 'arcade_zap'
  | 'arcade_freeze'
  | 'arcade_coin'
  | 'arcade_powerup';

export type CaptionPreset =
  | 'cinematic_bottom'
  | 'bold_karaoke'
  | 'noir_minimal'
  | 'retro_arcade';

export type EasingType = 'linear' | 'ease_in_out' | 'ease_out' | 'ease_in' | 'spring';

export interface CharacterPalette {
  skin: string;
  skinShadow: string;
  hair: string;
  eyes: string;
  outfitPrimary: string;
  outfitSecondary: string;
  pants: string;
  boots: string;
  accent: string;
}

export interface CharacterAccessory {
  type: 'flashlight' | 'cape' | 'visor' | 'sword' | 'scarf' | 'hat' | 'lantern' | 'shadow_aura' | 'none';
  color: string;
}

export interface SpriteAnimationClip {
  name: AnimationState | string;
  frames: number[];
  fps: number;
  loop: boolean;
}

export interface SpritesheetConfig {
  imageDataUrl: string;
  sheetWidth: number;
  sheetHeight: number;
  rows: number;
  cols: number;
  frameWidth: number;
  frameHeight: number;
  totalFrames: number;
  fps: number;
  pivotX: number; // 0..1 normalized
  pivotY: number; // 0..1 normalized
  frameOrder: number[];
  hasTransparency: boolean;
  validated: boolean;
  validationNotes: string[];
  clips: Record<string, SpriteAnimationClip>;
}

export interface CharacterVisualSheet {
  sheetVersion: '1.0.0';
  signatureHash: string;
  heightRatio: number; // 0.85..1.25 canonical height multiplier
  headToBodyRatio: number; // 0.14..0.22 canonical proportion
  shoulderWidthRatio: number; // 0.85..1.15
  lockedPalette: CharacterPalette;
  lockedOutfitStyle: CharacterDefinition['outfitStyle'];
  lockedHairStyle: CharacterDefinition['hairStyle'];
  lockedAccessory: CharacterAccessory;
  supportedCycles: AnimationState[];
}

export interface CharacterDefinition {
  id: string;
  name: string;
  role: string;
  genre: Genre;
  description: string;
  kind: 'rig2d' | 'spritesheet';
  hairStyle: 'short' | 'long' | 'spiky' | 'hooded' | 'bob' | 'slick';
  outfitStyle: 'coat' | 'jacket' | 'armor' | 'tunic' | 'cyber_suit' | 'spectral';
  build: 'slim' | 'average' | 'tall' | 'ethereal';
  palette: CharacterPalette;
  accessory: CharacterAccessory;
  defaultState: AnimationState;
  defaultExpression: ExpressionType;
  availableStates: AnimationState[];
  visualSheet?: CharacterVisualSheet;
  spritesheet?: SpritesheetConfig;
  pixelArchetype?: PixelMascotArchetype;
}

export type ScenarioTheme =
  | 'haunted_manor_hall'
  | 'abandoned_attic_door'
  | 'misty_graveyard'
  | 'dark_rain_street'
  | 'cyberpunk_rain_street'
  | 'orbital_deck'
  | 'enchanted_forest'
  | 'ancient_ruins'
  | 'noir_rain_alley'
  | 'retro_ice_cream_diner'
  | 'pixel_science_lab'
  | 'human_body_interior'
  | 'retro_outer_space'
  | 'pixel_neon_city'
  | 'pixel_fantasy_forest'
  | 'pixel_tech_circuit'
  | 'pixel_history_observatory';

export interface ScenarioLayer {
  id: string;
  name: string;
  depth: 'background' | 'midground' | 'foreground';
  parallaxFactor: number;
  opacity: number;
  customImageUrl?: string;
}

export interface ScenarioProp {
  id: string;
  label: string;
  kind:
    | 'door_ajar'
    | 'staircase'
    | 'lamp_post'
    | 'window_moon'
    | 'holo_sign'
    | 'tree_gnarled'
    | 'pillar'
    | 'crate'
    | 'storefront_vitrine';
  x: number; // 0..1
  y: number; // 0..1
  scale: number;
  depth: 'background' | 'midground' | 'foreground';
}

export interface ScenarioDefinition {
  id: string;
  name: string;
  genre: Genre;
  theme: ScenarioTheme;
  description: string;
  skyTop: string;
  skyBottom: string;
  groundColor: string;
  accentColor: string;
  ambientTint: string;
  layers: ScenarioLayer[];
  props: ScenarioProp[];
}

export interface LightingConfig {
  ambientIntensity: number; // 0..1
  ambientColor: string;
  directionalAngle: number; // degrees
  directionalIntensity: number; // 0..1
  directionalColor: string;
  pointLightEnabled: boolean;
  pointLightX: number; // 0..1
  pointLightY: number; // 0..1
  pointLightRadius: number; // 0.1..1
  pointLightColor: string;
  pointLightFlicker: number; // 0..1
  rimLightIntensity: number; // 0..1
  rimLightColor: string;
  shadowsEnabled: boolean;
  shadowIntensity?: number; // 0..1
  volumetricIntensity?: number; // 0..0.45 safe ceiling
  glowIntensity: number; // 0..1
  bloomIntensity: number; // 0..1
}

export interface EffectsConfig {
  fog: number;
  dust: number;
  rain: number;
  snow: number;
  smoke: number;
  fire: number;
  sparks: number;
  vignette: number;
  filmGrain: number;
  chromaticAberration: number;
  scanlines: number;
  glitch: number;
  cameraShake: number;
  motionBlur: number;
}

export type LookDirection = 'forward' | 'up' | 'back' | 'scan';

export interface ActorActionPhase {
  atProgress: number; // 0..1
  state: AnimationState;
  expression?: ExpressionType;
  lookDirection?: LookDirection;
}

export interface SceneActor {
  id: string;
  characterId: string;
  x: number; // 0..1 start
  y: number; // 0..1 start
  targetX: number; // 0..1 end
  targetY: number; // 0..1 end
  scale: number;
  opacity: number;
  flipX: boolean;
  rotation: number; // degrees
  state: AnimationState;
  nextState?: AnimationState;
  stateTransitionRatio?: number; // 0..1 within scene
  actionPhases?: ActorActionPhase[];
  lookDirection?: LookDirection;
  revealMode?: 'visible' | 'foreshadow' | 'emerge';
  enterProgress?: number; // 0..1
  exitProgress?: number; // 0..1
  expression: ExpressionType;
  easing: EasingType;
  dialogue?: string;
  isShadowEntity?: boolean;
}

export interface SceneSfxEvent {
  id: string;
  sfx: SfxType;
  offsetSec: number; // relative to scene start
  volume: number; // 0..1
  label: string;
}

export interface SceneCausalChain {
  whatHappenedBefore: string;
  whatHappensNow: string;
  whatChanges: string;
  howItTriggersNext: string;
  narrativeObjective: string;
}

export interface CharacterPersistentState {
  characterId: string;
  characterName: string;
  emotionalState: ExpressionType;
  lastPositionX: number;
  lastScenarioId: string;
  carriedProp: string;
  actionHistory: string[];
}

export interface SceneSpec {
  id: string;
  index: number;
  title: string;
  summary: string;
  sourceBeat?: string;
  expectedKeywords?: string[];
  causalChain?: SceneCausalChain;
  narrativeIntent: 'abertura' | 'tensao' | 'desenvolvimento' | 'climax' | 'encerramento';
  duration: number; // seconds
  scenarioId: string;
  framing: FramingType;
  cameraMove: CameraMove;
  secondaryCameraMove?: CameraMove;
  cameraIntensity: number; // 0..1
  cameraMotivation?: string;
  focusTarget?: 'subject_body' | 'subject_face' | 'reflection' | 'prop_clue' | 'environment';
  transitionIn: TransitionType;
  endingImpact?: 'none' | 'silhouette_hold' | 'light_extinguish' | 'dramatic_reveal' | 'cut_to_black';
  reflectionMode?: 'none' | 'mirror' | 'figure_behind' | 'autonomous_smile' | 'hand_grab';
  lighting: LightingConfig;
  effects: EffectsConfig;
  actors: SceneActor[];
  sfxEvents: SceneSfxEvent[];
  captionText: string;
  captionEmphasisWords?: string[];
  visualPrompt: string;
  colorPalette: string[];
  sceneVisualMode?: 'character_scenario' | 'infographic_focus' | 'split_cutaway';
  infographic?: InfographicSpec;
}

export interface AudioConfig {
  musicStyle:
    | 'horror_drone'
    | 'noir_pulse'
    | 'scifi_synth'
    | 'adventure_orchestral'
    | 'drama_piano'
    | 'retro_chiptune'
    | 'none';
  musicVolume: number; // 0..1
  sfxVolume: number; // 0..1
  voiceVolume: number; // 0..1
  fadeInSec: number;
  fadeOutSec: number;
  duckingAmount: number; // 0..1
  normalize: boolean;
  narrationMode: 'none' | 'web_speech' | 'piper_local' | 'espeak_local';
}

export interface CaptionConfig {
  enabled: boolean;
  preset: CaptionPreset;
  fontSize: number;
  positionY: number; // 0.1..0.92
  safeAreaMargin: number; // px ratio 0.04..0.15
  highlightColor: string;
  textColor: string;
  outlineWidth: number;
  shadowBlur: number;
  enterAnimation: 'pop' | 'slide_up' | 'fade';
  exitAnimation: 'fade' | 'shrink';
}

export interface VideoFormatConfig {
  aspectRatio: AspectRatio;
  previewResolution: ResolutionPreset;
  exportResolution: ResolutionPreset;
  fps: FPSOption;
  renderer: 'ffmpeg_mp4' | 'browser_preview';
}

export interface ProductionStep {
  id: string;
  stepNumber: number;
  label: string;
  status: 'pending' | 'running' | 'done' | 'error' | 'cancelled';
  detail?: string;
}

export interface ProjectPlan {
  schemaVersion: '1.0.0';
  id: string;
  title: string;
  prompt: string;
  genre: Genre;
  visualStyle?: VisualStyleProfile;
  pixelConfig?: PixelGridConfig;
  educationalContext?: EducationalContext;
  themeSummary: string;
  totalDuration: number;
  engineUsed: 'offline_rules' | 'ollama_local';
  performanceProfile: PerformanceProfile;
  format: VideoFormatConfig;
  visualIdentity: {
    mood: string;
    palette: string[];
    lightingStyle: string;
    cameraLanguage: string;
  };
  characterBible: CharacterDefinition[];
  scenarios: ScenarioDefinition[];
  script: Array<{
    sceneIndex: number;
    heading: string;
    action: string;
    dialogue: string;
    soundCue: string;
  }>;
  scenes: SceneSpec[];
  continuityLedger?: CharacterPersistentState[];
  audio: AudioConfig;
  captions: CaptionConfig;
  createdAt: string;
  updatedAt: string;
  renderCheckpoint?: {
    completedBlocks: number;
    totalBlocks: number;
    lastUpdated: string;
    paused: boolean;
  };
  memoryContext?: ProjectMemoryContext;
}

export interface ValidationIssue {
  severity: 'error' | 'warning' | 'info';
  code: string;
  message: string;
  sceneIndex?: number;
}

export interface QACheckItem {
  id: string;
  label: string;
  status: 'pass' | 'warn' | 'fail';
  detail: string;
}

export interface ContactSheetFrame {
  timeSec: number;
  sceneIndex: number;
  sceneTitle: string;
  dataUrl: string;
}

export interface QAReport {
  timestamp: string;
  passed: boolean;
  checks: QACheckItem[];
  issues: ValidationIssue[];
  contactSheet: ContactSheetFrame[];
  metrics: {
    durationSec: number;
    width: number;
    height: number;
    fps: number;
    sceneCount: number;
    blackFrameCount: number;
    frozenFrameCount: number;
    duplicateFrameCount: number;
    flickerCount: number;
    horizontalBandCount: number;
    scriptFidelityScore: number; // 0..100
    continuityIssuesCount: number;
    estimatedPeakDb: number;
  };
}

export interface StudioLogEntry {
  id: string;
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'success';
  module: string;
  message: string;
}

export interface SkillModuleAuditItem {
  modulePath: string;
  purpose: string;
  presentOnDisk: boolean;
  status: 'original_preserved' | 'substitute_documented';
  reason: string;
  functionalDifferences: string;
}

export interface EnvironmentDiagnostics {
  timestamp: string;
  schemaVersion: '1.0.0';
  platform: string;
  nodeVersion: string;
  cpu: { model: string; cores: number };
  memory: { totalGB: number; freeGB: number; usedPercent: number };
  tools: {
    python: { available: boolean; version: string | null };
    ffmpeg: {
      available: boolean;
      version: string | null;
      hasLibx264: boolean;
      hasAac: boolean;
    };
    piper: { available: boolean; version: string | null };
    espeak: { available: boolean; version: string | null };
  };
  originalSkill: {
    zipDetected: boolean;
    directoryPresent: boolean;
    presentScriptsCount: number;
    expectedScriptsCount: number;
    missingFiles: string[];
    referenceAssetsPresent: {
      skillMd: boolean;
      references: boolean;
      templates: boolean;
      examples: boolean;
    };
  };
  ollama: {
    available: boolean;
    url: string;
    models: string[];
    error?: string;
  };
  hardwareRecommendation: PerformanceProfile;
}

export interface StudioSettings {
  ollamaEnabled: boolean;
  ollamaUrl: string;
  ollamaModel: string;
  defaultProfile: PerformanceProfile;
  defaultAspectRatio: AspectRatio;
  defaultFps: FPSOption;
  showSafeArea: boolean;
  autoSaveProjects: boolean;
}

export interface VideoFeedbackItem {
  id: string;
  errorCode: string;
  note: string;
  createdAt: string;
}

export interface VideoMemoryIssue {
  code: string;
  severity: 'error' | 'warning' | 'info';
  message: string;
  sceneIndex?: number;
}

export interface VideoMemoryEntry {
  id: string;
  projectId: string;
  title: string;
  prompt: string;
  genre: Genre;
  durationSec: number;
  aspectRatio: AspectRatio;
  sceneCount: number;
  framingSequence: FramingType[];
  cameraMoves: CameraMove[];
  scenarioIds: string[];
  characterIds: string[];
  scriptFidelityScore: number;
  qaPassed: boolean;
  postRenderPassed?: boolean;
  postRenderSummary?: string;
  issuesDetected: VideoMemoryIssue[];
  fixesApplied: string[];
  userFeedback: VideoFeedbackItem[];
  createdAt: string;
  updatedAt: string;
}

export interface LearnedRule {
  id: string;
  errorCode: string;
  title: string;
  description: string;
  strategy: string;
  occurrences: number;
  autoFixedCount: number;
  source: 'qa_auto' | 'post_render' | 'user_feedback';
  active: boolean;
  firstSeenAt: string;
  lastSeenAt: string;
}

export interface ProjectMemoryContext {
  rememberedVideosCount: number;
  appliedRuleIds: string[];
  autoFixesApplied: string[];
  avoidedPatterns: string[];
  recalledVideoTitles: string[];
}

export interface StudioMemoryState {
  schemaVersion: '1.0.0';
  videos: VideoMemoryEntry[];
  rules: LearnedRule[];
  totalAutoFixes: number;
  updatedAt: string;
}

