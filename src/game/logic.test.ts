import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { ActorSprite } from './gfx/actorSprite.ts';
import type { AnimSet } from './gfx/assets.ts';
import { ALL_ART, GLYPHS } from './gfx/spriteArt.ts';
import { artSize, validateArt } from './gfx/pixelArt.ts';
import { Arsenal, WEAPONS } from './systems/weapons.ts';
import { Buffs, Progression, xpForEnemy, xpToNext } from './systems/progression.ts';
import { BASE_MAX_HP, SKILLS, SKILL_BY_ID, type SkillId, SkillTree, computeStats, describeSkill, statLines } from './systems/skillTree.ts';
import { WAVES_PER_ROUND, WaveDirector, type DirectorEvent, ZOMBIE_KINDS, type ZombieKind, waveSize, zombieChances, zombieKindFor } from './systems/waveDirector.ts';
import { isFrontalHit } from './entities/enemies.ts';
import { formatFloater } from './ui/floatingText.ts';
import { FlowField, UNREACHABLE } from './world/flowField.ts';
import { clampToLineOfSight, hasLineOfSight, moveCircle } from './world/collision.ts';
import { type GameMap, Ground, Obstacle, findTileInRing, generateMap, isWalkable, tileIndex } from './world/mapGen.ts';
import { createRng } from './world/random.ts';
import { Timers } from './core/timers.ts';
import { separateEnemies } from './world/crowd.ts';
import type { Enemy } from './entities/enemies.ts';
import { PERKS, PERK_BY_ID, PerkDeck, applyPerks } from './systems/perks.ts';

describe('generateMap', () => {
  it('given the same seed, when generating twice, then produces identical maps', () => {
    const a = generateMap(1234);
    const b = generateMap(1234);
    expect(a.ground).toEqual(b.ground);
    expect(a.obstacle).toEqual(b.obstacle);
  });

  it('given different seeds, when generating, then produces different maps', () => {
    expect(generateMap(1).obstacle).not.toEqual(generateMap(2).obstacle);
  });

  it('given any seed, when generating, then the border is solid and the start area is walkable', () => {
    for (const seed of [3, 99, 4242, 777777]) {
      const map = generateMap(seed);
      for (let i = 0; i < map.size; i++) {
        expect(isWalkable(map, i, 0)).toBe(false);
        expect(isWalkable(map, 0, i)).toBe(false);
        expect(isWalkable(map, i, map.size - 1)).toBe(false);
        expect(isWalkable(map, map.size - 1, i)).toBe(false);
      }
      expect(isWalkable(map, map.start.x, map.start.y)).toBe(true);
      expect(isWalkable(map, map.start.x + 3, map.start.y)).toBe(true);
    }
  });

  it('given a generated map, when inspecting content, then it contains water, trees and walls', () => {
    const map = generateMap(2024);
    expect(map.ground.includes(Ground.Water)).toBe(true);
    expect(map.obstacle.includes(Obstacle.Tree)).toBe(true);
    expect(map.obstacle.includes(Obstacle.Wall)).toBe(true);
  });

  it('given a ring search, when a tile is found, then it is reachable and inside the ring', () => {
    const map = generateMap(55);
    const rng = createRng(1);
    for (let i = 0; i < 50; i++) {
      const tile = findTileInRing(map, rng, map.start.x, map.start.y, 10, 16);
      expect(tile).not.toBeNull();
      if (!tile) continue;
      expect(map.reachable[tileIndex(map, tile.x, tile.y)]).toBe(1);
      const d = Math.hypot(tile.x - map.start.x, tile.y - map.start.y);
      expect(d).toBeGreaterThanOrEqual(8.5);
      expect(d).toBeLessThanOrEqual(17.5);
    }
  });
});

