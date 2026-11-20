import type {
  AnimationState,
  AspectRatio,
  CharacterDefinition,
  EffectsConfig,
  Genre,
  LightingConfig,
  PerformanceProfile,
  ResolutionPreset,
  ScenarioDefinition,
  StudioSettings,
} from '../types/studio';

export const ALL_ANIMATION_STATES: AnimationState[] = [
  'idle',
  'walk',
  'run',
  'sprint',
  'jump',
  'fall',
  'attack',
  'hit',
  'death',
  'talk',
  'custom',
];

export const ANIMATION_STATE_LABELS: Record<AnimationState, string> = {
  idle: 'Parado (Idle)',
  walk: 'Caminhar (Walk)',
  run: 'Correr (Run)',
  sprint: 'Arrancada (Sprint)',
  jump: 'Saltar (Jump)',
  fall: 'Cair (Fall)',
  attack: 'Atacar (Attack)',
  hit: 'Impacto (Hit)',
  death: 'Queda (Death)',
  talk: 'Falar (Talk)',
  custom: 'Personalizado',
};

export const PERFORMANCE_LIMITS: Record<
  PerformanceProfile,
  {
    label: string;
    description: string;
    maxParticles: number;
    enableFilmGrain: boolean;
    enableBloom: boolean;
    enableMotionBlur: boolean;
    previewScale: number;
  }
> = {
  economico: {
    label: 'Econômico',
    description: 'Menos partículas, preview rápido e baixo consumo de RAM/CPU.',
    maxParticles: 40,
    enableFilmGrain: false,
    enableBloom: false,
    enableMotionBlur: false,
    previewScale: 0.7,
  },
  equilibrado: {
    label: 'Equilibrado',
    description: 'Efeitos moderados e fluidez ideal para Ryzen 3 / Vega 8.',
    maxParticles: 110,
    enableFilmGrain: true,
    enableBloom: true,
    enableMotionBlur: false,
    previewScale: 1,
  },
  qualidade: {
    label: 'Qualidade',
    description: 'Camadas completas, iluminação avançada e máxima nitidez.',
    maxParticles: 240,
    enableFilmGrain: true,
    enableBloom: true,
    enableMotionBlur: true,
    previewScale: 1,
  },
};

export function resolveDimensions(
  aspectRatio: AspectRatio,
  preset: ResolutionPreset
): { width: number; height: number } {
  const shortSideMap: Record<ResolutionPreset, number> = {
    '480p': 480,
    '540p': 540,
    '720p': 720,
    '1080p': 1080,
  };
  const s = shortSideMap[preset];
  if (aspectRatio === '9:16') {
    const h = Math.round((s * 16) / 9 / 2) * 2;
    return { width: s, height: h };
  }
  if (aspectRatio === '16:9') {
    const w = Math.round((s * 16) / 9 / 2) * 2;
    return { width: w, height: s };
  }
  return { width: s, height: s };
}

export const DEFAULT_LIGHTING: LightingConfig = {
  ambientIntensity: 0.48,
  ambientColor: '#1b2638',
  directionalAngle: 35,
  directionalIntensity: 0.42,
  directionalColor: '#93c5fd',
  pointLightEnabled: true,
  pointLightX: 0.45,
  pointLightY: 0.45,
  pointLightRadius: 0.38,
  pointLightColor: '#fde68a',
  pointLightFlicker: 0.08,
  rimLightIntensity: 0.48,
  rimLightColor: '#60a5fa',
  shadowsEnabled: true,
  shadowIntensity: 0.65,
  volumetricIntensity: 0.18,
  glowIntensity: 0.14,
  bloomIntensity: 0.14,
};

export const DEFAULT_EFFECTS: EffectsConfig = {
  fog: 0.16,
  dust: 0.28,
  rain: 0,
  snow: 0,
  smoke: 0.06,
  fire: 0,
  sparks: 0,
  vignette: 0.42,
  filmGrain: 0.16,
  chromaticAberration: 0,
  scanlines: 0,
  glitch: 0,
  cameraShake: 0.06,
  motionBlur: 0,
};

