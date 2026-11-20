import type {
  AspectRatio,
  AudioConfig,
  CameraMove,
  CharacterDefinition,
  CharacterPersistentState,
  EducationalContext,
  ExpressionType,
  FPSOption,
  FramingType,
  PerformanceProfile,
  ProjectPlan,
  ResolutionPreset,
  ScenarioDefinition,
  SceneActor,
  SceneSpec,
  SfxType,
  StudioMemoryState,
  TransitionType,
} from '../types/studio';
import {
  buildCharacterVisualSheet,
  DEFAULT_EFFECTS,
  DEFAULT_LIGHTING,
  STARTER_CHARACTERS,
  STARTER_SCENARIOS,
} from '../data/presets';
import {
  inferEducationalDomain,
  matchVerifiedTopicForPrompt,
  parseUserEducationalFacts,
  resolvePixelGridForAspectRatio,
  RETRO_PIXEL_PALETTE,
  type VerifiedSceneBlueprint,
} from '../data/retroEducationalKnowledge';
import { applyLearnedRulesAndAutoRepair } from './learningMemory';

export interface RetroEducationalPlanOptions {
  prompt: string;
  aspectRatio: AspectRatio;
  durationSec: number;
  fps: FPSOption;
  previewResolution?: ResolutionPreset;
  exportResolution?: ResolutionPreset;
  performanceProfile: PerformanceProfile;
  narrationMode: AudioConfig['narrationMode'];
  availableCharacters: CharacterDefinition[];
  availableScenarios: ScenarioDefinition[];
  educationalTopicId?: string;
  educationalFacts?: string | string[];
  memory?: StudioMemoryState;
}

function extractKeywordsFromText(text: string): string[] {
  const stop = new Set([
    'para',
    'como',
    'sobre',
    'quando',
    'onde',
    'pelo',
    'pela',
    'isso',
    'esse',
    'essa',
    'mais',
    'muito',
    'tudo',
    'pode',
    'cada',
    'seus',
    'suas',
    'entre',
    'depois',
    'antes',
  ]);
  return Array.from(
    new Set(
      text
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .split(/[^a-z0-9]+/)
        .filter((w) => w.length >= 4 && !stop.has(w))
    )
  ).slice(0, 4);
}

