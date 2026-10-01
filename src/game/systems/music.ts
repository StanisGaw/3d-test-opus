export type TrackId = 'calm' | 'battle' | 'boss';

/**
 * One looping song. Every token is a 16th note: a note name (`A4`, `C#5`, `Eb3`), `.` for silence
 * or `-` to hold the previous note. Drums use `k` kick, `s` snare, `h` hi-hat (combine like `kh`).
 */
export interface Track {
  readonly bpm: number;
  readonly lead: string;
  readonly bass: string;
  readonly drums: string;
}

export const TRACKS: Readonly<Record<TrackId, Track>> = {
  calm: {
    bpm: 96,
    lead: `A4 - - - C5 - E5 - D5 - - - C5 - B4 -
           A4 - - - E4 - A4 - B4 - C5 - B4 - - -`,
    bass: `A2 - - - . . A2 - F2 - - - . . F2 -
           C3 - - - . . C3 - G2 - - - . . G2 -`,
    drums: `k . . . h . . . s . . . h . . .
            k . . . h . k . s . . . h . h .`,
  },
  battle: {
    bpm: 140,
    lead: `A4 . A4 C5 . A4 D5 . C5 . A4 . G4 . E4 .
           A4 . A4 C5 . E5 D5 C5 D5 - C5 - B4 - G4 -`,
    bass: `A2 A2 A3 A2 A2 A2 A3 A2 F2 F2 F3 F2 F2 F2 F3 F2
           G2 G2 G3 G2 G2 G2 G3 G2 E2 E2 E3 E2 E2 E2 E3 E2`,
    drums: `k . h . s . h . k k h . s . h h
            k . h . s . h . k . h k s s h s`,
  },
  boss: {
    bpm: 156,
    lead: `E5 . E5 . F5 . E5 . D#5 . E5 . B4 . C5 .
           E5 . E5 . G5 . F5 . E5 . D#5 . D5 - C5 -`,
    bass: `E2 . E2 E3 E2 . E2 F2 E2 . E2 E3 E2 . D#2 D2
           C2 . C2 C3 C2 . C2 D2 B1 . B1 B2 B1 . C2 D2`,
    drums: `kh h kh h s h kh h kh h kh h s h s s
            kh h kh h s h kh h kh kh kh h s s s s`,
  },
};

export const HOLD = 'hold';
export type Step = number | null | typeof HOLD;

const SEMITONES: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** MIDI number of a note name like `A4` (= 69), `C#5` or `Eb3`. Throws on anything else. */
export function noteToMidi(name: string): number {
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(name);
  if (!m) throw new Error(`Bad note "${name}"`);
  const accidental = m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0;
  return 12 * (Number(m[3]) + 1) + SEMITONES[m[1]] + accidental;
}

export const midiToHz = (midi: number): number => 440 * 2 ** ((midi - 69) / 12);

const tokens = (src: string): string[] => src.split(/\s+/).filter(Boolean);

export function parseMelody(src: string): Step[] {
  return tokens(src).map((t) => (t === '.' ? null : t === '-' ? HOLD : noteToMidi(t)));
}

export function parseDrums(src: string): string[] {
  return tokens(src).map((t) => {
    if (!/^(\.|[ksh]+)$/.test(t)) throw new Error(`Bad drum hit "${t}"`);
    return t === '.' ? '' : t;
  });
}

/** How many steps a note starting at `index` lasts (itself plus following holds). */
export function noteLength(steps: readonly Step[], index: number): number {
  let n = 1;
  while (index + n < steps.length && steps[index + n] === HOLD) n++;
  return n;
}

interface ParsedTrack {
  readonly bpm: number;
  readonly lead: Step[];
  readonly bass: Step[];
  readonly drums: string[];
  readonly length: number;
}

function parseTrack(t: Track): ParsedTrack {
  const lead = parseMelody(t.lead);
  const bass = parseMelody(t.bass);
  const drums = parseDrums(t.drums);
  return { bpm: t.bpm, lead, bass, drums, length: Math.max(lead.length, bass.length, drums.length) };
}

const LOOKAHEAD = 0.15;
const STEPS_PER_BAR = 16;

