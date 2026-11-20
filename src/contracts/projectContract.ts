import type { ProjectPlan, SkillModuleAuditItem, ValidationIssue } from '../types/studio';
import { buildCharacterVisualSheet, computeVisualSheetHash } from '../data/presets';

export const PROJECT_SCHEMA_VERSION = '1.0.0' as const;

export const EXPECTED_SKILL_SCRIPTS = [
  'scripts/probe_env.py',
  'scripts/validate_plan.py',
  'scripts/build_video.py',
  'scripts/render_engine.py',
  'scripts/synth_audio.py',
  'scripts/captions.py',
  'scripts/tts.py',
  'scripts/export_docs.py',
  'scripts/qa_check.py',
  'scripts/_common.py',
] as const;

/**
 * Transparent Origin & Divergence Registry for all 10 modules of ai-cinematic-video-creator.
 * Whenever the original ZIP is supplied and extracted into original_skill/, the audit flips
 * each verified script to 'original_preserved'. Until then, every substitute module documents
 * its exact reason and functional difference — never silently faked.
 */
export function buildSkillAuditMatrix(missingFiles: string[]): SkillModuleAuditItem[] {
  const missingSet = new Set(missingFiles);

  const catalog: Array<{
    modulePath: string;
    purpose: string;
    differences: string;
  }> = [
    {
      modulePath: 'scripts/probe_env.py',
      purpose: 'Diagnóstico real de Python, FFmpeg, codecs, RAM, TTS local e Ollama.',
      differences: 'Implementado em Express (/api/diagnostics) e espelhado no pacote Python exportável com detecção real de libx264/aac.',
    },
    {
      modulePath: 'scripts/validate_plan.py',
      purpose: 'Validação estrutural de planos JSON, duração, consistência e câmera.',
      differences: 'Opera sobre o Contrato Canônico JSON v1.0 compartilhado entre Web e Desktop Python.',
    },
    {
      modulePath: 'scripts/build_video.py',
      purpose: 'Orquestração final de vídeo MP4 (H.264 + AAC) via FFmpeg.',
      differences: 'Executado via FFmpeg real no backend local (/api/render/ffmpeg/*) e no desktop Windows com controle de threads CPU.',
    },
    {
      modulePath: 'scripts/render_engine.py',
      purpose: 'Composição por camadas, câmera dinâmica, parallax, partículas e retomada por blocos.',
      differences: 'Composição 2D em tempo real no Canvas para preview/blocos + motor Python/OpenCV/Pillow no pacote Windows.',
    },
    {
      modulePath: 'scripts/synth_audio.py',
      purpose: 'Trilha procedural e 12 efeitos sonoros com ducking, fades e normalização estéreo.',
      differences: 'Sintetizador Web Audio (tempo real + render WAV offline para FFmpeg) e SciPy/NumPy no pacote desktop.',
    },
    {
      modulePath: 'scripts/captions.py',
      purpose: 'Legendas palavra a palavra em ASS (karaokê) e SRT com área segura.',
      differences: 'Exportador ASS/SRT compatível com FFmpeg e preview sincronizado palavra a palavra no Canvas.',
    },
    {
      modulePath: 'scripts/tts.py',
      purpose: 'Adaptador opcional de narração local (Piper / espeak-ng) com fallback sem narração.',
      differences: 'Detecção real de Piper/espeak-ng no host; quando ausentes, usa modo sem narração ou Web Speech local opcional.',
    },
    {
      modulePath: 'scripts/export_docs.py',
      purpose: 'Exportação de roteiro, storyboard e documentação de produção.',
      differences: 'Incluído no pacote Python exportável e visualizado em tempo real na aba Roteiro do editor.',
    },
    {
      modulePath: 'scripts/qa_check.py',
      purpose: 'Controle de qualidade (quadros pretos/congelados, áudio, consistência) e folha de contato.',
      differences: 'Amostra quadros reais renderizados do projeto, calcula luminância/diferença e gera folha de contato visual.',
    },
    {
      modulePath: 'scripts/_common.py',
      purpose: 'Utilitários de caminhos, logs, resolução e I/O JSON.',
      differences: 'Padronizado para ler/gravar o Contrato JSON v1.0 tanto no ambiente web quanto no Windows.',
    },
  ];

  return catalog.map((item) => {
    const isPresent = !missingSet.has(item.modulePath);
    return {
      modulePath: item.modulePath,
      purpose: item.purpose,
      presentOnDisk: isPresent,
      status: isPresent ? 'original_preserved' : 'substitute_documented',
      reason: isPresent
        ? 'Script original encontrado em original_skill/ e preservado para integração via adaptador.'
        : 'Arquivo ZIP ai-cinematic-video-creator não encontrado no workspace; substituto documentado ativo até envio do ZIP original.',
      functionalDifferences: isPresent
        ? 'Sem divergência — execução direta pelo adaptador da Skill original.'
        : item.differences,
    };
  });
}

