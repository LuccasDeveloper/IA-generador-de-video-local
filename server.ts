import express from 'express';
import { createServer as createViteServer } from 'vite';
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SCHEMA_VERSION = '1.0.0' as const;

const EXPECTED_SKILL_SCRIPTS = [
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
];

function probeCommand(cmd: string, args: string[], timeoutMs = 2500): Promise<{ available: boolean; version: string | null; fullOutput: string }> {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout: timeoutMs, maxBuffer: 2 * 1024 * 1024 }, (err, stdout, stderr) => {
      const combined = `${stdout || ''}\n${stderr || ''}`.trim();
      if (err) {
        resolve({ available: false, version: null, fullOutput: combined });
        return;
      }
      const firstLine = combined.split('\n')[0] || 'disponível';
      resolve({ available: true, version: firstLine.slice(0, 120), fullOutput: combined });
    });
  });
}

async function probeFfmpeg() {
  const versionCheck = await probeCommand('ffmpeg', ['-version']);
  if (!versionCheck.available) {
    return { available: false, version: null, hasLibx264: false, hasAac: false };
  }
  const encodersCheck = await probeCommand('ffmpeg', ['-hide_banner', '-encoders'], 3500);
  const out = encodersCheck.fullOutput;
  return {
    available: true,
    version: versionCheck.version,
    hasLibx264: /\blibx264\b/.test(out),
    hasAac: /\baac\b/.test(out),
  };
}

function auditOriginalSkillOnDisk() {
  const skillRoot = path.resolve(__dirname, 'original_skill');
  const directoryPresent = fs.existsSync(skillRoot);

  // Check if any ai-cinematic-video-creator ZIP exists in workspace root
  let zipDetected = false;
  try {
    const rootEntries = fs.readdirSync(__dirname);
    zipDetected = rootEntries.some((f) => f.toLowerCase().includes('cinematic') && f.toLowerCase().endsWith('.zip'));
  } catch {
    zipDetected = false;
  }

  const missingFiles: string[] = [];
  for (const rel of EXPECTED_SKILL_SCRIPTS) {
    if (!fs.existsSync(path.join(skillRoot, rel))) {
      missingFiles.push(rel);
    }
  }

  return {
    zipDetected,
    directoryPresent,
    presentScriptsCount: EXPECTED_SKILL_SCRIPTS.length - missingFiles.length,
    expectedScriptsCount: EXPECTED_SKILL_SCRIPTS.length,
    missingFiles,
    referenceAssetsPresent: {
      skillMd: fs.existsSync(path.join(skillRoot, 'SKILL.md')),
      references: fs.existsSync(path.join(skillRoot, 'references')),
      templates: fs.existsSync(path.join(skillRoot, 'templates')),
      examples: fs.existsSync(path.join(skillRoot, 'examples')),
    },
  };
}

async function probeOllama(baseUrl: string): Promise<{
  available: boolean;
  url: string;
  models: string[];
  error?: string;
}> {
  const normalized = baseUrl.replace(/\/+$/, '');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2000);
  try {
    const res = await fetch(`${normalized}/api/tags`, { signal: controller.signal });
    if (!res.ok) {
      return {
        available: false,
        url: normalized,
        models: [],
        error: `HTTP ${res.status}`,
      };
    }
    const data = (await res.json()) as { models?: Array<{ name?: string }> };
    const models = (data.models ?? [])
      .map((m) => m.name)
      .filter((n): n is string => Boolean(n));
    return {
      available: true,
      url: normalized,
      models,
    };
  } catch (err) {
    return {
      available: false,
      url: normalized,
      models: [],
      error: err instanceof Error ? err.message : 'Serviço Ollama não encontrado localmente',
    };
  } finally {
    clearTimeout(timer);
  }
}

interface RenderJobMeta {
  jobId: string;
  dir: string;
  fps: number;
  width: number;
  height: number;
  profile: 'economico' | 'equilibrado' | 'qualidade';
  hasAudio: boolean;
  allowEndingCutToBlack: boolean;
  framesReceived: number;
  createdAt: number;
  lastActivityAt: number;
}

const activeRenderJobs = new Map<string, RenderJobMeta>();
const RENDER_JOB_TTL_MS = 30 * 60 * 1000;

