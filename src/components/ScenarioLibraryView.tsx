import React, { useEffect, useRef, useState } from 'react';
import { Layers, Plus, Trash2, Upload } from 'lucide-react';
import type { ScenarioDefinition, ScenarioLayer, ScenarioProp } from '../types/studio';
import { DEFAULT_EFFECTS, DEFAULT_LIGHTING, STARTER_CHARACTERS } from '../data/presets';
import { renderProjectFrame } from '../engines/sceneRenderer';

interface ScenarioLibraryViewProps {
  scenarios: ScenarioDefinition[];
  onUpdateScenario: (scenario: ScenarioDefinition) => void;
  onAddScenario: (scenario: ScenarioDefinition) => void;
}

export const ScenarioLibraryView: React.FC<ScenarioLibraryViewProps> = ({
  scenarios,
  onUpdateScenario,
  onAddScenario,
}) => {
  const [selectedId, setSelectedId] = useState(scenarios[0]?.id ?? '');
  const [panSlider, setPanSlider] = useState(0);
  const [autoPan, setAutoPan] = useState(true);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const layerUploadRef = useRef<HTMLInputElement | null>(null);
  const [uploadTargetLayerId, setUploadTargetLayerId] = useState<string>('bg');

  const selected = scenarios.find((s) => s.id === selectedId) ?? scenarios[0];

  useEffect(() => {
    if (!selected) return;
    let raf = 0;
    const start = performance.now();

    const draw = (now: number) => {
      const elapsed = (now - start) / 1000;
      const t = autoPan ? elapsed % 6 : ((panSlider + 1) / 2) * 6;
      const c = canvasRef.current;
      if (c) {
        const ctx = c.getContext('2d');
        if (ctx) {
          const isRetroPixel = selected.genre === 'educational';
          // Render through the real compositor to verify genuine 3-layer parallax
          renderProjectFrame(
            ctx,
            {
              schemaVersion: '1.0.0',
              id: 'preview_scen',
              title: selected.name,
              prompt: '',
              genre: selected.genre,
              visualStyle: isRetroPixel ? 'retro_pixel_educational' : 'cinematic_2d',
              pixelConfig: isRetroPixel
                ? {
                    logicalWidth: 320,
                    logicalHeight: 180,
                    ditherStrength: 0.72,
                    scalingMode: 'nearest',
                    paletteName: 'arcade_90s_neon',
                    outlinePx: 1,
                  }
                : undefined,
              themeSummary: '',
              totalDuration: 6,
              engineUsed: 'offline_rules',
              performanceProfile: 'equilibrado',
              format: {
                aspectRatio: '16:9',
                previewResolution: '540p',
                exportResolution: '1080p',
                fps: 24,
                renderer: 'ffmpeg_mp4',
              },
              visualIdentity: { mood: '', palette: [], lightingStyle: '', cameraLanguage: '' },
              characterBible: [],
              scenarios: [selected],
              script: [],
              audio: {
                musicStyle: 'none',
                musicVolume: 0,
                sfxVolume: 0,
                voiceVolume: 0,
                fadeInSec: 0,
                fadeOutSec: 0,
                duckingAmount: 0,
                normalize: true,
                narrationMode: 'none',
              },
              captions: {
                enabled: false,
                preset: 'noir_minimal',
                fontSize: 28,
                positionY: 0.85,
                safeAreaMargin: 0.08,
                highlightColor: '#E5A032',
                textColor: '#F1F5F9',
                outlineWidth: 3,
                shadowBlur: 6,
                enterAnimation: 'fade',
                exitAnimation: 'fade',
              },
              createdAt: '',
              updatedAt: '',
              scenes: [
                {
                  id: 'sc_prev',
                  index: 0,
                  title: selected.name,
                  summary: '',
                  narrativeIntent: 'abertura',
                  duration: 6,
                  scenarioId: selected.id,
                  framing: 'wide',
                  cameraMove: 'pan',
                  cameraIntensity: 0.9,
                  transitionIn: 'cut',
                  lighting: { ...DEFAULT_LIGHTING, ambientIntensity: 0.55 },
                  effects: { ...DEFAULT_EFFECTS, fog: 0.22, dust: 0.3, vignette: 0.4 },
                  actors: [],
                  sfxEvents: [],
                  captionText: '',
                  visualPrompt: '',
                  colorPalette: [selected.skyTop, selected.skyBottom, selected.accentColor],
                },
              ],
            },
            t,
            c.width,
            c.height,
            STARTER_CHARACTERS,
            [selected]
          );
        }
      }
      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [selected, autoPan, panSlider]);

  const handleLayerImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selected) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== 'string') return;
      const updatedLayers = selected.layers.map((l) =>
        l.id === uploadTargetLayerId ? { ...l, customImageUrl: reader.result as string } : l
      );
      onUpdateScenario({ ...selected, layers: updatedLayers });
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleCreateCustomScenario = () => {
    const created: ScenarioDefinition = {
      id: `scen_custom_${Date.now().toString(36)}`,
      name: `Cenário Personalizado ${scenarios.length + 1}`,
      genre: 'horror',
      theme: 'haunted_manor_hall',
      description: 'Cenário multicamada personalizável com parallax em 3 planos.',
      skyTop: '#0B101D',
      skyBottom: '#1E293B',
      groundColor: '#171516',
      accentColor: '#E5A032',
      ambientTint: '#111827',
      layers: [
        { id: 'bg', name: 'Background', depth: 'background', parallaxFactor: 0.25, opacity: 1 },
        { id: 'mg', name: 'Midground', depth: 'midground', parallaxFactor: 0.6, opacity: 1 },
        { id: 'fg', name: 'Foreground', depth: 'foreground', parallaxFactor: 1.2, opacity: 0.9 },
      ],
      props: [{ id: `p_${Date.now()}`, label: 'Janela ao luar', kind: 'window_moon', x: 0.3, y: 0.3, scale: 1, depth: 'background' }],
    };
    onAddScenario(created);
    setSelectedId(created.id);
  };

  const updateLayer = (layerId: string, patch: Partial<ScenarioLayer>) => {
    if (!selected) return;
    onUpdateScenario({
      ...selected,
      layers: selected.layers.map((l) => (l.id === layerId ? { ...l, ...patch } : l)),
    });
  };

  const addProp = (kind: ScenarioProp['kind']) => {
    if (!selected) return;
    const labels: Record<ScenarioProp['kind'], string> = {
      door_ajar: 'Porta entreaberta',
      staircase: 'Escadaria',
      lamp_post: 'Poste de luz',
      window_moon: 'Janela ao luar',
      holo_sign: 'Painel holográfico',
      tree_gnarled: 'Árvore antiga',
      pillar: 'Pilar estrutural',
      crate: 'Caixa de carga',
      storefront_vitrine: 'Vitrine noturna',
    };
    onUpdateScenario({
      ...selected,
      props: [
        ...selected.props,
        {
          id: `prop_${Date.now().toString(36)}`,
          label: labels[kind],
          kind,
          x: 0.5,
          y: 0.52,
          scale: 1,
          depth: 'midground',
        },
      ],
    });
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <input
        ref={layerUploadRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={handleLayerImageUpload}
      />

      <div className="px-6 py-4 border-b border-[#232C3D] flex items-center justify-between bg-[#0F131C]">
        <div>
          <h1 className="text-lg font-semibold text-[#F1F5F9]">Biblioteca de Cenários 2D e Parallax</h1>
          <p className="text-xs text-[#94A3B8] mt-0.5">
            Composição em 3 planos de profundidade (Background, Midground, Foreground), importação de fundos PNG/JPG e objetos posicionáveis.
          </p>
        </div>
        <button
          type="button"
          onClick={handleCreateCustomScenario}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-[#0B0E14] bg-[#E5A032] hover:bg-[#F0B14B] rounded-md whitespace-nowrap"
        >
          <Plus className="w-3.5 h-3.5" />
          Novo cenário
        </button>
      </div>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 overflow-hidden">
        {/* Scenario list */}
        <div className="lg:col-span-3 border-r border-[#232C3D] bg-[#121721] p-4 overflow-y-auto space-y-2">
          {scenarios.map((sc) => (
            <button
              key={sc.id}
              type="button"
              onClick={() => setSelectedId(sc.id)}
              className={`w-full text-left p-3 rounded-md border transition-colors ${
                selected?.id === sc.id
                  ? 'border-[#E5A032] bg-[#1A2130]'
                  : 'border-[#232C3D] bg-[#0B0E14]/50 hover:bg-[#1A2130]/60'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-[#F1F5F9] truncate">{sc.name}</span>
                <span
                  className="w-3 h-3 rounded-sm border border-white/20 shrink-0"
                  style={{ backgroundColor: sc.accentColor }}
                />
              </div>
              <p className="text-xs text-[#94A3B8] mt-1 line-clamp-2">{sc.description}</p>
            </button>
          ))}
        </div>

        {/* Live Parallax Preview */}
        <div className="lg:col-span-5 border-r border-[#232C3D] bg-[#0B0E14] p-5 flex flex-col space-y-4 overflow-y-auto">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-[#F1F5F9]">{selected?.name}</h2>
            <label className="inline-flex items-center gap-2 text-xs text-[#94A3B8]">
              <input
                type="checkbox"
                checked={autoPan}
                onChange={(e) => setAutoPan(e.target.checked)}
                className="accent-[#E5A032]"
              />
              Pan automático de câmera
            </label>
          </div>

          <div className="border border-[#232C3D] rounded-lg overflow-hidden bg-black flex items-center justify-center">
            <canvas
              ref={canvasRef}
              width={640}
              height={360}
              style={{ imageRendering: selected?.genre === 'educational' ? 'pixelated' : 'auto' }}
              className="w-full h-auto"
            />
          </div>

          {!autoPan && (
            <label className="block space-y-1 text-xs">
              <span className="text-[#94A3B8]">Testar profundidade parallax horizontal</span>
              <input
                type="range"
                min={-1}
                max={1}
                step={0.02}
                value={panSlider}
                onChange={(e) => setPanSlider(Number(e.target.value))}
                className="w-full"
              />
            </label>
          )}

          {selected && (
            <div className="grid grid-cols-3 gap-3 pt-2 text-xs">
              <label className="space-y-1">
                <span className="text-[#94A3B8]">Céu / Topo</span>
                <input
                  type="color"
                  value={selected.skyTop}
                  onChange={(e) => onUpdateScenario({ ...selected, skyTop: e.target.value })}
                  className="w-full h-8 rounded bg-[#121721] border border-[#232C3D]"
                />
              </label>
              <label className="space-y-1">
                <span className="text-[#94A3B8]">Horizonte</span>
                <input
                  type="color"
                  value={selected.skyBottom}
                  onChange={(e) => onUpdateScenario({ ...selected, skyBottom: e.target.value })}
                  className="w-full h-8 rounded bg-[#121721] border border-[#232C3D]"
                />
              </label>
              <label className="space-y-1">
                <span className="text-[#94A3B8]">Luz de destaque</span>
                <input
                  type="color"
                  value={selected.accentColor}
                  onChange={(e) => onUpdateScenario({ ...selected, accentColor: e.target.value })}
                  className="w-full h-8 rounded bg-[#121721] border border-[#232C3D]"
                />
              </label>
            </div>
          )}
        </div>

        {/* Parallax Layers & Props Inspector */}
        <div className="lg:col-span-4 bg-[#121721] p-5 overflow-y-auto space-y-6">
          {selected && (
            <>
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-xs font-semibold text-[#F1F5F9]">
                  <Layers className="w-4 h-4 text-[#E5A032]" />
                  Camadas de Parallax (BG / MG / FG)
                </div>

                {selected.layers.map((layer) => (
                  <div
                    key={layer.id}
                    className="border border-[#232C3D] bg-[#0B0E14]/60 rounded-md p-3 space-y-2.5 text-xs"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <div className="font-medium text-[#F1F5F9]">{layer.name}</div>
                        <div className="text-[11px] font-mono text-[#64748B]">{layer.depth}</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setUploadTargetLayerId(layer.id);
                          layerUploadRef.current?.click();
                        }}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-[#F1F5F9] bg-[#1A2130] hover:bg-[#212A3D] rounded"
                      >
                        <Upload className="w-3 h-3" />
                        Imagem PNG
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <label className="space-y-1">
                        <span className="text-[#94A3B8] font-mono tabular-nums">
                          Fator: {layer.parallaxFactor.toFixed(2)}x
                        </span>
                        <input
                          type="range"
                          min={0}
                          max={2}
                          step={0.05}
                          value={layer.parallaxFactor}
                          onChange={(e) => updateLayer(layer.id, { parallaxFactor: Number(e.target.value) })}
                          className="w-full"
                        />
                      </label>
                      <label className="space-y-1">
                        <span className="text-[#94A3B8] font-mono tabular-nums">
                          Opacidade: {Math.round(layer.opacity * 100)}%
                        </span>
                        <input
                          type="range"
                          min={0.1}
                          max={1}
                          step={0.05}
                          value={layer.opacity}
                          onChange={(e) => updateLayer(layer.id, { opacity: Number(e.target.value) })}
                          className="w-full"
                        />
                      </label>
                    </div>
                  </div>
                ))}
              </div>

              <div className="space-y-3 pt-4 border-t border-[#232C3D]">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-semibold text-[#F1F5F9]">Objetos de cena ({selected.props.length})</h3>
                  <select
                    defaultValue=""
                    onChange={(e) => {
                      if (e.target.value) {
                        addProp(e.target.value as ScenarioProp['kind']);
                        e.target.value = '';
                      }
                    }}
                    className="rounded border border-[#232C3D] bg-[#1A2130] px-2 py-1 text-xs text-[#F1F5F9]"
                  >
                    <option value="">+ Adicionar objeto</option>
                    <option value="door_ajar">Porta entreaberta</option>
                    <option value="staircase">Escadaria</option>
                    <option value="window_moon">Janela ao luar</option>
                    <option value="lamp_post">Poste urbano</option>
                    <option value="holo_sign">Painel holográfico</option>
                    <option value="tree_gnarled">Árvore antiga</option>
                    <option value="pillar">Pilar</option>
                    <option value="crate">Caixa</option>
                    <option value="storefront_vitrine">Vitrine noturna</option>
                  </select>
                </div>

                <div className="space-y-2">
                  {selected.props.map((prop) => (
                    <div
                      key={prop.id}
                      className="border border-[#232C3D] bg-[#0B0E14]/60 rounded-md p-2.5 space-y-2 text-xs"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-[#F1F5F9]">{prop.label}</span>
                        <button
                          type="button"
                          onClick={() =>
                            onUpdateScenario({
                              ...selected,
                              props: selected.props.filter((p) => p.id !== prop.id),
                            })
                          }
                          className="text-[#94A3B8] hover:text-[#EF4444]"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <label className="space-y-0.5">
                          <span className="text-[11px] text-[#94A3B8] font-mono tabular-nums">X: {Math.round(prop.x * 100)}%</span>
                          <input
                            type="range"
                            min={0.05}
                            max={0.95}
                            step={0.02}
                            value={prop.x}
                            onChange={(e) =>
                              onUpdateScenario({
                                ...selected,
                                props: selected.props.map((p) =>
                                  p.id === prop.id ? { ...p, x: Number(e.target.value) } : p
                                ),
                              })
                            }
                            className="w-full"
                          />
                        </label>
                        <label className="space-y-0.5">
                          <span className="text-[11px] text-[#94A3B8] font-mono tabular-nums">Escala: {prop.scale.toFixed(2)}x</span>
                          <input
                            type="range"
                            min={0.5}
                            max={1.8}
                            step={0.05}
                            value={prop.scale}
                            onChange={(e) =>
                              onUpdateScenario({
                                ...selected,
                                props: selected.props.map((p) =>
                                  p.id === prop.id ? { ...p, scale: Number(e.target.value) } : p
                                ),
                              })
                            }
                            className="w-full"
                          />
                        </label>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
