import * as THREE from 'three';
import { ActorSprite } from '../gfx/actorSprite.ts';
import type { AnimSet, Assets } from '../gfx/assets.ts';
import { screenX } from '../gfx/iso.ts';
import type { SoundName } from '../systems/audio.ts';
import { ELITE, ELITES, type EliteAffix, eliteStats } from '../systems/elites.ts';
import type { ZombieKind } from '../systems/waveDirector.ts';
import { hasLineOfSight, moveCircle } from '../world/collision.ts';
import type { FlowField } from '../world/flowField.ts';
import type { GameMap } from '../world/mapGen.ts';
import { type Body, launchBody, stepBody } from '../world/ragdoll.ts';
import type { Player } from './player.ts';

export interface EnemyWorld {
  readonly map: GameMap;
  readonly field: FlowField;
  readonly player: Player;
  fireBile(x: number, y: number, dirX: number, dirY: number, speed: number, damage?: number): void;
  summon(x: number, y: number): void;
  shake(amount: number): void;
  sfx(name: SoundName): void;
  dust(x: number, y: number): void;
  hurtPlayer(amount: number, fromX: number, fromY: number): void;
}

interface EnemyStats {
  hp: number;
  speed: number;
  damage: number;
  scale: number;
  hitRadius: number;
  bodyRadius: number;
  score: number;
}

const ZOMBIE_STATS: Record<ZombieKind, EnemyStats> = {
  walker: { hp: 30, speed: 1.7, damage: 10, scale: 1, hitRadius: 0.36, bodyRadius: 0.3, score: 10 },
  runner: { hp: 18, speed: 3.4, damage: 7, scale: 0.9, hitRadius: 0.33, bodyRadius: 0.28, score: 15 },
  brute: { hp: 150, speed: 1.15, damage: 22, scale: 1.5, hitRadius: 0.55, bodyRadius: 0.4, score: 40 },
  exploder: { hp: 40, speed: 2.0, damage: 0, scale: 1.05, hitRadius: 0.4, bodyRadius: 0.32, score: 20 },
  spitter: { hp: 26, speed: 2.0, damage: 6, scale: 1, hitRadius: 0.36, bodyRadius: 0.3, score: 25 },
  shield: { hp: 45, speed: 1.45, damage: 12, scale: 1.05, hitRadius: 0.4, bodyRadius: 0.32, score: 30 },
  bat: { hp: 9, speed: 4.2, damage: 5, scale: 0.9, hitRadius: 0.34, bodyRadius: 0.22, score: 10 },
};

/** Hit points of the riot shield in round 1. */
export const SHIELD_HP = 80;
/** Blast of a popping exploder. It hurts the hero and other zombies alike. */
export const EXPLODER_BLAST = { radius: 2.1, playerDamage: 24, enemyDamage: 45 } as const;
const EXPLODER_FUSE = 0.6;
const EXPLODER_TRIGGER = 1.5;
const SPITTER_RANGE = { min: 4, max: 7.5, fire: 9 } as const;
const SPITTER_BILE = { speed: 7.5, damage: 9 } as const;

/** True when a hit travelling along `dir` strikes the front of something facing `face`. */
export function isFrontalHit(face: { x: number; y: number }, dirX: number, dirY: number): boolean {
  const len = Math.hypot(dirX, dirY);
  if (len < 1e-6) return false;
  return (dirX * face.x + dirY * face.y) / len < -0.35;
}

const RISE_TIME = 0.7;
const DEATH_TIME = 0.55;
/** How long a body thrown by an explosion stays on screen. */
const RAGDOLL_TIME = 1.3;
const ATTACK_COOLDOWN = 0.9;

