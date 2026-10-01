import * as THREE from 'three';
import { ActorSprite, createShadow } from '../gfx/actorSprite.ts';
import { type Assets, PX } from '../gfx/assets.ts';
import { screenAngle, screenX, spriteMaterial } from '../gfx/iso.ts';
import type { SoundName } from '../systems/audio.ts';
import { DRONE_GUN, TURRET_GUN, TURRET_ROCKET, type WeaponDef } from '../systems/weapons.ts';
import { hasLineOfSight } from '../world/collision.ts';
import type { GameMap } from '../world/mapGen.ts';
import type { Effects } from './effects.ts';
import type { Enemy } from './enemies.ts';
import { GUN_HEIGHT, type Player } from './player.ts';

const TURRET_RANGE = 9;
const DRONE_RANGE = 8;
const DRONE_ORBIT = 1.4;
const DRONE_HEIGHT = 1.35;
const MAX_TURRETS = 4;
/** Fire rate of each turret tier (1..3). The top tier has twin guns only, no rockets. */
const TURRET_TIER_RATE = [1, 1.25, 1.35] as const;
/** Fire rate of an overloaded turret; the top tier also launches rockets. */
const OVERLOAD_RATE = 1.6;
const OVERLOAD_TINT = 0xff5a4a;
const OVERLOAD_GLOW = 0xff2a10;

export interface DeployWorld {
  readonly map: GameMap;
  readonly enemies: readonly Enemy[];
  readonly player: Player;
  readonly effects: Effects;
  /** Fires a friendly projectile from a turret or drone. */
  deployableShot(def: WeaponDef, origin: { x: number; y: number }, dir: { x: number; y: number }): void;
  sfx(name: SoundName): void;
}

export interface DeployStats {
  turretTier: number;
  turretDamageMult: number;
  turretFireRateMult: number;
}

interface Turret {
  readonly x: number;
  readonly y: number;
  readonly tier: number;
  life: number;
  gunTimer: number;
  rocketTimer: number;
  overloaded: boolean;
  readonly actor: ActorSprite;
}

interface Drone {
  angle: number;
  fireTimer: number;
  readonly sprite: THREE.Sprite;
  readonly material: THREE.SpriteMaterial;
  readonly shadow: THREE.Mesh;
}

function nearestTarget(world: DeployWorld, from: { x: number; y: number }, range: number): Enemy | null {
  let best: Enemy | null = null;
  let bestDist = range;
  for (const e of world.enemies) {
    if (e.dead || e.rising) continue;
    const d = Math.hypot(e.pos.x - from.x, e.pos.y - from.y);
    if (d >= bestDist) continue;
    if (!hasLineOfSight(world.map, from, e.pos)) continue;
    best = e;
    bestDist = d;
  }
  return best;
}

function aimAt(from: { x: number; y: number }, target: Enemy): { x: number; y: number } {
  const dx = target.pos.x - from.x;
  const dy = target.pos.y - from.y;
  const d = Math.hypot(dx, dy) || 1;
  return { x: dx / d, y: dy / d };
}

/** Sentry turrets placed by the hero and combat drones orbiting him. */
export class Deployables {
  private readonly turrets: Turret[] = [];
  private readonly drones: Drone[] = [];
  private readonly scene: THREE.Scene;
  private readonly assets: Assets;

  constructor(scene: THREE.Scene, assets: Assets) {
    this.scene = scene;
    this.assets = assets;
  }

  get turretCount(): number {
    return this.turrets.length;
  }

  get positions(): { x: number; y: number }[] {
    return this.turrets.map((t) => ({ x: t.x, y: t.y }));
  }

  deployTurret(x: number, y: number, tier: number, duration: number): void {
    if (this.turrets.length >= MAX_TURRETS) this.removeTurret(0);
    const clamped = Math.max(1, Math.min(this.assets.turrets.length, tier));
    const actor = new ActorSprite(this.assets.turrets[clamped - 1], 1.05, this.assets.shadow, this.scene);
    actor.setPosition(x, y);
    this.turrets.push({ x, y, tier: clamped, life: duration, gunTimer: 0.4, rocketTimer: 1.2, overloaded: false, actor });
  }

  /** Keeps the number of orbiting drones in sync with the skill rank. */
  setDroneCount(count: number): void {
    while (this.drones.length < count) {
      const material = spriteMaterial(this.assets.drone);
      const sprite = new THREE.Sprite(material);
      sprite.scale.set(12 * PX * 1.1, 7 * PX * 1.1, 1);
      const shadow = createShadow(this.assets.shadow, 0.45);
      this.scene.add(sprite, shadow);
      this.drones.push({ angle: 0, fireTimer: 0.3 * this.drones.length, sprite, material, shadow });
    }
    while (this.drones.length > count) this.removeDrone(this.drones.length - 1);
    this.drones.forEach((d, i) => (d.angle = (i / Math.max(1, count)) * Math.PI * 2));
  }

