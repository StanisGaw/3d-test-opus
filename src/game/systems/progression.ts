import type { ZombieKind } from './waveDirector.ts';

/** XP needed to go from `level` to `level + 1`. Grows quadratically so later levels take longer. */
export const xpToNext = (level: number): number => Math.round(90 + 65 * (level - 1) + 14 * (level - 1) ** 2);

const BASE_XP: Record<ZombieKind | 'boss', number> = {
  walker: 8,
  runner: 10,
  brute: 30,
  exploder: 12,
  spitter: 14,
  shield: 22,
  bat: 5,
  boss: 150,
};

/** XP dropped by an enemy; tougher rounds give more. */
export function xpForEnemy(kind: ZombieKind | 'boss', round: number): number {
  return Math.round(BASE_XP[kind] * (kind === 'boss' ? round : 1 + 0.15 * (round - 1)));
}

export const waveClearXp = (round: number, wave: number): number => 20 * wave * round;
export const roundClearXp = (round: number): number => 100 * round;

const BASE_COINS: Record<ZombieKind | 'boss', number> = {
  walker: 1,
  runner: 1,
  bat: 1,
  exploder: 2,
  spitter: 2,
  shield: 3,
  brute: 4,
  boss: 30,
};

/** Coins for a kill; spent in the base shop between runs. Bosses pay more every round. */
export const coinsForEnemy = (kind: ZombieKind | 'boss', round: number): number => BASE_COINS[kind] * (kind === 'boss' ? round : 1);
export const waveClearCoins = (wave: number): number => 5 * wave;
export const roundClearCoins = (round: number): number => 25 * round;

/** Experience and level for one run. Every level-up grants one skill point. */
export class Progression {
  level = 1;
  xp = 0;
  totalXp = 0;

  get needed(): number {
    return xpToNext(this.level);
  }

  get progress(): number {
    return this.xp / this.needed;
  }

  /** Adds XP and returns how many levels were gained. */
  add(amount: number): number {
    this.xp += amount;
    this.totalXp += amount;
    let gained = 0;
    while (this.xp >= this.needed) {
      this.xp -= this.needed;
      this.level++;
      gained++;
    }
    return gained;
  }

  reset(): void {
    this.level = 1;
    this.xp = 0;
    this.totalXp = 0;
  }

  restore(level: number, xp: number, totalXp: number): void {
    this.level = Math.max(1, Math.floor(level));
    this.xp = Math.max(0, Math.min(xp, this.needed - 1));
    this.totalXp = Math.max(0, totalXp);
  }
}

export type BuffId = 'frenzy' | 'overdrive' | 'secondWind';

export const BUFF_LABELS: Record<BuffId, string> = { frenzy: 'Frenzy', overdrive: 'Overdrive', secondWind: 'Second wind' };

/** Timed effects on the hero. Adding an active buff refreshes its timer. */
export class Buffs {
  private readonly active = new Map<BuffId, { time: number; duration: number }>();

  add(id: BuffId, duration: number): void {
    const current = this.active.get(id);
    this.active.set(id, { time: Math.max(duration, current?.time ?? 0), duration });
  }

  has(id: BuffId): boolean {
    return (this.active.get(id)?.time ?? 0) > 0;
  }

  update(dt: number): void {
    for (const [id, b] of this.active) {
      b.time -= dt;
      if (b.time <= 0) this.active.delete(id);
    }
  }

  list(): { id: BuffId; remaining: number; duration: number }[] {
    return [...this.active].map(([id, b]) => ({ id, remaining: b.time, duration: b.duration }));
  }

  clear(): void {
    this.active.clear();
  }
}
