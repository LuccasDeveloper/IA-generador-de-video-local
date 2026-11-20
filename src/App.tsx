/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  Brain,
  Clapperboard,
  Film,
  FolderKanban,
  Home,
  Layers,
  LayoutTemplate,
  Music,
  PlusSquare,
  Settings,
  Users,
} from 'lucide-react';
import type {
  AspectRatio,
  AudioConfig,
  CharacterDefinition,
  FPSOption,
  PerformanceProfile,
  ProductionStep,
  ProjectPlan,
  ScenarioDefinition,
  SfxType,
  StudioLogEntry,
  StudioMemoryState,
  StudioSection,
  StudioSettings,
  VisualStyleProfile,
} from './types/studio';
import {
  loadLibraryCharacters,
  loadLibraryScenarios,
  loadSavedProjects,
  loadStudioSettings,
  saveLibraryCharacters,
  saveLibraryScenarios,
  saveProjects,
  saveStudioSettings,
} from './engines/storage';
import { generateProjectPlan } from './engines/promptEngine';
import { runQualityAssurance } from './engines/qaAndValidation';
import {
  applyLearnedRulesAndAutoRepair,
  createEmptyMemoryState,
  fetchServerMemory,
  loadLocalMemory,
  mergeMemoryStates,
  recordUserErrorFeedback,
  recordVideoOutcome,
  saveLocalMemory,
  syncMemoryToServer,
  toggleLearnedRule,
} from './engines/learningMemory';
import { parseAndValidateProjectJson } from './contracts/projectContract';
import { HomeDashboard } from './components/HomeDashboard';
import { VideoEditorView } from './components/VideoEditorView';
import { CharacterStudioView } from './components/CharacterStudioView';
import { ScenarioLibraryView } from './components/ScenarioLibraryView';
import { AudioLibraryView } from './components/AudioLibraryView';
import { LearningMemoryView } from './components/LearningMemoryView';
import { SettingsDiagnosticsView } from './components/SettingsDiagnosticsView';
import { ExportAndQAModal } from './components/ExportAndQAModal';

const PIPELINE_STEP_LABELS = [
  'Receber prompt',
  'Interpretar ideia',
  'Criar roteiro',
  'Definir personagens',
  'Montar storyboard',
  'Organizar cenas',
  'Associar cenários',
  'Definir animações',
  'Câmera e iluminação',
  'Sintetizar áudio',
  'Sincronizar legendas',
  'Validar plano JSON',
  'Preparar preview',
  'Executar QA inicial',
  'Ajustes automáticos',
  'Salvar checkpoint',
  'Abrir editor 2D',
];

const SECTION_TITLES: Record<StudioSection, string> = {
  home: 'Início',
  new_project: 'Novo projeto',
  projects: 'Meus projetos',
  editor: 'Editor de vídeo 2D',
  characters: 'Personagens',
  scenarios: 'Cenários',
  audio: 'Biblioteca de áudio',
  memory: 'Memória & Aprendizado',
  templates: 'Templates',
  settings: 'Configurações',
};