describe('FlowField', () => {
  it('given a target, when following directions from a reachable tile, then it arrives at the target', () => {
    const map = generateMap(8080);
    const field = new FlowField(map);
    field.update(map.start.x, map.start.y);
    const rng = createRng(3);
    const from = findTileInRing(map, rng, map.start.x, map.start.y, 15, 25);
    expect(from).not.toBeNull();
    if (!from) return;
    expect(field.distance[tileIndex(map, from.x, from.y)]).not.toBe(UNREACHABLE);
    let x = from.x;
    let y = from.y;
    for (let step = 0; step < 500 && (x !== map.start.x || y !== map.start.y); step++) {
      const dir = field.direction(x, y);
      expect(dir).not.toBeNull();
      if (!dir) return;
      x += Math.round(dir.x / Math.max(Math.abs(dir.x), Math.abs(dir.y)));
      y += Math.round(dir.y / Math.max(Math.abs(dir.x), Math.abs(dir.y)));
      expect(isWalkable(map, x, y)).toBe(true);
    }
    expect({ x, y }).toEqual(map.start);
  });
});

describe('moveCircle', () => {
  it('given a wall ahead, when moving far into it, then the circle ends on a walkable tile', () => {
    const map = generateMap(1);
    const pos = { x: map.start.x + 0.5, y: map.start.y + 0.5 };
    moveCircle(map, pos, 0.3, -40, 0);
    expect(pos.x).toBeLessThan(map.start.x);
    expect(isWalkable(map, Math.floor(pos.x), Math.floor(pos.y))).toBe(true);
    expect(isWalkable(map, Math.floor(pos.x - 0.29), Math.floor(pos.y))).toBe(true);
  });
});

describe('Arsenal', () => {
  it('given a fresh arsenal, when selecting an empty slot, then it keeps the infinite pistol', () => {
    const arsenal = new Arsenal();
    expect(arsenal.selectSlot(2)).toBe(false);
    expect(arsenal.current).toBe('pistol');
    expect(arsenal.ammoOf('pistol')).toBe(Infinity);
  });

  it('given a crate pickup, when collected, then the weapon is equipped and selectable by number', () => {
    const arsenal = new Arsenal();
    arsenal.pickup('shotgun');
    expect(arsenal.current).toBe('shotgun');
    arsenal.selectSlot(1);
    expect(arsenal.current).toBe('pistol');
    expect(arsenal.selectSlot(3)).toBe(true);
    expect(arsenal.current).toBe('shotgun');
  });

  it('given a weapon with ammo, when it runs dry, then it falls back to the pistol', () => {
    const arsenal = new Arsenal();
    arsenal.pickup('rocket');
    let shots = 0;
    for (let i = 0; i < 100; i++) {
      arsenal.update(10);
      const fired = arsenal.tryFire();
      if (fired?.id === 'rocket') shots++;
    }
    expect(shots).toBe(WEAPONS.find((w) => w.id === 'rocket')?.pickupAmmo);
    expect(arsenal.current).toBe('pistol');
  });

  it('given a pistol, when firing within the cooldown, then only one shot is fired', () => {
    const arsenal = new Arsenal();
    expect(arsenal.tryFire()).not.toBeNull();
    expect(arsenal.tryFire()).toBeNull();
    arsenal.update(1);
    expect(arsenal.tryFire()).not.toBeNull();
  });
});

