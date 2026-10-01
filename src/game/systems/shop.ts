import type { PlayerStats } from './skillTree.ts';
import type { WeaponId } from './weapons.ts';

export type UpgradeId = 'suit' | 'ammo' | 'plates' | 'bootCamp' | 'supplies' | 'notes' | 'scavenger' | 'greed';

export interface UpgradeDef {
  readonly id: UpgradeId;
  readonly name: string;
  readonly maxLevel: number;
  /** Price of the first level; later levels cost more (see `upgradeCost`). */
  readonly baseCost: number;
  /** What the upgrade gives at `level` (1..maxLevel). */
  readonly effect: (level: number) => string;
}

/** Weapons the Supply Contract upgrade hands out at the start of a run, one more per level. */
export const STARTING_WEAPONS: readonly WeaponId[] = ['heavy', 'shotgun', 'rocket'];

const pct = (v: number): string => `${Math.round(v * 100)}%`;

export const UPGRADES: readonly UpgradeDef[] = [
  { id: 'suit', name: 'Reinforced Suit', maxLevel: 5, baseCost: 40, effect: (l) => `+${10 * l} max HP` },
  { id: 'ammo', name: 'Custom Ammo', maxLevel: 5, baseCost: 50, effect: (l) => `+${pct(0.05 * l)} weapon damage` },
  { id: 'plates', name: 'Ceramic Plates', maxLevel: 3, baseCost: 70, effect: (l) => `-${pct(0.04 * l)} damage taken` },
  { id: 'bootCamp', name: 'Boot Camp', maxLevel: 3, baseCost: 80, effect: (l) => `Start every run with ${l} skill ${l === 1 ? 'point' : 'points'}` },
  {
    id: 'supplies',
    name: 'Supply Contract',
    maxLevel: 3,
    baseCost: 60,
    effect: (l) => `Start with ${['Heavy MG', 'Heavy MG + Shotgun', 'Heavy MG + Shotgun + Rocket'][l - 1]}`,
  },
  { id: 'notes', name: 'Field Notes', maxLevel: 5, baseCost: 50, effect: (l) => `+${pct(0.05 * l)} XP` },
  { id: 'scavenger', name: 'Radio Operator', maxLevel: 3, baseCost: 60, effect: (l) => `Supply crates drop ${pct(0.1 * l)} more often` },
  { id: 'greed', name: 'Bounty Hunter', maxLevel: 5, baseCost: 40, effect: (l) => `+${pct(0.1 * l)} coins` },
];

export const UPGRADE_BY_ID: Readonly<Record<UpgradeId, UpgradeDef>> = Object.fromEntries(UPGRADES.map((u) => [u.id, u])) as Record<UpgradeId, UpgradeDef>;

export type UpgradeLevels = Readonly<Partial<Record<UpgradeId, number>>>;

/** Coins needed to go from `level` to `level + 1`. */
export function upgradeCost(id: UpgradeId, level: number): number {
  return Math.round(UPGRADE_BY_ID[id].baseCost * (1 + level) ** 1.5);
}

export const levelOf = (levels: UpgradeLevels, id: UpgradeId): number => Math.max(0, Math.min(UPGRADE_BY_ID[id].maxLevel, levels[id] ?? 0));

/** Permanent base upgrades applied on top of the skill tree (before reward cards). */
export function applyUpgrades(stats: PlayerStats, levels: UpgradeLevels): PlayerStats {
  const out = { ...stats };
  out.maxHp += 10 * levelOf(levels, 'suit');
  out.damageMult += 0.05 * levelOf(levels, 'ammo');
  out.damageTaken -= 0.04 * levelOf(levels, 'plates');
  out.xpMult += 0.05 * levelOf(levels, 'notes');
  out.dropRateMult += 0.1 * levelOf(levels, 'scavenger');
  out.coinMult += 0.1 * levelOf(levels, 'greed');
  return out;
}

/** Skill points and crate weapons the hero gets when a new run starts. */
export function startingKit(levels: UpgradeLevels): { points: number; weapons: WeaponId[] } {
  return { points: levelOf(levels, 'bootCamp'), weapons: STARTING_WEAPONS.slice(0, levelOf(levels, 'supplies')) };
}

export type PurchaseResult = 'ok' | 'maxed' | 'noCoins';

export function checkPurchase(levels: UpgradeLevels, coins: number, id: UpgradeId): PurchaseResult {
  const level = levelOf(levels, id);
  if (level >= UPGRADE_BY_ID[id].maxLevel) return 'maxed';
  return coins >= upgradeCost(id, level) ? 'ok' : 'noCoins';
}
