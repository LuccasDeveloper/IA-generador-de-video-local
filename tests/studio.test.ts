import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  detectGenre,
  extractCaptionEmphasisWords,
  generateProjectPlan,
  interpretPromptOffline,
  parseOrderedScriptBeats,
  sanitizeNaturalCaption,
} from '../src/engines/promptEngine.ts';
import { runQualityAssurance, validateContinuity, validateProjectPlan } from '../src/engines/qaAndValidation.ts';
import {
  buildSceneWordTimings,
  generateASS,
  generateSRT,
  getMaxCharsPerLine,
  validateCaptionsCoherence,
  wrapBalancedLines,
} from '../src/engines/captionsEngine.ts';
import { resolveDimensions, STARTER_CHARACTERS, STARTER_SCENARIOS } from '../src/data/presets.ts';
import {
  applyEasing,
  computeBiomechanicalPose,
  resolveActorStateAtProgress,
  validatePoseAnatomicalBounds,
} from '../src/engines/characterRenderer.ts';
import {
  buildSkillAuditMatrix,
  EXPECTED_SKILL_SCRIPTS,
  parseAndValidateProjectJson,
  PROJECT_SCHEMA_VERSION,
  validateCharacterVisualSheets,
  validateContractV1,
  validateScriptFidelity,
} from '../src/contracts/projectContract.ts';
import { renderProjectToWavBase64 } from '../src/engines/audioEngine.ts';
import { loadSavedProjects } from '../src/engines/storage.ts';
import {
  applyLearnedRulesAndAutoRepair,
  createEmptyMemoryState,
  mergeMemoryStates,
  recallSimilarPastVideos,
  recordUserErrorFeedback,
  recordVideoOutcome,
  toggleLearnedRule,
} from '../src/engines/learningMemory.ts';

