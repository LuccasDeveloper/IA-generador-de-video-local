import type {
  AnimationState,
  CameraMove,
  CharacterDefinition,
  CharacterPersistentState,
  FramingType,
  Genre,
  LearnedRule,
  ProjectPlan,
  QAReport,
  ScenarioDefinition,
  SceneSpec,
  StudioMemoryState,
  ValidationIssue,
  VideoMemoryEntry,
} from '../types/studio';
import { buildCharacterVisualSheet, STARTER_CHARACTERS } from '../data/presets';
import {
  matchVerifiedTopicForPrompt,
  resolvePixelGridForAspectRatio,
  VERIFIED_EDUCATIONAL_TOPICS,
} from '../data/retroEducationalKnowledge';
import { validateProjectPlan } from './qaAndValidation';

const MEMORY_STORAGE_KEY = 'ai2d_studio_learning_memory_v1';
const MEMORY_SCHEMA_VERSION = '1.0.0' as const;

export interface ErrorRuleTemplate {
  errorCode: string;
  title: string;
  description: string;
  strategy: string;
}

export const ERROR_LEARNING_CATALOG: Record<string, ErrorRuleTemplate> = {
  GENRE_DRIFT: {
    errorCode: 'GENRE_DRIFT',
    title: 'Evitar desvio de gênero do prompt',
    description: 'Impede que prompts de terror psicológico ou suspense caiam em drama/noir genérico.',
    strategy: 'Força verificação de gênero contra o prompt original e corrige identidade visual/elenco.',
  },
  UNAUTHORIZED_NARRATIVE_INJECTION: {
    errorCode: 'UNAUTHORIZED_NARRATIVE_INJECTION',
    title: 'Bloquear injeção de elementos fora do prompt',
    description: 'Impede a inserção automática de personagens/tramas não solicitados (ex.: jornalista noir).',
    strategy: 'Substitui personagens ou textos não autorizados pelo elenco coerente com o prompt.',
  },
  DUPLICATE_ACTOR_ID: {
    errorCode: 'DUPLICATE_ACTOR_ID',
    title: 'Eliminar personagens duplicados na mesma cena',
    description: 'Garante instância única por personagem em cada cena renderizada.',
    strategy: 'Remove automaticamente entradas duplicadas mantendo a instância principal com trajetória válida.',
  },
  APPEARANCE_DRIFT: {
    errorCode: 'APPEARANCE_DRIFT',
    title: 'Travar ficha visual do personagem',
    description: 'Mantém roupas, cores e proporções idênticas do personagem em todas as cenas.',
    strategy: 'Restaura paleta e estilo travados na visualSheet persistente antes da renderização.',
  },
  MISSING_VISUAL_SHEET: {
    errorCode: 'MISSING_VISUAL_SHEET',
    title: 'Garantir ficha visual persistente',
    description: 'Todo personagem precisa de visualSheet travada com assinatura de consistência.',
    strategy: 'Reconstrói automaticamente a CharacterVisualSheet de todos os personagens da bíblia.',
  },
  SPATIAL_TELEPORT: {
    errorCode: 'SPATIAL_TELEPORT',
    title: 'Impedir teletransporte espacial entre cenas',
    description: 'Mantém continuidade de posição X quando o personagem continua no mesmo cenário.',
    strategy: 'Alinha automaticamente actor.x com targetX da cena anterior no mesmo cenário.',
  },
  ABRUPT_SCENARIO_CUT: {
    errorCode: 'ABRUPT_SCENARIO_CUT',
    title: 'Suavizar transições entre cenários diferentes',
    description: 'Evita cortes secos abruptos quando há troca de cenário.',
    strategy: 'Promove transitionIn de "cut" para "crossfade" sempre que scenarioId mudar.',
  },
  LIGHTING_DISCONTINUITY: {
    errorCode: 'LIGHTING_DISCONTINUITY',
    title: 'Manter continuidade luminosa no mesmo cenário',
    description: 'Evita saltos bruscos de exposição/luz ambiente entre cenas consecutivas no mesmo local.',
    strategy: 'Interpola ambientIntensity dentro de uma janela máxima de 0.30 entre cenas adjacentes.',
  },
  PROLONGED_STATIC_CAMERA: {
    errorCode: 'PROLONGED_STATIC_CAMERA',
    title: 'Eliminar câmeras estáticas prolongadas',
    description: 'Garante movimento cinematográfico motivado e evolução secundária em cenas longas.',
    strategy: 'Substitui câmera "static" por movimento dinâmico variado + secondaryCameraMove.',
  },
  UNMOTIVATED_CAMERA: {
    errorCode: 'UNMOTIVATED_CAMERA',
    title: 'Documentar motivação narrativa de câmera',
    description: 'Toda movimentação de câmera precisa servir a um propósito dramático claro.',
    strategy: 'Preenche cameraMotivation e focusTarget alinhados à intenção narrativa da cena.',
  },
  REPETITIVE_CAMERA: {
    errorCode: 'REPETITIVE_CAMERA',
    title: 'Evitar repetição consecutiva de enquadramento/câmera',
    description: 'Diversifica planos e movimentos entre cenas adjacentes.',
    strategy: 'Alterna framing e cameraMove quando idênticos à cena imediatamente anterior.',
  },
  FLAT_FRAMING_VARIETY: {
    errorCode: 'FLAT_FRAMING_VARIETY',
    title: 'Garantir variedade de escala de planos',
    description: 'Impede que o vídeo inteiro use o mesmo tipo de plano (ex.: só plano médio).',
    strategy: 'Distribui planos (wide, medium, over_shoulder, close_up, low_angle, detail) conforme o arco.',
  },
  EXCESSIVE_GLITCH: {
    errorCode: 'EXCESSIVE_GLITCH',
    title: 'Zerar artefatos de glitch e faixas horizontais',
    description: 'Remove glitches artificiais e transições glitch_cut que parecem falha de render.',
    strategy: 'Zera effects.glitch, chromaticAberration e substitui glitch_cut por crossfade.',
  },
  EXCESSIVE_SCANLINES: {
    errorCode: 'EXCESSIVE_SCANLINES',
    title: 'Remover scanlines artificiais excessivas',
    description: 'Evita linhas horizontais que poluem a nitidez da animação 2D.',
    strategy: 'Zera effects.scanlines automaticamente.',
  },
  EXCESSIVE_VOLUMETRIC_FX: {
    errorCode: 'EXCESSIVE_VOLUMETRIC_FX',
    title: 'Controlar névoa, fumaça e luz volumétrica',
    description: 'Evita que névoa/bloom excessivos apaguem detalhes dos personagens e cenários.',
    strategy: 'Limita fog <= 0.22, smoke <= 0.12, bloomIntensity <= 0.20 e volumetricIntensity <= 0.20.',
  },
  EXCESSIVE_FLICKER: {
    errorCode: 'EXCESSIVE_FLICKER',
    title: 'Evitar flickering de iluminação',
    description: 'Impede oscilações luminosas agressivas entre quadros consecutivos.',
    strategy: 'Limita lighting.pointLightFlicker <= 0.16.',
  },
  FROZEN_CHARACTER: {
    errorCode: 'FROZEN_CHARACTER',
    title: 'Eliminar personagens congelados',
    description: 'Garante ciclos de animação ativos e mudanças de expressão/olhar em cenas longas.',
    strategy: 'Sintetiza múltiplas actionPhases e deslocamento suave em cenas com ator estático.',
  },
  REPETITIVE_MOTION: {
    errorCode: 'REPETITIVE_MOTION',
    title: 'Variar ciclos de atuação entre cenas consecutivas',
    description: 'Evita que 3+ cenas seguidas repitam exatamente a mesma animação mecânica.',
    strategy: 'Introduz fases intermediárias de ação (idle -> walk -> scan/run) e variação de olhar.',
  },
  CAPTION_STAGE_DIRECTION_LEAK: {
    errorCode: 'CAPTION_STAGE_DIRECTION_LEAK',
    title: 'Limpar instruções técnicas vazadas em legendas',
    description: 'Remove comandos como "câmera acompanha" ou "corta para preto" do texto exibido na tela.',
    strategy: 'Higieniza captionText preservando apenas narrativa natural em PT-BR.',
  },
  CAPTION_TOO_LONG: {
    errorCode: 'CAPTION_TOO_LONG',
    title: 'Compactar legendas longas para área segura',
    description: 'Mantém legendas curtas e legíveis em telas verticais 9:16.',
    strategy: 'Resume captionText dentro do limite seguro de caracteres por formato.',
  },
  CAPTION_VISUAL_MISMATCH: {
    errorCode: 'CAPTION_VISUAL_MISMATCH',
    title: 'Sincronizar legenda com a ação visual da cena',
    description: 'Garante que o texto da legenda descreva exatamente o que acontece na cena.',
    strategy: 'Realinha captionText com sourceBeat/summary higienizado da cena.',
  },
  PROP_COLLISION_PASSTHROUGH: {
    errorCode: 'PROP_COLLISION_PASSTHROUGH',
    title: 'Evitar personagem atravessando objetos sólidos',
    description: 'Impede que a trajetória do ator cruze pilares ou caixas no plano médio.',
    strategy: 'Ajusta trajetória (x/targetX) ou profundidade vertical (y) para contornar obstáculos.',
  },
  OFFSCREEN_ACTOR: {
    errorCode: 'OFFSCREEN_ACTOR',
    title: 'Manter personagens dentro da área visível',
    description: 'Garante enquadramento seguro sem atores cortados fora da tela.',
    strategy: 'Limita x e targetX dentro de [0.14, 0.86].',
  },
  PROPORTION_OUT_OF_RANGE: {
    errorCode: 'PROPORTION_OUT_OF_RANGE',
    title: 'Preservar proporções coerentes dos personagens',
    description: 'Impede personagens gigantes ou minúsculos em relação ao cenário.',
    strategy: 'Restringe actor.scale dentro da faixa anatômica [0.78, 1.38].',
  },
  MISSING_CAUSAL_CHAIN: {
    errorCode: 'MISSING_CAUSAL_CHAIN',
    title: 'Exigir cadeia causal completa entre cenas',
    description: 'Toda cena deve responder o que aconteceu antes, agora, o que muda e o que provoca a próxima.',
    strategy: 'Reconstrói causalChain completa a partir das cenas adjacentes.',
  },
  INCOMPLETE_CAUSAL_CHAIN: {
    errorCode: 'INCOMPLETE_CAUSAL_CHAIN',
    title: 'Completar lacunas de causa e consequência',
    description: 'Preenche campos faltantes na cadeia causal do storyboard.',
    strategy: 'Completa campos vazios de causalChain sem alterar o roteiro aprovado.',
  },
  POST_RENDER_BLACK_FRAMES: {
    errorCode: 'POST_RENDER_BLACK_FRAMES',
    title: 'Prevenir quadros pretos detectados no FFmpeg',
    description: 'Aprendido a partir de auditoria pós-render (blackdetect) ou feedback do usuário.',
    strategy: 'Eleva piso de iluminação ambiente (ambientIntensity >= 0.38) e valida contraste.',
  },
  POST_RENDER_FREEZE_FRAMES: {
    errorCode: 'POST_RENDER_FREEZE_FRAMES',
    title: 'Prevenir congelamentos detectados no FFmpeg',
    description: 'Aprendido a partir de auditoria pós-render (freezedetect) ou feedback do usuário.',
    strategy: 'Garante cameraIntensity >= 0.62, secondaryCameraMove ativa e fases dinâmicas de animação.',
  },
  PIXEL_GRID_INVALID: {
    errorCode: 'PIXEL_GRID_INVALID',
    title: 'Garantir grade 16-bit nítida (nearest-neighbor)',
    description: 'Impede borrão por interpolação linear ou grade pixel art desconfigurada no modo RETRO PIXEL EDUCATIONAL.',
    strategy: 'Restaura pixelConfig nativa (180×320 / 320×180 / 240×240) com scaling="nearest" e dither Bayer 4×4.',
  },
  PIXEL_CAPTION_OVERFLOW: {
    errorCode: 'PIXEL_CAPTION_OVERFLOW',
    title: 'Manter legendas pixel legíveis na grade retrô',
    description: 'Evita textos longos demais que estouram a margem segura na fonte pixel 5×7.',
    strategy: 'Compacta automaticamente captionText para até 72 caracteres preservando clareza educativa.',
  },
  EDUCATIONAL_INFOGRAPHIC_MISSING: {
    errorCode: 'EDUCATIONAL_INFOGRAPHIC_MISSING',
    title: 'Incluir infográficos animados em vídeos educativos',
    description: 'Garante diagramas visuais, setas ou contadores animados explicando o conceito científico.',
    strategy: 'Anexa automaticamente infográfico coerente com o tema na cena explicativa principal.',
  },
  EDUCATIONAL_UNVERIFIED_CLAIM: {
    errorCode: 'EDUCATIONAL_UNVERIFIED_CLAIM',
    title: 'Exigir fatos verificados em vídeos educativos',
    description: 'Impede vídeos educativos sem fonte verificada na base offline ou fornecida pelo usuário.',
    strategy: 'Vincula o projeto a um tópico verificado offline (com citação) correspondente ao prompt.',
  },
};

