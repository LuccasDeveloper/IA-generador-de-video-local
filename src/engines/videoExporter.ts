import type { CharacterDefinition, ProjectPlan, ScenarioDefinition } from '../types/studio';
import { resolveDimensions } from '../data/presets';
import { renderProjectFrame } from './sceneRenderer';
import { audioEngine, renderProjectToWavBase64 } from './audioEngine';
import { generateASS, generateSRT } from './captionsEngine';
import { normalizeToContractV1 } from '../contracts/projectContract';

export interface RenderProgressCallback {
  (state: {
    percent: number;
    currentBlock: number;
    totalBlocks: number;
    currentTimeSec: number;
    elapsedSec: number;
    stageLabel: string;
  }): void;
}

export interface PostRenderVerification {
  passed: boolean;
  blackEvents: number;
  freezeEvents: number;
  verifiedDims: string;
  verifiedDurationSec: number;
}

export interface VideoExportResult {
  blob: Blob;
  extension: string;
  mimeType: string;
  width: number;
  height: number;
  durationSec: number;
  cancelled: boolean;
  rendererUsed: 'ffmpeg_mp4' | 'browser_preview';
  codecsLabel: string;
  postRenderVerification?: PostRenderVerification;
}

export interface VideoExportHandle {
  cancel: () => void;
  pause: () => void;
  resume: () => void;
  promise: Promise<VideoExportResult>;
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function downloadTextFile(content: string, filename: string, mime = 'text/plain;charset=utf-8'): void {
  downloadBlob(new Blob([content], { type: mime }), filename);
}

export function exportProjectJson(project: ProjectPlan): void {
  const normalized = normalizeToContractV1(project);
  const safeName = normalized.title.toLowerCase().replace(/[^a-z0-9]+/g, '_') || 'projeto_2d';
  downloadTextFile(JSON.stringify(normalized, null, 2), `${safeName}_plan.json`, 'application/json;charset=utf-8');
}

export function exportSubtitles(project: ProjectPlan, format: 'ass' | 'srt'): boolean {
  const safeName = project.title.toLowerCase().replace(/[^a-z0-9]+/g, '_') || 'projeto_2d';
  const dims = resolveDimensions(project.format.aspectRatio, project.format.exportResolution);
  const hasAnyCaptionText = project.scenes.some((s) => s.captionText.trim().length > 0);
  const effectiveProject: ProjectPlan =
    !project.captions.enabled && hasAnyCaptionText
      ? { ...project, captions: { ...project.captions, enabled: true } }
      : project;

  if (format === 'ass') {
    downloadTextFile(generateASS(effectiveProject, dims.width, dims.height), `${safeName}.ass`);
    return true;
  }
  const srt = generateSRT(effectiveProject);
  if (!srt.trim()) return false;
  downloadTextFile(srt, `${safeName}.srt`);
  return true;
}

/**
 * AUTHORITATIVE FINAL RENDERER:
 * Renders frames in memory-safe blocks (CPU-friendly for Ryzen 3 3200G / 16GB RAM),
 * synthesizes stereo WAV audio, and invokes the real local FFmpeg binary (libx264 + AAC)
 * to produce a standard MP4 file.
 */
export function startFfmpegMp4Export(
  project: ProjectPlan,
  mode: 'preview' | 'final',
  allCharacters: CharacterDefinition[],
  allScenarios: ScenarioDefinition[],
  onProgress: RenderProgressCallback
): VideoExportHandle {
  let cancelled = false;
  let paused = false;
  let activeJobId: string | null = null;

  const preset = mode === 'preview' ? project.format.previewResolution : project.format.exportResolution;
  const dims = resolveDimensions(project.format.aspectRatio, preset);
  const fps = project.format.fps;
  const totalDuration = Math.max(2, project.totalDuration);
  const totalFrames = Math.max(1, Math.round(totalDuration * fps));
  const blockSize = 16; // Small RAM footprint per IPC chunk
  const totalBlocks = Math.ceil(totalFrames / blockSize);

  const waitWhilePaused = async () => {
    while (paused && !cancelled) {
      await new Promise((r) => window.setTimeout(r, 120));
    }
  };

  const promise = (async (): Promise<VideoExportResult> => {
    const startWall = performance.now();

    onProgress({
      percent: 1,
      currentBlock: 0,
      totalBlocks,
      currentTimeSec: 0,
      elapsedSec: 0,
      stageLabel: 'Inicializando sessão FFmpeg local...',
    });

    const allowEndingCutToBlack =
      project.scenes[project.scenes.length - 1]?.endingImpact === 'cut_to_black';
    const startRes = await fetch('/api/render/ffmpeg/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fps,
        width: dims.width,
        height: dims.height,
        profile: project.performanceProfile,
        allowEndingCutToBlack,
      }),
    });

