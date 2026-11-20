import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Cpu,
  FileWarning,
  Package,
  RefreshCw,
  Terminal,
  XCircle,
} from 'lucide-react';
import type {
  EnvironmentDiagnostics,
  PerformanceProfile,
  ProjectPlan,
  StudioLogEntry,
  StudioSettings,
} from '../types/studio';
import { PERFORMANCE_LIMITS } from '../data/presets';
import { buildSkillAuditMatrix, PROJECT_SCHEMA_VERSION } from '../contracts/projectContract';
import { downloadPythonDesktopBundle } from '../engines/pythonBundleGenerator';

interface SettingsDiagnosticsViewProps {
  settings: StudioSettings;
  activeProject: ProjectPlan | null;
  logs: StudioLogEntry[];
  onUpdateSettings: (next: StudioSettings) => void;
  onLog: (level: 'info' | 'warn' | 'error' | 'success', module: string, message: string) => void;
}

export const SettingsDiagnosticsView: React.FC<SettingsDiagnosticsViewProps> = ({
  settings,
  activeProject,
  logs,
  onUpdateSettings,
  onLog,
}) => {
  const [diag, setDiag] = useState<EnvironmentDiagnostics | null>(null);
  const [loadingDiag, setLoadingDiag] = useState(false);
  const [ollamaCheckState, setOllamaCheckState] = useState<{
    checked: boolean;
    available: boolean;
    models: string[];
    error?: string;
  }>({ checked: false, available: false, models: [] });
  const [downloadingZip, setDownloadingZip] = useState(false);

  const runDiagnostics = async () => {
    setLoadingDiag(true);
    try {
      const res = await fetch(`/api/diagnostics?ollamaUrl=${encodeURIComponent(settings.ollamaUrl)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as EnvironmentDiagnostics;
      setDiag(data);
      setOllamaCheckState({
        checked: true,
        available: data.ollama.available,
        models: data.ollama.models,
        error: data.ollama.error,
      });
      onLog(
        'info',
        'probe_env',
        `Diagnóstico concluído: FFmpeg ${data.tools.ffmpeg.available ? 'OK' : 'ausente'} (libx264: ${data.tools.ffmpeg.hasLibx264 ? 'sim' : 'não'}) · Skill original no disco: ${data.originalSkill.presentScriptsCount}/${data.originalSkill.expectedScriptsCount}.`
      );
    } catch (err) {
      onLog('error', 'probe_env', err instanceof Error ? err.message : 'Falha ao executar diagnóstico.');
    } finally {
      setLoadingDiag(false);
    }
  };

  useEffect(() => {
    void runDiagnostics();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCheckOllama = async () => {
    try {
      const res = await fetch('/api/ollama/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: settings.ollamaUrl }),
      });
      const data = (await res.json()) as {
        available: boolean;
        models: string[];
        error?: string;
      };
      setOllamaCheckState({ checked: true, ...data });
      if (data.available && data.models.length > 0 && !settings.ollamaModel) {
        onUpdateSettings({ ...settings, ollamaModel: data.models[0] });
      }
      onLog(
        data.available ? 'success' : 'warn',
        'ollama_adapter',
        data.available
          ? `Ollama local conectado (${data.models.length} modelo(s) instalado(s)).`
          : `Ollama indisponível localmente (${data.error ?? 'não encontrado'}). Modo offline ativo.`
      );
    } catch {
      setOllamaCheckState({
        checked: true,
        available: false,
        models: [],
        error: 'Não foi possível contatar o serviço Ollama local.',
      });
    }
  };

  const handleDownloadBundle = async () => {
    setDownloadingZip(true);
    try {
      const filename = await downloadPythonDesktopBundle(activeProject);
      onLog('success', 'desktop_packager', `Pacote desktop Windows baixado: ${filename}`);
    } finally {
      setDownloadingZip(false);
    }
  };

  const skillAudit = buildSkillAuditMatrix(diag?.originalSkill.missingFiles ?? []);

  return (
    <div className="flex-1 overflow-y-auto p-7 space-y-8 max-w-[1360px]">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold text-[#F1F5F9]">Configurações, Diagnóstico Real e Auditoria da Skill</h1>
          <p className="text-xs text-[#94A3B8] mt-0.5">
            Contrato JSON Compartilhado v{PROJECT_SCHEMA_VERSION} · FFmpeg como renderizador final de referência · Transparência integral sem simulações.
          </p>
        </div>
        <button
          type="button"
          onClick={runDiagnostics}
          disabled={loadingDiag}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-[#F1F5F9] border border-[#232C3D] bg-[#121721] hover:bg-[#1A2130] rounded-md whitespace-nowrap"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loadingDiag ? 'animate-spin' : ''}`} />
          Reexecutar diagnóstico
        </button>
      </div>

      {/* Real Environment Diagnostics */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-[#F1F5F9] flex items-center gap-2">
          <Cpu className="w-4 h-4 text-[#E5A032]" />
          Diagnóstico real do ambiente (probe_env)
        </h2>

        {diag ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
            <div className="border border-[#232C3D] bg-[#121721] rounded-lg p-4 space-y-1">
              <div className="text-[#94A3B8]">Sistema & CPU</div>
              <div className="font-medium text-[#F1F5F9] truncate">{diag.platform}</div>
              <div className="font-mono tabular-nums text-[11px] text-[#64748B]">
                {diag.cpu.cores} núcleos · Node {diag.nodeVersion} · Contrato v{diag.schemaVersion}
              </div>
            </div>
            <div className="border border-[#232C3D] bg-[#121721] rounded-lg p-4 space-y-1">
              <div className="text-[#94A3B8]">Memória disponível</div>
              <div className="font-mono tabular-nums text-base font-semibold text-[#F1F5F9]">
                {diag.memory.freeGB} / {diag.memory.totalGB} GB
              </div>
              <div className="text-[11px] text-[#94A3B8]">
                Perfil sugerido: <strong className="text-[#E5A032]">{PERFORMANCE_LIMITS[diag.hardwareRecommendation].label}</strong>
              </div>
            </div>
            <div className="border border-[#232C3D] bg-[#121721] rounded-lg p-4 space-y-1.5">
              <div className="text-[#94A3B8]">FFmpeg (Referência MP4) & Python</div>
              <div className="flex items-center gap-1.5">
                {diag.tools.ffmpeg.available ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-[#16A34A] shrink-0" />
                ) : (
                  <AlertTriangle className="w-3.5 h-3.5 text-[#D97706] shrink-0" />
                )}
                <span className="truncate text-[#F1F5F9]">
                  FFmpeg: {diag.tools.ffmpeg.available ? `OK (x264: ${diag.tools.ffmpeg.hasLibx264 ? 'sim' : 'não'}, aac: ${diag.tools.ffmpeg.hasAac ? 'sim' : 'não'})` : 'Ausente'}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                {diag.tools.python.available ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-[#16A34A] shrink-0" />
                ) : (
                  <AlertTriangle className="w-3.5 h-3.5 text-[#D97706] shrink-0" />
                )}
                <span className="truncate text-[#F1F5F9]">
                  Python: {diag.tools.python.available ? diag.tools.python.version : 'Não instalado neste host'}
                </span>
              </div>
            </div>
            <div className="border border-[#232C3D] bg-[#121721] rounded-lg p-4 space-y-1.5">
              <div className="text-[#94A3B8]">TTS Local & Ollama</div>
              <div className="flex items-center gap-1.5">
                {diag.tools.piper.available || diag.tools.espeak.available ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-[#16A34A] shrink-0" />
                ) : (
                  <AlertTriangle className="w-3.5 h-3.5 text-[#D97706] shrink-0" />
                )}
                <span className="truncate text-[#F1F5F9]">
                  TTS CLI: {diag.tools.piper.available ? 'Piper' : diag.tools.espeak.available ? 'espeak-ng' : 'Indisponível (modo sem narração)'}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                {diag.ollama.available ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-[#16A34A] shrink-0" />
                ) : (
                  <XCircle className="w-3.5 h-3.5 text-[#94A3B8] shrink-0" />
                )}
                <span className="truncate text-[#F1F5F9]">
                  Ollama: {diag.ollama.available ? `${diag.ollama.models.length} modelo(s)` : 'Ausente (motor offline ativo)'}
                </span>
              </div>
            </div>
          </div>
        ) : (
          <div className="border border-[#232C3D] bg-[#121721] rounded-lg p-4 text-xs text-[#94A3B8]">
            Executando verificação real do ambiente...
          </div>
        )}
      </section>

      {/* Original Skill Audit & Divergence Registry (Phase 1 Requirement #1 & #2) */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-[#F1F5F9] flex items-center gap-2">
            <FileWarning className="w-4 h-4 text-[#E5A032]" />
            Auditoria da Skill original (ai-cinematic-video-creator) e Registro de Divergências
          </h2>
          {diag && (
            <span className="text-xs font-mono tabular-nums text-[#94A3B8]">
              Scripts originais em disco: {diag.originalSkill.presentScriptsCount}/{diag.originalSkill.expectedScriptsCount} · ZIP no workspace: {diag.originalSkill.zipDetected ? 'detectado' : 'não encontrado'}
            </span>
          )}
        </div>

        {diag && diag.originalSkill.presentScriptsCount === 0 && (
          <div className="border border-[#D97706]/50 bg-[#1A2130]/60 rounded-lg p-4 text-xs text-[#F1F5F9] space-y-1">
            <div className="font-semibold text-[#FBBF24]">
              Arquivo ZIP original ai-cinematic-video-creator não encontrado no workspace
            </div>
            <p className="text-[#94A3B8] leading-relaxed">
              Para reutilização direta sem substitutos, disponibilize o ZIP original ou extraia seus arquivos em <code className="font-mono text-[#F1F5F9]">original_skill/</code>. Enquanto isso, cada módulo substituto abaixo está explicitamente documentado com motivo e diferenças funcionais.
            </p>
          </div>
        )}

        <div className="border border-[#232C3D] bg-[#121721] rounded-lg overflow-hidden">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-[#232C3D] bg-[#0F131C] text-[11px] font-medium text-[#94A3B8]">
                <th className="py-2.5 px-4">Módulo da Skill</th>
                <th className="py-2.5 px-4">Situação real</th>
                <th className="py-2.5 px-4">Motivo e diferenças funcionais</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#232C3D]">
              {skillAudit.map((row) => (
                <tr key={row.modulePath} className="hover:bg-[#1A2130]/40">
                  <td className="py-2.5 px-4 font-mono text-[#F1F5F9] whitespace-nowrap align-top">
                    {row.modulePath}
                  </td>
                  <td className="py-2.5 px-4 whitespace-nowrap align-top">
                    {row.presentOnDisk ? (
                      <span className="inline-flex items-center gap-1.5 text-[#86EFAC]">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Original preservado
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-[#FBBF24]">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        Substituto documentado
                      </span>
                    )}
                  </td>
                  <td className="py-2.5 px-4 text-[#94A3B8] space-y-0.5">
                    <div className="text-[#F1F5F9]">{row.purpose}</div>
                    <div>{row.functionalDifferences}</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Ollama Local Optional Connector + Hardware Profile */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-6 border border-[#232C3D] bg-[#121721] rounded-lg p-5 space-y-4 text-xs">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-[#F1F5F9]">Inteligência Artificial Local (Ollama opcional)</h3>
              <p className="text-[#94A3B8] mt-0.5">
                O sistema funciona integralmente sem internet, sem APIs pagas e sem Ollama. Ative apenas se tiver o Ollama rodando localmente.
              </p>
            </div>
            <label className="inline-flex items-center gap-2 text-[#F1F5F9] shrink-0">
              <input
                type="checkbox"
                checked={settings.ollamaEnabled}
                onChange={(e) => onUpdateSettings({ ...settings, ollamaEnabled: e.target.checked })}
                className="accent-[#E5A032]"
              />
              Ativar Ollama
            </label>
          </div>

          <div className="flex items-end gap-2">
            <label className="flex-1 space-y-1">
              <span className="text-[#94A3B8]">Endpoint local Ollama</span>
              <input
                type="text"
                value={settings.ollamaUrl}
                onChange={(e) => onUpdateSettings({ ...settings, ollamaUrl: e.target.value })}
                className="w-full rounded border border-[#232C3D] bg-[#0B0E14] px-3 py-2 font-mono text-xs text-[#F1F5F9]"
              />
            </label>
            <button
              type="button"
              onClick={handleCheckOllama}
              className="px-3.5 py-2 text-xs font-medium text-[#0B0E14] bg-[#E5A032] hover:bg-[#F0B14B] rounded whitespace-nowrap"
            >
              Verificar modelos
            </button>
          </div>

          {ollamaCheckState.checked && (
            <div className="p-3 rounded border border-[#232C3D] bg-[#0B0E14]/70 space-y-2">
              {ollamaCheckState.available ? (
                <>
                  <div className="flex items-center gap-1.5 text-[#86EFAC] font-medium">
                    <CheckCircle2 className="w-4 h-4" />
                    Ollama local acessível ({ollamaCheckState.models.length} modelos detectados)
                  </div>
                  {ollamaCheckState.models.length > 0 && (
                    <select
                      value={settings.ollamaModel}
                      onChange={(e) => onUpdateSettings({ ...settings, ollamaModel: e.target.value })}
                      className="w-full rounded border border-[#232C3D] bg-[#121721] px-2.5 py-1.5 font-mono text-[#F1F5F9]"
                    >
                      {ollamaCheckState.models.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                  )}
                </>
              ) : (
                <div className="flex items-start gap-2 text-[#94A3B8]">
                  <AlertTriangle className="w-4 h-4 text-[#D97706] shrink-0 mt-0.5" />
                  <div>
                    <div className="text-[#F1F5F9] font-medium">Ollama local não detectado</div>
                    <p className="mt-0.5">
                      Alternativa local ativa: motor determinístico de regras e templates offline sem GPU NVIDIA ou internet.
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Performance Profiles + Windows Desktop Package */}
        <div className="lg:col-span-6 space-y-4">
          <div className="border border-[#232C3D] bg-[#121721] rounded-lg p-5 space-y-3 text-xs">
            <h3 className="text-sm font-semibold text-[#F1F5F9]">Perfil padrão de desempenho (Ryzen 3 3200G / Vega 8 / 16 GB)</h3>
            <div className="grid grid-cols-3 gap-2">
              {(['economico', 'equilibrado', 'qualidade'] as PerformanceProfile[]).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => onUpdateSettings({ ...settings, defaultProfile: p })}
                  className={`p-3 rounded border text-left transition-colors ${
                    settings.defaultProfile === p
                      ? 'border-[#E5A032] bg-[#1A2130]'
                      : 'border-[#232C3D] bg-[#0B0E14]/50 hover:bg-[#1A2130]/50'
                  }`}
                >
                  <div className="font-semibold text-[#F1F5F9]">{PERFORMANCE_LIMITS[p].label}</div>
                  <div className="text-[11px] font-mono tabular-nums text-[#94A3B8] mt-1">
                    Até {PERFORMANCE_LIMITS[p].maxParticles} partículas
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="border border-[#232C3D] bg-[#121721] rounded-lg p-5 space-y-3 text-xs">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-[#F1F5F9]">Pacote Desktop Windows (Python + PySide6 + FFmpeg)</h3>
                <p className="text-[#94A3B8] mt-0.5">
                  Compatível com o mesmo Contrato JSON v{PROJECT_SCHEMA_VERSION}, com Registro de Divergências, install.bat, start.bat e spec PyInstaller.
                </p>
              </div>
              <button
                type="button"
                disabled={downloadingZip}
                onClick={handleDownloadBundle}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-[#0B0E14] bg-[#E5A032] hover:bg-[#F0B14B] disabled:opacity-50 rounded-md whitespace-nowrap shrink-0"
              >
                <Package className="w-4 h-4" />
                {downloadingZip ? 'Gerando...' : 'Baixar .ZIP'}
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Activity Logs */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-[#F1F5F9] flex items-center gap-2">
          <Terminal className="w-4 h-4 text-[#E5A032]" />
          Registro de atividades e tratamento de erros ({logs.length})
        </h2>
        <div className="border border-[#232C3D] bg-[#0B0E14] rounded-lg max-h-60 overflow-y-auto divide-y divide-[#232C3D]/60 font-mono text-xs">
          {logs.length === 0 ? (
            <div className="p-4 text-[#64748B]">Nenhum evento registrado ainda.</div>
          ) : (
            logs.map((entry) => (
              <div key={entry.id} className="px-4 py-2 flex items-start gap-3">
                <span className="text-[#64748B] tabular-nums shrink-0">{entry.timestamp}</span>
                <span
                  className={`shrink-0 w-14 uppercase ${
                    entry.level === 'error'
                      ? 'text-[#EF4444]'
                      : entry.level === 'warn'
                      ? 'text-[#D97706]'
                      : entry.level === 'success'
                      ? 'text-[#16A34A]'
                      : 'text-[#38BDF8]'
                  }`}
                >
                  {entry.level}
                </span>
                <span className="text-[#94A3B8] shrink-0">[{entry.module}]</span>
                <span className="text-[#F1F5F9]">{entry.message}</span>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
};