describe('WaveDirector', () => {
  const run = (director: WaveDirector, seconds: number, alive: () => number, sink: DirectorEvent[]) => {
    for (let t = 0; t < seconds; t += 0.1) sink.push(...director.update(0.1, alive()));
  };

  it('given a full round, when all zombies die, then waves advance to a boss and then a new round', () => {
    const director = new WaveDirector(createRng(7));
    const events: DirectorEvent[] = [];
    let alive = 0;
    const tick = () => {
      const out = director.update(0.1, alive);
      for (const e of out) if (e.type === 'spawn') alive++;
      events.push(...out);
      alive = 0; // everything dies instantly
    };
    for (let i = 0; i < 2000 && director.phase !== 'boss'; i++) tick();
    expect(director.phase).toBe('boss');
    const spawns = events.filter((e) => e.type === 'spawn').length;
    let expected = 0;
    for (let w = 1; w <= WAVES_PER_ROUND; w++) expected += waveSize(1, w);
    expect(spawns).toBe(expected);
    expect(events.some((e) => e.type === 'spawnBoss')).toBe(true);

    director.notifyBossDefeated();
    run(director, 10, () => 0, events);
    expect(events.some((e) => e.type === 'roundCleared')).toBe(true);
    expect(events.some((e) => e.type === 'newRound' && e.round === 2)).toBe(true);
    expect(director.round).toBe(2);
  });

  it('given living zombies, when the wave is fully spawned, then it does not clear', () => {
    const director = new WaveDirector(createRng(1));
    const events: DirectorEvent[] = [];
    run(director, 120, () => 5, events);
    expect(director.phase).toBe('wave');
    expect(events.some((e) => e.type === 'waveCleared')).toBe(false);
  });

  it('given early waves, when choosing zombie kinds, then only walkers appear in wave 1 of round 1', () => {
    for (let roll = 0; roll < 1; roll += 0.05) expect(zombieKindFor(1, 1, roll)).toBe('walker');
    expect(zombieKindFor(3, 3, 0)).toBe('brute');
  });
});

describe('sprite art', () => {
  it('given all sprites, when validated, then rows are rectangular and use known palette keys', () => {
    for (const art of ALL_ART) expect(validateArt(art)).toEqual([]);
  });

  it('given crate glyphs, when measured, then each is 3x5', () => {
    for (const glyph of Object.values(GLYPHS)) {
      expect(glyph).toHaveLength(5);
      for (const row of glyph) expect(row).toHaveLength(3);
    }
    expect(artSize(ALL_ART[0])).toEqual({ width: 16, height: 20 });
  });
});

describe('Arsenal magazines', () => {
  it('given a pistol, when the magazine is emptied, then it reloads and keeps infinite reserve', () => {
    const arsenal = new Arsenal();
    const mag = arsenal.magSizeOf('pistol');
    for (let i = 0; i < mag; i++) {
      arsenal.update(1);
      expect(arsenal.tryFire()?.id).toBe('pistol');
    }
    expect(arsenal.reloading).toBe(true);
    expect(arsenal.tryFire()).toBeNull();
    arsenal.update(2);
    expect(arsenal.magOf('pistol')).toBe(mag);
    expect(arsenal.reserveOf('pistol')).toBe(Infinity);
  });

  it('given extended mags, when picking up a weapon, then the magazine is bigger and reload is faster', () => {
    const arsenal = new Arsenal();
    arsenal.mods.magMult = 1.6;
    arsenal.mods.reloadMult = 0.5;
    arsenal.pickup('heavy');
    expect(arsenal.magOf('heavy')).toBe(96);
    arsenal.update(1);
    arsenal.tryFire();
    expect(arsenal.reload()).toBe(true);
    arsenal.update(1.6 * 0.5 + 0.01);
    expect(arsenal.magOf('heavy')).toBe(96);
  });

  it('given free ammo, when firing, then the magazine does not drain', () => {
    const arsenal = new Arsenal();
    arsenal.freeAmmo = true;
    for (let i = 0; i < 50; i++) {
      arsenal.update(1);
      arsenal.tryFire();
    }
    expect(arsenal.magOf('pistol')).toBe(arsenal.magSizeOf('pistol'));
  });
});

