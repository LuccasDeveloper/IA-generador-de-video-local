import type {
  ActorActionPhase,
  AnimationState,
  AspectRatio,
  AudioConfig,
  CameraMove,
  CharacterDefinition,
  CharacterPersistentState,
  EffectsConfig,
  ExpressionType,
  FPSOption,
  FramingType,
  Genre,
  LightingConfig,
  LookDirection,
  PerformanceProfile,
  ProjectPlan,
  ResolutionPreset,
  ScenarioDefinition,
  SceneCausalChain,
  SceneSfxEvent,
  SceneSpec,
  SfxType,
  StudioMemoryState,
  TransitionType,
  VisualStyleProfile,
} from '../types/studio';
import {
  buildCharacterVisualSheet,
  DEFAULT_EFFECTS,
  DEFAULT_LIGHTING,
  STARTER_CHARACTERS,
  STARTER_SCENARIOS,
} from '../data/presets';
import { applyLearnedRulesAndAutoRepair } from './learningMemory';
import { generateRetroPixelEducationalPlan } from './retroEducationalPlanner';

export interface GeneratePlanOptions {
  prompt: string;
  visualStyle?: VisualStyleProfile;
  educationalTopicId?: string;
  educationalFacts?: string | string[];
  aspectRatio?: AspectRatio;
  durationSec?: number;
  fps?: FPSOption;
  previewResolution?: ResolutionPreset;
  exportResolution?: ResolutionPreset;
  performanceProfile: PerformanceProfile;
  narrationMode: AudioConfig['narrationMode'];
  availableCharacters: CharacterDefinition[];
  availableScenarios: ScenarioDefinition[];
  useOllama?: boolean;
  ollamaUrl?: string;
  ollamaModel?: string;
  memory?: StudioMemoryState;
}

export interface ParsedScriptBeat {
  text: string;
  startSec?: number;
  endSec?: number;
  durationSec?: number;
}

interface ParsedPromptIntent {
  genre: Genre;
  durationSec: number;
  aspectRatio: AspectRatio;
  noNarration: boolean;
  title: string;
  themeSummary: string;
  hasShadowEntity: boolean;
  hasRain: boolean;
  hasDoor: boolean;
  hasStreetOrVitrine: boolean;
  hasFootsteps: boolean;
  hasChase: boolean;
  beats: string[];
  structuredBeats: ParsedScriptBeat[];
}

const STOPWORDS = new Set([
  'uma', 'uns', 'umas', 'para', 'com', 'sem', 'por', 'sobre', 'que', 'ele', 'ela', 'eles', 'elas',
  'seu', 'sua', 'seus', 'suas', 'dos', 'das', 'nos', 'nas', 'num', 'numa', 'pelo', 'pela', 'mais',
  'muito', 'entao', 'então', 'depois', 'antes', 'quando', 'onde', 'como', 'video', 'vídeo',
  'animacao', 'animação', 'crie', 'faca', 'faça', 'gere', 'produza', 'cena', 'segundos', 'formato',
]);

const CAPTION_STOPWORDS = new Set([
  'o', 'a', 'os', 'as', 'um', 'uma', 'uns', 'umas', 'de', 'do', 'da', 'dos', 'das', 'em', 'no', 'na',
  'nos', 'nas', 'por', 'para', 'com', 'sem', 'sob', 'sobre', 'entre', 'que', 'se', 'e', 'ou', 'mas',
  'ele', 'ela', 'eles', 'elas', 'seu', 'sua', 'seus', 'suas', 'ao', 'aos', 'à', 'às', 'num', 'numa',
  'pelo', 'pela', 'mais', 'muito', 'já', 'ainda', 'então', 'depois', 'antes', 'quando', 'onde', 'como',
  'isso', 'isto', 'aquele', 'aquela', 'este', 'esta', 'dele', 'dela', 'nele', 'nela', 'não', 'sim',
]);

/**
 * Classifies prompt genre faithfully. Psychological horror & thriller cues
 * NEVER silently fall through to 'drama' / noir journalist.
 */
export function detectGenre(text: string): Genre {
  const lower = text.toLowerCase();
  const horrorScore =
    (/(terror|horror|psicol[oó]gic|medo|p[aâ]nico|pesadelo|arrepio|macabr|sinistr|assombra|fantasma|sangue|criatura|monstro)/.test(lower) ? 2 : 0) +
    (/(paranoi|alucina|del[ií]ri|insanidad|obsess[aã]o|claustrofob|perturbador)/.test(lower) ? 2 : 0) +
    (/(reflexo|espelho|vitrine|vidro\s+quebr|m[aã]o\s+sai|sorr(i|ir|indo)\s+sozinho|sorriso\s+sinistro)/.test(lower) ? 2 : 0) +
    (/(abandonad|corredor\s+escuro|luz(es)?\s+(se\s+)?apag|sussurr|passos\s+no\s+andar|porta\s+entreaberta|sil[eê]ncio\s+absoluto)/.test(lower) ? 2 : 0) +
    (/(sombra|vulto|silhueta|entidade|presen[cç]a|atr[aá]s\s+del[ea]|persegui|espreita|suspense|escuro)/.test(lower) ? 1 : 0);

  const scifiScore =
    (/(sci-fi|fic[cç][aã]o\s+cient[ií]fica|cyberpunk|cyber|futurist|nave\s+espacial|espacial|rob[oô]|androide|holograma|neon|orbital)/.test(lower) ? 3 : 0);

  const adventureScore =
    (/(aventura|floresta\s+encantada|templo|ru[ií]na|espada|magia|drag[aã]o|explorador|tesouro|medieval|expedi[cç][aã]o)/.test(lower) ? 3 : 0);

  const noirDramaScore =
    (/(jornalista|investigativ|dossi[eê]|reportagem|noir|detetive|tribunal|romance|drama\s+urbano)/.test(lower) ? 2 : 0) +
    (/(documentos|entrevista|testemunha|beco\s+vazio|garoa)/.test(lower) ? 1 : 0);

  if (horrorScore > 0 && horrorScore >= noirDramaScore && horrorScore >= scifiScore && horrorScore >= adventureScore) {
    return 'horror';
  }
  if (scifiScore > 0 && scifiScore >= adventureScore && scifiScore >= noirDramaScore) {
    return 'scifi';
  }
  if (adventureScore > 0 && adventureScore >= noirDramaScore) {
    return 'adventure';
  }
  if (noirDramaScore > 0) {
    return 'drama';
  }
  // If nocturnal/lonely/eerie signals exist without explicit drama cues, treat as suspense/horror rather than journalist noir
  if (/(sozinho|vazio|noite|estranho|observa|barulho|batida|frio|neblina)/.test(lower)) {
    return 'horror';
  }
  return 'drama';
}

function extractDuration(text: string, fallback = 30): number {
  const secMatch = text.match(/(\d{1,3})\s*(segundos?|seg|s\b)/i);
  if (secMatch) {
    return Math.max(10, Math.min(180, parseInt(secMatch[1], 10)));
  }
  const minMatch = text.match(/(\d{1,2})\s*(minutos?|min\b)/i);
  if (minMatch) {
    return Math.max(15, Math.min(180, parseInt(minMatch[1], 10) * 60));
  }
  return fallback;
}

function extractAspectRatio(text: string, fallback: AspectRatio): AspectRatio {
  const lower = text.toLowerCase();
  if (/(16:9|widescreen|horizontal|youtube|cinema)/.test(lower)) return '16:9';
  if (/(1:1|quadrad|square)/.test(lower)) return '1:1';
  if (/(9:16|vertical|reels|shorts|tiktok)/.test(lower)) return '9:16';
  return fallback;
}

/**
 * Extracts ordered chronological narrative beats AND optional explicit timestamp ranges
 * (e.g., "1. 0–5s: ...", "Cena 1 (0-5s): ...", "Cena 1: ...") directly from the user's prompt.
 * When explicit numbered/timestamped scenes exist, preamble metadata lines before Scene 1
 * and trailing format metadata lines are ignored instead of being turned into phantom scenes.
 */
export function parseStructuredScriptBeats(prompt: string): ParsedScriptBeat[] {
  // 1. Detect explicit structured scenes first (preserving exact timestamps before any global regex cleanup)
  const rawSegments = prompt
    .split(/\n+|(?=\bcena\s*\d+\s*(?:\([^)]*\))?\s*[:.\-–])/i)
    .map((line) => line.replace(/^[-*•]\s*/, '').trim())
    .filter((line) => line.length > 0);

  const structuredPattern =
    /^(?:(?:cena\s*)?(\d+)\s*(?:[.):\-–]|\s+(?=\(?[\d]))\s*)?(?:\(?\s*(\d+(?:[.,]\d+)?)\s*(?:[-–—]|a)\s*(\d+(?:[.,]\d+)?)\s*s(?:eg(?:undos?)?)?\s*\)?\s*[:.\-–]?\s*)?(.+)$/i;

  const explicitMatches: ParsedScriptBeat[] = [];
  for (const seg of rawSegments) {
    const looksNumbered = /^(?:cena\s*\d+|\d+\s*[.):\-–])/i.test(seg);
    const looksTimestamped = /^(?:(?:cena\s*)?\d+\s*[.):\-–]?\s*)?\(?\s*\d+(?:[.,]\d+)?\s*(?:[-–—]|a)\s*\d+(?:[.,]\d+)?\s*s/i.test(seg);
    if (!looksNumbered && !looksTimestamped) continue;

    const m = seg.match(structuredPattern);
    if (!m) continue;
    const rawStart = m[2];
    const rawEnd = m[3];
    let text = (m[4] ?? '').trim();
    // Strip any leading punctuation left after removing prefix/timestamp
    text = text.replace(/^[:.\-–)\s]+/, '').trim();
    if (text.length <= 5) continue;

    let startSec: number | undefined;
    let endSec: number | undefined;
    let durationSec: number | undefined;
    if (rawStart !== undefined && rawEnd !== undefined) {
      startSec = parseFloat(rawStart.replace(',', '.'));
      endSec = parseFloat(rawEnd.replace(',', '.'));
      if (Number.isFinite(startSec) && Number.isFinite(endSec) && endSec > startSec) {
        durationSec = Number(Math.max(1.5, endSec - startSec).toFixed(2));
      }
    }
    explicitMatches.push({ text, startSec, endSec, durationSec });
  }

  if (explicitMatches.length >= 2) {
    return explicitMatches.slice(0, 8);
  }

  // 2. Prose prompt fallback: strip meta directives safely without truncating genre words
  const cleaned = prompt
    .replace(/dura[cç][aã]o\s+de\s+\d+\s*(segundos?|minutos?|s\b)/gi, '')
    .replace(/sem\s+narra[cç][aã]o/gi, '')
    .replace(/com\s+(narra[cç][aã]o|legendas?|trilha|efeitos?\s+sonoros?[^.,;\n]*)/gi, '')
    .replace(/formato\s+(vertical|horizontal|quadrado|\d+:\d+)/gi, '')
    .replace(/\b(9:16|16:9|1:1)\b/gi, '')
    .replace(
      /^(crie|fa[cç]a|gere|produza)\s+(um|uma)\s+(v[ií]deo|anima[cç][aã]o|curta|short)\s*(2d)?\s*(de\s+\w+\s*)?(em\s+\w+\s*)?(sobre\s+)?/i,
      ''
    )
    .trim();

  const proseParts = cleaned
    .split(
      /(?:[.!?;]+\s*|\s*,\s*(?:e\s+)?(?:depois|ent[aã]o|em seguida|quando|at[eé]|mas|enquanto|encontra|escuta|ouve|percebe|descobre|corre|foge|salta|entra|sobe|olha|abre|enfrenta|chega)\b|\s+e\s+(?=(?:percebe|encontra|descobre|escuta|ouve|corre|foge|salta|abre|sobe|enfrenta|chega|ataca|parte)\b))/i
    )
    .map((p) => p.replace(/^[,;.\-\s]+|[,;.\-\s]+$/g, '').trim())
    .filter((p) => p.length > 6);

  const refined: string[] = [];
  for (const raw of cleaned.split(/[.!?;]+/).map((s) => s.trim()).filter((s) => s.length > 5)) {
    const subClauses = raw
      .split(/,\s+(?=(?:ele|ela|depois|ent[aã]o|encontra|escuta|ouve|percebe|descobre|saltando|at[eé]|conversa|corre|foge|abre|sobe|em seguida)\b)|\s+e\s+(?=(?:percebe|encontra|descobre|escuta|ouve|corre|foge|abre|sobe|conversa|enfrenta|parte)\b)|\s+at[eé]\s+(?=(?:alcan[cç]ar|descobrir|chegar|encontrar)\b)/i)
      .map((c) => c.trim())
      .filter((c) => c.length > 5);
    refined.push(...subClauses);
  }

  const chosen = refined.length >= proseParts.length ? refined : proseParts;
  return chosen.slice(0, 7).map((text) => ({ text }));
}

