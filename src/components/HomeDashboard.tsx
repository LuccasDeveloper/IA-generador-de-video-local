import React, { useRef, useState } from 'react';
import {
  Clapperboard,
  FolderOpen,
  Play,
  Plus,
  Trash2,
  Upload,
  Download,
  XCircle,
  CheckCircle2,
  Loader2,
  Copy,
} from 'lucide-react';
import type {
  AspectRatio,
  AudioConfig,
  FPSOption,
  PerformanceProfile,
  ProductionStep,
  ProjectPlan,
  StudioSection,
  VisualStyleProfile,
} from '../types/studio';
import { PERFORMANCE_LIMITS, PRODUCTION_TEMPLATES } from '../data/presets';
import { VERIFIED_EDUCATIONAL_TOPICS } from '../data/retroEducationalKnowledge';
import { exportProjectJson } from '../engines/videoExporter';

interface HomeDashboardProps {
  mode: 'home' | 'new_project' | 'projects' | 'templates';
  projects: ProjectPlan[];
  activeProjectId: string | null;
  defaultAspectRatio: AspectRatio;
  defaultFps: FPSOption;
  defaultProfile: PerformanceProfile;
  ollamaReady: boolean;
  ollamaModel: string;
  isProducing: boolean;
  productionSteps: ProductionStep[];
  productionElapsedSec: number;
  onStartProduction: (params: {
    prompt: string;
    aspectRatio: AspectRatio;
    durationSec: number;
    fps: FPSOption;
    performanceProfile: PerformanceProfile;
    narrationMode: AudioConfig['narrationMode'];
    visualStyle?: VisualStyleProfile;
    educationalTopicId?: string;
    educationalFacts?: string;
  }) => void;
  onCancelProduction: () => void;
  onOpenProject: (projectId: string) => void;
  onDuplicateProject: (projectId: string) => void;
  onDeleteProject: (projectId: string) => void;
  onImportProjectJson: (jsonText: string) => void;
  onNavigate: (section: StudioSection) => void;
}

const GENRE_LABELS: Record<string, string> = {
  horror: 'Terror',
  scifi: 'Ficção Científica',
  adventure: 'Aventura',
  drama: 'Drama Noir',
  educational: 'Educativo Retrô',
};