describe('SkillTree', () => {
  it('given no points, when buying a skill, then it is refused', () => {
    const tree = new SkillTree();
    expect(tree.buy('dmg')).toBe('noPoints');
    expect(tree.rank('dmg')).toBe(0);
  });

  it('given a skill with a requirement, when the requirement is not met, then it stays locked until it is', () => {
    const tree = new SkillTree();
    tree.points = 5;
    expect(tree.buy('crit')).toBe('locked');
    tree.buy('dmg');
    expect(tree.buy('crit')).toBe('locked');
    tree.buy('dmg');
    expect(tree.buy('crit')).toBe('ok');
    expect(tree.points).toBe(2);
    expect(tree.spent).toBe(3);
  });

  it('given a maxed skill, when buying again, then the point is kept', () => {
    const tree = new SkillTree();
    tree.points = 10;
    for (let i = 0; i < SKILL_BY_ID.pierce.maxRank + 2; i++) {
      tree.buy('rof');
      tree.buy('rof');
      tree.buy('pierce');
    }
    expect(tree.rank('pierce')).toBe(SKILL_BY_ID.pierce.maxRank);
    expect(tree.check('pierce')).toBe('maxed');
  });

  it('given learned skills, when computing stats, then bonuses stack per rank', () => {
    const tree = new SkillTree();
    tree.points = 20;
    for (let i = 0; i < 3; i++) tree.buy('hp');
    tree.buy('grenade');
    tree.buy('turret');
    tree.buy('turret');
    const s = tree.stats();
    expect(s.maxHp).toBe(BASE_MAX_HP + 60);
    expect(s.grenades).toBe(1);
    expect(s.turrets).toBe(2);
    expect(s.turretTier).toBe(2);
    expect(s.damageMult).toBe(1);
  });

  it('given the data table, when checked, then every requirement points to an earlier tier of the same branch', () => {
    for (const skill of SKILLS) {
      expect(skill.effect(1).length).toBeGreaterThan(0);
      if (!skill.requires) continue;
      const req = SKILL_BY_ID[skill.requires.id];
      expect(req.branch).toBe(skill.branch);
      expect(req.tier).toBeLessThan(skill.tier);
      expect(skill.requires.rank).toBeLessThanOrEqual(req.maxRank);
    }
  });

  it('given every skill point, when the tree is maxed, then all capstones can be reached', () => {
    const tree = new SkillTree();
    tree.points = 1000;
    for (let pass = 0; pass < 10; pass++) for (const s of SKILLS) tree.buy(s.id);
    for (const s of SKILLS) expect(tree.check(s.id)).toBe('maxed');
    expect(computeStats(tree.snapshot()).overdrive).toBe(true);
  });

  it('given an old save with skills that no longer exist, when restored, then they are ignored', () => {
    const tree = new SkillTree();
    tree.restore({ dmg: 2, pyroFuel: 3, engSwarm: 2 } as Partial<Record<SkillId, number>>, 1);
    expect(tree.rank('dmg')).toBe(2);
    expect(tree.spent).toBe(2);
    expect(tree.points).toBe(1);
  });
});

describe('Progression', () => {
  it('given enough XP, when added at once, then several levels and points are gained', () => {
    const p = new Progression();
    const gained = p.add(xpToNext(1) + xpToNext(2) + 5);
    expect(gained).toBe(2);
    expect(p.level).toBe(3);
    expect(p.xp).toBe(5);
  });

  it('given later levels, when comparing costs, then each level needs more XP', () => {
    for (let l = 1; l < 30; l++) expect(xpToNext(l + 1)).toBeGreaterThan(xpToNext(l));
    expect(xpForEnemy('boss', 2)).toBeGreaterThan(xpForEnemy('brute', 2));
  });

  it('given the rebalanced curve, when compared to the old one, then every level needs at least twice the XP', () => {
    const old = (level: number): number => Math.round(40 + 30 * (level - 1) + 6 * (level - 1) ** 2);
    for (let l = 1; l <= 30; l++) expect(xpToNext(l)).toBeGreaterThanOrEqual(old(l) * 2);
  });
});