/** Step-sequencer chiptune player. Track changes wait for the next bar so the music never stumbles. */
export class Music {
  private readonly ctx: AudioContext;
  private readonly out: GainNode;
  private readonly noise: AudioBuffer;
  private readonly tracks: Record<TrackId, ParsedTrack>;
  private current: TrackId | null = null;
  private queued: TrackId | null = null;
  private step = 0;
  private nextTime = 0;
  private speed = 1;
  /** Starts below any real volume so the first `set` fades the music in. */
  private volume = -1;

  constructor(ctx: AudioContext, destination: AudioNode, noise: AudioBuffer) {
    this.ctx = ctx;
    this.noise = noise;
    this.out = ctx.createGain();
    this.out.gain.value = 0;
    this.out.connect(destination);
    this.tracks = { calm: parseTrack(TRACKS.calm), battle: parseTrack(TRACKS.battle), boss: parseTrack(TRACKS.boss) };
  }

  get playing(): TrackId | null {
    return this.current;
  }

  /** Chooses the song, a tempo multiplier and a volume (0..1, used to duck the music in menus). */
  set(track: TrackId, speed = 1, volume = 1): void {
    if (this.current === null) {
      this.current = track;
      this.step = 0;
      this.nextTime = this.ctx.currentTime + 0.05;
    } else if (track !== this.current) {
      this.queued = track;
    }
    this.speed = speed;
    if (volume !== this.volume) {
      this.volume = volume;
      this.out.gain.setTargetAtTime(volume, this.ctx.currentTime, 0.2);
    }
  }

  /** Schedules the notes of the next ~150 ms. Call every frame. */
  update(): void {
    if (this.current === null) return;
    const now = this.ctx.currentTime;
    // After a hidden tab the clock ran ahead; restart instead of playing a burst of old notes.
    if (this.nextTime < now - 0.25) this.nextTime = now + 0.05;
    while (this.nextTime < now + LOOKAHEAD) {
      if (this.queued && this.step % STEPS_PER_BAR === 0) {
        this.current = this.queued;
        this.queued = null;
        this.step = 0;
      }
      const track = this.tracks[this.current];
      const stepTime = 60 / track.bpm / 4 / this.speed;
      const i = this.step % track.length;
      this.playStep(track, i, this.nextTime, stepTime);
      this.nextTime += stepTime;
      this.step++;
    }
  }

  private playStep(track: ParsedTrack, i: number, t: number, stepTime: number): void {
    const lead = track.lead[i];
    if (typeof lead === 'number') this.note('square', midiToHz(lead), t, stepTime * noteLength(track.lead, i) * 0.92, 0.045);
    const bass = track.bass[i];
    if (typeof bass === 'number') this.note('triangle', midiToHz(bass), t, stepTime * noteLength(track.bass, i) * 0.9, 0.14);
    const hit = track.drums[i] ?? '';
    if (hit.includes('k')) this.kick(t);
    if (hit.includes('s')) this.hiss(t, 0.11, 0.12, 'bandpass', 1800);
    if (hit.includes('h')) this.hiss(t, 0.035, 0.045, 'highpass', 7000);
  }

  private note(type: OscillatorType, hz: number, t: number, duration: number, volume: number): void {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(hz, t);
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(volume, t + 0.005);
    gain.gain.setValueAtTime(volume * 0.7, t + Math.max(0.01, duration * 0.5));
    gain.gain.linearRampToValueAtTime(0, t + duration);
    osc.connect(gain).connect(this.out);
    osc.start(t);
    osc.stop(t + duration + 0.02);
  }

  private kick(t: number): void {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(140, t);
    osc.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    gain.gain.setValueAtTime(0.28, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
    osc.connect(gain).connect(this.out);
    osc.start(t);
    osc.stop(t + 0.16);
  }

  private hiss(t: number, duration: number, volume: number, type: BiquadFilterType, freq: number): void {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = this.ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(volume, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
    src.connect(filter).connect(gain).connect(this.out);
    src.start(t, Math.random() * 0.5);
    src.stop(t + duration + 0.02);
  }
}