export function createEmptyMemoryState(): StudioMemoryState {
  return {
    schemaVersion: MEMORY_SCHEMA_VERSION,
    videos: [],
    rules: [],
    totalAutoFixes: 0,
    updatedAt: new Date().toISOString(),
  };
}

export function normalizeMemoryState(raw: unknown): StudioMemoryState {
  if (!raw || typeof raw !== 'object') return createEmptyMemoryState();
  const obj = raw as Partial<StudioMemoryState>;
  const videos = Array.isArray(obj.videos)
    ? obj.videos.filter((v): v is VideoMemoryEntry => Boolean(v && typeof v === 'object' && typeof v.projectId === 'string'))
    : [];
  const rules = Array.isArray(obj.rules)
    ? obj.rules.filter((r): r is LearnedRule => Boolean(r && typeof r === 'object' && typeof r.errorCode === 'string'))
    : [];
  return {
    schemaVersion: MEMORY_SCHEMA_VERSION,
    videos: videos.slice(0, 60),
    rules: rules.slice(0, 80),
    totalAutoFixes: typeof obj.totalAutoFixes === 'number' && Number.isFinite(obj.totalAutoFixes) ? obj.totalAutoFixes : 0,
    updatedAt: typeof obj.updatedAt === 'string' ? obj.updatedAt : new Date().toISOString(),
  };
}

