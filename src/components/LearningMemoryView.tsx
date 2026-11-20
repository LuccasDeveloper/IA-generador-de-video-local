import React, { useState } from 'react';
import {
  AlertTriangle,
  Brain,
  CheckCircle2,
  Film,
  PlusCircle,
  Power,
  RotateCcw,
  Trash2,
  Wrench,
} from 'lucide-react';
import type { ProjectPlan, StudioMemoryState } from '../types/studio';
import { ERROR_LEARNING_CATALOG } from '../engines/learningMemory';

interface LearningMemoryViewProps {
  memory: StudioMemoryState;
  projects: ProjectPlan[];
  activeProject: ProjectPlan | null;
  onRecordFeedback: (projectId: string, errorCode: string, note: string) => void;
  onToggleRule: (ruleId: string) => void;
  onApplyMemoryToActiveProject: () => void;
  onOpenProject: (projectId: string) => void;
  onResetMemory: () => void;
}

const GENRE_LABELS: Record<string, string> = {
  horror: 'Terror',
  scifi: 'Ficção Científica',
  adventure: 'Aventura',
  drama: 'Drama Noir',
  educational: 'Educativo Retrô',
};

const SOURCE_LABELS: Record<string, string> = {
  qa_auto: 'QA Automático',
  post_render: 'Pós-render FFmpeg',
  user_feedback: 'Feedback do Diretor',
};

