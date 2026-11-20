import type { AudioConfig, ProjectPlan, SfxType } from '../types/studio';

export const SFX_CATALOG: Array<{
  type: SfxType;
  label: string;
  category: string;
  durationSec: number;
  description: string;
}> = [
  { type: 'whoosh', label: 'Whoosh', category: 'Movimento', durationSec: 0.65, description: 'Passagem rápida de ar para cortes e movimentos.' },
  { type: 'impact', label: 'Impact', category: 'Ação', durationSec: 0.55, description: 'Golpe seco com transiente forte e grave.' },
  { type: 'boom', label: 'Boom', category: 'Cinematográfico', durationSec: 1.4, description: 'Sub-grave profundo para revelações dramáticas.' },
  { type: 'riser', label: 'Riser', category: 'Suspense', durationSec: 1.8, description: 'Varredura ascendente de tensão antes do clímax.' },
  { type: 'heartbeat', label: 'Heartbeat', category: 'Suspense', durationSec: 1.1, description: 'Pulso duplo cardíaco grave e ritmado.' },
  { type: 'glitch', label: 'Glitch', category: 'Digital', durationSec: 0.5, description: 'Ruído modulado de interferência eletrônica.' },
  { type: 'pop', label: 'Pop', category: 'UI / Ênfase', durationSec: 0.22, description: 'Estalo limpo para surgimento de elementos.' },
  { type: 'boing', label: 'Boing', category: 'Movimento', durationSec: 0.5, description: 'Impulso elástico com pitch descendente/ascendente.' },
  { type: 'wind', label: 'Wind', category: 'Ambiência', durationSec: 2.0, description: 'Vento filtrado atmosférico para cenários abertos ou sombrios.' },
  { type: 'knock', label: 'Knock', category: 'Realismo', durationSec: 0.65, description: 'Batidas secas em madeira ou passos no andar superior.' },
  { type: 'creak', label: 'Creak', category: 'Terror', durationSec: 1.2, description: 'Ranger metálico/madeira de porta entreaberta.' },
  { type: 'sting', label: 'Sting', category: 'Terror', durationSec: 1.35, description: 'Acorde dissonante súbito de susto cinematográfico.' },
  { type: 'arcade_blip', label: 'Arcade Blip', category: 'Retrô 8-Bit', durationSec: 0.22, description: 'Bipe 8-bit nítido para destaques, passos e infográficos.' },
  { type: 'arcade_zap', label: 'Arcade Zap', category: 'Retrô 8-Bit', durationSec: 0.45, description: 'Descarga elétrica chiptune para impulsos neurais e circuitos.' },
  { type: 'arcade_freeze', label: 'Arcade Freeze', category: 'Retrô 8-Bit', durationSec: 0.72, description: 'Cristalização gelada cintilante em estilo arcade 16-bit.' },
  { type: 'arcade_coin', label: 'Arcade Coin', category: 'Retrô 8-Bit', durationSec: 0.36, description: 'Duplo chime retrô para aberturas, contadores e curiosidades.' },
  { type: 'arcade_powerup', label: 'Arcade Power-Up', category: 'Retrô 8-Bit', durationSec: 0.62, description: 'Arpejo ascendente vibrante para conclusões e descobertas.' },
];

function createNoiseBuffer(ctx: AudioContext, durationSec: number): AudioBuffer {
  const sampleRate = ctx.sampleRate;
  const length = Math.max(1, Math.floor(sampleRate * durationSec));
  const buffer = ctx.createBuffer(2, length, sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      data[i] = Math.random() * 2 - 1;
    }
  }
  return buffer;
}

class ProceduralAudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  private musicGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private mediaDest: MediaStreamAudioDestinationNode | null = null;
  private activeNodes: AudioNode[] = [];
  private activeStoppables: Array<{ stop: (when?: number) => void }> = [];
  private speechTimers: number[] = [];
  private musicTimer: number | null = null;

  private ensureContext(): AudioContext {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 0.9;

      this.compressor = this.ctx.createDynamicsCompressor();
      this.compressor.threshold.value = -10;
      this.compressor.knee.value = 14;
      this.compressor.ratio.value = 6;
      this.compressor.attack.value = 0.005;
      this.compressor.release.value = 0.16;

      this.musicGain = this.ctx.createGain();
      this.sfxGain = this.ctx.createGain();

      this.musicGain.connect(this.masterGain);
      this.sfxGain.connect(this.masterGain);
      this.masterGain.connect(this.compressor);
      this.compressor.connect(this.ctx.destination);

      this.mediaDest = this.ctx.createMediaStreamDestination();
      this.compressor.connect(this.mediaDest);
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    return this.ctx;
  }

  public getCaptureAudioStream(): MediaStream | null {
    this.ensureContext();
    return this.mediaDest?.stream ?? null;
  }

  public updateMixer(audio: AudioConfig): void {
    const ctx = this.ensureContext();
    const now = ctx.currentTime;
    if (this.musicGain) {
      this.musicGain.gain.setTargetAtTime(audio.musicVolume * 0.65, now, 0.04);
    }
    if (this.sfxGain) {
      this.sfxGain.gain.setTargetAtTime(audio.sfxVolume, now, 0.04);
    }
    if (this.masterGain) {
      this.masterGain.gain.setTargetAtTime(audio.normalize ? 0.95 : 0.78, now, 0.04);
    }
  }

  public stopAll(): void {
    if (this.musicTimer !== null) {
      window.clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
    for (const tid of this.speechTimers) {
      window.clearTimeout(tid);
    }
    this.speechTimers = [];
    for (const node of this.activeStoppables) {
      try {
        node.stop();
      } catch {
        // Ignore already stopped oscillators
      }
    }
    for (const node of this.activeNodes) {
      try {
        node.disconnect();
      } catch {
        // Ignore disconnect errors
      }
    }
    this.activeStoppables = [];
    this.activeNodes = [];
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  }

  public playSfx(type: SfxType, volume = 0.85, duckingAmount = 0.35, startDelaySec = 0): void {
    const ctx = this.ensureContext();
    const t0 = ctx.currentTime + Math.max(0, startDelaySec);
    const out = ctx.createGain();
    out.gain.value = Math.max(0, Math.min(1.2, volume));
    out.connect(this.sfxGain ?? ctx.destination);
    this.activeNodes.push(out);

    // Apply subtle music ducking when loud SFX fires
    if (this.musicGain && duckingAmount > 0.05) {
      const baseVol = Math.max(0.05, this.musicGain.gain.value);
      const ducked = Math.max(0.02, baseVol * (1 - duckingAmount * 0.65));
      this.musicGain.gain.setValueAtTime(baseVol, t0);
      this.musicGain.gain.linearRampToValueAtTime(ducked, t0 + 0.05);
      this.musicGain.gain.linearRampToValueAtTime(baseVol, t0 + 0.75);
    }

    switch (type) {
      case 'whoosh': {
        const src = ctx.createBufferSource();
        src.buffer = createNoiseBuffer(ctx, 0.7);
        const filter = ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.Q.value = 2.4;
        filter.frequency.setValueAtTime(220, t0);
        filter.frequency.exponentialRampToValueAtTime(2400, t0 + 0.28);
        filter.frequency.exponentialRampToValueAtTime(180, t0 + 0.65);
        const env = ctx.createGain();
        env.gain.setValueAtTime(0.001, t0);
        env.gain.linearRampToValueAtTime(0.9, t0 + 0.25);
        env.gain.exponentialRampToValueAtTime(0.001, t0 + 0.65);
        src.connect(filter).connect(env).connect(out);
        src.start(t0);
        src.stop(t0 + 0.68);
        this.activeStoppables.push(src);
        break;
      }
      case 'impact': {
        const osc = ctx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(160, t0);
        osc.frequency.exponentialRampToValueAtTime(36, t0 + 0.42);
        const env = ctx.createGain();
        env.gain.setValueAtTime(1.0, t0);
        env.gain.exponentialRampToValueAtTime(0.001, t0 + 0.45);
        osc.connect(env).connect(out);
        osc.start(t0);
        osc.stop(t0 + 0.48);

        const noise = ctx.createBufferSource();
        noise.buffer = createNoiseBuffer(ctx, 0.22);
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.setValueAtTime(1800, t0);
        const nEnv = ctx.createGain();
        nEnv.gain.setValueAtTime(0.7, t0);
        nEnv.gain.exponentialRampToValueAtTime(0.001, t0 + 0.2);
        noise.connect(lp).connect(nEnv).connect(out);
        noise.start(t0);
        noise.stop(t0 + 0.22);
        this.activeStoppables.push(osc, noise);
        break;
      }
      case 'boom': {
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(110, t0);
        osc.frequency.exponentialRampToValueAtTime(28, t0 + 1.25);
        const env = ctx.createGain();
        env.gain.setValueAtTime(0.001, t0);
        env.gain.linearRampToValueAtTime(1.0, t0 + 0.03);
        env.gain.exponentialRampToValueAtTime(0.001, t0 + 1.35);
        osc.connect(env).connect(out);
        osc.start(t0);
        osc.stop(t0 + 1.4);
        this.activeStoppables.push(osc);
        break;
      }
      case 'riser': {
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(90, t0);
        osc.frequency.exponentialRampToValueAtTime(860, t0 + 1.65);
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(300, t0);
        filter.frequency.exponentialRampToValueAtTime(3800, t0 + 1.65);
        const env = ctx.createGain();
        env.gain.setValueAtTime(0.01, t0);
        env.gain.exponentialRampToValueAtTime(0.55, t0 + 1.55);
        env.gain.exponentialRampToValueAtTime(0.001, t0 + 1.75);
        osc.connect(filter).connect(env).connect(out);
        osc.start(t0);
        osc.stop(t0 + 1.8);
        this.activeStoppables.push(osc);
        break;
      }
      case 'heartbeat': {
        [0, 0.28].forEach((offset, idx) => {
          const osc = ctx.createOscillator();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(idx === 0 ? 78 : 66, t0 + offset);
          osc.frequency.exponentialRampToValueAtTime(32, t0 + offset + 0.22);
          const env = ctx.createGain();
          env.gain.setValueAtTime(0.001, t0 + offset);
          env.gain.linearRampToValueAtTime(idx === 0 ? 0.95 : 0.72, t0 + offset + 0.03);
          env.gain.exponentialRampToValueAtTime(0.001, t0 + offset + 0.26);
          osc.connect(env).connect(out);
          osc.start(t0 + offset);
          osc.stop(t0 + offset + 0.28);
          this.activeStoppables.push(osc);
        });
        break;
      }
      case 'glitch': {
        for (let i = 0; i < 6; i++) {
          const osc = ctx.createOscillator();
          osc.type = i % 2 === 0 ? 'square' : 'sawtooth';
          osc.frequency.setValueAtTime(220 + Math.random() * 1800, t0 + i * 0.065);
          const env = ctx.createGain();
          env.gain.setValueAtTime(0.35, t0 + i * 0.065);
          env.gain.exponentialRampToValueAtTime(0.001, t0 + i * 0.065 + 0.055);
          osc.connect(env).connect(out);
          osc.start(t0 + i * 0.065);
          osc.stop(t0 + i * 0.065 + 0.06);
          this.activeStoppables.push(osc);
        }
        break;
      }
      case 'pop': {
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(420, t0);
        osc.frequency.exponentialRampToValueAtTime(980, t0 + 0.07);
        osc.frequency.exponentialRampToValueAtTime(260, t0 + 0.16);
        const env = ctx.createGain();
        env.gain.setValueAtTime(0.8, t0);
        env.gain.exponentialRampToValueAtTime(0.001, t0 + 0.18);
        osc.connect(env).connect(out);
        osc.start(t0);
        osc.stop(t0 + 0.2);
        this.activeStoppables.push(osc);
        break;
      }
      case 'boing': {
        const osc = ctx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(190, t0);
        osc.frequency.exponentialRampToValueAtTime(520, t0 + 0.16);
        osc.frequency.exponentialRampToValueAtTime(280, t0 + 0.34);
        osc.frequency.exponentialRampToValueAtTime(420, t0 + 0.46);
        const env = ctx.createGain();
        env.gain.setValueAtTime(0.75, t0);
        env.gain.exponentialRampToValueAtTime(0.001, t0 + 0.48);
        osc.connect(env).connect(out);
        osc.start(t0);
        osc.stop(t0 + 0.5);
        this.activeStoppables.push(osc);
        break;
      }
      case 'wind': {
        const src = ctx.createBufferSource();
        src.buffer = createNoiseBuffer(ctx, 2.0);
        const filter = ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.Q.value = 4.2;
        filter.frequency.setValueAtTime(320, t0);
        filter.frequency.linearRampToValueAtTime(640, t0 + 0.9);
        filter.frequency.linearRampToValueAtTime(260, t0 + 1.9);
        const env = ctx.createGain();
        env.gain.setValueAtTime(0.001, t0);
        env.gain.linearRampToValueAtTime(0.45, t0 + 0.5);
        env.gain.linearRampToValueAtTime(0.001, t0 + 1.95);
        src.connect(filter).connect(env).connect(out);
        src.start(t0);
        src.stop(t0 + 2.0);
        this.activeStoppables.push(src);
        break;
      }
      case 'knock': {
        [0, 0.24].forEach((offset) => {
          const osc = ctx.createOscillator();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(210, t0 + offset);
          osc.frequency.exponentialRampToValueAtTime(75, t0 + offset + 0.1);
          const env = ctx.createGain();
          env.gain.setValueAtTime(0.95, t0 + offset);
          env.gain.exponentialRampToValueAtTime(0.001, t0 + offset + 0.14);
          osc.connect(env).connect(out);
          osc.start(t0 + offset);
          osc.stop(t0 + offset + 0.15);
          this.activeStoppables.push(osc);
        });
        break;
      }
      case 'creak': {
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(280, t0);
        osc.frequency.linearRampToValueAtTime(490, t0 + 0.35);
        osc.frequency.linearRampToValueAtTime(340, t0 + 0.72);
        osc.frequency.linearRampToValueAtTime(560, t0 + 1.1);
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = 950;
        bp.Q.value = 6.5;
        const env = ctx.createGain();
        env.gain.setValueAtTime(0.001, t0);
        env.gain.linearRampToValueAtTime(0.55, t0 + 0.18);
        env.gain.linearRampToValueAtTime(0.32, t0 + 0.75);
        env.gain.exponentialRampToValueAtTime(0.001, t0 + 1.18);
        osc.connect(bp).connect(env).connect(out);
        osc.start(t0);
        osc.stop(t0 + 1.2);
        this.activeStoppables.push(osc);
        break;
      }
      case 'sting': {
        const freqs = [233.08, 246.94, 493.88, 698.46]; // dissonant horror cluster
        freqs.forEach((f) => {
          const osc = ctx.createOscillator();
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(f, t0);
          osc.frequency.linearRampToValueAtTime(f * 1.03, t0 + 1.2);
          const filter = ctx.createBiquadFilter();
          filter.type = 'lowpass';
          filter.frequency.setValueAtTime(2800, t0);
          filter.frequency.exponentialRampToValueAtTime(420, t0 + 1.25);
          const env = ctx.createGain();
          env.gain.setValueAtTime(0.001, t0);
          env.gain.linearRampToValueAtTime(0.28, t0 + 0.04);
          env.gain.exponentialRampToValueAtTime(0.001, t0 + 1.3);
          osc.connect(filter).connect(env).connect(out);
          osc.start(t0);
          osc.stop(t0 + 1.35);
          this.activeStoppables.push(osc);
        });
        break;
      }
      case 'arcade_blip': {
        const osc = ctx.createOscillator();
        osc.type = 'square';
        osc.frequency.setValueAtTime(660, t0);
        osc.frequency.setValueAtTime(990, t0 + 0.06);
        const env = ctx.createGain();
        env.gain.setValueAtTime(0.32, t0);
        env.gain.exponentialRampToValueAtTime(0.001, t0 + 0.2);
        osc.connect(env).connect(out);
        osc.start(t0);
        osc.stop(t0 + 0.22);
        this.activeStoppables.push(osc);
        break;
      }
      case 'arcade_zap': {
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(1400, t0);
        osc.frequency.exponentialRampToValueAtTime(220, t0 + 0.42);
        const env = ctx.createGain();
        env.gain.setValueAtTime(0.36, t0);
        env.gain.exponentialRampToValueAtTime(0.001, t0 + 0.44);
        osc.connect(env).connect(out);
        osc.start(t0);
        osc.stop(t0 + 0.45);
        this.activeStoppables.push(osc);
        break;
      }
      case 'arcade_freeze': {
        [1046.5, 1318.5, 1567.98, 2093.0].forEach((f, idx) => {
          const osc = ctx.createOscillator();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(f, t0 + idx * 0.075);
          const env = ctx.createGain();
          env.gain.setValueAtTime(0.35, t0 + idx * 0.075);
          env.gain.exponentialRampToValueAtTime(0.001, t0 + idx * 0.075 + 0.32);
          osc.connect(env).connect(out);
          osc.start(t0 + idx * 0.075);
          osc.stop(t0 + idx * 0.075 + 0.34);
          this.activeStoppables.push(osc);
        });
        break;
      }
      case 'arcade_coin': {
        const osc = ctx.createOscillator();
        osc.type = 'square';
        osc.frequency.setValueAtTime(987.77, t0);
        osc.frequency.setValueAtTime(1318.51, t0 + 0.08);
        const env = ctx.createGain();
        env.gain.setValueAtTime(0.32, t0);
        env.gain.exponentialRampToValueAtTime(0.001, t0 + 0.35);
        osc.connect(env).connect(out);
        osc.start(t0);
        osc.stop(t0 + 0.36);
        this.activeStoppables.push(osc);
        break;
      }
      case 'arcade_powerup': {
        [523.25, 659.25, 783.99, 1046.5, 1318.51].forEach((f, idx) => {
          const osc = ctx.createOscillator();
          osc.type = 'square';
          osc.frequency.setValueAtTime(f, t0 + idx * 0.08);
          const env = ctx.createGain();
          env.gain.setValueAtTime(0.28, t0 + idx * 0.08);
          env.gain.exponentialRampToValueAtTime(0.001, t0 + idx * 0.08 + 0.16);
          osc.connect(env).connect(out);
          osc.start(t0 + idx * 0.08);
          osc.stop(t0 + idx * 0.08 + 0.18);
          this.activeStoppables.push(osc);
        });
        break;
      }
    }
  }

  public startProceduralMusic(style: AudioConfig['musicStyle'], audio: AudioConfig, durationSec = 30): void {
    if (style === 'none' || audio.musicVolume <= 0.01) return;
    const ctx = this.ensureContext();
    this.updateMixer(audio);

    const t0 = ctx.currentTime;
    const bus = ctx.createGain();
    bus.gain.setValueAtTime(0.001, t0);
    bus.gain.linearRampToValueAtTime(1.0, t0 + Math.min(audio.fadeInSec, durationSec * 0.3));
    if (durationSec > audio.fadeOutSec + 1) {
      bus.gain.setValueAtTime(1.0, t0 + durationSec - audio.fadeOutSec);
      bus.gain.linearRampToValueAtTime(0.001, t0 + durationSec);
    }
    bus.connect(this.musicGain ?? ctx.destination);
    this.activeNodes.push(bus);

    const rootNotesByStyle: Record<Exclude<AudioConfig['musicStyle'], 'none'>, number[]> = {
      horror_drone: [55, 58.27, 51.91, 55],
      noir_pulse: [65.41, 77.78, 73.42, 61.74],
      scifi_synth: [73.42, 87.31, 98.0, 65.41],
      adventure_orchestral: [82.41, 98.0, 110.0, 123.47],
      drama_piano: [110.0, 98.0, 87.31, 82.41],
      retro_chiptune: [130.81, 164.81, 196.0, 174.61, 146.83, 196.0, 220.0, 196.0],
    };

    const notes = rootNotesByStyle[style];
    // Continuous warm sub-pad
    const drone = ctx.createOscillator();
    drone.type = style === 'horror_drone' ? 'sawtooth' : 'triangle';
    drone.frequency.setValueAtTime(style === 'retro_chiptune' ? notes[0] * 0.5 : notes[0], t0);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(style === 'retro_chiptune' ? 920 : style === 'scifi_synth' ? 620 : 280, t0);
    const droneGain = ctx.createGain();
    droneGain.gain.value = style === 'retro_chiptune' ? 0.18 : 0.28;
    drone.connect(lp).connect(droneGain).connect(bus);
    drone.start(t0);
    drone.stop(t0 + durationSec + 0.5);
    this.activeStoppables.push(drone);

    // Repeating rhythmic motif
    let step = 0;
    const stepMs =
      style === 'retro_chiptune'
        ? 190
        : style === 'scifi_synth'
        ? 420
        : style === 'horror_drone'
        ? 1600
        : 850;
    const playPulse = () => {
      if (!this.ctx || this.ctx.state !== 'running') return;
      const now = this.ctx.currentTime;
      const freq =
        style === 'retro_chiptune'
          ? notes[step % notes.length] * (step % 4 === 0 ? 4 : 2)
          : notes[step % notes.length] * (step % 2 === 0 ? 2 : 3);
      step++;
      const osc = this.ctx.createOscillator();
      osc.type =
        style === 'retro_chiptune'
          ? 'square'
          : style === 'drama_piano'
          ? 'sine'
          : style === 'scifi_synth'
          ? 'square'
          : 'triangle';
      osc.frequency.setValueAtTime(freq, now);
      const filt = this.ctx.createBiquadFilter();
      filt.type = 'lowpass';
      filt.frequency.value = style === 'retro_chiptune' ? 2200 : style === 'horror_drone' ? 480 : 1200;
      const env = this.ctx.createGain();
      env.gain.setValueAtTime(0.001, now);
      env.gain.linearRampToValueAtTime(style === 'retro_chiptune' ? 0.14 : 0.18, now + 0.02);
      env.gain.exponentialRampToValueAtTime(0.001, now + Math.min(1.2, stepMs / 1000));
      osc.connect(filt).connect(env).connect(bus);
      osc.start(now);
      osc.stop(now + Math.min(1.25, stepMs / 1000 + 0.05));
      osc.onended = () => {
        try {
          osc.disconnect();
          filt.disconnect();
          env.disconnect();
        } catch {
          // Ignore disconnect errors
        }
        const idx = this.activeStoppables.indexOf(osc);
        if (idx >= 0) this.activeStoppables.splice(idx, 1);
      };
      this.activeStoppables.push(osc);
      if (this.activeStoppables.length > 160) {
        this.activeStoppables.splice(0, this.activeStoppables.length - 160);
      }
    };

    playPulse();
    this.musicTimer = window.setInterval(playPulse, stepMs);
  }

  public scheduleProjectAudio(project: ProjectPlan, startFromSec = 0): void {
    this.stopAll();
    const remaining = Math.max(1, project.totalDuration - startFromSec);
    this.startProceduralMusic(project.audio.musicStyle, project.audio, remaining);

    let cursor = 0;
    for (const scene of project.scenes) {
      for (const ev of scene.sfxEvents) {
        const absTime = cursor + ev.offsetSec;
        if (absTime >= startFromSec) {
          this.playSfx(
            ev.sfx,
            ev.volume * project.audio.sfxVolume,
            project.audio.duckingAmount,
            absTime - startFromSec
          );
        }
      }

      // Optional browser local TTS narration if enabled (timers tracked for clean cancellation)
      if (
        project.audio.narrationMode === 'web_speech' &&
        project.audio.voiceVolume > 0.05 &&
        scene.captionText.trim() &&
        cursor >= startFromSec - 0.1 &&
        typeof window !== 'undefined' &&
        'speechSynthesis' in window
      ) {
        const delayMs = Math.max(0, (cursor - startFromSec) * 1000);
        const timerId = window.setTimeout(() => {
          const utter = new SpeechSynthesisUtterance(scene.captionText);
          utter.lang = 'pt-BR';
          utter.volume = project.audio.voiceVolume;
          utter.rate = 0.98;
          window.speechSynthesis.speak(utter);
        }, delayMs);
        this.speechTimers.push(timerId);
      }

      cursor += scene.duration;
    }
  }
}

