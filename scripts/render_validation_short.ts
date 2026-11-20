import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createCanvas } from '@napi-rs/canvas';
import { generateProjectPlan } from '../src/engines/promptEngine.ts';
import { renderProjectFrame } from '../src/engines/sceneRenderer.ts';
import { renderProjectToWavBase64 } from '../src/engines/audioEngine.ts';
import { runQualityAssurance, validateContinuity } from '../src/engines/qaAndValidation.ts';
import {
  validateCharacterVisualSheets,
  validateContractV1,
  validateScriptFidelity,
} from '../src/contracts/projectContract.ts';
import { STARTER_CHARACTERS, STARTER_SCENARIOS } from '../src/data/presets.ts';

const MANDATORY_PROMPT = `Short de terror 2D com 30 segundos, formato vertical 9:16, sem narração, com efeitos sonoros cinematográficos.
1. 0–5s: personagem caminhando sozinho em uma rua escura durante a chuva.
2. 5–10s: câmera acompanha o personagem; uma silhueta aparece ao fundo.
3. 10–16s: personagem observa uma vitrine; seu reflexo mostra uma figura atrás dele.
4. 16–22s: a figura desaparece e uma sombra começa a persegui-lo.
5. 22–27s: o personagem para; seu reflexo começa a sorrir sozinho.
6. 27–30s: uma mão sai do vidro, agarra o personagem e a tela corta para preto.`;