  /** `overloaded` is the Overdrive skill: it powers up turrets only (red glow, faster fire, top tier rockets). */
  update(dt: number, world: DeployWorld, stats: DeployStats, time: number, overloaded = false): void {
    for (let i = this.turrets.length - 1; i >= 0; i--) {
      const t = this.turrets[i];
      t.life -= dt;
      if (t.life <= 0) {
        world.effects.dust(t.x, t.y);
        world.effects.sparks(t.x, 0.5, t.y, 8, 0x9ae0ff);
        this.removeTurret(i);
        continue;
      }
      this.setOverloaded(t, overloaded);
      this.updateTurret(t, dt, world, stats);
    }
    this.updateDrones(dt, world, stats, time);
  }

  private setOverloaded(t: Turret, overloaded: boolean): void {
    if (t.overloaded === overloaded) return;
    t.overloaded = overloaded;
    t.actor.tint(overloaded ? OVERLOAD_TINT : 0xffffff);
    if (overloaded) t.actor.setAura(OVERLOAD_GLOW);
    else t.actor.clearAura();
  }

  private updateTurret(t: Turret, dt: number, world: DeployWorld, stats: DeployStats): void {
    t.actor.update(dt, 0);
    t.actor.sprite.visible = t.life > 3 || Math.floor(t.life * 8) % 2 === 0;
    t.gunTimer -= dt;
    t.rocketTimer -= dt;
    const origin = { x: t.x, y: t.y };
    const target = nearestTarget(world, origin, TURRET_RANGE);
    if (!target) return;
    const dir = aimAt(origin, target);
    const sx = screenX(dir.x, dir.y);
    if (Math.abs(sx) > 0.05) t.actor.setFacing(sx);
    const muzzle = { x: t.x + dir.x * 0.5, y: t.y + dir.y * 0.5 };
    if (t.gunTimer <= 0) {
      const rate = (t.overloaded ? OVERLOAD_RATE : TURRET_TIER_RATE[t.tier - 1]) * stats.turretFireRateMult;
      t.gunTimer = TURRET_GUN.fireInterval / rate;
      world.deployableShot(TURRET_GUN, muzzle, dir);
      world.effects.muzzleFlash(muzzle.x, GUN_HEIGHT, muzzle.y, screenAngle(dir.x, dir.y));
      world.sfx('turretShot');
    }
    if (t.overloaded && t.tier >= 3 && t.rocketTimer <= 0) {
      t.rocketTimer = TURRET_ROCKET.fireInterval / stats.turretFireRateMult;
      world.deployableShot(TURRET_ROCKET, muzzle, dir);
      world.sfx('rocket');
    }
  }

  private updateDrones(dt: number, world: DeployWorld, stats: DeployStats, time: number): void {
    const p = world.player.pos;
    for (const d of this.drones) {
      d.angle += dt * 1.9;
      const x = p.x + Math.cos(d.angle) * DRONE_ORBIT;
      const y = p.y + Math.sin(d.angle) * DRONE_ORBIT;
      d.sprite.position.set(x, DRONE_HEIGHT + Math.sin(time * 5 + d.angle) * 0.08, y);
      d.shadow.position.set(x, 0.02, y);
      d.fireTimer -= dt;
      if (d.fireTimer > 0) continue;
      const origin = { x, y };
      const target = nearestTarget(world, origin, DRONE_RANGE);
      if (!target) continue;
      d.fireTimer = DRONE_GUN.fireInterval / stats.turretFireRateMult;
      const dir = aimAt(origin, target);
      d.sprite.scale.x = Math.abs(d.sprite.scale.x) * (screenX(dir.x, dir.y) < 0 ? -1 : 1);
      world.deployableShot(DRONE_GUN, origin, dir);
      world.sfx('droneShot');
    }
  }

  private removeTurret(index: number): void {
    this.turrets[index].actor.dispose();
    this.turrets.splice(index, 1);
  }

  private removeDrone(index: number): void {
    const d = this.drones[index];
    d.sprite.removeFromParent();
    d.shadow.removeFromParent();
    d.material.dispose();
    this.drones.splice(index, 1);
  }

  /** Removes turrets (e.g. on a new map). Drones stay with the hero. */
  clearTurrets(): void {
    for (let i = this.turrets.length - 1; i >= 0; i--) this.removeTurret(i);
  }

  clear(): void {
    this.clearTurrets();
    this.setDroneCount(0);
  }
}