export class Enemy {
  readonly pos: { x: number; y: number };
  readonly hitRadius: number;
  readonly bodyRadius: number;
  readonly score: number;
  readonly maxHp: number;
  readonly kind: ZombieKind | 'boss';
  hp: number;
  dead = false;
  /** Set by the enemy itself when it wants to blow up; the game removes it without a reward. */
  detonate = false;
  protected speed: number;
  protected contactDamage: number;
  protected readonly actor: ActorSprite;
  protected attackCooldown = 0;
  protected rise = RISE_TIME;
  protected knockX = 0;
  protected knockY = 0;
  private deathTime = 0;
  private deathSide = 1;
  private readonly wobble = Math.random() * 10;
  private burnTime = 0;
  private burnDps = 0;
  private burnTick = 0;
  /** Elite trait, or null for a normal enemy. */
  elite: EliteAffix | null = null;
  private tintColor = 0xffffff;
  private body: Body | null = null;

  constructor(kind: ZombieKind | 'boss', anim: AnimSet, stats: EnemyStats, assets: Assets, scene: THREE.Scene, x: number, y: number) {
    this.kind = kind;
    this.pos = { x, y };
    this.hp = stats.hp;
    this.maxHp = stats.hp;
    this.speed = stats.speed;
    this.contactDamage = stats.damage;
    this.hitRadius = stats.hitRadius;
    this.bodyRadius = stats.bodyRadius;
    this.score = stats.score;
    this.actor = new ActorSprite(anim, stats.scale, assets.shadow, scene);
    this.actor.setPosition(x, y, -this.actor.height);
    this.actor.shadow.visible = false;
  }

  static zombie(kind: ZombieKind, round: number, assets: Assets, scene: THREE.Scene, x: number, y: number, elite: EliteAffix | null = null): Enemy {
    const base = ZOMBIE_STATS[kind];
    const scaled = {
      ...base,
      hp: Math.round(base.hp * (1 + 0.28 * (round - 1))),
      speed: base.speed * (0.9 + Math.random() * 0.2),
    };
    const stats = elite ? eliteStats(scaled, elite) : scaled;
    const enemy = Enemy.create(kind, round, assets, scene, x, y, stats);
    if (elite) enemy.makeElite(elite);
    return enemy;
  }

  private static create(kind: ZombieKind, round: number, assets: Assets, scene: THREE.Scene, x: number, y: number, stats: EnemyStats): Enemy {
    const anim = assets.zombies[kind];
    switch (kind) {
      case 'exploder':
        return new Exploder(anim, stats, assets, scene, x, y);
      case 'spitter':
        return new Spitter(anim, stats, assets, scene, x, y);
      case 'shield':
        return new ShieldZombie(anim, stats, assets, scene, x, y, Math.round(SHIELD_HP * (1 + 0.28 * (round - 1))));
      case 'bat':
        return new Bat(anim, stats, assets, scene, x, y);
      default:
        return new Enemy(kind, anim, stats, assets, scene, x, y);
    }
  }

  private makeElite(affix: EliteAffix): void {
    this.elite = affix;
    this.tintColor = ELITES[affix].tint;
    this.actor.tint(this.tintColor);
    this.actor.setAura(ELITES[affix].aura);
  }

  /** Multiplier on incoming damage (armored elites take less). */
  get damageTakenMult(): number {
    return this.elite === 'armored' ? ELITE.armoredDamage : 1;
  }

  /** Regenerating elites heal over time, but not while they burn. */
  regenerate(dt: number): void {
    if (this.elite !== 'regen' || this.dead || this.burning || this.hp >= this.maxHp) return;
    this.hp = Math.min(this.maxHp, this.hp + this.maxHp * ELITE.regenPerSecond * dt);
  }

  get rising(): boolean {
    return this.rise > 0;
  }

  /** Flying enemies ignore walls and do not trigger mines. */
  get flying(): boolean {
    return false;
  }

  get visualHeight(): number {
    return this.actor.height;
  }

  /** True when this hit is stopped by armour (see ShieldZombie). */
  blocks(_dirX: number, _dirY: number): boolean {
    return false;
  }

  /** Pushes the enemy without hurting it. */
  shove(dirX: number, dirY: number, knock: number): void {
    this.knockX += dirX * knock;
    this.knockY += dirY * knock;
  }

  get burning(): boolean {
    return this.burnTime > 0;
  }

