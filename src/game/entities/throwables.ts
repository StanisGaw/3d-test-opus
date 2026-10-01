import * as THREE from 'three';
import { createShadow } from '../gfx/actorSprite.ts';
import { type Assets, PX } from '../gfx/assets.ts';
import { spriteMaterial } from '../gfx/iso.ts';
import type { SoundName } from '../systems/audio.ts';
import { clampToLineOfSight } from '../world/collision.ts';
import type { GameMap } from '../world/mapGen.ts';
import type { Enemy } from './enemies.ts';

export const GRENADE_RANGE = 8;
const GRENADE_FLIGHT = 0.7;
const GRENADE_ARC = 1.8;
const BOMBLET_FLIGHT = 0.4;
const MINE_ARM_TIME = 0.8;
const MINE_TRIGGER = 1.0;
const MAX_MINES = 10;

export const GRENADE_BLAST = { radius: 2.8, damage: 90 };
export const BOMBLET_BLAST = { radius: 1.7, damage: 40 };
export const MINE_BLAST = { radius: 2.4, damage: 120 };

export interface ThrowWorld {
  readonly map: GameMap;
  readonly enemies: readonly Enemy[];
  explode(x: number, y: number, radius: number, damage: number): void;
  sfx(name: SoundName): void;
}

interface Thrown {
  readonly fromX: number;
  readonly fromY: number;
  readonly toX: number;
  readonly toY: number;
  readonly flight: number;
  readonly arc: number;
  t: number;
  readonly bomblet: boolean;
  readonly cluster: boolean;
  readonly sprite: THREE.Sprite;
  readonly material: THREE.SpriteMaterial;
  readonly shadow: THREE.Mesh;
}

interface Mine {
  readonly x: number;
  readonly y: number;
  arm: number;
  blink: number;
  readonly sprite: THREE.Sprite;
  readonly material: THREE.SpriteMaterial;
}

/** Hand grenades (optionally splitting into cluster bomblets) and proximity mines. */
export class Throwables {
  private readonly thrown: Thrown[] = [];
  private readonly mines: Mine[] = [];
  private readonly scene: THREE.Scene;
  private readonly assets: Assets;

  constructor(scene: THREE.Scene, assets: Assets) {
    this.scene = scene;
    this.assets = assets;
  }

  get minePositions(): { x: number; y: number }[] {
    return this.mines.map((m) => ({ x: m.x, y: m.y }));
  }

  private launch(map: GameMap, from: { x: number; y: number }, to: { x: number; y: number }, bomblet: boolean, cluster: boolean): void {
    const landing = clampToLineOfSight(map, from, to);
    const material = spriteMaterial(this.assets.grenade);
    const sprite = new THREE.Sprite(material);
    const size = bomblet ? 0.7 : 1;
    sprite.scale.set(6 * PX * size, 7 * PX * size, 1);
    const shadow = createShadow(this.assets.shadow, 0.3 * size);
    this.scene.add(sprite, shadow);
    this.thrown.push({
      fromX: from.x,
      fromY: from.y,
      toX: landing.x,
      toY: landing.y,
      flight: bomblet ? BOMBLET_FLIGHT : GRENADE_FLIGHT,
      arc: bomblet ? 0.8 : GRENADE_ARC,
      t: 0,
      bomblet,
      cluster,
      sprite,
      material,
      shadow,
    });
  }

  /** Throws a grenade towards the target, limited to GRENADE_RANGE. */
  throwGrenade(map: GameMap, from: { x: number; y: number }, target: { x: number; y: number }, cluster: boolean): void {
    const dx = target.x - from.x;
    const dy = target.y - from.y;
    const d = Math.hypot(dx, dy);
    const k = d > GRENADE_RANGE ? GRENADE_RANGE / d : 1;
    this.launch(map, from, { x: from.x + dx * k, y: from.y + dy * k }, false, cluster);
  }

  placeMine(x: number, y: number): void {
    if (this.mines.length >= MAX_MINES) this.removeMine(0);
    const material = spriteMaterial(this.assets.mine[1]);
    const sprite = new THREE.Sprite(material);
    sprite.center.set(0.5, 0);
    sprite.scale.set(10 * PX * 1.1, 4 * PX * 1.1, 1);
    sprite.position.set(x, 0.02, y);
    this.scene.add(sprite);
    this.mines.push({ x, y, arm: MINE_ARM_TIME, blink: 0, sprite, material });
  }

  update(dt: number, world: ThrowWorld): void {
    for (let i = this.thrown.length - 1; i >= 0; i--) {
      const g = this.thrown[i];
      g.t += dt;
      const t = Math.min(1, g.t / g.flight);
      const x = g.fromX + (g.toX - g.fromX) * t;
      const y = g.fromY + (g.toY - g.fromY) * t;
      g.sprite.position.set(x, 0.3 + 4 * g.arc * t * (1 - t), y);
      g.material.rotation = -t * Math.PI * 4;
      g.shadow.position.set(x, 0.02, y);
      if (t < 1) continue;
      this.removeThrown(i);
      const blast = g.bomblet ? BOMBLET_BLAST : GRENADE_BLAST;
      world.explode(g.toX, g.toY, blast.radius, blast.damage);
      if (g.cluster) {
        for (let b = 0; b < 4; b++) {
          const a = (b / 4) * Math.PI * 2 + Math.random() * 0.8;
          const r = 1.6 + Math.random() * 1.1;
          this.launch(world.map, { x: g.toX, y: g.toY }, { x: g.toX + Math.cos(a) * r, y: g.toY + Math.sin(a) * r }, true, false);
        }
      }
    }

    for (let i = this.mines.length - 1; i >= 0; i--) {
      const m = this.mines[i];
      if (m.arm > 0) {
        m.arm -= dt;
        if (m.arm <= 0) world.sfx('mineArm');
        continue;
      }
      m.blink += dt;
      m.material.map = this.assets.mine[Math.floor(m.blink * 3) % 2 === 0 ? 0 : 1];
      const triggered = world.enemies.some((e) => !e.dead && !e.rising && !e.flying && Math.hypot(e.pos.x - m.x, e.pos.y - m.y) < MINE_TRIGGER + e.hitRadius * 0.5);
      if (!triggered) continue;
      this.removeMine(i);
      world.explode(m.x, m.y, MINE_BLAST.radius, MINE_BLAST.damage);
    }
  }

  private removeThrown(index: number): void {
    const g = this.thrown[index];
    g.sprite.removeFromParent();
    g.shadow.removeFromParent();
    g.material.dispose();
    this.thrown.splice(index, 1);
  }

  private removeMine(index: number): void {
    const m = this.mines[index];
    m.sprite.removeFromParent();
    m.material.dispose();
    this.mines.splice(index, 1);
  }

  clear(): void {
    for (let i = this.thrown.length - 1; i >= 0; i--) this.removeThrown(i);
    for (let i = this.mines.length - 1; i >= 0; i--) this.removeMine(i);
  }
}
