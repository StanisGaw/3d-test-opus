import { DEFAULT_HERO, HERO_BY_ID, type HeroId, isHeroId } from './heroes.ts';
import { PERK_BY_ID, type PerkId } from './perks.ts';
import { SKILL_BY_ID, type SkillId } from './skillTree.ts';
import { type KeyValueStore, count, isRecord, num, readJson, writeJson } from './storage.ts';
import { WAVES_PER_ROUND } from './waveDirector.ts';
import { WEAPON_BY_ID, type ArsenalSnapshot, type WeaponId } from './weapons.ts';

export const SAVE_KEY = 'zombie-strike-iso.save';
const SAVE_VERSION = 1;
/** `nextWave` value meaning "the boss comes next". */
export const BOSS_NEXT = WAVES_PER_ROUND + 1;

/**
 * A checkpoint of a run, written at the start of every round and after every cleared wave.
 * Continuing starts right before `nextWave` of `round` on a map rebuilt from `mapSeed`.
 */
export interface RunSave {
  version: number;
  savedAt: number;
  round: number;
  /** 1..3 = that wave comes next, 4 = the boss. */
  nextWave: number;
  mapSeed: number;
  heroId: HeroId;
  run: { score: number; kills: number; bossesDefeated: number; coins: number };
  hero: {
    level: number;
    xp: number;
    totalXp: number;
    points: number;
    skills: Partial<Record<SkillId, number>>;
    perks: Partial<Record<PerkId, number>>;
    hp: number;
  };
  arsenal: ArsenalSnapshot;
  charges: { grenades: number; mines: number; turrets: number };
}

function parseIdMap<K extends string>(raw: unknown, valid: Readonly<Record<string, { maxRank?: number; maxStacks?: number }>>): Partial<Record<K, number>> {
  const out: Partial<Record<K, number>> = {};
  if (!isRecord(raw)) return out;
  for (const [id, value] of Object.entries(raw)) {
    const def = valid[id];
    if (!def) continue;
    const limit = def.maxRank ?? def.maxStacks ?? Infinity;
    const n = Math.min(limit, count(value));
    if (n > 0) out[id as K] = n;
  }
  return out;
}

function parseArsenal(raw: unknown): ArsenalSnapshot {
  const snap: ArsenalSnapshot = { current: 'pistol', pistolMag: WEAPON_BY_ID.pistol.magSize, ammo: {} };
  if (!isRecord(raw)) return snap;
  if (typeof raw.current === 'string' && raw.current in WEAPON_BY_ID) snap.current = raw.current as WeaponId;
  snap.pistolMag = count(raw.pistolMag, snap.pistolMag);
  if (isRecord(raw.ammo)) {
    for (const [id, a] of Object.entries(raw.ammo)) {
      if (!(id in WEAPON_BY_ID) || id === 'pistol' || !isRecord(a)) continue;
      snap.ammo[id as WeaponId] = { mag: count(a.mag), reserve: count(a.reserve) };
    }
  }
  return snap;
}

/** Validates a stored save. Anything malformed returns null (the save is ignored, not trusted). */
export function parseSave(raw: unknown): RunSave | null {
  if (!isRecord(raw) || raw.version !== SAVE_VERSION) return null;
  const run = isRecord(raw.run) ? raw.run : null;
  const hero = isRecord(raw.hero) ? raw.hero : null;
  const charges = isRecord(raw.charges) ? raw.charges : null;
  if (!run || !hero || !charges) return null;
  const round = count(raw.round);
  const nextWave = count(raw.nextWave);
  if (round < 1 || nextWave < 1 || nextWave > BOSS_NEXT) return null;
  return {
    version: SAVE_VERSION,
    savedAt: count(raw.savedAt),
    round,
    nextWave,
    mapSeed: count(raw.mapSeed),
    heroId: isHeroId(raw.heroId) ? raw.heroId : DEFAULT_HERO,
    run: { score: count(run.score), kills: count(run.kills), bossesDefeated: count(run.bossesDefeated), coins: count(run.coins) },
    hero: {
      level: Math.max(1, count(hero.level, 1)),
      xp: count(hero.xp),
      totalXp: count(hero.totalXp),
      points: count(hero.points),
      skills: parseIdMap<SkillId>(hero.skills, SKILL_BY_ID),
      perks: parseIdMap<PerkId>(hero.perks, PERK_BY_ID),
      hp: Math.max(1, num(hero.hp, 1)),
    },
    arsenal: parseArsenal(raw.arsenal),
    charges: { grenades: count(charges.grenades), mines: count(charges.mines), turrets: count(charges.turrets) },
  };
}

export const describeCheckpoint = (save: Pick<RunSave, 'round' | 'nextWave'> & { heroId?: HeroId }): string =>
  `${save.heroId ? `${HERO_BY_ID[save.heroId].name} · ` : ''}Round ${save.round} · ${save.nextWave >= BOSS_NEXT ? 'Boss' : `Wave ${save.nextWave}`}`;

export function loadSave(store: KeyValueStore): RunSave | null {
  return readJson(store, SAVE_KEY, parseSave);
}

export function writeSave(store: KeyValueStore, save: Omit<RunSave, 'version'>): void {
  writeJson(store, SAVE_KEY, { ...save, version: SAVE_VERSION });
}

export function clearSave(store: KeyValueStore): void {
  store.remove(SAVE_KEY);
}