export const HomeDashboard: React.FC<HomeDashboardProps> = ({
  mode,
  projects,
  activeProjectId,
  defaultAspectRatio,
  defaultFps,
  defaultProfile,
  ollamaReady,
  ollamaModel,
  isProducing,
  productionSteps,
  productionElapsedSec,
  onStartProduction,
  onCancelProduction,
  onOpenProject,
  onDuplicateProject,
  onDeleteProject,
  onImportProjectJson,
  onNavigate,
}) => {
  const [visualStyle, setVisualStyle] = useState<VisualStyleProfile>('cinematic_2d');
  const [educationalTopicId, setEducationalTopicId] = useState<string>('auto');
  const [educationalFacts, setEducationalFacts] = useState<string>('');
  const [prompt, setPrompt] = useState(PRODUCTION_TEMPLATES[0].prompt);
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>(defaultAspectRatio);
  const [durationSec, setDurationSec] = useState<number>(30);
  const [fps, setFps] = useState<FPSOption>(defaultFps);
  const [profile, setProfile] = useState<PerformanceProfile>(defaultProfile);
  const [narrationMode, setNarrationMode] = useState<AudioConfig['narrationMode']>('none');
  const [searchQuery, setSearchQuery] = useState('');
  const [genreFilter, setGenreFilter] = useState<string>('all');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const selectedTopicObj = VERIFIED_EDUCATIONAL_TOPICS.find((t) => t.id === educationalTopicId);

  const handleVisualStyleChange = (nextStyle: VisualStyleProfile) => {
    setVisualStyle(nextStyle);
    if (nextStyle === 'retro_pixel_educational') {
      const firstEduTpl = PRODUCTION_TEMPLATES.find((t) => t.visualStyle === 'retro_pixel_educational');
      if (firstEduTpl && prompt === PRODUCTION_TEMPLATES[0].prompt) {
        setPrompt(firstEduTpl.prompt);
        setAspectRatio(firstEduTpl.aspectRatio);
        setDurationSec(firstEduTpl.duration);
      }
      setNarrationMode('none');
    } else {
      const firstEduTpl = PRODUCTION_TEMPLATES.find((t) => t.visualStyle === 'retro_pixel_educational');
      if (firstEduTpl && prompt === firstEduTpl.prompt) {
        setPrompt(PRODUCTION_TEMPLATES[0].prompt);
      }
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim() || isProducing) return;
    onStartProduction({
      prompt: prompt.trim(),
      aspectRatio,
      durationSec,
      fps,
      performanceProfile: profile,
      narrationMode,
      visualStyle,
      educationalTopicId:
        visualStyle === 'retro_pixel_educational' && educationalTopicId !== 'auto'
          ? educationalTopicId
          : undefined,
      educationalFacts:
        visualStyle === 'retro_pixel_educational' && educationalFacts.trim()
          ? educationalFacts.trim()
          : undefined,
    });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        onImportProjectJson(reader.result);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const applyTemplate = (tpl: (typeof PRODUCTION_TEMPLATES)[number]) => {
    const nextStyle: VisualStyleProfile = tpl.visualStyle ?? 'cinematic_2d';
    setVisualStyle(nextStyle);
    setEducationalTopicId(tpl.educationalTopicId ?? 'auto');
    setPrompt(tpl.prompt);
    setAspectRatio(tpl.aspectRatio);
    setDurationSec(tpl.duration);
    setNarrationMode(tpl.narration ? 'web_speech' : 'none');
    if (mode === 'templates') {
      onNavigate('new_project');
    }
  };

  const filteredProjects = projects.filter((p) => {
    const matchesText =
      !searchQuery.trim() ||
      p.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.prompt.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesGenre = genreFilter === 'all' || p.genre === genreFilter;
    return matchesText && matchesGenre;
  });

  const doneCount = productionSteps.filter((s) => s.status === 'done').length;
  const prodPercent =
    productionSteps.length > 0 ? Math.round((doneCount / productionSteps.length) * 100) : 0;

  return (
    <div className="flex-1 overflow-y-auto px-8 py-7 space-y-8 max-w-[1360px]">
      <input
        ref={fileInputRef}
        type="file"
        accept=".json,application/json"
        className="hidden"
        onChange={handleFileChange}
      />

      {/* Production Progress Banner (Background-safe, non-blocking) */}
      {(isProducing || productionSteps.some((s) => s.status === 'done' || s.status === 'error')) && (
        <section className="border border-[#232C3D] bg-[#121721] rounded-lg p-5 space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold text-[#F1F5F9]">
                {isProducing ? 'Produção automática em andamento' : 'Última execução do pipeline'}
              </h2>
              <p className="text-xs text-[#94A3B8] mt-0.5 tabular-nums">
                Etapas concluídas: {doneCount}/{productionSteps.length} · Progresso: {prodPercent}% · Tempo decorrido: {productionElapsedSec.toFixed(1)}s
              </p>
            </div>
            {isProducing && (
              <button
                type="button"
                onClick={onCancelProduction}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#FCA5A5] border border-[#7F1D1D] bg-[#450A0A]/40 rounded-md hover:bg-[#7F1D1D]/40 transition-colors whitespace-nowrap shrink-0"
              >
                <XCircle className="w-3.5 h-3.5" />
                Cancelar produção
              </button>
            )}
          </div>

          <div className="h-2 bg-[#0B0E14] rounded-full overflow-hidden border border-[#232C3D]">
            <div
              className="h-full bg-[#E5A032] transition-all duration-200"
              style={{ width: `${prodPercent}%` }}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-2">
            {productionSteps.map((step) => (
              <div
                key={step.id}
                className={`flex items-center gap-2 px-2.5 py-1.5 rounded text-xs border ${
                  step.status === 'running'
                    ? 'border-[#E5A032]/70 bg-[#1A2130] text-[#F1F5F9]'
                    : step.status === 'done'
                    ? 'border-[#232C3D] bg-[#0B0E14]/60 text-[#94A3B8]'
                    : 'border-transparent bg-[#0B0E14]/30 text-[#64748B]'
                }`}
              >
                {step.status === 'done' ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-[#16A34A] shrink-0" />
                ) : step.status === 'running' ? (
                  <Loader2 className="w-3.5 h-3.5 text-[#E5A032] animate-spin shrink-0" />
                ) : (
                  <span className="w-3.5 text-center font-mono text-[10px] text-[#64748B] tabular-nums">
                    {step.stepNumber}
                  </span>
                )}
                <span className="truncate">{step.label}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Primary Prompt Creation Area */}
      {(mode === 'home' || mode === 'new_project') && (
        <section className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-[#F1F5F9]">
                {mode === 'new_project' ? 'Novo projeto de animação 2D' : 'Estúdio de produção 2D por texto'}
              </h1>
              <p className="text-sm text-[#94A3B8] mt-1">
                Escreva sua ideia em português ou inglês. O estúdio interpreta gênero, cenas, personagens, câmera, iluminação, áudio procedural e legendas localmente.
              </p>
            </div>
            <div className="flex items-center gap-3 text-xs text-[#94A3B8]">
              <span>
                Motor de planejamento:{' '}
                <strong className="font-medium text-[#F1F5F9]">
                  {ollamaReady && ollamaModel ? `Ollama local (${ollamaModel})` : 'Regras e templates offline'}
                </strong>
              </span>
              <span aria-hidden="true">·</span>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-1.5 text-[#E5A032] hover:text-[#F0B14B] font-medium whitespace-nowrap"
              >
                <Upload className="w-3.5 h-3.5" />
                Importar plano JSON
              </button>
            </div>
          </div>

          <form
            onSubmit={handleSubmit}
            className="border border-[#232C3D] bg-[#121721] rounded-lg p-5 space-y-5"
          >
            {/* Visual Style Profile Selector */}
            <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-[#232C3D]">
              <div>
                <div className="text-xs font-medium text-[#F1F5F9]">Estilo visual do motor 2D</div>
                <div className="text-[11px] text-[#94A3B8] mt-0.5">
                  {visualStyle === 'retro_pixel_educational'
                    ? 'Grade nativa 16-bit (180×320 nearest-neighbor), personagens carismáticos, infográficos animados, chiptune e fatos verificados.'
                    : 'Animação 2D cinematográfica com iluminação dinâmica, parallax, rigging articulado e trilha atmosférica.'}
                </div>
              </div>
              <div className="inline-flex items-center p-0.5 bg-[#0B0E14] border border-[#232C3D] rounded-md">
                <button
                  type="button"
                  onClick={() => handleVisualStyleChange('cinematic_2d')}
                  className={`px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap ${
                    visualStyle === 'cinematic_2d'
                      ? 'bg-[#1A2130] text-[#F1F5F9]'
                      : 'text-[#94A3B8] hover:text-[#F1F5F9]'
                  }`}
                >
                  Cinematográfico 2D
                </button>
                <button
                  type="button"
                  onClick={() => handleVisualStyleChange('retro_pixel_educational')}
                  className={`px-3 py-1.5 text-xs font-semibold rounded transition-colors whitespace-nowrap ${
                    visualStyle === 'retro_pixel_educational'
                      ? 'bg-[#E5A032] text-[#0B0E14]'
                      : 'text-[#94A3B8] hover:text-[#F1F5F9]'
                  }`}
                >
                  RETRO PIXEL EDUCATIONAL
                </button>
              </div>
            </div>

            <div>
              <label htmlFor="studio-prompt" className="block text-xs font-medium text-[#94A3B8] mb-2">
                {visualStyle === 'retro_pixel_educational'
                  ? 'Tema educativo ou curiosidade científica'
                  : 'Descrição do vídeo'}
              </label>
              <textarea
                id="studio-prompt"
                rows={4}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder={
                  visualStyle === 'retro_pixel_educational'
                    ? 'Ex.: Explique o que acontece no cérebro quando tomamos algo muito gelado...'
                    : 'Descreva o vídeo que deseja criar...'
                }
                className="w-full rounded-md border border-[#232C3D] bg-[#0B0E14] px-4 py-3 text-sm text-[#F1F5F9] placeholder-[#64748B] focus:outline-none focus:border-[#E5A032] leading-relaxed resize-y"
              />
            </div>

            {visualStyle === 'retro_pixel_educational' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 rounded-md border border-[#232C3D] bg-[#0B0E14]/70">
                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-[#F1F5F9]">
                    Base científica offline verificada
                  </label>
                  <select
                    value={educationalTopicId}
                    onChange={(e) => {
                      const nextId = e.target.value;
                      setEducationalTopicId(nextId);
                      const found = VERIFIED_EDUCATIONAL_TOPICS.find((t) => t.id === nextId);
                      if (found) {
                        setPrompt(found.defaultPrompt);
                      }
                    }}
                    className="w-full rounded-md border border-[#232C3D] bg-[#1A2130] px-3 py-2 text-xs text-[#F1F5F9] focus:outline-none focus:border-[#E5A032]"
                  >
                    <option value="auto">Detectar automaticamente pelo prompt ({VERIFIED_EDUCATIONAL_TOPICS.length} tópicos)</option>
                    {VERIFIED_EDUCATIONAL_TOPICS.map((topic) => (
                      <option key={topic.id} value={topic.id}>
                        {topic.title} ({topic.domainLabel})
                      </option>
                    ))}
                  </select>
                  <p className="text-[11px] text-[#94A3B8] leading-relaxed">
                    {selectedTopicObj
                      ? `Fonte: ${selectedTopicObj.sourceCitation} · ${selectedTopicObj.verifiedFacts.length} fatos verificados.`
                      : 'Sem invenção de dados: usa fatos verificados offline ou os fatos próprios informados ao lado.'}
                  </p>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-[#F1F5F9]">
                    Fatos próprios verificados (opcional — 1 fato por linha)
                  </label>
                  <textarea
                    rows={3}
                    value={educationalFacts}
                    onChange={(e) => setEducationalFacts(e.target.value)}
                    placeholder={'Ex.:\nA luz do Sol leva cerca de 8 minutos para chegar à Terra.\nA velocidade da luz no vácuo é de ~300.000 km/s.'}
                    className="w-full rounded-md border border-[#232C3D] bg-[#121721] px-3 py-2 text-xs text-[#F1F5F9] placeholder-[#64748B] focus:outline-none focus:border-[#E5A032] resize-y"
                  />
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
              <div>
                <label className="block text-xs text-[#94A3B8] mb-1.5">Formato</label>
                <select
                  value={aspectRatio}
                  onChange={(e) => setAspectRatio(e.target.value as AspectRatio)}
                  className="w-full rounded-md border border-[#232C3D] bg-[#1A2130] px-3 py-2 text-xs text-[#F1F5F9] focus:outline-none focus:border-[#E5A032]"
                >
                  <option value="9:16">9:16 Vertical (Reels/Shorts)</option>
                  <option value="16:9">16:9 Horizontal (Cinema)</option>
                  <option value="1:1">1:1 Quadrado</option>
                </select>
              </div>

              <div>
                <label className="block text-xs text-[#94A3B8] mb-1.5">
                  Duração <span className="font-mono tabular-nums text-[#F1F5F9]">({durationSec}s)</span>
                </label>
                <input
                  type="range"
                  min={12}
                  max={90}
                  step={2}
                  value={durationSec}
                  onChange={(e) => setDurationSec(Number(e.target.value))}
                  className="w-full mt-2"
                />
              </div>

              <div>
                <label className="block text-xs text-[#94A3B8] mb-1.5">Taxa de quadros</label>
                <select
                  value={fps}
                  onChange={(e) => setFps(Number(e.target.value) as FPSOption)}
                  className="w-full rounded-md border border-[#232C3D] bg-[#1A2130] px-3 py-2 text-xs text-[#F1F5F9] font-mono tabular-nums focus:outline-none focus:border-[#E5A032]"
                >
                  <option value={12}>12 FPS (Estilizado)</option>
                  <option value={24}>24 FPS (Padrão Cinema)</option>
                  <option value={30}>30 FPS (Fluido)</option>
                  <option value={60}>60 FPS (Alta fluidez)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs text-[#94A3B8] mb-1.5">Perfil de hardware</label>
                <select
                  value={profile}
                  onChange={(e) => setProfile(e.target.value as PerformanceProfile)}
                  className="w-full rounded-md border border-[#232C3D] bg-[#1A2130] px-3 py-2 text-xs text-[#F1F5F9] focus:outline-none focus:border-[#E5A032]"
                >
                  <option value="economico">Econômico (CPU leve)</option>
                  <option value="equilibrado">Equilibrado (Vega 8 / 16GB)</option>
                  <option value="qualidade">Qualidade máxima</option>
                </select>
              </div>

              <div>
                <label className="block text-xs text-[#94A3B8] mb-1.5">Narração e legendas</label>
                <select
                  value={narrationMode}
                  onChange={(e) => setNarrationMode(e.target.value as AudioConfig['narrationMode'])}
                  className="w-full rounded-md border border-[#232C3D] bg-[#1A2130] px-3 py-2 text-xs text-[#F1F5F9] focus:outline-none focus:border-[#E5A032]"
                >
                  <option value="none">Sem narração (SFX + trilha)</option>
                  <option value="web_speech">TTS local do sistema + legendas</option>
                  <option value="piper_local">Adaptador Piper (Desktop)</option>
                  <option value="espeak_local">Adaptador espeak-ng (Desktop)</option>
                </select>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-4 pt-2 border-t border-[#232C3D]">
              <div className="text-xs text-[#94A3B8]">
                {PERFORMANCE_LIMITS[profile].description}
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setPrompt('')}
                  className="px-3.5 py-2 text-xs font-medium text-[#94A3B8] hover:text-[#F1F5F9] border border-[#232C3D] rounded-md transition-colors whitespace-nowrap"
                >
                  Limpar
                </button>
                <button
                  type="submit"
                  disabled={isProducing || !prompt.trim()}
                  className="inline-flex items-center gap-2 px-5 py-2 text-xs font-semibold text-[#0B0E14] bg-[#E5A032] hover:bg-[#F0B14B] disabled:opacity-50 rounded-md transition-colors whitespace-nowrap"
                >
                  {isProducing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Produzindo cenas...
                    </>
                  ) : (
                    <>
                      <Clapperboard className="w-4 h-4" />
                      Criar vídeo
                    </>
                  )}
                </button>
              </div>
            </div>
          </form>
        </section>
      )}

      {/* Templates Gallery */}
      {(mode === 'home' || mode === 'templates') && (
        <section className="space-y-3.5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-[#F1F5F9]">Modelos de produção prontos</h2>
              <p className="text-xs text-[#94A3B8] mt-0.5">
                Roteiros calibrados com câmera dinâmica, cenários parallax e efeitos sonoros cinematográficos.
              </p>
            </div>
            {mode === 'home' && (
              <button
                type="button"
                onClick={() => onNavigate('templates')}
                className="text-xs text-[#E5A032] hover:text-[#F0B14B] font-medium whitespace-nowrap"
              >
                Ver todos os modelos
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {PRODUCTION_TEMPLATES.map((tpl) => (
              <div
                key={tpl.id}
                className="border border-[#232C3D] bg-[#121721] rounded-lg p-4 flex flex-col justify-between gap-4 hover:border-[#323F57] transition-colors"
              >
                <div className="space-y-2">
                  <div className="text-xs text-[#94A3B8] flex items-center gap-1.5 font-mono tabular-nums">
                    <span>{GENRE_LABELS[tpl.genre]}</span>
                    <span aria-hidden="true">·</span>
                    <span>{tpl.duration}s</span>
                    <span aria-hidden="true">·</span>
                    <span>{tpl.aspectRatio}</span>
                  </div>
                  <h3 className="text-sm font-semibold text-[#F1F5F9]">{tpl.title}</h3>
                  <p className="text-xs text-[#94A3B8] leading-relaxed">{tpl.summary}</p>
                </div>

                <div className="flex items-center gap-2 pt-2 border-t border-[#232C3D]">
                  <button
                    type="button"
                    onClick={() => applyTemplate(tpl)}
                    className="flex-1 px-3 py-1.5 text-xs font-medium text-[#F1F5F9] bg-[#1A2130] hover:bg-[#212A3D] rounded-md transition-colors whitespace-nowrap"
                  >
                    Carregar prompt
                  </button>
                  <button
                    type="button"
                    disabled={isProducing}
                    onClick={() =>
                      onStartProduction({
                        prompt: tpl.prompt,
                        aspectRatio: tpl.aspectRatio,
                        durationSec: tpl.duration,
                        fps,
                        performanceProfile: profile,
                        narrationMode: tpl.narration ? 'web_speech' : 'none',
                        visualStyle: tpl.visualStyle ?? 'cinematic_2d',
                        educationalTopicId: tpl.educationalTopicId,
                      })
                    }
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-[#0B0E14] bg-[#E5A032] hover:bg-[#F0B14B] disabled:opacity-50 rounded-md transition-colors whitespace-nowrap"
                  >
                    <Play className="w-3 h-3" />
                    Produzir
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Projects List */}
      {(mode === 'home' || mode === 'projects') && (
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold text-[#F1F5F9]">
                {mode === 'projects' ? 'Meus projetos salvos' : 'Projetos recentes'}
              </h2>
              <p className="text-xs text-[#94A3B8] mt-0.5 tabular-nums">
                {projects.length} projeto(s) armazenados localmente no estúdio
              </p>
            </div>

            <div className="flex items-center gap-2.5">
              {mode === 'projects' && (
                <>
                  <input
                    type="search"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Buscar projeto..."
                    className="rounded-md border border-[#232C3D] bg-[#121721] px-3 py-1.5 text-xs text-[#F1F5F9] placeholder-[#64748B] focus:outline-none focus:border-[#E5A032] w-48"
                  />
                  <div className="flex items-center gap-1 p-0.5 bg-[#121721] border border-[#232C3D] rounded-md">
                    {['all', 'horror', 'scifi', 'adventure', 'drama', 'educational'].map((g) => (
                      <button
                        key={g}
                        type="button"
                        onClick={() => setGenreFilter(g)}
                        className={`px-2.5 py-1 text-xs rounded transition-colors whitespace-nowrap ${
                          genreFilter === g
                            ? 'bg-[#1A2130] text-[#F1F5F9] font-medium'
                            : 'text-[#94A3B8] hover:text-[#F1F5F9]'
                        }`}
                      >
                        {g === 'all' ? 'Todos' : GENRE_LABELS[g]}
                      </button>
                    ))}
                  </div>
                </>
              )}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#F1F5F9] border border-[#232C3D] bg-[#121721] hover:bg-[#1A2130] rounded-md transition-colors whitespace-nowrap"
              >
                <Upload className="w-3.5 h-3.5" />
                Importar JSON
              </button>
              {mode === 'projects' && (
                <button
                  type="button"
                  onClick={() => onNavigate('new_project')}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-[#0B0E14] bg-[#E5A032] hover:bg-[#F0B14B] rounded-md transition-colors whitespace-nowrap"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Novo projeto
                </button>
              )}
            </div>
          </div>

          {filteredProjects.length === 0 ? (
            <div className="border border-[#232C3D] bg-[#121721] rounded-lg p-10 text-center space-y-3">
              <FolderOpen className="w-8 h-8 text-[#64748B] mx-auto" />
              <div className="space-y-1">
                <h3 className="text-sm font-medium text-[#F1F5F9]">Nenhum projeto encontrado</h3>
                <p className="text-xs text-[#94A3B8]">
                  Crie sua primeira animação 2D escrevendo um prompt ou importe um arquivo de plano JSON.
                </p>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('new_project')}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-[#0B0E14] bg-[#E5A032] hover:bg-[#F0B14B] rounded-md transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                Criar primeiro projeto
              </button>
            </div>
          ) : (
            <div className="border border-[#232C3D] bg-[#121721] rounded-lg overflow-hidden">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-[#232C3D] text-[11px] font-medium text-[#94A3B8] bg-[#0F131C]">
                    <th className="py-2.5 px-4">Projeto</th>
                    <th className="py-2.5 px-4">Gênero</th>
                    <th className="py-2.5 px-4 text-right">Cenas</th>
                    <th className="py-2.5 px-4 text-right">Duração</th>
                    <th className="py-2.5 px-4">Formato</th>
                    <th className="py-2.5 px-4 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#232C3D] text-xs">
                  {filteredProjects.map((proj) => {
                    const isCurrent = proj.id === activeProjectId;
                    return (
                      <tr
                        key={proj.id}
                        className={`hover:bg-[#1A2130]/60 transition-colors ${
                          isCurrent ? 'bg-[#1A2130]/40' : ''
                        }`}
                      >
                        <td className="py-3 px-4">
                          <div className="font-medium text-[#F1F5F9]">{proj.title}</div>
                          <div className="text-[11px] text-[#64748B] truncate max-w-md mt-0.5">
                            {proj.prompt}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-[#94A3B8] whitespace-nowrap">
                          {GENRE_LABELS[proj.genre] ?? proj.genre}
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums text-[#F1F5F9]">
                          {proj.scenes.length}
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums text-[#F1F5F9]">
                          {proj.totalDuration.toFixed(1)}s
                        </td>
                        <td className="py-3 px-4 font-mono tabular-nums text-[#94A3B8] whitespace-nowrap">
                          {proj.format.aspectRatio} · {proj.format.fps} FPS
                        </td>
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => onOpenProject(proj.id)}
                              className="px-2.5 py-1 text-xs font-medium text-[#0B0E14] bg-[#E5A032] hover:bg-[#F0B14B] rounded transition-colors"
                            >
                              Abrir editor
                            </button>
                            <button
                              type="button"
                              title="Duplicar projeto"
                              onClick={() => onDuplicateProject(proj.id)}
                              className="p-1.5 text-[#94A3B8] hover:text-[#F1F5F9] hover:bg-[#212A3D] rounded transition-colors"
                            >
                              <Copy className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              title="Exportar plano JSON"
                              onClick={() => exportProjectJson(proj)}
                              className="p-1.5 text-[#94A3B8] hover:text-[#F1F5F9] hover:bg-[#212A3D] rounded transition-colors"
                            >
                              <Download className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              title="Excluir projeto"
                              onClick={() => onDeleteProject(proj.id)}
                              className="p-1.5 text-[#94A3B8] hover:text-[#EF4444] hover:bg-[#212A3D] rounded transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  );
};