function buildCustomFactBlueprints(
  prompt: string,
  userFacts: string[],
  domainInfo: ReturnType<typeof inferEducationalDomain>
): { title: string; blueprints: VerifiedSceneBlueprint[]; factsUsed: string[] } {
  const cleanPrompt = prompt.trim();
  const baseFacts =
    userFacts.length >= 2
      ? userFacts
      : userFacts.length === 1
      ? [
          `Tema proposto: ${cleanPrompt.slice(0, 90)}`,
          userFacts[0],
          `Resumo visual baseado no fato informado pelo usuário.`,
        ]
      : cleanPrompt
          .split(/(?<=[.!?])\s+|\n+|;\s*/g)
          .map((s) => s.trim())
          .filter((s) => s.length >= 8)
          .slice(0, 5);

  const finalFacts =
    baseFacts.length >= 3
      ? baseFacts
      : [
          baseFacts[0] || cleanPrompt.slice(0, 80) || 'Pergunta educativa principal',
          baseFacts[1] || 'Visualização passo a passo do conceito informado no prompt',
          'Síntese visual para fixar o aprendizado sem inventar dados externos',
        ];

  const framings: FramingType[] = ['medium', 'close_up', 'detail', 'low_angle', 'wide'];
  const moves: CameraMove[] = ['dolly_in', 'zoom', 'pan', 'tilt', 'dolly_out'];
  const transitions: TransitionType[] = ['fade_black', 'iris_zoom', 'pixel_wipe', 'dither_dissolve', 'pixel_wipe'];
  const sfxs: SfxType[] = ['arcade_coin', 'arcade_blip', 'arcade_zap', 'pop', 'arcade_powerup'];

  const blueprints: VerifiedSceneBlueprint[] = finalFacts.map((fact, idx) => {
    const isMiddle = idx > 0 && idx < finalFacts.length - 1;
    const shortCaption = fact.length > 56 ? `${fact.slice(0, 53).replace(/\s+\S*$/, '')}…` : fact;
    const kw = extractKeywordsFromText(fact);
    return {
      title: idx === 0 ? 'Pergunta Inicial' : idx === finalFacts.length - 1 ? 'Resumo Visual' : `Etapa ${idx}: Explicação`,
      fact,
      caption: shortCaption,
      emphasisWords: kw.slice(0, 2),
      durationWeight: 1,
      scenarioId: domainInfo.scenarioId,
      visualMode: isMiddle ? 'infographic_focus' : 'character_scenario',
      framing: framings[idx % framings.length],
      cameraMove: moves[idx % moves.length],
      cameraMotivation: isMiddle
        ? `Aproxima o infográfico animado para destacar visualmente o conceito da etapa ${idx + 1}.`
        : `Enquadra o personagem guia apresentando o tema educativo com clareza.`,
      transitionIn: transitions[idx % transitions.length],
      leadCharacterId: domainInfo.leadCharacterId,
      leadState: idx === 0 ? 'talk' : isMiddle ? 'run' : 'jump',
      leadNextState: idx === finalFacts.length - 1 ? 'idle' : 'talk',
      leadExpression: idx === 0 ? 'surprised' : idx === finalFacts.length - 1 ? 'happy' : 'determined',
      sfx: sfxs[idx % sfxs.length],
      sfxLabel: `Destaque etapa ${idx + 1}`,
      infographic: isMiddle
        ? {
            kind: domainInfo.infographicKind,
            stage: idx % 3,
            title: `ETAPA ${idx}`,
            accentColor: idx % 2 === 0 ? '#FFD23F' : '#38E8FF',
            callouts: [
              {
                id: `c_${idx}`,
                label: (kw[0] || `ETAPA ${idx}`).toUpperCase(),
                x: 0.64,
                y: 0.42,
                targetX: 0.5,
                targetY: 0.5,
                color: '#FFD23F',
              },
            ],
            diagramNodes: finalFacts.slice(0, 3).map((f, ni) => {
              const k = extractKeywordsFromText(f)[0];
              return k ? k.toUpperCase() : `ETAPA ${ni + 1}`;
            }),
          }
        : undefined,
    };
  });

  const shortTitle =
    cleanPrompt.length > 48
      ? `${cleanPrompt.slice(0, 45).replace(/\s+\S*$/, '')}...`
      : cleanPrompt || 'Curiosidade Científica 8-Bit';

  return { title: shortTitle, blueprints, factsUsed: finalFacts };
}

/**
 * Generates a complete, scientifically honest RETRO PIXEL EDUCATIONAL ProjectPlan.
 * Uses verified offline scientific entries OR strict user-supplied facts (zero invented data).
 */