  /** Sets the enemy on fire; stronger or longer fires replace weaker ones. */
  ignite(duration: number, dps: number): void {
    if (this.dead) return;
    if (!this.burning) this.burnTick = 0.25;
    this.burnTime = Math.max(this.burnTime, duration);
    this.burnDps = Math.max(this.burnDps, dps);
    this.actor.material.color.setHex(0xffa070);
  }

  /** Advances the fire and returns the damage to deal this frame (dealt in 0.25s ticks). */
  tickBurn(dt: number): number {
    if (!this.burning || this.dead) return 0;
    this.burnTime -= dt;
    this.burnTick -= dt;
    const damage = this.burnTick <= 0 ? this.burnDps * 0.25 : 0;
    if (this.burnTick <= 0) this.burnTick += 0.25;
    if (this.burnTime <= 0) {
      this.burnDps = 0;
      this.actor.tint(this.tintColor);
    }
    return damage;
  }

  /** Applies damage and knockback; returns true if this hit killed the enemy. */
  hit(amount: number, dirX: number, dirY: number, knock: number): boolean {
    if (this.dead) return false;
    this.hp -= amount;
    this.knockX += dirX * knock;
    this.knockY += dirY * knock;
    this.actor.flash();
    if (this.hp <= 0) {
      this.dead = true;
      this.deathSide = screenX(dirX, dirY) >= 0 ? -1 : 1;
      this.actor.material.transparent = true;
      this.actor.material.alphaTest = 0.1;
      this.actor.shadow.visible = false;
      return true;
    }
    return false;
  }

  protected chaseDirection(world: EnemyWorld): { x: number; y: number } {
    const dx = world.player.pos.x - this.pos.x;
    const dy = world.player.pos.y - this.pos.y;
    const dist = Math.hypot(dx, dy) || 1;
    if (dist < 2.2) return { x: dx / dist, y: dy / dist };
    const tx = Math.floor(this.pos.x);
    const ty = Math.floor(this.pos.y);
    const step = world.field.direction(tx, ty);
    if (!step) return { x: dx / dist, y: dy / dist };
    // Aim at the centre of the next tile so enemies round corners instead of scraping them.
    const nx = tx + 0.5 + Math.sign(step.x) - this.pos.x;
    const ny = ty + 0.5 + Math.sign(step.y) - this.pos.y;
    const nlen = Math.hypot(nx, ny) || 1;
    return { x: nx / nlen, y: ny / nlen };
  }

  protected move(world: EnemyWorld, dirX: number, dirY: number, speed: number, dt: number): void {
    const decay = Math.exp(-8 * dt);
    this.knockX *= decay;
    this.knockY *= decay;
    moveCircle(world.map, this.pos, this.bodyRadius, (dirX * speed + this.knockX) * dt, (dirY * speed + this.knockY) * dt);
  }

  protected tryContactDamage(world: EnemyWorld, damage: number): void {
    if (this.attackCooldown > 0) return;
    const reach = this.hitRadius + world.player.radius + 0.08;
    const dist = Math.hypot(world.player.pos.x - this.pos.x, world.player.pos.y - this.pos.y);
    if (dist > reach) return;
    world.hurtPlayer(damage, this.pos.x, this.pos.y);
    this.attackCooldown = ATTACK_COOLDOWN;
  }

  /** Per-frame AI. Returns nothing; death is handled through `updateDeath`. */
  update(dt: number, world: EnemyWorld, time: number): void {
    this.attackCooldown = Math.max(0, this.attackCooldown - dt);
    if (this.rise > 0) {
      this.rise -= dt;
      const t = Math.max(0, this.rise / RISE_TIME);
      this.actor.setPosition(this.pos.x, this.pos.y, -this.actor.height * t);
      this.actor.update(dt, 0);
      if (this.rise <= 0) this.actor.shadow.visible = true;
      return;
    }
    const dir = this.chaseDirection(world);
    const wobble = this.kind === 'walker' ? 0.75 + Math.sin(time * 3 + this.wobble) * 0.25 : 1;
    this.move(world, dir.x, dir.y, this.speed * wobble, dt);
    this.tryContactDamage(world, this.contactDamage);
    this.present(dt, dir.x, dir.y, this.kind === 'runner' ? 10 : 5);
  }

