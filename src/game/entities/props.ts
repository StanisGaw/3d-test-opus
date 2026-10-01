import * as THREE from 'three';
import { ActorSprite } from '../gfx/actorSprite.ts';
import type { Assets } from '../gfx/assets.ts';
import type { SoundName } from '../systems/audio.ts';
import type { GameMap } from '../world/mapGen.ts';
import { type PropLayout, type SpikeState, spikeState } from '../world/props.ts';
import type { Enemy } from './enemies.ts';
import type { Player } from './player.ts';

export const BARREL = { hp: 30, radius: 0.34, blastRadius: 2.5, enemyDamage: 60, heroDamage: 22 } as const;
export const SPIKES = { enemyDamage: 35, heroDamage: 10, hearRange: 10 } as const;

export interface Barrel {
  readonly x: number;
  readonly y: number;
  hp: number;
  exploded: boolean;
  damaged: boolean;
  readonly actor: ActorSprite;
}

interface SpikeTrap {
  readonly x: number;
  readonly y: number;
  readonly phase: number;
  readonly mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  state: SpikeState;
  /** Things already hurt during the current activation. */
  readonly hit: Set<object>;
}

export interface PropWorld {
  readonly enemies: readonly Enemy[];
  readonly player: Player;
  readonly round: number;
  barrelExploded(x: number, y: number): void;
  spikeEnemy(enemy: Enemy, damage: number): void;
  spikeHero(damage: number, x: number, y: number): void;
  sfx(name: SoundName): void;
}

const spikeGeometry = new THREE.PlaneGeometry(0.92, 0.92).rotateX(-Math.PI / 2);
const HERO_KEY = {};

/** Explosive barrels and spike traps placed on the map. */
export class Props {
  private barrels: Barrel[] = [];
  private spikes: SpikeTrap[] = [];
  private readonly scene: THREE.Scene;
  private readonly assets: Assets;

  constructor(scene: THREE.Scene, assets: Assets) {
    this.scene = scene;
    this.assets = assets;
  }

  get liveBarrels(): readonly Barrel[] {
    return this.barrels.filter((b) => !b.exploded);
  }

  load(_map: GameMap, layout: PropLayout): void {
    this.clear();
    for (const p of layout.barrels) {
      const actor = new ActorSprite(this.assets.barrel[0], 1.1, this.assets.shadow, this.scene);
      actor.setPosition(p.x, p.y);
      actor.update(0, 0);
      this.barrels.push({ x: p.x, y: p.y, hp: BARREL.hp, exploded: false, damaged: false, actor });
    }
    for (const s of layout.spikes) {
      const material = new THREE.MeshBasicMaterial({ map: this.assets.spikes[0], transparent: true, depthWrite: false });
      const mesh = new THREE.Mesh(spikeGeometry, material);
      mesh.position.set(s.x + 0.5, 0.012, s.y + 0.5);
      mesh.renderOrder = 0;
      this.scene.add(mesh);
      this.spikes.push({ x: s.x, y: s.y, phase: s.phase, mesh, state: 'down', hit: new Set() });
    }
  }

  /** The barrel a projectile at (x, y) touches, if any. */
  barrelAt(x: number, y: number, radius: number): Barrel | null {
    for (const b of this.barrels) {
      if (!b.exploded && Math.hypot(b.x - x, b.y - y) < BARREL.radius + radius) return b;
    }
    return null;
  }

  barrelsNear(x: number, y: number, radius: number): Barrel[] {
    return this.barrels.filter((b) => !b.exploded && Math.hypot(b.x - x, b.y - y) < radius + BARREL.radius);
  }

  /** Damages a barrel; at 0 HP it explodes through `world.barrelExploded`. */
  damageBarrel(b: Barrel, amount: number, world: PropWorld): void {
    if (b.exploded) return;
    b.hp -= amount;
    b.actor.flash(0.06);
    if (b.hp > BARREL.hp / 2) world.sfx('barrel');
    if (b.hp > 0) return;
    b.exploded = true;
    b.actor.dispose();
    world.barrelExploded(b.x, b.y);
  }

  /** Keeps a walking circle outside every barrel. */
  pushOut(pos: { x: number; y: number }, radius: number): void {
    for (const b of this.barrels) {
      if (b.exploded) continue;
      const dx = pos.x - b.x;
      const dy = pos.y - b.y;
      const d = Math.hypot(dx, dy);
      const min = radius + BARREL.radius;
      if (d >= min) continue;
      const nx = d > 1e-4 ? dx / d : 1;
      const ny = d > 1e-4 ? dy / d : 0;
      pos.x = b.x + nx * min;
      pos.y = b.y + ny * min;
    }
  }

  update(dt: number, time: number, world: PropWorld): void {
    for (const b of this.barrels) {
      if (b.exploded) continue;
      if (!b.damaged && b.hp <= BARREL.hp / 2) {
        b.damaged = true;
        b.actor.setAnim(this.assets.barrel[1]);
      }
      b.actor.update(dt, 0);
    }
    const hero = world.player;
    const scale = 1 + 0.2 * (world.round - 1);
    for (const s of this.spikes) {
      const state = spikeState(time, s.phase);
      if (state !== s.state) {
        s.mesh.material.map = this.assets.spikes[state === 'down' ? 0 : state === 'warn' ? 1 : 2];
        if (state === 'up' && Math.hypot(hero.pos.x - s.x - 0.5, hero.pos.y - s.y - 0.5) < SPIKES.hearRange) world.sfx('spikes');
        if (state !== 'up') s.hit.clear();
        s.state = state;
      }
      if (state !== 'up') continue;
      for (const e of world.enemies) {
        if (e.dead || e.rising || e.flying || s.hit.has(e) || !onTile(e.pos, s)) continue;
        s.hit.add(e);
        world.spikeEnemy(e, SPIKES.enemyDamage * scale);
      }
      if (!s.hit.has(HERO_KEY) && !hero.dashing && onTile(hero.pos, s)) {
        s.hit.add(HERO_KEY);
        world.spikeHero(SPIKES.heroDamage, s.x + 0.5, s.y + 0.5);
      }
    }
  }

  clear(): void {
    for (const b of this.barrels) if (!b.exploded) b.actor.dispose();
    for (const s of this.spikes) {
      s.mesh.removeFromParent();
      s.mesh.material.dispose();
    }
    this.barrels = [];
    this.spikes = [];
  }
}

const onTile = (p: { x: number; y: number }, t: { x: number; y: number }): boolean => Math.floor(p.x) === t.x && Math.floor(p.y) === t.y;