function cleanupJob(jobId: string) {
  const job = activeRenderJobs.get(jobId);
  if (!job) return;
  activeRenderJobs.delete(jobId);
  try {
    fs.rmSync(job.dir, { recursive: true, force: true });
  } catch {
    // Best-effort temp cleanup
  }
}

function sweepStaleRenderJobs() {
  const now = Date.now();
  for (const [jobId, job] of activeRenderJobs.entries()) {
    if (now - job.lastActivityAt > RENDER_JOB_TTL_MS) {
      cleanupJob(jobId);
    }
  }
}

const staleSweepTimer = setInterval(sweepStaleRenderJobs, 5 * 60 * 1000);
staleSweepTimer.unref();

const DATA_DIR = path.resolve(__dirname, 'data');
const MEMORY_FILE = path.join(DATA_DIR, 'studio_memory.json');

function createDefaultDiskMemory() {
  return {
    schemaVersion: '1.0.0',
    videos: [],
    rules: [],
    totalAutoFixes: 0,
    updatedAt: new Date().toISOString(),
  };
}

function readMemoryFromDisk() {
  try {
    if (!fs.existsSync(MEMORY_FILE)) {
      return createDefaultDiskMemory();
    }
    const parsed = JSON.parse(fs.readFileSync(MEMORY_FILE, 'utf-8'));
    if (!parsed || typeof parsed !== 'object') return createDefaultDiskMemory();
    return {
      schemaVersion: '1.0.0',
      videos: Array.isArray(parsed.videos) ? parsed.videos.slice(0, 60) : [],
      rules: Array.isArray(parsed.rules) ? parsed.rules.slice(0, 80) : [],
      totalAutoFixes: typeof parsed.totalAutoFixes === 'number' ? parsed.totalAutoFixes : 0,
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : new Date().toISOString(),
    };
  } catch {
    return createDefaultDiskMemory();
  }
}