describe('Dash skill', () => {
  it('given no points in Dash, when computing stats, then the dash is locked', () => {
    expect(new SkillTree().stats().dash).toBe(false);
  });

  it('given the first rank, when learned, then the dash unlocks with its base cooldown; later ranks shorten it', () => {
    const tree = new SkillTree();
    tree.points = 10;
    tree.buy('speed');
    tree.buy('dash');
    expect(tree.stats().dash).toBe(true);
    expect(tree.stats().dashCooldownMult).toBe(1);
    tree.buy('dash');
    expect(tree.stats().dashCooldownMult).toBeCloseTo(0.82);
  });
});

describe('supply drops', () => {
  it('given a wave in progress, when the drop timer runs, then the first timed drop does not come sooner than 24 seconds', () => {
    const director = new WaveDirector(createRng(3));
    const events: DirectorEvent[] = [];
    for (let t = 0; t < 26; t += 0.1) events.push(...director.update(0.1, 5));
    expect(events.some((e) => e.type === 'supplyDrop')).toBe(false);
  });
});

describe('Buffs', () => {
  it('given a timed buff, when time passes, then it expires; re-adding refreshes it', () => {
    const buffs = new Buffs();
    buffs.add('frenzy', 4);
    buffs.update(3);
    buffs.add('frenzy', 4);
    buffs.update(3);
    expect(buffs.has('frenzy')).toBe(true);
    buffs.update(1.5);
    expect(buffs.has('frenzy')).toBe(false);
  });
});

describe('line of sight', () => {
  it('given a wall between two points, when checking, then sight is blocked and throws stop before it', () => {
    const size = 12;
    const open: GameMap = {
      size,
      seed: 0,
      ground: new Uint8Array(size * size).fill(Ground.Grass),
      obstacle: new Uint8Array(size * size),
      reachable: new Uint8Array(size * size),
      start: { x: 1, y: 1 },
    };
    for (let y = 0; y < size; y++) open.obstacle[tileIndex(open, 6, y)] = Obstacle.Wall;
    const a = { x: 2.5, y: 5.5 };
    const b = { x: 9.5, y: 5.5 };
    expect(hasLineOfSight(open, a, { x: 5.5, y: 2.5 })).toBe(true);
    expect(hasLineOfSight(open, a, b)).toBe(false);
    expect(clampToLineOfSight(open, a, b).x).toBeLessThan(6);
  });
});

describe('laser ammo', () => {
  it('given a laser pickup, when firing all ammo, then it never reloads and falls back to the pistol', () => {
    const arsenal = new Arsenal();
    arsenal.pickup('laser');
    const ammo = arsenal.ammoOf('laser');
    arsenal.tryFire();
    expect(arsenal.reload()).toBe(false);
    let shots = 1;
    for (let i = 0; i < ammo + 10; i++) {
      arsenal.update(0.06);
      if (arsenal.tryFire()?.id === 'laser') shots++;
      if (arsenal.current === 'laser') expect(arsenal.reloading).toBe(false);
    }
    expect(arsenal.usesMagazine('laser')).toBe(false);
    expect(shots).toBe(ammo);
    expect(arsenal.current).toBe('pistol');
  });
});

describe('statLines', () => {
  it('given learned skills, when listing stats, then boosted lines show the new values', () => {
    const tree = new SkillTree();
    tree.points = 3;
    tree.buy('dmg');
    tree.buy('dmg');
    tree.buy('hp');
    const lines = statLines(tree.stats());
    expect(lines.find((l) => l.label === 'Damage')).toMatchObject({ value: '+20%', boosted: true, core: true });
    expect(lines.find((l) => l.label === 'Max HP')).toMatchObject({ value: '120', boosted: true });
    expect(lines.find((l) => l.label === 'Armor')).toMatchObject({ value: '0%', boosted: false });
  });
});

