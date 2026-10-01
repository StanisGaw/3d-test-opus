import { describe, expect, it } from 'vitest';
import { ZOMBIE_STATS } from './entities/enemies.ts';
import { BESTIARY } from './systems/bestiary.ts';
import { ZOMBIE_KINDS } from './systems/waveDirector.ts';
import { attackPose } from './ui/bestiaryView.ts';

describe('bestiary', () => {
  it('given every zombie kind, when listing entries, then each kind and the boss has one with an attack', () => {
    for (const kind of [...ZOMBIE_KINDS, 'boss'] as const) {
      const entry = BESTIARY.find((e) => e.id === kind);
      expect(entry, kind).toBeDefined();
      expect(entry?.attacks.length).toBeGreaterThan(0);
    }
  });

  it('given a zombie, when reading its stats, then the HP shown matches the game data', () => {
    const walker = BESTIARY.find((e) => e.id === 'walker');
    expect(walker?.stats[0][1]).toBe(String(ZOMBIE_STATS.walker.hp));
  });

  it('given a charge attack, when time advances, then the monster moves forward', () => {
    expect(attackPose('charge', 1.4).dx).toBeGreaterThan(attackPose('charge', 0.1).dx);
  });
});
