import type { PlayerStats } from './skillTree.ts';
import type { WeaponId } from './weapons.ts';

export type HeroId = 'captain' | 'pyro' | 'engineer';

export interface HeroDef {
  readonly id: HeroId;
  readonly name: string;
  readonly title: string;
  /** Coins needed to unlock the hero in the base; 0 = available from the start. */
  readonly cost: number;
  /** What makes the hero different, in one line. */
  readonly passive: string;
  readonly startWeapons: readonly WeaponId[];
  /** Sprite palette changes applied to the base hero art. */
  readonly palette: Readonly<Record<string, string>>;
  readonly apply: (s: PlayerStats) => void;
}

export const HEROES: readonly HeroDef[] = [
  {
    id: 'captain',
    name: 'Captain',
    title: 'All-round soldier',
    cost: 0,
    passive: '+10% weapon damage',
    startWeapons: [],
    palette: {},
    apply: (s) => {
      s.damageMult += 0.1;
    },
  },
  {
    id: 'pyro',
    name: 'Pyro',
    title: 'Fire specialist',
    cost: 250,
    passive: '+15% ignite chance, +25% burn damage, -10 max HP. Starts with the Flame Shot',
    startWeapons: ['flame'],
    palette: { b: '#c83a1c', B: '#7a1e0e', r: '#34343c', R: '#1a1a20', y: '#ffb020', h: '#e8e0d0' },
    apply: (s) => {
      s.burnChance += 0.15;
      s.burnDpsMult += 0.25;
      s.maxHp -= 10;
    },
  },
  {
    id: 'engineer',
    name: 'Engineer',
    title: 'Turret builder',
    cost: 400,
    passive: '1 sentry turret per round from the start, turrets & drones +20% damage, -10% weapon damage',
    startWeapons: [],
    palette: { b: '#e8b020', B: '#9a6a10', r: '#3a6a8a', R: '#20405a', y: '#303030', h: '#5a3a1a' },
    apply: (s) => {
      s.turrets += 1;
      s.turretTier = Math.max(1, s.turretTier);
      s.turretDamageMult += 0.2;
      s.damageMult -= 0.1;
    },
  },
];

export const HERO_BY_ID: Readonly<Record<HeroId, HeroDef>> = Object.fromEntries(HEROES.map((h) => [h.id, h])) as Record<HeroId, HeroDef>;

export const DEFAULT_HERO: HeroId = 'captain';

export const isHeroId = (v: unknown): v is HeroId => typeof v === 'string' && v in HERO_BY_ID;

/** Stats with the hero's passive applied (on top of the skill tree, before upgrades and cards). */
export function applyHero(stats: PlayerStats, hero: HeroId): PlayerStats {
  const out = { ...stats };
  HERO_BY_ID[hero].apply(out);
  return out;
}
