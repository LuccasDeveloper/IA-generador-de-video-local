import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  FileCode2,
  Film,
  Layers,
  Pause,
  Play,
  Plus,
  ShieldCheck,
  Sparkles,
  Square,
  Trash2,
  UserPlus,
  Volume2,
} from 'lucide-react';
import type {
  AnimationState,
  AudioConfig,
  CameraMove,
  CaptionPreset,
  CharacterDefinition,
  ExpressionType,
  FramingType,
  InfographicKind,
  PerformanceProfile,
  ProjectPlan,
  ResolutionPreset,
  ScenarioDefinition,
  SceneActor,
  SceneSpec,
  SfxType,
  TransitionType,
} from '../types/studio';
import {
  ALL_ANIMATION_STATES,
  ANIMATION_STATE_LABELS,
  DEFAULT_EFFECTS,
  DEFAULT_LIGHTING,
  resolveDimensions,
} from '../data/presets';
import { findSceneAtTime, renderProjectFrame } from '../engines/sceneRenderer';
import { audioEngine, SFX_CATALOG } from '../engines/audioEngine';

interface VideoEditorViewProps {
  project: ProjectPlan;
  characters: CharacterDefinition[];
  scenarios: ScenarioDefinition[];
  showSafeArea: boolean;
  onToggleSafeArea: () => void;
  onUpdateProject: (updated: ProjectPlan) => void;
  onOpenExportModal: (initialTab: 'qa' | 'export') => void;
}

const CAMERA_MOVES: Array<{ value: CameraMove; label: string }> = [
  { value: 'dolly_in', label: 'Dolly In (Aproximação)' },
  { value: 'dolly_out', label: 'Dolly Out (Afastamento)' },
  { value: 'pan', label: 'Pan (Panorâmica)' },
  { value: 'tilt', label: 'Tilt (Vertical)' },
  { value: 'zoom', label: 'Zoom Dinâmico' },
  { value: 'orbit', label: 'Orbit (Orbital)' },
  { value: 'handheld', label: 'Handheld (Câmera na mão)' },
  { value: 'dutch_angle', label: 'Dutch Angle (Inclinado)' },
  { value: 'tracking', label: 'Tracking (Acompanhamento)' },
  { value: 'static', label: 'Estática' },
];

const FRAMINGS: Array<{ value: FramingType; label: string }> = [
  { value: 'wide', label: 'Plano Geral (Wide)' },
  { value: 'medium', label: 'Plano Médio' },
  { value: 'close_up', label: 'Close-Up' },
  { value: 'extreme_close_up', label: 'Super Close-Up' },
  { value: 'over_shoulder', label: 'Sobre o Ombro' },
  { value: 'low_angle', label: 'Contra-Plongée (Baixo)' },
  { value: 'high_angle', label: 'Plongée (Alto)' },
  { value: 'detail', label: 'Plano-Detalhe (Insert)' },
];

const TRANSITIONS: Array<{ value: TransitionType; label: string }> = [
  { value: 'cut', label: 'Corte seco' },
  { value: 'fade_black', label: 'Fade do preto' },
  { value: 'crossfade', label: 'Crossfade' },
  { value: 'wipe_left', label: 'Wipe lateral' },
  { value: 'flash_white', label: 'Flash claro' },
  { value: 'pixel_wipe', label: 'Pixel Wipe (Retrô)' },
  { value: 'dither_dissolve', label: 'Dither Dissolve (16-bit)' },
  { value: 'iris_zoom', label: 'Iris Zoom (Arcade)' },
  { value: 'glitch_cut', label: 'Corte Glitch' },
];

const INFOGRAPHIC_KINDS: Array<{ value: InfographicKind; label: string }> = [
  { value: 'brain_nerve_freeze', label: 'Cérebro & Nervo Trigêmeo (Brain Freeze)' },
  { value: 'bloodstream_cells', label: 'Corrente Sanguínea & Glóbulos Vermelhos' },
  { value: 'bone_marrow_cycle', label: 'Medula Óssea & Ciclo Celular' },
  { value: 'solar_orbit', label: 'Órbita Espacial & Buraco Negro' },
  { value: 'circuit_flow', label: 'Microchip & Fluxo Binário' },
  { value: 'molecule_reaction', label: 'Reação Molecular / Fotossíntese' },
  { value: 'neural_network', label: 'Rede Neural & Sinapses' },
  { value: 'nutrition_energy', label: 'Digestão & Energia ATP' },
  { value: 'organ_zoom', label: 'Zoom Anatômico' },
  { value: 'process_diagram', label: 'Diagrama de Processo / Etapas' },
];

