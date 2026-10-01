export type ZombieKind = 'walker' | 'runner' | 'brute' | 'exploder' | 'spitter' | 'shield' | 'bat';

export const ZOMBIE_KINDS: readonly ZombieKind[] = ['walker', 'runner', 'brute', 'exploder', 'spitter', 'shield', 'bat'];

export type Phase = 'intro' | 'wave' | 'intermission' | 'bossWarning' | 'boss' | 'roundClear';

export type DirectorEvent =
  | { type: 'banner'; title: string; subtitle: string }
  | { type: 'spawn'; kind: ZombieKind }
  | { type: 'spawnBoss' }
  | { type: 'waveCleared'; wave: number }
  | { type: 'roundCleared'; round: number }
  | { type: 'newRound'; round: number }
  | { type: 'supplyDrop' };

export const WAVES_PER_ROUND = 3;
const INTRO_TIME = 3;
const INTERMISSION_TIME = 4;
const BOSS_WARNING_TIME = 3.5;
const ROUND_CLEAR_TIME = 5;

export const waveSize = (round: number, wave: number): number => 8 + wave * 4 + (round - 1) * 6;
export const spawnInterval = (round: number, wave: number): number =>
  Math.max(0.22, 1.15 - round * 0.1 - wave * 0.12);
export const maxAlive = (round: number): number => 24 + round * 8;

/** Special kinds never take more than this share of a wave, so walkers always form the horde. */
const MAX_SPECIAL_SHARE = 0.8;

/** Position of a wave in the whole run: 1 = round 1 wave 1, 4 = round 2 wave 1, and so on. */
export const waveStage = (round: number, wave: number): number => (round - 1) * WAVES_PER_ROUND + wave;

/** Stage at which each special kind first appears, so new enemies join the horde one by one. */
export const UNLOCK_STAGE: Record<Exclude<ZombieKind, 'walker'>, number> = {
  runner: 2,
  bat: 3,
  exploder: 4,
  brute: 5,
  spitter: 7,
  shield: 9,
};

/** A new kind starts rare and reaches its full spawn chance after this many stages. */
const RAMP_STAGES = 3;

/** Spawn chance of every non-walker kind. New kinds unlock one by one as the run goes on. */
export function zombieChances(round: number, wave: number): [ZombieKind, number][] {
  const stage = waveStage(round, wave);
  const full: [Exclude<ZombieKind, 'walker'>, number][] = [
    ['brute', 0.06 + 0.02 * round],
    ['runner', 0.15 + 0.03 * round],
    ['bat', 0.07 + 0.015 * round],
    ['exploder', 0.05 + 0.015 * round],
    ['spitter', 0.05 + 0.015 * round],
    ['shield', 0.04 + 0.015 * round],
  ];
  const chances = full.map(([kind, chance]): [ZombieKind, number] => {
    const sinceUnlock = stage - UNLOCK_STAGE[kind] + 1;
    return [kind, sinceUnlock <= 0 ? 0 : chance * Math.min(1, sinceUnlock / RAMP_STAGES)];
  });
  const total = chances.reduce((sum, [, c]) => sum + c, 0);
  const scale = total > MAX_SPECIAL_SHARE ? MAX_SPECIAL_SHARE / total : 1;
  return chances.map(([kind, c]) => [kind, c * scale]);
}

/** Decides zombie type from a 0..1 roll; anything past the special chances is a walker. */
export function zombieKindFor(round: number, wave: number, roll: number): ZombieKind {
  let acc = 0;
  for (const [kind, chance] of zombieChances(round, wave)) {
    acc += chance;
    if (roll < acc) return kind;
  }
  return 'walker';
}

/** Pure state machine that drives rounds, waves, the boss fight and supply drops. */
export class WaveDirector {
  round = 1;
  wave = 0;
  phase: Phase = 'intro';
  /** Higher values make supply crates drop more often (Scavenger card). */
  dropRateMult = 1;
  private timer = INTRO_TIME;
  private toSpawn = 0;
  private spawnTimer = 0;
  private dropTimer = 0;
  private bossDefeated = false;
  private readonly rng: () => number;
  private pending: DirectorEvent[] = [];

  constructor(rng: () => number) {
    this.rng = rng;
    this.pending.push({ type: 'banner', title: 'ROUND 1', subtitle: 'Survive the horde' });
    this.resetDropTimer();
  }

  get remainingToSpawn(): number {
    return this.toSpawn;
  }

  notifyBossDefeated(): void {
    this.bossDefeated = true;
  }

