import type * as THREE from 'three';
import type { Assets } from '../gfx/assets.ts';
import { BillboardBatch } from '../gfx/billboards.ts';
import { screenAngle } from '../gfx/iso.ts';
import type { ProjectileKind, WeaponDef } from '../systems/weapons.ts';
import { type GameMap, blocksShot } from '../world/mapGen.ts';
import type { Effects } from './effects.ts';
import type { Enemy } from './enemies.ts';
import { GUN_HEIGHT, type Player } from './player.ts';

interface Projectile {
  kind: ProjectileKind | 'bile';
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  damage: number;
  radius: number;
  /** Drawn size (the rocket sprite is twice as wide as it is tall). */
  size: number;
  /** Height above the ground where it is drawn. */
  height: number;
  /** Screen rotation of the sprite. */
  angle: number;
  /** 1 = full colour; flames fade out by getting darker (they are drawn additively). */
  brightness: number;
  hostile: boolean;
  /** Enemies already damaged by a piercing projectile. */
  hits: Set<Enemy> | null;
  pierceLeft: number;
  source: DamageSource;
  trail: number;
}

/** Who dealt the damage; only the hero's own shots can crit or ignite. */
export type DamageSource = 'shot' | 'turret' | 'explosion' | 'burn' | 'trap';

export interface ShotMods {
  damageMult: number;
  pierce: number;
  source: DamageSource;
}

const DEFAULT_MODS: ShotMods = { damageMult: 1, pierce: 0, source: 'shot' };

export interface ShotWorld {
  readonly map: GameMap;
  readonly enemies: readonly Enemy[];
  readonly player: Player;
  readonly effects: Effects;
  damageEnemy(enemy: Enemy, amount: number, dirX: number, dirY: number, knock: number, source?: DamageSource, blockable?: boolean): void;
  explode(x: number, y: number, radius: number, damage: number): void;
  hurtPlayer(amount: number, fromX: number, fromY: number): void;
  /** Damages a barrel at the position; returns true when a barrel was hit. */
  hitBarrel(x: number, y: number, radius: number, damage: number): boolean;
}

const KNOCKBACK: Record<ProjectileKind | 'bile', number> = { bullet: 2.5, pellet: 3.5, rocket: 0, flame: 0.6, beam: 0.8, bile: 0 };

type DrawnKind = Exclude<ProjectileKind, 'beam'> | 'bile';

/** Enough for heavy fire from the hero, turrets and drones together; extra shots still fly, they are just not drawn. */
const BATCH_CAPACITY = 512;

export class Projectiles {
  private readonly list: Projectile[] = [];
  /** One instanced draw call per projectile look instead of one sprite each. */
  private readonly batches: Record<DrawnKind, BillboardBatch>;

  constructor(scene: THREE.Scene, assets: Assets) {
    const batch = (texture: THREE.Texture, additive: boolean) => new BillboardBatch(scene, texture, { capacity: BATCH_CAPACITY, additive, renderOrder: 6 });
    this.batches = {
      bullet: batch(assets.bullet, true),
      pellet: batch(assets.pellet, true),
      flame: batch(assets.flame, true),
      rocket: batch(assets.rocket, false),
      bile: batch(assets.bile, false),
    };
  }

  get count(): number {
    return this.list.length;
  }

  private spawn(p: Omit<Projectile, 'maxLife' | 'trail' | 'height' | 'angle' | 'brightness'>): void {
    this.list.push({ ...p, maxLife: p.life, trail: 0, height: p.hostile ? 0.6 : GUN_HEIGHT, angle: screenAngle(p.vx, p.vy), brightness: 1 });
  }

  /** Rebuilds the instanced batches from the live projectiles. */
  private draw(): void {
    for (const b of Object.values(this.batches)) b.begin();
    for (const p of this.list) {
      if (p.kind === 'beam') continue;
      const width = p.kind === 'rocket' ? p.size * 2 : p.size;
      this.batches[p.kind].add(p.x, p.height, p.y, width, p.size, p.angle, p.brightness);
    }
    for (const b of Object.values(this.batches)) b.end();
  }

  fire(def: WeaponDef, origin: { x: number; y: number }, dir: { x: number; y: number }, mods: ShotMods = DEFAULT_MODS): void {
    const base = Math.atan2(dir.y, dir.x);
    for (let i = 0; i < def.pellets; i++) {
      const spread = def.pellets > 1 ? (i / (def.pellets - 1) - 0.5) * def.spread + (Math.random() - 0.5) * 0.08 : (Math.random() - 0.5) * def.spread;
      const a = base + spread;
      const speed = def.speed * (def.pellets > 1 ? 0.85 + Math.random() * 0.3 : 1);
      const size = def.projectile === 'flame' ? 0.35 : def.projectile === 'rocket' ? 0.28 : def.projectile === 'pellet' ? 0.16 : 0.2;
      this.spawn({
        kind: def.projectile,
        x: origin.x,
        y: origin.y,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed,
        life: def.lifetime * (def.projectile === 'flame' ? 0.8 + Math.random() * 0.4 : 1),
        damage: def.damage * mods.damageMult,
        radius: def.projectile === 'flame' ? 0.35 : def.projectile === 'rocket' ? 0.3 : 0.12,
        hostile: false,
        hits: def.projectile === 'flame' || mods.pierce > 0 ? new Set() : null,
        pierceLeft: def.projectile === 'bullet' || def.projectile === 'pellet' ? mods.pierce : 0,
        source: mods.source,
        size,
      });
    }
  }