export default function App() {
  const [section, setSection] = useState<StudioSection>('home');
  const [projects, setProjects] = useState<ProjectPlan[]>(() => loadSavedProjects());
  const [characters, setCharacters] = useState<CharacterDefinition[]>(() => loadLibraryCharacters());
  const [scenarios, setScenarios] = useState<ScenarioDefinition[]>(() => loadLibraryScenarios());
  const [settings, setSettings] = useState<StudioSettings>(() => loadStudioSettings());
  const [memory, setMemory] = useState<StudioMemoryState>(() => loadLocalMemory());
  const [activeProjectId, setActiveProjectId] = useState<string | null>(() => projects[0]?.id ?? null);

  const [logs, setLogs] = useState<StudioLogEntry[]>([
    {
      id: 'boot_1',
      timestamp: new Date().toLocaleTimeString('pt-BR'),
      level: 'info',
      module: 'studio_core',
      message: 'AI 2D Video Studio inicializado em modo local com memória persistente e aprendizado por erros.',
    },
  ]);

  // Production pipeline state (17 steps)
  const [isProducing, setIsProducing] = useState(false);
  const [productionSteps, setProductionSteps] = useState<ProductionStep[]>([]);
  const [productionElapsedSec, setProductionElapsedSec] = useState(0);
  const cancelProdRef = useRef(false);

  // Export & QA Modal
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [exportModalTab, setExportModalTab] = useState<'qa' | 'export'>('qa');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const activeProject = projects.find((p) => p.id === activeProjectId) ?? null;

  const appendLog = (level: StudioLogEntry['level'], module: string, message: string) => {
    const entry: StudioLogEntry = {
      id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      timestamp: new Date().toLocaleTimeString('pt-BR'),
      level,
      module,
      message,
    };
    setLogs((prev) => [entry, ...prev].slice(0, 120));
  };

  const showToast = (msg: string) => {
    setToastMessage(msg);
    window.setTimeout(() => {
      setToastMessage((curr) => (curr === msg ? null : curr));
    }, 3600);
  };

  const persistMemory = (next: StudioMemoryState) => {
    setMemory(next);
    saveLocalMemory(next);
    void syncMemoryToServer(next);
  };

  // Load persistent disk memory from /api/memory on boot and merge with local cache
  useEffect(() => {
    let mounted = true;
    void fetchServerMemory().then((remote) => {
      if (!mounted || !remote) return;
      setMemory((curr) => {
        const merged = mergeMemoryStates(curr, remote);
        saveLocalMemory(merged);
        return merged;
      });
    });
    return () => {
      mounted = false;
    };
  }, []);

  // Persist locally on updates
  useEffect(() => {
    if (settings.autoSaveProjects) saveProjects(projects);
  }, [projects, settings.autoSaveProjects]);

  useEffect(() => {
    saveLibraryCharacters(characters);
  }, [characters]);

  useEffect(() => {
    saveLibraryScenarios(scenarios);
  }, [scenarios]);

  useEffect(() => {
    saveStudioSettings(settings);
  }, [settings]);

  const handleUpdateProject = (updated: ProjectPlan) => {
    const stamped = { ...updated, updatedAt: new Date().toISOString() };
    setProjects((prev) => prev.map((p) => (p.id === stamped.id ? stamped : p)));
  };

  const handleStartProduction = async (params: {
    prompt: string;
    aspectRatio: AspectRatio;
    durationSec: number;
    fps: FPSOption;
    performanceProfile: PerformanceProfile;
    narrationMode: AudioConfig['narrationMode'];
    visualStyle?: VisualStyleProfile;
    educationalTopicId?: string;
    educationalFacts?: string;
  }) => {
    cancelProdRef.current = false;
    setIsProducing(true);
    setProductionElapsedSec(0);
    const startWall = performance.now();

    const initialSteps: ProductionStep[] = PIPELINE_STEP_LABELS.map((label, idx) => ({
      id: `step_${idx + 1}`,
      stepNumber: idx + 1,
      label,
      status: 'pending',
    }));
    setProductionSteps(initialSteps);
    appendLog(
      'info',
      'pipeline',
      `Iniciando produção automática (${params.visualStyle === 'retro_pixel_educational' ? 'RETRO PIXEL EDUCATIONAL' : 'Cinematográfico 2D'}, ${params.aspectRatio}, ${params.durationSec}s, ${params.fps} FPS).`
    );

    const advanceStep = async (idx: number, delayMs = 75) => {
      if (cancelProdRef.current) throw new Error('CANCELLED');
      setProductionSteps((prev) =>
        prev.map((s, i) => ({
          ...s,
          status: i < idx ? 'done' : i === idx ? 'running' : 'pending',
        }))
      );
      setProductionElapsedSec((performance.now() - startWall) / 1000);
      await new Promise((r) => window.setTimeout(r, delayMs));
    };

    try {
      await advanceStep(0, 60);
      await advanceStep(1, 70);
      await advanceStep(2, 70);

      let plan = await generateProjectPlan({
        prompt: params.prompt,
        aspectRatio: params.aspectRatio,
        durationSec: params.durationSec,
        fps: params.fps,
        performanceProfile: params.performanceProfile,
        narrationMode: params.narrationMode,
        visualStyle: params.visualStyle,
        educationalTopicId: params.educationalTopicId,
        educationalFacts: params.educationalFacts,
        availableCharacters: characters,
        availableScenarios: scenarios,
        useOllama: settings.ollamaEnabled,
        ollamaUrl: settings.ollamaUrl,
        ollamaModel: settings.ollamaModel,
        memory,
      });

      let latestMemory = memory;
      let qaReport = runQualityAssurance(plan, characters, scenarios);

      for (let stepIdx = 3; stepIdx < PIPELINE_STEP_LABELS.length; stepIdx++) {
        await advanceStep(stepIdx, 50);
        if (stepIdx === 13) {
          qaReport = runQualityAssurance(plan, characters, scenarios);
          const errors = qaReport.issues.filter((i) => i.severity === 'error');
          if (errors.length > 0) {
            appendLog('warn', 'qa_initial', `QA inicial detectou ${errors.length} erro(s): ${errors[0].message}`);
          }
        }
        if (stepIdx === 14) {
          // Real closed-loop auto-repair + learning from errors & remembered past videos
          const repair = applyLearnedRulesAndAutoRepair(plan, latestMemory, characters, scenarios);
          plan = repair.project;
          qaReport = runQualityAssurance(plan, characters, scenarios);
          latestMemory = recordVideoOutcome(repair.updatedMemory, plan, qaReport, {
            fixesApplied: repair.autoFixesApplied,
          });
          if (repair.autoFixesApplied.length > 0 || repair.avoidedPatterns.length > 0) {
            appendLog(
              'info',
              'learning_memory',
              `Auto-aprendizado aplicado: ${repair.autoFixesApplied.length} ajuste(s), ${repair.avoidedPatterns.length} padrão(ões) variado(s) com base em ${memory.videos.length} vídeo(s) lembrado(s).`
            );
          }
        }
      }

      setProductionSteps((prev) => prev.map((s) => ({ ...s, status: 'done' })));
      setProductionElapsedSec((performance.now() - startWall) / 1000);

      persistMemory(latestMemory);
      setProjects((prev) => [plan, ...prev]);
      setActiveProjectId(plan.id);
      setSection('editor');
      appendLog(
        'success',
        'pipeline',
        `Projeto "${plan.title}" criado com ${plan.scenes.length} cenas (${plan.totalDuration.toFixed(1)}s) · Fidelidade ${qaReport.metrics.scriptFidelityScore}% · Salvo na memória do estúdio.`
      );
      showToast(`Projeto "${plan.title}" pronto no Editor 2D.`);
    } catch (err) {
      if (err instanceof Error && err.message === 'CANCELLED') {
        setProductionSteps((prev) =>
          prev.map((s) => (s.status === 'running' ? { ...s, status: 'cancelled' } : s))
        );
        appendLog('warn', 'pipeline', 'Produção automática cancelada pelo usuário.');
      } else {
        appendLog('error', 'pipeline', err instanceof Error ? err.message : 'Erro inesperado na produção.');
      }
    } finally {
      setIsProducing(false);
    }
  };

  const handleImportProjectJson = (jsonText: string) => {
    const { project: validated, issues } = parseAndValidateProjectJson(jsonText);
    if (!validated) {
      const firstErr = issues.find((i) => i.severity === 'error')?.message ?? 'Contrato JSON v1.0 inválido.';
      appendLog('error', 'contract_v1', `Importação rejeitada: ${firstErr}`);
      showToast(`Erro no Contrato JSON v1.0: ${firstErr}`);
      return;
    }

    const imported: ProjectPlan = {
      ...validated,
      id: `proj_imp_${Date.now().toString(36)}`,
      updatedAt: new Date().toISOString(),
    };
    setProjects((prev) => [imported, ...prev]);
    setActiveProjectId(imported.id);
    setSection('editor');
    const warnCount = issues.filter((i) => i.severity === 'warning').length;
    appendLog(
      'success',
      'contract_v1',
      `Projeto JSON v1.0 importado: "${imported.title}"${warnCount > 0 ? ` (${warnCount} normalização aplicada)` : ''}.`
    );
    showToast(`Projeto "${imported.title}" importado (Contrato v1.0).`);
  };

  const handleDuplicateProject = (projectId: string) => {
    const target = projects.find((p) => p.id === projectId);
    if (!target) return;
    const copy: ProjectPlan = {
      ...JSON.parse(JSON.stringify(target)),
      id: `proj_${Date.now().toString(36)}`,
      title: `${target.title} (Cópia)`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setProjects((prev) => [copy, ...prev]);
    appendLog('info', 'projects', `Projeto duplicado: "${copy.title}".`);
  };

  const handleDeleteProject = (projectId: string) => {
    setProjects((prev) => prev.filter((p) => p.id !== projectId));
    if (activeProjectId === projectId) {
      setActiveProjectId(null);
      if (section === 'editor') setSection('projects');
    }
    appendLog('info', 'projects', 'Projeto removido da biblioteca local.');
  };

  const handleAddSfxFromAudioLibrary = (sfx: SfxType, label: string) => {
    if (!activeProject || activeProject.scenes.length === 0) return;
    const first = activeProject.scenes[0];
    const safeOffset = Math.max(0, Number(Math.min(first.duration - 0.3, 0.5).toFixed(2)));
    const updatedScenes = activeProject.scenes.map((sc, idx) =>
      idx === 0
        ? {
            ...sc,
            sfxEvents: [
              ...sc.sfxEvents,
              {
                id: `sfx_${Date.now().toString(36)}`,
                sfx,
                offsetSec: safeOffset,
                volume: 0.85,
                label,
              },
            ],
          }
        : sc
    );
    handleUpdateProject({ ...activeProject, scenes: updatedScenes });
    showToast(`SFX "${label}" adicionado à Cena 1 de "${activeProject.title}".`);
  };

  const handleRecordUserFeedback = (projectId: string, errorCode: string, note: string) => {
    const next = recordUserErrorFeedback(memory, projectId, errorCode, note);
    persistMemory(next);
    appendLog('success', 'learning_memory', `Nova regra aprendida por feedback do usuário (${errorCode}).`);
    showToast(`Erro registrado. O sistema aprendeu a prevenir "${errorCode}".`);
  };

  const handleToggleRule = (ruleId: string) => {
    const next = toggleLearnedRule(memory, ruleId);
    persistMemory(next);
  };

  const handleApplyMemoryToActiveProject = () => {
    if (!activeProject) return;
    const repair = applyLearnedRulesAndAutoRepair(activeProject, memory, characters, scenarios);
    handleUpdateProject(repair.project);
    const report = runQualityAssurance(repair.project, characters, scenarios);
    const nextMem = recordVideoOutcome(repair.updatedMemory, repair.project, report, {
      fixesApplied: repair.autoFixesApplied,
    });
    persistMemory(nextMem);
    appendLog(
      'success',
      'learning_memory',
      `Regras aprendidas aplicadas em "${repair.project.title}": ${repair.autoFixesApplied.length} melhoria(s), ${repair.avoidedPatterns.length} variação(ões).`
    );
    showToast(
      repair.autoFixesApplied.length > 0
        ? `${repair.autoFixesApplied.length} melhoria(s) aplicada(s) em "${repair.project.title}".`
        : `"${repair.project.title}" já atende todas as regras aprendidas.`
    );
  };

  const handleResetMemory = () => {
    const empty = createEmptyMemoryState();
    setMemory(empty);
    saveLocalMemory(empty);
    void fetch('/api/memory', { method: 'DELETE' }).catch(() => {});
    appendLog('warn', 'learning_memory', 'Memória de vídeos e regras aprendidas limpa pelo usuário.');
    showToast('Memória de aprendizado reiniciada.');
  };

  const navItems: Array<{ id: StudioSection; label: string; icon: React.ComponentType<{ className?: string }> }> = [
    { id: 'home', label: 'Início', icon: Home },
    { id: 'new_project', label: 'Novo projeto', icon: PlusSquare },
    { id: 'projects', label: 'Meus projetos', icon: FolderKanban },
    { id: 'characters', label: 'Personagens', icon: Users },
    { id: 'scenarios', label: 'Cenários', icon: Layers },
    { id: 'audio', label: 'Biblioteca de áudio', icon: Music },
    { id: 'memory', label: 'Memória & Aprendizado', icon: Brain },
    { id: 'templates', label: 'Templates', icon: LayoutTemplate },
    { id: 'settings', label: 'Configurações', icon: Settings },
  ];

  return (
    <div className="h-screen w-screen overflow-hidden flex bg-[#0B0E14] text-[#F1F5F9]">
      {/* Fixed Desktop Sidebar (232px) */}
      <aside className="w-[232px] shrink-0 border-r border-[#232C3D] bg-[#0F131C] flex flex-col justify-between">
        <div className="flex flex-col min-h-0">
          {/* Brand Mark */}
          <div className="h-14 px-5 border-b border-[#232C3D] flex items-center gap-2.5">
            <Clapperboard className="w-5 h-5 text-[#E5A032] shrink-0" />
            <span className="font-semibold text-sm tracking-tight text-[#F1F5F9] whitespace-nowrap">
              AI 2D Video Studio
            </span>
          </div>

          {/* Primary Navigation */}
          <nav className="p-3 space-y-0.5 overflow-y-auto">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = section === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSection(item.id)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                    active
                      ? 'bg-[#1A2130] text-[#F1F5F9]'
                      : 'text-[#94A3B8] hover:text-[#F1F5F9] hover:bg-[#121721]'
                  }`}
                >
                  <Icon className={`w-4 h-4 shrink-0 ${active ? 'text-[#E5A032]' : 'text-[#64748B]'}`} />
                  <span className="truncate">{item.label}</span>
                </button>
              );
            })}

            {activeProject && (
              <div className="pt-3 mt-3 border-t border-[#232C3D]">
                <div className="px-3 pb-1.5 text-[11px] font-medium text-[#64748B]">Projeto ativo</div>
                <button
                  type="button"
                  onClick={() => setSection('editor')}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-xs font-medium transition-colors ${
                    section === 'editor'
                      ? 'bg-[#E5A032] text-[#0B0E14] font-semibold'
                      : 'bg-[#121721] text-[#F1F5F9] hover:bg-[#1A2130] border border-[#232C3D]'
                  }`}
                >
                  <Film className="w-4 h-4 shrink-0" />
                  <span className="truncate">{activeProject.title}</span>
                </button>
              </div>
            )}
          </nav>
        </div>

        {/* Quiet Local Mode Summary */}
        <div className="p-4 border-t border-[#232C3D] text-[11px] text-[#64748B] space-y-1">
          <div className="text-[#94A3B8] font-medium">Execução 100% local</div>
          <div className="font-mono tabular-nums">
            {projects.length} proj. · {memory.videos.length} mem. · {memory.rules.filter((r) => r.active).length} regras
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Clean Contextual Top Bar */}
        <header className="h-14 shrink-0 px-6 border-b border-[#232C3D] bg-[#0F131C] flex items-center justify-between gap-8">
          <div className="flex items-center gap-2 text-xs text-[#94A3B8] min-w-0">
            <span className="text-[#F1F5F9] font-medium whitespace-nowrap">Estúdio</span>
            <span aria-hidden="true">/</span>
            <span className="truncate">{SECTION_TITLES[section]}</span>
            {activeProject && section === 'editor' && (
              <>
                <span aria-hidden="true">/</span>
                <span className="text-[#E5A032] font-medium truncate">{activeProject.title}</span>
              </>
            )}
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {activeProject && section !== 'editor' && (
              <button
                type="button"
                onClick={() => setSection('editor')}
                className="px-3.5 py-1.5 text-xs font-semibold text-[#0B0E14] bg-[#E5A032] hover:bg-[#F0B14B] rounded-md transition-colors whitespace-nowrap shrink-0"
              >
                Voltar ao editor
              </button>
            )}
            {!activeProject && section !== 'new_project' && section !== 'home' && (
              <button
                type="button"
                onClick={() => setSection('new_project')}
                className="px-3.5 py-1.5 text-xs font-semibold text-[#0B0E14] bg-[#E5A032] hover:bg-[#F0B14B] rounded-md transition-colors whitespace-nowrap shrink-0"
              >
                Criar vídeo
              </button>
            )}
          </div>
        </header>

        {/* Active View */}
        {(section === 'home' || section === 'new_project' || section === 'projects' || section === 'templates') && (
          <HomeDashboard
            mode={section}
            projects={projects}
            activeProjectId={activeProjectId}
            defaultAspectRatio={settings.defaultAspectRatio}
            defaultFps={settings.defaultFps}
            defaultProfile={settings.defaultProfile}
            ollamaReady={settings.ollamaEnabled && Boolean(settings.ollamaModel)}
            ollamaModel={settings.ollamaModel}
            isProducing={isProducing}
            productionSteps={productionSteps}
            productionElapsedSec={productionElapsedSec}
            onStartProduction={handleStartProduction}
            onCancelProduction={() => {
              cancelProdRef.current = true;
            }}
            onOpenProject={(id) => {
              setActiveProjectId(id);
              setSection('editor');
            }}
            onDuplicateProject={handleDuplicateProject}
            onDeleteProject={handleDeleteProject}
            onImportProjectJson={handleImportProjectJson}
            onNavigate={setSection}
          />
        )}

        {section === 'editor' && activeProject && (
          <VideoEditorView
            project={activeProject}
            characters={characters}
            scenarios={scenarios}
            showSafeArea={settings.showSafeArea}
            onToggleSafeArea={() =>
              setSettings((prev) => ({ ...prev, showSafeArea: !prev.showSafeArea }))
            }
            onUpdateProject={handleUpdateProject}
            onOpenExportModal={(initialTab) => {
              setExportModalTab(initialTab);
              setExportModalOpen(true);
            }}
          />
        )}

        {section === 'characters' && (
          <CharacterStudioView
            characters={characters}
            onAddCharacter={(ch) => {
              setCharacters((prev) => [ch, ...prev]);
              appendLog('success', 'sprite_manager', `Personagem "${ch.name}" adicionado à biblioteca.`);
              showToast(`Personagem "${ch.name}" salvo na biblioteca.`);
            }}
            onUpdateCharacter={(ch) => {
              setCharacters((prev) => prev.map((c) => (c.id === ch.id ? ch : c)));
            }}
          />
        )}

        {section === 'scenarios' && (
          <ScenarioLibraryView
            scenarios={scenarios}
            onUpdateScenario={(sc) => {
              setScenarios((prev) => prev.map((item) => (item.id === sc.id ? sc : item)));
            }}
            onAddScenario={(sc) => {
              setScenarios((prev) => [sc, ...prev]);
              appendLog('success', 'scenario_library', `Cenário "${sc.name}" criado.`);
              showToast(`Cenário "${sc.name}" adicionado.`);
            }}
          />
        )}

        {section === 'audio' && (
          <AudioLibraryView
            activeProject={activeProject}
            onUpdateProject={handleUpdateProject}
            onAddSfxToActiveScene={handleAddSfxFromAudioLibrary}
          />
        )}

        {section === 'memory' && (
          <LearningMemoryView
            memory={memory}
            projects={projects}
            activeProject={activeProject}
            onRecordFeedback={handleRecordUserFeedback}
            onToggleRule={handleToggleRule}
            onApplyMemoryToActiveProject={handleApplyMemoryToActiveProject}
            onOpenProject={(id) => {
              setActiveProjectId(id);
              setSection('editor');
            }}
            onResetMemory={handleResetMemory}
          />
        )}

        {section === 'settings' && (
          <SettingsDiagnosticsView
            settings={settings}
            activeProject={activeProject}
            logs={logs}
            onUpdateSettings={setSettings}
            onLog={appendLog}
          />
        )}
      </div>

      {/* QA & Export Modal */}
      {activeProject && (
        <ExportAndQAModal
          isOpen={exportModalOpen}
          initialTab={exportModalTab}
          project={activeProject}
          characters={characters}
          scenarios={scenarios}
          memory={memory}
          onClose={() => setExportModalOpen(false)}
          onUpdateProject={handleUpdateProject}
          onUpdateMemory={persistMemory}
          onLog={appendLog}
        />
      )}

      {/* Subtle Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-5 right-5 z-50 px-4 py-2.5 rounded-md border border-[#E5A032]/50 bg-[#1A2130] text-xs font-medium text-[#F1F5F9] shadow-lg">
          {toastMessage}
        </div>
      )}
    </div>
  );
}