    if (!startRes.ok) {
      const errData = (await startRes.json().catch(() => ({}))) as { error?: string };
      throw new Error(errData.error || 'FFmpeg local indisponível neste servidor.');
    }

    const startPayload = (await startRes.json()) as {
      jobId: string;
      encoderVideo: string;
      encoderAudio: string;
    };
    activeJobId = startPayload.jobId;

    try {
      const canvas = document.createElement('canvas');
      canvas.width = dims.width;
      canvas.height = dims.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Contexto Canvas 2D indisponível.');

      // Render and upload frames in memory-safe blocks
      const jpegQuality = project.performanceProfile === 'economico' ? 0.8 : project.performanceProfile === 'equilibrado' ? 0.88 : 0.94;

      for (let blockIdx = 0; blockIdx < totalBlocks; blockIdx++) {
        await waitWhilePaused();
        if (cancelled) {
          await fetch(`/api/render/ffmpeg/${activeJobId}/cancel`, { method: 'POST' }).catch(() => {});
          activeJobId = null;
        return {
          blob: new Blob(),
          extension: 'mp4',
          mimeType: 'video/mp4',
          width: dims.width,
          height: dims.height,
          durationSec: totalDuration,
          cancelled: true,
          rendererUsed: 'ffmpeg_mp4',
          codecsLabel: `${startPayload.encoderVideo} + ${startPayload.encoderAudio}`,
        };
      }

      const startFrame = blockIdx * blockSize;
      const endFrame = Math.min(totalFrames, startFrame + blockSize);
      const batch: Array<{ index: number; jpegBase64: string }> = [];

      for (let f = startFrame; f < endFrame; f++) {
        const tSec = f / fps;
        renderProjectFrame(ctx, project, tSec, dims.width, dims.height, allCharacters, allScenarios);
        batch.push({
          index: f,
          jpegBase64: canvas.toDataURL('image/jpeg', jpegQuality),
        });
      }

      const uploadRes = await fetch(`/api/render/ffmpeg/${activeJobId}/frames`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ frames: batch }),
      });

      if (!uploadRes.ok) {
        await fetch(`/api/render/ffmpeg/${activeJobId}/cancel`, { method: 'POST' }).catch(() => {});
        throw new Error(`Falha ao enviar bloco ${blockIdx + 1}/${totalBlocks} para o FFmpeg.`);
      }

      const elapsedSec = Number(((performance.now() - startWall) / 1000).toFixed(1));
      onProgress({
        percent: Math.min(82, Math.round(((blockIdx + 1) / totalBlocks) * 82)),
        currentBlock: blockIdx + 1,
        totalBlocks,
        currentTimeSec: Number(((endFrame / totalFrames) * totalDuration).toFixed(1)),
        elapsedSec,
        stageLabel: `FFmpeg: bloco ${blockIdx + 1}/${totalBlocks} (${dims.width}×${dims.height} · ${fps} FPS)`,
      });

      // Yield to browser event loop so UI never freezes
      await new Promise((r) => window.setTimeout(r, 0));
    }

    await waitWhilePaused();
    if (cancelled) {
      await fetch(`/api/render/ffmpeg/${activeJobId}/cancel`, { method: 'POST' }).catch(() => {});
      return {
        blob: new Blob(),
        extension: 'mp4',
        mimeType: 'video/mp4',
        width: dims.width,
        height: dims.height,
        durationSec: totalDuration,
        cancelled: true,
        rendererUsed: 'ffmpeg_mp4',
        codecsLabel: `${startPayload.encoderVideo} + ${startPayload.encoderAudio}`,
      };
    }

    // Synthesize stereo WAV and upload for AAC muxing
    onProgress({
      percent: 88,
      currentBlock: totalBlocks,
      totalBlocks,
      currentTimeSec: totalDuration,
      elapsedSec: Number(((performance.now() - startWall) / 1000).toFixed(1)),
      stageLabel: 'Sintetizando trilha e SFX em WAV estéreo...',
    });

    const wavBase64 = renderProjectToWavBase64(project);
    const audioRes = await fetch(`/api/render/ffmpeg/${activeJobId}/audio`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ wavBase64 }),
    });
    if (!audioRes.ok) {
      await fetch(`/api/render/ffmpeg/${activeJobId}/cancel`, { method: 'POST' }).catch(() => {});
      throw new Error('Falha ao enviar trilha WAV para muxagem FFmpeg.');
    }

    // Invoke real FFmpeg encoding (libx264 + AAC)
    onProgress({
      percent: 94,
      currentBlock: totalBlocks,
      totalBlocks,
      currentTimeSec: totalDuration,
      elapsedSec: Number(((performance.now() - startWall) / 1000).toFixed(1)),
      stageLabel: `Codificando MP4 final com FFmpeg (${startPayload.encoderVideo} + ${startPayload.encoderAudio})...`,
    });

    const finalRes = await fetch(`/api/render/ffmpeg/${activeJobId}/finalize`, { method: 'POST' });
    if (!finalRes.ok) {
      const errData = (await finalRes.json().catch(() => ({}))) as { error?: string };
      throw new Error(errData.error || 'FFmpeg falhou ao finalizar o vídeo MP4.');
    }

    const vCodec = finalRes.headers.get('X-FFmpeg-Video-Codec') || startPayload.encoderVideo;
    const aCodec = finalRes.headers.get('X-FFmpeg-Audio-Codec') || startPayload.encoderAudio;
    const postRenderVerification: PostRenderVerification = {
      passed: finalRes.headers.get('X-QA-PostRender-Passed') !== 'false',
      blackEvents: Number(finalRes.headers.get('X-QA-Black-Events') ?? '0') || 0,
      freezeEvents: Number(finalRes.headers.get('X-QA-Freeze-Events') ?? '0') || 0,
      verifiedDims: finalRes.headers.get('X-QA-Video-Dimensions') || `${dims.width}x${dims.height}`,
      verifiedDurationSec: Number(finalRes.headers.get('X-QA-Duration-Sec') ?? String(totalDuration)) || totalDuration,
    };
      const blob = await finalRes.blob();
      activeJobId = null;

      onProgress({
        percent: 100,
        currentBlock: totalBlocks,
        totalBlocks,
        currentTimeSec: totalDuration,
        elapsedSec: Number(((performance.now() - startWall) / 1000).toFixed(1)),
        stageLabel: postRenderVerification.passed
          ? `MP4 verificado pós-render (${vCodec} + ${aCodec} · 0 artefatos).`
          : `MP4 gerado com alertas pós-render (${postRenderVerification.blackEvents} pretos · ${postRenderVerification.freezeEvents} congelados).`,
      });

      return {
        blob,
        extension: 'mp4',
        mimeType: 'video/mp4',
        width: dims.width,
        height: dims.height,
        durationSec: totalDuration,
        cancelled: false,
        rendererUsed: 'ffmpeg_mp4',
        codecsLabel: `${vCodec} + ${aCodec}`,
        postRenderVerification,
      };
    } catch (err) {
      if (activeJobId) {
        await fetch(`/api/render/ffmpeg/${activeJobId}/cancel`, { method: 'POST' }).catch(() => {});
        activeJobId = null;
      }
      throw err;
    }
  })();

  return {
    cancel: () => {
      cancelled = true;
      if (activeJobId) {
        void fetch(`/api/render/ffmpeg/${activeJobId}/cancel`, { method: 'POST' }).catch(() => {});
      }
    },
    pause: () => {
      paused = true;
    },
    resume: () => {
      paused = false;
    },
    promise,
  };
}

