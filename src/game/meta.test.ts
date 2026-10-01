import { describe, expect, it } from 'vitest';
import type { GameContext } from './core/context.ts';
import { Meta } from './play/meta.ts';
import { ACHIEVEMENTS, BurstCounter, achievementProgress, emptyLifetime, newlyUnlocked } from './systems/achievements.ts';
import { HOLD, TRACKS, noteLength, noteToMidi, parseDrums, parseMelody } from './systems/music.ts';
import { PerkDeck } from './systems/perks.ts';
import { PROFILE_KEY, addToLeaderboard, emptyProfile, loadProfile, parseProfile } from './systems/profile.ts';
import { coinsForEnemy } from './systems/progression.ts';
import { BOSS_NEXT, SAVE_KEY, describeCheckpoint, loadSave, parseSave, writeSave } from './systems/saveGame.ts';
import { UPGRADES, applyUpgrades, checkPurchase, startingKit, upgradeCost } from './systems/shop.ts';
import { SkillTree } from './systems/skillTree.ts';
import { memoryStore, readJson } from './systems/storage.ts';
import { WAVES_PER_ROUND, WaveDirector } from './systems/waveDirector.ts';
import { Arsenal } from './systems/weapons.ts';
import { createRng } from './world/random.ts';

const validSave = () => ({
  savedAt: 1,
  round: 2,
  nextWave: 3,
  mapSeed: 42,
  heroId: 'captain' as const,
  run: { score: 1200, kills: 80, bossesDefeated: 1, coins: 55 },
  hero: { level: 5, xp: 10, totalXp: 500, points: 1, skills: { dmg: 2 }, perks: { scholar: 1 }, hp: 70 },
  arsenal: { current: 'heavy' as const, pistolMag: 12, ammo: { heavy: { mag: 60, reserve: 40 } } },
  charges: { grenades: 1, mines: 0, turrets: 0 },
});

describe('storage', () => {
  it('given broken JSON, when read, then it returns null instead of throwing', () => {
    const store = memoryStore({ k: '{oops' });
    expect(readJson(store, 'k', () => 1)).toBeNull();
    expect(readJson(store, 'missing', () => 1)).toBeNull();
  });
});

describe('save game', () => {
  it('given a checkpoint, when written and loaded, then the same run comes back', () => {
    const store = memoryStore();
    writeSave(store, validSave());
    const save = loadSave(store);
    expect(save?.round).toBe(2);
    expect(save?.hero.skills).toEqual({ dmg: 2 });
    expect(save?.arsenal.ammo.heavy).toEqual({ mag: 60, reserve: 40 });
    expect(describeCheckpoint(save!)).toBe('Captain · Round 2 · Wave 3');
    expect(describeCheckpoint({ round: 4, nextWave: BOSS_NEXT })).toBe('Round 4 · Boss');
  });

  it('given a tampered save, when parsed, then unknown ids are dropped and ranks are clamped', () => {
    const raw = { ...validSave(), version: 1, hero: { ...validSave().hero, skills: { dmg: 99, hack: 5 }, perks: { tungsten: 50 } } };
    const save = parseSave(raw)!;
    expect(save.hero.skills).toEqual({ dmg: 5 });
    expect(save.hero.perks).toEqual({ tungsten: 2 });
  });

  it('given an invalid save, when parsed, then it is rejected', () => {
    expect(parseSave({ ...validSave(), version: 99 })).toBeNull();
    expect(parseSave({ ...validSave(), version: 1, nextWave: 9 })).toBeNull();
    expect(parseSave({ version: 1 })).toBeNull();
    expect(loadSave(memoryStore({ [SAVE_KEY]: 'not json' }))).toBeNull();
  });

  it('given a save before wave 3, when the director resumes, then it waits in the break and then starts wave 3', () => {
    const d = new WaveDirector(createRng(1));
    d.resumeAt(2, 3);
    expect(d.round).toBe(2);
    expect(d.phase).toBe('intermission');
    const events = [];
    for (let i = 0; i < 60; i++) events.push(...d.update(0.1, 0));
    expect(d.phase).toBe('wave');
    expect(d.wave).toBe(3);
  });

  it('given a save before the boss, when resumed, then the boss warning plays and the boss spawns', () => {
    const d = new WaveDirector(createRng(1));
    d.resumeAt(3, WAVES_PER_ROUND + 1);
    const events = [];
    for (let i = 0; i < 50; i++) events.push(...d.update(0.1, 0));
    expect(events.some((e) => e.type === 'spawnBoss')).toBe(true);
    expect(d.round).toBe(3);
  });

  it('given weapons with ammo, when snapshotted and restored, then ammo and the held weapon match', () => {
    const a = new Arsenal();
    a.pickup('heavy');
    a.pickup('rocket');
    const b = new Arsenal();
    b.restore(JSON.parse(JSON.stringify(a.snapshot())));
    expect(b.current).toBe('rocket');
    expect(b.ammoOf('heavy')).toBe(a.ammoOf('heavy'));
    expect(b.magOf('rocket')).toBe(a.magOf('rocket'));
    expect(b.reserveOf('pistol')).toBe(Infinity);
  });

  it('given skill ranks, when restored, then ranks and points match and stay within limits', () => {
    const tree = new SkillTree();
    tree.restore({ dmg: 3, crit: 99 }, 2);
    expect(tree.rank('dmg')).toBe(3);
    expect(tree.rank('crit')).toBe(3);
    expect(tree.points).toBe(2);
  });
});