function formatTimecode(sec: number, fps: number): string {
  const clamped = Math.max(0, sec);
  const mins = Math.floor(clamped / 60);
  const secs = Math.floor(clamped % 60);
  const frame = Math.floor((clamped % 1) * fps);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}:${String(frame).padStart(2, '0')}`;
}

export const VideoEditorView: React.FC<VideoEditorViewProps> = ({
  project,
  characters,
  scenarios,
  showSafeArea,
  onToggleSafeArea,
  onUpdateProject,
  onOpenExportModal,
}) => {
  const [selectedSceneIndex, setSelectedSceneIndex] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [timelineZoom, setTimelineZoom] = useState(1);
  const [leftTab, setLeftTab] = useState<'scenes' | 'resources' | 'script'>('scenes');
  const [inspectorTab, setInspectorTab] = useState<'camera' | 'actors' | 'fx' | 'info' | 'audio'>('camera');
  const isRetroPixel = project.visualStyle === 'retro_pixel_educational';

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const timeRef = useRef(0);

  const safeSceneIdx = Math.min(selectedSceneIndex, Math.max(0, project.scenes.length - 1));
  const selectedScene = project.scenes[safeSceneIdx];

  const previewDims = useMemo(() => {
    const raw = resolveDimensions(project.format.aspectRatio, project.format.previewResolution);
    // Keep crisp display canvas proportions capped nicely for real-time smoothness
    const maxEdge = 640;
    const scale = Math.min(1, maxEdge / Math.max(raw.width, raw.height));
    return {
      width: Math.round(raw.width * scale),
      height: Math.round(raw.height * scale),
      nominalW: raw.width,
      nominalH: raw.height,
    };
  }, [project.format.aspectRatio, project.format.previewResolution]);

  // Compute scene start timestamps
  const sceneStarts = useMemo(() => {
    const starts: number[] = [];
    let acc = 0;
    for (const sc of project.scenes) {
      starts.push(acc);
      acc += sc.duration;
    }
    return starts;
  }, [project.scenes]);

  // Keep timeRef synchronized
  useEffect(() => {
    timeRef.current = currentTime;
  }, [currentTime]);

  // Render current frame whenever project/time/settings change
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    renderProjectFrame(
      ctx,
      project,
      currentTime,
      canvas.width,
      canvas.height,
      characters,
      scenarios,
      { showSafeArea }
    );
  }, [project, currentTime, characters, scenarios, showSafeArea, previewDims.width, previewDims.height]);

  // Real-time playback loop synchronized with audio engine
  useEffect(() => {
    if (!isPlaying) return;
    audioEngine.scheduleProjectAudio(project, timeRef.current);

    let raf = 0;
    let last = performance.now();

    const tick = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000) * playbackSpeed;
      last = now;
      const next = timeRef.current + dt;

      if (next >= project.totalDuration) {
        timeRef.current = 0;
        setCurrentTime(0);
        setIsPlaying(false);
        audioEngine.stopAll();
        return;
      }

      timeRef.current = next;
      setCurrentTime(next);

      const located = findSceneAtTime(project, next);
      if (located && located.scene.index !== safeSceneIdx) {
        setSelectedSceneIndex(located.scene.index);
      }

      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      audioEngine.stopAll();
    };
  }, [isPlaying, playbackSpeed]); // eslint-disable-line react-hooks/exhaustive-deps

  const handlePlayPause = () => {
    if (isPlaying) {
      setIsPlaying(false);
      audioEngine.stopAll();
    } else {
      if (currentTime >= project.totalDuration - 0.05) {
        setCurrentTime(0);
        timeRef.current = 0;
      }
      setIsPlaying(true);
    }
  };

  const handleStop = () => {
    setIsPlaying(false);
    audioEngine.stopAll();
    setCurrentTime(0);
    timeRef.current = 0;
    setSelectedSceneIndex(0);
  };

  const stepFrame = (delta: number) => {
    setIsPlaying(false);
    audioEngine.stopAll();
    const step = 1 / project.format.fps;
    const next = Math.max(0, Math.min(project.totalDuration - 0.01, currentTime + delta * step));
    setCurrentTime(next);
    const located = findSceneAtTime(project, next);
    if (located) setSelectedSceneIndex(located.scene.index);
  };

  const commitScenes = (nextScenes: SceneSpec[]) => {
    const normalized = nextScenes.map((s, idx) => ({ ...s, index: idx }));
    const totalDuration = Number(normalized.reduce((acc, s) => acc + s.duration, 0).toFixed(2));
    onUpdateProject({
      ...project,
      scenes: normalized,
      totalDuration,
      script: normalized.map((sc) => ({
        sceneIndex: sc.index,
        heading: `CENA ${sc.index + 1} — ${sc.title.toUpperCase()}`,
        action: sc.summary,
        dialogue: sc.captionText || '(Sem narração)',
        soundCue: sc.sfxEvents.map((e) => `${e.label} (${e.sfx})`).join(', ') || 'Ambiência',
      })),
      updatedAt: new Date().toISOString(),
    });
  };

  const updateSelectedScene = (patch: Partial<SceneSpec>) => {
    if (!selectedScene) return;
    const next = project.scenes.map((sc, i) => (i === safeSceneIdx ? { ...sc, ...patch } : sc));
    commitScenes(next);
  };

  const updateActor = (actorId: string, patch: Partial<SceneActor>) => {
    if (!selectedScene) return;
    updateSelectedScene({
      actors: selectedScene.actors.map((a) => (a.id === actorId ? { ...a, ...patch } : a)),
    });
  };

  const handleAddScene = () => {
    const base = selectedScene;
    const created: SceneSpec = {
      id: `scene_${Date.now().toString(36)}`,
      index: project.scenes.length,
      title: `Nova Cena ${project.scenes.length + 1}`,
      summary: 'Nova cena configurável adicionada manualmente.',
      narrativeIntent: 'desenvolvimento',
      duration: 5,
      scenarioId: base?.scenarioId ?? scenarios[0].id,
      framing: 'medium',
      cameraMove: 'pan',
      cameraIntensity: 0.6,
      transitionIn: 'crossfade',
      lighting: base ? { ...base.lighting } : { ...DEFAULT_LIGHTING },
      effects: base ? { ...base.effects } : { ...DEFAULT_EFFECTS },
      actors: [
        {
          id: `actor_${Date.now().toString(36)}`,
          characterId: characters[0].id,
          x: 0.3,
          y: 0.77,
          targetX: 0.6,
          targetY: 0.77,
          scale: 1,
          opacity: 1,
          flipX: false,
          rotation: 0,
          state: 'walk',
          nextState: 'idle',
          stateTransitionRatio: 0.65,
          expression: 'neutral',
          easing: 'ease_in_out',
        },
      ],
      sfxEvents: [],
      captionText: '',
      visualPrompt: 'Nova cena 2D',
      colorPalette: project.visualIdentity.palette,
    };
    commitScenes([...project.scenes, created]);
    setSelectedSceneIndex(project.scenes.length);
  };

  const handleDuplicateScene = (idx: number) => {
    const target = project.scenes[idx];
    if (!target) return;
    const clone: SceneSpec = {
      ...JSON.parse(JSON.stringify(target)),
      id: `scene_${Date.now().toString(36)}`,
      title: `${target.title} (Cópia)`,
    };
    const next = [...project.scenes];
    next.splice(idx + 1, 0, clone);
    commitScenes(next);
    setSelectedSceneIndex(idx + 1);
  };

  const handleMoveScene = (idx: number, dir: -1 | 1) => {
    const targetIdx = idx + dir;
    if (targetIdx < 0 || targetIdx >= project.scenes.length) return;
    const next = [...project.scenes];
    const [item] = next.splice(idx, 1);
    next.splice(targetIdx, 0, item);
    commitScenes(next);
    setSelectedSceneIndex(targetIdx);
  };

  const handleDeleteScene = (idx: number) => {
    if (project.scenes.length <= 1) return;
    const next = project.scenes.filter((_, i) => i !== idx);
    commitScenes(next);
    setSelectedSceneIndex(Math.max(0, idx - 1));
  };

  const handleAddCharacterToScene = (charId: string) => {
    if (!selectedScene) return;
    const newActor: SceneActor = {
      id: `actor_${Date.now().toString(36)}`,
      characterId: charId,
      x: 0.35 + selectedScene.actors.length * 0.18,
      y: 0.77,
      targetX: Math.min(0.85, 0.52 + selectedScene.actors.length * 0.14),
      targetY: 0.77,
      scale: 1,
      opacity: 1,
      flipX: selectedScene.actors.length % 2 === 1,
      rotation: 0,
      state: 'idle',
      nextState: 'walk',
      stateTransitionRatio: 0.5,
      expression: 'neutral',
      easing: 'ease_in_out',
    };
    updateSelectedScene({ actors: [...selectedScene.actors, newActor] });
  };

  const handleAddSfxToScene = (sfx: SfxType, label: string) => {
    if (!selectedScene) return;
    const offset = Math.max(0.1, Math.min(selectedScene.duration - 0.3, currentTime - (sceneStarts[safeSceneIdx] ?? 0)));
    audioEngine.playSfx(sfx, project.audio.sfxVolume, project.audio.duckingAmount);
    updateSelectedScene({
      sfxEvents: [
        ...selectedScene.sfxEvents,
        {
          id: `sfx_${Date.now().toString(36)}`,
          sfx,
          offsetSec: Number(offset.toFixed(2)),
          volume: 0.85,
          label,
        },
      ],
    });
  };

  const timelineTrackWidth = Math.max(720, Math.round(project.totalDuration * 32 * timelineZoom));

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-[#0B0E14]">
      {/* Editor Top Toolbar */}
      <div className="px-4 py-2.5 border-b border-[#232C3D] bg-[#0F131C] flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <input
            type="text"
            value={project.title}
            onChange={(e) => onUpdateProject({ ...project, title: e.target.value })}
            className="bg-transparent text-sm font-semibold text-[#F1F5F9] border border-transparent hover:border-[#232C3D] focus:border-[#E5A032] focus:outline-none rounded px-2 py-1 truncate max-w-[260px]"
          />
          <span className="text-xs font-mono tabular-nums text-[#94A3B8] whitespace-nowrap">
            {isRetroPixel && project.pixelConfig
              ? `16-bit ${project.pixelConfig.logicalWidth}×${project.pixelConfig.logicalHeight} → `
              : ''}
            {project.format.aspectRatio} · {previewDims.nominalW}×{previewDims.nominalH} · {project.format.fps} FPS · {project.totalDuration.toFixed(1)}s
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <select
            value={project.performanceProfile}
            onChange={(e) =>
              onUpdateProject({
                ...project,
                performanceProfile: e.target.value as PerformanceProfile,
              })
            }
            className="rounded border border-[#232C3D] bg-[#121721] px-2.5 py-1.5 text-xs text-[#F1F5F9]"
            title="Perfil de desempenho"
          >
            <option value="economico">Perfil: Econômico</option>
            <option value="equilibrado">Perfil: Equilibrado</option>
            <option value="qualidade">Perfil: Qualidade</option>
          </select>

          <select
            value={project.format.previewResolution}
            onChange={(e) =>
              onUpdateProject({
                ...project,
                format: { ...project.format, previewResolution: e.target.value as ResolutionPreset },
              })
            }
            className="rounded border border-[#232C3D] bg-[#121721] px-2.5 py-1.5 text-xs font-mono text-[#F1F5F9]"
            title="Resolução de preview"
          >
            <option value="480p">Preview 480p</option>
            <option value="540p">Preview 540p</option>
            <option value="720p">Preview 720p</option>
          </select>

          <button
            type="button"
            onClick={onToggleSafeArea}
            className={`px-2.5 py-1.5 text-xs font-medium rounded border transition-colors whitespace-nowrap ${
              showSafeArea
                ? 'border-[#E5A032] text-[#E5A032] bg-[#1A2130]'
                : 'border-[#232C3D] text-[#94A3B8] bg-[#121721] hover:text-[#F1F5F9]'
            }`}
          >
            Área segura
          </button>

          <button
            type="button"
            onClick={() => onOpenExportModal('qa')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#F1F5F9] border border-[#232C3D] bg-[#121721] hover:bg-[#1A2130] rounded transition-colors whitespace-nowrap"
          >
            <ShieldCheck className="w-3.5 h-3.5 text-[#E5A032]" />
            QA & Folha
          </button>

          <button
            type="button"
            onClick={() => onOpenExportModal('export')}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-[#0B0E14] bg-[#E5A032] hover:bg-[#F0B14B] rounded transition-colors whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" />
            Exportar vídeo
          </button>
        </div>
      </div>

      {/* Upper 3-column Workspace (Zones 3+4 Left | Zone 1 Viewport Center | Zone 5 Inspector Right) */}
      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-12 overflow-hidden">
        {/* LEFT PANEL: Scene List / Resource Library / Script */}
        <div className="lg:col-span-3 border-r border-[#232C3D] bg-[#121721] flex flex-col min-h-0">
          <div className="flex border-b border-[#232C3D] text-xs">
            <button
              type="button"
              onClick={() => setLeftTab('scenes')}
              className={`flex-1 py-2.5 font-medium border-b-2 transition-colors ${
                leftTab === 'scenes'
                  ? 'border-[#E5A032] text-[#F1F5F9]'
                  : 'border-transparent text-[#94A3B8] hover:text-[#F1F5F9]'
              }`}
            >
              Cenas ({project.scenes.length})
            </button>
            <button
              type="button"
              onClick={() => setLeftTab('resources')}
              className={`flex-1 py-2.5 font-medium border-b-2 transition-colors ${
                leftTab === 'resources'
                  ? 'border-[#E5A032] text-[#F1F5F9]'
                  : 'border-transparent text-[#94A3B8] hover:text-[#F1F5F9]'
              }`}
            >
              Recursos
            </button>
            <button
              type="button"
              onClick={() => setLeftTab('script')}
              className={`flex-1 py-2.5 font-medium border-b-2 transition-colors ${
                leftTab === 'script'
                  ? 'border-[#E5A032] text-[#F1F5F9]'
                  : 'border-transparent text-[#94A3B8] hover:text-[#F1F5F9]'
              }`}
            >
              Roteiro
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {leftTab === 'scenes' && (
              <>
                <button
                  type="button"
                  onClick={handleAddScene}
                  className="w-full inline-flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium text-[#E5A032] border border-dashed border-[#323F57] hover:border-[#E5A032] rounded transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Adicionar nova cena
                </button>

                {project.scenes.map((sc, idx) => {
                  const active = idx === safeSceneIdx;
                  return (
                    <div
                      key={sc.id}
                      onClick={() => {
                        setSelectedSceneIndex(idx);
                        setCurrentTime(sceneStarts[idx] ?? 0);
                      }}
                      className={`p-2.5 rounded-md border cursor-pointer transition-colors space-y-1.5 ${
                        active
                          ? 'border-[#E5A032] bg-[#1A2130]'
                          : 'border-[#232C3D] bg-[#0B0E14]/50 hover:bg-[#1A2130]/50'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-[#F1F5F9] truncate">
                          {idx + 1}. {sc.title}
                        </span>
                        <span className="text-[11px] font-mono tabular-nums text-[#94A3B8] shrink-0">
                          {sc.duration.toFixed(1)}s
                        </span>
                      </div>
                      <div className="text-[11px] text-[#94A3B8] font-mono">
                        {sc.framing} · {sc.cameraMove}
                      </div>
                      <div className="flex items-center justify-between pt-1 border-t border-[#232C3D]/60">
                        <span className="text-[11px] text-[#64748B] capitalize">{sc.narrativeIntent}</span>
                        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            onClick={() => handleMoveScene(idx, -1)}
                            disabled={idx === 0}
                            className="p-1 text-[#94A3B8] hover:text-[#F1F5F9] disabled:opacity-30"
                            title="Mover para cima"
                          >
                            <ArrowUp className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleMoveScene(idx, 1)}
                            disabled={idx === project.scenes.length - 1}
                            className="p-1 text-[#94A3B8] hover:text-[#F1F5F9] disabled:opacity-30"
                            title="Mover para baixo"
                          >
                            <ArrowDown className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDuplicateScene(idx)}
                            className="p-1 text-[#94A3B8] hover:text-[#F1F5F9]"
                            title="Duplicar cena"
                          >
                            <Copy className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteScene(idx)}
                            disabled={project.scenes.length <= 1}
                            className="p-1 text-[#94A3B8] hover:text-[#EF4444] disabled:opacity-30"
                            title="Excluir cena"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </>
            )}

            {leftTab === 'resources' && (
              <div className="space-y-4 text-xs">
                <div className="space-y-1.5">
                  <div className="font-semibold text-[#F1F5F9] flex items-center gap-1.5">
                    <UserPlus className="w-3.5 h-3.5 text-[#E5A032]" />
                    Inserir personagem na cena {safeSceneIdx + 1}
                  </div>
                  {characters.map((ch) => (
                    <button
                      key={ch.id}
                      type="button"
                      onClick={() => handleAddCharacterToScene(ch.id)}
                      className="w-full flex items-center justify-between px-2.5 py-2 rounded border border-[#232C3D] bg-[#0B0E14]/50 hover:bg-[#1A2130] text-left"
                    >
                      <span className="text-[#F1F5F9] truncate">{ch.name}</span>
                      <span className="text-[11px] text-[#E5A032] shrink-0">+ Cena</span>
                    </button>
                  ))}
                </div>

                <div className="space-y-1.5 pt-3 border-t border-[#232C3D]">
                  <div className="font-semibold text-[#F1F5F9] flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-[#E5A032]" />
                    Aplicar cenário na cena {safeSceneIdx + 1}
                  </div>
                  {scenarios.map((sc) => (
                    <button
                      key={sc.id}
                      type="button"
                      onClick={() => updateSelectedScene({ scenarioId: sc.id })}
                      className={`w-full flex items-center justify-between px-2.5 py-2 rounded border text-left ${
                        selectedScene?.scenarioId === sc.id
                          ? 'border-[#E5A032] bg-[#1A2130]'
                          : 'border-[#232C3D] bg-[#0B0E14]/50 hover:bg-[#1A2130]'
                      }`}
                    >
                      <span className="text-[#F1F5F9] truncate">{sc.name}</span>
                      <span
                        className="w-2.5 h-2.5 rounded-sm shrink-0"
                        style={{ backgroundColor: sc.accentColor }}
                      />
                    </button>
                  ))}
                </div>

                <div className="space-y-1.5 pt-3 border-t border-[#232C3D]">
                  <div className="font-semibold text-[#F1F5F9] flex items-center gap-1.5">
                    <Volume2 className="w-3.5 h-3.5 text-[#E5A032]" />
                    Inserir SFX no ponto atual
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    {SFX_CATALOG.map((s) => (
                      <button
                        key={s.type}
                        type="button"
                        onClick={() => handleAddSfxToScene(s.type, s.label)}
                        className="px-2 py-1.5 rounded border border-[#232C3D] bg-[#0B0E14]/50 hover:bg-[#1A2130] text-[#F1F5F9] text-left truncate"
                      >
                        + {s.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {leftTab === 'script' && (
              <div className="space-y-3 text-xs">
                <div className="p-2.5 rounded border border-[#232C3D] bg-[#0B0E14]/70 space-y-1">
                  <div className="font-semibold text-[#F1F5F9] flex items-center gap-1.5">
                    <FileCode2 className="w-3.5 h-3.5 text-[#E5A032]" />
                    Identidade Visual
                  </div>
                  <div className="text-[#94A3B8]">{project.visualIdentity.mood}</div>
                  <div className="text-[11px] text-[#64748B]">{project.visualIdentity.cameraLanguage}</div>
                </div>

                {project.script.map((entry) => (
                  <div key={entry.sceneIndex} className="p-2.5 rounded border border-[#232C3D] bg-[#0B0E14]/50 space-y-1">
                    <div className="font-mono text-[11px] font-semibold text-[#E5A032]">{entry.heading}</div>
                    <p className="text-[#F1F5F9] leading-relaxed">{entry.action}</p>
                    <p className="text-[#94A3B8] italic">{entry.dialogue}</p>
                    <p className="text-[11px] text-[#64748B]">Áudio: {entry.soundCue}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* CENTER PANEL: Live 2D Video Viewport + Transport Controls */}
        <div className="lg:col-span-5 flex flex-col min-h-0 bg-[#070A10]">
          <div className="flex-1 min-h-0 flex items-center justify-center p-4 overflow-hidden">
            <div className="relative max-w-full max-h-full flex items-center justify-center border border-[#232C3D] shadow-2xl bg-black">
              <canvas
                ref={canvasRef}
                width={previewDims.width}
                height={previewDims.height}
                style={{ imageRendering: isRetroPixel ? 'pixelated' : 'auto' }}
                className="max-w-full max-h-[430px] w-auto h-auto block"
              />
            </div>
          </div>

          {/* Transport Bar */}
          <div className="px-4 py-2.5 border-t border-[#232C3D] bg-[#121721] flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => stepFrame(-1)}
                title="Quadro anterior"
                className="p-1.5 text-[#94A3B8] hover:text-[#F1F5F9] hover:bg-[#1A2130] rounded"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={handlePlayPause}
                title={isPlaying ? 'Pausar' : 'Reproduzir'}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-[#0B0E14] bg-[#E5A032] hover:bg-[#F0B14B] rounded"
              >
                {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                {isPlaying ? 'Pausar' : 'Play'}
              </button>
              <button
                type="button"
                onClick={handleStop}
                title="Parar"
                className="p-1.5 text-[#94A3B8] hover:text-[#F1F5F9] hover:bg-[#1A2130] rounded"
              >
                <Square className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => stepFrame(1)}
                title="Próximo quadro"
                className="p-1.5 text-[#94A3B8] hover:text-[#F1F5F9] hover:bg-[#1A2130] rounded"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            <div className="font-mono tabular-nums text-xs text-[#F1F5F9]">
              {formatTimecode(currentTime, project.format.fps)}{' '}
              <span className="text-[#64748B]">/ {formatTimecode(project.totalDuration, project.format.fps)}</span>
            </div>

            <div className="flex items-center gap-2 text-xs">
              <span className="text-[#94A3B8]">Velocidade</span>
              <select
                value={playbackSpeed}
                onChange={(e) => setPlaybackSpeed(Number(e.target.value))}
                className="rounded border border-[#232C3D] bg-[#0B0E14] px-2 py-1 font-mono text-xs text-[#F1F5F9]"
              >
                <option value={0.25}>0.25x</option>
                <option value={0.5}>0.5x</option>
                <option value={1}>1.0x</option>
                <option value={1.5}>1.5x</option>
                <option value={2}>2.0x</option>
              </select>
            </div>
          </div>
        </div>

        {/* RIGHT PANEL: Property Inspector */}
        <div className="lg:col-span-4 border-l border-[#232C3D] bg-[#121721] flex flex-col min-h-0">
          <div className="flex border-b border-[#232C3D] text-xs">
            {[
              { id: 'camera', label: 'Cena' },
              { id: 'actors', label: 'Atores' },
              { id: 'fx', label: 'Efeitos' },
              ...(isRetroPixel ? [{ id: 'info', label: 'Infográf.' }] : []),
              { id: 'audio', label: 'Áudio' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setInspectorTab(tab.id as typeof inspectorTab)}
                className={`flex-1 py-2.5 px-1 font-medium border-b-2 transition-colors whitespace-nowrap ${
                  inspectorTab === tab.id
                    ? 'border-[#E5A032] text-[#F1F5F9]'
                    : 'border-transparent text-[#94A3B8] hover:text-[#F1F5F9]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
            {selectedScene && inspectorTab === 'camera' && (
              <>
                <label className="block space-y-1">
                  <span className="text-[#94A3B8]">Título da cena</span>
                  <input
                    type="text"
                    value={selectedScene.title}
                    onChange={(e) => updateSelectedScene({ title: e.target.value })}
                    className="w-full rounded border border-[#232C3D] bg-[#0B0E14] px-3 py-1.5 text-[#F1F5F9]"
                  />
                </label>

                <div className="grid grid-cols-2 gap-3">
                  <label className="space-y-1">
                    <span className="text-[#94A3B8] font-mono tabular-nums">
                      Duração ({selectedScene.duration.toFixed(1)}s)
                    </span>
                    <input
                      type="range"
                      min={1.5}
                      max={20}
                      step={0.5}
                      value={selectedScene.duration}
                      onChange={(e) => updateSelectedScene({ duration: Number(e.target.value) })}
                      className="w-full mt-1"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-[#94A3B8]">Cenário</span>
                    <select
                      value={selectedScene.scenarioId}
                      onChange={(e) => updateSelectedScene({ scenarioId: e.target.value })}
                      className="w-full rounded border border-[#232C3D] bg-[#0B0E14] px-2.5 py-1.5 text-[#F1F5F9]"
                    >
                      {scenarios.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <label className="space-y-1">
                    <span className="text-[#94A3B8]">Enquadramento</span>
                    <select
                      value={selectedScene.framing}
                      onChange={(e) => updateSelectedScene({ framing: e.target.value as FramingType })}
                      className="w-full rounded border border-[#232C3D] bg-[#0B0E14] px-2.5 py-1.5 text-[#F1F5F9]"
                    >
                      {FRAMINGS.map((f) => (
                        <option key={f.value} value={f.value}>
                          {f.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="space-y-1">
                    <span className="text-[#94A3B8]">Movimento de câmera</span>
                    <select
                      value={selectedScene.cameraMove}
                      onChange={(e) => updateSelectedScene({ cameraMove: e.target.value as CameraMove })}
                      className="w-full rounded border border-[#232C3D] bg-[#0B0E14] px-2.5 py-1.5 text-[#F1F5F9]"
                    >
                      {CAMERA_MOVES.map((m) => (
                        <option key={m.value} value={m.value}>
                          {m.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <label className="space-y-1">
                    <span className="text-[#94A3B8] font-mono tabular-nums">
                      Intensidade da câmera ({Math.round(selectedScene.cameraIntensity * 100)}%)
                    </span>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.05}
                      value={selectedScene.cameraIntensity}
                      onChange={(e) => updateSelectedScene({ cameraIntensity: Number(e.target.value) })}
                      className="w-full mt-1"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-[#94A3B8]">Transição de entrada</span>
                    <select
                      value={selectedScene.transitionIn}
                      onChange={(e) => updateSelectedScene({ transitionIn: e.target.value as TransitionType })}
                      className="w-full rounded border border-[#232C3D] bg-[#0B0E14] px-2.5 py-1.5 text-[#F1F5F9]"
                    >
                      {TRANSITIONS.map((t) => (
                        <option key={t.value} value={t.value}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <label className="block space-y-1">
                  <span className="text-[#94A3B8]">Legenda / Narração da cena</span>
                  <textarea
                    rows={2}
                    value={selectedScene.captionText}
                    onChange={(e) => updateSelectedScene({ captionText: e.target.value })}
                    placeholder="Deixe vazio para cena sem legenda..."
                    className="w-full rounded border border-[#232C3D] bg-[#0B0E14] px-3 py-2 text-[#F1F5F9] resize-none"
                  />
                </label>
              </>
            )}

            {selectedScene && inspectorTab === 'actors' && (
              <div className="space-y-3">
                {selectedScene.actors.length === 0 ? (
                  <p className="text-[#94A3B8]">
                    Nenhum personagem nesta cena. Use a aba <strong>Recursos</strong> à esquerda para adicionar.
                  </p>
                ) : (
                  selectedScene.actors.map((actor, aIdx) => (
                    <div
                      key={actor.id}
                      className="border border-[#232C3D] bg-[#0B0E14]/60 rounded-md p-3 space-y-3"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-[#F1F5F9]">Ator {aIdx + 1}</span>
                        <button
                          type="button"
                          onClick={() =>
                            updateSelectedScene({
                              actors: selectedScene.actors.filter((a) => a.id !== actor.id),
                            })
                          }
                          className="text-[#94A3B8] hover:text-[#EF4444]"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <label className="space-y-1">
                          <span className="text-[#94A3B8]">Personagem</span>
                          <select
                            value={actor.characterId}
                            onChange={(e) => updateActor(actor.id, { characterId: e.target.value })}
                            className="w-full rounded border border-[#232C3D] bg-[#121721] px-2 py-1.5 text-[#F1F5F9]"
                          >
                            {characters.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.name}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="space-y-1">
                          <span className="text-[#94A3B8]">Expressão</span>
                          <select
                            value={actor.expression}
                            onChange={(e) => updateActor(actor.id, { expression: e.target.value as ExpressionType })}
                            className="w-full rounded border border-[#232C3D] bg-[#121721] px-2 py-1.5 text-[#F1F5F9]"
                          >
                            <option value="neutral">Neutro</option>
                            <option value="scared">Assustado</option>
                            <option value="angry">Furioso</option>
                            <option value="happy">Feliz</option>
                            <option value="surprised">Surpreso</option>
                            <option value="determined">Determinado</option>
                            <option value="sad">Triste</option>
                          </select>
                        </label>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <label className="space-y-1">
                          <span className="text-[#94A3B8]">Estado inicial</span>
                          <select
                            value={actor.state}
                            onChange={(e) => updateActor(actor.id, { state: e.target.value as AnimationState })}
                            className="w-full rounded border border-[#232C3D] bg-[#121721] px-2 py-1.5 text-[#F1F5F9]"
                          >
                            {ALL_ANIMATION_STATES.map((st) => (
                              <option key={st} value={st}>
                                {ANIMATION_STATE_LABELS[st]}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="space-y-1">
                          <span className="text-[#94A3B8]">Estado final (transição)</span>
                          <select
                            value={actor.nextState ?? actor.state}
                            onChange={(e) => updateActor(actor.id, { nextState: e.target.value as AnimationState })}
                            className="w-full rounded border border-[#232C3D] bg-[#121721] px-2 py-1.5 text-[#F1F5F9]"
                          >
                            {ALL_ANIMATION_STATES.map((st) => (
                              <option key={st} value={st}>
                                {ANIMATION_STATE_LABELS[st]}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <label className="space-y-0.5">
                          <span className="text-[#94A3B8] font-mono tabular-nums">X Inicial ({Math.round(actor.x * 100)}%)</span>
                          <input
                            type="range"
                            min={0.05}
                            max={0.95}
                            step={0.02}
                            value={actor.x}
                            onChange={(e) => updateActor(actor.id, { x: Number(e.target.value) })}
                            className="w-full"
                          />
                        </label>
                        <label className="space-y-0.5">
                          <span className="text-[#94A3B8] font-mono tabular-nums">X Final ({Math.round(actor.targetX * 100)}%)</span>
                          <input
                            type="range"
                            min={0.05}
                            max={0.95}
                            step={0.02}
                            value={actor.targetX}
                            onChange={(e) => updateActor(actor.id, { targetX: Number(e.target.value) })}
                            className="w-full"
                          />
                        </label>
                        <label className="space-y-0.5">
                          <span className="text-[#94A3B8] font-mono tabular-nums">Escala ({actor.scale.toFixed(2)}x)</span>
                          <input
                            type="range"
                            min={0.5}
                            max={1.8}
                            step={0.05}
                            value={actor.scale}
                            onChange={(e) => updateActor(actor.id, { scale: Number(e.target.value) })}
                            className="w-full"
                          />
                        </label>
                        <label className="flex items-center gap-2 pt-3 text-[#F1F5F9]">
                          <input
                            type="checkbox"
                            checked={actor.flipX}
                            onChange={(e) => updateActor(actor.id, { flipX: e.target.checked })}
                            className="accent-[#E5A032]"
                          />
                          Inverter horizontal
                        </label>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {selectedScene && inspectorTab === 'fx' && (
              <div className="space-y-4">
                <div className="space-y-2.5">
                  <div className="font-semibold text-[#F1F5F9] flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-[#E5A032]" />
                    Iluminação da cena
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="space-y-0.5">
                      <span className="text-[#94A3B8] font-mono tabular-nums">
                        Luz ambiente ({Math.round(selectedScene.lighting.ambientIntensity * 100)}%)
                      </span>
                      <input
                        type="range"
                        min={0.1}
                        max={1}
                        step={0.05}
                        value={selectedScene.lighting.ambientIntensity}
                        onChange={(e) =>
                          updateSelectedScene({
                            lighting: { ...selectedScene.lighting, ambientIntensity: Number(e.target.value) },
                          })
                        }
                        className="w-full"
                      />
                    </label>
                    <label className="space-y-0.5">
                      <span className="text-[#94A3B8] font-mono tabular-nums">
                        Luz de contorno ({Math.round(selectedScene.lighting.rimLightIntensity * 100)}%)
                      </span>
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.05}
                        value={selectedScene.lighting.rimLightIntensity}
                        onChange={(e) =>
                          updateSelectedScene({
                            lighting: { ...selectedScene.lighting, rimLightIntensity: Number(e.target.value) },
                          })
                        }
                        className="w-full"
                      />
                    </label>
                    <label className="space-y-0.5">
                      <span className="text-[#94A3B8] font-mono tabular-nums">
                        Tremular luz pontual ({Math.round(selectedScene.lighting.pointLightFlicker * 100)}%)
                      </span>
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.05}
                        value={selectedScene.lighting.pointLightFlicker}
                        onChange={(e) =>
                          updateSelectedScene({
                            lighting: { ...selectedScene.lighting, pointLightFlicker: Number(e.target.value) },
                          })
                        }
                        className="w-full"
                      />
                    </label>
                    <label className="space-y-0.5">
                      <span className="text-[#94A3B8] font-mono tabular-nums">
                        Bloom / Glow ({Math.round(selectedScene.lighting.bloomIntensity * 100)}%)
                      </span>
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.05}
                        value={selectedScene.lighting.bloomIntensity}
                        onChange={(e) =>
                          updateSelectedScene({
                            lighting: { ...selectedScene.lighting, bloomIntensity: Number(e.target.value) },
                          })
                        }
                        className="w-full"
                      />
                    </label>
                  </div>
                </div>

                <div className="space-y-2.5 pt-3 border-t border-[#232C3D]">
                  <div className="font-semibold text-[#F1F5F9]">Partículas e Pós-processamento</div>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-2">
                    {(
                      [
                        ['fog', 'Névoa'],
                        ['dust', 'Poeira'],
                        ['rain', 'Chuva'],
                        ['snow', 'Neve'],
                        ['smoke', 'Fumaça'],
                        ['fire', 'Fogo'],
                        ['sparks', 'Faíscas'],
                        ['vignette', 'Vinheta'],
                        ['filmGrain', 'Film Grain'],
                        ['chromaticAberration', 'Aberração Crom.'],
                        ['scanlines', 'Scanlines'],
                        ['glitch', 'Glitch'],
                        ['cameraShake', 'Camera Shake'],
                      ] as const
                    ).map(([key, label]) => (
                      <label key={key} className="space-y-0.5">
                        <div className="flex justify-between text-[11px] text-[#94A3B8]">
                          <span>{label}</span>
                          <span className="font-mono tabular-nums text-[#F1F5F9]">
                            {Math.round(selectedScene.effects[key] * 100)}%
                          </span>
                        </div>
                        <input
                          type="range"
                          min={0}
                          max={1}
                          step={0.05}
                          value={selectedScene.effects[key]}
                          onChange={(e) =>
                            updateSelectedScene({
                              effects: { ...selectedScene.effects, [key]: Number(e.target.value) },
                            })
                          }
                          className="w-full"
                        />
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {selectedScene && inspectorTab === 'info' && (
              <div className="space-y-4">
                {project.educationalContext && (
                  <div className="p-2.5 rounded border border-[#232C3D] bg-[#0B0E14]/70 space-y-1">
                    <div className="font-semibold text-[#F1F5F9]">Fonte científica verificada</div>
                    <div className="text-[11px] text-[#94A3B8]">{project.educationalContext.sourceCitation}</div>
                    <div className="text-[11px] font-mono text-[#E5A032]">
                      {project.educationalContext.verifiedFacts.length} fato(s) ·{' '}
                      {project.educationalContext.factSource === 'user_supplied' ? 'Fatos próprios' : 'Base offline'}
                    </div>
                  </div>
                )}

                <label className="block space-y-1">
                  <span className="text-[#94A3B8]">Modo visual da cena</span>
                  <select
                    value={selectedScene.sceneVisualMode ?? 'character_scenario'}
                    onChange={(e) =>
                      updateSelectedScene({
                        sceneVisualMode: e.target.value as SceneSpec['sceneVisualMode'],
                      })
                    }
                    className="w-full rounded border border-[#232C3D] bg-[#0B0E14] px-2.5 py-1.5 text-[#F1F5F9]"
                  >
                    <option value="character_scenario">Personagem + Cenário Pixel</option>
                    <option value="split_cutaway">Personagem + Infográfico Animado</option>
                    <option value="infographic_focus">Foco Total no Infográfico</option>
                  </select>
                </label>

                <div className="flex items-center justify-between pt-2 border-t border-[#232C3D]">
                  <span className="font-semibold text-[#F1F5F9]">Infográfico científico animado</span>
                  <label className="inline-flex items-center gap-1.5 text-[#F1F5F9]">
                    <input
                      type="checkbox"
                      checked={Boolean(selectedScene.infographic)}
                      onChange={(e) =>
                        updateSelectedScene({
                          infographic: e.target.checked
                            ? {
                                kind: 'process_diagram',
                                title: selectedScene.title.toUpperCase(),
                                stage: 1,
                                accentColor: '#FFD23F',
                                callouts: [
                                  {
                                    id: 'c_edit_1',
                                    label: 'CONCEITO CHAVE',
                                    x: 0.2,
                                    y: 0.25,
                                    targetX: 0.5,
                                    targetY: 0.48,
                                    color: '#FFD23F',
                                  },
                                ],
                              }
                            : undefined,
                        })
                      }
                      className="accent-[#E5A032]"
                    />
                    Ativo
                  </label>
                </div>

                {selectedScene.infographic && (
                  <div className="space-y-3">
                    <label className="block space-y-1">
                      <span className="text-[#94A3B8]">Tipo de diagrama pixel</span>
                      <select
                        value={selectedScene.infographic.kind}
                        onChange={(e) =>
                          updateSelectedScene({
                            infographic: {
                              ...selectedScene.infographic!,
                              kind: e.target.value as InfographicKind,
                            },
                          })
                        }
                        className="w-full rounded border border-[#232C3D] bg-[#0B0E14] px-2.5 py-1.5 text-[#F1F5F9]"
                      >
                        {INFOGRAPHIC_KINDS.map((k) => (
                          <option key={k.value} value={k.value}>
                            {k.label}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="block space-y-1">
                      <span className="text-[#94A3B8]">Título do painel</span>
                      <input
                        type="text"
                        value={selectedScene.infographic.title}
                        onChange={(e) =>
                          updateSelectedScene({
                            infographic: { ...selectedScene.infographic!, title: e.target.value },
                          })
                        }
                        className="w-full rounded border border-[#232C3D] bg-[#0B0E14] px-2.5 py-1.5 text-[#F1F5F9]"
                      />
                    </label>

                    <label className="block space-y-1">
                      <span className="text-[#94A3B8] font-mono tabular-nums">
                        Estágio da animação ({selectedScene.infographic.stage ?? 0})
                      </span>
                      <input
                        type="range"
                        min={0}
                        max={4}
                        step={1}
                        value={selectedScene.infographic.stage ?? 0}
                        onChange={(e) =>
                          updateSelectedScene({
                            infographic: { ...selectedScene.infographic!, stage: Number(e.target.value) },
                          })
                        }
                        className="w-full"
                      />
                    </label>

                    <div className="pt-2 border-t border-[#232C3D] space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[#94A3B8] font-medium">Contador animado</span>
                        <label className="inline-flex items-center gap-1.5 text-[#F1F5F9]">
                          <input
                            type="checkbox"
                            checked={Boolean(selectedScene.infographic.liveCounter)}
                            onChange={(e) =>
                              updateSelectedScene({
                                infographic: {
                                  ...selectedScene.infographic!,
                                  liveCounter: e.target.checked
                                    ? { label: 'DADO', startValue: 0, endValue: 100, suffix: '%' }
                                    : undefined,
                                },
                              })
                            }
                            className="accent-[#E5A032]"
                          />
                          Exibir
                        </label>
                      </div>
                      {selectedScene.infographic.liveCounter && (
                        <div className="grid grid-cols-2 gap-2">
                          <label className="space-y-0.5">
                            <span className="text-[11px] text-[#94A3B8]">Início</span>
                            <input
                              type="number"
                              value={selectedScene.infographic.liveCounter.startValue}
                              onChange={(e) =>
                                updateSelectedScene({
                                  infographic: {
                                    ...selectedScene.infographic!,
                                    liveCounter: {
                                      ...selectedScene.infographic!.liveCounter!,
                                      startValue: Number(e.target.value),
                                    },
                                  },
                                })
                              }
                              className="w-full rounded border border-[#232C3D] bg-[#0B0E14] px-2 py-1 font-mono text-[#F1F5F9]"
                            />
                          </label>
                          <label className="space-y-0.5">
                            <span className="text-[11px] text-[#94A3B8]">Fim</span>
                            <input
                              type="number"
                              value={selectedScene.infographic.liveCounter.endValue}
                              onChange={(e) =>
                                updateSelectedScene({
                                  infographic: {
                                    ...selectedScene.infographic!,
                                    liveCounter: {
                                      ...selectedScene.infographic!.liveCounter!,
                                      endValue: Number(e.target.value),
                                    },
                                  },
                                })
                              }
                              className="w-full rounded border border-[#232C3D] bg-[#0B0E14] px-2 py-1 font-mono text-[#F1F5F9]"
                            />
                          </label>
                          <label className="space-y-0.5">
                            <span className="text-[11px] text-[#94A3B8]">Rótulo</span>
                            <input
                              type="text"
                              value={selectedScene.infographic.liveCounter.label}
                              onChange={(e) =>
                                updateSelectedScene({
                                  infographic: {
                                    ...selectedScene.infographic!,
                                    liveCounter: {
                                      ...selectedScene.infographic!.liveCounter!,
                                      label: e.target.value,
                                    },
                                  },
                                })
                              }
                              className="w-full rounded border border-[#232C3D] bg-[#0B0E14] px-2 py-1 text-[#F1F5F9]"
                            />
                          </label>
                          <label className="space-y-0.5">
                            <span className="text-[11px] text-[#94A3B8]">Sufixo</span>
                            <input
                              type="text"
                              value={selectedScene.infographic.liveCounter.suffix ?? ''}
                              onChange={(e) =>
                                updateSelectedScene({
                                  infographic: {
                                    ...selectedScene.infographic!,
                                    liveCounter: {
                                      ...selectedScene.infographic!.liveCounter!,
                                      suffix: e.target.value,
                                    },
                                  },
                                })
                              }
                              className="w-full rounded border border-[#232C3D] bg-[#0B0E14] px-2 py-1 font-mono text-[#F1F5F9]"
                            />
                          </label>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {selectedScene && inspectorTab === 'audio' && (
              <div className="space-y-4">
                <label className="block space-y-1">
                  <span className="text-[#94A3B8]">Trilha sonora procedural</span>
                  <select
                    value={project.audio.musicStyle}
                    onChange={(e) =>
                      onUpdateProject({
                        ...project,
                        audio: {
                          ...project.audio,
                          musicStyle: e.target.value as AudioConfig['musicStyle'],
                        },
                      })
                    }
                    className="w-full rounded border border-[#232C3D] bg-[#0B0E14] px-2.5 py-1.5 text-[#F1F5F9]"
                  >
                    <option value="retro_chiptune">Chiptune 8/16-bit Retrô</option>
                    <option value="horror_drone">Terror / Suspense Drone</option>
                    <option value="noir_pulse">Noir Atmosférico</option>
                    <option value="scifi_synth">Sci-Fi Sintético</option>
                    <option value="adventure_orchestral">Aventura Crepuscular</option>
                    <option value="drama_piano">Drama Minimalista</option>
                    <option value="none">Sem trilha (somente SFX)</option>
                  </select>
                </label>

                <div className="space-y-2">
                  <div className="font-semibold text-[#F1F5F9]">
                    Eventos SFX da cena ({selectedScene.sfxEvents.length})
                  </div>
                  {selectedScene.sfxEvents.length === 0 ? (
                    <p className="text-[#94A3B8]">Nenhum SFX nesta cena. Adicione pela aba Recursos.</p>
                  ) : (
                    selectedScene.sfxEvents.map((ev) => (
                      <div
                        key={ev.id}
                        className="flex items-center justify-between gap-2 px-2.5 py-2 rounded border border-[#232C3D] bg-[#0B0E14]/60"
                      >
                        <div>
                          <div className="text-[#F1F5F9] font-medium">{ev.label}</div>
                          <div className="text-[11px] font-mono tabular-nums text-[#94A3B8]">
                            {ev.sfx} · +{ev.offsetSec.toFixed(2)}s · vol {Math.round(ev.volume * 100)}%
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => audioEngine.playSfx(ev.sfx, ev.volume, 0.2)}
                            className="p-1 text-[#E5A032] hover:bg-[#1A2130] rounded"
                          >
                            <Volume2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              updateSelectedScene({
                                sfxEvents: selectedScene.sfxEvents.filter((x) => x.id !== ev.id),
                              })
                            }
                            className="p-1 text-[#94A3B8] hover:text-[#EF4444]"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                <div className="space-y-3 pt-3 border-t border-[#232C3D]">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-[#F1F5F9]">Legendas palavra a palavra</span>
                    <label className="inline-flex items-center gap-1.5 text-[#F1F5F9]">
                      <input
                        type="checkbox"
                        checked={project.captions.enabled}
                        onChange={(e) =>
                          onUpdateProject({
                            ...project,
                            captions: { ...project.captions, enabled: e.target.checked },
                          })
                        }
                        className="accent-[#E5A032]"
                      />
                      Ativas
                    </label>
                  </div>

                  <label className="block space-y-1">
                    <span className="text-[#94A3B8]">Preset visual</span>
                    <select
                      value={project.captions.preset}
                      onChange={(e) =>
                        onUpdateProject({
                          ...project,
                          captions: { ...project.captions, preset: e.target.value as CaptionPreset },
                        })
                      }
                      className="w-full rounded border border-[#232C3D] bg-[#0B0E14] px-2.5 py-1.5 text-[#F1F5F9]"
                    >
                      <option value="cinematic_bottom">Cinematográfico Limpo</option>
                      <option value="bold_karaoke">Destaque Karaokê (Fundo escuro)</option>
                      <option value="noir_minimal">Noir Minimalista</option>
                      <option value="retro_arcade">Monoespaçado Técnico</option>
                    </select>
                  </label>

                  <div className="grid grid-cols-2 gap-3">
                    <label className="space-y-0.5">
                      <span className="text-[#94A3B8] font-mono tabular-nums">
                        Posição Y ({Math.round(project.captions.positionY * 100)}%)
                      </span>
                      <input
                        type="range"
                        min={0.15}
                        max={0.92}
                        step={0.02}
                        value={project.captions.positionY}
                        onChange={(e) =>
                          onUpdateProject({
                            ...project,
                            captions: { ...project.captions, positionY: Number(e.target.value) },
                          })
                        }
                        className="w-full"
                      />
                    </label>
                    <label className="space-y-0.5">
                      <span className="text-[#94A3B8]">Cor de destaque</span>
                      <input
                        type="color"
                        value={project.captions.highlightColor}
                        onChange={(e) =>
                          onUpdateProject({
                            ...project,
                            captions: { ...project.captions, highlightColor: e.target.value },
                          })
                        }
                        className="w-full h-7 rounded bg-[#0B0E14] border border-[#232C3D]"
                      />
                    </label>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* BOTTOM ZONE 2: Multi-Track Interactive Timeline */}
      <div className="h-[190px] shrink-0 border-t border-[#232C3D] bg-[#0F131C] flex flex-col">
        <div className="px-4 py-1.5 border-b border-[#232C3D] flex items-center justify-between text-xs">
          <div className="flex items-center gap-2 text-[#94A3B8]">
            <Film className="w-3.5 h-3.5 text-[#E5A032]" />
            <span className="font-medium text-[#F1F5F9]">Timeline Multi-Faixa</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums">Cena ativa: {safeSceneIdx + 1}/{project.scenes.length}</span>
          </div>
          <div className="flex items-center gap-2 text-[#94A3B8]">
            <span>Zoom</span>
            <input
              type="range"
              min={0.6}
              max={2.4}
              step={0.1}
              value={timelineZoom}
              onChange={(e) => setTimelineZoom(Number(e.target.value))}
              className="w-24"
            />
            <span className="font-mono tabular-nums w-10 text-right">{Math.round(timelineZoom * 100)}%</span>
          </div>
        </div>

        <div className="flex-1 overflow-x-auto overflow-y-hidden relative">
          <div className="flex h-full" style={{ width: timelineTrackWidth + 110 }}>
            {/* Track headers */}
            <div className="w-[110px] shrink-0 border-r border-[#232C3D] bg-[#121721] flex flex-col text-[11px] text-[#94A3B8] select-none">
              <div className="h-6 px-2.5 flex items-center border-b border-[#232C3D] font-mono">Tempo</div>
              <div className="h-9 px-2.5 flex items-center border-b border-[#232C3D]">Cenas & Câm.</div>
              <div className="h-8 px-2.5 flex items-center border-b border-[#232C3D]">Atores / FX</div>
              <div className="h-8 px-2.5 flex items-center border-b border-[#232C3D]">Áudio / SFX</div>
              <div className="flex-1 px-2.5 flex items-center">Legendas</div>
            </div>

            {/* Scrubbable tracks area */}
            <div
              className="relative flex-1 cursor-pointer select-none"
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                const nextT = ratio * project.totalDuration;
                setCurrentTime(nextT);
                const located = findSceneAtTime(project, nextT);
                if (located) setSelectedSceneIndex(located.scene.index);
              }}
            >
              {/* Time ruler */}
              <div className="h-6 border-b border-[#232C3D] relative bg-[#0B0E14]">
                {Array.from({ length: Math.ceil(project.totalDuration / 2) + 1 }, (_, i) => i * 2).map((sec) => {
                  const leftPct = (sec / Math.max(0.1, project.totalDuration)) * 100;
                  if (leftPct > 98) return null;
                  return (
                    <div
                      key={sec}
                      style={{ left: `${leftPct}%` }}
                      className="absolute top-0 bottom-0 border-l border-[#232C3D] pl-1 text-[10px] font-mono tabular-nums text-[#64748B] flex items-center"
                    >
                      {sec}s
                    </div>
                  );
                })}
              </div>

              {/* Scenes track */}
              <div className="h-9 border-b border-[#232C3D] flex relative">
                {project.scenes.map((sc, idx) => {
                  const widthPct = (sc.duration / Math.max(0.1, project.totalDuration)) * 100;
                  const active = idx === safeSceneIdx;
                  return (
                    <div
                      key={sc.id}
                      style={{ width: `${widthPct}%` }}
                      className={`h-full border-r border-[#0B0E14] px-2 flex flex-col justify-center overflow-hidden ${
                        active ? 'bg-[#E5A032]/25 border-t border-t-[#E5A032]' : 'bg-[#1A2130]/90 hover:bg-[#212A3D]'
                      }`}
                    >
                      <div className="text-[11px] font-medium text-[#F1F5F9] truncate">
                        {idx + 1}. {sc.title}
                      </div>
                      <div className="text-[10px] font-mono text-[#94A3B8] truncate">{sc.cameraMove}</div>
                    </div>
                  );
                })}
              </div>

              {/* Actors & FX track */}
              <div className="h-8 border-b border-[#232C3D] flex relative">
                {project.scenes.map((sc) => {
                  const widthPct = (sc.duration / Math.max(0.1, project.totalDuration)) * 100;
                  return (
                    <div
                      key={sc.id}
                      style={{ width: `${widthPct}%` }}
                      className="h-full border-r border-[#0B0E14] px-2 flex items-center bg-[#142030]/75 text-[10px] font-mono text-[#93C5FD] truncate"
                    >
                      {sc.actors.map((a) => `${a.state}${a.nextState && a.nextState !== a.state ? `→${a.nextState}` : ''}`).join(' · ') || '—'}
                    </div>
                  );
                })}
              </div>

              {/* Audio & SFX track */}
              <div className="h-8 border-b border-[#232C3D] relative bg-[#11191D]">
                {project.scenes.map((sc, idx) =>
                  sc.sfxEvents.map((ev) => {
                    const leftPct = (((sceneStarts[idx] ?? 0) + ev.offsetSec) / Math.max(0.1, project.totalDuration)) * 100;
                    return (
                      <div
                        key={ev.id}
                        style={{ left: `${Math.min(94, leftPct)}%` }}
                        className="absolute top-1 bottom-1 px-1.5 rounded bg-[#16A34A]/25 border border-[#16A34A]/60 text-[10px] font-mono text-[#86EFAC] flex items-center whitespace-nowrap"
                      >
                        {ev.sfx}
                      </div>
                    );
                  })
                )}
              </div>

              {/* Captions track */}
              <div className="flex-1 flex relative bg-[#0B0E14]/50">
                {project.scenes.map((sc) => {
                  const widthPct = (sc.duration / Math.max(0.1, project.totalDuration)) * 100;
                  return (
                    <div
                      key={sc.id}
                      style={{ width: `${widthPct}%` }}
                      className="h-full border-r border-[#232C3D]/50 px-2 flex items-center text-[10px] text-[#94A3B8] truncate"
                    >
                      {project.captions.enabled && sc.captionText ? sc.captionText : '—'}
                    </div>
                  );
                })}
              </div>

              {/* Live Playhead */}
              <div
                style={{ left: `${(currentTime / Math.max(0.1, project.totalDuration)) * 100}%` }}
                className="absolute top-0 bottom-0 w-0.5 bg-[#E5A032] pointer-events-none z-10"
              >
                <div className="w-2.5 h-2.5 -ml-[4px] bg-[#E5A032] rotate-45 -mt-1" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