/**
 * Normalizes any legacy or imported project JSON into strict Contract v1.0
 * and guarantees every character in characterBible has a locked persistent visualSheet.
 */
export function normalizeToContractV1(raw: Partial<ProjectPlan>): ProjectPlan {
  const base = raw as ProjectPlan;
  const normalizedBible = Array.isArray(base.characterBible)
    ? base.characterBible.map((ch) => ({
        ...ch,
        visualSheet: ch.visualSheet ?? buildCharacterVisualSheet(ch),
      }))
    : [];

  return {
    ...base,
    schemaVersion: PROJECT_SCHEMA_VERSION,
    visualStyle: base.visualStyle ?? 'cinematic_2d',
    pixelConfig: base.pixelConfig,
    educationalContext: base.educationalContext,
    characterBible: normalizedBible,
    format: {
      aspectRatio: base.format?.aspectRatio ?? '9:16',
      previewResolution: base.format?.previewResolution ?? '540p',
      exportResolution: base.format?.exportResolution ?? '1080p',
      fps: base.format?.fps ?? 24,
      renderer: base.format?.renderer ?? 'ffmpeg_mp4',
    },
    performanceProfile: base.performanceProfile ?? 'equilibrado',
    engineUsed: base.engineUsed ?? 'offline_rules',
  };
}

/**
 * Validates strict 4-stage fidelity:
 * 1. Original prompt genre & themes vs project.genre (catches silent fallback to noir/drama)
 * 2. Planned script entries vs ordered scenes (prevents unauthorized scene substitution)
 * 3. Storyboard causal chain completeness (whatHappenedBefore / Now / Changes / TriggersNext / Objective)
 * 4. Rendered scene action & keyword coherence (prevents invented unrequested motifs)
 */
