/** Totals and best results over every run ever played. */
export interface LifetimeStats {
  kills: number;
  bosses: number;
  elites: number;
  bats: number;
  shieldsBroken: number;
  /** Waves cleared without taking any damage. */
  flawlessWaves: number;
  coinsEarned: number;
  upgradesBought: number;
  runs: number;
  bestRound: number;
  bestLevel: number;
  bestScore: number;
  /** Most reward cards held in one run. */
  bestCards: number;
  /** Most kills within one second. */
  bestBurst: number;
  bestCombo: number;
  heroesUnlocked: number;
}

export interface AchievementDef {
  readonly id: string;
  readonly name: string;
  readonly text: string;
  /** Coins paid out once when unlocked. */
  readonly reward: number;
  readonly target: number;
  readonly stat: keyof LifetimeStats;
}

export const ACHIEVEMENTS: readonly AchievementDef[] = [
  { id: 'firstBlood', name: 'First Blood', text: 'Kill your first zombie', reward: 10, target: 1, stat: 'kills' },
  { id: 'slayer', name: 'Zombie Slayer', text: 'Kill 500 zombies in total', reward: 50, target: 500, stat: 'kills' },
  { id: 'exterminator', name: 'Exterminator', text: 'Kill 3000 zombies in total', reward: 150, target: 3000, stat: 'kills' },
  { id: 'bossHunter', name: 'Boss Hunter', text: 'Defeat a boss', reward: 30, target: 1, stat: 'bosses' },
  { id: 'bossSlayer', name: 'Giant Slayer', text: 'Defeat 10 bosses in total', reward: 120, target: 10, stat: 'bosses' },
  { id: 'eliteHunter', name: 'Elite Hunter', text: 'Kill 25 elite zombies in total', reward: 60, target: 25, stat: 'elites' },
  { id: 'veteran', name: 'Veteran', text: 'Reach round 3', reward: 40, target: 3, stat: 'bestRound' },
  { id: 'legend', name: 'Legend', text: 'Reach round 6', reward: 150, target: 6, stat: 'bestRound' },
  { id: 'skilled', name: 'Skilled', text: 'Reach hero level 10 in one run', reward: 50, target: 10, stat: 'bestLevel' },
  { id: 'untouchable', name: 'Untouchable', text: 'Clear a wave without taking damage', reward: 40, target: 1, stat: 'flawlessWaves' },
  { id: 'multiKill', name: 'Massacre', text: 'Kill 8 zombies within one second', reward: 40, target: 8, stat: 'bestBurst' },
  { id: 'comboMaster', name: 'Combo Master', text: 'Reach a 50 kill combo', reward: 60, target: 50, stat: 'bestCombo' },
  { id: 'shieldBreaker', name: 'Riot Control', text: 'Break 25 riot shields in total', reward: 40, target: 25, stat: 'shieldsBroken' },
  { id: 'batSwatter', name: 'Bat Swatter', text: 'Kill 100 bats in total', reward: 40, target: 100, stat: 'bats' },
  { id: 'collector', name: 'Collector', text: 'Hold 5 reward cards in one run', reward: 50, target: 5, stat: 'bestCards' },
  { id: 'shopper', name: 'Well Equipped', text: 'Buy 5 base upgrades', reward: 30, target: 5, stat: 'upgradesBought' },
  { id: 'fullSquad', name: 'Full Squad', text: 'Unlock every hero', reward: 80, target: 3, stat: 'heroesUnlocked' },
  { id: 'rich', name: 'Treasure Hunter', text: 'Earn 1000 coins in total', reward: 60, target: 1000, stat: 'coinsEarned' },
  { id: 'highScore', name: 'High Roller', text: 'Score 50,000 points in one run', reward: 80, target: 50000, stat: 'bestScore' },
];

export const ACHIEVEMENT_BY_ID: Readonly<Record<string, AchievementDef>> = Object.fromEntries(ACHIEVEMENTS.map((a) => [a.id, a]));

export const emptyLifetime = (): LifetimeStats => ({
  kills: 0,
  bosses: 0,
  elites: 0,
  bats: 0,
  shieldsBroken: 0,
  flawlessWaves: 0,
  coinsEarned: 0,
  upgradesBought: 0,
  runs: 0,
  bestRound: 0,
  bestLevel: 0,
  bestScore: 0,
  bestCards: 0,
  bestBurst: 0,
  bestCombo: 0,
  heroesUnlocked: 1,
});

/** Progress towards an achievement, capped at its target. */
export function achievementProgress(def: AchievementDef, stats: LifetimeStats): { value: number; target: number; done: boolean } {
  const value = Math.min(def.target, Math.max(0, Math.floor(stats[def.stat])));
  return { value, target: def.target, done: value >= def.target };
}

/** Achievements reached now that are not in `unlocked` yet. */
export function newlyUnlocked(unlocked: ReadonlySet<string>, stats: LifetimeStats): AchievementDef[] {
  return ACHIEVEMENTS.filter((a) => !unlocked.has(a.id) && achievementProgress(a, stats).done);
}

/** Counts kills inside a sliding time window and remembers the best burst. */
export class BurstCounter {
  private readonly times: number[] = [];
  best = 0;

  add(time: number, window = 1): number {
    this.times.push(time);
    while (this.times.length > 0 && time - this.times[0] > window) this.times.shift();
    this.best = Math.max(this.best, this.times.length);
    return this.times.length;
  }

  reset(): void {
    this.times.length = 0;
    this.best = 0;
  }
}