describe('profile and leaderboard', () => {
  it('given runs, when added to the leaderboard, then it stays sorted and keeps the top 10', () => {
    let board = emptyProfile().leaderboard;
    for (let i = 1; i <= 12; i++) board = addToLeaderboard(board, { score: i * 100, round: 1, wave: 1, level: 1, kills: 1, date: i, hero: 'captain' }).board;
    expect(board).toHaveLength(10);
    expect(board[0].score).toBe(1200);
    const low = addToLeaderboard(board, { score: 50, round: 1, wave: 1, level: 1, kills: 0, date: 99, hero: 'captain' });
    expect(low.place).toBeNull();
    const top = addToLeaderboard(board, { score: 5000, round: 1, wave: 1, level: 1, kills: 0, date: 99, hero: 'captain' });
    expect(top.place).toBe(1);
  });

  it('given a hand-edited profile, when parsed, then bad values are cleaned', () => {
    const p = parseProfile({ version: 1, coins: -50, upgrades: { suit: 99, fake: 3 }, achievements: ['firstBlood', 'nope', 'firstBlood'], settings: { music: false } })!;
    expect(p.coins).toBe(0);
    expect(p.upgrades.suit).toBe(5);
    expect(p.achievements).toEqual(['firstBlood']);
    expect(p.settings.music).toBe(false);
    expect(loadProfile(memoryStore({ [PROFILE_KEY]: '[]' })).coins).toBe(0);
  });
});

describe('base shop', () => {
  it('given upgrade levels, when pricing, then each level costs more than the last', () => {
    for (const u of UPGRADES) {
      for (let l = 1; l < u.maxLevel; l++) expect(upgradeCost(u.id, l)).toBeGreaterThan(upgradeCost(u.id, l - 1));
    }
  });

  it('given coins and levels, when checking a purchase, then maxed and too expensive upgrades are refused', () => {
    expect(checkPurchase({}, 0, 'suit')).toBe('noCoins');
    expect(checkPurchase({}, upgradeCost('suit', 0), 'suit')).toBe('ok');
    expect(checkPurchase({ suit: 5 }, 99999, 'suit')).toBe('maxed');
  });

  it('given upgrades, when applied, then stats and the starting kit change', () => {
    const base = new SkillTree().stats();
    const out = applyUpgrades(base, { suit: 2, ammo: 1, greed: 3, scavenger: 1 });
    expect(out.maxHp).toBe(base.maxHp + 20);
    expect(out.damageMult).toBeCloseTo(1.05);
    expect(out.coinMult).toBeCloseTo(1.3);
    expect(out.dropRateMult).toBeCloseTo(1.1);
    expect(startingKit({ bootCamp: 2, supplies: 2 })).toEqual({ points: 2, weapons: ['heavy', 'shotgun'] });
  });

  it('given kills, when counting coins, then bosses pay more every round', () => {
    expect(coinsForEnemy('walker', 3)).toBe(1);
    expect(coinsForEnemy('boss', 2)).toBeGreaterThan(coinsForEnemy('boss', 1));
  });
});

describe('achievements', () => {
  it('given lifetime stats, when checked, then only reached and not yet unlocked achievements are new', () => {
    const life = { ...emptyLifetime(), kills: 600, bestRound: 3 };
    const fresh = newlyUnlocked(new Set(['firstBlood']), life).map((a) => a.id);
    expect(fresh).toEqual(expect.arrayContaining(['slayer', 'veteran']));
    expect(fresh).not.toContain('firstBlood');
    expect(fresh).not.toContain('exterminator');
    const slayer = ACHIEVEMENTS.find((a) => a.id === 'exterminator')!;
    expect(achievementProgress(slayer, life)).toEqual({ value: 600, target: 3000, done: false });
  });

  it('given kills over time, when counted, then the best one-second burst is kept', () => {
    const b = new BurstCounter();
    for (const t of [0, 0.2, 0.4, 0.6, 2, 2.1]) b.add(t);
    expect(b.best).toBe(4);
  });
});