export function loadLocalMemory(): StudioMemoryState {
  if (typeof localStorage === 'undefined') return createEmptyMemoryState();
  try {
    const raw = localStorage.getItem(MEMORY_STORAGE_KEY);
    if (!raw) return createEmptyMemoryState();
    return normalizeMemoryState(JSON.parse(raw));
  } catch {
    return createEmptyMemoryState();
  }
}

export function saveLocalMemory(memory: StudioMemoryState): boolean {
  if (typeof localStorage === 'undefined') return false;
  try {
    localStorage.setItem(MEMORY_STORAGE_KEY, JSON.stringify(memory));
    return true;
  } catch {
    return false;
  }
}

export function mergeMemoryStates(local: StudioMemoryState, remote: StudioMemoryState): StudioMemoryState {
  const videoMap = new Map<string, VideoMemoryEntry>();
  for (const v of [...remote.videos, ...local.videos]) {
    const existing = videoMap.get(v.projectId);
    if (!existing || v.updatedAt >= existing.updatedAt) {
      // Preserve feedback from both sides
      const mergedFeedback = existing
        ? [
            ...v.userFeedback,
            ...existing.userFeedback.filter((ef) => !v.userFeedback.some((vf) => vf.id === ef.id)),
          ]
        : v.userFeedback;
      videoMap.set(v.projectId, { ...v, userFeedback: mergedFeedback });
    }
  }

  const ruleMap = new Map<string, LearnedRule>();
  for (const r of [...remote.rules, ...local.rules]) {
    const existing = ruleMap.get(r.errorCode);
    if (!existing) {
      ruleMap.set(r.errorCode, { ...r });
    } else {
      ruleMap.set(r.errorCode, {
        ...existing,
        ...r,
        occurrences: Math.max(existing.occurrences, r.occurrences),
        autoFixedCount: Math.max(existing.autoFixedCount, r.autoFixedCount),
        active: r.lastSeenAt >= existing.lastSeenAt ? r.active : existing.active,
        firstSeenAt: existing.firstSeenAt < r.firstSeenAt ? existing.firstSeenAt : r.firstSeenAt,
        lastSeenAt: existing.lastSeenAt > r.lastSeenAt ? existing.lastSeenAt : r.lastSeenAt,
      });
    }
  }

  const videos = Array.from(videoMap.values())
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 60);
  const rules = Array.from(ruleMap.values()).sort((a, b) => b.occurrences - a.occurrences);

  return {
    schemaVersion: MEMORY_SCHEMA_VERSION,
    videos,
    rules,
    totalAutoFixes: Math.max(local.totalAutoFixes, remote.totalAutoFixes),
    updatedAt: new Date().toISOString(),
  };
}

export async function fetchServerMemory(): Promise<StudioMemoryState | null> {
  if (typeof fetch === 'undefined') return null;
  try {
    const res = await fetch('/api/memory');
    if (!res.ok) return null;
    const data = await res.json();
    return normalizeMemoryState(data);
  } catch {
    return null;
  }
}

export async function syncMemoryToServer(memory: StudioMemoryState): Promise<boolean> {
  if (typeof fetch === 'undefined') return false;
  try {
    const res = await fetch('/api/memory', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(memory),
    });
    return res.ok;
  } catch {
    return false;
  }
}

function getRuleTemplate(errorCode: string, customNote?: string): ErrorRuleTemplate {
  const known = ERROR_LEARNING_CATALOG[errorCode];
  if (known) return known;
  return {
    errorCode,
    title: `Prevenir erro ${errorCode}`,
    description: customNote?.trim() || `Regra aprendida a partir de ocorrência registrada (${errorCode}).`,
    strategy: 'Monitoramento contínuo na validação pré-render e auto-reparo determinístico.',
  };
}

export function upsertLearnedRule(
  rules: LearnedRule[],
  errorCode: string,
  source: LearnedRule['source'],
  extraNote?: string,
  incrementAutoFix = false
): LearnedRule[] {
  const now = new Date().toISOString();
  const tpl = getRuleTemplate(errorCode, extraNote);
  const existingIdx = rules.findIndex((r) => r.errorCode === errorCode);

  if (existingIdx >= 0) {
    return rules.map((r, idx) =>
      idx === existingIdx
        ? {
            ...r,
            occurrences: r.occurrences + 1,
            autoFixedCount: r.autoFixedCount + (incrementAutoFix ? 1 : 0),
            description: extraNote && source === 'user_feedback' ? `${tpl.description} (Obs: ${extraNote.trim()})` : r.description,
            active: true,
            lastSeenAt: now,
          }
        : r
    );
  }

  const created: LearnedRule = {
    id: `rule_${errorCode.toLowerCase()}`,
    errorCode,
    title: tpl.title,
    description: extraNote && source === 'user_feedback' ? `${tpl.description} (Obs: ${extraNote.trim()})` : tpl.description,
    strategy: tpl.strategy,
    occurrences: 1,
    autoFixedCount: incrementAutoFix ? 1 : 0,
    source,
    active: true,
    firstSeenAt: now,
    lastSeenAt: now,
  };
  return [created, ...rules];
}