  bile(x: number, y: number, dirX: number, dirY: number, speed: number, damage = 12): void {
    this.spawn({ kind: 'bile', x, y, vx: dirX * speed, vy: dirY * speed, life: 3, damage, radius: 0.22, size: 0.42, hostile: true, hits: null, pierceLeft: 0, source: 'shot' });
  }

  private remove(index: number): void {
    this.list.splice(index, 1);
  }

  private homeRocket(p: Projectile, enemies: readonly Enemy[], dt: number): void {
    let best: Enemy | null = null;
    let bestScore = Infinity;
    const speed = Math.hypot(p.vx, p.vy);
    for (const e of enemies) {
      if (e.dead) continue;
      const dx = e.pos.x - p.x;
      const dy = e.pos.y - p.y;
      const dist = Math.hypot(dx, dy);
      if (dist > 11) continue;
      const cos = (dx * p.vx + dy * p.vy) / (dist * speed || 1);
      if (cos < 0.55) continue;
      const score = dist * (2 - cos);
      if (score < bestScore) {
        bestScore = score;
        best = e;
      }
    }
    if (!best) return;
    const current = Math.atan2(p.vy, p.vx);
    const wanted = Math.atan2(best.pos.y - p.y, best.pos.x - p.x);
    let delta = wanted - current;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    const turn = Math.max(-3.2 * dt, Math.min(3.2 * dt, delta));
    const next = current + turn;
    p.vx = Math.cos(next) * speed;
    p.vy = Math.sin(next) * speed;
  }

  update(dt: number, world: ShotWorld): void {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      p.life -= dt;
      if (p.kind === 'rocket') {
        this.homeRocket(p, world.enemies, dt);
        p.angle = screenAngle(p.vx, p.vy);
        p.trail -= dt;
        if (p.trail <= 0) {
          p.trail = 0.03;
          world.effects.smoke(p.x, GUN_HEIGHT, p.y);
        }
      }
      if (p.kind === 'flame') {
        const drag = Math.exp(-2.5 * dt);
        p.vx *= drag;
        p.vy *= drag;
        const t = 1 - p.life / p.maxLife;
        p.size = 0.35 + t * 0.9;
        p.brightness = 1 - t * 0.8;
        p.height = GUN_HEIGHT + t * 0.5;
      }

      if (this.step(p, dt, world) || p.life <= 0) {
        if (p.kind === 'rocket') world.explode(p.x, p.y, 2.6, p.damage);
        this.remove(i);
      }
    }
    this.draw();
  }

  /** Moves a projectile with sub-steps. Returns true when it should be destroyed. */
  private step(p: Projectile, dt: number, world: ShotWorld): boolean {
    const distance = Math.hypot(p.vx, p.vy) * dt;
    const steps = Math.max(1, Math.ceil(distance / 0.25));
    for (let s = 0; s < steps; s++) {
      p.x += (p.vx * dt) / steps;
      p.y += (p.vy * dt) / steps;
      if (blocksShot(world.map, Math.floor(p.x), Math.floor(p.y))) {
        if (p.kind === 'bullet' || p.kind === 'pellet') world.effects.sparks(p.x, GUN_HEIGHT, p.y, 3);
        if (p.kind === 'bile') world.effects.sparks(p.x, 0.6, p.y, 5, 0x90ff60);
        return true;
      }
      if (p.hostile) {
        const pl = world.player;
        if (Math.hypot(pl.pos.x - p.x, pl.pos.y - p.y) < p.radius + pl.radius) {
          world.hurtPlayer(p.damage, p.x - p.vx, p.y - p.vy);
          world.effects.sparks(p.x, 0.6, p.y, 8, 0x90ff60);
          return true;
        }
        continue;
      }
      if (world.hitBarrel(p.x, p.y, p.radius, p.damage)) {
        world.effects.sparks(p.x, GUN_HEIGHT, p.y, 3, 0xffa040);
        return true;
      }
      for (const e of world.enemies) {
        if (e.dead || p.hits?.has(e)) continue;
        if (Math.hypot(e.pos.x - p.x, e.pos.y - p.y) > e.hitRadius + p.radius) continue;
        if (p.kind === 'rocket') return true;
        const speed = Math.hypot(p.vx, p.vy) || 1;
        const blocked = p.kind !== 'flame' && e.blocks(p.vx / speed, p.vy / speed);
        // Fire licks around riot shields; bullets and pellets do not.
        world.damageEnemy(e, p.damage, p.vx / speed, p.vy / speed, KNOCKBACK[p.kind], p.source, p.kind !== 'flame');
        if (blocked) return true;
        if (p.kind === 'flame' && p.hits) {
          p.hits.add(e);
          continue;
        }
        if (p.pierceLeft > 0 && p.hits) {
          p.pierceLeft--;
          p.hits.add(e);
          continue;
        }
        return true;
      }
    }
    return false;
  }

  clear(): void {
    this.list.length = 0;
    this.draw();
  }
}