export const LearningMemoryView: React.FC<LearningMemoryViewProps> = ({
  memory,
  projects,
  activeProject,
  onRecordFeedback,
  onToggleRule,
  onApplyMemoryToActiveProject,
  onOpenProject,
  onResetMemory,
}) => {
  const defaultTargetId = activeProject?.id ?? memory.videos[0]?.projectId ?? projects[0]?.id ?? '';
  const [selectedVideoId, setSelectedVideoId] = useState<string>(defaultTargetId);
  const [selectedErrorCode, setSelectedErrorCode] = useState<string>('REPETITIVE_CAMERA');
  const [feedbackNote, setFeedbackNote] = useState<string>('');
  const [confirmReset, setConfirmReset] = useState<boolean>(false);

  const errorOptions = Object.values(ERROR_LEARNING_CATALOG);
  const activeRulesCount = memory.rules.filter((r) => r.active).length;

  const selectableVideos = [
    ...memory.videos.map((v) => ({ projectId: v.projectId, title: v.title, genre: v.genre })),
    ...projects
      .filter((p) => !memory.videos.some((v) => v.projectId === p.id))
      .map((p) => ({ projectId: p.id, title: p.title, genre: p.genre })),
  ];

  const effectiveVideoId =
    selectableVideos.some((v) => v.projectId === selectedVideoId)
      ? selectedVideoId
      : selectableVideos[0]?.projectId ?? '';

  const handleSubmitFeedback = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedErrorCode) return;
    onRecordFeedback(effectiveVideoId || 'global_feedback', selectedErrorCode, feedbackNote.trim());
    setFeedbackNote('');
  };

  return (
    <div className="flex-1 overflow-y-auto p-7 space-y-8 max-w-[1360px]">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold text-[#F1F5F9] flex items-center gap-2">
            <Brain className="w-5 h-5 text-[#E5A032]" />
            Memória de Vídeos Passados e Aprendizado por Erros
          </h1>
          <p className="text-xs text-[#94A3B8] mt-1 max-w-2xl leading-relaxed">
            Armazenamento 100% local (<code className="font-mono text-[#F1F5F9]">data/studio_memory.json</code> + navegador).
            O motor lembra dos vídeos já produzidos para evitar repetição de enquadramentos e transforma cada falha de QA,
            pós-render FFmpeg ou feedback manual em uma regra determinística aplicada automaticamente nas próximas gerações.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {activeProject && (
            <button
              type="button"
              onClick={onApplyMemoryToActiveProject}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-[#0B0E14] bg-[#E5A032] hover:bg-[#F0B14B] rounded-md transition-colors whitespace-nowrap"
            >
              <Wrench className="w-3.5 h-3.5" />
              Aplicar regras no projeto ativo
            </button>
          )}
          {!confirmReset ? (
            <button
              type="button"
              onClick={() => setConfirmReset(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-[#94A3B8] border border-[#232C3D] bg-[#121721] hover:text-[#FCA5A5] hover:border-[#7F1D1D] rounded-md transition-colors whitespace-nowrap"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Limpar memória
            </button>
          ) : (
            <div className="inline-flex items-center gap-1.5 border border-[#7F1D1D] bg-[#450A0A]/40 px-2.5 py-1.5 rounded-md text-xs">
              <span className="text-[#FCA5A5]">Confirmar limpeza?</span>
              <button
                type="button"
                onClick={() => {
                  onResetMemory();
                  setConfirmReset(false);
                }}
                className="px-2 py-0.5 rounded bg-[#DC2626] text-white font-medium"
              >
                Sim
              </button>
              <button
                type="button"
                onClick={() => setConfirmReset(false)}
                className="px-2 py-0.5 rounded border border-[#232C3D] text-[#F1F5F9]"
              >
                Cancelar
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="border border-[#232C3D] bg-[#121721] rounded-lg p-4 space-y-1">
          <div className="text-xs text-[#94A3B8]">Vídeos lembrados</div>
          <div className="text-2xl font-mono tabular-nums font-semibold text-[#F1F5F9]">
            {memory.videos.length}
          </div>
          <div className="text-[11px] text-[#64748B]">
            Consultados em cada geração para variar enquadramentos e preservar consistência
          </div>
        </div>
        <div className="border border-[#232C3D] bg-[#121721] rounded-lg p-4 space-y-1">
          <div className="text-xs text-[#94A3B8]">Regras aprendidas ativas</div>
          <div className="text-2xl font-mono tabular-nums font-semibold text-[#E5A032]">
            {activeRulesCount} <span className="text-sm text-[#64748B]">/ {memory.rules.length}</span>
          </div>
          <div className="text-[11px] text-[#64748B]">
            Criadas a partir de erros de QA, auditoria FFmpeg e revisões do usuário
          </div>
        </div>
        <div className="border border-[#232C3D] bg-[#121721] rounded-lg p-4 space-y-1">
          <div className="text-xs text-[#94A3B8]">Auto-correções executadas</div>
          <div className="text-2xl font-mono tabular-nums font-semibold text-[#86EFAC]">
            {memory.totalAutoFixes}
          </div>
          <div className="text-[11px] text-[#64748B]">
            Melhorias determinísticas aplicadas antes do render final
          </div>
        </div>
      </div>

      {/* Teach the System Form */}
      <section className="border border-[#232C3D] bg-[#121721] rounded-lg p-5 space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-[#F1F5F9] flex items-center gap-2">
            <PlusCircle className="w-4 h-4 text-[#E5A032]" />
            Registrar erro observado para o sistema aprender
          </h2>
          <p className="text-xs text-[#94A3B8] mt-0.5">
            Informe qualquer problema percebido em um vídeo gerado. A regra correspondente será ativada imediatamente e aplicada em todas as próximas produções.
          </p>
        </div>

        <form onSubmit={handleSubmitFeedback} className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end text-xs">
          <label className="md:col-span-3 space-y-1">
            <span className="text-[#94A3B8]">Vídeo de referência</span>
            <select
              value={effectiveVideoId}
              onChange={(e) => setSelectedVideoId(e.target.value)}
              className="w-full rounded border border-[#232C3D] bg-[#0B0E14] px-2.5 py-2 text-[#F1F5F9]"
            >
              {selectableVideos.length === 0 ? (
                <option value="">Regra geral do estúdio</option>
              ) : (
                selectableVideos.map((v) => (
                  <option key={v.projectId} value={v.projectId}>
                    {v.title} ({GENRE_LABELS[v.genre] ?? v.genre})
                  </option>
                ))
              )}
            </select>
          </label>

          <label className="md:col-span-4 space-y-1">
            <span className="text-[#94A3B8]">Tipo de erro detectado</span>
            <select
              value={selectedErrorCode}
              onChange={(e) => setSelectedErrorCode(e.target.value)}
              className="w-full rounded border border-[#232C3D] bg-[#0B0E14] px-2.5 py-2 text-[#F1F5F9]"
            >
              {errorOptions.map((opt) => (
                <option key={opt.errorCode} value={opt.errorCode}>
                  {opt.title}
                </option>
              ))}
            </select>
          </label>

          <label className="md:col-span-3 space-y-1">
            <span className="text-[#94A3B8]">Observação (opcional)</span>
            <input
              type="text"
              value={feedbackNote}
              onChange={(e) => setFeedbackNote(e.target.value)}
              placeholder="Ex.: Cena 3 repetiu plano anterior..."
              className="w-full rounded border border-[#232C3D] bg-[#0B0E14] px-3 py-2 text-[#F1F5F9] placeholder-[#64748B]"
            />
          </label>

          <div className="md:col-span-2">
            <button
              type="submit"
              className="w-full px-3.5 py-2 text-xs font-semibold text-[#0B0E14] bg-[#E5A032] hover:bg-[#F0B14B] rounded transition-colors whitespace-nowrap"
            >
              Aprender regra
            </button>
          </div>
        </form>
      </section>

      {/* Learned Rules Table */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-[#F1F5F9]">
          Regras aprendidas com erros ({memory.rules.length})
        </h2>

        {memory.rules.length === 0 ? (
          <div className="border border-[#232C3D] bg-[#121721] rounded-lg p-6 text-xs text-[#94A3B8]">
            Nenhuma regra de erro registrada ainda. Assim que o QA, a auditoria FFmpeg ou você registrar um erro acima, o sistema passa a preveni-lo automaticamente.
          </div>
        ) : (
          <div className="border border-[#232C3D] bg-[#121721] rounded-lg overflow-hidden">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-[#232C3D] bg-[#0F131C] text-[11px] font-medium text-[#94A3B8]">
                  <th className="py-2.5 px-4">Regra e Estratégia</th>
                  <th className="py-2.5 px-4">Origem</th>
                  <th className="py-2.5 px-4 text-right">Ocorrências</th>
                  <th className="py-2.5 px-4 text-right">Auto-corrigido</th>
                  <th className="py-2.5 px-4 text-right">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#232C3D]">
                {memory.rules.map((rule) => (
                  <tr key={rule.id} className="hover:bg-[#1A2130]/40">
                    <td className="py-3 px-4 space-y-1">
                      <div className="font-medium text-[#F1F5F9] flex items-center gap-2">
                        <span>{rule.title}</span>
                        <code className="text-[10px] font-mono text-[#64748B]">{rule.errorCode}</code>
                      </div>
                      <div className="text-[#94A3B8]">{rule.description}</div>
                      <div className="text-[11px] text-[#E5A032]/90">Ação automática: {rule.strategy}</div>
                    </td>
                    <td className="py-3 px-4 text-[#94A3B8] whitespace-nowrap align-top">
                      {SOURCE_LABELS[rule.source] ?? rule.source}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-[#F1F5F9] align-top">
                      {rule.occurrences}×
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-[#86EFAC] align-top">
                      {rule.autoFixedCount}×
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap align-top">
                      <button
                        type="button"
                        onClick={() => onToggleRule(rule.id)}
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-medium border transition-colors ${
                          rule.active
                            ? 'border-[#16A34A]/60 bg-[#14532D]/30 text-[#86EFAC]'
                            : 'border-[#232C3D] bg-[#0B0E14] text-[#64748B]'
                        }`}
                      >
                        <Power className="w-3 h-3" />
                        {rule.active ? 'Ativa' : 'Pausada'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Remembered Past Videos */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-[#F1F5F9] flex items-center gap-2">
          <Film className="w-4 h-4 text-[#E5A032]" />
          Histórico de vídeos lembrados ({memory.videos.length})
        </h2>

        {memory.videos.length === 0 ? (
          <div className="border border-[#232C3D] bg-[#121721] rounded-lg p-6 text-xs text-[#94A3B8]">
            Nenhum vídeo registrado na memória ainda. Gere ou valide um projeto para que o estúdio comece a lembrar das suas produções anteriores.
          </div>
        ) : (
          <div className="space-y-3">
            {memory.videos.map((vid) => {
              const existsInProjects = projects.some((p) => p.id === vid.projectId);
              return (
                <div
                  key={vid.id}
                  className="border border-[#232C3D] bg-[#121721] rounded-lg p-4 space-y-2.5 text-xs"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        {vid.qaPassed ? (
                          <CheckCircle2 className="w-4 h-4 text-[#16A34A] shrink-0" />
                        ) : (
                          <AlertTriangle className="w-4 h-4 text-[#D97706] shrink-0" />
                        )}
                        <span className="text-sm font-semibold text-[#F1F5F9]">{vid.title}</span>
                        <span className="font-mono text-[11px] text-[#94A3B8]">
                          {GENRE_LABELS[vid.genre] ?? vid.genre} · {vid.durationSec.toFixed(1)}s · {vid.aspectRatio} · {vid.sceneCount} cenas
                        </span>
                      </div>
                      <p className="text-[#94A3B8] line-clamp-2">{vid.prompt}</p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className="font-mono tabular-nums text-[11px] text-[#E5A032]">
                        Fidelidade {vid.scriptFidelityScore}%
                      </span>
                      {existsInProjects && (
                        <button
                          type="button"
                          onClick={() => onOpenProject(vid.projectId)}
                          className="px-2.5 py-1 text-[11px] font-medium text-[#0B0E14] bg-[#E5A032] hover:bg-[#F0B14B] rounded"
                        >
                          Abrir
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setSelectedVideoId(vid.projectId)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-[#94A3B8] border border-[#232C3D] hover:text-[#F1F5F9] rounded"
                      >
                        <RotateCcw className="w-3 h-3" />
                        Reportar erro
                      </button>
                    </div>
                  </div>

                  <div className="text-[11px] font-mono text-[#64748B]">
                    Planos: {vid.framingSequence.join(' → ')}
                  </div>

                  {vid.postRenderSummary && (
                    <div className="text-[11px] font-mono text-[#94A3B8]">
                      Pós-render FFmpeg: {vid.postRenderSummary}
                    </div>
                  )}

                  {vid.fixesApplied.length > 0 && (
                    <div className="pt-1.5 border-t border-[#232C3D]/70 text-[11px] text-[#86EFAC] space-y-0.5">
                      <div className="font-medium">Melhorias aplicadas automaticamente:</div>
                      {vid.fixesApplied.slice(0, 4).map((fx, idx) => (
                        <div key={idx}>• {fx}</div>
                      ))}
                    </div>
                  )}

                  {vid.userFeedback.length > 0 && (
                    <div className="pt-1.5 border-t border-[#232C3D]/70 text-[11px] text-[#FBBF24] space-y-0.5">
                      <div className="font-medium">Lições registradas pelo usuário:</div>
                      {vid.userFeedback.map((fb) => (
                        <div key={fb.id}>
                          • [{fb.errorCode}] {fb.note}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
};