  /**
   * Continues a saved run: `nextWave` 1 starts the round intro, 2..3 the break before that wave,
   * and anything above the last wave goes straight to the boss warning.
   */
  resumeAt(round: number, nextWave: number): void {
    this.round = Math.max(1, Math.floor(round));
    this.pending = [];
    this.toSpawn = 0;
    this.bossDefeated = false;
    if (nextWave > WAVES_PER_ROUND) {
      this.wave = WAVES_PER_ROUND;
      this.phase = 'bossWarning';
      this.timer = BOSS_WARNING_TIME;
      this.pending.push({ type: 'banner', title: 'WARNING!', subtitle: 'A huge enemy is approaching' });
    } else if (nextWave <= 1) {
      this.wave = 0;
      this.phase = 'intro';
      this.timer = INTRO_TIME;
      this.pending.push({ type: 'banner', title: `ROUND ${this.round}`, subtitle: 'Run continued' });
    } else {
      this.wave = nextWave - 1;
      this.phase = 'intermission';
      this.timer = INTERMISSION_TIME;
      this.pending.push({ type: 'banner', title: 'RUN CONTINUED', subtitle: `Wave ${nextWave} is coming` });
    }
    this.resetDropTimer();
  }

  private resetDropTimer(): void {
    this.dropTimer = (24 + this.rng() * 18) / this.dropRateMult;
  }

  private startWave(wave: number): void {
    this.wave = wave;
    this.phase = 'wave';
    this.toSpawn = waveSize(this.round, wave);
    this.spawnTimer = 0.5;
    this.pending.push({ type: 'banner', title: `WAVE ${wave}/${WAVES_PER_ROUND}`, subtitle: `${this.toSpawn} zombies` });
    if (wave > 1) this.pending.push({ type: 'supplyDrop' });
  }

  update(dt: number, aliveEnemies: number): DirectorEvent[] {
    const events = this.pending;
    this.pending = [];
    this.timer -= dt;

    if (this.phase === 'wave' || this.phase === 'boss') {
      this.dropTimer -= dt;
      if (this.dropTimer <= 0) {
        events.push({ type: 'supplyDrop' });
        this.resetDropTimer();
      }
    }

    switch (this.phase) {
      case 'intro':
        if (this.timer <= 0) this.startWave(1);
        break;
      case 'wave': {
        this.spawnTimer -= dt;
        let alive = aliveEnemies;
        while (this.toSpawn > 0 && this.spawnTimer <= 0 && alive < maxAlive(this.round)) {
          events.push({ type: 'spawn', kind: zombieKindFor(this.round, this.wave, this.rng()) });
          this.toSpawn--;
          alive++;
          this.spawnTimer += spawnInterval(this.round, this.wave);
        }
        if (this.spawnTimer < 0) this.spawnTimer = 0;
        if (this.toSpawn === 0 && aliveEnemies === 0) {
          events.push({ type: 'waveCleared', wave: this.wave });
          if (this.wave < WAVES_PER_ROUND) {
            this.phase = 'intermission';
            this.timer = INTERMISSION_TIME;
            events.push({ type: 'banner', title: 'WAVE CLEAR', subtitle: 'Get ready...' });
          } else {
            this.phase = 'bossWarning';
            this.timer = BOSS_WARNING_TIME;
            events.push({ type: 'banner', title: 'WARNING!', subtitle: 'A huge enemy is approaching' });
            events.push({ type: 'supplyDrop' });
          }
        }
        break;
      }
      case 'intermission':
        if (this.timer <= 0) this.startWave(this.wave + 1);
        break;
      case 'bossWarning':
        if (this.timer <= 0) {
          this.phase = 'boss';
          this.bossDefeated = false;
          events.push({ type: 'spawnBoss' });
        }
        break;
      case 'boss':
        if (this.bossDefeated) {
          this.phase = 'roundClear';
          this.timer = ROUND_CLEAR_TIME;
          events.push({ type: 'roundCleared', round: this.round });
          events.push({ type: 'banner', title: 'MISSION COMPLETE', subtitle: `Round ${this.round} cleared!` });
        }
        break;
      case 'roundClear':
        if (this.timer <= 0) {
          this.round++;
          this.wave = 0;
          this.phase = 'intro';
          this.timer = INTRO_TIME;
          events.push({ type: 'newRound', round: this.round });
          events.push({ type: 'banner', title: `ROUND ${this.round}`, subtitle: 'New territory. More undead.' });
        }
        break;
    }
    return events;
  }
}