  protected present(dt: number, dirX: number, dirY: number, animRate: number): void {
    const sx = screenX(dirX, dirY);
    if (Math.abs(sx) > 0.1) this.actor.setFacing(sx);
    this.actor.update(dt, animRate);
    this.actor.setPosition(this.pos.x, this.pos.y);
  }

  /** Plays the topple-and-fade animation; returns true once it's finished and resources can be freed. */
  updateDeath(dt: number): boolean {
    this.deathTime += dt;
    this.actor.update(dt, 0);
    if (this.body) return this.updateRagdoll(dt);
    const t = Math.min(1, this.deathTime / DEATH_TIME);
    this.actor.material.rotation = this.deathSide * (Math.PI / 2) * Math.min(1, t * 2);
    this.actor.material.opacity = 1 - Math.max(0, t - 0.5) * 2;
    return t >= 1;
  }

  /** Throws a freshly killed enemy away from a blast (ragdoll). `power` 0..1. Bosses and flyers stay put. */
  launch(dirX: number, dirY: number, power: number): void {
    if (!this.dead || this.body || this.flying || this.kind === 'boss' || this.deathTime > 0) return;
    this.body = launchBody(this.pos.x, this.pos.y, dirX, dirY, power, this.deathSide);
  }

  get launched(): boolean {
    return this.body !== null;
  }

  private updateRagdoll(dt: number): boolean {
    const b = this.body;
    if (!b) return true;
    stepBody(b, Math.min(dt, 1 / 30));
    this.pos.x = b.x;
    this.pos.y = b.y;
    this.actor.setPosition(b.x, b.y, b.h);
    this.actor.material.rotation = b.angle;
    this.actor.material.opacity = 1 - Math.max(0, (this.deathTime - RAGDOLL_TIME + 0.4) / 0.4);
    return this.deathTime >= RAGDOLL_TIME;
  }

  dispose(): void {
    this.actor.dispose();
  }
}

/** Bloated zombie: when close it lights a short fuse and pops. It also pops when shot down. */
export class Exploder extends Enemy {
  private fuse = -1;

  constructor(anim: AnimSet, stats: EnemyStats, assets: Assets, scene: THREE.Scene, x: number, y: number) {
    super('exploder', anim, stats, assets, scene, x, y);
  }

  get fusing(): boolean {
    return this.fuse >= 0;
  }

  override update(dt: number, world: EnemyWorld, time: number): void {
    if (this.rise > 0) {
      super.update(dt, world, time);
      return;
    }
    const dist = Math.hypot(world.player.pos.x - this.pos.x, world.player.pos.y - this.pos.y);
    if (!this.fusing && dist < EXPLODER_TRIGGER) {
      this.fuse = EXPLODER_FUSE;
      world.sfx('fuse');
    }
    let speed = this.speed;
    if (this.fusing) {
      this.fuse -= dt;
      speed *= 0.35;
      if (Math.floor(this.fuse * 14) % 2 === 0) this.actor.flash(0.03);
      if (this.fuse <= 0) this.detonate = true;
    }
    const dir = this.chaseDirection(world);
    this.move(world, dir.x, dir.y, speed, dt);
    this.present(dt, dir.x, dir.y, 5);
    this.actor.setPulse(this.fusing ? 1.08 + Math.sin(time * 45) * 0.06 : 1 + Math.sin(time * 5) * 0.03);
  }
}

type SpitterState = 'move' | 'aim' | 'recover';

/** Keeps its distance and lobs bile at the hero when it has a clear line of fire. */
export class Spitter extends Enemy {
  private state: SpitterState = 'move';
  private stateTime = 0;
  private cooldown = 1 + Math.random();
  private readonly strafeSide = Math.random() < 0.5 ? -1 : 1;

  constructor(anim: AnimSet, stats: EnemyStats, assets: Assets, scene: THREE.Scene, x: number, y: number) {
    super('spitter', anim, stats, assets, scene, x, y);
  }

