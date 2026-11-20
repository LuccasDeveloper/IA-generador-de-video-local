import React, { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  FileJson,
  FileText,
  Film,
  MonitorPlay,
  Package,
  Pause,
  Play,
  RefreshCw,
  ShieldCheck,
  Wrench,
  X,
  XCircle,
} from 'lucide-react';
import type {
  AspectRatio,
  CharacterDefinition,
  EnvironmentDiagnostics,
  FPSOption,
  ProjectPlan,
  QAReport,
  ResolutionPreset,
  ScenarioDefinition,
  StudioMemoryState,
} from '../types/studio';
import { resolveDimensions } from '../data/presets';
import { runQualityAssurance } from '../engines/qaAndValidation';
import { applyLearnedRulesAndAutoRepair, recordVideoOutcome } from '../engines/learningMemory';
import {
  downloadBlob,
  exportProjectJson,
  exportSubtitles,
  startBrowserPreviewExport,
  startFfmpegMp4Export,
  type PostRenderVerification,
  type VideoExportHandle,
} from '../engines/videoExporter';
import { downloadPythonDesktopBundle } from '../engines/pythonBundleGenerator';

interface ExportAndQAModalProps {
  isOpen: boolean;
  initialTab: 'qa' | 'export';
  project: ProjectPlan;
  characters: CharacterDefinition[];
  scenarios: ScenarioDefinition[];
  memory: StudioMemoryState;
  onClose: () => void;
  onUpdateProject: (updated: ProjectPlan) => void;
  onUpdateMemory: (next: StudioMemoryState) => void;
  onLog: (level: 'info' | 'warn' | 'error' | 'success', module: string, message: string) => void;
}