export function validateScriptFidelity(project: ProjectPlan): { score: number; issues: ValidationIssue[] } {
  const issues: ValidationIssue[] = [];
  const scenes = project.scenes ?? [];
  const script = project.script ?? [];

  if (scenes.length === 0) {
    return {
      score: 0,
      issues: [{ severity: 'error', code: 'SCRIPT_NO_SCENES', message: 'Nenhuma cena renderizável vinculada ao roteiro.' }],
    };
  }

  // Stage 1: Prompt-to-Genre fidelity check (prevents psychological horror drifting into noir/journalist!)
  const promptLower = (project.prompt ?? '').toLowerCase();
  const promptSignalsHorror =
    /(terror|horror|psicol[oó]gic|medo|paranoi|alucina|espelho|reflexo|vitrine|sombra|vulto|silhueta|assombra|abandonad|fantasma|sangue|suspense|pesadelo|p[aâ]nico|arrepio|criatura|monstro|sussurr|persegui|m[aã]o\s+sai|luz\s+apag|corredor\s+escuro)/.test(
      promptLower
    );
  const promptSignalsJournalistNoir = /(jornalista|investigativ|dossi[eê]|reportagem|noir|detetive)/.test(promptLower);

  const isRetroEducational =
    project.visualStyle === 'retro_pixel_educational' || project.genre === 'educational';

  if (promptSignalsHorror && !promptSignalsJournalistNoir && !isRetroEducational && project.genre !== 'horror') {
    issues.push({
      severity: 'error',
      code: 'GENRE_DRIFT',
      message: `Falha de fidelidade ao prompt: o prompt indica terror/suspense psicológico, mas o projeto foi classificado como "${project.genre}".`,
    });
  }

  // Detect unauthorized noir/journalist injection into non-journalist prompts
  if (!promptSignalsJournalistNoir) {
    const combinedProjectText = `${project.title} ${scenes.map((s) => `${s.title} ${s.summary} ${s.captionText}`).join(' ')}`.toLowerCase();
    const hasInjectedJournalist =
      project.characterBible.some((c) => /jornalista/i.test(c.role) && project.genre === 'horror') ||
      /\bjornalista\b/.test(combinedProjectText);
    if (hasInjectedJournalist) {
      issues.push({
        severity: 'error',
        code: 'UNAUTHORIZED_NARRATIVE_INJECTION',
        message: 'Falha de fidelidade: elementos de narrativa noir/jornalista foram injetados sem estarem no prompt original.',
      });
    }
  }

  let matchedCount = 0;

  if (script.length !== scenes.length) {
    issues.push({
      severity: 'error',
      code: 'SCRIPT_LENGTH_MISMATCH',
      message: `Descompasso entre roteiro (${script.length} entradas) e cenas planejadas (${scenes.length} cenas).`,
    });
  }

  for (let i = 0; i < scenes.length; i++) {
    const sc = scenes[i];
    const scr = script[i];

    if (sc.index !== i) {
      issues.push({
        severity: 'error',
        code: 'SCENE_ORDER_CORRUPT',
        sceneIndex: i,
        message: `Cena na posição ${i + 1} possui índice fora de ordem (${sc.index + 1}).`,
      });
    }

    if (!scr || scr.sceneIndex !== i) {
      issues.push({
        severity: 'error',
        code: 'SCRIPT_ORDER_MISMATCH',
        sceneIndex: i,
        message: `Cena ${i + 1} (${sc.title}) não corresponde à posição ${i + 1} do roteiro.`,
      });
      continue;
    }

    // Stage 3: Storyboard causal chain completeness
    if (sc.causalChain) {
      const c = sc.causalChain;
      if (
        !c.whatHappenedBefore.trim() ||
        !c.whatHappensNow.trim() ||
        !c.whatChanges.trim() ||
        !c.howItTriggersNext.trim() ||
        !c.narrativeObjective.trim()
      ) {
        issues.push({
          severity: 'warning',
          code: 'INCOMPLETE_CAUSAL_CHAIN',
          sceneIndex: i,
          message: `Cena ${i + 1} (${sc.title}) possui cadeia causal incompleta no storyboard.`,
        });
      }
    } else {
      issues.push({
        severity: 'warning',
        code: 'MISSING_CAUSAL_CHAIN',
        sceneIndex: i,
        message: `Cena ${i + 1} (${sc.title}) não define relação de causa e consequência entre cenas.`,
      });
    }

    const combinedSceneText = `${sc.title} ${sc.summary} ${sc.sourceBeat ?? ''} ${sc.visualPrompt}`.toLowerCase();
    const normalizedCombined = combinedSceneText.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const keywords = sc.expectedKeywords ?? [];
    const missingKeywords = keywords.filter((kw) => kw.length > 2 && !normalizedCombined.includes(kw.toLowerCase()));

    const actionMatches =
      scr.action.trim().length > 0 &&
      (combinedSceneText.includes(scr.action.slice(0, 20).toLowerCase()) ||
        scr.heading.toLowerCase().includes(sc.title.slice(0, 16).toLowerCase()));

    if (!actionMatches || missingKeywords.length > Math.max(1, Math.floor(keywords.length * 0.5))) {
      issues.push({
        severity: 'warning',
        code: 'SCRIPT_SCENE_DRIFT',
        sceneIndex: i,
        message: `Cena ${i + 1} (${sc.title}) diverge parcialmente da ação planejada no roteiro${missingKeywords.length ? ` (ausente: ${missingKeywords.join(', ')})` : ''}.`,
      });
    } else {
      matchedCount++;
    }
  }

  const fatalPenalties = issues.filter((i) => i.code === 'GENRE_DRIFT' || i.code === 'UNAUTHORIZED_NARRATIVE_INJECTION').length;
  const rawScore = Math.round((matchedCount / Math.max(1, scenes.length)) * 100);
  const score = Math.max(0, rawScore - fatalPenalties * 40);
  return { score, issues };
}

/**
 * Validates that every character in characterBible retains locked colors, clothes, and proportions
 * against its persistent CharacterVisualSheet (detects unexpected appearance drift).
 */
