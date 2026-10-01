import type { PlayerStats } from './skillTree.ts';

export type PerkId =
  | 'heavyRounds'
  | 'adrenaline'
  | 'boots'
  | 'quickHands'
  | 'fieldMedic'
  | 'scholar'
  | 'ironSkin'
  | 'luckyCharm'
  | 'armorPlate'
  | 'fangs'
  | 'scavenger'
  | 'bigPockets'
  | 'engineer'
  | 'training'
  | 'powderKeg'
  | 'tungsten';

export type Rarity = 'common' | 'rare' | 'epic';

export interface PerkDef {
  readonly id: PerkId;
  readonly name: string;
  readonly rarity: Rarity;
  /** How many times the card can be taken in one run (Infinity = no limit). */
  readonly maxStacks: number;
  /** What one more copy of the card gives. */
  readonly text: string;
  /** Permanent effect on the hero stats for `stacks` copies. */
  readonly apply?: (s: PlayerStats, stacks: number) => void;
}

/** Relative chance of each rarity when a card is drawn. */
export const RARITY_WEIGHT: Record<Rarity, number> = { common: 60, rare: 30, epic: 10 };

/** Armor from all sources never goes past this, so the hero can still be hurt. */
const MIN_DAMAGE_TAKEN = 0.4;

export const PERKS: readonly PerkDef[] = [
  { id: 'heavyRounds', name: 'Heavy Rounds', rarity: 'common', maxStacks: 5, text: '+12% weapon damage', apply: (s, n) => void (s.damageMult += 0.12 * n) },
  { id: 'adrenaline', name: 'Adrenaline', rarity: 'common', maxStacks: 5, text: '+10% fire rate', apply: (s, n) => void (s.fireRateMult += 0.1 * n) },
  { id: 'boots', name: 'Running Shoes', rarity: 'common', maxStacks: 3, text: '+8% move speed', apply: (s, n) => void (s.speedMult += 0.08 * n) },
  {
    id: 'quickHands',
    name: 'Quick Hands',
    rarity: 'common',
    maxStacks: 3,
    text: '+25% magazine size, -12% reload time',
    apply: (s, n) => {
      s.magMult += 0.25 * n;
      s.reloadMult = Math.max(0.3, s.reloadMult - 0.12 * n);
    },
  },
  { id: 'fieldMedic', name: 'Field Medic', rarity: 'common', maxStacks: 3, text: 'Heal 15 HP after every cleared wave', apply: (s, n) => void (s.waveHeal += 15 * n) },
  { id: 'scholar', name: 'Scholar', rarity: 'common', maxStacks: 3, text: '+20% XP from all sources', apply: (s, n) => void (s.xpMult += 0.2 * n) },
  { id: 'ironSkin', name: 'Iron Skin', rarity: 'rare', maxStacks: 5, text: '+25 max HP and a full heal now', apply: (s, n) => void (s.maxHp += 25 * n) },
  { id: 'luckyCharm', name: 'Lucky Charm', rarity: 'rare', maxStacks: 3, text: '+6% chance for x2 critical hits', apply: (s, n) => void (s.critChance += 0.06 * n) },
  {
    id: 'armorPlate',
    name: 'Armor Plate',
    rarity: 'rare',
    maxStacks: 3,
    text: '-8% damage taken',
    apply: (s, n) => void (s.damageTaken = Math.max(MIN_DAMAGE_TAKEN, s.damageTaken - 0.08 * n)),
  },
  { id: 'fangs', name: 'Fangs', rarity: 'rare', maxStacks: 3, text: 'Heal 2 HP per kill', apply: (s, n) => void (s.lifeOnKill += 2 * n) },
  { id: 'scavenger', name: 'Scavenger', rarity: 'rare', maxStacks: 2, text: 'Supply crates drop 35% more often', apply: (s, n) => void (s.dropRateMult += 0.35 * n) },
  {
    id: 'bigPockets',
    name: 'Big Pockets',
    rarity: 'rare',
    maxStacks: 3,
    text: '+1 grenade and +2 mines per round',
    apply: (s, n) => {
      s.grenades += n;
      s.mines += 2 * n;
    },
  },
  {
    id: 'engineer',
    name: 'Engineer',
    rarity: 'rare',
    maxStacks: 2,
    text: '+1 sentry turret per round [T]',
    apply: (s, n) => {
      s.turrets += n;
      s.turretTier = Math.max(1, s.turretTier);
    },
  },
  { id: 'training', name: 'Training Manual', rarity: 'rare', maxStacks: Infinity, text: '+1 skill point right now' },
  {
    id: 'powderKeg',
    name: 'Powder Keg',
    rarity: 'epic',
    maxStacks: 2,
    text: '+30% explosion damage, +15% radius',
    apply: (s, n) => {
      s.explosionDamageMult += 0.3 * n;
      s.explosionRadiusMult += 0.15 * n;
    },
  },
  { id: 'tungsten', name: 'Tungsten Core', rarity: 'epic', maxStacks: 2, text: 'Bullets pierce 1 more enemy', apply: (s, n) => void (s.pierce += n) },
];

export const PERK_BY_ID: Readonly<Record<PerkId, PerkDef>> = Object.fromEntries(PERKS.map((p) => [p.id, p])) as Record<PerkId, PerkDef>;

export type PerkStacks = ReadonlyMap<PerkId, number>;

/** Returns a copy of `stats` with every owned perk applied on top. */
export function applyPerks(stats: PlayerStats, stacks: PerkStacks): PlayerStats {
  const out = { ...stats };
  for (const [id, n] of stacks) if (n > 0) PERK_BY_ID[id].apply?.(out, n);
  return out;
}

/** The perks taken during one run, and the random offers made after each round. */
export class PerkDeck {
  private readonly stacks = new Map<PerkId, number>();

  count(id: PerkId): number {
    return this.stacks.get(id) ?? 0;
  }

  get owned(): PerkStacks {
    return this.stacks;
  }

  canTake(id: PerkId): boolean {
    return this.count(id) < PERK_BY_ID[id].maxStacks;
  }

  /** Draws up to `count` different perks that are not maxed out, weighted by rarity. */
  offer(rng: () => number, count = 3): PerkId[] {
    const pool = PERKS.filter((p) => this.canTake(p.id));
    const picks: PerkId[] = [];
    while (picks.length < count && pool.length > 0) {
      const total = pool.reduce((sum, p) => sum + RARITY_WEIGHT[p.rarity], 0);
      let roll = rng() * total;
      let index = pool.length - 1;
      for (let i = 0; i < pool.length; i++) {
        roll -= RARITY_WEIGHT[pool[i].rarity];
        if (roll < 0) {
          index = i;
          break;
        }
      }
      picks.push(pool[index].id);
      pool.splice(index, 1);
    }
    return picks;
  }

  take(id: PerkId): boolean {
    if (!this.canTake(id)) return false;
    this.stacks.set(id, this.count(id) + 1);
    return true;
  }

  reset(): void {
    this.stacks.clear();
  }

  restore(stacks: Partial<Record<PerkId, number>>): void {
    this.reset();
    for (const p of PERKS) {
      const n = Math.min(p.maxStacks, Math.max(0, Math.floor(stacks[p.id] ?? 0)));
      if (n > 0) this.stacks.set(p.id, n);
    }
  }

  /** Number of cards taken, counting every copy. */
  get total(): number {
    let sum = 0;
    for (const n of this.stacks.values()) sum += n;
    return sum;
  }
}
