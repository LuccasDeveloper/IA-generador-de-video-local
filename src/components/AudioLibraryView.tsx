import React, { useState } from 'react';
import { Download, Music, Plus, Square, Volume2 } from 'lucide-react';
import type { AudioConfig, ProjectPlan, SfxType } from '../types/studio';
import { audioEngine, SFX_CATALOG } from '../engines/audioEngine';
import { exportSubtitles } from '../engines/videoExporter';

interface AudioLibraryViewProps {
  activeProject: ProjectPlan | null;
  onUpdateProject: (updated: ProjectPlan) => void;
  onAddSfxToActiveScene?: (sfx: SfxType, label: string) => void;
}

const MUSIC_STYLES: Array<{ id: AudioConfig['musicStyle']; label: string; desc: string }> = [
  { id: 'retro_chiptune', label: 'Chiptune 8/16-bit Retrô', desc: 'Arpejo arcade alegre em onda quadrada + baixo triangular para animações educativas.' },
  { id: 'horror_drone', label: 'Suspense / Terror Drone', desc: 'Textura grave tensa com pulsos espaçados para terror e mistério.' },
  { id: 'noir_pulse', label: 'Noir Atmosférico', desc: 'Cama grave contemplativa para investigação urbana.' },
  { id: 'scifi_synth', label: 'Sci-Fi Sintético', desc: 'Arpejo rítmico eletrônico para perseguições futuristas.' },
  { id: 'adventure_orchestral', label: 'Aventura Crepuscular', desc: 'Harmonia ascendente para descoberta e jornada.' },
  { id: 'drama_piano', label: 'Drama Minimalista', desc: 'Pulsos limpos e suaves para cenas de diálogo.' },
];