export function generateRetroPixelEducationalPlan(options: RetroEducationalPlanOptions): ProjectPlan {
  const chars = [
    ...STARTER_CHARACTERS,
    ...options.availableCharacters.filter((c) => !STARTER_CHARACTERS.some((s) => s.id === c.id)),
  ].map((c) => ({ ...c, visualSheet: c.visualSheet ?? buildCharacterVisualSheet(c) }));

  const scens = [
    ...STARTER_SCENARIOS,
    ...options.availableScenarios.filter((s) => !STARTER_SCENARIOS.some((b) => b.id === s.id)),
  ];

  const userFacts = parseUserEducationalFacts(options.educationalFacts);
  const matchedTopic = matchVerifiedTopicForPrompt(options.prompt, options.educationalTopicId);
  const domainInfo = inferEducationalDomain(options.prompt);

  let title: string;
  let blueprints: VerifiedSceneBlueprint[];
  let educationalContext: EducationalContext;
  let palette: string[];

  if (matchedTopic && userFacts.length === 0) {
    title = matchedTopic.title;
    blueprints = matchedTopic.scenes;
    palette = matchedTopic.palette;
    educationalContext = {
      topicId: matchedTopic.id,
      domain: matchedTopic.domain,
      topicTitle: matchedTopic.title,
      sourceCitation: matchedTopic.sourceCitation,
      factSource: 'verified_offline_db',
      verifiedFacts: [...matchedTopic.verifiedFacts],
    };
  } else if (matchedTopic && userFacts.length > 0) {
    // Hybrid: keep verified topic visual language while incorporating explicit user facts
    const custom = buildCustomFactBlueprints(options.prompt, userFacts, {
      domain: matchedTopic.domain,
      scenarioId: matchedTopic.scenes[0]?.scenarioId ?? domainInfo.scenarioId,
      infographicKind: matchedTopic.scenes.find((s) => s.infographic)?.infographic?.kind ?? domainInfo.infographicKind,
      leadCharacterId: matchedTopic.scenes[0]?.leadCharacterId ?? domainInfo.leadCharacterId,
    });
    title = matchedTopic.title;
    blueprints = custom.blueprints;
    palette = matchedTopic.palette;
    educationalContext = {
      topicId: matchedTopic.id,
      domain: matchedTopic.domain,
      topicTitle: matchedTopic.title,
      sourceCitation: `Fatos fornecidos pelo usuário + ${matchedTopic.sourceCitation}`,
      factSource: 'hybrid',
      verifiedFacts: userFacts,
    };
  } else {
    const custom = buildCustomFactBlueprints(options.prompt, userFacts, domainInfo);
    title = custom.title;
    blueprints = custom.blueprints;
    palette = [
      RETRO_PIXEL_PALETTE.deepPurple,
      RETRO_PIXEL_PALETTE.midnightBlue,
      RETRO_PIXEL_PALETTE.vibrantPink,
      RETRO_PIXEL_PALETTE.goldenYellow,
      RETRO_PIXEL_PALETTE.iceCyan,
      RETRO_PIXEL_PALETTE.cream,
    ];
    educationalContext = {
      topicId: 'custom_user_topic',
      domain: domainInfo.domain,
      topicTitle: custom.title,
      sourceCitation:
        userFacts.length > 0
          ? 'Fatos fornecidos diretamente pelo usuário (sem dados inventados).'
          : 'Roteiro estruturado a partir do prompt do usuário (adicione fatos verificados no campo dedicado para citações técnicas).',
      factSource: 'user_supplied',
      verifiedFacts: custom.factsUsed,
    };
  }

  const totalDur = Math.max(12, Math.min(90, options.durationSec || 30));
  const weightSum = blueprints.reduce((acc, b) => acc + b.durationWeight, 0);
  const rawDurs = blueprints.map((b) => Number(((b.durationWeight / weightSum) * totalDur).toFixed(2)));
  const durDiff = Number((totalDur - rawDurs.reduce((a, b) => a + b, 0)).toFixed(2));
  if (rawDurs.length > 0) {
    rawDurs[rawDurs.length - 1] = Number(Math.max(2.2, rawDurs[rawDurs.length - 1] + durDiff).toFixed(2));
  }

  const intents: SceneSpec['narrativeIntent'][] = ['abertura', 'desenvolvimento', 'tensao', 'climax', 'encerramento'];

  const scenes: SceneSpec[] = blueprints.map((bp, idx) => {
    const intent: SceneSpec['narrativeIntent'] =
      idx === 0
        ? 'abertura'
        : idx === blueprints.length - 1
        ? 'encerramento'
        : intents[Math.min(3, Math.floor((idx / blueprints.length) * 4))];

    const leadChar = chars.find((c) => c.id === bp.leadCharacterId) ?? chars.find((c) => c.genre === 'educational') ?? chars[0];
    const actors: SceneActor[] = [
      {
        id: `actor_lead_${idx}`,
        characterId: leadChar.id,
        x: bp.companionCharacterId ? 0.36 : 0.44,
        y: 0.78,
        targetX: bp.companionCharacterId ? 0.42 : 0.56,
        targetY: 0.78,
        scale: 1.05,
        opacity: 1,
        flipX: false,
        rotation: 0,
        state: bp.leadState,
        nextState: bp.leadNextState,
        stateTransitionRatio: 0.5,
        actionPhases: [
          { atProgress: 0.0, state: bp.leadState, expression: bp.leadExpression, lookDirection: 'forward' },
          { atProgress: 0.52, state: bp.leadNextState, expression: bp.leadExpression, lookDirection: 'forward' },
        ],
        lookDirection: 'forward',
        revealMode: 'visible',
        expression: bp.leadExpression,
        easing: 'ease_in_out',
      },
    ];

    if (bp.companionCharacterId) {
      const comp = chars.find((c) => c.id === bp.companionCharacterId);
      if (comp && comp.id !== leadChar.id) {
        actors.push({
          id: `actor_comp_${idx}`,
          characterId: comp.id,
          x: 0.68,
          y: 0.78,
          targetX: 0.64,
          targetY: 0.78,
          scale: 0.95,
          opacity: 1,
          flipX: false,
          rotation: 0,
          state: 'idle',
          nextState: 'jump',
          stateTransitionRatio: 0.65,
          actionPhases: [
            { atProgress: 0.0, state: 'idle', expression: 'happy', lookDirection: 'forward' },
            { atProgress: 0.65, state: 'jump', expression: 'surprised', lookDirection: 'forward' },
          ],
          lookDirection: 'forward',
          revealMode: 'visible',
          expression: 'happy',
          easing: 'spring',
        });
      }
    }

    const prevFact = idx > 0 ? blueprints[idx - 1].fact : 'Abertura da curiosidade educativa para engajar o espectador.';
    const nextFact =
      idx < blueprints.length - 1
        ? `Prepara a próxima etapa: ${blueprints[idx + 1].title}.`
        : 'Fecha a explicação consolidando o aprendizado com impacto visual.';

    return {
      id: `retro_scene_${idx + 1}_${Math.random().toString(36).slice(2, 6)}`,
      index: idx,
      title: bp.title,
      summary: bp.fact,
      sourceBeat: bp.fact,
      expectedKeywords: extractKeywordsFromText(`${bp.title} ${bp.fact}`),
      causalChain: {
        whatHappenedBefore: prevFact,
        whatHappensNow: bp.fact,
        whatChanges: `Avança a explicação para "${bp.title}" com recurso visual ${bp.infographic ? 'infográfico pixel art' : 'personagem + cenário'}.`,
        howItTriggersNext: nextFact,
        narrativeObjective: `Explicar com clareza: ${bp.fact}`,
      },
      narrativeIntent: intent,
      duration: rawDurs[idx],
      scenarioId: scens.some((s) => s.id === bp.scenarioId) ? bp.scenarioId : 'scene_pixel_lab',
      framing: bp.framing,
      cameraMove: bp.cameraMove,
      cameraIntensity: 0.64,
      cameraMotivation: bp.cameraMotivation,
      focusTarget: bp.infographic ? 'prop_clue' : 'subject_face',
      transitionIn: bp.transitionIn,
      endingImpact: idx === blueprints.length - 1 ? 'dramatic_reveal' : 'none',
      reflectionMode: 'none',
      lighting: {
        ...DEFAULT_LIGHTING,
        ambientIntensity: 0.68,
        ambientColor: RETRO_PIXEL_PALETTE.deepPurple,
        pointLightColor: RETRO_PIXEL_PALETTE.goldenYellow,
        rimLightColor: RETRO_PIXEL_PALETTE.iceCyan,
        pointLightFlicker: 0.04,
        volumetricIntensity: 0.1,
        bloomIntensity: 0.14,
      },
      effects: {
        ...DEFAULT_EFFECTS,
        fog: 0,
        smoke: 0,
        dust: 0,
        vignette: 0.12,
        filmGrain: 0,
        glitch: 0,
        scanlines: 0,
        sparks: bp.visualMode === 'infographic_focus' ? 0.35 : 0.2,
        snow: bp.infographic?.kind === 'brain_nerve_freeze' && bp.infographic.stage === 1 ? 0.45 : 0,
      },
      actors,
      sfxEvents: [
        {
          id: `sfx_${idx}_1`,
          sfx: bp.sfx,
          offsetSec: 0.18,
          volume: 0.85,
          label: bp.sfxLabel,
        },
        ...(rawDurs[idx] >= 3.2
          ? [
              {
                id: `sfx_${idx}_2`,
                sfx: 'arcade_blip' as SfxType,
                offsetSec: Number((rawDurs[idx] * 0.55).toFixed(2)),
                volume: 0.62,
                label: 'Ênfase educativa',
              },
            ]
          : []),
      ],
      captionText: bp.caption,
      captionEmphasisWords: bp.emphasisWords,
      visualPrompt: `Retro Pixel 16-bit: ${bp.title} — ${bp.fact}`,
      colorPalette: palette,
      sceneVisualMode: bp.visualMode,
      infographic: bp.infographic,
    };
  });

  const usedCharIds = new Set(scenes.flatMap((s) => s.actors.map((a) => a.characterId)));
  const characterBible = chars.filter((c) => usedCharIds.has(c.id));
  const usedScenIds = new Set(scenes.map((s) => s.scenarioId));
  const usedScenarios = scens.filter((s) => usedScenIds.has(s.id));

  const continuityLedger: CharacterPersistentState[] = characterBible.map((ch) => {
    const history: string[] = [];
    let lastExpr: ExpressionType = ch.defaultExpression;
    let lastX = 0.44;
    let lastScen = scenes[0]?.scenarioId ?? 'scene_pixel_lab';
    for (const sc of scenes) {
      const app = sc.actors.find((a) => a.characterId === ch.id);
      if (app) {
        lastExpr = app.expression;
        lastX = app.targetX;
        lastScen = sc.scenarioId;
        history.push(`Cena ${sc.index + 1} (${sc.title}): ${app.state} -> ${app.nextState ?? app.state}`);
      }
    }
    return {
      characterId: ch.id,
      characterName: ch.name,
      emotionalState: lastExpr,
      lastPositionX: lastX,
      lastScenarioId: lastScen,
      carriedProp: ch.accessory.type,
      actionHistory: history,
    };
  });

  const now = new Date().toISOString();
  const pixelConfig = resolvePixelGridForAspectRatio(options.aspectRatio);

  const built: ProjectPlan = {
    schemaVersion: '1.0.0',
    id: `proj_retro_${Date.now().toString(36)}`,
    title,
    prompt: options.prompt,
    genre: 'educational',
    visualStyle: 'retro_pixel_educational',
    pixelConfig,
    educationalContext,
    themeSummary: `Animação educativa em pixel art 16-bit (${pixelConfig.logicalWidth}x${pixelConfig.logicalHeight} -> 1080p nearest) — ${educationalContext.topicTitle}`,
    totalDuration: Number(scenes.reduce((acc, s) => acc + s.duration, 0).toFixed(2)),
    engineUsed: 'offline_rules',
    performanceProfile: options.performanceProfile,
    format: {
      aspectRatio: options.aspectRatio,
      previewResolution: options.previewResolution ?? '540p',
      exportResolution: options.exportResolution ?? '1080p',
      fps: options.fps ?? 24,
      renderer: 'ffmpeg_mp4',
    },
    visualIdentity: {
      mood: 'Arcade 16-bit educativo vibrante, carismático e cientificamente claro',
      palette,
      lightingStyle: 'Iluminação neon retrô com dithering Bayer 4x4 e alto contraste',
      cameraLanguage: 'Alternância dinâmica entre mascote, cenário em parallax e zoom em infográficos animados',
    },
    characterBible,
    scenarios: usedScenarios,
    script: scenes.map((sc) => ({
      sceneIndex: sc.index,
      heading: `CENA ${sc.index + 1} — ${sc.title.toUpperCase()}`,
      action: sc.summary,
      dialogue: sc.captionText,
      soundCue: sc.sfxEvents.map((e) => `${e.label} (${e.sfx})`).join(', ') || 'Chiptune retrô',
    })),
    scenes,
    continuityLedger,
    audio: {
      musicStyle: 'retro_chiptune',
      musicVolume: 0.48,
      sfxVolume: 0.85,
      voiceVolume: options.narrationMode === 'none' ? 0 : 0.82,
      fadeInSec: 0.6,
      fadeOutSec: 1.2,
      duckingAmount: 0.36,
      normalize: true,
      narrationMode: options.narrationMode,
    },
    captions: {
      enabled: true,
      preset: 'retro_arcade',
      fontSize: 34,
      positionY: 0.08,
      safeAreaMargin: 0.08,
      highlightColor: '#FFD23F',
      textColor: '#FFFFFF',
      outlineWidth: 4,
      shadowBlur: 0,
      enterAnimation: 'pop',
      exitAnimation: 'fade',
    },
    createdAt: now,
    updatedAt: now,
  };

  if (options.memory) {
    return applyLearnedRulesAndAutoRepair(built, options.memory, chars, scens).project;
  }

  return built;
}
