import type * as THREE from 'three';
import { Deployables, type DeployWorld } from '../entities/deployables.ts';
import type { Boss, Enemy, EnemyWorld } from '../entities/enemies.ts';
import { Crates } from '../entities/crates.ts';
import { Effects } from '../entities/effects.ts';
import { Gems } from '../entities/gems.ts';
import { Player } from '../entities/player.ts';
import { Props, type PropWorld } from '../entities/props.ts';
import { type DamageSource, Projectiles, type ShotWorld } from '../entities/projectiles.ts';
import { Throwables, type ThrowWorld } from '../entities/throwables.ts';
import type { Assets } from '../gfx/assets.ts';
import { Abilities } from '../play/abilities.ts';
import { Combat } from '../play/combat.ts';
import { HeroBuild } from '../play/heroBuild.ts';
import { Meta } from '../play/meta.ts';
import { Spawner } from '../play/spawner.ts';
import type { SoundName, Sfx } from '../systems/audio.ts';
import { Combo } from '../systems/combo.ts';
import type { PlayerStats } from '../systems/skillTree.ts';
import type { KeyValueStore } from '../systems/storage.ts';
import { WaveDirector } from '../systems/waveDirector.ts';
import { Arsenal, type WeaponDef } from '../systems/weapons.ts';
import type { FloatingText } from '../ui/floatingText.ts';
import type { Hud } from '../ui/hud.ts';
import type { FlowField } from '../world/flowField.ts';
import type { GameMap } from '../world/mapGen.ts';
import { createRng } from '../world/random.ts';
import type { Stage } from './stage.ts';
import { Timers } from './timers.ts';

export type GameState = 'title' | 'playing' | 'paused' | 'skills' | 'cards' | 'gameover';

/** Screen-level transitions owned by the Game; gameplay code asks for them through this interface. */
export interface GameFlow {
  gameOver(): void;
  offerCards(): void;
  loadMap(seed: number): void;
  /** Saves the run so it can be continued right before `nextWave` (4 = the boss). */
  checkpoint(nextWave: number): void;
  /** Gamepad vibration; does nothing without a pad. */
  rumble(strength: number, ms: number): void;
}

export interface RunStats {
  score: number;
  kills: number;
  bossesDefeated: number;
}

export interface ContextParts {
  readonly stage: Stage;
  readonly assets: Assets;
  readonly hud: Hud;
  readonly floaters: FloatingText;
  readonly audio: Sfx;
  readonly flow: GameFlow;
  readonly store: KeyValueStore;
}

/**
 * Everything one run of the game shares: the world, the entities, the hero build and the
 * gameplay systems. Entities talk to the game through the small world interfaces it implements.
 */
export class GameContext implements EnemyWorld, ShotWorld, DeployWorld, ThrowWorld, PropWorld {
  state: GameState = 'title';
  /** Scaled game time in seconds. */
  time = 0;
  /** Seconds of slow motion left (set when a boss dies). */
  slowMo = 0;
  /** Seconds of hit-stop left: the world almost freezes for a moment after a heavy hit. */
  freeze = 0;
  map!: GameMap;
  field!: FlowField;
  /** Seed of the current map, so a save can rebuild the same map. */
  mapSeed = 0;
  director: WaveDirector;
  boss: Boss | null = null;
  readonly enemies: Enemy[] = [];
  /** Killed enemies playing their death animation. */
  readonly dying: Enemy[] = [];
  readonly run: RunStats = { score: 0, kills: 0, bossesDefeated: 0 };
  /** Map point under the mouse cursor. */
  readonly aimPoint = { x: 0, y: 0 };
  readonly rng = createRng(Date.now() & 0xffffffff);
  readonly timers = new Timers();

  readonly stage: Stage;
  readonly assets: Assets;
  readonly hud: Hud;
  readonly floaters: FloatingText;
  readonly audio: Sfx;
  readonly flow: GameFlow;
  readonly store: KeyValueStore;