  get aiming(): boolean {
    return this.state === 'aim';
  }

  override update(dt: number, world: EnemyWorld, time: number): void {
    if (this.rise > 0) {
      super.update(dt, world, time);
      return;
    }
    this.attackCooldown = Math.max(0, this.attackCooldown - dt);
    this.cooldown -= dt;
    this.stateTime -= dt;
    const dx = world.player.pos.x - this.pos.x;
    const dy = world.player.pos.y - this.pos.y;
    const dist = Math.hypot(dx, dy) || 1;
    const toX = dx / dist;
    const toY = dy / dist;
    let faceX = toX;
    let faceY = toY;
    let animRate = 0;

    switch (this.state) {
      case 'move': {
        const clear = dist < SPITTER_RANGE.fire && hasLineOfSight(world.map, this.pos, world.player.pos);
        animRate = 5;
        if (dist < SPITTER_RANGE.min) {
          this.move(world, -toX, -toY, this.speed * 0.85, dt);
          faceX = -toX;
          faceY = -toY;
        } else if (dist > SPITTER_RANGE.max || !clear) {
          const dir = this.chaseDirection(world);
          this.move(world, dir.x, dir.y, this.speed, dt);
          faceX = dir.x;
          faceY = dir.y;
        } else {
          this.move(world, -toY * this.strafeSide, toX * this.strafeSide, this.speed * 0.35, dt);
        }
        if (clear && this.cooldown <= 0) {
          this.state = 'aim';
          this.stateTime = 0.55;
        }
        break;
      }
      case 'aim':
        this.move(world, 0, 0, 0, dt);
        if (Math.floor(this.stateTime * 16) % 2 === 0) this.actor.flash(0.03);
        if (this.stateTime <= 0) {
          world.fireBile(this.pos.x, this.pos.y, toX, toY, SPITTER_BILE.speed, SPITTER_BILE.damage);
          world.sfx('spit');
          this.state = 'recover';
          this.stateTime = 0.4;
          this.cooldown = 2.2 + Math.random() * 0.8;
        }
        break;
      case 'recover':
        this.move(world, 0, 0, 0, dt);
        if (this.stateTime <= 0) this.state = 'move';
        break;
    }
    this.tryContactDamage(world, this.contactDamage);
    this.present(dt, faceX, faceY, animRate);
  }
}

/** Riot zombie. Its steel shield soaks every bullet from the front until it breaks. */
export class ShieldZombie extends Enemy {
  readonly shieldMax: number;
  shieldHp: number;
  private readonly face = { x: 1, y: 0 };
  private readonly brokenAnim: AnimSet;

  constructor(anim: AnimSet, stats: EnemyStats, assets: Assets, scene: THREE.Scene, x: number, y: number, shieldHp: number) {
    super('shield', anim, stats, assets, scene, x, y);
    this.shieldMax = shieldHp;
    this.shieldHp = shieldHp;
    this.brokenAnim = assets.riotBroken;
  }

  get shielded(): boolean {
    return this.shieldHp > 0;
  }

  override blocks(dirX: number, dirY: number): boolean {
    return this.shielded && !this.rising && isFrontalHit(this.face, dirX, dirY);
  }

  /** Damages the shield; returns true on the hit that breaks it. */
  damageShield(amount: number): boolean {
    if (!this.shielded) return false;
    this.shieldHp -= amount;
    this.actor.flash(0.04);
    if (this.shieldHp > 0) return false;
    this.shieldHp = 0;
    this.actor.setAnim(this.brokenAnim);
    this.speed *= 1.35;
    return true;
  }

  override update(dt: number, world: EnemyWorld, time: number): void {
    const dx = world.player.pos.x - this.pos.x;
    const dy = world.player.pos.y - this.pos.y;
    const dist = Math.hypot(dx, dy) || 1;
    this.face.x = dx / dist;
    this.face.y = dy / dist;
    super.update(dt, world, time);
  }
}

const BAT_CRUISE_HEIGHT = 0.6;