describe('music', () => {
  it('given note names, when converted, then they match MIDI numbers', () => {
    expect(noteToMidi('A4')).toBe(69);
    expect(noteToMidi('C4')).toBe(60);
    expect(noteToMidi('C#5')).toBe(73);
    expect(noteToMidi('Eb3')).toBe(51);
    expect(() => noteToMidi('H2')).toThrow();
  });

  it('given every track, when parsed, then all voices are valid and loop on whole bars', () => {
    for (const t of Object.values(TRACKS)) {
      const lead = parseMelody(t.lead);
      const bass = parseMelody(t.bass);
      const drums = parseDrums(t.drums);
      expect(lead.length).toBe(bass.length);
      expect(drums.length).toBe(lead.length);
      expect(lead.length % 16).toBe(0);
    }
    expect(TRACKS.boss.bpm).toBeGreaterThan(TRACKS.battle.bpm);
    expect(TRACKS.battle.bpm).toBeGreaterThan(TRACKS.calm.bpm);
  });

  it('given held notes, when measuring, then a note lasts until the next note or rest', () => {
    const steps = parseMelody('A4 - - . C5 -');
    expect(steps[1]).toBe(HOLD);
    expect(noteLength(steps, 0)).toBe(3);
    expect(noteLength(steps, 4)).toBe(2);
  });
});

describe('Meta (coins, achievements, leaderboard)', () => {
  const fakeContext = () => {
    const shown: string[] = [];
    const ctx = {
      stats: { coinMult: 1.5 },
      time: 0,
      state: 'playing',
      playing: true,
      director: { round: 1 },
      hero: { progression: { level: 1 }, perks: new PerkDeck() },
      run: { score: 0 },
      hud: { showAchievement: (name: string) => shown.push(name) },
      sfx: () => undefined,
      combo: { count: 0 },
    };
    return { ctx: ctx as unknown as GameContext, shown };
  };

  it('given a run, when it ends, then coins are banked, the run is ranked and the profile is saved', () => {
    const store = memoryStore();
    const { ctx } = fakeContext();
    const meta = new Meta(store, ctx);
    meta.startRun();
    expect(meta.earnCoins(10)).toBe(15);
    const result = meta.endRun({ score: 999, round: 2, wave: 1, level: 3, kills: 40, hero: 'pyro' });
    expect(result.coinsEarned).toBe(15);
    expect(result.place).toBe(1);
    const reloaded = new Meta(store, ctx);
    expect(reloaded.coins).toBeGreaterThanOrEqual(15);
    expect(reloaded.profile.leaderboard[0].score).toBe(999);
    expect(reloaded.lifetime.runs).toBe(1);
  });

  it('given the first kill, when reported, then First Blood unlocks once and pays its reward', () => {
    const { ctx, shown } = fakeContext();
    const meta = new Meta(memoryStore(), ctx);
    meta.onKill('walker');
    meta.onKill('walker');
    expect(shown).toEqual(['First Blood']);
    expect(meta.isUnlocked('firstBlood')).toBe(true);
    expect(meta.coins).toBe(ACHIEVEMENTS.find((a) => a.id === 'firstBlood')!.reward);
  });

  it('given enough coins, when buying an upgrade, then coins drop and the level rises', () => {
    const store = memoryStore();
    const { ctx } = fakeContext();
    const meta = new Meta(store, ctx);
    meta.profile.coins = 1000;
    expect(meta.buy('suit')).toBe('ok');
    expect(meta.upgrades.suit).toBe(1);
    expect(meta.coins).toBe(1000 - upgradeCost('suit', 0));
    expect(new Meta(store, ctx).upgrades.suit).toBe(1);
  });

  it('given a wave without damage, when cleared, then it counts as flawless; a hit spoils the next one', () => {
    const { ctx } = fakeContext();
    const meta = new Meta(memoryStore(), ctx);
    meta.startRun();
    meta.onWaveCleared();
    meta.onHeroHurt();
    meta.onWaveCleared();
    expect(meta.lifetime.flawlessWaves).toBe(1);
  });
});