  readonly player: Player;
  readonly effects: Effects;
  readonly projectiles: Projectiles;
  readonly crates: Crates;
  readonly gems: Gems;
  readonly deployables: Deployables;
  readonly throwables: Throwables;
  readonly props: Props;
  readonly arsenal = new Arsenal();
  readonly combo = new Combo();

  readonly hero: HeroBuild;
  readonly abilities: Abilities;
  readonly combat: Combat;
  readonly spawner: Spawner;
  readonly meta: Meta;

  constructor(parts: ContextParts) {
    this.stage = parts.stage;
    this.assets = parts.assets;
    this.hud = parts.hud;
    this.floaters = parts.floaters;
    this.audio = parts.audio;
    this.flow = parts.flow;
    this.store = parts.store;
    const scene = parts.stage.scene;
    this.player = new Player(this.assets, scene);
    this.effects = new Effects(scene, this.assets);
    this.projectiles = new Projectiles(scene, this.assets);
    this.crates = new Crates(scene, this.assets);
    this.deployables = new Deployables(scene, this.assets);
    this.throwables = new Throwables(scene, this.assets);
    this.gems = new Gems(scene, this.assets);
    this.props = new Props(scene, this.assets);
    this.director = new WaveDirector(this.rng);
    this.meta = new Meta(this.store, this);
    this.hero = new HeroBuild(this);
    this.abilities = new Abilities(this);
    this.combat = new Combat(this);
    this.spawner = new Spawner(this);
  }

  get scene(): THREE.Scene {
    return this.stage.scene;
  }

  get stats(): PlayerStats {
    return this.hero.stats;
  }

  get playing(): boolean {
    return this.state === 'playing';
  }

  // ---------------------------------------------------------------- world interfaces

  sfx(name: SoundName): void {
    this.audio.play(name);
  }

  shake(amount: number): void {
    this.stage.shake(amount);
  }

  dust(x: number, y: number): void {
    this.effects.dust(x, y);
  }

  fireBile(x: number, y: number, dirX: number, dirY: number, speed: number, damage?: number): void {
    this.projectiles.bile(x, y, dirX, dirY, speed, damage);
  }

  summon(x: number, y: number): void {
    this.spawner.summon(x, y);
  }

  hurtPlayer(amount: number, fromX: number, fromY: number): void {
    this.combat.hurtPlayer(amount, fromX, fromY);
  }

  damageEnemy(enemy: Enemy, amount: number, dirX: number, dirY: number, knock: number, source?: DamageSource, blockable?: boolean): void {
    this.combat.damageEnemy(enemy, amount, dirX, dirY, knock, source, blockable);
  }

  explode(x: number, y: number, radius: number, damage: number): void {
    this.combat.explode(x, y, radius, damage);
  }

  deployableShot(def: WeaponDef, origin: { x: number; y: number }, dir: { x: number; y: number }): void {
    this.combat.deployableShot(def, origin, dir);
  }

  /** Almost freezes the world for `seconds` to make a heavy hit feel heavy. */
  hitStop(seconds: number): void {
    this.freeze = Math.max(this.freeze, seconds);
  }

  get round(): number {
    return this.director.round;
  }

  hitBarrel(x: number, y: number, radius: number, damage: number): boolean {
    const barrel = this.props.barrelAt(x, y, radius);
    if (!barrel) return false;
    this.props.damageBarrel(barrel, damage, this);
    return true;
  }

  barrelExploded(x: number, y: number): void {
    this.combat.barrelBlast(x, y);
  }

  spikeEnemy(enemy: Enemy, damage: number): void {
    this.effects.sparks(enemy.pos.x, 0.2, enemy.pos.y, 4, 0xe0e8f0);
    this.combat.damageEnemy(enemy, damage, 0, 0, 0, 'trap');
  }

  spikeHero(damage: number, x: number, y: number): void {
    this.combat.hurtPlayer(damage, x, y);
  }
}