export function recordVideoOutcome(
  memory: StudioMemoryState,
  project: ProjectPlan,
  qaReport?: QAReport | null,
  options?: {
    fixesApplied?: string[];
    postRenderPassed?: boolean;
    postRenderBlackEvents?: number;
    postRenderFreezeEvents?: number;
    postRenderSummary?: string;
  }
): StudioMemoryState {
  const now = new Date().toISOString();
  let nextRules = [...memory.rules];

  const detectedIssues = (qaReport?.issues ?? []).filter((i) => i.severity !== 'info');
  for (const issue of detectedIssues) {
    nextRules = upsertLearnedRule(nextRules, issue.code, 'qa_auto');
  }

  if (options?.postRenderBlackEvents && options.postRenderBlackEvents > 0) {
    nextRules = upsertLearnedRule(nextRules, 'POST_RENDER_BLACK_FRAMES', 'post_render');
  }
  if (options?.postRenderFreezeEvents && options.postRenderFreezeEvents > 0) {
    nextRules = upsertLearnedRule(nextRules, 'POST_RENDER_FREEZE_FRAMES', 'post_render');
  }

  const existing = memory.videos.find((v) => v.projectId === project.id);
  const combinedFixes = Array.from(
    new Set([
      ...(existing?.fixesApplied ?? []),
      ...(project.memoryContext?.autoFixesApplied ?? []),
      ...(options?.fixesApplied ?? []),
    ])
  );

  const entry: VideoMemoryEntry = {
    id: existing?.id ?? `vmem_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`,
    projectId: project.id,
    title: project.title,
    prompt: project.prompt,
    genre: project.genre,
    durationSec: project.totalDuration,
    aspectRatio: project.format.aspectRatio,
    sceneCount: project.scenes.length,
    framingSequence: project.scenes.map((s) => s.framing),
    cameraMoves: project.scenes.map((s) => s.cameraMove),
    scenarioIds: Array.from(new Set(project.scenes.map((s) => s.scenarioId))),
    characterIds: project.characterBible.map((c) => c.id),
    scriptFidelityScore: qaReport?.metrics.scriptFidelityScore ?? existing?.scriptFidelityScore ?? 100,
    qaPassed: qaReport ? qaReport.passed : existing?.qaPassed ?? true,
    postRenderPassed: options?.postRenderPassed ?? existing?.postRenderPassed,
    postRenderSummary: options?.postRenderSummary ?? existing?.postRenderSummary,
    issuesDetected: detectedIssues.map((i) => ({
      code: i.code,
      severity: i.severity,
      message: i.message,
      sceneIndex: i.sceneIndex,
    })),
    fixesApplied: combinedFixes,
    userFeedback: existing?.userFeedback ?? [],
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };

  const otherVideos = memory.videos.filter((v) => v.projectId !== project.id);
  return {
    schemaVersion: MEMORY_SCHEMA_VERSION,
    videos: [entry, ...otherVideos].slice(0, 60),
    rules: nextRules.sort((a, b) => b.occurrences - a.occurrences),
    totalAutoFixes: memory.totalAutoFixes + (options?.fixesApplied?.length ?? 0),
    updatedAt: now,
  };
}

export function recordUserErrorFeedback(
  memory: StudioMemoryState,
  projectId: string,
  errorCode: string,
  note: string
): StudioMemoryState {
  const now = new Date().toISOString();
  const cleanNote = note.trim() || getRuleTemplate(errorCode).description;
  const feedbackItem = {
    id: `fb_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`,
    errorCode,
    note: cleanNote,
    createdAt: now,
  };

  const nextVideos = memory.videos.map((v) =>
    v.projectId === projectId
      ? {
          ...v,
          qaPassed: false,
          userFeedback: [feedbackItem, ...v.userFeedback],
          updatedAt: now,
        }
      : v
  );

  const nextRules = upsertLearnedRule(memory.rules, errorCode, 'user_feedback', cleanNote);

  return {
    schemaVersion: MEMORY_SCHEMA_VERSION,
    videos: nextVideos,
    rules: nextRules.sort((a, b) => b.occurrences - a.occurrences),
    totalAutoFixes: memory.totalAutoFixes,
    updatedAt: now,
  };
}