export const audioEngine = new ProceduralAudioEngine();

/**
 * Synthesizes the full project soundtrack + all SFX events into a genuine 16-bit Stereo PCM WAV
 * (44.1 kHz) faster than realtime so the local FFmpeg server can mux real AAC audio into the final MP4.
 */
export function renderProjectToWavBase64(project: ProjectPlan): string {
  const sampleRate = 22050; // Lightweight stereo WAV ideal for fast local IPC + AAC 192k muxing
  const duration = Math.max(1, project.totalDuration);
  const totalSamples = Math.floor(sampleRate * duration);
  const musicBuf = new Float32Array(totalSamples);
  const sfxBuf = new Float32Array(totalSamples);

  const audioCfg = project.audio;

  // 1. Procedural music bed
  if (audioCfg.musicStyle !== 'none' && audioCfg.musicVolume > 0.01) {
    const roots: Record<Exclude<AudioConfig['musicStyle'], 'none'>, number[]> = {
      horror_drone: [55, 58.27, 51.91, 55],
      noir_pulse: [65.41, 77.78, 73.42, 61.74],
      scifi_synth: [73.42, 87.31, 98.0, 65.41],
      adventure_orchestral: [82.41, 98.0, 110.0, 123.47],
      drama_piano: [110.0, 98.0, 87.31, 82.41],
      retro_chiptune: [261.63, 329.63, 392.0, 523.25, 392.0, 329.63, 293.66, 392.0],
    };
    const notes = roots[audioCfg.musicStyle];
    const stepSec =
      audioCfg.musicStyle === 'retro_chiptune'
        ? 0.19
        : audioCfg.musicStyle === 'scifi_synth'
        ? 0.45
        : audioCfg.musicStyle === 'horror_drone'
        ? 1.6
        : 0.85;
    for (let i = 0; i < totalSamples; i++) {
      const t = i / sampleRate;
      const noteIdx = Math.floor(t / stepSec) % notes.length;
      const localT = t % stepSec;
      let fade = 1;
      if (audioCfg.fadeInSec > 0 && t < audioCfg.fadeInSec) fade *= t / audioCfg.fadeInSec;
      if (audioCfg.fadeOutSec > 0 && t > duration - audioCfg.fadeOutSec) {
        fade *= Math.max(0, (duration - t) / audioCfg.fadeOutSec);
      }
      if (audioCfg.musicStyle === 'retro_chiptune') {
        // Authentic 8-bit square lead + triangle bass + pulse percussive tick
        const leadEnv = Math.exp(-localT * 7.5);
        const leadFreq = notes[noteIdx];
        const leadSquare = Math.sign(Math.sin(2 * Math.PI * leadFreq * t)) * 0.16 * leadEnv;
        const bassFreq = notes[Math.floor(noteIdx / 2) * 2] * 0.5;
        const bassTri = (2 / Math.PI) * Math.asin(Math.sin(2 * Math.PI * bassFreq * t)) * 0.22;
        const beatTick = localT < 0.02 && noteIdx % 2 === 0 ? 0.08 * Math.sin(i * 41.2) : 0;
        musicBuf[i] = (leadSquare + bassTri + beatTick) * audioCfg.musicVolume * fade;
      } else {
        const pulseEnv = Math.exp(-localT * 3.5);
        const drone = 0.24 * Math.sin(2 * Math.PI * notes[0] * t);
        const motif = 0.16 * Math.sin(2 * Math.PI * notes[noteIdx] * 2 * t) * pulseEnv;
        musicBuf[i] = (drone + motif) * audioCfg.musicVolume * fade;
      }
    }
  }

  // 2. Mix all scene SFX events
  let cursor = 0;
  for (const sc of project.scenes) {
    for (const ev of sc.sfxEvents) {
      const startSample = Math.floor((cursor + ev.offsetSec) * sampleRate);
      const dur = SFX_CATALOG.find((x) => x.type === ev.sfx)?.durationSec ?? 0.7;
      const len = Math.floor(dur * sampleRate);
      const gain = ev.volume * audioCfg.sfxVolume;

      for (let j = 0; j < len; j++) {
        const idx = startSample + j;
        if (idx < 0 || idx >= totalSamples) continue;
        const lt = j / sampleRate;
        const p = j / Math.max(1, len);
        let sample = 0;

        if (ev.sfx === 'boom' || ev.sfx === 'impact') {
          const f = 130 * Math.pow(0.25, p);
          sample = Math.sin(2 * Math.PI * f * lt) * Math.exp(-p * 5.2);
        } else if (ev.sfx === 'riser') {
          const f = 90 + 720 * p * p;
          sample = 0.55 * Math.sin(2 * Math.PI * f * lt) * Math.sin(p * Math.PI);
        } else if (ev.sfx === 'heartbeat') {
          const b1 = Math.sin(2 * Math.PI * 64 * lt) * Math.exp(-lt * 10);
          const b2 = lt > 0.28 ? 0.75 * Math.sin(2 * Math.PI * 56 * (lt - 0.28)) * Math.exp(-(lt - 0.28) * 10) : 0;
          sample = b1 + b2;
        } else if (ev.sfx === 'creak') {
          const f = 310 + 180 * Math.sin(2 * Math.PI * 2.4 * lt);
          sample = 0.45 * Math.sign(Math.sin(2 * Math.PI * f * lt)) * Math.sin(p * Math.PI);
        } else if (ev.sfx === 'sting') {
          sample =
            0.22 *
            (Math.sin(2 * Math.PI * 233.08 * lt) +
              Math.sin(2 * Math.PI * 246.94 * lt) +
              Math.sin(2 * Math.PI * 493.88 * lt)) *
            Math.exp(-p * 3.0);
        } else if (ev.sfx === 'knock') {
          const k1 = Math.sin(2 * Math.PI * 165 * lt) * Math.exp(-lt * 24);
          const k2 = lt > 0.24 ? 0.85 * Math.sin(2 * Math.PI * 145 * (lt - 0.24)) * Math.exp(-(lt - 0.24) * 24) : 0;
          sample = k1 + k2;
        } else if (ev.sfx === 'whoosh' || ev.sfx === 'wind') {
          const noise = Math.sin(idx * 12.9898) * 43758.5453;
          const n = (noise - Math.floor(noise)) * 2 - 1;
          sample = 0.42 * n * Math.sin(p * Math.PI);
        } else if (ev.sfx === 'arcade_coin') {
          const f = lt < 0.08 ? 987.77 : 1318.51;
          sample = 0.36 * Math.sign(Math.sin(2 * Math.PI * f * lt)) * Math.exp(-p * 3.4);
        } else if (ev.sfx === 'arcade_blip') {
          const f = lt < 0.06 ? 660 : 990;
          sample = 0.34 * Math.sign(Math.sin(2 * Math.PI * f * lt)) * Math.exp(-p * 4.5);
        } else if (ev.sfx === 'arcade_zap') {
          const f = 1400 * Math.pow(0.16, p);
          sample = 0.38 * Math.sign(Math.sin(2 * Math.PI * f * lt)) * Math.exp(-p * 3.2);
        } else if (ev.sfx === 'arcade_freeze') {
          const notesF = [1046.5, 1318.5, 1567.98, 2093.0];
          const fi = notesF[Math.min(3, Math.floor(p * 4))];
          sample = 0.38 * Math.sin(2 * Math.PI * fi * lt) * Math.exp(-p * 2.4);
        } else if (ev.sfx === 'arcade_powerup') {
          const notesP = [523.25, 659.25, 783.99, 1046.5, 1318.51];
          const fi = notesP[Math.min(4, Math.floor(p * 5))];
          sample = 0.34 * Math.sign(Math.sin(2 * Math.PI * fi * lt)) * Math.exp(-p * 2.2);
        } else {
          const f = 260 + 400 * (1 - p);
          sample = 0.55 * Math.sin(2 * Math.PI * f * lt) * Math.exp(-p * 5);
        }

        sfxBuf[idx] += sample * gain;
      }
    }
    cursor += sc.duration;
  }

  // 3. Apply ducking + stereo normalization (avoid amplifying near-silent projects)
  const mix = new Float32Array(totalSamples);
  let peak = 0;
  for (let i = 0; i < totalSamples; i++) {
    const duck = 1 - Math.min(0.65, Math.abs(sfxBuf[i]) * audioCfg.duckingAmount);
    const v = musicBuf[i] * duck + sfxBuf[i];
    mix[i] = v;
    const av = Math.abs(v);
    if (av > peak) peak = av;
  }
  const normScale = peak <= 0.005 ? 1 : audioCfg.normalize ? 0.88 / peak : Math.min(1, 0.95 / peak);

  // 4. Encode 16-bit Stereo PCM WAV header + payload
  const numChannels = 2;
  const bytesPerSample = 2;
  const dataSize = totalSamples * numChannels * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  const writeStr = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };

  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * bytesPerSample, true);
  view.setUint16(32, numChannels * bytesPerSample, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, dataSize, true);

  let pos = 44;
  for (let i = 0; i < totalSamples; i++) {
    const clamped = Math.max(-1, Math.min(1, mix[i] * normScale));
    const pcm = clamped < 0 ? Math.round(clamped * 32768) : Math.round(clamped * 32767);
    view.setInt16(pos, pcm, true);
    view.setInt16(pos + 2, pcm, true);
    pos += 4;
  }

  // Convert ArrayBuffer to Base64 in chunks to avoid call-stack limits
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