/** Fast flying pest. It flies over walls in a wavy line, bites and backs off. */
export class Bat extends Enemy {
  private lift = 3;
  private retreat = 0;
  private readonly phase = Math.random() * Math.PI * 2;

  constructor(anim: AnimSet, stats: EnemyStats, assets: Assets, scene: THREE.Scene, x: number, y: number) {
    super('bat', anim, stats, assets, scene, x, y);
    this.rise = 0;
    this.actor.shadow.visible = true;
    this.actor.setPosition(x, y, this.lift);
  }

  override get flying(): boolean {
    return true;
  }

  override get visualHeight(): number {
    return this.actor.height + this.lift;
  }

  override update(dt: number, world: EnemyWorld, time: number): void {
    this.attackCooldown = Math.max(0, this.attackCooldown - dt);
    this.retreat = Math.max(0, this.retreat - dt);
    const target = BAT_CRUISE_HEIGHT + Math.sin(time * 6 + this.phase) * 0.12;
    this.lift += (target - this.lift) * Math.min(1, dt * 3);

    const dx = world.player.pos.x - this.pos.x;
    const dy = world.player.pos.y - this.pos.y;
    const dist = Math.hypot(dx, dy) || 1;
    const sway = Math.sin(time * 5 + this.phase) * 0.7;
    const away = this.retreat > 0 ? -1 : 1;
    let dirX = (dx / dist) * away - (dy / dist) * sway;
    let dirY = (dy / dist) * away + (dx / dist) * sway;
    const len = Math.hypot(dirX, dirY) || 1;
    dirX /= len;
    dirY /= len;

    const decay = Math.exp(-8 * dt);
    this.knockX *= decay;
    this.knockY *= decay;
    const edge = world.map.size - 0.5;
    this.pos.x = Math.min(edge, Math.max(0.5, this.pos.x + (dirX * this.speed + this.knockX) * dt));
    this.pos.y = Math.min(edge, Math.max(0.5, this.pos.y + (dirY * this.speed + this.knockY) * dt));

    if (this.attackCooldown <= 0 && dist < this.hitRadius + world.player.radius + 0.1) {
      world.hurtPlayer(this.contactDamage, this.pos.x, this.pos.y);
      this.attackCooldown = 0.9;
      this.retreat = 0.6;
    }
    const sx = screenX(dirX, dirY);
    if (Math.abs(sx) > 0.1) this.actor.setFacing(sx);
    this.actor.update(dt, 12);
    this.actor.setPosition(this.pos.x, this.pos.y, this.lift);
  }

  override updateDeath(dt: number): boolean {
    this.lift = Math.max(0, this.lift - dt * 5);
    this.actor.setPosition(this.pos.x, this.pos.y, this.lift);
    return super.updateDeath(dt);
  }
}

type BossState = 'chase' | 'windup' | 'charge' | 'stunned' | 'spit' | 'summon';

export class Boss extends Enemy {
  readonly name: string;
  private state: BossState = 'chase';
  private stateTime = 3;
  private readonly chargeDir = { x: 0, y: 0 };
  private volleys = 0;
  private volleyTimer = 0;
  private cycle = 0;
  private readonly round: number;

  constructor(round: number, assets: Assets, scene: THREE.Scene, x: number, y: number) {
    const variant = assets.bosses[(round - 1) % assets.bosses.length];
    super(
      'boss',
      variant.anim,
      {
        hp: 1400 + 800 * (round - 1),
        speed: 1.7,
        damage: 28,
        scale: 1.9,
        hitRadius: 1.0,
        bodyRadius: 0.45,
        score: 1000 * round,
      },
      assets,
      scene,
      x,
      y,
    );
    this.round = round;
    this.name = variant.name;
    this.rise = 1.4;
  }

  /** Below half health the boss moves and attacks faster (the boss music speeds up too). */
  get enraged(): boolean {
    return this.hp < this.maxHp * 0.5;
  }

  private enter(state: BossState, time: number): void {
    this.state = state;
    this.stateTime = time;
  }

