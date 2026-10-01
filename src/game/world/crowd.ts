import type { Enemy } from '../entities/enemies.ts';
import { pushOut } from './collision.ts';
import type { GameMap } from './mapGen.ts';

interface Hero {
  readonly pos: { x: number; y: number };
  readonly radius: number;
  readonly dashing: boolean;
}

/**
 * Pushes overlapping enemies apart (the boss barely moves) and keeps them out of the hero,
 * except while he dashes through them. Walkers are then pushed out of walls; flyers are not.
 */
export function separateEnemies(list: readonly Enemy[], hero: Hero, map: GameMap): void {
  for (let i = 0; i < list.length; i++) {
    const a = list[i];
    if (a.rising) continue;
    for (let j = i + 1; j < list.length; j++) {
      const b = list[j];
      if (b.rising) continue;
      const dx = b.pos.x - a.pos.x;
      const dy = b.pos.y - a.pos.y;
      const min = a.bodyRadius + b.bodyRadius + 0.1;
      const distSq = dx * dx + dy * dy;
      if (distSq >= min * min || distSq < 1e-6) continue;
      const dist = Math.sqrt(distSq);
      const push = (min - dist) / 2;
      const aw = a.kind === 'boss' ? 0.1 : b.kind === 'boss' ? 1.9 : 1;
      a.pos.x -= (dx / dist) * push * aw;
      a.pos.y -= (dy / dist) * push * aw;
      b.pos.x += (dx / dist) * push * (2 - aw);
      b.pos.y += (dy / dist) * push * (2 - aw);
    }
    const px = a.pos.x - hero.pos.x;
    const py = a.pos.y - hero.pos.y;
    const pd = Math.hypot(px, py);
    const pmin = a.hitRadius + hero.radius;
    if (pd < pmin && pd > 1e-4 && !hero.dashing) {
      a.pos.x += (px / pd) * (pmin - pd);
      a.pos.y += (py / pd) * (pmin - pd);
    }
    if (!a.flying) pushOut(map, a.pos, a.bodyRadius);
  }
}