describe('new enemy types', () => {
  const kindsRolled = (round: number, wave: number): Set<ZombieKind> => {
    const seen = new Set<ZombieKind>();
    for (let roll = 0; roll < 1; roll += 0.005) seen.add(zombieKindFor(round, wave, roll));
    return seen;
  };

  it('given the first stages of a run, when waves progress, then special kinds unlock one by one', () => {
    expect([...kindsRolled(1, 1)]).toEqual(['walker']);
    expect([...kindsRolled(1, 2)].sort()).toEqual(['runner', 'walker']);
    expect(kindsRolled(1, 3).has('bat')).toBe(true);
    expect(kindsRolled(1, 3).has('exploder')).toBe(false);
    expect(kindsRolled(2, 1).has('exploder')).toBe(true);
    expect(kindsRolled(2, 1).has('brute')).toBe(false);
    expect(kindsRolled(2, 2).has('brute')).toBe(true);
    expect(kindsRolled(2, 3).has('spitter')).toBe(false);
    expect(kindsRolled(3, 1).has('spitter')).toBe(true);
    expect(kindsRolled(3, 2).has('shield')).toBe(false);
  });

  it('given a newly unlocked kind, when stages pass, then its chance ramps up to the full value', () => {
    const chanceOf = (round: number, wave: number, kind: ZombieKind): number => zombieChances(round, wave).find(([k]) => k === kind)![1];
    expect(chanceOf(1, 2, 'runner')).toBeGreaterThan(0);
    expect(chanceOf(1, 3, 'runner')).toBeGreaterThan(chanceOf(1, 2, 'runner') * 0.99);
    expect(chanceOf(2, 1, 'exploder')).toBeGreaterThan(0);
    expect(chanceOf(3, 1, 'exploder')).toBeGreaterThan(chanceOf(2, 1, 'exploder'));
  });

  it('given round 3 wave 3, when rolling kinds, then every zombie kind can appear', () => {
    expect([...kindsRolled(3, 3)].sort()).toEqual([...ZOMBIE_KINDS].sort());
  });

  it('given a very late round, when summing special chances, then walkers still make up a fifth of the horde', () => {
    const special = zombieChances(20, 3).reduce((sum, [, c]) => sum + c, 0);
    expect(special).toBeLessThanOrEqual(0.8 + 1e-9);
    expect(zombieKindFor(20, 3, 0.95)).toBe('walker');
  });

  it('given a shield facing east, when hit from the front or back, then only the front hit is blocked', () => {
    const face = { x: 1, y: 0 };
    expect(isFrontalHit(face, -1, 0)).toBe(true);
    expect(isFrontalHit(face, -0.7, 0.7)).toBe(true);
    expect(isFrontalHit(face, 1, 0)).toBe(false);
    expect(isFrontalHit(face, 0, 1)).toBe(false);
    expect(isFrontalHit(face, 0, 0)).toBe(false);
  });

  it('given new kinds, when computing XP, then tougher kinds give more than bats', () => {
    for (const kind of ZOMBIE_KINDS) expect(xpForEnemy(kind, 1)).toBeGreaterThan(0);
    expect(xpForEnemy('shield', 1)).toBeGreaterThan(xpForEnemy('walker', 1));
    expect(xpForEnemy('bat', 1)).toBeLessThan(xpForEnemy('walker', 1));
  });

  it('given shield floaters, when formatted, then blocks show a number and a break shows a label', () => {
    expect(formatFloater('block', 11.6)).toBe('12');
    expect(formatFloater('broken', 0)).toBe('SHIELD BROKEN!');
  });
});