function writeMemoryToDisk(payload: unknown) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const normalized =
    payload && typeof payload === 'object'
      ? {
          schemaVersion: '1.0.0',
          videos: Array.isArray((payload as { videos?: unknown }).videos)
            ? ((payload as { videos: unknown[] }).videos).slice(0, 60)
            : [],
          rules: Array.isArray((payload as { rules?: unknown }).rules)
            ? ((payload as { rules: unknown[] }).rules).slice(0, 80)
            : [],
          totalAutoFixes:
            typeof (payload as { totalAutoFixes?: unknown }).totalAutoFixes === 'number'
              ? (payload as { totalAutoFixes: number }).totalAutoFixes
              : 0,
          updatedAt: new Date().toISOString(),
        }
      : createDefaultDiskMemory();
  const tmpFile = `${MEMORY_FILE}.tmp`;
  fs.writeFileSync(tmpFile, JSON.stringify(normalized, null, 2), 'utf-8');
  fs.renameSync(tmpFile, MEMORY_FILE);
  return normalized;
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '45mb' }));

  const exportsDir = path.resolve(__dirname, 'exports');
  if (!fs.existsSync(exportsDir)) {
    fs.mkdirSync(exportsDir, { recursive: true });
  }
  app.use('/exports', express.static(exportsDir));

  // Real environment diagnostics + FFmpeg codec verification + Original Skill filesystem audit
  app.get('/api/diagnostics', async (req, res) => {
    const ollamaUrl =
      typeof req.query.ollamaUrl === 'string' && req.query.ollamaUrl.trim()
        ? req.query.ollamaUrl.trim()
        : 'http://127.0.0.1:11434';

    const [python3, python, ffmpeg, piper, espeak, ollama] = await Promise.all([
      probeCommand('python3', ['--version']),
      probeCommand('python', ['--version']),
      probeFfmpeg(),
      probeCommand('piper', ['--version']),
      probeCommand('espeak-ng', ['--version']),
      probeOllama(ollamaUrl),
    ]);

    const py = python3.available ? python3 : python;
    const totalMemGB = Number((os.totalmem() / 1024 ** 3).toFixed(2));
    const freeMemGB = Number((os.freemem() / 1024 ** 3).toFixed(2));
    const cpus = os.cpus();

    res.json({
      timestamp: new Date().toISOString(),
      schemaVersion: SCHEMA_VERSION,
      platform: `${os.platform()} ${os.release()} (${os.arch()})`,
      nodeVersion: process.version,
      cpu: {
        model: cpus[0]?.model ?? 'CPU Padrão',
        cores: cpus.length,
      },
      memory: {
        totalGB: totalMemGB,
        freeGB: freeMemGB,
        usedPercent: Math.round(((totalMemGB - freeMemGB) / Math.max(totalMemGB, 0.1)) * 100),
      },
      tools: {
        python: { available: py.available, version: py.version },
        ffmpeg,
        piper: { available: piper.available, version: piper.version },
        espeak: { available: espeak.available, version: espeak.version },
      },
      originalSkill: auditOriginalSkillOnDisk(),
      ollama,
      hardwareRecommendation:
        totalMemGB <= 8
          ? 'economico'
          : totalMemGB <= 16
          ? 'equilibrado'
          : 'qualidade',
    });
  });

  // =========================================================================
  // PERSISTENT SELF-LEARNING & PAST-VIDEO MEMORY API (data/studio_memory.json)
  // =========================================================================
  app.get('/api/memory', (_req, res) => {
    res.json(readMemoryFromDisk());
  });

  app.put('/api/memory', (req, res) => {
    try {
      const saved = writeMemoryToDisk(req.body);
      res.json(saved);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Falha ao salvar memória no disco.' });
    }
  });

  app.delete('/api/memory', (_req, res) => {
    try {
      const empty = writeMemoryToDisk(createDefaultDiskMemory());
      res.json(empty);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Falha ao limpar memória.' });
    }
  });

  // =========================================================================
  // AUTHORITATIVE FFMPEG MP4 RENDERER (H.264 + AAC, CPU-first, block-chunked)
  // =========================================================================
  app.post('/api/render/ffmpeg/start', async (req, res) => {
    sweepStaleRenderJobs();
    const ff = await probeFfmpeg();
    if (!ff.available) {
      res.status(503).json({
        error: 'FFmpeg não está disponível neste servidor. Utilize o pacote Desktop Windows ou o preview auxiliar do navegador.',
      });
      return;
    }

    const { fps = 24, width = 540, height = 960, profile = 'equilibrado', allowEndingCutToBlack = false } = req.body ?? {};
    const jobId = `job_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
    const dir = path.join(os.tmpdir(), `ai2d_ffmpeg_${jobId}`);
    fs.mkdirSync(dir, { recursive: true });
    const now = Date.now();

    activeRenderJobs.set(jobId, {
      jobId,
      dir,
      fps: Math.max(12, Math.min(60, Number(fps) || 24)),
      width: Math.max(120, Math.min(3840, Number(width) || 540)),
      height: Math.max(120, Math.min(3840, Number(height) || 960)),
      profile: profile === 'economico' || profile === 'qualidade' ? profile : 'equilibrado',
      hasAudio: false,
      allowEndingCutToBlack: Boolean(allowEndingCutToBlack),
      framesReceived: 0,
      createdAt: now,
      lastActivityAt: now,
    });

    res.json({
      jobId,
      encoderVideo: ff.hasLibx264 ? 'libx264' : 'mpeg4',
      encoderAudio: ff.hasAac ? 'aac' : 'copy',
    });
  });

  app.post('/api/render/ffmpeg/:jobId/frames', (req, res) => {
    const job = activeRenderJobs.get(req.params.jobId);
    if (!job) {
      res.status(404).json({ error: 'Sessão de renderização FFmpeg não encontrada.' });
      return;
    }

    const frames = req.body?.frames as Array<{ index: number; jpegBase64: string }> | undefined;
    if (!Array.isArray(frames) || frames.length === 0) {
      res.status(400).json({ error: 'Bloco de quadros vazio.' });
      return;
    }

    try {
      for (const f of frames) {
        if (!f || !Number.isInteger(f.index) || f.index < 0 || f.index >= 200000 || typeof f.jpegBase64 !== 'string') {
          res.status(400).json({ error: 'Índice ou payload de quadro inválido.' });
          return;
        }
        const clean = f.jpegBase64.replace(/^data:image\/\w+;base64,/, '');
        const filename = `frame_${String(f.index).padStart(6, '0')}.jpg`;
        fs.writeFileSync(path.join(job.dir, filename), Buffer.from(clean, 'base64'));
        job.framesReceived++;
      }
      job.lastActivityAt = Date.now();
      res.json({ ok: true, framesReceived: job.framesReceived });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Falha ao gravar bloco de quadros.' });
    }
  });

  app.post('/api/render/ffmpeg/:jobId/audio', (req, res) => {
    const job = activeRenderJobs.get(req.params.jobId);
    if (!job) {
      res.status(404).json({ error: 'Sessão de renderização FFmpeg não encontrada.' });
      return;
    }
    const wavBase64 = req.body?.wavBase64 as string | undefined;
    if (!wavBase64) {
      res.status(400).json({ error: 'Áudio WAV ausente.' });
      return;
    }
    try {
      const clean = wavBase64.replace(/^data:audio\/[\w-]+;base64,/, '');
      fs.writeFileSync(path.join(job.dir, 'audio.wav'), Buffer.from(clean, 'base64'));
      job.hasAudio = true;
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Falha ao gravar áudio WAV.' });
    }
  });

  app.post('/api/render/ffmpeg/:jobId/finalize', async (req, res) => {
    const job = activeRenderJobs.get(req.params.jobId);
    if (!job) {
      res.status(404).json({ error: 'Sessão de renderização FFmpeg não encontrada.' });
      return;
    }

    const ff = await probeFfmpeg();
    const outPath = path.join(job.dir, 'output.mp4');
    const cpuThreads =
      job.profile === 'economico'
        ? '2'
        : job.profile === 'equilibrado'
        ? String(Math.min(3, Math.max(2, os.cpus().length)))
        : String(Math.min(4, Math.max(2, os.cpus().length)));

    const preset = job.profile === 'economico' ? 'veryfast' : job.profile === 'equilibrado' ? 'fast' : 'medium';
    const crf = job.profile === 'economico' ? '26' : job.profile === 'equilibrado' ? '22' : '19';

    const args: string[] = [
      '-y',
      '-framerate',
      String(job.fps),
      '-start_number',
      '0',
      '-i',
      path.join(job.dir, 'frame_%06d.jpg'),
    ];

    if (job.hasAudio) {
      args.push('-i', path.join(job.dir, 'audio.wav'));
    }

    if (ff.hasLibx264) {
      args.push('-c:v', 'libx264', '-preset', preset, '-crf', crf, '-pix_fmt', 'yuv420p', '-threads', cpuThreads);
    } else {
      args.push('-c:v', 'mpeg4', '-q:v', '4', '-pix_fmt', 'yuv420p');
    }

    if (job.hasAudio) {
      args.push('-c:a', ff.hasAac ? 'aac' : 'mp3', '-b:a', '192k', '-shortest');
    }

    args.push('-movflags', '+faststart', outPath);

    execFile('ffmpeg', args, { timeout: 120_000, maxBuffer: 4 * 1024 * 1024 }, async (err, _stdout, stderr) => {
      if (err || !fs.existsSync(outPath)) {
        cleanupJob(job.jobId);
        res.status(500).json({
          error: `FFmpeg falhou ao codificar MP4: ${(stderr || err?.message || 'erro desconhecido').slice(-320)}`,
        });
        return;
      }

      // Real post-render artifact & integrity verification (ffprobe + ffmpeg blackdetect/freezedetect)
      const [probeRes, artifactRes] = await Promise.all([
        probeCommand(
          'ffprobe',
          ['-v', 'error', '-show_entries', 'stream=codec_type,codec_name,width,height:format=duration', '-of', 'json', outPath],
          8000
        ),
        probeCommand(
          'ffmpeg',
          ['-hide_banner', '-i', outPath, '-vf', 'blackdetect=d=0.45:pix_th=0.05,freezedetect=n=0.002:d=1.0', '-f', 'null', '-'],
          15000
        ),
      ]);

      let verifiedDims = `${job.width}x${job.height}`;
      let verifiedDuration = 0;
      let hasVideoStream = false;
      try {
        const parsedProbe = JSON.parse(probeRes.fullOutput) as {
          streams?: Array<{ codec_type?: string; width?: number; height?: number }>;
          format?: { duration?: string };
        };
        const vStream = parsedProbe.streams?.find((s) => s.codec_type === 'video');
        if (vStream) {
          hasVideoStream = true;
          if (vStream.width && vStream.height) verifiedDims = `${vStream.width}x${vStream.height}`;
        }
        verifiedDuration = Number(parsedProbe.format?.duration ?? 0) || 0;
      } catch {
        hasVideoStream = fs.statSync(outPath).size > 512;
      }

      // Parse blackdetect events carefully so intentional ending cut_to_black isn't misreported as defect
      const blackMatches = Array.from(
        artifactRes.fullOutput.matchAll(/black_start:([\d.]+)\s+black_end:([\d.]+)\s+black_duration:([\d.]+)/g)
      );
      const unexpectedBlackEvents = blackMatches.filter((m) => {
        const bStart = parseFloat(m[1]);
        const bDur = parseFloat(m[3]);
        const isIntentionalEndingCut =
          job.allowEndingCutToBlack && verifiedDuration > 1 && bStart >= verifiedDuration - 0.7 && bDur <= 0.7;
        return !isIntentionalEndingCut;
      });
      const blackEvents = unexpectedBlackEvents.length;
      const freezeEvents = (artifactRes.fullOutput.match(/freeze_start:/g) ?? []).length;
      const postRenderPassed = hasVideoStream && blackEvents === 0 && freezeEvents === 0;

      const stat = fs.statSync(outPath);
      res.setHeader('Content-Type', 'video/mp4');
      res.setHeader('Content-Length', String(stat.size));
      res.setHeader('X-FFmpeg-Video-Codec', ff.hasLibx264 ? 'libx264' : 'mpeg4');
      res.setHeader('X-FFmpeg-Audio-Codec', job.hasAudio ? (ff.hasAac ? 'aac' : 'mp3') : 'none');
      res.setHeader('X-QA-PostRender-Passed', postRenderPassed ? 'true' : 'false');
      res.setHeader('X-QA-Black-Events', String(blackEvents));
      res.setHeader('X-QA-Freeze-Events', String(freezeEvents));
      res.setHeader('X-QA-Video-Dimensions', verifiedDims);
      res.setHeader('X-QA-Duration-Sec', verifiedDuration.toFixed(2));

      const stream = fs.createReadStream(outPath);
      const finalizeCleanup = () => {
        if (!stream.destroyed) stream.destroy();
        cleanupJob(job.jobId);
      };
      stream.on('close', finalizeCleanup);
      stream.on('error', finalizeCleanup);
      res.on('close', finalizeCleanup);
      stream.pipe(res);
    });
  });

  app.post('/api/render/ffmpeg/:jobId/cancel', (req, res) => {
    cleanupJob(req.params.jobId);
    res.json({ ok: true });
  });

  // Explicit Ollama health & model check (strictly local URLs only)
  app.post('/api/ollama/check', async (req, res) => {
    const url = typeof req.body?.url === 'string' ? req.body.url.trim() : 'http://127.0.0.1:11434';
    try {
      const parsed = new URL(url);
      if (!['localhost', '127.0.0.1', '::1'].includes(parsed.hostname)) {
        res.status(400).json({
          available: false,
          url,
          models: [],
          error: 'Por privacidade, apenas endereços locais (localhost / 127.0.0.1) são permitidos.',
        });
        return;
      }
    } catch {
      res.status(400).json({ available: false, url, models: [], error: 'URL inválida.' });
      return;
    }

    const result = await probeOllama(url);
    res.json(result);
  });

  // Optional local Ollama generation proxy (never called automatically, strictly localhost)
  app.post('/api/ollama/generate', async (req, res) => {
    const { url = 'http://127.0.0.1:11434', model, prompt } = req.body ?? {};
    if (!model || !prompt) {
      res.status(400).json({ error: 'Modelo e prompt são obrigatórios.' });
      return;
    }
    try {
      const parsed = new URL(String(url));
      if (!['localhost', '127.0.0.1', '::1'].includes(parsed.hostname)) {
        res.status(400).json({ error: 'Apenas Ollama local (localhost/127.0.0.1) é permitido.' });
        return;
      }
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 25000);
      const response = await fetch(`${String(url).replace(/\/+$/, '')}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          prompt,
          stream: false,
          format: 'json',
        }),
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!response.ok) {
        res.status(502).json({ error: `Ollama retornou HTTP ${response.status}` });
        return;
      }
      const data = (await response.json()) as { response?: string };
      res.json({ response: data.response ?? '' });
    } catch (err) {
      res.status(503).json({
        error: err instanceof Error ? err.message : 'Falha ao consultar Ollama local.',
      });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`AI 2D Video Studio server running at http://localhost:${PORT}`);
  });
}

startServer();