  private pickNextAttack(world: EnemyWorld): void {
    this.cycle++;
    const dist = Math.hypot(world.player.pos.x - this.pos.x, world.player.pos.y - this.pos.y);
    if (this.cycle % 3 === 0) {
      this.enter('summon', 1.3);
      world.sfx('roar');
      world.shake(0.3);
      const count = 3 + this.round;
      for (let i = 0; i < count; i++) {
        const a = (i / count) * Math.PI * 2;
        world.summon(this.pos.x + Math.cos(a) * 1.8, this.pos.y + Math.sin(a) * 1.8);
      }
    } else if (dist < 13 && this.cycle % 3 === 1) {
      this.enter('windup', this.enraged ? 0.5 : 0.8);
    } else {
      this.enter('spit', 1.6);
      this.volleys = this.enraged ? 4 : 3;
      this.volleyTimer = 0.1;
    }
  }

  override update(dt: number, world: EnemyWorld, time: number): void {
    if (this.rise > 0) {
      super.update(dt, world, time);
      if (this.rise <= 0) {
        world.sfx('roar');
        world.shake(0.5);
      }
      return;
    }
    this.attackCooldown = Math.max(0, this.attackCooldown - dt);
    this.stateTime -= dt;
    const px = world.player.pos.x - this.pos.x;
    const py = world.player.pos.y - this.pos.y;
    const plen = Math.hypot(px, py) || 1;
    let faceX = px / plen;
    let faceY = py / plen;
    let animRate = 4;

    switch (this.state) {
      case 'chase': {
        const dir = this.chaseDirection(world);
        this.move(world, dir.x, dir.y, this.speed * (this.enraged ? 1.35 : 1), dt);
        faceX = dir.x;
        faceY = dir.y;
        if (this.stateTime <= 0) this.pickNextAttack(world);
        break;
      }
      case 'windup':
        animRate = 0;
        if (Math.floor(this.stateTime * 12) % 2 === 0) this.actor.flash(0.04);
        this.chargeDir.x = faceX;
        this.chargeDir.y = faceY;
        if (this.stateTime <= 0) {
          this.enter('charge', 0.95);
          world.sfx('dash');
        }
        break;
      case 'charge': {
        const before = { x: this.pos.x, y: this.pos.y };
        const speed = 11;
        this.move(world, this.chargeDir.x, this.chargeDir.y, speed, dt);
        faceX = this.chargeDir.x;
        faceY = this.chargeDir.y;
        animRate = 12;
        this.tryContactDamage(world, 35);
        const moved = Math.hypot(this.pos.x - before.x, this.pos.y - before.y);
        if (moved < speed * dt * 0.3) {
          this.enter('stunned', 1.1);
          world.shake(0.45);
          world.sfx('explosion');
          world.dust(this.pos.x, this.pos.y);
        } else if (this.stateTime <= 0) {
          this.enter('chase', this.enraged ? 1.8 : 2.8);
        }
        break;
      }
      case 'stunned':
        animRate = 0;
        if (this.stateTime <= 0) this.enter('chase', 2.5);
        break;
      case 'spit':
        animRate = 0;
        this.volleyTimer -= dt;
        if (this.volleys > 0 && this.volleyTimer <= 0) {
          this.volleys--;
          this.volleyTimer = 0.38;
          const ring = this.volleys === 0;
          const count = ring ? 16 : 5;
          const base = Math.atan2(py, px);
          for (let i = 0; i < count; i++) {
            const a = ring ? base + (i / count) * Math.PI * 2 : base + (i - 2) * 0.16;
            world.fireBile(this.pos.x, this.pos.y, Math.cos(a), Math.sin(a), ring ? 5.5 : 7.5);
          }
          world.sfx('flame');
        }
        if (this.stateTime <= 0) this.enter('chase', this.enraged ? 1.8 : 3);
        break;
      case 'summon':
        animRate = 0;
        if (this.stateTime <= 0) this.enter('chase', 2.5);
        break;
    }
    if (this.state !== 'charge') this.tryContactDamage(world, this.contactDamage);
    this.present(dt, faceX, faceY, animRate);
  }
}