describe('skill tooltips', () => {
  it('given every skill, when described, then it has a real explanation beyond the short effect', () => {
    for (const s of SKILLS) {
      expect(s.details.length).toBeGreaterThan(40);
      expect(s.details).not.toBe(s.effect(1));
    }
  });

  it('given a fresh tree, when describing a locked skill, then it shows the unmet requirement and all ranks', () => {
    const tree = new SkillTree();
    const info = describeSkill(tree, 'crit');
    expect(info.status).toBe('locked');
    expect(info.requires).toEqual({ name: 'Hollow Points', rank: 2, met: false });
    expect(info.ranks).toHaveLength(3);
    expect(info.ranks[0]).toMatchObject({ rank: 1, owned: false, next: true });
  });

  it('given points spent, when describing, then owned ranks, next rank and unlocks follow the tree', () => {
    const tree = new SkillTree();
    tree.points = 3;
    tree.buy('dmg');
    tree.buy('dmg');
    const dmg = describeSkill(tree, 'dmg');
    expect(dmg.status).toBe('learn');
    expect(dmg.ranks.filter((r) => r.owned)).toHaveLength(2);
    expect(dmg.ranks[2].next).toBe(true);
    expect(dmg.unlocks).toEqual(['Deadeye (at rank 2)']);
    expect(describeSkill(tree, 'crit').requires?.met).toBe(true);
    tree.points = 0;
    expect(describeSkill(tree, 'crit').status).toBe('noPoints');
  });
});

describe('ActorSprite facing', () => {
  const textures = (n: number) => Array.from({ length: n }, () => new THREE.Texture());
  const anim: AnimSet = { frames: textures(2), flash: textures(2), framesLeft: textures(2), flashLeft: textures(2), width: 16, height: 20 };

  it('given an actor, when it turns left and back right, then it swaps to mirrored frames and back', () => {
    const actor = new ActorSprite(anim, 1, new THREE.Texture(), new THREE.Object3D());
    actor.update(0.01, 0);
    expect(actor.material.map).toBe(anim.frames[0]);
    actor.setFacing(-1);
    expect(actor.material.map).toBe(anim.framesLeft[0]);
    expect(actor.silhouette).toBe(anim.flashLeft[0]);
    actor.update(0.3, 5);
    expect(actor.material.map).toBe(anim.framesLeft[1]);
    actor.setFacing(1);
    expect(actor.material.map).toBe(anim.frames[1]);
  });

  it('given a left-facing actor, when hit, then the white flash is mirrored too', () => {
    const actor = new ActorSprite(anim, 1, new THREE.Texture(), new THREE.Object3D());
    actor.setFacing(-1);
    actor.flash(0.1);
    actor.update(0.01, 0);
    expect(actor.material.map).toBe(anim.flashLeft[0]);
  });
});

