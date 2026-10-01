import { ACHIEVEMENT_BY_ID, type LifetimeStats, emptyLifetime } from './achievements.ts';
import { DEFAULT_HERO, type HeroId, isHeroId } from './heroes.ts';
import { UPGRADES, type UpgradeId } from './shop.ts';
import { type KeyValueStore, count, isRecord, readJson, writeJson } from './storage.ts';

export const PROFILE_KEY = 'zombie-strike-iso.profile';
const PROFILE_VERSION = 1;
export const LEADERBOARD_SIZE = 10;

export interface RunRecord {
  score: number;
  round: number;
  wave: number;
  level: number;
  kills: number;
  /** Unix time in ms. */
  date: number;
  hero: HeroId;
}

export interface Settings {
  music: boolean;
}

/** Everything that survives between runs. */
export interface ProfileData {
  version: number;
  coins: number;
  upgrades: Partial<Record<UpgradeId, number>>;
  achievements: string[];
  lifetime: LifetimeStats;
  leaderboard: RunRecord[];
  settings: Settings;
  /** Heroes bought in the base (the Captain is always there). */
  heroes: HeroId[];
  /** Hero picked last time, preselected in the hero screen. */
  selectedHero: HeroId;
}

export const emptyProfile = (): ProfileData => ({
  version: PROFILE_VERSION,
  coins: 0,
  upgrades: {},
  achievements: [],
  lifetime: emptyLifetime(),
  leaderboard: [],
  settings: { music: true },
  heroes: [DEFAULT_HERO],
  selectedHero: DEFAULT_HERO,
});

function parseRecord(raw: unknown): RunRecord | null {
  if (!isRecord(raw)) return null;
  return {
    score: count(raw.score),
    round: Math.max(1, count(raw.round, 1)),
    wave: count(raw.wave),
    level: Math.max(1, count(raw.level, 1)),
    kills: count(raw.kills),
    date: count(raw.date),
    hero: isHeroId(raw.hero) ? raw.hero : DEFAULT_HERO,
  };
}

/** Accepts only known fields with sane values, so a hand-edited or old profile cannot break the game. */
export function parseProfile(raw: unknown): ProfileData | null {
  if (!isRecord(raw) || raw.version !== PROFILE_VERSION) return null;
  const profile = emptyProfile();
  profile.coins = count(raw.coins);
  if (isRecord(raw.upgrades)) {
    for (const u of UPGRADES) profile.upgrades[u.id] = Math.min(u.maxLevel, count(raw.upgrades[u.id]));
  }
  if (Array.isArray(raw.achievements)) {
    profile.achievements = [...new Set(raw.achievements.filter((id): id is string => typeof id === 'string' && id in ACHIEVEMENT_BY_ID))];
  }
  if (isRecord(raw.lifetime)) {
    const life = raw.lifetime;
    for (const key of Object.keys(profile.lifetime) as (keyof LifetimeStats)[]) profile.lifetime[key] = count(life[key]);
  }
  if (Array.isArray(raw.leaderboard)) {
    profile.leaderboard = raw.leaderboard
      .map(parseRecord)
      .filter((r): r is RunRecord => r !== null)
      .sort((a, b) => b.score - a.score)
      .slice(0, LEADERBOARD_SIZE);
  }
  if (isRecord(raw.settings)) profile.settings.music = raw.settings.music !== false;
  if (Array.isArray(raw.heroes)) profile.heroes = [...new Set([DEFAULT_HERO, ...raw.heroes.filter(isHeroId)])];
  if (isHeroId(raw.selectedHero) && profile.heroes.includes(raw.selectedHero)) profile.selectedHero = raw.selectedHero;
  profile.lifetime.heroesUnlocked = Math.max(profile.lifetime.heroesUnlocked, profile.heroes.length);
  return profile;
}

/**
 * Inserts a run into a best-first leaderboard. Returns the new board and the 1-based place,
 * or null when the run did not make the top list.
 */
export function addToLeaderboard(board: readonly RunRecord[], record: RunRecord, size = LEADERBOARD_SIZE): { board: RunRecord[]; place: number | null } {
  const next = [...board, record].sort((a, b) => b.score - a.score || a.date - b.date).slice(0, size);
  const index = next.indexOf(record);
  return { board: next, place: index >= 0 ? index + 1 : null };
}

export function loadProfile(store: KeyValueStore): ProfileData {
  return readJson(store, PROFILE_KEY, parseProfile) ?? emptyProfile();
}

export function saveProfile(store: KeyValueStore, profile: ProfileData): void {
  writeJson(store, PROFILE_KEY, profile);
}