export function computeVisualSheetHash(character: Pick<CharacterDefinition, 'id' | 'hairStyle' | 'outfitStyle' | 'build' | 'palette' | 'accessory'>): string {
  const payload = JSON.stringify({
    id: character.id,
    hairStyle: character.hairStyle,
    outfitStyle: character.outfitStyle,
    build: character.build,
    palette: character.palette,
    accessory: character.accessory,
  });
  let hash = 2166136261;
  for (let i = 0; i < payload.length; i++) {
    hash ^= payload.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `vs_${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

export function buildCharacterVisualSheet(character: CharacterDefinition): NonNullable<CharacterDefinition['visualSheet']> {
  const heightRatio =
    character.build === 'tall' || character.build === 'ethereal'
      ? 1.12
      : character.build === 'slim'
      ? 0.97
      : 1.0;
  const shoulderWidthRatio =
    character.build === 'slim' ? 0.88 : character.build === 'tall' ? 1.03 : 1.0;
  const headToBodyRatio = character.build === 'ethereal' ? 0.16 : 0.18;

  return {
    sheetVersion: '1.0.0',
    signatureHash: computeVisualSheetHash(character),
    heightRatio,
    headToBodyRatio,
    shoulderWidthRatio,
    lockedPalette: { ...character.palette },
    lockedOutfitStyle: character.outfitStyle,
    lockedHairStyle: character.hairStyle,
    lockedAccessory: { ...character.accessory },
    supportedCycles: [...(character.availableStates.length > 0 ? character.availableStates : ALL_ANIMATION_STATES)],
  };
}

const RAW_STARTER_CHARACTERS: CharacterDefinition[] = [
  {
    id: 'char_daniel_horror',
    name: 'Daniel Vance',
    role: 'Protagonista investigador',
    genre: 'horror',
    description: 'Homem de sobretudo escuro com lanterna, postura cautelosa e expressões intensas para suspense e terror.',
    kind: 'rig2d',
    hairStyle: 'short',
    outfitStyle: 'coat',
    build: 'average',
    palette: {
      skin: '#e0b394',
      skinShadow: '#b98364',
      hair: '#1f1b18',
      eyes: '#38bdf8',
      outfitPrimary: '#242c38',
      outfitSecondary: '#3b4759',
      pants: '#171c24',
      boots: '#0f1115',
      accent: '#f59e0b',
    },
    accessory: { type: 'flashlight', color: '#fde68a' },
    defaultState: 'walk',
    defaultExpression: 'scared',
    availableStates: ALL_ANIMATION_STATES,
  },
  {
    id: 'char_shadow_entity',
    name: 'Vulto da Casa',
    role: 'Entidade sombria antagonista',
    genre: 'horror',
    description: 'Figura alta e espectral envolta em penumbra controlada, olhos luminescentes e silhueta alongada.',
    kind: 'rig2d',
    hairStyle: 'hooded',
    outfitStyle: 'spectral',
    build: 'ethereal',
    palette: {
      skin: '#141720',
      skinShadow: '#07090d',
      hair: '#090b10',
      eyes: '#ef4444',
      outfitPrimary: '#0c0f16',
      outfitSecondary: '#1f2433',
      pants: '#07090d',
      boots: '#050608',
      accent: '#dc2626',
    },
    accessory: { type: 'shadow_aura', color: '#ef4444' },
    defaultState: 'idle',
    defaultExpression: 'angry',
    availableStates: ALL_ANIMATION_STATES,
  },
  {
    id: 'char_kira_scifi',
    name: 'Kira Nova',
    role: 'Mensageira cibernética',
    genre: 'scifi',
    description: 'Exploradora futurista com traje tático articulado, visor óptico luminoso e agilidade atlética.',
    kind: 'rig2d',
    hairStyle: 'bob',
    outfitStyle: 'cyber_suit',
    build: 'slim',
    palette: {
      skin: '#d9a487',
      skinShadow: '#b27b5e',
      hair: '#1e293b',
      eyes: '#22d3ee',
      outfitPrimary: '#1e293b',
      outfitSecondary: '#334155',
      pants: '#0f172a',
      boots: '#020617',
      accent: '#38bdf8',
    },
    accessory: { type: 'visor', color: '#38bdf8' },
    defaultState: 'run',
    defaultExpression: 'determined',
    availableStates: ALL_ANIMATION_STATES,
  },
  {
    id: 'char_rowan_adventure',
    name: 'Rowan Vale',
    role: 'Guardião das ruínas',
    genre: 'adventure',
    description: 'Aventureiro com capa de viagem, túnica detalhada, espada e lampião de expedição.',
    kind: 'rig2d',
    hairStyle: 'spiky',
    outfitStyle: 'tunic',
    build: 'tall',
    palette: {
      skin: '#dca988',
      skinShadow: '#b57e5e',
      hair: '#5c3a21',
      eyes: '#10b981',
      outfitPrimary: '#2f4f42',
      outfitSecondary: '#6b4c35',
      pants: '#2b241d',
      boots: '#1c1612',
      accent: '#eab308',
    },
    accessory: { type: 'lantern', color: '#fbbf24' },
    defaultState: 'walk',
    defaultExpression: 'determined',
    availableStates: ALL_ANIMATION_STATES,
  },
  {
    id: 'char_helena_drama',
    name: 'Helena Costa',
    role: 'Jornalista investigativa',
    genre: 'drama',
    description: 'Personagem urbana contemporânea com jaqueta estruturada, cachecol e expressividade facial para diálogos.',
    kind: 'rig2d',
    hairStyle: 'long',
    outfitStyle: 'jacket',
    build: 'average',
    palette: {
      skin: '#c99374',
      skinShadow: '#9e6b4f',
      hair: '#2b1d17',
      eyes: '#f59e0b',
      outfitPrimary: '#473335',
      outfitSecondary: '#6b4d4f',
      pants: '#1e242e',
      boots: '#14171f',
      accent: '#e5a032',
    },
    accessory: { type: 'scarf', color: '#c2410c' },
    defaultState: 'talk',
    defaultExpression: 'neutral',
    availableStates: ALL_ANIMATION_STATES,
  },
  // --- RETRO PIXEL EDUCATIONAL CHARACTERS (Independent from Cinematic/Horror Cast) ---
  {
    id: 'char_pixel_lumi',
    name: 'Lumi Arcade',
    role: 'Mascote curioso educativo (Pixel 16-bit)',
    genre: 'educational',
    description: 'Personagem retrô carismático e expressivo com olhos piscantes, reações exageradas de surpresa/alegria/susto e animações com antecipação e impacto.',
    kind: 'rig2d',
    pixelArchetype: 'human_kid',
    hairStyle: 'short',
    outfitStyle: 'jacket',
    build: 'average',
    palette: {
      skin: '#FFE5CC',
      skinShadow: '#F8B88B',
      hair: '#4A2545',
      eyes: '#1A103C',
      outfitPrimary: '#FF4F9A',
      outfitSecondary: '#FFD23F',
      pants: '#28366B',
      boots: '#1A103C',
      accent: '#38E8FF',
    },
    accessory: { type: 'none', color: '#FFD23F' },
    defaultState: 'idle',
    defaultExpression: 'happy',
    availableStates: ALL_ANIMATION_STATES,
  },
  {
    id: 'char_pixel_prof_bit',
    name: 'Prof. Bit',
    role: 'Cientista guia retrô (Pixel 16-bit)',
    genre: 'educational',
    description: 'Cientista estilizado em pixel art com jaleco creme, óculos neon ciano e gestos expressivos para explicações científicas.',
    kind: 'rig2d',
    pixelArchetype: 'human_scientist',
    hairStyle: 'spiky',
    outfitStyle: 'coat',
    build: 'average',
    palette: {
      skin: '#F8B88B',
      skinShadow: '#D98E62',
      hair: '#FFE5CC',
      eyes: '#38E8FF',
      outfitPrimary: '#FFE5CC',
      outfitSecondary: '#38E8FF',
      pants: '#1A103C',
      boots: '#0F173A',
      accent: '#FFD23F',
    },
    accessory: { type: 'visor', color: '#38E8FF' },
    defaultState: 'talk',
    defaultExpression: 'happy',
    availableStates: ALL_ANIMATION_STATES,
  },
  {
    id: 'char_pixel_hemo',
    name: 'Hemo (Hemácia)',
    role: 'Mascote glóbulo vermelho (Pixel 16-bit)',
    genre: 'educational',
    description: 'Glóbulo vermelho fofo e flexível em pixel art com dithering esférico, olhos expressivos e animação de compressão nos capilares.',
    kind: 'rig2d',
    pixelArchetype: 'red_blood_cell',
    hairStyle: 'short',
    outfitStyle: 'tunic',
    build: 'slim',
    palette: {
      skin: '#FF5D5D',
      skinShadow: '#B81D3A',
      hair: '#7D1935',
      eyes: '#1A103C',
      outfitPrimary: '#FF5D5D',
      outfitSecondary: '#FF99AC',
      pants: '#7D1935',
      boots: '#4A0E22',
      accent: '#38E8FF',
    },
    accessory: { type: 'none', color: '#38E8FF' },
    defaultState: 'run',
    defaultExpression: 'happy',
    availableStates: ALL_ANIMATION_STATES,
  },
  {
    id: 'char_pixel_spark',
    name: 'Spark (Impulso)',
    role: 'Mascote energia / neurônio / fóton (Pixel 16-bit)',
    genre: 'educational',
    description: 'Partícula elétrica dourada expressiva que representa impulsos nervosos, fótons de luz, bits binários e energia ATP.',
    kind: 'rig2d',
    pixelArchetype: 'neuron_spark',
    hairStyle: 'spiky',
    outfitStyle: 'spectral',
    build: 'slim',
    palette: {
      skin: '#FFD23F',
      skinShadow: '#E59500',
      hair: '#FFF3B0',
      eyes: '#1A103C',
      outfitPrimary: '#FFD23F',
      outfitSecondary: '#38E8FF',
      pants: '#FF4F9A',
      boots: '#1A103C',
      accent: '#38E8FF',
    },
    accessory: { type: 'none', color: '#FFD23F' },
    defaultState: 'sprint',
    defaultExpression: 'determined',
    availableStates: ALL_ANIMATION_STATES,
  },
  {
    id: 'char_pixel_scoop',
    name: 'Gelato Pixel',
    role: 'Mascote sorvete / alimento retrô (Pixel 16-bit)',
    genre: 'educational',
    description: 'Sorvete duplo rosa e menta com casquinha quadriculada pixel art, olhos brilhantes e reações cômicas.',
    kind: 'rig2d',
    pixelArchetype: 'ice_cream_treat',
    hairStyle: 'bob',
    outfitStyle: 'tunic',
    build: 'slim',
    palette: {
      skin: '#FF8FB1',
      skinShadow: '#D95384',
      hair: '#5EEAD4',
      eyes: '#1A103C',
      outfitPrimary: '#F5B971',
      outfitSecondary: '#C87F36',
      pants: '#B97848',
      boots: '#7C4928',
      accent: '#38E8FF',
    },
    accessory: { type: 'none', color: '#FF4F9A' },
    defaultState: 'idle',
    defaultExpression: 'happy',
    availableStates: ALL_ANIMATION_STATES,
  },
];

export const STARTER_CHARACTERS: CharacterDefinition[] = RAW_STARTER_CHARACTERS.map((char) => ({
  ...char,
  visualSheet: buildCharacterVisualSheet(char),
}));

export const STARTER_SCENARIOS: ScenarioDefinition[] = [
  {
    id: 'scene_haunted_hall',
    name: 'Hall da Casa Abandonada',
    genre: 'horror',
    theme: 'haunted_manor_hall',
    description: 'Interior decadente de madeira antiga com escadaria ao fundo, janelas sob luar e sombras alongadas.',
    skyTop: '#070a12',
    skyBottom: '#171e2d',
    groundColor: '#1a1514',
    accentColor: '#60a5fa',
    ambientTint: '#111827',
    layers: [
      { id: 'bg', name: 'Paredes e janelas ao luar', depth: 'background', parallaxFactor: 0.25, opacity: 1 },
      { id: 'mg', name: 'Escadaria e colunas de madeira', depth: 'midground', parallaxFactor: 0.6, opacity: 1 },
      { id: 'fg', name: 'Vigas e poeira em primeiro plano', depth: 'foreground', parallaxFactor: 1.15, opacity: 0.9 },
    ],
    props: [
      { id: 'p1', label: 'Janela ao luar', kind: 'window_moon', x: 0.24, y: 0.28, scale: 1.1, depth: 'background' },
      { id: 'p2', label: 'Escadaria superior', kind: 'staircase', x: 0.72, y: 0.56, scale: 1.0, depth: 'midground' },
    ],
  },
  {
    id: 'scene_attic_door',
    name: 'Corredor da Porta Entreaberta',
    genre: 'horror',
    theme: 'abandoned_attic_door',
    description: 'Corredor estreito no andar de cima com porta entreaberta deixando vazar um feixe frio de luz.',
    skyTop: '#06080f',
    skyBottom: '#151a26',
    groundColor: '#191412',
    accentColor: '#fbbf24',
    ambientTint: '#0f141e',
    layers: [
      { id: 'bg', name: 'Fundo do corredor escuro', depth: 'background', parallaxFactor: 0.2, opacity: 1 },
      { id: 'mg', name: 'Porta entreaberta e molduras', depth: 'midground', parallaxFactor: 0.58, opacity: 1 },
      { id: 'fg', name: 'Silhuetas de batentes próximos', depth: 'foreground', parallaxFactor: 1.2, opacity: 0.92 },
    ],
    props: [
      { id: 'p1', label: 'Porta entreaberta', kind: 'door_ajar', x: 0.66, y: 0.56, scale: 1.15, depth: 'midground' },
      { id: 'p2', label: 'Pilar de madeira', kind: 'pillar', x: 0.14, y: 0.5, scale: 1.0, depth: 'foreground' },
    ],
  },
  {
    id: 'scene_dark_rain_street',
    name: 'Rua Escura da Vitrine sob Chuva',
    genre: 'horror',
    theme: 'dark_rain_street',
    description: 'Rua urbana noturna sob chuva fina com postes de luz quente, asfalto reflexivo e vitrine de vidro em primeiro/médio plano.',
    skyTop: '#060912',
    skyBottom: '#131c2e',
    groundColor: '#11151d',
    accentColor: '#e5a032',
    ambientTint: '#0e1726',
    layers: [
      { id: 'bg', name: 'Silhuetas de prédios e céu chuvoso', depth: 'background', parallaxFactor: 0.22, opacity: 1 },
      { id: 'mg', name: 'Fachada urbana, poste e vitrine de vidro', depth: 'midground', parallaxFactor: 0.58, opacity: 1 },
      { id: 'fg', name: 'Postes próximos e gotas de chuva', depth: 'foreground', parallaxFactor: 1.24, opacity: 0.9 },
    ],
    props: [
      { id: 'p1', label: 'Poste distante', kind: 'lamp_post', x: 0.16, y: 0.54, scale: 0.85, depth: 'background' },
      { id: 'p2', label: 'Vitrine noturna', kind: 'storefront_vitrine', x: 0.68, y: 0.54, scale: 1.12, depth: 'midground' },
      { id: 'p3', label: 'Poste lateral', kind: 'lamp_post', x: 0.88, y: 0.54, scale: 1.06, depth: 'foreground' },
    ],
  },
  {
    id: 'scene_cyber_street',
    name: 'Avenida Sob Chuva Futurista',
    genre: 'scifi',
    theme: 'cyberpunk_rain_street',
    description: 'Metrópole vertical chuvosa com reflexos no asfalto, letreiros holográficos e profundidade em 3 camadas.',
    skyTop: '#08101f',
    skyBottom: '#162844',
    groundColor: '#0e131d',
    accentColor: '#38bdf8',
    ambientTint: '#0b192c',
    layers: [
      { id: 'bg', name: 'Torres distantes e neblina', depth: 'background', parallaxFactor: 0.22, opacity: 1 },
      { id: 'mg', name: 'Fachadas e painéis luminosos', depth: 'midground', parallaxFactor: 0.55, opacity: 1 },
      { id: 'fg', name: 'Postes e cabos em primeiro plano', depth: 'foreground', parallaxFactor: 1.25, opacity: 0.85 },
    ],
    props: [
      { id: 'p1', label: 'Painel holográfico', kind: 'holo_sign', x: 0.72, y: 0.32, scale: 1.0, depth: 'midground' },
      { id: 'p2', label: 'Poste de luz', kind: 'lamp_post', x: 0.2, y: 0.52, scale: 1.05, depth: 'foreground' },
    ],
  },
  {
    id: 'scene_orbital_deck',
    name: 'Convés da Estação Orbital',
    genre: 'scifi',
    theme: 'orbital_deck',
    description: 'Corredor metálico de nave com janelas panorâmicas para o espaço profundo e iluminação tática.',
    skyTop: '#040711',
    skyBottom: '#0e1b33',
    groundColor: '#151c28',
    accentColor: '#22d3ee',
    ambientTint: '#0a1426',
    layers: [
      { id: 'bg', name: 'Espaço profundo e planeta', depth: 'background', parallaxFactor: 0.15, opacity: 1 },
      { id: 'mg', name: 'Comportas e estrutura metálica', depth: 'midground', parallaxFactor: 0.55, opacity: 1 },
      { id: 'fg', name: 'Estruturas de contenção', depth: 'foreground', parallaxFactor: 1.18, opacity: 0.88 },
    ],
    props: [
      { id: 'p1', label: 'Caixa de carga', kind: 'crate', x: 0.8, y: 0.72, scale: 0.9, depth: 'midground' },
    ],
  },
  {
    id: 'scene_enchanted_forest',
    name: 'Floresta do Crepúsculo',
    genre: 'adventure',
    theme: 'enchanted_forest',
    description: 'Mata densa com raios de luz filtrados entre copas, névoa baixa e árvores retorcidas.',
    skyTop: '#0d1b24',
    skyBottom: '#234047',
    groundColor: '#14211b',
    accentColor: '#fbbf24',
    ambientTint: '#122624',
    layers: [
      { id: 'bg', name: 'Montanhas e neblina de fundo', depth: 'background', parallaxFactor: 0.2, opacity: 1 },
      { id: 'mg', name: 'Árvores antigas e clareira', depth: 'midground', parallaxFactor: 0.58, opacity: 1 },
      { id: 'fg', name: 'Folhagens e troncos próximos', depth: 'foreground', parallaxFactor: 1.25, opacity: 0.9 },
    ],
    props: [
      { id: 'p1', label: 'Árvore ancestral', kind: 'tree_gnarled', x: 0.78, y: 0.48, scale: 1.15, depth: 'midground' },
    ],
  },
  {
    id: 'scene_ancient_ruins',
    name: 'Ruínas do Templo Antigo',
    genre: 'adventure',
    theme: 'ancient_ruins',
    description: 'Pilares de pedra esculpida sob céu crepuscular com poeira dourada suspensa no ar.',
    skyTop: '#1a1423',
    skyBottom: '#433042',
    groundColor: '#241e1b',
    accentColor: '#f59e0b',
    ambientTint: '#251c26',
    layers: [
      { id: 'bg', name: 'Horizonte e arcos distantes', depth: 'background', parallaxFactor: 0.24, opacity: 1 },
      { id: 'mg', name: 'Colunas de pedra e altar', depth: 'midground', parallaxFactor: 0.6, opacity: 1 },
      { id: 'fg', name: 'Blocos quebrados em primeiro plano', depth: 'foreground', parallaxFactor: 1.2, opacity: 0.9 },
    ],
    props: [
      { id: 'p1', label: 'Pilar antigo', kind: 'pillar', x: 0.25, y: 0.48, scale: 1.1, depth: 'midground' },
      { id: 'p2', label: 'Pilar distante', kind: 'pillar', x: 0.78, y: 0.5, scale: 0.95, depth: 'midground' },
    ],
  },
  {
    id: 'scene_noir_alley',
    name: 'Beco Urbano Sob Garoa',
    genre: 'drama',
    theme: 'noir_rain_alley',
    description: 'Rua silenciosa à noite iluminada por um poste solitário, poças reflexivas e névoa suave.',
    skyTop: '#0d111a',
    skyBottom: '#1f2838',
    groundColor: '#151820',
    accentColor: '#e5a032',
    ambientTint: '#141a26',
    layers: [
      { id: 'bg', name: 'Prédios da cidade ao longe', depth: 'background', parallaxFactor: 0.22, opacity: 1 },
      { id: 'mg', name: 'Fachadas de tijolos e poste', depth: 'midground', parallaxFactor: 0.58, opacity: 1 },
      { id: 'fg', name: 'Esquina em primeiro plano', depth: 'foreground', parallaxFactor: 1.2, opacity: 0.88 },
    ],
    props: [
      { id: 'p1', label: 'Poste urbano', kind: 'lamp_post', x: 0.7, y: 0.46, scale: 1.0, depth: 'midground' },
    ],
  },
  // --- 8 RETRO PIXEL ART EDUCATIONAL SCENARIOS ---
  {
    id: 'scene_retro_ice_cream',
    name: 'Lanchonete & Sorveteria Retrô Neon',
    genre: 'educational',
    theme: 'retro_ice_cream_diner',
    description: 'Sorveteria arcade noturna com toldo listrado, luzinhas penduradas, balcão de madeira pixel art, letreiro neon e cidade ao fundo.',
    skyTop: '#0F173A',
    skyBottom: '#2B1B54',
    groundColor: '#B97848',
    accentColor: '#FF4F9A',
    ambientTint: '#1A103C',
    layers: [
      { id: 'bg', name: 'Céu estrelado e skyline retrô', depth: 'background', parallaxFactor: 0.2, opacity: 1 },
      { id: 'mg', name: 'Vitrine de sorvetes, menu e neon', depth: 'midground', parallaxFactor: 0.55, opacity: 1 },
      { id: 'fg', name: 'Balcão de madeira e luzes pendentes', depth: 'foreground', parallaxFactor: 1.15, opacity: 1 },
    ],
    props: [],
  },
  {
    id: 'scene_pixel_lab',
    name: 'Laboratório Científico Arcade',
    genre: 'educational',
    theme: 'pixel_science_lab',
    description: 'Laboratório retrô 16-bit com frascos borbulhantes neon, osciloscópio animado, estantes científicas e bancada interativa.',
    skyTop: '#120C2E',
    skyBottom: '#221754',
    groundColor: '#252B4A',
    accentColor: '#38E8FF',
    ambientTint: '#1A103C',
    layers: [
      { id: 'bg', name: 'Painéis e monitores de onda', depth: 'background', parallaxFactor: 0.22, opacity: 1 },
      { id: 'mg', name: 'Prateleiras de frascos neon', depth: 'midground', parallaxFactor: 0.58, opacity: 1 },
      { id: 'fg', name: 'Bancada de experimentos', depth: 'foreground', parallaxFactor: 1.18, opacity: 1 },
    ],
    props: [],
  },
  {
    id: 'scene_human_body_cutaway',
    name: 'Interior do Corpo Humano (Corte Pixel)',
    genre: 'educational',
    theme: 'human_body_interior',
    description: 'Ambiente orgânico estilizado em pixel art com tecidos celulares em mosaico, vasos sanguíneos pulsantes e partículas biológicas.',
    skyTop: '#26091C',
    skyBottom: '#4E122C',
    groundColor: '#7D1935',
    accentColor: '#FF5D5D',
    ambientTint: '#3B0E24',
    layers: [
      { id: 'bg', name: 'Tecido orgânico profundo e esporos', depth: 'background', parallaxFactor: 0.18, opacity: 1 },
      { id: 'mg', name: 'Paredes celulares e canais vasculares', depth: 'midground', parallaxFactor: 0.55, opacity: 1 },
      { id: 'fg', name: 'Moldura orgânica em primeiro plano', depth: 'foreground', parallaxFactor: 1.15, opacity: 1 },
    ],
    props: [],
  },
  {
    id: 'scene_retro_space',
    name: 'Espaço Sideral 16-Bit',
    genre: 'educational',
    theme: 'retro_outer_space',
    description: 'Cosmos arcade com nebulosa em dithering roxo/rosa, estrelas cintilantes em parallax, planeta com anéis e cometas.',
    skyTop: '#07091F',
    skyBottom: '#1F1147',
    groundColor: '#111638',
    accentColor: '#FFD23F',
    ambientTint: '#0F173A',
    layers: [
      { id: 'bg', name: 'Estrelas distantes e nebulosa dithering', depth: 'background', parallaxFactor: 0.15, opacity: 1 },
      { id: 'mg', name: 'Planeta anelado e asteroides', depth: 'midground', parallaxFactor: 0.5, opacity: 1 },
      { id: 'fg', name: 'Poeira estelar próxima', depth: 'foreground', parallaxFactor: 1.2, opacity: 1 },
    ],
    props: [],
  },
  {
    id: 'scene_pixel_neon_city',
    name: 'Cidade Noturna Neon Retrô',
    genre: 'educational',
    theme: 'pixel_neon_city',
    description: 'Metrópole 16-bit com edifícios iluminados, postes com halos em dithering, placas neon rosa/ciano e céu estrelado.',
    skyTop: '#0B1033',
    skyBottom: '#2B1554',
    groundColor: '#1E2447',
    accentColor: '#FF4F9A',
    ambientTint: '#1A103C',
    layers: [
      { id: 'bg', name: 'Horizonte urbano distante', depth: 'background', parallaxFactor: 0.2, opacity: 1 },
      { id: 'mg', name: 'Fachadas arcade e letreiros neon', depth: 'midground', parallaxFactor: 0.55, opacity: 1 },
      { id: 'fg', name: 'Calçada e postes luminosos', depth: 'foreground', parallaxFactor: 1.18, opacity: 1 },
    ],
    props: [],
  },
  {
    id: 'scene_pixel_forest',
    name: 'Floresta Fantástica Pixel',
    genre: 'educational',
    theme: 'pixel_fantasy_forest',
    description: 'Mata encantada retrô com copas em camadas, cogumelos bioluminescentes, vaga-lumes cintilantes e raios dourados.',
    skyTop: '#131640',
    skyBottom: '#223B59',
    groundColor: '#1F4B3E',
    accentColor: '#5EEAD4',
    ambientTint: '#162840',
    layers: [
      { id: 'bg', name: 'Montanhas e floresta ao longe', depth: 'background', parallaxFactor: 0.2, opacity: 1 },
      { id: 'mg', name: 'Árvores pixeladas e cogumelos neon', depth: 'midground', parallaxFactor: 0.56, opacity: 1 },
      { id: 'fg', name: 'Folhagens e vaga-lumes', depth: 'foreground', parallaxFactor: 1.2, opacity: 1 },
    ],
    props: [],
  },
  {
    id: 'scene_pixel_circuit',
    name: 'Ambiente Tecnológico (Placa & Circuito)',
    genre: 'educational',
    theme: 'pixel_tech_circuit',
    description: 'Interior estilizado de um microchip com trilhas de cobre neon, pulsos de dados luminosos e pinos metálicos em profundidade.',
    skyTop: '#07132B',
    skyBottom: '#0F254A',
    groundColor: '#122E54',
    accentColor: '#38E8FF',
    ambientTint: '#0A1C3A',
    layers: [
      { id: 'bg', name: 'Grade de silício profunda', depth: 'background', parallaxFactor: 0.18, opacity: 1 },
      { id: 'mg', name: 'Trilhas PCB e nós lógicos', depth: 'midground', parallaxFactor: 0.55, opacity: 1 },
      { id: 'fg', name: 'Conectores dourados próximos', depth: 'foreground', parallaxFactor: 1.18, opacity: 1 },
    ],
    props: [],
  },
  {
    id: 'scene_pixel_history',
    name: 'Observatório Histórico Retrô',
    genre: 'educational',
    theme: 'pixel_history_observatory',
    description: 'Cúpula histórica em pixel art com telescópio de latão dourado, mapas celestes antigos, estantes de livros e velas.',
    skyTop: '#140F33',
    skyBottom: '#331E4F',
    groundColor: '#5C3828',
    accentColor: '#FFD23F',
    ambientTint: '#23163D',
    layers: [
      { id: 'bg', name: 'Cúpula aberta para constelações', depth: 'background', parallaxFactor: 0.2, opacity: 1 },
      { id: 'mg', name: 'Telescópio de latão e estantes', depth: 'midground', parallaxFactor: 0.58, opacity: 1 },
      { id: 'fg', name: 'Mesa de pergaminhos e velas', depth: 'foreground', parallaxFactor: 1.15, opacity: 1 },
    ],
    props: [],
  },
];

export interface ProductionTemplate {
  id: string;
  title: string;
  genre: Genre;
  visualStyle?: 'cinematic_2d' | 'retro_pixel_educational';
  educationalTopicId?: string;
  duration: number;
  aspectRatio: AspectRatio;
  narration: boolean;
  summary: string;
  prompt: string;
}

export const PRODUCTION_TEMPLATES: ProductionTemplate[] = [
  {
    id: 'tpl_abandoned_house',
    title: 'A Casa Abandonada',
    genre: 'horror',
    duration: 30,
    aspectRatio: '9:16',
    narration: false,
    summary: 'Suspense 2D de 30s sem narração, passos no andar superior, porta entreaberta e vulto atrás do protagonista.',
    prompt:
      'Crie uma animação 2D de terror sobre um homem que entra em uma casa abandonada. Ele escuta passos no andar de cima, encontra uma porta entreaberta e percebe uma sombra atrás dele. Duração de 30 segundos, sem narração, com efeitos sonoros cinematográficos.',
  },
  {
    id: 'tpl_neon_pursuit',
    title: 'Fuga na Chuva Cibernética',
    genre: 'scifi',
    duration: 28,
    aspectRatio: '16:9',
    narration: true,
    summary: 'Ação sci-fi 16:9 sob chuva com corrida dinâmica, glitch de transição e confronto no convés orbital.',
    prompt:
      'Crie uma animação 2D de ficção científica em 16:9 sobre uma mensageira cibernética correndo sob chuva forte em uma avenida futurista, saltando obstáculos até alcançar o convés orbital. Duração de 28 segundos, com narração e efeitos sonoros futuristas.',
  },
  {
    id: 'tpl_ancient_temple',
    title: 'Despertar nas Ruínas',
    genre: 'adventure',
    duration: 32,
    aspectRatio: '16:9',
    narration: true,
    summary: 'Aventura atmosférica na floresta do crepúsculo e templo antigo com luz volumétrica e partículas douradas.',
    prompt:
      'Crie uma animação 2D de aventura sobre um explorador com lampião atravessando uma floresta enevoada até descobrir um templo de ruínas antigas iluminado por faíscas douradas. Duração de 32 segundos, com legendas e trilha cinematográfica.',
  },
  {
    id: 'tpl_midnight_encounter',
    title: 'Testemunha da Meia-Noite',
    genre: 'drama',
    duration: 24,
    aspectRatio: '9:16',
    narration: true,
    summary: 'Drama noir urbano sob garoa com diálogo expressivo, planos fechados e iluminação de poste.',
    prompt:
      'Crie uma animação 2D de drama noir sobre uma jornalista que caminha por um beco sob garoa, conversa sob a luz de um poste e descobre uma pista decisiva antes de partir. Duração de 24 segundos, formato vertical 9:16.',
  },
  // --- RETRO PIXEL EDUCATIONAL TEMPLATES ---
  {
    id: 'tpl_retro_brain_freeze',
    title: 'Brain Freeze: O Mistério do Gelado',
    genre: 'educational',
    visualStyle: 'retro_pixel_educational',
    educationalTopicId: 'topic_brain_freeze',
    duration: 30,
    aspectRatio: '9:16',
    narration: false,
    summary: 'Pixel art 16-bit educativa: por que algo muito gelado dá dor de cabeça se o cérebro tem 0 sensores de dor.',
    prompt:
      'Explique o que acontece no cérebro quando tomamos algo muito gelado, em estilo retrô pixel art educativo com infográficos animados.',
  },
  {
    id: 'tpl_retro_blood_cells',
    title: 'A Jornada dos Glóbulos Vermelhos',
    genre: 'educational',
    visualStyle: 'retro_pixel_educational',
    educationalTopicId: 'topic_red_blood_cells',
    duration: 30,
    aspectRatio: '9:16',
    narration: false,
    summary: 'Animação retrô na medula óssea, expulsão do núcleo, capilares, entrega de O2 e reciclagem de ferro após 120 dias.',
    prompt:
      'Explique como os glóbulos vermelhos nascem na medula óssea, transportam oxigênio pelo sangue e têm seu ferro reciclado após 120 dias.',
  },
  {
    id: 'tpl_retro_black_hole',
    title: 'Buracos Negros e o Tempo',
    genre: 'educational',
    visualStyle: 'retro_pixel_educational',
    educationalTopicId: 'topic_black_holes',
    duration: 26,
    aspectRatio: '9:16',
    narration: false,
    summary: 'Espaço sideral 16-bit com disco de acreção em dithering e dilatação temporal explicada de forma visual.',
    prompt:
      'Explique como um buraco negro se forma e por que o tempo passa mais devagar perto do horizonte de eventos.',
  },
  {
    id: 'tpl_retro_microchip',
    title: 'Microchip por Dentro (0 e 1)',
    genre: 'educational',
    visualStyle: 'retro_pixel_educational',
    educationalTopicId: 'topic_microchip',
    duration: 26,
    aspectRatio: '9:16',
    narration: false,
    summary: 'Circuito neon animado mostrando transistores de silício, portas lógicas e bilhões de operações por segundo.',
    prompt:
      'Explique como funciona um microchip de computador por dentro usando transistores e código binário em pixel art educativa.',
  },
];

export const DEFAULT_STUDIO_SETTINGS: StudioSettings = {
  ollamaEnabled: false,
  ollamaUrl: 'http://127.0.0.1:11434',
  ollamaModel: '',
  defaultProfile: 'equilibrado',
  defaultAspectRatio: '9:16',
  defaultFps: 24,
  showSafeArea: false,
  autoSaveProjects: true,
};