export function parseOrderedScriptBeats(prompt: string): string[] {
  return parseStructuredScriptBeats(prompt).map((b) => b.text);
}

function extractKeywords(text: string): string[] {
  const words = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 4 && !STOPWORDS.has(w));
  return Array.from(new Set(words)).slice(0, 5);
}

function buildTitleFromPrompt(prompt: string, genre: Genre): string {
  const lower = prompt.toLowerCase();
  // Check if user provided an explicit title line like 'Título: ...'
  const explicitTitle = prompt.match(/(?:^|\n)\s*t[ií]tulo\s*:\s*([^\n.]+)/i);
  if (explicitTitle && explicitTitle[1].trim().length >= 3) {
    return explicitTitle[1].trim().replace(/^["'«]+|["'»]+$/g, '');
  }
  if (lower.includes('vitrine') && (lower.includes('reflexo') || lower.includes('vidro'))) {
    return 'O Reflexo na Vitrine';
  }
  if (lower.includes('espelho') && (lower.includes('reflexo') || lower.includes('atrasad'))) {
    return 'O Reflexo Atrasado';
  }
  if (lower.includes('luzes') && (lower.includes('apagam') || lower.includes('corredor'))) {
    return 'O Corredor Sem Volta';
  }
  if (lower.includes('casa abandonada')) return 'A Casa Abandonada';
  if (lower.includes('porta entreaberta')) return 'Atrás da Porta Entreaberta';
  if (lower.includes('chuva') && genre === 'scifi') return 'Perseguição sob Chuva Neon';
  if (lower.includes('floresta') || lower.includes('ruína') || lower.includes('ruina')) return 'Ecos das Ruínas Antigas';
  // Only use the noir title when genre is explicitly drama AND prompt is about a journalist
  if (genre === 'drama' && lower.includes('jornalista')) return 'Sombras da Meia-Noite';

  const firstLine = prompt.split('\n')[0] ?? prompt;
  const words = firstLine
    .replace(/^(crie|faça|faca|gere|produza)\s+(um|uma)\s+(vídeo|video|animação|animacao|short|curta)\s*(2d)?\s*(de\s+[\wÀ-ÿ]+\s*)?(psicol[oó]gic[oa]\s*)?(sobre\s+)?/i, '')
    .split(/\s+/)
    .filter((w) => w.length > 0 && !/^(com|em|de|para|\d+s?)$/i.test(w))
    .slice(0, 5)
    .join(' ')
    .replace(/[.,;:!?]+$/, '');

  if (words.length > 4) {
    return words.charAt(0).toUpperCase() + words.slice(1);
  }
  const defaults: Record<Genre, string> = {
    horror: 'Presença na Escuridão',
    scifi: 'Horizonte Cibernético',
    adventure: 'Crônica da Expedição',
    drama: 'Noite na Cidade',
    educational: 'Curiosidade Científica Retrô',
  };
  return defaults[genre];
}

/**
 * Produces natural, grammatical PT-BR captions synced strictly to visual action:
 * - Strips technical camera/editing stage directions ("câmera acompanha...", "plano geral...", "corta para preto")
 * - Never invents events absent from the beat
 * - Keeps text concise and readable
 */
export function sanitizeNaturalCaption(beatText: string): string {
  let clean = beatText
    .replace(/\b(a\s+)?c[aâ]mera\s+(acompanha|segue|aproxima|afasta|gira|mostra|enquadra|recua|fecha|abre)[^;,.]*[;,.]?\s*/gi, '')
    .replace(/\b(plano\s+(geral|m[eé]dio|detalhe|fechado)|close-?up|dolly|tracking|fade\s+out|corte\s+seco)\b[^;,.]*[;,.]?\s*/gi, '')
    .replace(/\be\s+a\s+tela\s+corta\s+para\s+preto\b/gi, '')
    .replace(/\ba\s+tela\s+corta\s+para\s+preto\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[,;:\-–\s]+|[,;:\-–\s]+$/g, '')
    .trim();

  if (!clean) return '';

  // Ensure natural sentence capitalization & clean ending punctuation
  clean = clean.charAt(0).toUpperCase() + clean.slice(1);
  if (!/[.!?…]$/.test(clean)) {
    clean += '.';
  }
  return clean;
}

/**
 * Selects 1-2 meaningful dramatic content words for intentional visual emphasis
 * (never highlights prepositions, articles, or random filler words).
 */
export function extractCaptionEmphasisWords(captionText: string): string[] {
  if (!captionText.trim()) return [];
  const tokens = captionText
    .replace(/[.,;:!?…"“”()]/g, '')
    .split(/\s+/)
    .filter((w) => w.length >= 5 && !CAPTION_STOPWORDS.has(w.toLowerCase()));

  // Prefer high-impact narrative nouns/verbs
  const priorityRx =
    /(sombra|reflexo|espelho|vitrine|silhueta|sorrir|sorriso|vidro|agarra|passos|porta|escurid[aã]o|apaga|sussurro|persegui|vulto|corredor|sozinho|atrasado|sil[eê]ncio|grito)/i;
  const prioritized = tokens.filter((w) => priorityRx.test(w));
  const chosen = prioritized.length > 0 ? prioritized : tokens.slice(-2);
  return Array.from(new Set(chosen.map((w) => w.toLowerCase()))).slice(0, 2);
}

export function interpretPromptOffline(
  prompt: string,
  fallbackAspect: AspectRatio = '9:16',
  fallbackDuration = 30
): ParsedPromptIntent {
  const lower = prompt.toLowerCase();
  const genre = detectGenre(prompt);
  const structuredBeats = parseStructuredScriptBeats(prompt);
  const timedSum = structuredBeats.every((b) => typeof b.durationSec === 'number')
    ? Number(structuredBeats.reduce((acc, b) => acc + (b.durationSec ?? 0), 0).toFixed(2))
    : 0;
  const durationSec = timedSum >= 6 ? timedSum : extractDuration(prompt, fallbackDuration);
  const aspectRatio = extractAspectRatio(prompt, fallbackAspect);
  const noNarration = /sem\s+narra[cç][aã]o|apenas\s+efeitos|mudo\s+de\s+voz/i.test(lower);

  return {
    genre,
    durationSec,
    aspectRatio,
    noNarration,
    title: buildTitleFromPrompt(prompt, genre),
    themeSummary:
      genre === 'horror'
        ? 'Suspense cinematográfico 2D com iluminação direcional controlada, prenúncio progressivo e fidelidade ao roteiro.'
        : genre === 'scifi'
        ? 'Ação futurista dinâmica com profundidade parallax, iluminação limpa e ritmo cinético.'
        : genre === 'adventure'
        ? 'Jornada 2D em camadas com luz quente controlada, partículas sutis e revelação final.'
        : 'Narrativa urbana intimista com atuações expressivas, iluminação noir limpa e transições suaves.',
    hasShadowEntity: /(sombra|vulto|silhueta|monstro|criatura|entidade|atr[aá]s\s+del[ea]|perseguidor|fantasma|figura|m[aã]o\s+sai)/i.test(lower),
    hasRain: /(chuva|garoa|tempestade|molhad)/i.test(lower),
    hasDoor: /(porta|corredor|andar de cima|quarto|escada)/i.test(lower),
    hasStreetOrVitrine: /(rua|vitrine|vidro|cal[cç]ada|avenida|reflexo)/i.test(lower),
    hasFootsteps: /(passos|caminh|anda|entra|sobe)/i.test(lower),
    hasChase: /(corr|fuga|persegui|salt|atac)/i.test(lower),
    beats: structuredBeats.map((b) => b.text),
    structuredBeats,
  };
}

function getGenreVisualIdentity(genre: Genre): ProjectPlan['visualIdentity'] {
  switch (genre) {
    case 'horror':
      return {
        mood: 'Suspense gótico nítido com contraste equilibrado e sombras direcionais',
        palette: ['#0A0F1A', '#1B2538', '#2F3D54', '#E5A032', '#DC2626'],
        lightingStyle: 'Chiaroscuro legível com luz pontual controlada, rim light fria e névoa de fundo',
        cameraLanguage: 'Dolly contínuo, tracking suave, aproximação tensa sem câmeras mortas',
      };
    case 'scifi':
      return {
        mood: 'Cibernético cinético limpo com reflexos de piso e profundidade parallax',
        palette: ['#071120', '#142A47', '#1E3A5F', '#38BDF8', '#F59E0B'],
        lightingStyle: 'Iluminação direcional ciano sem artefatos de glitch ou scanlines excessivos',
        cameraLanguage: 'Tracking veloz, pan dinâmico, dolly-in revelador',
      };
    case 'adventure':
      return {
        mood: 'Atmosfera épica crepuscular com camadas independentes de profundidade',
        palette: ['#0D1B24', '#234047', '#3E5B4E', '#F59E0B', '#FDE68A'],
        lightingStyle: 'Luz direcional dourada com poeira sutil e sombras ancoradas',
        cameraLanguage: 'Dolly-in exploratório, tracking, pull-back épico',
      };
    default:
      return {
        mood: 'Noir urbano contemplativo com foco expressivo',
        palette: ['#0C1018', '#1C2434', '#38465C', '#E5A032', '#CBD5E1'],
        lightingStyle: 'Luz quente de poste urbano com vinheta suave e contraste controlado',
        cameraLanguage: 'Planos médios vivos, dolly-in íntimo e transições suaves',
      };
  }
}

/**
 * Dynamic per-scene lighting with strict anti-overwash ceilings so volumetric light,
 * fog, and darkness NEVER obscure character details or background architecture.
 */
function getLightingForScene(genre: Genre, intent: SceneSpec['narrativeIntent']): LightingConfig {
  const base: LightingConfig = { ...DEFAULT_LIGHTING };
  if (genre === 'horror') {
    base.ambientIntensity = intent === 'climax' ? 0.36 : intent === 'encerramento' ? 0.32 : 0.42;
    base.ambientColor = '#101828';
    base.directionalAngle = intent === 'climax' ? 42 : 28;
    base.directionalColor = '#7dd3fc';
    base.directionalIntensity = intent === 'climax' ? 0.36 : 0.32;
    base.pointLightEnabled = true;
    base.pointLightColor = intent === 'climax' ? '#fde68a' : '#fef08a';
    base.pointLightRadius = 0.36;
    base.pointLightFlicker = intent === 'climax' ? 0.16 : 0.08;
    base.rimLightColor = intent === 'climax' || intent === 'encerramento' ? '#f87171' : '#60a5fa';
    base.rimLightIntensity = intent === 'climax' ? 0.62 : 0.48;
    base.shadowIntensity = 0.7;
    base.volumetricIntensity = 0.18;
    base.bloomIntensity = 0.12;
    base.glowIntensity = 0.12;
  } else if (genre === 'scifi') {
    base.ambientIntensity = 0.48;
    base.ambientColor = '#0f2036';
    base.directionalAngle = 32;
    base.directionalColor = '#38bdf8';
    base.directionalIntensity = 0.46;
    base.pointLightColor = '#22d3ee';
    base.pointLightRadius = 0.36;
    base.pointLightFlicker = 0.05;
    base.rimLightColor = '#38bdf8';
    base.rimLightIntensity = 0.56;
    base.shadowIntensity = 0.62;
    base.volumetricIntensity = 0.16;
    base.bloomIntensity = 0.16;
    base.glowIntensity = 0.14;
  } else if (genre === 'adventure') {
    base.ambientIntensity = 0.54;
    base.ambientColor = '#1c2b29';
    base.directionalAngle = 24;
    base.directionalColor = '#fbbf24';
    base.directionalIntensity = 0.5;
    base.pointLightColor = '#fde68a';
    base.pointLightRadius = 0.38;
    base.pointLightFlicker = 0.06;
    base.rimLightColor = '#f59e0b';
    base.rimLightIntensity = 0.5;
    base.shadowIntensity = 0.6;
    base.volumetricIntensity = 0.18;
    base.bloomIntensity = 0.15;
    base.glowIntensity = 0.14;
  } else {
    base.ambientIntensity = 0.46;
    base.ambientColor = '#161e2e';
    base.directionalAngle = 30;
    base.directionalColor = '#cbd5e1';
    base.directionalIntensity = 0.4;
    base.pointLightColor = '#f59e0b';
    base.pointLightRadius = 0.38;
    base.pointLightFlicker = 0.04;
    base.rimLightColor = '#e5a032';
    base.rimLightIntensity = 0.44;
    base.shadowIntensity = 0.64;
    base.volumetricIntensity = 0.15;
    base.bloomIntensity = 0.12;
    base.glowIntensity = 0.12;
  }
  return base;
}

/**
 * Clean atmospheric effects strictly capped to prevent fog overwash, horizontal glitch bars,
 * scanline artifacts, or excessive camera shake.
 */
function getEffectsForScene(
  genre: Genre,
  intent: SceneSpec['narrativeIntent'],
  hasRain: boolean
): EffectsConfig {
  const fx: EffectsConfig = { ...DEFAULT_EFFECTS };
  // Never emit artificial glitch bars, scanlines, or broken chromatic borders automatically
  fx.glitch = 0;
  fx.scanlines = 0;
  fx.chromaticAberration = 0;

  if (genre === 'horror') {
    fx.fog = intent === 'climax' ? 0.2 : 0.16;
    fx.dust = 0.34;
    fx.rain = hasRain ? 0.36 : 0;
    fx.smoke = intent === 'climax' ? 0.1 : 0.06;
    fx.vignette = intent === 'climax' ? 0.56 : 0.44;
    fx.filmGrain = 0.16;
    fx.cameraShake = intent === 'climax' ? 0.22 : intent === 'tensao' ? 0.08 : 0.03;
  } else if (genre === 'scifi') {
    fx.fog = 0.12;
    fx.rain = hasRain ? 0.48 : 0.28;
    fx.sparks = intent === 'climax' ? 0.38 : 0.14;
    fx.vignette = 0.36;
    fx.filmGrain = 0.1;
    fx.cameraShake = intent === 'climax' ? 0.18 : 0.06;
  } else if (genre === 'adventure') {
    fx.fog = 0.16;
    fx.dust = 0.38;
    fx.sparks = intent === 'climax' ? 0.36 : 0.18;
    fx.fire = intent === 'climax' ? 0.14 : 0;
    fx.vignette = 0.32;
    fx.filmGrain = 0.1;
    fx.cameraShake = intent === 'climax' ? 0.12 : 0.03;
  } else {
    fx.rain = hasRain ? 0.34 : 0.18;
    fx.fog = 0.12;
    fx.vignette = 0.42;
    fx.filmGrain = 0.14;
    fx.cameraShake = 0.03;
  }
  return fx;
}

/**
 * Cinematic Director: guarantees dynamic non-static framing, never repeats consecutive
 * framing/camera moves, assigns a secondary camera evolution for long shots,
 * and ensures smooth transitions whenever the scenario changes.
 */
function assignCinematicVariety(
  index: number,
  intent: SceneSpec['narrativeIntent'],
  scenarioChanged: boolean,
  prevMove?: CameraMove,
  prevFraming?: FramingType
): {
  framing: FramingType;
  cameraMove: CameraMove;
  secondaryCameraMove: CameraMove;
  transitionIn: TransitionType;
  focusTarget: NonNullable<SceneSpec['focusTarget']>;
  cameraMotivation: string;
} {
  const candidatesByIntent: Record<
    SceneSpec['narrativeIntent'],
    Array<{
      framing: FramingType;
      move: CameraMove;
      secondary: CameraMove;
      trans: TransitionType;
      focusTarget: NonNullable<SceneSpec['focusTarget']>;
      motivation: string;
    }>
  > = {
    abertura: [
      {
        framing: 'wide',
        move: 'dolly_in',
        secondary: 'tracking',
        trans: 'fade_black',
        focusTarget: 'environment',
        motivation: 'Estabelecer a geografia do espaço e o isolamento do protagonista antes da tensão.',
      },
      {
        framing: 'low_angle',
        move: 'pan',
        secondary: 'dolly_in',
        trans: 'fade_black',
        focusTarget: 'subject_body',
        motivation: 'Apresentar o ambiente opressivo acima do personagem enquanto ele entra em cena.',
      },
    ],
    tensao: [
      {
        framing: 'medium',
        move: 'tracking',
        secondary: 'dolly_in',
        trans: 'crossfade',
        focusTarget: 'subject_body',
        motivation: 'Acompanhar o deslocamento do personagem mantendo leitura do fundo para sinais de ameaça.',
      },
      {
        framing: 'detail',
        move: 'dolly_in',
        secondary: 'tilt',
        trans: 'crossfade',
        focusTarget: 'prop_clue',
        motivation: 'Isolar o indício físico/visual que quebra a normalidade e alerta o espectador.',
      },
      {
        framing: 'over_shoulder',
        move: 'tilt',
        secondary: 'handheld',
        trans: 'crossfade',
        focusTarget: 'reflection',
        motivation: 'Colocar o espectador no ponto de vista do protagonista ao inspecionar o objeto/reflexo.',
      },
    ],
    desenvolvimento: [
      {
        framing: 'over_shoulder',
        move: 'dolly_in',
        secondary: 'handheld',
        trans: 'crossfade',
        focusTarget: 'prop_clue',
        motivation: 'Conectar o olhar do personagem diretamente ao elemento que provoca a próxima reação.',
      },
      {
        framing: 'close_up',
        move: 'dolly_in',
        secondary: 'handheld',
        trans: 'crossfade',
        focusTarget: 'subject_face',
        motivation: 'Captar a mudança de expressão facial e o crescimento do medo psicológico.',
      },
      {
        framing: 'wide',
        move: 'pan',
        secondary: 'dolly_in',
        trans: 'crossfade',
        focusTarget: 'environment',
        motivation: 'Reposicionar o espaço para revelar a distância entre protagonista e ameaça.',
      },
    ],
    climax: [
      {
        framing: 'close_up',
        move: 'dolly_in',
        secondary: 'dutch_angle',
        trans: 'crossfade',
        focusTarget: 'subject_face',
        motivation: 'Comprimir o quadro sobre o rosto/reflexo para maximizar a claustrofobia psicológica.',
      },
      {
        framing: 'extreme_close_up',
        move: 'zoom',
        secondary: 'dutch_angle',
        trans: 'crossfade',
        focusTarget: 'reflection',
        motivation: 'Forçar atenção absoluta ao detalhe perturbador no ápice dramático.',
      },
      {
        framing: 'low_angle',
        move: 'tracking',
        secondary: 'handheld',
        trans: 'crossfade',
        focusTarget: 'subject_body',
        motivation: 'Ampliar a escala da ameaça e imprimir urgência física à fuga/confronto.',
      },
    ],
    encerramento: [
      {
        framing: 'extreme_close_up',
        move: 'zoom',
        secondary: 'dutch_angle',
        trans: 'crossfade',
        focusTarget: 'subject_face',
        motivation: 'Fechar o enquadramento sobre o impacto final sem dispersão visual.',
      },
      {
        framing: 'wide',
        move: 'dolly_out',
        secondary: 'tilt',
        trans: 'crossfade',
        focusTarget: 'environment',
        motivation: 'Afastar a câmera para enfatizar o vazio e a consequência definitiva da cena.',
      },
    ],
  };

  const list = candidatesByIntent[intent];
  let chosen = list[index % list.length];
  for (let i = 0; i < list.length; i++) {
    const pick = list[(index + i) % list.length];
    if (pick.move !== prevMove && pick.framing !== prevFraming) {
      chosen = pick;
      break;
    }
  }

  const transitionIn: TransitionType =
    index === 0 ? 'fade_black' : scenarioChanged ? 'crossfade' : chosen.trans;

  return {
    framing: chosen.framing,
    cameraMove: chosen.move,
    secondaryCameraMove: chosen.secondary,
    transitionIn,
    focusTarget: chosen.focusTarget,
    cameraMotivation: chosen.motivation,
  };
}

function makeSfx(sfx: SfxType, offsetSec: number, volume: number, label: string): SceneSfxEvent {
  return {
    id: `sfx_${Math.random().toString(36).slice(2, 9)}`,
    sfx,
    offsetSec: Number(offsetSec.toFixed(2)),
    volume,
    label,
  };
}

interface SemanticBeatDirective {
  title: string;
  summary: string;
  caption: string;
  captionEmphasisWords: string[];
  sourceBeat: string;
  expectedKeywords: string[];
  whatChanges: string;
  narrativeObjective: string;
  scenarioId: string;
  actorState: AnimationState;
  nextState: AnimationState;
  actionPhases: ActorActionPhase[];
  expr: ExpressionType;
  lookDirection: LookDirection;
  startX: number;
  endX: number;
  flipXOverride?: boolean;
  revealsCreature: boolean;
  foreshadowInScene?: boolean;
  pursueShadowInScene?: boolean;
  reflectionMode?: SceneSpec['reflectionMode'];
  endingImpactOverride?: SceneSpec['endingImpact'];
  framingOverride?: FramingType;
  cameraMoveOverride?: CameraMove;
  secondaryCameraMoveOverride?: CameraMove;
  focusTargetOverride?: NonNullable<SceneSpec['focusTarget']>;
  cameraMotivationOverride?: string;
  sfx: SceneSfxEvent[];
}

function deriveBeatTitle(beat: string, fallbackIndex: number): string {
  const clean = beat.replace(/^[,;.\-\s]+/, '').trim();
  let words = clean.split(/\s+/).slice(0, 6).join(' ').replace(/[.,;:!?]+$/, '');
  words = words.replace(/\s+(e|o|a|os|as|de|do|da|dos|das|em|no|na|para|com|que|um|uma)$/i, '').trim();
  if (words.length >= 4) {
    return words.charAt(0).toUpperCase() + words.slice(1);
  }
  return `Cena ${fallbackIndex + 1}`;
}

/**
 * Maps an individual ordered beat from the user's script into concrete 2D direction
 * (scenario, multi-phase character choreography, look direction, reflection mode, SFX, creature staging)
 * while maintaining spatial continuity from prevEndX.
 */
function buildSemanticDirectiveForBeat(
  beatText: string,
  index: number,
  totalScenes: number,
  intent: SceneSpec['narrativeIntent'],
  genre: Genre,
  protagonist: CharacterDefinition,
  primaryScenario: ScenarioDefinition,
  secondaryScenario: ScenarioDefinition,
  prevEndX: number,
  prevScenarioId: string
): SemanticBeatDirective {
  const lower = beatText.toLowerCase();

  const mentionsDoorOrUpper = /(porta|corredor|andar de cima|escada|quarto|s[oó]t[aã]o|conv[eé]s|templo|ru[ií]na|altar)/.test(lower);
  const mentionsFootstepsUp = /(passos|andar de cima|barulho|ru[ií]do|ecoa|escuta|ouve)/.test(lower);
  const mentionsHandGrab = /(m[aã]o\s+sai|sai\s+do\s+vidro|agarra|puxa\s+.*vidro|quebra\s+.*vidro)/.test(lower);
  const mentionsCutToBlack = /(corta\s+para\s+preto|corte\s+para\s+preto|tela\s+preta|cut\s+to\s+black)/.test(lower);
  const mentionsAutonomousSmile = /(reflexo.*sorri|sorr(i|ir|indo)\s+sozinho|sorriso\s+sinistro)/.test(lower);
  const mentionsReflectionFigure = /(vitrine|reflexo|vidro)/.test(lower) && /(figura|atr[aá]s|sombra|vulto|algu[eé]m)/.test(lower);
  const mentionsSilhouetteBg = /(silhueta|vulto).*?(fundo|longe|distante|aparece)/.test(lower);
  const mentionsShadowPursuit = /(desaparece.*persegui|sombra.*persegui|come[cç]a\s+a\s+persegui|persegui-lo|persegui)/.test(lower);
  const mentionsCreature = /(sombra|vulto|monstro|criatura|entidade|atr[aá]s\s+del[ea]|perseguidor|fantasma|intercepta)/.test(lower);
  const mentionsRunOrEscape = /(\bcorr(e|er|endo|ida)\b|fuga|\bfoge\b|persegui|arrancada|r[aá]pid)/.test(lower);
  const mentionsJump = /(salt|pul|obst[aá]cul|passarela)/.test(lower);
  const mentionsTalk = /(convers|fala|diz|relata|entrevista|testemunh)/.test(lower);
  const mentionsAttack = /(atac|confront|luta|golp|espada|neutraliz|ergue)/.test(lower);
  const mentionsEnter = /(entra|chega|atravessa|caminha|avan[cç]a|percorre)/.test(lower);

  const isStreetTheme = primaryScenario.theme === 'dark_rain_street';

  // Scenario continuity: switch to secondary scenario when beat explicitly enters corridor/door/deck/ruins or mid-late arc
  let scenarioId = primaryScenario.id;
  if (mentionsDoorOrUpper && !mentionsFootstepsUp) {
    scenarioId = secondaryScenario.id;
  } else if (mentionsCreature && !isStreetTheme && index >= Math.floor(totalScenes / 2)) {
    scenarioId = secondaryScenario.id;
  } else if (
    !isStreetTheme &&
    index >= Math.ceil(totalScenes / 2) &&
    secondaryScenario.id !== primaryScenario.id &&
    intent !== 'abertura'
  ) {
    scenarioId = prevScenarioId === secondaryScenario.id || mentionsDoorOrUpper ? secondaryScenario.id : primaryScenario.id;
  }
  if (intent === 'encerramento' && prevScenarioId) {
    scenarioId = prevScenarioId;
  }

  // Spatial continuity: if staying in same scenario, start near where the actor ended previously
  const sameScenario = index > 0 && scenarioId === prevScenarioId;
  let startX = sameScenario ? Math.max(0.2, Math.min(0.76, prevEndX)) : 0.24;
  let endX = Math.min(0.76, startX + 0.24);
  let flipXOverride: boolean | undefined;

  let actorState: AnimationState = 'walk';
  let nextState: AnimationState = 'idle';
  let expr: ExpressionType = genre === 'horror' ? 'scared' : 'determined';
  let lookDirection: LookDirection = 'forward';
  let actionPhases: ActorActionPhase[] = [];
  let revealsCreature = false;
  let foreshadowInScene = false;
  let pursueShadowInScene = false;
  let reflectionMode: SceneSpec['reflectionMode'] = isStreetTheme ? 'mirror' : 'none';
  let endingImpactOverride: SceneSpec['endingImpact'] | undefined;
  let framingOverride: FramingType | undefined;
  let cameraMoveOverride: CameraMove | undefined;
  let secondaryCameraMoveOverride: CameraMove | undefined;
  const sfx: SceneSfxEvent[] = [];

  if (mentionsHandGrab) {
    // Climax smash-cut: hand bursts out of vitrine glass, grabs protagonist, hard cut to black
    startX = sameScenario ? Math.max(0.36, Math.min(0.46, prevEndX)) : 0.4;
    endX = Math.min(0.5, startX + 0.08);
    flipXOverride = false;
    actorState = 'idle';
    nextState = 'hit';
    expr = 'scared';
    lookDirection = 'forward';
    reflectionMode = 'hand_grab';
    endingImpactOverride = mentionsCutToBlack ? 'cut_to_black' : 'cut_to_black';
    framingOverride = 'medium';
    cameraMoveOverride = 'zoom';
    secondaryCameraMoveOverride = 'dutch_angle';
    actionPhases = [
      { atProgress: 0.0, state: 'idle', expression: 'surprised', lookDirection: 'forward' },
      { atProgress: 0.24, state: 'hit', expression: 'scared', lookDirection: 'forward' },
      { atProgress: 0.56, state: 'hit', expression: 'scared', lookDirection: 'forward' },
    ];
    sfx.push(
      makeSfx('impact', 0.42, 0.94, 'Vidro estilhaçando'),
      makeSfx('sting', 0.95, 0.95, 'Mão agarra o personagem'),
      makeSfx('boom', 2.45, 0.92, 'Corte seco para preto')
    );
  } else if (mentionsAutonomousSmile) {
    // Protagonist halts breathless before vitrine; reflection independently breaks into sinister smile
    startX = sameScenario ? Math.max(0.36, Math.min(0.48, prevEndX - 0.26)) : 0.44;
    endX = 0.4;
    flipXOverride = false;
    actorState = 'walk';
    nextState = 'idle';
    expr = 'scared';
    lookDirection = 'forward';
    reflectionMode = 'autonomous_smile';
    framingOverride = 'close_up';
    cameraMoveOverride = 'dolly_in';
    secondaryCameraMoveOverride = 'dutch_angle';
    actionPhases = [
      { atProgress: 0.0, state: 'walk', expression: 'surprised', lookDirection: 'forward' },
      { atProgress: 0.22, state: 'idle', expression: 'surprised', lookDirection: 'forward' },
      { atProgress: 0.52, state: 'idle', expression: 'scared', lookDirection: 'forward' },
      { atProgress: 0.8, state: 'idle', expression: 'scared', lookDirection: 'scan' },
    ];
    sfx.push(
      makeSfx('heartbeat', 0.45, 0.72, 'Batimento tenso diante da vitrine'),
      makeSfx('creak', 1.7, 0.55, 'Estalo sutil no vidro'),
      makeSfx('riser', 2.4, 0.82, 'Tensão do sorriso autônomo')
    );
  } else if (mentionsReflectionFigure) {
    // Protagonist observes vitrine; reflection reveals looming shadow figure behind him
    startX = sameScenario ? Math.max(0.36, Math.min(0.48, prevEndX - 0.1)) : 0.44;
    endX = 0.4;
    flipXOverride = false;
    actorState = 'walk';
    nextState = 'idle';
    expr = 'surprised';
    lookDirection = 'forward';
    reflectionMode = 'figure_behind';
    framingOverride = 'over_shoulder';
    cameraMoveOverride = 'dolly_in';
    secondaryCameraMoveOverride = 'handheld';
    actionPhases = [
      { atProgress: 0.0, state: 'walk', expression: 'neutral', lookDirection: 'forward' },
      { atProgress: 0.28, state: 'idle', expression: 'neutral', lookDirection: 'forward' },
      { atProgress: 0.58, state: 'idle', expression: 'surprised', lookDirection: 'forward' },
      { atProgress: 0.82, state: 'idle', expression: 'scared', lookDirection: 'back' },
    ];
    sfx.push(
      makeSfx('wind', 0.2, 0.42, 'Chuva contra a vitrine'),
      makeSfx('riser', 1.6, 0.72, 'Presença no reflexo'),
      makeSfx('sting', 3.6, 0.86, 'Figura revelada atrás dele')
    );
  } else if (mentionsShadowPursuit) {
    // Figure vanishes from reflection and shadow entity emerges behind him in pursuit
    startX = sameScenario ? Math.max(0.28, Math.min(0.44, prevEndX)) : 0.34;
    endX = 0.76;
    flipXOverride = false;
    actorState = 'run';
    nextState = 'sprint';
    expr = 'scared';
    lookDirection = 'back';
    reflectionMode = isStreetTheme ? 'mirror' : 'none';
    pursueShadowInScene = true;
    revealsCreature = true;
    framingOverride = 'low_angle';
    cameraMoveOverride = 'tracking';
    secondaryCameraMoveOverride = 'handheld';
    actionPhases = [
      { atProgress: 0.0, state: 'idle', expression: 'surprised', lookDirection: 'back' },
      { atProgress: 0.16, state: 'run', expression: 'scared', lookDirection: 'forward' },
      { atProgress: 0.52, state: 'sprint', expression: 'scared', lookDirection: 'back' },
      { atProgress: 0.82, state: 'sprint', expression: 'scared', lookDirection: 'forward' },
    ];
    sfx.push(
      makeSfx('whoosh', 0.45, 0.82, 'Desaparecimento e arranque'),
      makeSfx('heartbeat', 1.4, 0.78, 'Pulso na perseguição'),
      makeSfx('boom', 3.2, 0.86, 'Sombra avança em perseguição')
    );
  } else if (mentionsSilhouetteBg) {
    // Camera tracks protagonist walking; distant dark silhouette appears in the background
    startX = sameScenario ? Math.max(0.36, Math.min(0.5, prevEndX)) : 0.4;
    endX = Math.min(0.6, startX + 0.16);
    flipXOverride = false;
    actorState = 'walk';
    nextState = 'walk';
    expr = 'determined';
    lookDirection = 'forward';
    foreshadowInScene = true;
    framingOverride = 'medium';
    cameraMoveOverride = 'tracking';
    secondaryCameraMoveOverride = 'dolly_in';
    actionPhases = [
      { atProgress: 0.0, state: 'walk', expression: 'neutral', lookDirection: 'forward' },
      { atProgress: 0.48, state: 'walk', expression: 'surprised', lookDirection: 'scan' },
      { atProgress: 0.78, state: 'walk', expression: 'scared', lookDirection: 'back' },
    ];
    sfx.push(
      makeSfx('wind', 0.2, 0.44, 'Chuva e vento na rua'),
      makeSfx('heartbeat', 1.5, 0.62, 'Sensação de vigilância'),
      makeSfx('riser', 2.8, 0.65, 'Silhueta ao fundo')
    );
  } else if (mentionsCreature || intent === 'climax') {
    startX = sameScenario ? Math.max(0.36, Math.min(0.64, prevEndX)) : 0.5;
    endX = Math.max(0.28, startX - 0.14);
    actorState = 'idle';
    nextState = mentionsAttack ? 'attack' : 'run';
    expr = mentionsAttack ? 'angry' : 'scared';
    lookDirection = 'back';
    revealsCreature = true;
    actionPhases = [
      { atProgress: 0.0, state: 'walk', expression: 'determined', lookDirection: 'forward' },
      { atProgress: 0.24, state: 'idle', expression: 'surprised', lookDirection: 'back' },
      { atProgress: 0.52, state: mentionsAttack ? 'attack' : 'hit', expression: mentionsAttack ? 'angry' : 'scared', lookDirection: 'back' },
      { atProgress: 0.78, state: mentionsAttack ? 'attack' : 'run', expression: 'scared', lookDirection: 'forward' },
    ];
    sfx.push(
      makeSfx('riser', 0.25, 0.72, 'Crescendo de revelação'),
      makeSfx('sting', 1.55, 0.92, 'Impacto dramático'),
      makeSfx('boom', 2.2, 0.85, 'Sub-grave')
    );
  } else if (mentionsFootstepsUp) {
    startX = sameScenario ? Math.max(0.32, Math.min(0.6, prevEndX)) : 0.42;
    endX = Math.min(0.66, startX + 0.14);
    actorState = 'walk';
    nextState = 'walk';
    expr = 'surprised';
    lookDirection = 'up';
    actionPhases = [
      { atProgress: 0.0, state: 'walk', expression: 'neutral', lookDirection: 'forward' },
      { atProgress: 0.28, state: 'idle', expression: 'surprised', lookDirection: 'up' },
      { atProgress: 0.62, state: 'idle', expression: 'scared', lookDirection: 'scan' },
      { atProgress: 0.8, state: 'walk', expression: 'determined', lookDirection: 'up' },
    ];
    sfx.push(
      makeSfx('knock', 0.8, 0.82, 'Passos acima'),
      makeSfx('knock', 1.6, 0.76, 'Segundo passo'),
      makeSfx('heartbeat', 2.2, 0.64, 'Batimento tenso')
    );
  } else if (mentionsJump) {
    startX = 0.24;
    endX = 0.72;
    actorState = 'run';
    nextState = 'jump';
    expr = 'determined';
    actionPhases = [
      { atProgress: 0.0, state: 'run', expression: 'determined', lookDirection: 'forward' },
      { atProgress: 0.36, state: 'jump', expression: 'determined', lookDirection: 'forward' },
      { atProgress: 0.72, state: 'fall', expression: 'surprised', lookDirection: 'forward' },
      { atProgress: 0.88, state: 'run', expression: 'determined', lookDirection: 'forward' },
    ];
    sfx.push(makeSfx('whoosh', 0.5, 0.75, 'Salto'), makeSfx('impact', 2.1, 0.8, 'Aterrissagem'));
  } else if (mentionsRunOrEscape) {
    startX = sameScenario ? Math.max(0.22, Math.min(0.45, prevEndX)) : 0.22;
    endX = 0.76;
    actorState = 'run';
    nextState = 'sprint';
    expr = genre === 'horror' ? 'scared' : 'determined';
    actionPhases = [
      { atProgress: 0.0, state: 'run', expression: expr, lookDirection: 'forward' },
      { atProgress: 0.45, state: 'sprint', expression: expr, lookDirection: 'forward' },
      { atProgress: 0.82, state: 'run', expression: expr, lookDirection: 'back' },
    ];
    sfx.push(makeSfx('whoosh', 0.4, 0.78, 'Corrida rápida'), makeSfx('heartbeat', 1.6, 0.65, 'Pulso acelerado'));
  } else if (mentionsTalk) {
    startX = sameScenario ? Math.max(0.35, Math.min(0.62, prevEndX)) : 0.44;
    endX = Math.min(0.66, startX + 0.08);
    actorState = 'walk';
    nextState = 'talk';
    expr = 'determined';
    actionPhases = [
      { atProgress: 0.0, state: 'walk', expression: 'neutral', lookDirection: 'forward' },
      { atProgress: 0.25, state: 'talk', expression: 'determined', lookDirection: 'scan' },
      { atProgress: 0.72, state: 'talk', expression: 'sad', lookDirection: 'forward' },
    ];
    sfx.push(makeSfx('wind', 0.3, 0.38, 'Ambiência noturna'), makeSfx('knock', 1.8, 0.4, 'Detalhe distante'));
  } else if (mentionsDoorOrUpper) {
    startX = 0.24;
    endX = 0.54;
    actorState = 'walk';
    nextState = 'idle';
    expr = genre === 'horror' ? 'scared' : 'surprised';
    lookDirection = 'scan';
    actionPhases = [
      { atProgress: 0.0, state: 'walk', expression: 'determined', lookDirection: 'forward' },
      { atProgress: 0.55, state: 'walk', expression: 'scared', lookDirection: 'scan' },
      { atProgress: 0.8, state: 'idle', expression: 'surprised', lookDirection: 'forward' },
    ];
    sfx.push(makeSfx('creak', 0.65, 0.82, 'Porta rangendo'), makeSfx('riser', 2.1, 0.58, 'Tensão crescente'));
  } else if (intent === 'encerramento') {
    startX = sameScenario ? Math.max(0.36, Math.min(0.62, prevEndX)) : 0.46;
    endX = genre === 'horror' ? Math.max(0.24, startX - 0.16) : Math.min(0.68, startX + 0.14);
    actorState = genre === 'horror' ? 'run' : 'walk';
    nextState = 'idle';
    expr = genre === 'horror' ? 'scared' : genre === 'adventure' ? 'happy' : 'determined';
    lookDirection = genre === 'horror' ? 'back' : 'forward';
    if (mentionsCutToBlack) {
      endingImpactOverride = 'cut_to_black';
    }
    actionPhases = [
      { atProgress: 0.0, state: actorState, expression: expr, lookDirection },
      { atProgress: 0.52, state: 'idle', expression: expr, lookDirection: genre === 'horror' ? 'back' : 'scan' },
    ];
    sfx.push(
      makeSfx('whoosh', 0.35, 0.68, 'Virada final'),
      makeSfx('boom', 2.4, 0.88, 'Batida de encerramento')
    );
  } else {
    // Opening / exploration beat
    startX = sameScenario ? prevEndX : 0.18;
    endX = Math.min(0.5, startX + 0.26);
    actorState = mentionsEnter ? 'walk' : 'walk';
    nextState = isStreetTheme ? 'walk' : 'idle';
    expr = genre === 'horror' ? 'neutral' : 'determined';
    lookDirection = 'scan';
    actionPhases = isStreetTheme
      ? [
          { atProgress: 0.0, state: 'walk', expression: 'neutral', lookDirection: 'forward' },
          { atProgress: 0.45, state: 'walk', expression: 'determined', lookDirection: 'scan' },
          { atProgress: 0.82, state: 'walk', expression: 'surprised', lookDirection: 'scan' },
        ]
      : [
          { atProgress: 0.0, state: 'walk', expression: 'neutral', lookDirection: 'forward' },
          { atProgress: 0.52, state: 'walk', expression: genre === 'horror' ? 'surprised' : 'determined', lookDirection: 'scan' },
          { atProgress: 0.84, state: 'idle', expression: genre === 'horror' ? 'scared' : 'determined', lookDirection: 'scan' },
        ];
    sfx.push(
      makeSfx('wind', 0.25, 0.48, isStreetTheme ? 'Chuva e vento noturno' : 'Atmosfera inicial'),
      makeSfx(isStreetTheme ? 'heartbeat' : 'creak', 1.85, isStreetTheme ? 0.45 : 0.65, isStreetTheme ? 'Passos sob a chuva' : 'Detalhe ambiental')
    );
  }

  const title = deriveBeatTitle(beatText, index);
  const scenarioLabel = scenarioId === secondaryScenario.id ? secondaryScenario.name : primaryScenario.name;
  const summary = `${beatText.charAt(0).toUpperCase() + beatText.slice(1)} (${protagonist.name} em ${scenarioLabel}).`;
  const cleanCaption = sanitizeNaturalCaption(beatText);
  const captionEmphasisWords = extractCaptionEmphasisWords(cleanCaption);

  if (mentionsCutToBlack && intent === 'encerramento') {
    endingImpactOverride = 'cut_to_black';
  }

  // Derive explicit narrative change & objective for the causal storyboard chain
  const whatChanges = mentionsHandGrab
    ? 'A barreira entre o reflexo e a realidade se rompe; o protagonista é fisicamente capturado.'
    : mentionsAutonomousSmile
    ? 'O reflexo deixa de obedecer ao protagonista, revelando autonomia hostil no vidro.'
    : mentionsReflectionFigure
    ? 'A sensação difusa de vigilância vira prova visual concreta de uma presença atrás dele.'
    : mentionsShadowPursuit
    ? 'A ameaça deixa de observar à distância e passa a perseguir ativamente o protagonista.'
    : mentionsSilhouetteBg
    ? 'O isolamento inicial é quebrado pelo surgimento de uma silhueta inexplicável ao fundo.'
    : mentionsFootstepsUp
    ? 'O silêncio do local é rompido por um estímulo sonoro que altera o estado emocional para alerta.'
    : intent === 'encerramento'
    ? 'A iluminação falha e o arco dramático atinge consequência irreversível com fechamento visual definitivo.'
    : revealsCreature
    ? 'A ameaça oculta se manifesta diretamente no espaço do protagonista e força recuo imediato.'
    : mentionsDoorOrUpper
    ? 'O personagem encontra o limiar físico que concentra a origem da anomalia.'
    : intent === 'abertura'
    ? `Estabelece ${protagonist.name} no espaço (${scenarioLabel}) e a condição inicial antes da ruptura.`
    : `${protagonist.name} muda de posição e estado emocional (${expr}) em reação direta à cena anterior.`;

  const narrativeObjective =
    intent === 'abertura'
      ? 'Situar ambiente, protagonista e atmosfera sem expor a ameaça cedo demais.'
      : intent === 'tensao'
      ? 'Introduzir o primeiro sinal concreto de anomalia que quebra a sensação de segurança.'
      : intent === 'desenvolvimento'
      ? 'Aprofundar a investigação e escalar o conflito com consequência direta da pista anterior.'
      : intent === 'climax'
      ? 'Entregar a ruptura psicológica ou física que concentra toda a tensão acumulada.'
      : 'Selar a consequência final com impacto visual claro e coerente com o arco construído.';

  let focusTargetOverride: SceneSpec['focusTarget'];
  let cameraMotivationOverride: string | undefined;
  if (mentionsHandGrab) {
    framingOverride = 'extreme_close_up';
    focusTargetOverride = 'reflection';
    cameraMotivationOverride = 'Fechar bruscamente sobre o vidro estilhaçando e a mão agarrando o personagem para máximo impacto.';
  } else if (mentionsAutonomousSmile) {
    framingOverride = 'close_up';
    focusTargetOverride = 'reflection';
    cameraMotivationOverride = 'Enquadrar de perto rosto e reflexo para expor o sorriso autônomo com clareza psicológica.';
  } else if (mentionsReflectionFigure) {
    framingOverride = 'over_shoulder';
    focusTargetOverride = 'reflection';
    cameraMotivationOverride = 'Usar plano sobre o ombro mirando a vitrine para revelar simultaneamente o protagonista e a figura no reflexo.';
  } else if (mentionsShadowPursuit) {
    framingOverride = 'low_angle';
    focusTargetOverride = 'subject_body';
    cameraMotivationOverride = 'Acompanhar a arrancada em contra-plongée para enfatizar urgência e a sombra ganhando terreno atrás.';
  } else if (mentionsSilhouetteBg) {
    framingOverride = 'medium';
    focusTargetOverride = 'subject_body';
    cameraMotivationOverride = 'Seguir o deslocamento mantendo profundidade de fundo livre para o surgimento gradual da silhueta.';
  } else if (mentionsFootstepsUp) {
    framingOverride = 'close_up';
    focusTargetOverride = 'subject_face';
    cameraMotivationOverride = 'Aproximar do rosto e olhar para cima de modo a evidenciar o instante exato da escuta dos passos.';
  } else if (intent === 'encerramento') {
    framingOverride = 'extreme_close_up';
    focusTargetOverride = 'subject_face';
    cameraMotivationOverride = 'Comprimir o enquadramento no desfecho enquanto a luz se apaga para maximizar o impacto do corte final.';
  } else if (revealsCreature) {
    framingOverride = 'low_angle';
    focusTargetOverride = 'subject_body';
    cameraMotivationOverride = 'Usar contra-plongée tenso para ampliar a presença da sombra avançando sobre o protagonista.';
  } else if (mentionsDoorOrUpper) {
    framingOverride = 'detail';
    focusTargetOverride = 'prop_clue';
    cameraMotivationOverride = 'Destacar a porta/limiar como objeto central de tensão antes da aproximação final.';
  }

  return {
    title,
    summary,
    caption: cleanCaption,
    captionEmphasisWords,
    sourceBeat: beatText,
    expectedKeywords: extractKeywords(beatText),
    whatChanges,
    narrativeObjective,
    scenarioId,
    actorState,
    nextState,
    actionPhases,
    expr,
    lookDirection,
    startX,
    endX,
    flipXOverride,
    revealsCreature,
    foreshadowInScene,
    pursueShadowInScene,
    reflectionMode,
    endingImpactOverride,
    framingOverride,
    cameraMoveOverride,
    secondaryCameraMoveOverride,
    focusTargetOverride,
    cameraMotivationOverride,
    sfx,
  };
}

export async function generateProjectPlan(options: GeneratePlanOptions): Promise<ProjectPlan> {
  // Independent visual profile routing: RETRO PIXEL EDUCATIONAL never interferes with cinematic/horror
  if (options.visualStyle === 'retro_pixel_educational') {
    return generateRetroPixelEducationalPlan({
      prompt: options.prompt,
      aspectRatio: options.aspectRatio ?? '9:16',
      durationSec: options.durationSec ?? 30,
      fps: options.fps ?? 24,
      previewResolution: options.previewResolution,
      exportResolution: options.exportResolution,
      performanceProfile: options.performanceProfile,
      narrationMode: options.narrationMode,
      availableCharacters: options.availableCharacters,
      availableScenarios: options.availableScenarios,
      educationalTopicId: options.educationalTopicId,
      educationalFacts: options.educationalFacts,
      memory: options.memory,
    });
  }

  const parsed = interpretPromptOffline(
    options.prompt,
    options.aspectRatio ?? '9:16',
    options.durationSec ?? 30
  );

  let engineUsed: ProjectPlan['engineUsed'] = 'offline_rules';
  let ollamaEnrichedBeats: Array<{ title: string; summary: string; caption: string }> | null = null;

  // Optional local Ollama enrichment (strictly when user opted in AND model is specified)
  if (options.useOllama && options.ollamaModel && options.ollamaUrl) {
    try {
      const res = await fetch('/api/ollama/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: options.ollamaUrl,
          model: options.ollamaModel,
          prompt: `Você é diretor de animação 2D. Retorne SOMENTE JSON com {"title": string, "scenes": [{"title": string, "summary": string, "caption": string}]} respeitando fielmente a ordem exata das ações do prompt: "${options.prompt}". Idioma: Português.`,
        }),
      });
      if (res.ok) {
        const payload = (await res.json()) as { response?: string };
        if (payload.response) {
          const parsedJson = JSON.parse(payload.response) as {
            title?: string;
            scenes?: Array<{ title?: string; summary?: string; caption?: string }>;
          };
          if (Array.isArray(parsedJson.scenes) && parsedJson.scenes.length >= 3) {
            engineUsed = 'ollama_local';
            if (parsedJson.title) parsed.title = parsedJson.title;
            ollamaEnrichedBeats = parsedJson.scenes.slice(0, 7).map((s, i) => ({
              title: s.title || `Cena ${i + 1}`,
              summary: s.summary || options.prompt,
              caption: s.caption || '',
            }));
          }
        }
      }
    } catch {
      engineUsed = 'offline_rules';
    }
  }

  // Pick consistent characters with locked persistent visualSheets
  const chars = (options.availableCharacters.length > 0 ? options.availableCharacters : STARTER_CHARACTERS).map(
    (c) => ({ ...c, visualSheet: c.visualSheet ?? buildCharacterVisualSheet(c) })
  );
  const scens = options.availableScenarios.length > 0 ? options.availableScenarios : STARTER_SCENARIOS;

  const protagonist =
    chars.find((c) => c.genre === parsed.genre && c.id !== 'char_shadow_entity') ?? chars[0];
  const shadowOrSecondary =
    parsed.genre === 'horror' || parsed.hasShadowEntity
      ? chars.find((c) => c.id === 'char_shadow_entity') ?? chars[1] ?? protagonist
      : chars.find((c) => c.id !== protagonist.id) ?? protagonist;

  // Semantic scenario selection matching the actual prompt environment
  const genreScenarios = scens.filter((s) => s.genre === parsed.genre);
  const darkRainStreet = scens.find((s) => s.id === 'scene_dark_rain_street' || s.theme === 'dark_rain_street');
  const hauntedHall = scens.find((s) => s.id === 'scene_haunted_hall');
  const atticDoor = scens.find((s) => s.id === 'scene_attic_door');

  let primaryScenario = genreScenarios[0] ?? scens[0];
  let secondaryScenario = genreScenarios[1] ?? scens[1] ?? primaryScenario;

  if (parsed.genre === 'horror' && parsed.hasStreetOrVitrine && darkRainStreet && !/casa abandonada/i.test(options.prompt)) {
    primaryScenario = darkRainStreet;
    secondaryScenario = parsed.hasDoor && atticDoor ? atticDoor : darkRainStreet;
  } else if (parsed.genre === 'horror' && hauntedHall && atticDoor) {
    primaryScenario = hauntedHall;
    secondaryScenario = atticDoor;
  }

  // Build ordered beat list strictly preserving user prompt chronology and explicit timestamps
  const hasExplicitSceneMarkers = /(?:^|\n)\s*(?:cena\s*\d+|\d+\s*[.):\-–]|\d+\s*[-–—]\s*\d+\s*s)/im.test(options.prompt);
  let orderedBeatObjs: ParsedScriptBeat[] = [];
  if (ollamaEnrichedBeats && ollamaEnrichedBeats.length >= 3) {
    orderedBeatObjs = ollamaEnrichedBeats.map((b) => ({ text: b.summary }));
  } else if (parsed.structuredBeats.length >= 2) {
    orderedBeatObjs = [...parsed.structuredBeats];
    const lastBeat = orderedBeatObjs[orderedBeatObjs.length - 1]?.text ?? '';
    const lastBeatAlreadyResolves = /(desfecho|final|encerra|amanhecer|sil[eê]ncio|sa[ií]da|escapa|chega\s+[àa]|conclui|fim|corta\s+para\s+preto)/i.test(lastBeat);
    // Only append a motivated closing beat if prose prompt (not explicit numbered script) ended right on an unresolved cliffhanger/climax
    if (!hasExplicitSceneMarkers && !lastBeatAlreadyResolves && orderedBeatObjs.length < 5) {
      const closingByGenre: Record<Genre, string> = {
        horror: 'A luz oscila e se apaga enquanto a presença domina o corredor no silêncio final',
        scifi: 'A comporta orbital se abre revelando o horizonte iluminado após a fuga',
        adventure: 'O templo antigo desperta sob luz dourada revelando o início da nova jornada',
        drama: 'Sob a luz do poste na garoa, a decisão final transforma o rumo da noite',
        educational: 'A explicação visual se encerra conectando o conceito principal ao cotidiano',
      };
      orderedBeatObjs.push({ text: closingByGenre[parsed.genre] });
    }
  } else {
    // Fallback structured beats grounded in the user's actual prompt text
    const core = parsed.beats[0] || options.prompt.trim() || 'A cena começa em atmosfera cinematográfica';
    orderedBeatObjs = [
      { text: core },
      { text: `O ambiente revela sinais de tensão crescente ao redor de ${protagonist.name}` },
      { text: `${protagonist.name} avança investigando o ponto central da cena` },
      {
        text: parsed.hasShadowEntity
          ? `Uma presença emerge gradualmente da penumbra atrás de ${protagonist.name}`
          : `O momento decisivo atinge o ápice dramático`,
      },
      { text: `Encerramento visual marcante com foco cinematográfico e desfecho` },
    ];
  }

  const sceneCount = Math.max(3, Math.min(8, orderedBeatObjs.length));
  orderedBeatObjs = orderedBeatObjs.slice(0, sceneCount);
  const orderedBeats = orderedBeatObjs.map((b) => b.text);

  // Allocate exact parsed timestamp durations when provided, else rhythmic scene weights
  const allBeatsTimed = orderedBeatObjs.every((b) => typeof b.durationSec === 'number' && b.durationSec > 0);
  let durations: number[];
  if (allBeatsTimed) {
    durations = orderedBeatObjs.map((b) => Number((b.durationSec ?? 4).toFixed(2)));
  } else {
    const weights = orderedBeats.map((_, i) => {
      if (i === 0) return 0.92;
      if (i === sceneCount - 2) return 1.15; // climax
      if (i === sceneCount - 1) return 1.05; // high-impact ending
      return 0.96;
    });
    const totalWeight = weights.reduce((a, b) => a + b, 0);
    durations = weights.map((w, i) => {
      if (i === sceneCount - 1) {
        const soFar = weights
          .slice(0, sceneCount - 1)
          .reduce((acc, ww) => acc + Number(((ww / totalWeight) * parsed.durationSec).toFixed(2)), 0);
        return Number(Math.max(2.5, parsed.durationSec - soFar).toFixed(2));
      }
      return Number(Math.max(2.2, (w / totalWeight) * parsed.durationSec).toFixed(2));
    });
  }

  // Assign narrative intent cleanly across the ordered beats
  const intents: SceneSpec['narrativeIntent'][] = orderedBeats.map((beat, idx) => {
    if (idx === 0) return 'abertura';
    if (idx === sceneCount - 1) return 'encerramento';
    if (
      idx === sceneCount - 2 ||
      /(persegui|sorr(i|ir|indo)\s+sozinho|m[aã]o\s+sai|confront|atac)/i.test(beat) ||
      (!parsed.hasStreetOrVitrine && /(sombra|vulto|criatura|monstro|atr[aá]s)/i.test(beat))
    ) {
      return 'climax';
    }
    if (idx === 1) return 'tensao';
    return 'desenvolvimento';
  });

  // First pass: map every beat semantically preserving spatial continuity
  const directives: SemanticBeatDirective[] = [];
  let prevEndX = 0.22;
  let prevScenarioId = primaryScenario.id;
  for (let i = 0; i < sceneCount; i++) {
    const dir = buildSemanticDirectiveForBeat(
      orderedBeats[i],
      i,
      sceneCount,
      intents[i],
      parsed.genre,
      protagonist,
      primaryScenario,
      secondaryScenario,
      prevEndX,
      prevScenarioId
    );
    directives.push(dir);
    prevEndX = dir.endX;
    prevScenarioId = dir.scenarioId;
  }

  // Locate first creature reveal scene & check whether an explicit foreshadow scene already exists
  const firstCreatureSceneIdx = directives.findIndex((d) => d.revealsCreature);
  const hasExplicitForeshadowScene = directives.some((d) => d.foreshadowInScene);

  const scenes: SceneSpec[] = [];
  let prevMove: CameraMove | undefined;
  let prevFraming: FramingType | undefined;

  for (let i = 0; i < sceneCount; i++) {
    const dir = directives[i];
    const intent = intents[i];
    const scenarioChanged = i > 0 && directives[i - 1].scenarioId !== dir.scenarioId;
    const baseCinematic = assignCinematicVariety(i, intent, scenarioChanged, prevMove, prevFraming);
    const framing = dir.framingOverride ?? baseCinematic.framing;
    const cameraMove = dir.cameraMoveOverride ?? baseCinematic.cameraMove;
    const secondaryCameraMove = dir.secondaryCameraMoveOverride ?? baseCinematic.secondaryCameraMove;
    const focusTarget = dir.focusTargetOverride ?? baseCinematic.focusTarget;
    const cameraMotivation = dir.cameraMotivationOverride ?? baseCinematic.cameraMotivation;
    const transitionIn = baseCinematic.transitionIn;
    prevMove = cameraMove;
    prevFraming = framing;

    const customBeat = ollamaEnrichedBeats?.[i];
    const captionText =
      parsed.noNarration && options.narrationMode === 'none'
        ? ''
        : sanitizeNaturalCaption(customBeat?.caption || dir.caption);
    const captionEmphasisWords = captionText ? extractCaptionEmphasisWords(captionText) : [];

    // Explicit 4-question causal chain linking previous scene -> current scene -> next scene
    const prevDir = i > 0 ? directives[i - 1] : null;
    const nextDir = i < sceneCount - 1 ? directives[i + 1] : null;
    const causalChain: SceneCausalChain = {
      whatHappenedBefore: prevDir
        ? `Na Cena ${i}, ${prevDir.sourceBeat.charAt(0).toLowerCase() + prevDir.sourceBeat.slice(1)} (${prevDir.whatChanges})`
        : `Início da narrativa: ${protagonist.name} entra em cena ainda sem conhecer a ameaça.`,
      whatHappensNow: dir.sourceBeat.charAt(0).toUpperCase() + dir.sourceBeat.slice(1),
      whatChanges: dir.whatChanges,
      howItTriggersNext: nextDir
        ? `Essa mudança obriga ${protagonist.name} a reagir diretamente na Cena ${i + 2}: "${nextDir.sourceBeat}".`
        : 'Consequência definitiva que conclui o arco narrativo com fechamento visual.',
      narrativeObjective: dir.narrativeObjective,
    };

    const mainScale =
      framing === 'extreme_close_up'
        ? 1.12
        : framing === 'close_up'
        ? 1.06
        : 1.0;

    const actors: SceneSpec['actors'] = [
      {
        id: `actor_main_${i}`,
        characterId: protagonist.id,
        x: dir.startX,
        y: 0.77,
        targetX: dir.endX,
        targetY: 0.77,
        scale: mainScale,
        opacity: 1,
        flipX: dir.flipXOverride !== undefined ? dir.flipXOverride : dir.endX < dir.startX,
        rotation: 0,
        state: dir.actorState,
        nextState: dir.nextState,
        stateTransitionRatio: 0.56,
        actionPhases: dir.actionPhases,
        lookDirection: dir.lookDirection,
        revealMode: 'visible',
        expression: dir.expr,
        easing: 'ease_in_out',
        dialogue: captionText,
      },
    ];

    // Explicit background silhouette foreshadowing beat (e.g. "uma silhueta aparece ao fundo")
    if (dir.foreshadowInScene) {
      const isStreetShadow = dir.scenarioId === darkRainStreet?.id;
      actors.push({
        id: `actor_silhouette_${i}`,
        characterId: shadowOrSecondary.id,
        x: isStreetShadow ? 0.14 : 0.84,
        y: 0.7, // deeper down the street/corridor for clear perspective depth
        targetX: isStreetShadow ? 0.24 : 0.78,
        targetY: 0.71,
        scale: 0.74,
        opacity: 0.72,
        flipX: !isStreetShadow,
        rotation: 0,
        state: 'idle',
        nextState: 'walk',
        stateTransitionRatio: 0.52,
        actionPhases: [
          { atProgress: 0.15, state: 'idle', expression: 'angry', lookDirection: 'forward' },
          { atProgress: 0.55, state: 'walk', expression: 'angry', lookDirection: 'forward' },
        ],
        revealMode: 'foreshadow',
        enterProgress: 0.16,
        exitProgress: 0.96,
        expression: 'angry',
        easing: 'ease_in_out',
        isShadowEntity: true,
      });
    } else if (
      !hasExplicitForeshadowScene &&
      firstCreatureSceneIdx > 0 &&
      i === firstCreatureSceneIdx - 1 &&
      (parsed.hasShadowEntity || parsed.genre === 'horror')
    ) {
      // Automatic Stage 1 narrative foreshadowing right before creature reveal
      actors.push({
        id: `actor_foreshadow_${i}`,
        characterId: shadowOrSecondary.id,
        x: Math.min(0.86, dir.endX + 0.28),
        y: 0.71,
        targetX: Math.min(0.9, dir.endX + 0.34),
        targetY: 0.71,
        scale: 0.84,
        opacity: 0.42,
        flipX: true,
        rotation: 0,
        state: 'idle',
        nextState: 'walk',
        stateTransitionRatio: 0.6,
        revealMode: 'foreshadow',
        enterProgress: 0.32,
        exitProgress: 0.74,
        expression: 'angry',
        easing: 'ease_in_out',
        isShadowEntity: shadowOrSecondary.id === 'char_shadow_entity',
      });
    }

    // Active pursuit shadow (chasing protagonist across the street)
    if (dir.pursueShadowInScene) {
      actors.push({
        id: `actor_pursuer_${i}`,
        characterId: shadowOrSecondary.id,
        x: Math.max(0.06, dir.startX - 0.26),
        y: 0.75,
        targetX: Math.max(0.36, dir.endX - 0.25),
        targetY: 0.76,
        scale: 1.1,
        opacity: 0.94,
        flipX: false,
        rotation: 0,
        state: 'run',
        nextState: 'sprint',
        stateTransitionRatio: 0.45,
        actionPhases: [
          { atProgress: 0.08, state: 'walk', expression: 'angry', lookDirection: 'forward' },
          { atProgress: 0.28, state: 'run', expression: 'angry', lookDirection: 'forward' },
          { atProgress: 0.62, state: 'sprint', expression: 'angry', lookDirection: 'forward' },
        ],
        revealMode: 'emerge',
        enterProgress: 0.08,
        expression: 'angry',
        easing: 'ease_out',
        isShadowEntity: true,
      });
    } else if (
      dir.revealsCreature ||
      (intent === 'encerramento' &&
        parsed.hasShadowEntity &&
        parsed.genre === 'horror' &&
        dir.reflectionMode !== 'hand_grab')
    ) {
      // Standard Stage 2 & 3 emergence for non-vitrine horror reveals (preserving spatial continuity from prior scene)
      const isReveal = i === firstCreatureSceneIdx;
      const prevSceneShadow = i > 0 ? scenes[i - 1]?.actors.find((a) => a.characterId === shadowOrSecondary.id) : undefined;
      const shadowStartX =
        prevSceneShadow && scenes[i - 1].scenarioId === dir.scenarioId
          ? prevSceneShadow.targetX
          : Math.min(0.84, dir.startX + 0.26);
      const shadowTargetX = Math.max(dir.endX + 0.12, Math.min(shadowStartX - 0.14, 0.74));
      actors.push({
        id: `actor_shadow_${i}`,
        characterId: shadowOrSecondary.id,
        x: shadowStartX,
        y: isReveal ? 0.74 : 0.76,
        targetX: shadowTargetX,
        targetY: 0.76,
        scale: isReveal ? 1.08 : 1.18,
        opacity: isReveal ? 0.92 : 0.96,
        flipX: true,
        rotation: 0,
        state: isReveal ? 'walk' : 'idle',
        nextState: 'attack',
        stateTransitionRatio: 0.62,
        actionPhases: isReveal
          ? [
              { atProgress: 0.2, state: 'idle', expression: 'angry', lookDirection: 'forward' },
              { atProgress: 0.45, state: 'walk', expression: 'angry', lookDirection: 'forward' },
              { atProgress: 0.72, state: 'attack', expression: 'angry', lookDirection: 'forward' },
            ]
          : [
              { atProgress: 0.0, state: 'walk', expression: 'angry', lookDirection: 'forward' },
              { atProgress: 0.55, state: 'idle', expression: 'angry', lookDirection: 'forward' },
            ],
        revealMode: isReveal ? 'emerge' : 'visible',
        enterProgress: isReveal ? 0.22 : 0.0,
        expression: 'angry',
        easing: 'ease_out',
        isShadowEntity: shadowOrSecondary.id === 'char_shadow_entity',
      });
    }

    const endingImpact: SceneSpec['endingImpact'] =
      dir.endingImpactOverride ??
      (intent !== 'encerramento'
        ? 'none'
        : parsed.genre === 'horror'
        ? 'light_extinguish'
        : parsed.genre === 'drama'
        ? 'silhouette_hold'
        : 'dramatic_reveal');

    const sceneFx = getEffectsForScene(parsed.genre, intent, parsed.hasRain);
    if (parsed.hasRain && dir.scenarioId === darkRainStreet?.id) {
      sceneFx.rain = dir.pursueShadowInScene ? 0.52 : dir.reflectionMode === 'hand_grab' ? 0.42 : 0.46;
      if (dir.reflectionMode === 'hand_grab') {
        sceneFx.cameraShake = 0.26;
      }
    }

    scenes.push({
      id: `scene_${i + 1}_${Math.random().toString(36).slice(2, 6)}`,
      index: i,
      title: customBeat?.title || dir.title,
      summary: customBeat?.summary || dir.summary,
      sourceBeat: dir.sourceBeat,
      expectedKeywords: dir.expectedKeywords,
      causalChain,
      narrativeIntent: intent,
      duration: durations[i],
      scenarioId: dir.scenarioId,
      framing,
      cameraMove,
      secondaryCameraMove: durations[i] >= 2.8 ? secondaryCameraMove : undefined,
      cameraIntensity: intent === 'climax' ? 0.78 : intent === 'encerramento' ? 0.72 : 0.58,
      cameraMotivation,
      focusTarget,
      transitionIn,
      endingImpact,
      reflectionMode: dir.reflectionMode ?? 'none',
      lighting: getLightingForScene(parsed.genre, intent),
      effects: sceneFx,
      actors,
      sfxEvents: dir.sfx.map((s) => ({
        ...s,
        offsetSec: Math.min(s.offsetSec, Math.max(0.2, durations[i] - 0.35)),
      })),
      captionText,
      captionEmphasisWords,
      visualPrompt: `${dir.title} — ${dir.sourceBeat} (${framing}, ${cameraMove})`,
      colorPalette: getGenreVisualIdentity(parsed.genre).palette,
    });
  }

  const usedCharIds = new Set(scenes.flatMap((s) => s.actors.map((a) => a.characterId)));
  const characterBible = chars
    .filter((c) => usedCharIds.has(c.id))
    .map((c) => ({ ...c, visualSheet: c.visualSheet ?? buildCharacterVisualSheet(c) }));
  const usedScenIds = new Set(scenes.map((s) => s.scenarioId));
  const usedScenarios = scens.filter((s) => usedScenIds.has(s.id));

  // Persistent character continuity ledger across all scenes
  const continuityLedger: CharacterPersistentState[] = characterBible.map((ch) => {
    const history: string[] = [];
    let lastEmotionalState: ExpressionType = ch.defaultExpression;
    let lastPosX = 0.25;
    let lastScen = primaryScenario.id;
    for (const sc of scenes) {
      const appearance = sc.actors.find((a) => a.characterId === ch.id);
      if (appearance) {
        lastEmotionalState = appearance.expression;
        lastPosX = appearance.targetX;
        lastScen = sc.scenarioId;
        history.push(
          `Cena ${sc.index + 1} (${sc.title}): ${appearance.state}${appearance.nextState && appearance.nextState !== appearance.state ? ` -> ${appearance.nextState}` : ''} [X:${appearance.x.toFixed(2)}->${appearance.targetX.toFixed(2)}, expr:${appearance.expression}]`
        );
      }
    }
    return {
      characterId: ch.id,
      characterName: ch.name,
      emotionalState: lastEmotionalState,
      lastPositionX: lastPosX,
      lastScenarioId: lastScen,
      carriedProp: ch.accessory.type,
      actionHistory: history,
    };
  });

  const musicMap: Record<Genre, AudioConfig['musicStyle']> = {
    horror: 'horror_drone',
    scifi: 'scifi_synth',
    adventure: 'adventure_orchestral',
    drama: 'drama_piano',
    educational: 'retro_chiptune',
  };

  const now = new Date().toISOString();

  const builtPlan: ProjectPlan = {
    schemaVersion: '1.0.0',
    id: `proj_${Date.now().toString(36)}`,
    title: parsed.title,
    prompt: options.prompt,
    genre: parsed.genre,
    visualStyle: 'cinematic_2d',
    themeSummary: parsed.themeSummary,
    totalDuration: Number(scenes.reduce((acc, s) => acc + s.duration, 0).toFixed(2)),
    engineUsed,
    performanceProfile: options.performanceProfile,
    format: {
      aspectRatio: parsed.aspectRatio,
      previewResolution: options.previewResolution ?? '540p',
      exportResolution: options.exportResolution ?? '1080p',
      fps: options.fps ?? 24,
      renderer: 'ffmpeg_mp4',
    },
    visualIdentity: getGenreVisualIdentity(parsed.genre),
    characterBible,
    scenarios: usedScenarios.length > 0 ? usedScenarios : [primaryScenario],
    script: scenes.map((sc) => ({
      sceneIndex: sc.index,
      heading: `CENA ${sc.index + 1} — ${sc.title.toUpperCase()}`,
      action: sc.summary,
      dialogue: sc.captionText || '(Sem narração — narrativa visual e sonora)',
      soundCue: sc.sfxEvents.map((e) => `${e.label} (${e.sfx})`).join(', ') || 'Ambiência',
    })),
    scenes,
    continuityLedger,
    audio: {
      musicStyle: musicMap[parsed.genre],
      musicVolume: 0.48,
      sfxVolume: 0.85,
      voiceVolume: parsed.noNarration ? 0 : 0.8,
      fadeInSec: 1.2,
      fadeOutSec: 1.8,
      duckingAmount: 0.42,
      normalize: true,
      narrationMode: parsed.noNarration ? 'none' : options.narrationMode,
    },
    captions: {
      enabled: !parsed.noNarration && options.narrationMode !== 'none',
      preset: parsed.genre === 'horror' ? 'noir_minimal' : 'bold_karaoke',
      fontSize: 34,
      positionY: 0.84,
      safeAreaMargin: 0.08,
      highlightColor: '#E5A032',
      textColor: '#F8FAFC',
      outlineWidth: 4,
      shadowBlur: 10,
      enterAnimation: 'pop',
      exitAnimation: 'fade',
    },
    createdAt: now,
    updatedAt: now,
  };

  if (options.memory) {
    const improved = applyLearnedRulesAndAutoRepair(builtPlan, options.memory, chars, scens);
    return improved.project;
  }

  return builtPlan;
}