export const AudioLibraryView: React.FC<AudioLibraryViewProps> = ({
  activeProject,
  onUpdateProject,
  onAddSfxToActiveScene,
}) => {
  const [playingMusic, setPlayingMusic] = useState<string | null>(null);

  const audioCfg: AudioConfig = activeProject?.audio ?? {
    musicStyle: 'horror_drone',
    musicVolume: 0.48,
    sfxVolume: 0.85,
    voiceVolume: 0.8,
    fadeInSec: 1.2,
    fadeOutSec: 1.8,
    duckingAmount: 0.42,
    normalize: true,
    narrationMode: 'none',
  };

  const patchAudio = (patch: Partial<AudioConfig>) => {
    if (!activeProject) return;
    const next = { ...activeProject.audio, ...patch };
    audioEngine.updateMixer(next);
    onUpdateProject({ ...activeProject, audio: next, updatedAt: new Date().toISOString() });
  };

  const toggleMusicPreview = (style: AudioConfig['musicStyle']) => {
    if (playingMusic === style) {
      audioEngine.stopAll();
      setPlayingMusic(null);
      return;
    }
    audioEngine.stopAll();
    audioEngine.startProceduralMusic(style, audioCfg, 16);
    setPlayingMusic(style);
  };

  return (
    <div className="flex-1 overflow-y-auto p-7 space-y-8 max-w-[1360px]">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold text-[#F1F5F9]">Biblioteca de Áudio Procedural e Legendas</h1>
          <p className="text-xs text-[#94A3B8] mt-0.5">
            Paridade total com synth_audio.py e captions.py: 12 efeitos sonoros sintetizados, trilha procedural, ducking, normalização e exportação ASS/SRT.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {playingMusic && (
            <button
              type="button"
              onClick={() => {
                audioEngine.stopAll();
                setPlayingMusic(null);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#FCA5A5] border border-[#7F1D1D] bg-[#450A0A]/40 rounded-md"
            >
              <Square className="w-3 h-3" />
              Parar áudio
            </button>
          )}
          {activeProject && (
            <>
              <button
                type="button"
                onClick={() => exportSubtitles(activeProject, 'ass')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#F1F5F9] border border-[#232C3D] bg-[#121721] hover:bg-[#1A2130] rounded-md"
              >
                <Download className="w-3.5 h-3.5" />
                Exportar .ASS
              </button>
              <button
                type="button"
                onClick={() => exportSubtitles(activeProject, 'srt')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#F1F5F9] border border-[#232C3D] bg-[#121721] hover:bg-[#1A2130] rounded-md"
              >
                <Download className="w-3.5 h-3.5" />
                Exportar .SRT
              </button>
            </>
          )}
        </div>
      </div>

      {/* Procedural SFX Grid */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-[#F1F5F9]">
          Efeitos sonoros procedurais ({SFX_CATALOG.length} módulos)
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {SFX_CATALOG.map((item) => (
            <div
              key={item.type}
              className="border border-[#232C3D] bg-[#121721] rounded-lg p-3.5 flex flex-col justify-between gap-3"
            >
              <div>
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-[#F1F5F9]">{item.label}</span>
                  <span className="font-mono tabular-nums text-[11px] text-[#94A3B8]">
                    {item.category} · {item.durationSec.toFixed(2)}s
                  </span>
                </div>
                <p className="text-xs text-[#94A3B8] mt-1.5 leading-relaxed">{item.description}</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => audioEngine.playSfx(item.type, audioCfg.sfxVolume, audioCfg.duckingAmount)}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#F1F5F9] bg-[#1A2130] hover:bg-[#212A3D] rounded transition-colors"
                >
                  <Volume2 className="w-3.5 h-3.5 text-[#E5A032]" />
                  Ouvir SFX
                </button>
                {activeProject && onAddSfxToActiveScene && (
                  <button
                    type="button"
                    onClick={() => onAddSfxToActiveScene(item.type, item.label)}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-[#0B0E14] bg-[#E5A032] hover:bg-[#F0B14B] rounded transition-colors"
                    title="Inserir na primeira cena do projeto ativo"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Cena
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Procedural Music + Master Mixer */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 space-y-3">
          <h2 className="text-sm font-semibold text-[#F1F5F9]">Trilhas sonoras procedurais</h2>
          <div className="border border-[#232C3D] bg-[#121721] rounded-lg divide-y divide-[#232C3D]">
            {MUSIC_STYLES.map((m) => {
              const isPlaying = playingMusic === m.id;
              const isSelected = activeProject?.audio.musicStyle === m.id;
              return (
                <div key={m.id} className="p-3.5 flex items-center justify-between gap-4">
                  <div>
                    <div className="text-xs font-semibold text-[#F1F5F9]">{m.label}</div>
                    <div className="text-xs text-[#94A3B8] mt-0.5">{m.desc}</div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => toggleMusicPreview(m.id)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#F1F5F9] bg-[#1A2130] hover:bg-[#212A3D] rounded"
                    >
                      <Music className="w-3.5 h-3.5 text-[#E5A032]" />
                      {isPlaying ? 'Parar' : 'Testar'}
                    </button>
                    {activeProject && (
                      <button
                        type="button"
                        onClick={() => patchAudio({ musicStyle: m.id })}
                        className={`px-3 py-1.5 text-xs font-medium rounded ${
                          isSelected
                            ? 'bg-[#E5A032] text-[#0B0E14]'
                            : 'border border-[#232C3D] text-[#94A3B8] hover:text-[#F1F5F9]'
                        }`}
                      >
                        {isSelected ? 'Ativa' : 'Usar'}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="lg:col-span-5 space-y-3">
          <h2 className="text-sm font-semibold text-[#F1F5F9]">Mixer estéreo e normalização</h2>
          <div className="border border-[#232C3D] bg-[#121721] rounded-lg p-4 space-y-4 text-xs">
            {!activeProject && (
              <p className="text-[#94A3B8]">
                Abra ou crie um projeto para salvar ajustes de mixagem diretamente na timeline.
              </p>
            )}
            <label className="block space-y-1">
              <div className="flex justify-between text-[#94A3B8]">
                <span>Volume da trilha</span>
                <span className="font-mono tabular-nums text-[#F1F5F9]">{Math.round(audioCfg.musicVolume * 100)}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                disabled={!activeProject}
                value={audioCfg.musicVolume}
                onChange={(e) => patchAudio({ musicVolume: Number(e.target.value) })}
                className="w-full"
              />
            </label>
            <label className="block space-y-1">
              <div className="flex justify-between text-[#94A3B8]">
                <span>Volume dos SFX</span>
                <span className="font-mono tabular-nums text-[#F1F5F9]">{Math.round(audioCfg.sfxVolume * 100)}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                disabled={!activeProject}
                value={audioCfg.sfxVolume}
                onChange={(e) => patchAudio({ sfxVolume: Number(e.target.value) })}
                className="w-full"
              />
            </label>
            <label className="block space-y-1">
              <div className="flex justify-between text-[#94A3B8]">
                <span>Ducking automático (redução da trilha nos SFX)</span>
                <span className="font-mono tabular-nums text-[#F1F5F9]">{Math.round(audioCfg.duckingAmount * 100)}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                disabled={!activeProject}
                value={audioCfg.duckingAmount}
                onChange={(e) => patchAudio({ duckingAmount: Number(e.target.value) })}
                className="w-full"
              />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="space-y-1">
                <span className="text-[#94A3B8] font-mono tabular-nums">Fade In ({audioCfg.fadeInSec}s)</span>
                <input
                  type="range"
                  min={0}
                  max={4}
                  step={0.2}
                  disabled={!activeProject}
                  value={audioCfg.fadeInSec}
                  onChange={(e) => patchAudio({ fadeInSec: Number(e.target.value) })}
                  className="w-full"
                />
              </label>
              <label className="space-y-1">
                <span className="text-[#94A3B8] font-mono tabular-nums">Fade Out ({audioCfg.fadeOutSec}s)</span>
                <input
                  type="range"
                  min={0}
                  max={4}
                  step={0.2}
                  disabled={!activeProject}
                  value={audioCfg.fadeOutSec}
                  onChange={(e) => patchAudio({ fadeOutSec: Number(e.target.value) })}
                  className="w-full"
                />
              </label>
            </div>
            <label className="flex items-center gap-2 pt-2 border-t border-[#232C3D] text-[#F1F5F9]">
              <input
                type="checkbox"
                disabled={!activeProject}
                checked={audioCfg.normalize}
                onChange={(e) => patchAudio({ normalize: e.target.checked })}
                className="accent-[#E5A032]"
              />
              Normalização automática estéreo (-1.2 dB)
            </label>
          </div>
        </div>
      </section>
    </div>
  );
};