async function runTests() {
  // 1. Prompt interpretation & exact chronological script beat extraction (Fix #1)
  const horrorPrompt =
    'Crie uma animação 2D de terror sobre um homem que entra em uma casa abandonada. Ele escuta passos no andar de cima, encontra uma porta entreaberta e percebe uma sombra atrás dele. Duração de 30 segundos, sem narração, com efeitos sonoros cinematográficos.';
  const intent = interpretPromptOffline(horrorPrompt);
  assert.equal(intent.genre, 'horror');
  assert.equal(intent.durationSec, 30);
  assert.equal(intent.noNarration, true);
  assert.equal(intent.hasShadowEntity, true);
  assert.equal(intent.hasDoor, true);

  const beats = parseOrderedScriptBeats(horrorPrompt);
  assert.ok(beats.length >= 4, `Expected >=4 ordered beats from prompt, got ${beats.length}: ${JSON.stringify(beats)}`);
  assert.ok(/casa abandonada|entra/i.test(beats[0]), `Beat 1 must preserve entrance: "${beats[0]}"`);
  assert.ok(/passos|andar de cima/i.test(beats[1]), `Beat 2 must preserve upstairs footsteps: "${beats[1]}"`);
  assert.ok(/porta entreaberta/i.test(beats[2]), `Beat 3 must preserve ajar door: "${beats[2]}"`);
  assert.ok(/sombra/i.test(beats[3]), `Beat 4 must preserve shadow behind him: "${beats[3]}"`);

  // 2. Full structured ProjectPlan JSON generation (Contract v1.0) & 100% Script Fidelity
  const plan = await generateProjectPlan({
    prompt: horrorPrompt,
    aspectRatio: '9:16',
    durationSec: 30,
    fps: 24,
    performanceProfile: 'equilibrado',
    narrationMode: 'none',
    availableCharacters: STARTER_CHARACTERS,
    availableScenarios: STARTER_SCENARIOS,
  });

  assert.equal(plan.schemaVersion, PROJECT_SCHEMA_VERSION);
  assert.equal(plan.format.renderer, 'ffmpeg_mp4');
  assert.equal(plan.engineUsed, 'offline_rules');
  assert.equal(plan.scenes.length, 5);
  assert.equal(Math.round(plan.totalDuration), 30);
  assert.ok(plan.characterBible.length >= 2);
  assert.equal(plan.captions.enabled, false);

  const fidelity = validateScriptFidelity(plan);
  assert.equal(fidelity.score, 100, `Script fidelity must be 100%, got ${fidelity.score}% (${JSON.stringify(fidelity.issues)})`);
  assert.equal(fidelity.issues.filter((i) => i.severity === 'error').length, 0);

  // 3. Persistent Character Visual Sheets & Drift Detection (Architecture + QA)
  assert.ok(
    plan.characterBible.every((c) => Boolean(c.visualSheet?.signatureHash && c.visualSheet?.lockedPalette)),
    'Every character in characterBible must have a locked persistent visualSheet'
  );
  assert.equal(validateCharacterVisualSheets(plan).length, 0);

  // Simulate unexpected appearance drift (changing outfit color without updating sheet)
  const driftedPlan = structuredClone(plan);
  driftedPlan.characterBible[0].palette.outfitPrimary = '#ff00ff';
  const driftIssues = validateCharacterVisualSheets(driftedPlan);
  assert.ok(
    driftIssues.some((i) => i.code === 'APPEARANCE_DRIFT'),
    'QA must catch unexpected character appearance/palette drift'
  );

  // 4. Multi-phase Character Choreography & Biomechanical 4-Phase Walk Weight/Ankle Physics (Fixes #2 & #3)
  assert.ok(
    plan.scenes.every((sc) => (sc.actors[0]?.actionPhases?.length ?? 0) >= 2),
    'Every generated scene must include multi-phase choreography for its protagonist'
  );

  const walkSamples = [0.0, 0.15, 0.3, 0.45, 0.6].map((t) =>
    computeBiomechanicalPose('walk', t, false, { strideSpeedFactor: 1.0 })
  );
  const hipValues = walkSamples.map((p) => p.hipY);
  const ankleValues = walkSamples.map((p) => p.leftFootAngle);
  assert.ok(Math.max(...hipValues) - Math.min(...hipValues) > 6, 'Walk cycle must show clear vertical weight drop/lift');
  assert.ok(Math.max(...ankleValues) - Math.min(...ankleValues) > 0.25, 'Walk cycle must articulate ankle heel-strike / toe-off');

  const scene2Actor = plan.scenes[1].actors[0];
  const earlyPhase = resolveActorStateAtProgress(scene2Actor, 0.05);
  const midPhase = resolveActorStateAtProgress(scene2Actor, 0.4);
  assert.notEqual(
    `${earlyPhase.state}:${earlyPhase.lookDirection}`,
    `${midPhase.state}:${midPhase.lookDirection}`,
    'Scene 2 protagonist must transition pose/look direction when hearing upstairs footsteps'
  );

  // 5. Dynamic Non-Static Cameras, Clean Lighting/FX Caps, Zero Glitch/Scanlines (Fixes #4, #5, #8)
  for (let i = 0; i < plan.scenes.length; i++) {
    const curr = plan.scenes[i];
    assert.notEqual(curr.cameraMove, 'static', `Scene ${i + 1} must not have a static dead camera`);
    assert.equal(curr.effects.glitch, 0, `Scene ${i + 1} must not emit artificial glitch bars by default`);
    assert.equal(curr.effects.scanlines, 0, `Scene ${i + 1} must not emit artificial scanlines by default`);
    assert.notEqual(curr.transitionIn, 'glitch_cut', `Scene ${i + 1} must not use glitch_cut horizontal bars`);
    assert.ok(
      curr.effects.fog + curr.effects.smoke <= 0.45,
      `Scene ${i + 1} fog+smoke must stay below overwash threshold (got ${curr.effects.fog + curr.effects.smoke})`
    );
    assert.ok(
      (curr.lighting.volumetricIntensity ?? 0) <= 0.25 && curr.lighting.bloomIntensity <= 0.25,
      `Scene ${i + 1} volumetric lighting/bloom must stay restrained`
    );

    if (i > 0) {
      const prev = plan.scenes[i - 1];
      assert.notEqual(
        `${prev.framing}:${prev.cameraMove}`,
        `${curr.framing}:${curr.cameraMove}`,
        `Scene ${i + 1} repeated camera direction from previous scene`
      );
      if (prev.scenarioId !== curr.scenarioId) {
        assert.notEqual(
          curr.transitionIn,
          'cut',
          `Scene ${i + 1} changed scenario without smooth transition`
        );
      }
    }
  }

  // 6. Narrative Creature Preparation (Foreshadowing -> Emergence) & High-Impact Ending (Fixes #7, #9, #10)
  const emergeSceneIdx = plan.scenes.findIndex((sc) =>
    sc.actors.some((a) => a.revealMode === 'emerge')
  );
  assert.ok(emergeSceneIdx >= 1, 'Creature reveal must use progressive emerge staging');
  assert.ok(
    plan.scenes[emergeSceneIdx - 1].actors.some((a) => a.revealMode === 'foreshadow'),
    'Preceding scene must prepare the creature appearance with subtle foreshadowing'
  );

  const lastScene = plan.scenes[plan.scenes.length - 1];
  assert.equal(lastScene.narrativeIntent, 'encerramento');
  assert.ok(
    lastScene.endingImpact && lastScene.endingImpact !== 'none',
    'Final scene must configure a high-impact visual ending beat'
  );

  // 7. Continuity & Full 10-Point QA Gate (passing clean plan + catching corrupted plan)
  assert.equal(validateContinuity(plan).filter((i) => i.severity !== 'info').length, 0);
  const qaClean = runQualityAssurance(plan, STARTER_CHARACTERS, STARTER_SCENARIOS);
  assert.equal(qaClean.passed, true, `Clean plan must pass QA, got issues: ${JSON.stringify(qaClean.issues)}`);
  assert.equal(qaClean.checks.length, 10, 'QA must report all 10 mandatory quality categories');
  assert.equal(qaClean.metrics.scriptFidelityScore, 100);

  // Corrupt plan with glitch + excessive fog + abrupt scenario cut + frozen character -> QA must flag all
  const badPlan = structuredClone(plan);
  badPlan.scenes[2].effects.glitch = 0.6;
  badPlan.scenes[2].effects.fog = 0.7;
  badPlan.scenes[2].transitionIn = 'cut';
  badPlan.scenes[2].scenarioId = STARTER_SCENARIOS[2].id; // different from scene[1]
  badPlan.scenes[1].actors[0].state = 'idle';
  badPlan.scenes[1].actors[0].nextState = 'idle';
  badPlan.scenes[1].actors[0].actionPhases = undefined;
  badPlan.scenes[1].actors[0].targetX = badPlan.scenes[1].actors[0].x;
  const badIssues = validateProjectPlan(badPlan, STARTER_CHARACTERS, STARTER_SCENARIOS);
  assert.ok(badIssues.some((i) => i.code === 'EXCESSIVE_GLITCH'));
  assert.ok(badIssues.some((i) => i.code === 'EXCESSIVE_VOLUMETRIC_FX'));
  assert.ok(badIssues.some((i) => i.code === 'ABRUPT_SCENARIO_CUT'));
  assert.ok(badIssues.some((i) => i.code === 'FROZEN_CHARACTER'));

  // 8. Shared Contract v1.0 strict validation & round-trip JSON test
  const contractIssues = validateContractV1(plan);
  assert.equal(contractIssues.length, 0);

  const roundTrip = parseAndValidateProjectJson(JSON.stringify(plan));
  assert.ok(roundTrip.project);
  assert.equal(roundTrip.project.schemaVersion, '1.0.0');

  const broken = parseAndValidateProjectJson(JSON.stringify({ title: '', scenes: [] }));
  assert.equal(broken.project, null);
  assert.ok(broken.issues.some((i) => i.code === 'MISSING_TITLE'));
  assert.ok(broken.issues.some((i) => i.code === 'MISSING_SCENES'));

  // 9. Explicit numbered script prompt order fidelity test (custom user script)
  const numberedScriptPrompt = `
    Cena 1: Uma jornalista caminha sob garoa em um beco vazio.
    Cena 2: Ela conversa sob o poste analisando documentos.
    Cena 3: Ela corre pela rua quando ouve passos atrás dela.
    Cena 4: No desfecho, ela chega à saída iluminada da cidade.
    Duração de 24 segundos, formato 9:16.
  `;
  const numberedPlan = await generateProjectPlan({
    prompt: numberedScriptPrompt,
    aspectRatio: '9:16',
    durationSec: 24,
    fps: 24,
    performanceProfile: 'equilibrado',
    narrationMode: 'web_speech',
    availableCharacters: STARTER_CHARACTERS,
    availableScenarios: STARTER_SCENARIOS,
  });
  assert.equal(numberedPlan.scenes.length, 4, 'Numbered 4-scene script must produce exactly 4 scenes in order');
  assert.ok(/beco|garoa/i.test(numberedPlan.scenes[0].sourceBeat ?? ''));
  assert.ok(/conversa|poste/i.test(numberedPlan.scenes[1].sourceBeat ?? ''));
  assert.ok(/corre|passos/i.test(numberedPlan.scenes[2].sourceBeat ?? ''));
  assert.ok(/desfecho|sa[ií]da/i.test(numberedPlan.scenes[3].sourceBeat ?? ''));
  assert.equal(validateScriptFidelity(numberedPlan).score, 100);

  // 10. Original Skill 10-module audit & divergence registry completeness
  const auditAllMissing = buildSkillAuditMatrix([...EXPECTED_SKILL_SCRIPTS]);
  assert.equal(auditAllMissing.length, 10);
  assert.ok(auditAllMissing.every((m) => m.status === 'substitute_documented' && m.functionalDifferences.length > 10));

  // 11. Captions generation (ASS + SRT parity) + Stereo WAV offline synthesis for FFmpeg
  const srt = generateSRT(numberedPlan);
  const ass = generateASS(numberedPlan, 1080, 1920);
  assert.ok(srt.includes('-->'));
  assert.ok(ass.includes('[V4+ Styles]') && ass.includes('{\\kf'));

  const wavBase64 = renderProjectToWavBase64(numberedPlan);
  const wavBuf = Buffer.from(wavBase64, 'base64');
  assert.equal(wavBuf.subarray(0, 4).toString('ascii'), 'RIFF');
  assert.equal(wavBuf.subarray(8, 12).toString('ascii'), 'WAVE');

  // 12. Resolution presets, easing math & host FFmpeg + ffprobe verification
  assert.deepEqual(resolveDimensions('9:16', '540p'), { width: 540, height: 960 });
  assert.deepEqual(resolveDimensions('9:16', '1080p'), { width: 1080, height: 1920 });
  assert.deepEqual(resolveDimensions('16:9', '1080p'), { width: 1920, height: 1080 });
  assert.deepEqual(resolveDimensions('1:1', '720p'), { width: 720, height: 720 });
  assert.equal(applyEasing(0, 'ease_in_out'), 0);
  assert.equal(applyEasing(1, 'ease_in_out'), 1);

  const encoders = execFileSync('ffmpeg', ['-hide_banner', '-encoders'], { encoding: 'utf-8' });
  assert.ok(/\blibx264\b/.test(encoders), 'Host FFmpeg should provide libx264');
  assert.ok(/\baac\b/.test(encoders), 'Host FFmpeg should provide aac');
  const probeVer = execFileSync('ffprobe', ['-version'], { encoding: 'utf-8' });
  assert.ok(probeVer.includes('ffprobe'), 'Host ffprobe must be available for post-render QA');

  // 13. Mandatory 6-scene timestamped 30s vertical horror Short validation (exact durations, vitrine reflections, cut_to_black)
  const validationShortPrompt = `Short de terror 2D com 30 segundos, formato vertical 9:16, sem narração, com efeitos sonoros cinematográficos.
1. 0–5s: personagem caminhando sozinho em uma rua escura durante a chuva.
2. 5–10s: câmera acompanha o personagem; uma silhueta aparece ao fundo.
3. 10–16s: personagem observa uma vitrine; seu reflexo mostra uma figura atrás dele.
4. 16–22s: a figura desaparece e uma sombra começa a persegui-lo.
5. 22–27s: o personagem para; seu reflexo começa a sorrir sozinho.
6. 27–30s: uma mão sai do vidro, agarra o personagem e a tela corta para preto.`;

  const shortPlan = await generateProjectPlan({
    prompt: validationShortPrompt,
    aspectRatio: '9:16',
    durationSec: 30,
    fps: 24,
    performanceProfile: 'equilibrado',
    narrationMode: 'none',
    availableCharacters: STARTER_CHARACTERS,
    availableScenarios: STARTER_SCENARIOS,
  });

  assert.equal(shortPlan.scenes.length, 6, 'Validation Short must generate exactly 6 scenes (ignoring preamble)');
  assert.deepEqual(
    shortPlan.scenes.map((s) => s.duration),
    [5, 5, 6, 6, 5, 3],
    'Explicit timestamps must map to exact durations [5, 5, 6, 6, 5, 3]'
  );
  assert.equal(shortPlan.totalDuration, 30);
  assert.ok(
    shortPlan.scenes.every((s) => s.scenarioId === 'scene_dark_rain_street'),
    'All 6 rainy street/vitrine scenes must select scene_dark_rain_street'
  );
  assert.equal(shortPlan.scenes[2].reflectionMode, 'figure_behind');
  assert.equal(shortPlan.scenes[4].reflectionMode, 'autonomous_smile');
  assert.equal(shortPlan.scenes[5].reflectionMode, 'hand_grab');
  assert.equal(shortPlan.scenes[5].endingImpact, 'cut_to_black');
  assert.equal(validateScriptFidelity(shortPlan).score, 100);
  assert.equal(runQualityAssurance(shortPlan, STARTER_CHARACTERS, STARTER_SCENARIOS).passed, true);

  // 14. Anti-Genre-Drift & Anti-Noir-Injection test (psychological horror WITHOUT literal word "terror")
  const psychPromptWithoutTerrorWord = `Curta psicológico vertical 9:16 de 30 segundos, sem narração.
1. 0–5s: um homem caminha sozinho no beco escuro sob a chuva tentando voltar para casa.
2. 5–10s: ele ouve passos idênticos aos seus pararem atrasados quando ele para.
3. 10–16s: ele olha para a vitrine molhada e percebe seu reflexo virando a cabeça sozinho.
4. 16–22s: uma figura indistinta surge atrás dele no vidro e some quando ele olha para trás.
5. 22–27s: o reflexo na vitrine sorri sozinho enquanto ele recua em pânico.
6. 27–30s: uma mão sai do vidro, agarra seu ombro e a tela corta para preto.`;

  assert.equal(detectGenre(psychPromptWithoutTerrorWord), 'horror', 'Psychological horror mentioning "beco" must NEVER fall back to drama/noir');
  const psychPlan = await generateProjectPlan({
    prompt: psychPromptWithoutTerrorWord,
    aspectRatio: '9:16',
    durationSec: 30,
    fps: 24,
    performanceProfile: 'equilibrado',
    narrationMode: 'none',
    availableCharacters: STARTER_CHARACTERS,
    availableScenarios: STARTER_SCENARIOS,
  });
  assert.equal(psychPlan.genre, 'horror');
  assert.notEqual(psychPlan.title, 'Sombras da Meia-Noite', 'Horror prompt with "beco" must NOT be hijacked into noir title');
  assert.ok(
    psychPlan.characterBible.every((c) => !/jornalista/i.test(c.role)),
    'Horror prompt must NEVER cast Helena Costa / journalist'
  );
  assert.equal(validateScriptFidelity(psychPlan).score, 100);

  // Tamper genre & inject journalist -> 4-stage fidelity validator MUST reject
  const driftedGenrePlan = structuredClone(psychPlan);
  driftedGenrePlan.genre = 'drama';
  const genreDriftFidelity = validateScriptFidelity(driftedGenrePlan);
  assert.ok(genreDriftFidelity.issues.some((i) => i.code === 'GENRE_DRIFT'));
  assert.ok(genreDriftFidelity.score < 70);

  // 15. Causal Storyboard Chain & Persistent Character Continuity Ledger
  assert.ok(
    psychPlan.scenes.every(
      (sc) =>
        Boolean(sc.causalChain?.whatHappenedBefore) &&
        Boolean(sc.causalChain?.whatHappensNow) &&
        Boolean(sc.causalChain?.whatChanges) &&
        Boolean(sc.causalChain?.howItTriggersNext) &&
        Boolean(sc.causalChain?.narrativeObjective) &&
        Boolean(sc.cameraMotivation)
    ),
    'Every scene must define all 4 causal storyboard answers and explicit cameraMotivation'
  );
  assert.ok(
    (psychPlan.continuityLedger?.length ?? 0) >= 1 &&
      psychPlan.continuityLedger![0].actionHistory.length === psychPlan.scenes.length,
    'continuityLedger must record protagonist action history across all scenes'
  );
  const distinctFramings = new Set(psychPlan.scenes.map((s) => s.framing));
  assert.ok(distinctFramings.size >= 4, `Expected >=4 distinct framing scales for cinematic variety, got ${Array.from(distinctFramings).join(', ')}`);

  // 16. Anatomical Pose Bounds Check (all normal poses valid; impossible pose rejected)
  const allStates = ['idle', 'walk', 'run', 'sprint', 'jump', 'fall', 'attack', 'hit', 'death', 'talk', 'custom'] as const;
  for (const st of allStates) {
    const pose = computeBiomechanicalPose(st, 0.45, false);
    assert.equal(validatePoseAnatomicalBounds(pose).valid, true, `Standard pose "${st}" must stay within anatomical bounds`);
  }
  const brokenPose = computeBiomechanicalPose('walk', 0.2, false);
  brokenPose.leftLegLower = -1.2; // impossible backward knee hyperextension
  assert.equal(validatePoseAnatomicalBounds(brokenPose).valid, false, 'Impossible knee hyperextension must be rejected');

  // 17. Natural PT-BR Captions Sanitization, Balanced Wrapping & Emphasis Discipline
  const sanitized = sanitizeNaturalCaption('câmera acompanha o personagem; uma silhueta aparece ao fundo e a tela corta para preto.');
  assert.ok(!/c[aâ]mera/i.test(sanitized), `Sanitized caption must strip technical camera directions: "${sanitized}"`);
  assert.ok(!/corta para preto/i.test(sanitized), `Sanitized caption must strip editing cues: "${sanitized}"`);
  assert.ok(/silhueta aparece ao fundo/i.test(sanitized));

  const emphasis = extractCaptionEmphasisWords('Uma silhueta sombria aparece ao fundo da rua.');
  assert.ok(emphasis.length >= 1 && emphasis.length <= 2);
  assert.ok(!emphasis.includes('uma') && !emphasis.includes('ao') && !emphasis.includes('da'));

  const sampleSceneForWrap = structuredClone(shortPlan.scenes[2]);
  sampleSceneForWrap.captionText = 'Ele observa o reflexo na vitrine e vê uma figura parada atrás dele.';
  const timings = buildSceneWordTimings(sampleSceneForWrap, 0);
  const maxVerticalChars = getMaxCharsPerLine('9:16');
  const wrapped = wrapBalancedLines(timings, maxVerticalChars);
  assert.ok(wrapped.length >= 2);
  for (const line of wrapped) {
    const str = line.map((w) => w.word).join(' ');
    assert.ok(str.length <= maxVerticalChars + 2, `Wrapped line exceeds vertical limit (${str.length}): "${str}"`);
  }

  // 18. 9-Point Visual & Narrative QA Gate catches duplicate actors, prop collisions, unmotivated cameras, repetitive motion & caption leaks
  const qaCorrupt = structuredClone(psychPlan);
  qaCorrupt.captions.enabled = true;
  qaCorrupt.scenes[0].actors.push({ ...qaCorrupt.scenes[0].actors[0], id: 'actor_dup' }); // duplicate actor
  qaCorrupt.scenes[1].cameraMotivation = ''; // unmotivated camera
  qaCorrupt.scenes[2].captionText = 'Câmera acompanha um astronauta marciano em Marte.'; // stage direction + mismatch
  qaCorrupt.scenes[0].framing = 'medium';
  qaCorrupt.scenes[1].framing = 'medium';
  qaCorrupt.scenes[2].framing = 'medium';
  qaCorrupt.scenes[3].framing = 'medium';
  qaCorrupt.scenes[4].framing = 'medium';
  qaCorrupt.scenes[5].framing = 'medium';
  qaCorrupt.scenes[0].actors[0].actionPhases = undefined;
  qaCorrupt.scenes[1].actors[0].actionPhases = undefined;
  qaCorrupt.scenes[2].actors[0].actionPhases = undefined;
  qaCorrupt.scenes[0].actors[0].state = 'walk';
  qaCorrupt.scenes[0].actors[0].nextState = 'walk';
  qaCorrupt.scenes[1].actors[0].state = 'walk';
  qaCorrupt.scenes[1].actors[0].nextState = 'walk';
  qaCorrupt.scenes[2].actors[0].state = 'walk';
  qaCorrupt.scenes[2].actors[0].nextState = 'walk';

  const corruptIssues = validateProjectPlan(qaCorrupt, STARTER_CHARACTERS, STARTER_SCENARIOS);
  assert.ok(corruptIssues.some((i) => i.code === 'DUPLICATE_ACTOR_ID'), 'QA must detect duplicate actor IDs in same scene');
  assert.ok(corruptIssues.some((i) => i.code === 'UNMOTIVATED_CAMERA'), 'QA must detect unmotivated cameras');
  assert.ok(corruptIssues.some((i) => i.code === 'FLAT_FRAMING_VARIETY'), 'QA must detect flat identical framing across project');
  assert.ok(corruptIssues.some((i) => i.code === 'REPETITIVE_MOTION'), 'QA must detect repetitive identical motion loops');
  assert.ok(
    validateCaptionsCoherence(qaCorrupt).some((i) => i.code === 'CAPTION_STAGE_DIRECTION_LEAK'),
    'Caption QA must catch camera stage directions leaked into captions'
  );
  assert.ok(
    validateCaptionsCoherence(qaCorrupt).some((i) => i.code === 'CAPTION_VISUAL_MISMATCH'),
    'Caption QA must catch captions inventing events absent from the scene'
  );

  // 19. Audited bug fixes verification (Node-safe storage, silent WAV no noise amplification, invalid scene duration QA)
  assert.deepEqual(loadSavedProjects(), [], 'loadSavedProjects must safely return [] in Node without localStorage');

  const silentPlan = structuredClone(shortPlan);
  silentPlan.audio.musicStyle = 'none';
  silentPlan.audio.musicVolume = 0;
  silentPlan.audio.sfxVolume = 0;
  for (const sc of silentPlan.scenes) sc.sfxEvents = [];
  const silentWavBuf = Buffer.from(renderProjectToWavBase64(silentPlan), 'base64');
  // PCM data starts at byte 44; silent track must not amplify floating noise
  let maxAbsSample = 0;
  for (let off = 44; off < Math.min(silentWavBuf.length, 44 + 8000); off += 2) {
    const sample = Math.abs(silentWavBuf.readInt16LE(off));
    if (sample > maxAbsSample) maxAbsSample = sample;
  }
  assert.ok(maxAbsSample < 50, `Silent WAV must remain quiet instead of amplifying noise (max sample=${maxAbsSample})`);

  const badDurationPlan = structuredClone(shortPlan);
  badDurationPlan.scenes[0].duration = 0;
  badDurationPlan.scenes[1].duration = Number.NaN;
  const durIssues = validateProjectPlan(badDurationPlan, STARTER_CHARACTERS, STARTER_SCENARIOS);
  assert.ok(
    durIssues.filter((i) => i.code === 'INVALID_SCENE_DURATION').length >= 2,
    'QA must catch zero and NaN scene durations'
  );

  // 20. Offline Past-Video Memory Recall & Anti-Repetition across Productions
  let memory = createEmptyMemoryState();
  memory = recordVideoOutcome(
    memory,
    psychPlan,
    runQualityAssurance(psychPlan, STARTER_CHARACTERS, STARTER_SCENARIOS),
    { postRenderPassed: true }
  );
  assert.equal(memory.videos.length, 1);

  const recalled = recallSimilarPastVideos(memory, 'horror', psychPromptWithoutTerrorWord);
  assert.equal(recalled.length, 1);
  assert.equal(recalled[0].title, psychPlan.title);

  const secondHorrorPlan = await generateProjectPlan({
    prompt: psychPromptWithoutTerrorWord,
    aspectRatio: '9:16',
    durationSec: 30,
    fps: 24,
    performanceProfile: 'equilibrado',
    narrationMode: 'none',
    availableCharacters: STARTER_CHARACTERS,
    availableScenarios: STARTER_SCENARIOS,
    memory,
  });
  assert.ok(
    (secondHorrorPlan.memoryContext?.recalledVideoTitles.length ?? 0) >= 1,
    'Second generation must recall similar past video from memory'
  );
  assert.ok(
    (secondHorrorPlan.memoryContext?.avoidedPatterns.length ?? 0) >= 1,
    'Second generation must actively avoid repeating exact framing sequence of remembered video'
  );
  assert.notEqual(
    secondHorrorPlan.scenes.map((s) => s.framing).join('|'),
    psychPlan.scenes.map((s) => s.framing).join('|'),
    'Framing sequence must vary compared to the remembered past video'
  );

  // 21. Teaching the System via Explicit Error Feedback -> Active Learned Rules -> Proactive Prevention & Memory Merge
  memory = recordUserErrorFeedback(
    memory,
    psychPlan.id,
    'POST_RENDER_BLACK_FRAMES',
    'Trecho ficou escuro demais no meio do vídeo'
  );
  memory = recordUserErrorFeedback(
    memory,
    psychPlan.id,
    'POST_RENDER_FREEZE_FRAMES',
    'Cena 2 pareceu quase congelada na câmera'
  );
  const blackRule = memory.rules.find((r) => r.errorCode === 'POST_RENDER_BLACK_FRAMES');
  const freezeRule = memory.rules.find((r) => r.errorCode === 'POST_RENDER_FREEZE_FRAMES');
  assert.ok(blackRule?.active && blackRule.occurrences >= 1);
  assert.ok(freezeRule?.active && freezeRule.occurrences >= 1);

  const preventedPlan = await generateProjectPlan({
    prompt: validationShortPrompt,
    aspectRatio: '9:16',
    durationSec: 30,
    fps: 24,
    performanceProfile: 'equilibrado',
    narrationMode: 'none',
    availableCharacters: STARTER_CHARACTERS,
    availableScenarios: STARTER_SCENARIOS,
    memory,
  });
  assert.ok(
    preventedPlan.scenes.every((s) => s.lighting.ambientIntensity >= 0.38),
    'Active POST_RENDER_BLACK_FRAMES learned rule must proactively lift ambientIntensity >= 0.38'
  );
  assert.ok(
    preventedPlan.scenes.every((s) => s.cameraIntensity >= 0.62),
    'Active POST_RENDER_FREEZE_FRAMES learned rule must proactively lift cameraIntensity >= 0.62'
  );
  assert.ok(
    (preventedPlan.memoryContext?.appliedRuleIds ?? []).includes('rule_post_render_black_frames'),
    'Project memoryContext must document applied learned rules'
  );

  const toggledMemory = toggleLearnedRule(memory, blackRule!.id);
  assert.equal(toggledMemory.rules.find((r) => r.id === blackRule!.id)?.active, false);

  const mergedMemory = mergeMemoryStates(createEmptyMemoryState(), memory);
  assert.equal(mergedMemory.videos.length, memory.videos.length);
  assert.equal(mergedMemory.rules.length, memory.rules.length);

  // 22. End-to-End Closed-Loop Self-Learning & Multi-Pass Auto-Repair (Corrupted Plan -> Repaired & QA Passed)
  const heavilyCorrupted = structuredClone(psychPlan);
  heavilyCorrupted.captions.enabled = true;
  heavilyCorrupted.characterBible[0].palette.outfitPrimary = '#ff00ff'; // APPEARANCE_DRIFT
  heavilyCorrupted.scenes[0].actors.push({ ...heavilyCorrupted.scenes[0].actors[0], id: 'dup_actor' }); // DUPLICATE_ACTOR_ID
  heavilyCorrupted.scenes[1].actors[0].x = 0.92; // SPATIAL_TELEPORT
  heavilyCorrupted.scenes[1].cameraMotivation = ''; // UNMOTIVATED_CAMERA
  heavilyCorrupted.scenes[1].actors[0].state = 'idle';
  heavilyCorrupted.scenes[1].actors[0].nextState = 'idle';
  heavilyCorrupted.scenes[1].actors[0].actionPhases = undefined;
  heavilyCorrupted.scenes[1].actors[0].targetX = heavilyCorrupted.scenes[1].actors[0].x; // FROZEN_CHARACTER
  heavilyCorrupted.scenes[2].effects.glitch = 0.65; // EXCESSIVE_GLITCH
  heavilyCorrupted.scenes[2].effects.fog = 0.72; // EXCESSIVE_VOLUMETRIC_FX
  heavilyCorrupted.scenes[2].scenarioId = STARTER_SCENARIOS[2].id;
  heavilyCorrupted.scenes[2].transitionIn = 'cut'; // ABRUPT_SCENARIO_CUT
  heavilyCorrupted.scenes[2].captionText = 'Câmera acompanha um astronauta marciano em Marte.'; // CAPTION_STAGE_DIRECTION_LEAK + CAPTION_VISUAL_MISMATCH
  heavilyCorrupted.scenes[3].causalChain = undefined; // MISSING_CAUSAL_CHAIN
  for (const sc of heavilyCorrupted.scenes) sc.framing = 'medium'; // FLAT_FRAMING_VARIETY

  const qaBeforeRepair = runQualityAssurance(heavilyCorrupted, STARTER_CHARACTERS, STARTER_SCENARIOS);
  assert.equal(qaBeforeRepair.passed, false, 'Heavily corrupted plan must initially fail QA');

  const repairResult = applyLearnedRulesAndAutoRepair(
    heavilyCorrupted,
    memory,
    STARTER_CHARACTERS,
    STARTER_SCENARIOS,
    3
  );
  const qaAfterRepair = runQualityAssurance(repairResult.project, STARTER_CHARACTERS, STARTER_SCENARIOS);

  assert.equal(
    qaAfterRepair.passed,
    true,
    `Closed-loop auto-repair must fix corrupted plan to pass QA. Remaining issues: ${JSON.stringify(
      qaAfterRepair.issues.filter((i) => i.severity === 'error')
    )}`
  );
  assert.ok(
    repairResult.autoFixesApplied.length >= 6,
    `Expected >= 6 real auto-fixes applied, got ${repairResult.autoFixesApplied.length}`
  );
  assert.ok(
    repairResult.updatedMemory.rules.some((r) => r.errorCode === 'EXCESSIVE_GLITCH') &&
      repairResult.updatedMemory.rules.some((r) => r.errorCode === 'DUPLICATE_ACTOR_ID'),
    'Auto-repair must persist newly encountered error codes as learned rules in memory'
  );

  // 23. RETRO PIXEL EDUCATIONAL — Brain Freeze Prompt (Verified Offline KB + 180x320 Grid + Infographics + Chiptune)
  const brainFreezePlan = await generateProjectPlan({
    prompt: 'Explique o que acontece no cérebro quando tomamos algo muito gelado',
    aspectRatio: '9:16',
    durationSec: 30,
    fps: 24,
    performanceProfile: 'equilibrado',
    narrationMode: 'none',
    visualStyle: 'retro_pixel_educational',
    availableCharacters: STARTER_CHARACTERS,
    availableScenarios: STARTER_SCENARIOS,
    useOllama: false,
    ollamaUrl: 'http://127.0.0.1:11434',
    ollamaModel: '',
  });
  assert.equal(brainFreezePlan.visualStyle, 'retro_pixel_educational');
  assert.equal(brainFreezePlan.genre, 'educational');
  assert.equal(brainFreezePlan.pixelConfig?.logicalWidth, 180);
  assert.equal(brainFreezePlan.pixelConfig?.logicalHeight, 320);
  assert.equal(brainFreezePlan.pixelConfig?.scalingMode, 'nearest');
  assert.equal(brainFreezePlan.audio.musicStyle, 'retro_chiptune');
  assert.equal(brainFreezePlan.educationalContext?.factSource, 'verified_offline_db');
  assert.equal(brainFreezePlan.educationalContext?.topicId, 'topic_brain_freeze');
  assert.ok((brainFreezePlan.educationalContext?.verifiedFacts.length ?? 0) >= 3);
  assert.ok(brainFreezePlan.scenes.length >= 5, `Expected >= 5 retro scenes, got ${brainFreezePlan.scenes.length}`);
  assert.ok(
    brainFreezePlan.scenes.some((s) => s.infographic?.kind === 'brain_nerve_freeze'),
    'Brain freeze plan must contain animated brain_nerve_freeze infographics'
  );
  const bfFidelity = validateScriptFidelity(brainFreezePlan);
  assert.ok(bfFidelity.score >= 85, `Expected Brain Freeze fidelity >= 85%, got ${bfFidelity.score}%`);
  const bfQa = runQualityAssurance(brainFreezePlan, STARTER_CHARACTERS, STARTER_SCENARIOS);
  assert.equal(
    bfQa.passed,
    true,
    `Brain Freeze Retro Pixel plan must pass QA cleanly. Issues: ${JSON.stringify(bfQa.issues.filter((i) => i.severity === 'error'))}`
  );

  // 24. RETRO PIXEL EDUCATIONAL — Red Blood Cells (No Horror GENRE_DRIFT on "sangue") & User-Supplied Custom Facts
  const bloodCellsPlan = await generateProjectPlan({
    prompt: 'Como nascem e morrem os glóbulos vermelhos no sangue humano?',
    aspectRatio: '9:16',
    durationSec: 28,
    fps: 24,
    performanceProfile: 'equilibrado',
    narrationMode: 'none',
    visualStyle: 'retro_pixel_educational',
    availableCharacters: STARTER_CHARACTERS,
    availableScenarios: STARTER_SCENARIOS,
    useOllama: false,
    ollamaUrl: 'http://127.0.0.1:11434',
    ollamaModel: '',
  });
  assert.equal(bloodCellsPlan.educationalContext?.topicId, 'topic_red_blood_cells');
  const bloodQa = runQualityAssurance(bloodCellsPlan, STARTER_CHARACTERS, STARTER_SCENARIOS);
  assert.ok(
    !bloodQa.issues.some((i) => i.code === 'GENRE_DRIFT'),
    'Educational topic mentioning "sangue" must NEVER trigger horror GENRE_DRIFT'
  );
  assert.equal(bloodQa.passed, true, 'Red Blood Cells retro educational plan must pass QA');

  const userFactsPlan = await generateProjectPlan({
    prompt: 'Explique a velocidade da luz do Sol até a Terra',
    aspectRatio: '16:9',
    durationSec: 24,
    fps: 24,
    performanceProfile: 'equilibrado',
    narrationMode: 'none',
    visualStyle: 'retro_pixel_educational',
    educationalFacts: [
      'A luz viaja a quase 300 mil km por segundo no vácuo.',
      'Os raios solares levam cerca de 8 minutos e 20 segundos para chegar à Terra.',
      'Sem essa energia luminosa, a fotossíntese e o clima terrestre não existiriam.',
    ].join('\n'),
    availableCharacters: STARTER_CHARACTERS,
    availableScenarios: STARTER_SCENARIOS,
    useOllama: false,
    ollamaUrl: 'http://127.0.0.1:11434',
    ollamaModel: '',
  });
  assert.equal(userFactsPlan.pixelConfig?.logicalWidth, 320);
  assert.equal(userFactsPlan.pixelConfig?.logicalHeight, 180);
  assert.equal(userFactsPlan.educationalContext?.factSource, 'user_supplied');
  assert.equal(userFactsPlan.educationalContext?.verifiedFacts.length, 3);
  const userFactsQa = runQualityAssurance(userFactsPlan, STARTER_CHARACTERS, STARTER_SCENARIOS);
  assert.equal(userFactsQa.passed, true, 'User-supplied facts retro educational plan must pass QA');

  // 25. Retro Chiptune + Arcade SFX Offline Stereo WAV Synthesis
  const chiptuneWavB64 = renderProjectToWavBase64(brainFreezePlan);
  const chiptuneBuf = Buffer.from(chiptuneWavB64, 'base64');
  assert.equal(chiptuneBuf.subarray(0, 4).toString('ascii'), 'RIFF');
  assert.equal(chiptuneBuf.subarray(8, 12).toString('ascii'), 'WAVE');
  let maxSample = 0;
  for (let off = 44; off < Math.min(chiptuneBuf.length - 2, 44 + 44100 * 4); off += 2) {
    const v = Math.abs(chiptuneBuf.readInt16LE(off));
    if (v > maxSample) maxSample = v;
  }
  assert.ok(maxSample > 1200, `Expected audible chiptune/arcade PCM amplitude, got ${maxSample}`);

  // 26. Retro Pixel QA Detection + Closed-Loop Self-Learning Auto-Repair
  const brokenRetro = structuredClone(brainFreezePlan);
  brokenRetro.pixelConfig = {
    logicalWidth: 40,
    logicalHeight: 40,
    ditherStrength: 0.72,
    scalingMode: 'nearest',
    paletteName: 'arcade_90s_neon',
    outlinePx: 1,
  }; // PIXEL_GRID_INVALID
  brokenRetro.educationalContext = undefined; // EDUCATIONAL_UNVERIFIED_CLAIM
  for (const sc of brokenRetro.scenes) sc.infographic = undefined; // EDUCATIONAL_INFOGRAPHIC_MISSING
  brokenRetro.scenes[0].captionText =
    'Este texto educativo propositalmente longo demais ultrapassa muito o limite seguro da fonte pixel 5x7 na tela vertical 180x320!'; // PIXEL_CAPTION_OVERFLOW

  const brokenRetroQa = runQualityAssurance(brokenRetro, STARTER_CHARACTERS, STARTER_SCENARIOS);
  assert.equal(brokenRetroQa.passed, false, 'Broken retro pixel plan must fail QA');
  assert.ok(brokenRetroQa.issues.some((i) => i.code === 'PIXEL_GRID_INVALID'));
  assert.ok(brokenRetroQa.issues.some((i) => i.code === 'EDUCATIONAL_UNVERIFIED_CLAIM'));
  assert.ok(brokenRetroQa.issues.some((i) => i.code === 'EDUCATIONAL_INFOGRAPHIC_MISSING'));
  assert.ok(brokenRetroQa.issues.some((i) => i.code === 'PIXEL_CAPTION_OVERFLOW'));

  const retroRepair = applyLearnedRulesAndAutoRepair(
    brokenRetro,
    memory,
    STARTER_CHARACTERS,
    STARTER_SCENARIOS,
    3
  );
  const repairedRetroQa = runQualityAssurance(retroRepair.project, STARTER_CHARACTERS, STARTER_SCENARIOS);
  assert.equal(
    repairedRetroQa.passed,
    true,
    `Auto-repair must fix retro pixel plan to pass QA. Remaining: ${JSON.stringify(
      repairedRetroQa.issues.filter((i) => i.severity === 'error')
    )}`
  );
  assert.equal(retroRepair.project.pixelConfig?.logicalWidth, 180);
  assert.equal(retroRepair.project.pixelConfig?.scalingMode, 'nearest');
  assert.ok(retroRepair.project.scenes.some((s) => Boolean(s.infographic)));

  console.log('ALL 26 ENGINE, RETRO-PIXEL-EDUCATIONAL, AUDIT, LEARNING-MEMORY, FIDELITY, CAUSALITY, ANATOMY, CAPTIONS, QA & FFMPEG TEST SUITES PASSED.');
}

runTests().catch((err) => {
  console.error('TEST FAILURE:', err);
  process.exit(1);
});