export function validateCharacterVisualSheets(project: ProjectPlan): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  for (const ch of project.characterBible ?? []) {
    if (!ch.visualSheet) {
      issues.push({
        severity: 'warning',
        code: 'MISSING_VISUAL_SHEET',
        message: `Personagem "${ch.name}" sem ficha visual persistente travada.`,
      });
      continue;
    }
    const currentHash = computeVisualSheetHash(ch);
    if (
      ch.visualSheet.lockedOutfitStyle !== ch.outfitStyle ||
      ch.visualSheet.lockedHairStyle !== ch.hairStyle ||
      ch.visualSheet.lockedPalette.outfitPrimary !== ch.palette.outfitPrimary ||
      ch.visualSheet.lockedPalette.skin !== ch.palette.skin ||
      ch.visualSheet.signatureHash !== currentHash
    ) {
      issues.push({
        severity: 'error',
        code: 'APPEARANCE_DRIFT',
        message: `Personagem "${ch.name}" sofreu alteração inesperada de aparência/roupa/paleta em relação à ficha visual persistente.`,
      });
    }
  }
  return issues;
}

/**
 * Shared strict Contract v1.0 schema validator (mirrored identically in Python validate_plan.py)
 */
export function validateContractV1(candidate: unknown): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!candidate || typeof candidate !== 'object') {
    return [{ severity: 'error', code: 'INVALID_ROOT', message: 'O plano JSON deve ser um objeto válido.' }];
  }

  const obj = candidate as Record<string, unknown>;

  if (obj.schemaVersion !== PROJECT_SCHEMA_VERSION) {
    issues.push({
      severity: 'warning',
      code: 'SCHEMA_VERSION_MISMATCH',
      message: `Versão de contrato esperada "${PROJECT_SCHEMA_VERSION}", recebida "${String(obj.schemaVersion ?? 'ausente')}". Normalização automática aplicada.`,
    });
  }

  if (typeof obj.title !== 'string' || !obj.title.trim()) {
    issues.push({ severity: 'error', code: 'MISSING_TITLE', message: 'Campo obrigatório "title" ausente ou vazio.' });
  }

  if (!Array.isArray(obj.scenes) || obj.scenes.length === 0) {
    issues.push({ severity: 'error', code: 'MISSING_SCENES', message: 'Campo obrigatório "scenes" deve conter ao menos 1 cena.' });
  }

  const fmt = obj.format as Record<string, unknown> | undefined;
  if (!fmt || typeof fmt !== 'object') {
    issues.push({ severity: 'error', code: 'MISSING_FORMAT', message: 'Bloco obrigatório "format" (resolução/aspectRatio/fps) ausente.' });
  } else {
    if (!['9:16', '16:9', '1:1'].includes(String(fmt.aspectRatio))) {
      issues.push({ severity: 'error', code: 'INVALID_ASPECT', message: `Proporção inválida: ${String(fmt.aspectRatio)}.` });
    }
    if (![12, 24, 30, 60].includes(Number(fmt.fps))) {
      issues.push({ severity: 'error', code: 'INVALID_FPS', message: `FPS inválido: ${String(fmt.fps)}. Use 12, 24, 30 ou 60.` });
    }
  }

  if (!obj.audio || typeof obj.audio !== 'object') {
    issues.push({ severity: 'error', code: 'MISSING_AUDIO', message: 'Bloco obrigatório "audio" ausente no contrato.' });
  }

  if (!obj.captions || typeof obj.captions !== 'object') {
    issues.push({ severity: 'error', code: 'MISSING_CAPTIONS', message: 'Bloco obrigatório "captions" ausente no contrato.' });
  }

  return issues;
}

export function parseAndValidateProjectJson(jsonText: string): {
  project: ProjectPlan | null;
  issues: ValidationIssue[];
} {
  try {
    const raw = JSON.parse(jsonText) as Partial<ProjectPlan>;
    const issues = validateContractV1(raw);
    const fatal = issues.filter((i) => i.severity === 'error');
    if (fatal.length > 0) {
      return { project: null, issues };
    }
    return { project: normalizeToContractV1(raw), issues };
  } catch (err) {
    return {
      project: null,
      issues: [
        {
          severity: 'error',
          code: 'JSON_SYNTAX_ERROR',
          message: err instanceof Error ? `Erro de sintaxe JSON: ${err.message}` : 'Arquivo JSON inválido.',
        },
      ],
    };
  }
}