/**
 * AUXILIARY BROWSER PREVIEW EXPORTER (NOT a replacement for FFmpeg):
 * Captures Canvas 2D + Web Audio via browser MediaRecorder for quick auxiliary previews.
 */
export function startBrowserPreviewExport(
  project: ProjectPlan,
  mode: 'preview' | 'final',
  allCharacters: CharacterDefinition[],
  allScenarios: ScenarioDefinition[],
  onProgress: RenderProgressCallback
): VideoExportHandle {
  let cancelled = false;
  let paused = false;

  const preset = mode === 'preview' ? project.format.previewResolution : project.format.exportResolution;
  const dims = resolveDimensions(project.format.aspectRatio, preset);
  const fps = project.format.fps;
  const totalDuration = Math.max(2, project.totalDuration);
  const totalBlocks = Math.max(1, project.scenes.length);

  const promise = new Promise<VideoExportResult>((resolve, reject) => {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = dims.width;
      canvas.height = dims.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Contexto Canvas 2D indisponível para preview.'));
        return;
      }

      const preferredMimes = [
        'video/webm;codecs=vp9,opus',
        'video/webm;codecs=vp8,opus',
        'video/webm',
        'video/mp4',
      ];
      const mimeType =
        preferredMimes.find((m) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m)) ??
        'video/webm';
      const extension = mimeType.includes('mp4') ? 'mp4' : 'webm';

      const canvasStream = canvas.captureStream(fps);
      const audioStream = audioEngine.getCaptureAudioStream();
      const tracks = [...canvasStream.getVideoTracks(), ...(audioStream ? audioStream.getAudioTracks() : [])];
      const combined = new MediaStream(tracks);

      const recorder = new MediaRecorder(combined, {
        mimeType,
        videoBitsPerSecond: mode === 'final' ? 4_200_000 : 1_800_000,
      });

      const chunks: BlobPart[] = [];
      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) chunks.push(ev.data);
      };

      const cleanupCanvasTracks = () => {
        for (const tr of canvasStream.getVideoTracks()) {
          try {
            tr.stop();
          } catch {
            // Ignore track stop errors
          }
        }
      };

      recorder.onstop = () => {
        audioEngine.stopAll();
        cleanupCanvasTracks();
        const blob = new Blob(chunks, { type: mimeType });
        resolve({
          blob,
          extension,
          mimeType,
          width: dims.width,
          height: dims.height,
          durationSec: totalDuration,
          cancelled,
          rendererUsed: 'browser_preview',
          codecsLabel: `Navegador (${mimeType})`,
        });
      };

      recorder.onerror = () => {
        audioEngine.stopAll();
        cleanupCanvasTracks();
        reject(new Error('Falha no MediaRecorder do navegador.'));
      };

      audioEngine.scheduleProjectAudio(project, 0);
      recorder.start(250);

      const startWall = performance.now();
      let pausedAccumMs = 0;
      let pauseBeganAt = 0;
      let lastVideoTime = 0;

      const stepFrame = () => {
        if (cancelled) {
          if (recorder.state !== 'inactive') recorder.stop();
          return;
        }

        if (paused) {
          if (pauseBeganAt === 0) {
            pauseBeganAt = performance.now();
            if (recorder.state === 'recording') recorder.pause();
            audioEngine.stopAll();
          }
          window.setTimeout(() => requestAnimationFrame(stepFrame), 120);
          return;
        } else if (pauseBeganAt > 0) {
          pausedAccumMs += performance.now() - pauseBeganAt;
          pauseBeganAt = 0;
          if (recorder.state === 'paused') recorder.resume();
          audioEngine.scheduleProjectAudio(project, lastVideoTime);
        }

        const elapsedMs = performance.now() - startWall - pausedAccumMs;
        const currentSec = elapsedMs / 1000;
        lastVideoTime = currentSec;

        if (currentSec >= totalDuration) {
          renderProjectFrame(ctx, project, totalDuration - 0.01, dims.width, dims.height, allCharacters, allScenarios);
          onProgress({
            percent: 100,
            currentBlock: totalBlocks,
            totalBlocks,
            currentTimeSec: totalDuration,
            elapsedSec: Number((elapsedMs / 1000).toFixed(1)),
            stageLabel: 'Finalizando captura auxiliar do navegador...',
          });
          if (recorder.state !== 'inactive') recorder.stop();
          return;
        }

        renderProjectFrame(ctx, project, currentSec, dims.width, dims.height, allCharacters, allScenarios);

        let acc = 0;
        let blockIdx = 1;
        for (let i = 0; i < project.scenes.length; i++) {
          acc += project.scenes[i].duration;
          if (currentSec <= acc) {
            blockIdx = i + 1;
            break;
          }
        }

        onProgress({
          percent: Math.min(99, Math.round((currentSec / totalDuration) * 100)),
          currentBlock: blockIdx,
          totalBlocks,
          currentTimeSec: Number(currentSec.toFixed(1)),
          elapsedSec: Number((elapsedMs / 1000).toFixed(1)),
          stageLabel: `Preview auxiliar (navegador): bloco ${blockIdx}/${totalBlocks}`,
        });

        requestAnimationFrame(stepFrame);
      };

      requestAnimationFrame(stepFrame);
    } catch (err) {
      audioEngine.stopAll();
      reject(err instanceof Error ? err : new Error('Erro na captura auxiliar do navegador.'));
    }
  });

  return {
    cancel: () => {
      cancelled = true;
    },
    pause: () => {
      paused = true;
    },
    resume: () => {
      paused = false;
    },
    promise,
  };
}