describe('reward cards', () => {
  const noSkills = () => new SkillTree().stats();

  it('given a deck, when offering, then it gives 3 different cards', () => {
    const deck = new PerkDeck();
    const rng = createRng(3);
    for (let i = 0; i < 50; i++) {
      const offer = deck.offer(rng);
      expect(offer).toHaveLength(3);
      expect(new Set(offer).size).toBe(3);
    }
  });

  it('given a card at its stack limit, when offering again, then it is never offered', () => {
    const deck = new PerkDeck();
    while (deck.take('tungsten'));
    expect(deck.count('tungsten')).toBe(PERK_BY_ID.tungsten.maxStacks);
    const rng = createRng(9);
    for (let i = 0; i < 200; i++) expect(deck.offer(rng)).not.toContain('tungsten');
  });

  it('given many offers, when counting rarities, then common cards show up more often than epic ones', () => {
    const deck = new PerkDeck();
    const rng = createRng(21);
    const seen = { common: 0, rare: 0, epic: 0 };
    for (let i = 0; i < 400; i++) for (const id of deck.offer(rng, 1)) seen[PERK_BY_ID[id].rarity]++;
    expect(seen.common).toBeGreaterThan(seen.epic * 2);
    expect(seen.epic).toBeGreaterThan(0);
  });

  it('given owned cards, when applied, then they stack on top of skill stats without changing the input', () => {
    const base = noSkills();
    const deck = new PerkDeck();
    deck.take('heavyRounds');
    deck.take('heavyRounds');
    deck.take('scholar');
    deck.take('bigPockets');
    const out = applyPerks(base, deck.owned);
    expect(out.damageMult).toBeCloseTo(base.damageMult + 0.24);
    expect(out.xpMult).toBeCloseTo(1.2);
    expect(out.grenades).toBe(base.grenades + 1);
    expect(out.mines).toBe(base.mines + 2);
    expect(base.damageMult).toBe(1);
  });

  it('given lots of armor, when applied, then damage taken never drops below 40%', () => {
    const deck = new PerkDeck();
    while (deck.take('armorPlate'));
    const maxedSkills = applyPerks({ ...noSkills(), damageTaken: 0.76 }, deck.owned);
    expect(maxedSkills.damageTaken).toBeCloseTo(0.52);
    expect(applyPerks({ ...noSkills(), damageTaken: 0.45 }, deck.owned).damageTaken).toBeCloseTo(0.4);
  });

  it('given the engineer card without turret skills, when applied, then a tier 1 turret becomes available', () => {
    const deck = new PerkDeck();
    deck.take('engineer');
    const out = applyPerks(noSkills(), deck.owned);
    expect(out.turrets).toBe(1);
    expect(out.turretTier).toBe(1);
  });

  it('given every card, when described, then it has a name and effect text', () => {
    for (const p of PERKS) {
      expect(p.name.length).toBeGreaterThan(2);
      expect(p.text.length).toBeGreaterThan(5);
    }
  });
});
describe('Timers', () => {
  it('given timers, when time passes, then each callback runs once after its delay', () => {
    const timers = new Timers();
    const calls: string[] = [];
    timers.after(0.5, () => calls.push('a'));
    timers.after(1, () => calls.push('b'));
    timers.update(0.4);
    expect(calls).toEqual([]);
    timers.update(0.2);
    expect(calls).toEqual(['a']);
    timers.update(1);
    timers.update(1);
    expect(calls).toEqual(['a', 'b']);
  });

  it('given a callback that schedules another timer, when it runs, then the new timer is kept (chain reactions)', () => {
    const timers = new Timers();
    const calls: number[] = [];
    timers.after(0.1, () => {
      calls.push(1);
      timers.after(0.1, () => calls.push(2));
    });
    timers.update(0.2);
    expect(timers.pending).toBe(1);
    timers.update(0.2);
    expect(calls).toEqual([1, 2]);
  });
});

describe('separateEnemies', () => {
  const zombie = (x: number, y: number, kind = 'walker', flying = false) =>
    ({ pos: { x, y }, kind, rising: false, flying, bodyRadius: 0.3, hitRadius: 0.36 }) as unknown as Enemy;
  const hero = { pos: { x: 20, y: 20 }, radius: 0.3, dashing: false };

  it('given two overlapping zombies, when separated, then they are pushed apart equally', () => {
    const map = generateMap(5);
    const tile = findTileInRing(map, createRng(1), map.start.x, map.start.y, 0, 3)!;
    const a = zombie(tile.x + 0.5, tile.y + 0.5);
    const b = zombie(tile.x + 0.6, tile.y + 0.5);
    separateEnemies([a, b], { ...hero, pos: { x: tile.x - 5, y: tile.y - 5 } }, map);
    expect(b.pos.x - a.pos.x).toBeGreaterThan(0.1);
    expect(a.pos.x + b.pos.x).toBeCloseTo(2 * tile.x + 1.1);
  });

  it('given a zombie inside the hero, when separated, then it is pushed out unless the hero dashes', () => {
    const map = generateMap(5);
    const s = map.start;
    const at = { x: s.x + 0.5, y: s.y + 0.5 };
    const z = zombie(at.x + 0.1, at.y);
    separateEnemies([z], { ...hero, pos: at }, map);
    expect(Math.hypot(z.pos.x - at.x, z.pos.y - at.y)).toBeCloseTo(0.66);
    const ghost = zombie(at.x + 0.1, at.y);
    separateEnemies([ghost], { ...hero, pos: at, dashing: true }, map);
    expect(ghost.pos.x).toBeCloseTo(at.x + 0.1);
  });
});
