import { Music, type TrackId } from './music.ts';

export type SoundName =
  | 'pistol'
  | 'heavy'
  | 'shotgun'
  | 'rocket'
  | 'flame'
  | 'laser'
  | 'explosion'
  | 'hit'
  | 'zombieDie'
  | 'hurt'
  | 'pickup'
  | 'chute'
  | 'roar'
  | 'banner'
  | 'dash'
  | 'levelup'
  | 'throw'
  | 'mineArm'
  | 'deploy'
  | 'turretShot'
  | 'droneShot'
  | 'buff'
  | 'gem'
  | 'reload'
  | 'crit'
  | 'skill'
  | 'error'
  | 'clang'
  | 'shieldBreak'
  | 'fuse'
  | 'spit'
  | 'screech'
  | 'achievement'
  | 'coin'
  | 'buy'
  | 'elite'
  | 'barrel'
  | 'spikes'
  | 'combo';

const SFX_VOLUME = 0.28;
const MUSIC_VOLUME = 0.55;

/** Tiny WebAudio synthesiser: no audio files, just oscillators and noise. */
export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private music: Music | null = null;
  private noise: AudioBuffer | null = null;
  private readonly lastPlayed = new Map<SoundName, number>();
  muted = false;
  /** Music on/off, independent from the global mute. */
  musicEnabled = true;

  unlock(): void {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    const ctx = new AudioContext();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : SFX_VOLUME;
    this.master.connect(ctx.destination);
    const buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    this.noise = buffer;
    this.musicBus = ctx.createGain();
    this.musicBus.connect(ctx.destination);
    this.applyMusicVolume();
    this.music = new Music(ctx, this.musicBus, buffer);
  }

  private applyMusicVolume(): void {
    if (this.musicBus) this.musicBus.gain.value = this.muted || !this.musicEnabled ? 0 : MUSIC_VOLUME;
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : SFX_VOLUME;
    this.applyMusicVolume();
    return this.muted;
  }

  setMusicEnabled(on: boolean): void {
    this.musicEnabled = on;
    this.applyMusicVolume();
  }

  /** Picks the song for the current moment; call every frame (it also schedules the notes). */
  updateMusic(track: TrackId, speed: number, volume: number): void {
    if (!this.music) return;
    this.music.set(track, speed, volume);
    this.music.update();
  }

  get musicTrack(): TrackId | null {
    return this.music?.playing ?? null;
  }

  private tone(type: OscillatorType, from: number, to: number, duration: number, volume: number, delay = 0): void {
    const { ctx, master } = this;
    if (!ctx || !master) return;
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(from, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), t + duration);
    gain.gain.setValueAtTime(volume, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
    osc.connect(gain).connect(master);
    osc.start(t);
    osc.stop(t + duration + 0.02);
  }

  private burst(duration: number, volume: number, cutoff: number, endCutoff = cutoff): void {
    const { ctx, master, noise } = this;
    if (!ctx || !master || !noise) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = noise;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(cutoff, t);
    filter.frequency.exponentialRampToValueAtTime(Math.max(40, endCutoff), t + duration);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
    src.connect(filter).connect(gain).connect(master);
    src.start(t, Math.random() * 0.5);
    src.stop(t + duration + 0.02);
  }

  play(name: SoundName): void {
    if (!this.ctx || this.muted) return;
    // Rate-limit rapid repeats so automatic weapons don't clip.
    const now = this.ctx.currentTime;
    const minGap = name === 'flame' || name === 'laser' ? 0.08 : name === 'hit' || name === 'gem' || name === 'clang' ? 0.04 : name === 'turretShot' ? 0.06 : name === 'screech' ? 0.3 : 0.02;
    if (now - (this.lastPlayed.get(name) ?? -1) < minGap) return;
    this.lastPlayed.set(name, now);

    switch (name) {
      case 'pistol':
        this.tone('square', 900, 180, 0.09, 0.25);
        break;
      case 'heavy':
        this.tone('square', 600, 120, 0.06, 0.2);
        this.burst(0.05, 0.25, 3000);
        break;
      case 'shotgun':
        this.burst(0.28, 0.7, 2500, 200);
        this.tone('sawtooth', 200, 50, 0.2, 0.3);
        break;
      case 'rocket':
        this.burst(0.35, 0.35, 1200, 300);
        this.tone('sawtooth', 300, 80, 0.3, 0.15);
        break;
      case 'flame':
        this.burst(0.12, 0.25, 900, 400);
        break;
      case 'laser':
        this.tone('sine', 1800, 1400, 0.08, 0.12);
        break;
      case 'explosion':
        this.burst(0.7, 0.9, 1600, 60);
        this.tone('sine', 120, 30, 0.5, 0.5);
        break;
      case 'hit':
        this.tone('square', 220, 90, 0.04, 0.12);
        break;
      case 'zombieDie':
        this.tone('sawtooth', 160, 50, 0.3, 0.2);
        this.burst(0.15, 0.2, 700);
        break;
      case 'hurt':
        this.tone('square', 300, 60, 0.25, 0.35);
        break;
      case 'pickup':
        [523, 659, 784, 1046].forEach((f, i) => this.tone('square', f, f, 0.08, 0.2, i * 0.06));
        break;
      case 'chute':
        this.tone('triangle', 400, 900, 0.3, 0.15);
        break;
      case 'roar':
        this.tone('sawtooth', 90, 40, 1.2, 0.5);
        this.burst(1, 0.4, 500, 100);
        break;
      case 'banner':
        [392, 523, 659].forEach((f, i) => this.tone('square', f, f, 0.12, 0.15, i * 0.1));
        break;
      case 'dash':
        this.burst(0.15, 0.25, 4000, 800);
        break;
      case 'levelup':
        [523, 659, 784, 1046, 1318].forEach((f, i) => this.tone('square', f, f, 0.1, 0.2, i * 0.07));
        this.tone('triangle', 1046, 2093, 0.4, 0.12, 0.35);
        break;
      case 'throw':
        this.tone('triangle', 500, 200, 0.18, 0.15);
        break;
      case 'mineArm':
        this.tone('square', 1400, 1400, 0.05, 0.1);
        this.tone('square', 1800, 1800, 0.05, 0.1, 0.08);
        break;
      case 'deploy':
        this.tone('square', 200, 600, 0.15, 0.2);
        [700, 900].forEach((f, i) => this.tone('square', f, f, 0.06, 0.15, 0.18 + i * 0.07));
        break;
      case 'turretShot':
        this.tone('square', 750, 200, 0.05, 0.1);
        break;
      case 'droneShot':
        this.tone('sine', 1300, 700, 0.05, 0.08);
        break;
      case 'buff':
        this.tone('sawtooth', 200, 800, 0.35, 0.2);
        this.tone('square', 400, 1600, 0.35, 0.1);
        break;
      case 'gem':
        this.tone('sine', 1500 + Math.random() * 500, 2400, 0.05, 0.08);
        break;
      case 'reload':
        this.tone('square', 300, 280, 0.04, 0.12);
        this.tone('square', 500, 480, 0.04, 0.12, 0.12);
        break;
      case 'crit':
        this.tone('square', 1200, 600, 0.07, 0.14);
        break;
      case 'skill':
        [659, 988].forEach((f, i) => this.tone('square', f, f, 0.08, 0.18, i * 0.06));
        break;
      case 'error':
        this.tone('square', 160, 120, 0.15, 0.15);
        break;
      case 'clang':
        this.tone('triangle', 1900, 1500, 0.08, 0.12);
        this.tone('square', 2600, 2200, 0.04, 0.05);
        break;
      case 'shieldBreak':
        this.burst(0.3, 0.45, 5000, 900);
        this.tone('square', 900, 200, 0.25, 0.18);
        break;
      case 'fuse':
        this.burst(0.5, 0.2, 6000, 3000);
        this.tone('square', 1200, 1800, 0.5, 0.06);
        break;
      case 'spit':
        this.burst(0.18, 0.3, 900, 250);
        this.tone('sine', 380, 140, 0.15, 0.18);
        break;
      case 'screech':
        this.tone('sawtooth', 2400, 1600, 0.12, 0.07);
        break;
      case 'achievement':
        [784, 988, 1175, 1568].forEach((f, i) => this.tone('square', f, f, 0.12, 0.16, i * 0.09));
        this.tone('triangle', 1568, 3136, 0.5, 0.1, 0.36);
        break;
      case 'coin':
        this.tone('square', 988, 988, 0.05, 0.12);
        this.tone('square', 1319, 1319, 0.12, 0.12, 0.05);
        break;
      case 'buy':
        [523, 784, 1046].forEach((f, i) => this.tone('square', f, f, 0.07, 0.16, i * 0.05));
        break;
      case 'elite':
        this.tone('sawtooth', 110, 220, 0.4, 0.18);
        this.tone('square', 440, 330, 0.3, 0.08, 0.1);
        break;
      case 'barrel':
        this.tone('square', 180, 140, 0.05, 0.1);
        break;
      case 'spikes':
        this.burst(0.08, 0.2, 6000, 2000);
        this.tone('square', 900, 700, 0.05, 0.06);
        break;
      case 'combo':
        this.tone('square', 1046, 1568, 0.12, 0.12);
        break;
    }
  }
}