export const ExportAndQAModal: React.FC<ExportAndQAModalProps> = ({
  isOpen,
  initialTab,
  project,
  characters,
  scenarios,
  memory,
  onClose,
  onUpdateProject,
  onUpdateMemory,
  onLog,
}) => {
  const [tab, setTab] = useState<'qa' | 'export'>(initialTab);
  const [qaReport, setQaReport] = useState<QAReport | null>(null);
  const [renderMode, setRenderMode] = useState<'preview' | 'final'>('preview');
  const [ffmpegStatus, setFfmpegStatus] = useState<{
    checked: boolean;
    available: boolean;
    hasLibx264: boolean;
    hasAac: boolean;
    version: string | null;
  }>({ checked: false, available: false, hasLibx264: false, hasAac: false, version: null });

  const [isRendering, setIsRendering] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [renderProgress, setRenderProgress] = useState({
    percent: 0,
    currentBlock: 0,
    totalBlocks: project.scenes.length,
    currentTimeSec: 0,
    elapsedSec: 0,
    stageLabel: '',
  });
  const [lastExportFile, setLastExportFile] = useState<{
    filename: string;
    sizeMB: string;
    codecs: string;
    rendererUsed: 'ffmpeg_mp4' | 'browser_preview';
    postRenderVerification?: PostRenderVerification;
  } | null>(null);
  const [bundleBusy, setBundleBusy] = useState(false);

  const exportHandleRef = useRef<VideoExportHandle | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setTab(initialTab);
    setRenderError(null);
    const report = runQualityAssurance(project, characters, scenarios);
    setQaReport(report);

    fetch('/api/diagnostics')
      .then((r) => (r.ok ? r.json() : null))
      .then((d: EnvironmentDiagnostics | null) => {
        if (d) {
          setFfmpegStatus({
            checked: true,
            available: d.tools.ffmpeg.available,
            hasLibx264: d.tools.ffmpeg.hasLibx264,
            hasAac: d.tools.ffmpeg.hasAac,
            version: d.tools.ffmpeg.version,
          });
        }
      })
      .catch(() => {
        setFfmpegStatus({ checked: true, available: false, hasLibx264: false, hasAac: false, version: null });
      });

    onLog(
      report.passed ? 'success' : 'warn',
      'qa_check',
      `QA executado: ${report.passed ? 'aprovado' : 'alertas encontrados'} (${report.contactSheet.length} quadros na folha de contato).`
    );
  }, [isOpen, initialTab]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!isOpen) return null;

  const handleRerunQA = () => {
    const report = runQualityAssurance(project, characters, scenarios);
    setQaReport(report);
    onUpdateMemory(recordVideoOutcome(memory, project, report));
    onLog('info', 'qa_check', 'Relatório de qualidade atualizado e registrado na memória de aprendizado.');
  };

  const handleAutoFixIssues = () => {
    const repairResult = applyLearnedRulesAndAutoRepair(project, memory, characters, scenarios);
    onUpdateProject(repairResult.project);
    const report = runQualityAssurance(repairResult.project, characters, scenarios);
    setQaReport(report);
    const updatedMem = recordVideoOutcome(repairResult.updatedMemory, repairResult.project, report, {
      fixesApplied: repairResult.autoFixesApplied,
    });
    onUpdateMemory(updatedMem);
    onLog(
      'success',
      'learning_memory',
      repairResult.autoFixesApplied.length > 0
        ? `Auto-correção aplicada (${repairResult.autoFixesApplied.length} melhoria(s) gravadas na memória de aprendizado).`
        : 'Plano já conforme todas as regras aprendidas e verificações de QA.'
    );
  };

  const handleStartRender = async (engine: 'ffmpeg_mp4' | 'browser_preview') => {
    if (isRendering) return;
    setIsRendering(true);
    setIsPaused(false);
    setLastExportFile(null);
    setRenderError(null);

    const preset = renderMode === 'preview' ? project.format.previewResolution : project.format.exportResolution;
    onLog(
      'info',
      engine === 'ffmpeg_mp4' ? 'ffmpeg_render' : 'browser_preview_render',
      `Iniciando renderização (${engine === 'ffmpeg_mp4' ? 'FFmpeg MP4 de referência' : 'Preview auxiliar do navegador'}, ${preset}, ${project.format.fps} FPS).`
    );

    const handle =
      engine === 'ffmpeg_mp4'
        ? startFfmpegMp4Export(project, renderMode, characters, scenarios, (st) => setRenderProgress(st))
        : startBrowserPreviewExport(project, renderMode, characters, scenarios, (st) => setRenderProgress(st));

    exportHandleRef.current = handle;

    try {
      const res = await handle.promise;
      if (!res.cancelled && res.blob.size > 0) {
        const safe = project.title.toLowerCase().replace(/[^a-z0-9]+/g, '_') || 'video_2d';
        const suffix = res.rendererUsed === 'ffmpeg_mp4' ? 'ffmpeg' : 'preview_aux';
        const filename = `${safe}_${renderMode}_${suffix}_${res.width}x${res.height}.${res.extension}`;
        downloadBlob(res.blob, filename);
        const sizeMB = (res.blob.size / (1024 * 1024)).toFixed(2);
        setLastExportFile({
          filename,
          sizeMB,
          codecs: res.codecsLabel,
          rendererUsed: res.rendererUsed,
          postRenderVerification: res.postRenderVerification,
        });
        onUpdateProject({
          ...project,
          format: { ...project.format, renderer: engine },
          renderCheckpoint: {
            completedBlocks: project.scenes.length,
            totalBlocks: project.scenes.length,
            lastUpdated: new Date().toISOString(),
            paused: false,
          },
        });
        if (res.postRenderVerification) {
          const pv = res.postRenderVerification;
          onUpdateMemory(
            recordVideoOutcome(memory, project, qaReport, {
              postRenderPassed: pv.passed,
              postRenderBlackEvents: pv.blackEvents,
              postRenderFreezeEvents: pv.freezeEvents,
              postRenderSummary: `${pv.passed ? 'APROVADO' : 'ALERTA'} · ${pv.verifiedDims} · ${pv.verifiedDurationSec.toFixed(1)}s · ${pv.blackEvents} pretos · ${pv.freezeEvents} congelamentos`,
            })
          );
        }
        onLog(
          res.postRenderVerification && !res.postRenderVerification.passed ? 'warn' : 'success',
          'video_export',
          res.postRenderVerification
            ? `Exportação concluída e auditada: ${filename} (${sizeMB} MB · ${res.codecsLabel} · pós-render ${res.postRenderVerification.passed ? 'APROVADO' : 'COM ALERTAS'}).`
            : `Exportação auxiliar concluída: ${filename} (${sizeMB} MB · ${res.codecsLabel}).`
        );
      } else {
        onLog('warn', 'render_manager', 'Renderização cancelada pelo usuário.');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro ao exportar vídeo.';
      setRenderError(msg);
      onLog('error', 'render_manager', msg);
    } finally {
      setIsRendering(false);
      setIsPaused(false);
      exportHandleRef.current = null;
    }
  };

  const handleDownloadPythonBundle = async () => {
    setBundleBusy(true);
    try {
      const name = await downloadPythonDesktopBundle(project);
      onLog('success', 'desktop_packager', `Pacote Windows Python/PySide6 gerado: ${name}`);
    } finally {
      setBundleBusy(false);
    }
  };

  const previewDims = resolveDimensions(project.format.aspectRatio, project.format.previewResolution);
  const finalDims = resolveDimensions(project.format.aspectRatio, project.format.exportResolution);

  return (
    <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
      <div className="w-full max-w-4xl max-h-[90vh] bg-[#121721] border border-[#232C3D] rounded-lg flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-[#232C3D] flex items-center justify-between bg-[#0F131C]">
          <div className="flex items-center gap-4">
            <h2 className="text-sm font-semibold text-[#F1F5F9]">Qualidade, FFmpeg MP4 e Pacote Windows</h2>
            <div className="flex items-center gap-1 p-0.5 bg-[#0B0E14] border border-[#232C3D] rounded">
              <button
                type="button"
                onClick={() => setTab('qa')}
                className={`px-3 py-1 text-xs font-medium rounded ${
                  tab === 'qa' ? 'bg-[#E5A032] text-[#0B0E14]' : 'text-[#94A3B8] hover:text-[#F1F5F9]'
                }`}
              >
                Controle de Qualidade (QA)
              </button>
              <button
                type="button"
                onClick={() => setTab('export')}
                className={`px-3 py-1 text-xs font-medium rounded ${
                  tab === 'export' ? 'bg-[#E5A032] text-[#0B0E14]' : 'text-[#94A3B8] hover:text-[#F1F5F9]'
                }`}
              >
                Renderizador FFmpeg & Arquivos
              </button>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              if (isRendering) exportHandleRef.current?.cancel();
              onClose();
            }}
            className="p-1 text-[#94A3B8] hover:text-[#F1F5F9]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {tab === 'qa' && qaReport && (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[#232C3D]">
                <div className="flex items-center gap-2.5">
                  {qaReport.passed ? (
                    <CheckCircle2 className="w-5 h-5 text-[#16A34A]" />
                  ) : (
                    <AlertTriangle className="w-5 h-5 text-[#D97706]" />
                  )}
                  <div>
                    <div className="text-sm font-semibold text-[#F1F5F9]">
                      {qaReport.passed ? 'Aprovado no controle de qualidade' : 'Alertas detectados no plano'}
                    </div>
                    <div className="text-xs text-[#94A3B8] font-mono tabular-nums">
                      Contrato v{project.schemaVersion} · {qaReport.metrics.width}×{qaReport.metrics.height} · {qaReport.metrics.fps} FPS · {qaReport.metrics.durationSec.toFixed(1)}s
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleAutoFixIssues}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#F1F5F9] bg-[#1A2130] hover:bg-[#212A3D] rounded"
                  >
                    <Wrench className="w-3.5 h-3.5 text-[#E5A032]" />
                    Corrigir problemas detectáveis
                  </button>
                  <button
                    type="button"
                    onClick={handleRerunQA}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#94A3B8] border border-[#232C3D] hover:text-[#F1F5F9] rounded"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    Reexecutar QA
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                {qaReport.checks.map((ck) => (
                  <div
                    key={ck.id}
                    className="p-3 rounded-md border border-[#232C3D] bg-[#0B0E14]/60 flex items-start gap-2.5 text-xs"
                  >
                    {ck.status === 'pass' ? (
                      <CheckCircle2 className="w-4 h-4 text-[#16A34A] shrink-0 mt-0.5" />
                    ) : ck.status === 'warn' ? (
                      <AlertTriangle className="w-4 h-4 text-[#D97706] shrink-0 mt-0.5" />
                    ) : (
                      <XCircle className="w-4 h-4 text-[#DC2626] shrink-0 mt-0.5" />
                    )}
                    <div>
                      <div className="font-medium text-[#F1F5F9]">{ck.label}</div>
                      <div className="text-[#94A3B8] mt-0.5">{ck.detail}</div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-semibold text-[#F1F5F9]">
                    Folha de Contato (Quadros renderizados por cena)
                  </h3>
                  <span className="text-xs font-mono tabular-nums text-[#94A3B8]">
                    {qaReport.contactSheet.length} amostras
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                  {qaReport.contactSheet.map((frame) => (
                    <div
                      key={frame.sceneIndex}
                      className="border border-[#232C3D] rounded bg-[#0B0E14] overflow-hidden"
                    >
                      <img
                        src={frame.dataUrl}
                        alt={frame.sceneTitle}
                        className="w-full h-32 object-cover bg-black"
                      />
                      <div className="p-2 text-[11px]">
                        <div className="font-medium text-[#F1F5F9] truncate">
                          {frame.sceneIndex + 1}. {frame.sceneTitle}
                        </div>
                        <div className="font-mono tabular-nums text-[#94A3B8]">{frame.timeSec.toFixed(1)}s</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {tab === 'export' && (
            <div className="space-y-5">
              {/* Format Presets */}
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
                <label className="space-y-1">
                  <span className="text-[#94A3B8]">Resolução do job</span>
                  <select
                    value={renderMode}
                    disabled={isRendering}
                    onChange={(e) => setRenderMode(e.target.value as 'preview' | 'final')}
                    className="w-full rounded border border-[#232C3D] bg-[#0B0E14] px-2.5 py-2 text-[#F1F5F9]"
                  >
                    <option value="preview">Preview ({previewDims.width}×{previewDims.height})</option>
                    <option value="final">Final ({finalDims.width}×{finalDims.height})</option>
                  </select>
                </label>

                <label className="space-y-1">
                  <span className="text-[#94A3B8]">Qualidade final</span>
                  <select
                    value={project.format.exportResolution}
                    disabled={isRendering}
                    onChange={(e) =>
                      onUpdateProject({
                        ...project,
                        format: { ...project.format, exportResolution: e.target.value as ResolutionPreset },
                      })
                    }
                    className="w-full rounded border border-[#232C3D] bg-[#0B0E14] px-2.5 py-2 font-mono text-[#F1F5F9]"
                  >
                    <option value="480p">480p</option>
                    <option value="540p">540p</option>
                    <option value="720p">720p</option>
                    <option value="1080p">1080p (Full HD)</option>
                  </select>
                </label>

                <label className="space-y-1">
                  <span className="text-[#94A3B8]">Proporção</span>
                  <select
                    value={project.format.aspectRatio}
                    disabled={isRendering}
                    onChange={(e) =>
                      onUpdateProject({
                        ...project,
                        format: { ...project.format, aspectRatio: e.target.value as AspectRatio },
                      })
                    }
                    className="w-full rounded border border-[#232C3D] bg-[#0B0E14] px-2.5 py-2 font-mono text-[#F1F5F9]"
                  >
                    <option value="9:16">9:16 Vertical</option>
                    <option value="16:9">16:9 Widescreen</option>
                    <option value="1:1">1:1 Quadrado</option>
                  </select>
                </label>

                <label className="space-y-1">
                  <span className="text-[#94A3B8]">FPS</span>
                  <select
                    value={project.format.fps}
                    disabled={isRendering}
                    onChange={(e) =>
                      onUpdateProject({
                        ...project,
                        format: { ...project.format, fps: Number(e.target.value) as FPSOption },
                      })
                    }
                    className="w-full rounded border border-[#232C3D] bg-[#0B0E14] px-2.5 py-2 font-mono text-[#F1F5F9]"
                  >
                    <option value={12}>12 FPS</option>
                    <option value={24}>24 FPS</option>
                    <option value={30}>30 FPS</option>
                    <option value={60}>60 FPS</option>
                  </select>
                </label>
              </div>

              {/* PRIMARY AUTHORITATIVE FFMPEG MP4 RENDERER */}
              <div className="border border-[#E5A032]/40 bg-[#0B0E14]/80 rounded-lg p-4 space-y-3.5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="text-sm font-semibold text-[#F1F5F9]">
                      Renderizador Final de Referência — FFmpeg MP4 (H.264 + AAC)
                    </div>
                    <p className="text-xs text-[#94A3B8]">
                      Codificação oficial via FFmpeg local em blocos controlados (CPU-first, sem CUDA, otimizado para Ryzen 3 / 16 GB RAM).
                    </p>
                    <div className="text-[11px] font-mono text-[#94A3B8]">
                      {ffmpegStatus.checked
                        ? ffmpegStatus.available
                          ? `FFmpeg pronto · Vídeo: ${ffmpegStatus.hasLibx264 ? 'libx264 (H.264)' : 'mpeg4'} · Áudio: ${ffmpegStatus.hasAac ? 'AAC 192k' : 'fallback'}`
                          : 'FFmpeg ausente neste host — utilize o pacote Desktop Windows ou o preview auxiliar abaixo.'
                        : 'Verificando binário FFmpeg e codecs...'}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {!isRendering ? (
                      <button
                        type="button"
                        disabled={!ffmpegStatus.available}
                        onClick={() => handleStartRender('ffmpeg_mp4')}
                        className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-[#0B0E14] bg-[#E5A032] hover:bg-[#F0B14B] disabled:opacity-40 rounded-md whitespace-nowrap"
                      >
                        <Film className="w-4 h-4" />
                        Exportar MP4 via FFmpeg
                      </button>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            if (isPaused) {
                              exportHandleRef.current?.resume();
                              setIsPaused(false);
                            } else {
                              exportHandleRef.current?.pause();
                              setIsPaused(true);
                            }
                          }}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#F1F5F9] bg-[#1A2130] hover:bg-[#212A3D] rounded-md"
                        >
                          {isPaused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
                          {isPaused ? 'Retomar' : 'Pausar'}
                        </button>
                        <button
                          type="button"
                          onClick={() => exportHandleRef.current?.cancel()}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#FCA5A5] border border-[#7F1D1D] bg-[#450A0A]/40 rounded-md"
                        >
                          <XCircle className="w-3.5 h-3.5" />
                          Cancelar
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* Progress Bar */}
                {(isRendering || renderProgress.percent > 0) && (
                  <div className="space-y-2 pt-1">
                    <div className="flex items-center justify-between text-xs font-mono tabular-nums">
                      <span className="text-[#F1F5F9]">
                        {isPaused ? 'Pausado (bloco preservado)' : renderProgress.stageLabel || 'Pronto'}
                      </span>
                      <span className="text-[#E5A032]">
                        {renderProgress.percent}% · {renderProgress.elapsedSec.toFixed(1)}s
                      </span>
                    </div>
                    <div className="h-2 bg-[#121721] rounded-full overflow-hidden border border-[#232C3D]">
                      <div
                        className="h-full bg-[#E5A032] transition-all duration-150"
                        style={{ width: `${renderProgress.percent}%` }}
                      />
                    </div>
                  </div>
                )}

                {renderError && (
                  <div className="flex items-start gap-2 text-xs text-[#FCA5A5] pt-1">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{renderError}</span>
                  </div>
                )}

                {lastExportFile && (
                  <div className="space-y-1 pt-1">
                    <div className="flex items-center gap-2 text-xs text-[#86EFAC]">
                      <CheckCircle2 className="w-4 h-4 shrink-0" />
                      <span>
                        Arquivo gerado ({lastExportFile.rendererUsed === 'ffmpeg_mp4' ? 'FFmpeg Oficial' : 'Preview Auxiliar'}):{' '}
                        <strong>{lastExportFile.filename}</strong> ({lastExportFile.sizeMB} MB · {lastExportFile.codecs})
                      </span>
                    </div>
                    {lastExportFile.postRenderVerification && (
                      <div
                        className={`text-[11px] font-mono pl-6 ${
                          lastExportFile.postRenderVerification.passed ? 'text-[#94A3B8]' : 'text-[#FBBF24]'
                        }`}
                      >
                        Auditoria pós-render (ffprobe + blackdetect/freezedetect):{' '}
                        {lastExportFile.postRenderVerification.passed ? 'APROVADO' : 'ALERTA'} ·{' '}
                        {lastExportFile.postRenderVerification.verifiedDims} ·{' '}
                        {lastExportFile.postRenderVerification.verifiedDurationSec.toFixed(1)}s ·{' '}
                        {lastExportFile.postRenderVerification.blackEvents} eventos pretos ·{' '}
                        {lastExportFile.postRenderVerification.freezeEvents} congelamentos
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* SECONDARY EXPLICIT AUXILIARY BROWSER PREVIEW */}
              <div className="border border-[#232C3D] bg-[#0B0E14]/50 rounded-lg p-3.5 flex flex-wrap items-center justify-between gap-3">
                <div className="text-xs">
                  <div className="font-medium text-[#F1F5F9]">Exportação Auxiliar / Preview pelo Navegador</div>
                  <p className="text-[#94A3B8] mt-0.5">
                    Gravação rápida em tempo real via MediaRecorder (WebM/MP4 do navegador). Não substitui o render final FFmpeg H.264/AAC.
                  </p>
                </div>
                <button
                  type="button"
                  disabled={isRendering}
                  onClick={() => handleStartRender('browser_preview')}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#F1F5F9] border border-[#232C3D] bg-[#1A2130] hover:bg-[#212A3D] disabled:opacity-40 rounded whitespace-nowrap"
                >
                  <MonitorPlay className="w-3.5 h-3.5 text-[#94A3B8]" />
                  Exportar preview auxiliar
                </button>
              </div>

              {/* Auxiliary Exports & Windows Python Desktop Bundle */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="border border-[#232C3D] bg-[#0B0E14]/60 rounded-lg p-4 space-y-3">
                  <div className="text-xs font-semibold text-[#F1F5F9]">
                    Contrato JSON v{project.schemaVersion} e Legendas
                  </div>
                  <p className="text-xs text-[#94A3B8]">
                    Mesmo formato canônico compatível com o aplicativo desktop Python/PySide6 e scripts FFmpeg.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => exportProjectJson(project)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#F1F5F9] bg-[#1A2130] hover:bg-[#212A3D] rounded"
                    >
                      <FileJson className="w-3.5 h-3.5 text-[#E5A032]" />
                      Plano JSON v1.0
                    </button>
                    <button
                      type="button"
                      onClick={() => exportSubtitles(project, 'ass')}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#F1F5F9] bg-[#1A2130] hover:bg-[#212A3D] rounded"
                    >
                      <FileText className="w-3.5 h-3.5 text-[#E5A032]" />
                      Legenda .ASS
                    </button>
                    <button
                      type="button"
                      onClick={() => exportSubtitles(project, 'srt')}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#F1F5F9] bg-[#1A2130] hover:bg-[#212A3D] rounded"
                    >
                      <FileText className="w-3.5 h-3.5 text-[#E5A032]" />
                      Legenda .SRT
                    </button>
                  </div>
                </div>

                <div className="border border-[#232C3D] bg-[#0B0E14]/60 rounded-lg p-4 space-y-2.5">
                  <div className="text-xs font-semibold text-[#F1F5F9]">
                    Pacote Desktop Windows (Python + PySide6 + FFmpeg)
                  </div>
                  <p className="text-xs text-[#94A3B8]">
                    Inclui o Contrato JSON v1.0, registro de divergências da Skill, interface PySide6, install.bat, start.bat, spec PyInstaller e testes pytest.
                  </p>
                  <button
                    type="button"
                    disabled={bundleBusy}
                    onClick={handleDownloadPythonBundle}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-[#0B0E14] bg-[#E5A032] hover:bg-[#F0B14B] disabled:opacity-50 rounded"
                  >
                    <Package className="w-3.5 h-3.5" />
                    {bundleBusy ? 'Empacotando ZIP...' : 'Baixar pacote Python/Windows (.zip)'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-[#232C3D] bg-[#0F131C] flex items-center justify-between text-xs">
          <span className="text-[#94A3B8] inline-flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-[#E5A032]" />
            Operação 100% local · FFmpeg como renderizador final de referência · Contrato JSON v1.0
          </span>
          <button
            type="button"
            onClick={() => {
              if (isRendering) exportHandleRef.current?.cancel();
              onClose();
            }}
            className="px-3.5 py-1.5 text-xs font-medium text-[#F1F5F9] border border-[#232C3D] hover:bg-[#1A2130] rounded"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};
