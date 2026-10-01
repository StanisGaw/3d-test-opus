import { describe, expect, it } from 'vitest';
import { COMBO_WINDOW, Combo, comboMultiplier, formatMultiplier } from './systems/combo.ts';
import { ELITE, ELITE_AFFIXES, eliteChance, eliteStats, rollElite } from './systems/elites.ts';
import { isWalkable, generateMap, tileIndex } from './world/mapGen.ts';
import { SPIKE_TIMING, placeProps, spikeState } from './world/props.ts';
import { launchBody, stepBody } from './world/ragdoll.ts';

describe('elite zombies', () => {
  it('given round 1, when rolling, then elites only appear from wave 3 and are rare', () => {
    expect(eliteChance(1, 1)).toBe(0);
    expect(eliteChance(1, 3)).toBeGreaterThan(0);
    expect(eliteChance(2, 1)).toBeGreaterThan(eliteChance(1, 3));
    expect(eliteChance(50, 3)).toBeLessThanOrEqual(0.15);
  });

  it('given a low roll, when rolling for an allowed kind, then it picks an affix; bats never become elite', () => {
    expect(rollElite('walker', 3, 1, 0, 0)).toBe(ELITE_AFFIXES[0]);
    expect(rollElite('walker', 3, 1, 0, 0.99)).toBe(ELITE_AFFIXES[ELITE_AFFIXES.length - 1]);
    expect(rollElite('walker', 3, 1, 0.99, 0)).toBeNull();
    expect(rollElite('bat', 9, 3, 0, 0)).toBeNull();
    expect(rollElite('exploder', 9, 3, 0, 0)).toBeNull();
  });

  it('given base stats, when made elite, then HP, size and score grow; swift ones are faster', () => {
    const base = { hp: 30, speed: 2, scale: 1, score: 10, damage: 5 };
    const armored = eliteStats(base, 'armored');
    expect(armored.hp).toBe(Math.round(30 * ELITE.hp));
    expect(armored.scale).toBeCloseTo(ELITE.scale);
    expect(armored.score).toBe(10 * ELITE.score);
    expect(armored.damage).toBe(5);
    expect(eliteStats(base, 'swift').speed).toBeGreaterThan(armored.speed);
  });
});

describe('map traps', () => {
  it('given a seed, when placing traps twice, then the layout is identical (continued runs match)', () => {
    const map = generateMap(77);
    expect(placeProps(map)).toEqual(placeProps(map));
  });

  it('given a map, when placing traps, then all are on free reachable tiles away from the start and never overlap', () => {
    for (const seed of [1, 2, 3, 4]) {
      const map = generateMap(seed);
      const { barrels, spikes } = placeProps(map);
      expect(barrels.length).toBeGreaterThan(3);
      expect(spikes.length).toBeGreaterThan(3);
      const used = new Set<number>();
      const tiles = [...barrels.map((b) => ({ x: Math.floor(b.x), y: Math.floor(b.y) })), ...spikes];
      for (const t of tiles) {
        expect(isWalkable(map, t.x, t.y)).toBe(true);
        expect(map.reachable[tileIndex(map, t.x, t.y)]).toBe(1);
        expect(Math.hypot(t.x - map.start.x, t.y - map.start.y)).toBeGreaterThanOrEqual(6);
        const i = tileIndex(map, t.x, t.y);
        expect(used.has(i)).toBe(false);
        used.add(i);
      }
    }
  });

  it('given the spike cycle, when time passes, then spikes warn, rise and go down again', () => {
    const { cycle, up, warn } = SPIKE_TIMING;
    expect(spikeState(0.1, 0)).toBe('up');
    expect(spikeState(up + 0.1, 0)).toBe('down');
    expect(spikeState(cycle - warn / 2, 0)).toBe('warn');
    expect(spikeState(cycle + 0.1, 0)).toBe('up');
    expect(spikeState(0.1, cycle / 2)).toBe('down');
  });
});

describe('ragdoll', () => {
  it('given a blast, when a body is thrown, then it flies away, bounces and comes to rest on the ground', () => {
    const b = launchBody(10, 10, 1, 0, 1);
    let maxH = 0;
    for (let i = 0; i < 300 && !b.resting; i++) {
      stepBody(b, 1 / 60);
      maxH = Math.max(maxH, b.h);
    }
    expect(b.resting).toBe(true);
    expect(b.h).toBe(0);
    expect(maxH).toBeGreaterThan(0.5);
    expect(b.x).toBeGreaterThan(12);
    expect(Math.abs(b.y - 10)).toBeLessThan(1e-9);
    expect(b.bounces).toBeGreaterThan(0);
  });

  it('given a weak blast, when thrown, then the body flies less far', () => {
    const run = (power: number) => {
      const b = launchBody(0, 0, 0, 1, power);
      for (let i = 0; i < 300 && !b.resting; i++) stepBody(b, 1 / 60);
      return b.y;
    };
    expect(run(0.1)).toBeLessThan(run(1));
  });
});

describe('combo', () => {
  it('given kills, when counted, then every 10 kills raise the multiplier up to x3', () => {
    expect(comboMultiplier(9)).toBe(1);
    expect(comboMultiplier(10)).toBe(1.25);
    expect(comboMultiplier(20)).toBe(1.5);
    expect(comboMultiplier(500)).toBe(3);
    expect(formatMultiplier(1.25)).toBe('1.25');
    expect(formatMultiplier(1.5)).toBe('1.5');
    expect(formatMultiplier(2)).toBe('2');
  });

  it('given a streak, when the 10th kill lands, then add() reports the new step', () => {
    const c = new Combo();
    const steps = Array.from({ length: 20 }, () => c.add());
    expect(steps.filter(Boolean)).toHaveLength(2);
    expect(steps[9]).toBe(true);
    expect(c.best).toBe(20);
  });

  it('given no kills for the whole window, when time passes, then the combo ends and reports its length', () => {
    const c = new Combo();
    for (let i = 0; i < 12; i++) c.add();
    expect(c.update(COMBO_WINDOW / 2)).toBe(0);
    expect(c.active).toBe(true);
    expect(c.update(COMBO_WINDOW)).toBe(12);
    expect(c.count).toBe(0);
    expect(c.best).toBe(12);
  });

  it('given a hit on the hero, when it lands, then the combo is halved', () => {
    const c = new Combo();
    for (let i = 0; i < 25; i++) c.add();
    c.hurt();
    expect(c.count).toBe(12);
    expect(c.multiplier).toBe(1.25);
  });
});