export function toggleLearnedRule(memory: StudioMemoryState, ruleId: string): StudioMemoryState {
  return {
    ...memory,
    rules: memory.rules.map((r) => (r.id === ruleId ? { ...r, active: !r.active } : r)),
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Recalls relevant remembered past videos from memory (prioritizing same genre and shared prompt terms).
 */
export function recallSimilarPastVideos(
  memory: StudioMemoryState,
  genre: Genre,
  prompt: string,
  limit = 5
): VideoMemoryEntry[] {
  const promptTokens = new Set(
    prompt
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length >= 4)
  );

  return [...memory.videos]
    .map((v) => {
      let score = v.genre === genre ? 3 : 0;
      const vTokens = v.prompt
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .split(/[^a-z0-9]+/);
      for (const tok of vTokens) {
        if (tok.length >= 4 && promptTokens.has(tok)) score += 1;
      }
      return { video: v, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || b.video.updatedAt.localeCompare(a.video.updatedAt))
    .slice(0, limit)
    .map((item) => item.video);
}

function sanitizeCaptionForRepair(raw: string, maxChars: number): string {
  let clean = raw
    .replace(/\b(a\s+)?c[aâ]mera\s+(acompanha|segue|aproxima|afasta|gira|mostra|enquadra|recua|fecha|abre)[^;,.]*[;,.]?\s*/gi, '')
    .replace(/\b(plano\s+(geral|m[eé]dio|detalhe|fechado)|close-?up|dolly_in|dolly_out|tracking|fade_black|crossfade|corte\s+seco)\b[^;,.]*[;,.]?\s*/gi, '')
    .replace(/\be\s+a\s+tela\s+corta\s+para\s+preto\b/gi, '')
    .replace(/\ba\s+tela\s+corta\s+para\s+preto\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[,;:\-–\s]+|[,;:\-–\s]+$/g, '')
    .trim();

  if (!clean) return '';
  if (clean.length > maxChars * 2) {
    clean = clean.slice(0, maxChars * 2 - 3).replace(/\s+\S*$/, '').trim() + '…';
  }
  clean = clean.charAt(0).toUpperCase() + clean.slice(1);
  if (!/[.!?…]$/.test(clean)) clean += '.';
  return clean;
}

function rebuildContinuityLedger(project: ProjectPlan): CharacterPersistentState[] {
  return project.characterBible.map((ch) => {
    const history: string[] = [];
    let lastEmotionalState = ch.defaultExpression;
    let lastPosX = 0.25;
    let lastScen = project.scenes[0]?.scenarioId ?? '';
    for (const sc of project.scenes) {
      const appearance = sc.actors.find((a) => a.characterId === ch.id);
      if (appearance) {
        lastEmotionalState = appearance.expression;
        lastPosX = appearance.targetX;
        lastScen = sc.scenarioId;
        history.push(
          `Cena ${sc.index + 1} (${sc.title}): ${appearance.state}${
            appearance.nextState && appearance.nextState !== appearance.state ? ` -> ${appearance.nextState}` : ''
          } [X:${appearance.x.toFixed(2)}->${appearance.targetX.toFixed(2)}, expr:${appearance.expression}]`
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
}

export interface AutoRepairResult {
  project: ProjectPlan;
  appliedRuleIds: string[];
  autoFixesApplied: string[];
  avoidedPatterns: string[];
  recalledVideoTitles: string[];
  remainingIssues: ValidationIssue[];
  updatedMemory: StudioMemoryState;
}

const FRAMING_ROTATION: FramingType[] = ['wide', 'medium', 'over_shoulder', 'close_up', 'low_angle', 'detail', 'extreme_close_up'];
const CAMERA_MOVE_ROTATION: CameraMove[] = ['dolly_in', 'tracking', 'pan', 'tilt', 'handheld', 'dutch_angle', 'dolly_out', 'zoom'];

/**
 * Real Deterministic Self-Improvement & Auto-Repair Engine:
 * 1. Recalls past videos of the same genre to prevent repetitive framing patterns across runs.
 * 2. Applies all active LearnedRules from persistent memory proactively.
 * 3. Runs a multi-pass QA validation & deterministic repair loop (up to maxPasses),
 *    fixing real structural, spatial, visual, caption, and camera errors and learning from every finding.
 */
export function applyLearnedRulesAndAutoRepair(
  inputProject: ProjectPlan,
  memory: StudioMemoryState,
  allCharacters: CharacterDefinition[],
  allScenarios: ScenarioDefinition[],
  maxPasses = 3
): AutoRepairResult {
  const project: ProjectPlan = structuredClone(inputProject);
  const appliedRuleIds = new Set<string>();
  const autoFixesApplied: string[] = [];
  const avoidedPatterns: string[] = [];
  let nextMemory: StudioMemoryState = {
    ...memory,
    rules: memory.rules.map((r) => ({ ...r })),
    videos: [...memory.videos],
  };

  const activeRuleCodes = new Set(nextMemory.rules.filter((r) => r.active).map((r) => r.errorCode));
  const markRuleApplied = (errorCode: string, fixDescription: string) => {
    const rule = nextMemory.rules.find((r) => r.errorCode === errorCode);
    if (rule) {
      appliedRuleIds.add(rule.id);
      rule.autoFixedCount += 1;
      rule.lastSeenAt = new Date().toISOString();
    } else {
      nextMemory.rules = upsertLearnedRule(nextMemory.rules, errorCode, 'qa_auto', undefined, true);
      appliedRuleIds.add(`rule_${errorCode.toLowerCase()}`);
    }
    if (!autoFixesApplied.includes(fixDescription)) {
      autoFixesApplied.push(fixDescription);
    }
  };

  // 1. Recall past videos to avoid repeating identical framing choreography across productions
  const recalled = recallSimilarPastVideos(nextMemory, project.genre, project.prompt, 4);
  const recalledVideoTitles = recalled.map((v) => v.title);

  if (recalled.length > 0 && project.scenes.length >= 3) {
    const latestSameGenre = recalled.find((v) => v.genre === project.genre && v.projectId !== project.id);
    if (latestSameGenre) {
      const currentSig = project.scenes.map((s) => s.framing).join('>');
      const pastSig = latestSameGenre.framingSequence.join('>');
      if (currentSig === pastSig) {
        // Vary middle scene framing without breaking opening or climax impact
        const midIdx = Math.floor(project.scenes.length / 2);
        const mid = project.scenes[midIdx];
        const prev = project.scenes[midIdx - 1];
        const next = project.scenes[midIdx + 1];
        const altFraming = FRAMING_ROTATION.find(
          (f) => f !== mid.framing && f !== prev?.framing && f !== next?.framing
        );
        if (altFraming) {
          mid.framing = altFraming;
          avoidedPatterns.push(
            `Sequência de enquadramentos variada na Cena ${midIdx + 1} (${altFraming}) para não repetir "${latestSameGenre.title}".`
          );
        }
      }
    }
  }

  // 2. Proactive application of learned rules from past failures (post-render / user feedback)
  if (activeRuleCodes.has('POST_RENDER_BLACK_FRAMES')) {
    let adjusted = false;
    for (const sc of project.scenes) {
      if (sc.lighting.ambientIntensity < 0.38) {
        sc.lighting.ambientIntensity = 0.38;
        adjusted = true;
      }
    }
    if (adjusted) {
      markRuleApplied('POST_RENDER_BLACK_FRAMES', 'Piso de luz ambiente elevado para >=0.38 (regra aprendida de blackdetect).');
    }
  }

  if (activeRuleCodes.has('POST_RENDER_FREEZE_FRAMES')) {
    let adjusted = false;
    for (let i = 0; i < project.scenes.length; i++) {
      const sc = project.scenes[i];
      if (sc.cameraIntensity < 0.62) {
        sc.cameraIntensity = 0.62;
        adjusted = true;
      }
      if (!sc.secondaryCameraMove && sc.duration >= 2.5) {
        sc.secondaryCameraMove = CAMERA_MOVE_ROTATION[(i + 2) % CAMERA_MOVE_ROTATION.length];
        adjusted = true;
      }
    }
    if (adjusted) {
      markRuleApplied('POST_RENDER_FREEZE_FRAMES', 'Dinâmica mínima de câmera reforçada (regra aprendida de freezedetect).');
    }
  }

  const scenMap = new Map<string, ScenarioDefinition>();
  for (const s of [...allScenarios, ...project.scenarios]) scenMap.set(s.id, s);

  const maxChars = project.format.aspectRatio === '9:16' ? 32 : project.format.aspectRatio === '1:1' ? 36 : 44;

  // 3. Multi-pass deterministic QA validation -> targeted repair loop
  let remainingIssues: ValidationIssue[] = [];
  for (let pass = 0; pass < maxPasses; pass++) {
    const issues = validateProjectPlan(project, allCharacters, allScenarios);
    remainingIssues = issues;
    const actionable = issues.filter((i) => i.severity === 'error' || i.severity === 'warning');
    if (actionable.length === 0) break;

    let madeChange = false;

    for (const issue of actionable) {
      const idx = issue.sceneIndex;
      const sc: SceneSpec | undefined = typeof idx === 'number' ? project.scenes[idx] : undefined;

      switch (issue.code) {
        case 'GENRE_DRIFT': {
          project.genre = 'horror';
          markRuleApplied('GENRE_DRIFT', 'Gênero realinhado ao prompt original (terror psicológico).');
          madeChange = true;
          break;
        }
        case 'UNAUTHORIZED_NARRATIVE_INJECTION': {
          const horrorLead =
            allCharacters.find((c) => c.id === 'char_lucas') ??
            STARTER_CHARACTERS.find((c) => c.genre === 'horror') ??
            STARTER_CHARACTERS[0];
          const replacedIds = new Set<string>();
          project.characterBible = project.characterBible.map((c) => {
            if (/jornalista/i.test(c.role)) {
              replacedIds.add(c.id);
              return { ...horrorLead, visualSheet: buildCharacterVisualSheet(horrorLead) };
            }
            return c;
          });
          if (replacedIds.size > 0) {
            for (const scene of project.scenes) {
              for (const actor of scene.actors) {
                if (replacedIds.has(actor.characterId)) {
                  actor.characterId = horrorLead.id;
                }
              }
            }
          }
          for (const scene of project.scenes) {
            scene.summary = scene.summary.replace(/\bjornalista\b/gi, 'protagonista');
            scene.captionText = scene.captionText.replace(/\bjornalista\b/gi, 'protagonista');
          }
          markRuleApplied('UNAUTHORIZED_NARRATIVE_INJECTION', 'Personagem/texto não solicitado substituído por elenco fiel ao prompt.');
          madeChange = true;
          break;
        }
        case 'MISSING_VISUAL_SHEET':
        case 'APPEARANCE_DRIFT': {
          project.characterBible = project.characterBible.map((ch) => {
            if (ch.visualSheet && issue.code === 'APPEARANCE_DRIFT') {
              return {
                ...ch,
                palette: { ...ch.visualSheet.lockedPalette },
                outfitStyle: ch.visualSheet.lockedOutfitStyle,
                hairStyle: ch.visualSheet.lockedHairStyle,
                accessory: { ...ch.visualSheet.lockedAccessory },
                visualSheet: buildCharacterVisualSheet({
                  ...ch,
                  palette: { ...ch.visualSheet.lockedPalette },
                  outfitStyle: ch.visualSheet.lockedOutfitStyle,
                  hairStyle: ch.visualSheet.lockedHairStyle,
                  accessory: { ...ch.visualSheet.lockedAccessory },
                }),
              };
            }
            return { ...ch, visualSheet: buildCharacterVisualSheet(ch) };
          });
          markRuleApplied(issue.code, 'Fichas visuais persistentes restauradas e travadas.');
          madeChange = true;
          break;
        }
        case 'DUPLICATE_ACTOR_ID': {
          if (sc) {
            const seen = new Set<string>();
            const before = sc.actors.length;
            sc.actors = sc.actors.filter((a) => {
              if (seen.has(a.characterId)) return false;
              seen.add(a.characterId);
              return true;
            });
            if (sc.actors.length < before) {
              markRuleApplied('DUPLICATE_ACTOR_ID', `Cena ${idx! + 1}: ator duplicado removido automaticamente.`);
              madeChange = true;
            }
          }
          break;
        }
        case 'SPATIAL_TELEPORT': {
          if (sc && typeof idx === 'number' && idx > 0) {
            const prev = project.scenes[idx - 1];
            if (prev.scenarioId === sc.scenarioId) {
              for (const actor of sc.actors) {
                const prevActor = prev.actors.find((a) => a.characterId === actor.characterId);
                if (prevActor && Math.abs(prevActor.targetX - actor.x) > 0.55) {
                  actor.x = Number(Math.max(0.14, Math.min(0.86, prevActor.targetX)).toFixed(2));
                  markRuleApplied('SPATIAL_TELEPORT', `Cena ${idx + 1}: posição inicial alinhada ao fim da Cena ${idx} (sem teletransporte).`);
                  madeChange = true;
                }
              }
            }
          }
          break;
        }
        case 'ABRUPT_SCENARIO_CUT': {
          if (sc && sc.transitionIn === 'cut') {
            sc.transitionIn = 'crossfade';
            markRuleApplied('ABRUPT_SCENARIO_CUT', `Cena ${idx! + 1}: corte seco substituído por crossfade na mudança de cenário.`);
            madeChange = true;
          }
          break;
        }
        case 'LIGHTING_DISCONTINUITY': {
          if (sc && typeof idx === 'number' && idx > 0) {
            const prev = project.scenes[idx - 1];
            const diff = sc.lighting.ambientIntensity - prev.lighting.ambientIntensity;
            if (Math.abs(diff) > 0.42) {
              sc.lighting.ambientIntensity = Number(
                Math.max(0.32, Math.min(0.85, prev.lighting.ambientIntensity + Math.sign(diff) * 0.28)).toFixed(2)
              );
              markRuleApplied('LIGHTING_DISCONTINUITY', `Cena ${idx + 1}: transição de luz ambiente suavizada no mesmo cenário.`);
              madeChange = true;
            }
          }
          break;
        }
        case 'PROLONGED_STATIC_CAMERA': {
          if (sc) {
            sc.cameraMove = CAMERA_MOVE_ROTATION[(idx ?? 0) % CAMERA_MOVE_ROTATION.length];
            sc.secondaryCameraMove = CAMERA_MOVE_ROTATION[((idx ?? 0) + 2) % CAMERA_MOVE_ROTATION.length];
            markRuleApplied('PROLONGED_STATIC_CAMERA', `Cena ${idx! + 1}: câmera estática convertida para ${sc.cameraMove}.`);
            madeChange = true;
          }
          break;
        }
        case 'UNMOTIVATED_CAMERA': {
          if (sc) {
            sc.cameraMotivation = `Acompanhar "${sc.title}" com movimento ${sc.cameraMove} reforçando o ritmo de ${sc.narrativeIntent}.`;
            if (!sc.focusTarget) sc.focusTarget = 'subject_body';
            markRuleApplied('UNMOTIVATED_CAMERA', `Cena ${idx! + 1}: motivação narrativa de câmera preenchida.`);
            madeChange = true;
          }
          break;
        }
        case 'REPETITIVE_CAMERA': {
          if (sc && typeof idx === 'number' && idx > 0) {
            const prev = project.scenes[idx - 1];
            const nextMove = CAMERA_MOVE_ROTATION.find((m) => m !== prev.cameraMove && m !== 'static') ?? 'dolly_in';
            const nextFraming = FRAMING_ROTATION.find((f) => f !== prev.framing) ?? 'close_up';
            sc.cameraMove = nextMove;
            sc.framing = nextFraming;
            markRuleApplied('REPETITIVE_CAMERA', `Cena ${idx + 1}: câmera/plano diversificados (${nextFraming} · ${nextMove}).`);
            madeChange = true;
          }
          break;
        }
        case 'FLAT_FRAMING_VARIETY': {
          project.scenes.forEach((scene, sIdx) => {
            scene.framing = FRAMING_ROTATION[sIdx % FRAMING_ROTATION.length];
          });
          markRuleApplied('FLAT_FRAMING_VARIETY', 'Escala de planos diversificada ao longo do arco narrativo.');
          madeChange = true;
          break;
        }
        case 'EXCESSIVE_GLITCH': {
          if (sc) {
            sc.effects.glitch = 0;
            sc.effects.chromaticAberration = 0;
            if (sc.transitionIn === 'glitch_cut') sc.transitionIn = 'crossfade';
            markRuleApplied('EXCESSIVE_GLITCH', `Cena ${idx! + 1}: glitch artificial zerado.`);
            madeChange = true;
          }
          break;
        }
        case 'EXCESSIVE_SCANLINES': {
          if (sc) {
            sc.effects.scanlines = 0;
            markRuleApplied('EXCESSIVE_SCANLINES', `Cena ${idx! + 1}: scanlines removidas.`);
            madeChange = true;
          }
          break;
        }
        case 'EXCESSIVE_VOLUMETRIC_FX': {
          if (sc) {
            sc.effects.fog = Math.min(0.22, sc.effects.fog);
            sc.effects.smoke = Math.min(0.12, sc.effects.smoke);
            sc.lighting.bloomIntensity = Math.min(0.2, sc.lighting.bloomIntensity);
            sc.lighting.volumetricIntensity = Math.min(0.2, sc.lighting.volumetricIntensity ?? 0.16);
            markRuleApplied('EXCESSIVE_VOLUMETRIC_FX', `Cena ${idx! + 1}: névoa/fumaça/bloom calibrados para nitidez.`);
            madeChange = true;
          }
          break;
        }
        case 'EXCESSIVE_FLICKER': {
          if (sc) {
            sc.lighting.pointLightFlicker = Math.min(0.16, sc.lighting.pointLightFlicker);
            markRuleApplied('EXCESSIVE_FLICKER', `Cena ${idx! + 1}: oscilação de luz limitada contra flickering.`);
            madeChange = true;
          }
          break;
        }
        case 'FROZEN_CHARACTER':
        case 'REPETITIVE_MOTION': {
          if (sc && sc.actors[0]) {
            const a = sc.actors[0];
            const altState: AnimationState = a.state === 'walk' ? 'idle' : 'walk';
            a.nextState = altState;
            a.actionPhases = [
              { atProgress: 0.0, state: a.state, expression: a.expression, lookDirection: 'forward' },
              { atProgress: 0.45, state: altState, expression: a.expression === 'neutral' ? 'surprised' : a.expression, lookDirection: 'scan' },
              { atProgress: 0.8, state: a.state === 'idle' ? 'walk' : a.state, expression: a.expression, lookDirection: 'forward' },
            ];
            if (Math.abs(a.targetX - a.x) < 0.02) {
              a.targetX = Number(Math.min(0.84, Math.max(0.16, a.x + (a.x < 0.5 ? 0.1 : -0.1))).toFixed(2));
            }
            markRuleApplied(issue.code, `Cena ${idx! + 1}: coreografia multifase sintetizada para eliminar congelamento/repetição.`);
            madeChange = true;
          }
          break;
        }
        case 'OFFSCREEN_ACTOR': {
          if (sc) {
            for (const a of sc.actors) {
              a.x = Math.max(0.14, Math.min(0.86, a.x));
              a.targetX = Math.max(0.14, Math.min(0.86, a.targetX));
            }
            markRuleApplied('OFFSCREEN_ACTOR', `Cena ${idx! + 1}: posições dos personagens centralizadas na área visível.`);
            madeChange = true;
          }
          break;
        }
        case 'PROPORTION_OUT_OF_RANGE': {
          if (sc) {
            for (const a of sc.actors) {
              a.scale = Math.max(0.78, Math.min(1.38, a.scale));
            }
            markRuleApplied('PROPORTION_OUT_OF_RANGE', `Cena ${idx! + 1}: escala dos personagens normalizada.`);
            madeChange = true;
          }
          break;
        }
        case 'PROP_COLLISION_PASSTHROUGH': {
          if (sc) {
            const scenario = scenMap.get(sc.scenarioId);
            const solidProps =
              scenario?.props.filter((p) => p.depth === 'midground' && (p.kind === 'pillar' || p.kind === 'crate')) ?? [];
            for (const a of sc.actors) {
              if (a.isShadowEntity) continue;
              for (const prop of solidProps) {
                const minX = Math.min(a.x, a.targetX);
                const maxX = Math.max(a.x, a.targetX);
                if (minX < prop.x - 0.04 && maxX > prop.x + 0.04 && Math.abs(a.y - prop.y) < 0.12) {
                  // Move actor slightly forward in ground plane so trajectory cleanly passes in front of prop
                  a.y = Number(Math.min(0.84, prop.y + 0.14).toFixed(2));
                  a.targetY = a.y;
                  markRuleApplied('PROP_COLLISION_PASSTHROUGH', `Cena ${idx! + 1}: trajetória ajustada para contornar "${prop.label}".`);
                  madeChange = true;
                }
              }
            }
          }
          break;
        }
        case 'CAPTION_STAGE_DIRECTION_LEAK':
        case 'CAPTION_TOO_LONG':
        case 'CAPTION_VISUAL_MISMATCH': {
          if (sc) {
            const sourceText =
              issue.code === 'CAPTION_VISUAL_MISMATCH'
                ? sc.sourceBeat || sc.summary || sc.title
                : sc.captionText || sc.sourceBeat || sc.summary;
            sc.captionText = sanitizeCaptionForRepair(sourceText, maxChars);
            markRuleApplied(issue.code, `Cena ${idx! + 1}: legenda higienizada e sincronizada com a ação visual.`);
            madeChange = true;
          }
          break;
        }
        case 'MISSING_CAUSAL_CHAIN':
        case 'INCOMPLETE_CAUSAL_CHAIN': {
          if (sc && typeof idx === 'number') {
            const prev = idx > 0 ? project.scenes[idx - 1] : null;
            const next = idx < project.scenes.length - 1 ? project.scenes[idx + 1] : null;
            sc.causalChain = {
              whatHappenedBefore:
                sc.causalChain?.whatHappenedBefore?.trim() ||
                (prev ? `Na cena anterior: ${prev.summary}` : 'Início da narrativa estabelecendo ambiente e estado inicial.'),
              whatHappensNow: sc.causalChain?.whatHappensNow?.trim() || sc.summary,
              whatChanges: sc.causalChain?.whatChanges?.trim() || `Avanço dramático em "${sc.title}".`,
              howItTriggersNext:
                sc.causalChain?.howItTriggersNext?.trim() ||
                (next ? `Prepara diretamente "${next.title}".` : 'Conduz ao encerramento dramático da obra.'),
              narrativeObjective:
                sc.causalChain?.narrativeObjective?.trim() || `Cumprir o estágio "${sc.narrativeIntent}" fielmente ao roteiro.`,
            };
            markRuleApplied(issue.code, `Cena ${idx + 1}: cadeia causal completa preenchida.`);
            madeChange = true;
          }
          break;
        }
        case 'SCENE_ORDER_CORRUPT':
        case 'SCRIPT_LENGTH_MISMATCH':
        case 'SCRIPT_ORDER_MISMATCH': {
          project.scenes = project.scenes.map((scene, sIdx) => ({ ...scene, index: sIdx }));
          project.script = project.scenes.map((scene, sIdx) => ({
            sceneIndex: sIdx,
            heading: project.script[sIdx]?.heading || `CENA ${sIdx + 1} — ${scene.title.toUpperCase()}`,
            action: scene.summary,
            dialogue: scene.captionText || '(Sem narração — narrativa visual e sonora)',
            soundCue: scene.sfxEvents.map((e) => `${e.label} (${e.sfx})`).join(', ') || 'Ambiência',
          }));
          markRuleApplied(issue.code, 'Ordem de cenas e roteiro sincronizados.');
          madeChange = true;
          break;
        }
        case 'PIXEL_GRID_INVALID': {
          const grid = resolvePixelGridForAspectRatio(project.format.aspectRatio);
          project.pixelConfig = { ...grid };
          markRuleApplied(
            'PIXEL_GRID_INVALID',
            `Grade pixel art restaurada para ${grid.logicalWidth}×${grid.logicalHeight} (nearest-neighbor).`
          );
          madeChange = true;
          break;
        }
        case 'PIXEL_CAPTION_OVERFLOW': {
          if (sc && sc.captionText.trim().length > 78) {
            sc.captionText = sanitizeCaptionForRepair(sc.captionText, 34);
            markRuleApplied('PIXEL_CAPTION_OVERFLOW', `Cena ${idx! + 1}: legenda pixel compactada para legibilidade retrô.`);
            madeChange = true;
          }
          break;
        }
        case 'EDUCATIONAL_INFOGRAPHIC_MISSING': {
          const targetIdx = Math.min(1, project.scenes.length - 1);
          const targetScene = project.scenes[targetIdx];
          if (targetScene) {
            const matchedTopic =
              VERIFIED_EDUCATIONAL_TOPICS.find((t) => t.id === project.educationalContext?.topicId) ??
              matchVerifiedTopicForPrompt(project.prompt) ??
              VERIFIED_EDUCATIONAL_TOPICS[0];
            const firstTopicInfo = matchedTopic.scenes.find((s) => s.infographic)?.infographic;
            targetScene.sceneVisualMode = 'split_cutaway';
            targetScene.infographic = firstTopicInfo
              ? { ...firstTopicInfo, callouts: firstTopicInfo.callouts.map((c) => ({ ...c })) }
              : {
                  kind: 'process_diagram',
                  title: matchedTopic.title.toUpperCase(),
                  stage: 1,
                  accentColor: '#FFD23F',
                  callouts: [
                    {
                      id: 'c_auto_1',
                      label: matchedTopic.domainLabel.toUpperCase(),
                      x: 0.2,
                      y: 0.25,
                      targetX: 0.5,
                      targetY: 0.48,
                      color: '#FFD23F',
                    },
                  ],
                };
            markRuleApplied(
              'EDUCATIONAL_INFOGRAPHIC_MISSING',
              `Cena ${targetIdx + 1}: infográfico animado (${targetScene.infographic.kind}) inserido.`
            );
            madeChange = true;
          }
          break;
        }
        case 'EDUCATIONAL_UNVERIFIED_CLAIM': {
          const matchedTopic = matchVerifiedTopicForPrompt(project.prompt) ?? VERIFIED_EDUCATIONAL_TOPICS[0];
          project.educationalContext = {
            topicId: matchedTopic.id,
            domain: matchedTopic.domain,
            topicTitle: matchedTopic.title,
            sourceCitation: matchedTopic.sourceCitation,
            factSource: 'verified_offline_db',
            verifiedFacts: [...matchedTopic.verifiedFacts],
          };
          markRuleApplied(
            'EDUCATIONAL_UNVERIFIED_CLAIM',
            `Base científica verificada vinculada: ${matchedTopic.title} (${matchedTopic.sourceCitation}).`
          );
          madeChange = true;
          break;
        }
        default:
          break;
      }
    }

    // Always re-sync indices, duration, script headings, and continuityLedger after edits
    if (madeChange) {
      project.scenes = project.scenes.map((s, sIdx) => ({ ...s, index: sIdx }));
      project.totalDuration = Number(project.scenes.reduce((acc, s) => acc + s.duration, 0).toFixed(2));
      project.script = project.scenes.map((sc, sIdx) => ({
        sceneIndex: sIdx,
        heading: project.script[sIdx]?.heading || `CENA ${sIdx + 1} — ${sc.title.toUpperCase()}`,
        action: sc.summary,
        dialogue: sc.captionText || '(Sem narração — narrativa visual e sonora)',
        soundCue: sc.sfxEvents.map((e) => `${e.label} (${e.sfx})`).join(', ') || 'Ambiência',
      }));
      project.continuityLedger = rebuildContinuityLedger(project);
      project.updatedAt = new Date().toISOString();
    } else {
      break;
    }
  }

  remainingIssues = validateProjectPlan(project, allCharacters, allScenarios);
  project.memoryContext = {
    rememberedVideosCount: nextMemory.videos.length,
    appliedRuleIds: Array.from(appliedRuleIds),
    autoFixesApplied,
    avoidedPatterns,
    recalledVideoTitles,
  };

  nextMemory = {
    ...nextMemory,
    totalAutoFixes: nextMemory.totalAutoFixes + autoFixesApplied.length,
    updatedAt: new Date().toISOString(),
  };

  return {
    project,
    appliedRuleIds: Array.from(appliedRuleIds),
    autoFixesApplied,
    avoidedPatterns,
    recalledVideoTitles,
    remainingIssues,
    updatedMemory: nextMemory,
  };
}