async function main() {
  const startTime = Date.now();
  const width = 1080;
  const height = 1920;
  const fps = 24;

  console.log('=== 1. GERANDO PLANO DE PROJETO A PARTIR DO ROTEIRO OBRIGATÓRIO ===');
  const plan = await generateProjectPlan({
    prompt: MANDATORY_PROMPT,
    aspectRatio: '9:16',
    durationSec: 30,
    fps,
    previewResolution: '540p',
    exportResolution: '1080p',
    performanceProfile: 'equilibrado',
    narrationMode: 'none',
    availableCharacters: STARTER_CHARACTERS,
    availableScenarios: STARTER_SCENARIOS,
  });

  console.log(`Título: ${plan.title}`);
  console.log(`Gênero: ${plan.genre} | Duração total: ${plan.totalDuration}s | Cenas: ${plan.scenes.length}`);
  let cursor = 0;
  for (const sc of plan.scenes) {
    const start = cursor;
    const end = Number((cursor + sc.duration).toFixed(2));
    cursor = end;
    console.log(
      `  Cena ${sc.index + 1} [${start}–${end}s | ${sc.duration}s] scenario=${sc.scenarioId} framing=${sc.framing} cam=${sc.cameraMove}->${sc.secondaryCameraMove ?? '-'} trans=${sc.transitionIn} refl=${sc.reflectionMode ?? 'none'} end=${sc.endingImpact ?? 'none'} actors=${sc.actors.map((a) => `${a.characterId}(${a.revealMode ?? 'visible'})`).join(', ')}`
    );
    console.log(`    beat: "${sc.sourceBeat}"`);
  }

  console.log('\n=== 2. VALIDAÇÃO PRÉ-RENDER (CONTRATO v1.0 + FIDELIDADE + CONTINUIDADE + QA) ===');
  const contractIssues = validateContractV1(plan);
  const fidelity = validateScriptFidelity(plan);
  const sheetIssues = validateCharacterVisualSheets(plan);
  const continuityIssues = validateContinuity(plan);
  const qa = runQualityAssurance(plan, STARTER_CHARACTERS, STARTER_SCENARIOS);

  console.log(`Contrato v1.0 issues: ${contractIssues.length}`);
  console.log(`Fidelidade roteiro/cenas: ${fidelity.score}% (issues=${fidelity.issues.length})`);
  console.log(`VisualSheet consistency issues: ${sheetIssues.length}`);
  console.log(`Continuidade issues: ${continuityIssues.length}`);
  console.log(`QA pré-render passed: ${qa.passed} (issues=${qa.issues.length})`);
  if (qa.issues.length > 0) {
    for (const iss of qa.issues) {
      console.log(`  [${iss.severity}] ${iss.code}: ${iss.message}`);
    }
  }

  const exportsDir = path.resolve(process.cwd(), 'exports');
  fs.mkdirSync(exportsDir, { recursive: true });
  const planPath = path.join(exportsDir, 'short_terror_vitrine_plan.json');
  fs.writeFileSync(planPath, JSON.stringify(plan, null, 2), 'utf-8');

  // Prepare temp working dir for frames + WAV
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai2d_validation_'));
  const qaFramesDir = '/tmp/qa_frames';
  fs.mkdirSync(qaFramesDir, { recursive: true });

  console.log(`\n=== 3. RENDERIZANDO ${Math.round(plan.totalDuration * fps)} QUADROS EM ${width}x${height} @ ${fps} FPS ===`);
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d') as unknown as CanvasRenderingContext2D;
  const qaW = 180;
  const qaH = 320;
  const qaCanvas = createCanvas(qaW, qaH);
  const qaCtx = qaCanvas.getContext('2d') as unknown as CanvasRenderingContext2D;
  const offscreenCanvas = createCanvas(width, height) as unknown as HTMLCanvasElement;
  const totalFrames = Math.round(plan.totalDuration * fps);

  // Full 720-frame pixel-level telemetry (ALL 720 frames analyzed via 180x320 full-frame downscale!)
  let prevSampleLuma: Uint8Array | null = null;
  let prevMeanLuma = -1;
  let blackFramesTotal = 0;
  let blackFramesOutsideCut = 0;
  let duplicateFrames = 0;
  let flickerSpikes = 0;
  let horizontalBandFrames = 0;
  const sceneStats: Array<{ sceneIdx: number; frames: number; meanLumaSum: number; motionSum: number; minMotion: number; maxMotion: number }> =
    plan.scenes.map((_, i) => ({ sceneIdx: i, frames: 0, meanLumaSum: 0, motionSum: 0, minMotion: 999, maxMotion: 0 }));

  // Scene boundary frames to exclude from flicker spike checks (natural scene transitions)
  const sceneBoundaryFrames = new Set<number>();
  let bCur = 0;
  for (const sc of plan.scenes) {
    sceneBoundaryFrames.add(Math.round(bCur * fps));
    bCur += sc.duration;
  }

  for (let f = 0; f < totalFrames; f++) {
    const timeSec = f / fps;
    renderProjectFrame(
      ctx,
      plan,
      timeSec,
      width,
      height,
      STARTER_CHARACTERS,
      STARTER_SCENARIOS,
      {
        showSafeArea: false,
        createOffscreenCanvas: () => offscreenCanvas,
      }
    );

    // Encode JPEG for FFmpeg input
    const jpgBuf = canvas.toBuffer('image/jpeg', 88);
    fs.writeFileSync(path.join(tmpDir, `frame_${String(f).padStart(6, '0')}.jpg`), jpgBuf);

    // Full-frame pixel QA metrics on every single frame (180x320 covers 100% of frame area with low RAM)
    qaCtx.drawImage(canvas as unknown as CanvasImageSource, 0, 0, qaW, qaH);
    const imgData = (qaCtx as unknown as { getImageData: (x: number, y: number, w: number, h: number) => { data: Uint8ClampedArray } }).getImageData(0, 0, qaW, qaH);
    const px = imgData.data;

    const totalPix = qaW * qaH;
    const currSample = new Uint8Array(totalPix);
    let lumaSum = 0;
    const rowMeans = new Float32Array(qaH);

    for (let y = 0; y < qaH; y++) {
      let rSum = 0;
      const rowOff = y * qaW;
      for (let x = 0; x < qaW; x++) {
        const off = (rowOff + x) * 4;
        const luma = 0.299 * px[off] + 0.587 * px[off + 1] + 0.114 * px[off + 2];
        currSample[rowOff + x] = luma;
        lumaSum += luma;
        rSum += luma;
      }
      rowMeans[y] = rSum / qaW;
    }

    const meanLuma = lumaSum / totalPix;
    if (meanLuma < 2.5) {
      blackFramesTotal++;
      if (timeSec > 0.25 && timeSec < 29.6) {
        blackFramesOutsideCut++;
      }
    }

    // Horizontal glitch band check: sharp isolated horizontal stripe discontinuities across rows
    let sharpRowSpikes = 0;
    for (let r = 2; r < qaH - 2; r++) {
      const neighborAvg = (rowMeans[r - 2] + rowMeans[r + 2]) * 0.5;
      if (Math.abs(rowMeans[r] - neighborAvg) > 42) {
        sharpRowSpikes++;
      }
    }
    if (sharpRowSpikes >= 12) {
      horizontalBandFrames++;
    }

    // Motion & duplicate check vs previous frame
    let frameMotion = 0;
    if (prevSampleLuma) {
      let diffSum = 0;
      for (let k = 0; k < totalPix; k++) {
        diffSum += Math.abs(currSample[k] - prevSampleLuma[k]);
      }
      frameMotion = diffSum / totalPix;
      if (frameMotion < 0.08 && timeSec < 29.62) {
        duplicateFrames++;
      }
      if (
        prevMeanLuma >= 0 &&
        Math.abs(meanLuma - prevMeanLuma) > 28 &&
        !sceneBoundaryFrames.has(f) &&
        timeSec < 29.55
      ) {
        flickerSpikes++;
      }
    }
    prevSampleLuma = currSample;
    prevMeanLuma = meanLuma;

    // Accumulate per-scene metrics
    let accT = 0;
    let scIdx = plan.scenes.length - 1;
    for (let s = 0; s < plan.scenes.length; s++) {
      if (timeSec < accT + plan.scenes[s].duration) {
        scIdx = s;
        break;
      }
      accT += plan.scenes[s].duration;
    }
    const st = sceneStats[scIdx];
    st.frames++;
    st.meanLumaSum += meanLuma;
    st.motionSum += frameMotion;
    if (frameMotion > 0) {
      st.minMotion = Math.min(st.minMotion, frameMotion);
      st.maxMotion = Math.max(st.maxMotion, frameMotion);
    }

    if ((f + 1) % 120 === 0 || f === totalFrames - 1) {
      console.log(`  Progresso: ${f + 1}/${totalFrames} quadros (${Math.round(((f + 1) / totalFrames) * 100)}%)`);
    }
  }

  console.log('\n=== 4. SINTETIZANDO TRILHA SONORA E EFEITOS SINCRONIZADOS (WAV 44.1kHz ESTÉREO) ===');
  const wavBase64 = renderProjectToWavBase64(plan);
  const wavPath = path.join(tmpDir, 'audio.wav');
  fs.writeFileSync(wavPath, Buffer.from(wavBase64, 'base64'));
  console.log(`WAV gravado: ${(fs.statSync(wavPath).size / 1024 / 1024).toFixed(2)} MB`);

  console.log('\n=== 5. CODIFICANDO MP4 FINAL VIA FFMPEG (H.264 + AAC) ===');
  const outMp4 = path.join(exportsDir, 'short_terror_vitrine_1080x1920_24fps.mp4');
  execFileSync(
    'ffmpeg',
    [
      '-y',
      '-framerate',
      String(fps),
      '-start_number',
      '0',
      '-i',
      path.join(tmpDir, 'frame_%06d.jpg'),
      '-i',
      wavPath,
      '-c:v',
      'libx264',
      '-preset',
      'fast',
      '-crf',
      '21',
      '-pix_fmt',
      'yuv420p',
      '-threads',
      '3',
      '-c:a',
      'aac',
      '-b:a',
      '192k',
      '-shortest',
      '-movflags',
      '+faststart',
      outMp4,
    ],
    { stdio: 'pipe' }
  );

  const mp4SizeMB = (fs.statSync(outMp4).size / 1024 / 1024).toFixed(2);
  console.log(`MP4 gerado: ${outMp4} (${mp4SizeMB} MB)`);

  console.log('\n=== 6. AUDITORIA TÉCNICA COMPLETA DO MP4 FINAL (FFPROBE + BLACKDETECT + FREEZEDETECT + AUDIO) ===');
  const probeRaw = execFileSync(
    'ffprobe',
    ['-v', 'error', '-show_format', '-show_streams', '-of', 'json', outMp4],
    { encoding: 'utf-8' }
  );
  const probe = JSON.parse(probeRaw);
  const vStream = probe.streams.find((s: { codec_type: string }) => s.codec_type === 'video');
  const aStream = probe.streams.find((s: { codec_type: string }) => s.codec_type === 'audio');
  console.log(
    `Vídeo: ${vStream.codec_name} ${vStream.width}x${vStream.height} @ ${vStream.r_frame_rate} fps | pix_fmt=${vStream.pix_fmt} | nb_frames=${vStream.nb_frames} | dur=${Number(vStream.duration).toFixed(3)}s`
  );
  console.log(
    `Áudio: ${aStream.codec_name} ${aStream.sample_rate}Hz ${aStream.channels}ch | dur=${Number(aStream.duration).toFixed(3)}s | bitrate=${Math.round(Number(aStream.bit_rate) / 1000)} kbps`
  );

  const { spawnSync } = await import('node:child_process');
  const videoFilterAudit = spawnSync(
    'ffmpeg',
    [
      '-hide_banner',
      '-i',
      outMp4,
      '-vf',
      'blackdetect=d=0.20:pix_th=0.05,freezedetect=n=0.002:d=0.50',
      '-f',
      'null',
      '-',
    ],
    { encoding: 'utf-8' }
  );
  const audioFilterAudit = spawnSync(
    'ffmpeg',
    [
      '-hide_banner',
      '-i',
      outMp4,
      '-af',
      'volumedetect,silencedetect=noise=-45dB:d=1.0',
      '-f',
      'null',
      '-',
    ],
    { encoding: 'utf-8' }
  );

  const blackLines = (videoFilterAudit.stderr || '').split('\n').filter((l) => l.includes('black_start'));
  const freezeLines = (videoFilterAudit.stderr || '').split('\n').filter((l) => l.includes('freeze_'));
  const volLines = (audioFilterAudit.stderr || '').split('\n').filter((l) => l.includes('mean_volume') || l.includes('max_volume'));
  const silenceLines = (audioFilterAudit.stderr || '').split('\n').filter((l) => l.includes('silence_'));

  console.log(`blackdetect (>=0.20s): ${blackLines.length === 0 ? 'nenhum' : blackLines.join(' | ')}`);
  console.log(`freezedetect (>=0.50s): ${freezeLines.length === 0 ? 'nenhum (ZERO congelamentos)' : freezeLines.join(' | ')}`);
  console.log(`volumedetect: ${volLines.map((l) => l.trim()).join(' | ')}`);
  console.log(`silencedetect (>=1.0s @ -45dB): ${silenceLines.length === 0 ? 'nenhum silêncio prolongado' : silenceLines.join(' | ')}`);

  console.log('\n=== 7. TELEMETRIA PIXEL-A-PIXEL DE TODOS OS 720 QUADROS ===');
  console.log(`Total de quadros analisados: ${totalFrames}/720`);
  console.log(`Quadros pretos totais: ${blackFramesTotal} (fora do cut-to-black final/abertura: ${blackFramesOutsideCut})`);
  console.log(`Quadros duplicados/congelados (fora cut final): ${duplicateFrames}`);
  console.log(`Picos de flicker fora de transições: ${flickerSpikes}`);
  console.log(`Quadros com faixas horizontais/glitch: ${horizontalBandFrames}`);
  for (const st of sceneStats) {
    console.log(
      `  Cena ${st.sceneIdx + 1}: ${st.frames} frames | luma médio=${(st.meanLumaSum / st.frames).toFixed(1)} | movimento médio=${(st.motionSum / st.frames).toFixed(2)} (min=${st.minMotion.toFixed(2)}, max=${st.maxMotion.toFixed(2)})`
    );
  }

  console.log('\n=== 8. EXTRAINDO QUADROS DE INSPEÇÃO VISUAL DE TODAS AS 6 CENAS E TRANSIÇÕES ===');
  const exportQaDir = path.join(exportsDir, 'qa_frames');
  fs.mkdirSync(exportQaDir, { recursive: true });
  const inspectPoints = [
    { name: '01_scene1_rain_walk_2.5s.png', t: 2.5 },
    { name: '02_trans_1_to_2_5.2s.png', t: 5.2 },
    { name: '03_scene2_silhouette_bg_8.0s.png', t: 8.0 },
    { name: '04_scene3_vitrine_figure_14.2s.png', t: 14.2 },
    { name: '05_scene4_shadow_chase_19.2s.png', t: 19.2 },
    { name: '06_scene5_autonomous_smile_25.5s.png', t: 25.5 },
    { name: '07_scene6_hand_grab_28.5s.png', t: 28.5 },
    { name: '08_scene6_cut_to_black_29.8s.png', t: 29.8 },
  ];

  for (const pt of inspectPoints) {
    const outPng = path.join(exportQaDir, pt.name);
    execFileSync(
      'ffmpeg',
      ['-y', '-ss', String(pt.t), '-i', outMp4, '-frames:v', '1', '-q:v', '2', outPng],
      { stdio: 'pipe' }
    );
  }
  console.log(`Extraídos ${inspectPoints.length} quadros em ${exportQaDir} para inspeção visual direta.`);

  // Cleanup temp raw frames dir
  fs.rmSync(tmpDir, { recursive: true, force: true });
  console.log(`\nConcluído em ${((Date.now() - startTime) / 1000).toFixed(1)}s.`);
}

main().catch((err) => {
  console.error('ERRO NA VALIDAÇÃO:', err);
  process.exit(1);
});
