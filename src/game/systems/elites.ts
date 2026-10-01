import type { ZombieKind } from './waveDirector.ts';

/** The one special trait every elite zombie gets. */
export type EliteAffix = 'swift' | 'armored' | 'splitter' | 'regen';

export interface EliteDef {
  readonly id: EliteAffix;
  readonly name: string;
  /** Sprite tint and aura colour. */
  readonly tint: number;
  readonly aura: number;
  readonly text: string;
}

export const ELITES: Readonly<Record<EliteAffix, EliteDef>> = {
  swift: { id: 'swift', name: 'Swift', tint: 0xfff080, aura: 0xffe040, text: 'moves 40% faster' },
  armored: { id: 'armored', name: 'Armored', tint: 0xa8c8ff, aura: 0x60a0ff, text: 'takes 40% less damage' },
  splitter: { id: 'splitter', name: 'Splitter', tint: 0xb0ff90, aura: 0x60ff40, text: 'splits into 2 runners on death' },
  regen: { id: 'regen', name: 'Regenerating', tint: 0xffa8e0, aura: 0xff50c0, text: 'heals 4% HP per second unless burning' },
};

export const ELITE_AFFIXES: readonly EliteAffix[] = ['swift', 'armored', 'splitter', 'regen'];

/** Kinds that can be elite. Bats and exploders stay simple so they remain readable. */
export const ELITE_KINDS: ReadonlySet<ZombieKind> = new Set<ZombieKind>(['walker', 'runner', 'brute', 'spitter', 'shield']);

/** Multipliers every elite gets on top of its affix. */
export const ELITE = {
  hp: 2.5,
  speed: 1.1,
  scale: 1.2,
  score: 3,
  xp: 4,
  coins: 5,
  /** Chance that an elite drops a supply crate when it dies. */
  crateChance: 0.3,
  swiftSpeed: 1.4,
  armoredDamage: 0.6,
  regenPerSecond: 0.04,
  splitCount: 2,
} as const;

/** Share of eligible zombies that spawn as elites: none early in round 1, then more every round (max 15%). */
export function eliteChance(round: number, wave: number): number {
  if (round <= 1) return wave >= 3 ? 0.03 : 0;
  return Math.min(0.15, 0.03 + 0.02 * round);
}

/** Decides if a new zombie is elite. `roll` and `pick` are 0..1 random numbers. */
export function rollElite(kind: ZombieKind, round: number, wave: number, roll: number, pick: number): EliteAffix | null {
  if (!ELITE_KINDS.has(kind) || roll >= eliteChance(round, wave)) return null;
  return ELITE_AFFIXES[Math.min(ELITE_AFFIXES.length - 1, Math.floor(pick * ELITE_AFFIXES.length))];
}

interface StatsLike {
  hp: number;
  speed: number;
  scale: number;
  score: number;
}

/** Elite version of a zombie's base stats. */
export function eliteStats<T extends StatsLike>(stats: T, affix: EliteAffix): T {
  return {
    ...stats,
    hp: Math.round(stats.hp * ELITE.hp),
    speed: stats.speed * ELITE.speed * (affix === 'swift' ? ELITE.swiftSpeed : 1),
    scale: stats.scale * ELITE.scale,
    score: stats.score * ELITE.score,
  };
}
