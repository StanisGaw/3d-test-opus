import type * as THREE from 'three';
import { type Assets, PX } from '../gfx/assets.ts';
import { BillboardBatch } from '../gfx/billboards.ts';

const COLLECT_RADIUS = 0.45;
const MAX_SPEED = 16;
const LIFETIME = 45;
const MAX_GEMS = 300;

interface Gem {
  x: number;
  y: number;
  vx: number;
  vy: number;
  value: number;
  age: number;
  attracted: boolean;
  /** 0 small, 1 medium, 2 large crystal. */
  readonly tier: number;
  h: number;
}

const GEM_SIZE = [0.9, 1.1, 1.4] as const;

/** XP crystals dropped by zombies. They fly to the hero once he gets close (magnet radius). */
export class Gems {
  private readonly list: Gem[] = [];
  /** One instanced draw call per crystal size. */
  private readonly batches: BillboardBatch[];
  private attractAll = false;

  constructor(scene: THREE.Scene, assets: Assets) {
    this.batches = assets.gems.map((map) => new BillboardBatch(scene, map, { capacity: MAX_GEMS, alphaTest: 0.5, anchorBottom: true }));
  }

  get count(): number {
    return this.list.length;
  }

  /** Splits `xp` into up to `pieces` crystals that pop out around the position. */
  drop(x: number, y: number, xp: number, pieces = 1): void {
    const n = Math.max(1, Math.min(pieces, xp));
    const value = Math.ceil(xp / n);
    for (let i = 0; i < n; i++) {
      if (this.list.length >= MAX_GEMS) this.merge();
      const tier = value >= 60 ? 2 : value >= 15 ? 1 : 0;
      const a = Math.random() * Math.PI * 2;
      const s = n > 1 ? 2 + Math.random() * 3 : 1 + Math.random();
      this.list.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, value, age: 0, attracted: false, tier, h: 0.12 });
    }
    this.draw();
  }

  /** Pulls every crystal to the hero (end of round). */
  collectAll(): void {
    this.attractAll = true;
  }

  /** Updates crystals; returns XP collected this frame. `onCollect` gets each picked crystal. */
  update(dt: number, px: number, py: number, magnetRadius: number, time: number, onCollect?: (x: number, y: number, value: number) => void): number {
    let collected = 0;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const g = this.list[i];
      g.age += dt;
      const dx = px - g.x;
      const dy = py - g.y;
      const d = Math.hypot(dx, dy);
      if (!g.attracted && g.age > 0.35 && (this.attractAll || d < magnetRadius)) g.attracted = true;
      if (g.attracted) {
        const speed = Math.min(MAX_SPEED, 4 + g.age * 6);
        g.vx = (dx / (d || 1)) * speed;
        g.vy = (dy / (d || 1)) * speed;
      } else {
        const drag = Math.exp(-5 * dt);
        g.vx *= drag;
        g.vy *= drag;
      }
      g.x += g.vx * dt;
      g.y += g.vy * dt;
      if (d < COLLECT_RADIUS && g.age > 0.2) {
        collected += g.value;
        onCollect?.(g.x, g.y, g.value);
        this.remove(i);
        continue;
      }
      if (!g.attracted && g.age > LIFETIME) {
        this.remove(i);
        continue;
      }
      g.h = 0.12 + Math.abs(Math.sin(time * 4 + i)) * 0.12;
    }
    if (this.list.length === 0) this.attractAll = false;
    this.draw();
    return collected;
  }

  private draw(): void {
    for (const b of this.batches) b.begin();
    for (const g of this.list) {
      const size = GEM_SIZE[g.tier];
      this.batches[g.tier].add(g.x, g.h, g.y, 7 * PX * size, 9 * PX * size);
    }
    for (const b of this.batches) b.end();
  }

  /** Keeps the scene light: folds the oldest crystal into the next one. */
  private merge(): void {
    const oldest = this.list[0];
    const next = this.list[1];
    if (next) next.value += oldest.value;
    this.remove(0);
  }

  private remove(index: number): void {
    this.list.splice(index, 1);
  }

  /** Removes all crystals and returns their XP (used when leaving a map). */
  flush(): number {
    let total = 0;
    for (const g of this.list) total += g.value;
    this.clear();
    return total;
  }

  clear(): void {
    this.list.length = 0;
    this.attractAll = false;
    this.draw();
  }
}
