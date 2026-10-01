import type { GameContext } from '../core/context.ts';
import { type Boss, EXPLODER_BLAST, type Enemy, ShieldZombie } from '../entities/enemies.ts';
import { GUN_HEIGHT } from '../entities/player.ts';
import { BARREL, type Barrel } from '../entities/props.ts';
import type { DamageSource } from '../entities/projectiles.ts';
import { screenAngle } from '../gfx/iso.ts';
import type { SoundName } from '../systems/audio.ts';
import { formatMultiplier } from '../systems/combo.ts';
import { ELITE } from '../systems/elites.ts';
import { coinsForEnemy, xpForEnemy } from '../systems/progression.ts';
import type { WeaponDef } from '../systems/weapons.ts';
import { pointSegmentDistance, pushOut } from '../world/collision.ts';
import { blocksShot, isWalkable } from '../world/mapGen.ts';

export const BURN = { time: 3, dps: 10 } as const;
const LASER_RANGE = 16;
const BOSS_SLOW_MO = 1.4;
/** Hit-stop lengths in seconds. */
export const HIT_STOP = { multiKill: 0.07, heavyKill: 0.05, hurt: 0.04 } as const;
/** Kills in one explosion that trigger a hit-stop. */
const MULTI_KILL = 3;
/** Explosions closer than this shake the gamepad. */
const RUMBLE_RANGE = 8;

/** Everything about dealing and taking damage: shots, crits, shields, kills, explosions and the hero's hits. */
export class Combat {
  private readonly ctx: GameContext;

  constructor(ctx: GameContext) {
    this.ctx = ctx;
  }

  /** Fires the current weapon if it is ready. */
  fire(): void {
    const { ctx } = this;
    const def = ctx.arsenal.tryFire();
    if (!def) return;
    const muzzle = ctx.player.muzzle();
    const aim = ctx.player.aim;
    // Never shoot from inside a wall when hugging it.
    const origin = blocksShot(ctx.map, Math.floor(muzzle.x), Math.floor(muzzle.y)) ? { ...ctx.player.pos } : muzzle;
    if (def.projectile === 'beam') this.fireLaser(def, origin);
    else ctx.projectiles.fire(def, origin, aim, { damageMult: ctx.hero.damageMult, pierce: ctx.stats.pierce, source: 'shot' });
    if (def.projectile !== 'flame') ctx.effects.muzzleFlash(muzzle.x, GUN_HEIGHT, muzzle.y, screenAngle(aim.x, aim.y));
    ctx.shake(def.shake);
    ctx.sfx(def.id as SoundName);
  }

  private fireLaser(def: WeaponDef, origin: { x: number; y: number }): void {
    const { ctx } = this;
    const aim = ctx.player.aim;
    let length = 0;
    let barrel: Barrel | null = null;
    while (length < LASER_RANGE) {
      length += 0.2;
      const px = origin.x + aim.x * length;
      const py = origin.y + aim.y * length;
      if (blocksShot(ctx.map, Math.floor(px), Math.floor(py))) break;
      barrel = ctx.props.barrelAt(px, py, 0.05);
      if (barrel) break;
    }
    const end = { x: origin.x + aim.x * length, y: origin.y + aim.y * length };
    if (barrel) ctx.props.damageBarrel(barrel, def.damage * ctx.hero.damageMult, ctx);
    for (const e of [...ctx.enemies]) {
      if (e.dead) continue;
      if (pointSegmentDistance(e.pos, origin, end).dist < e.hitRadius + 0.12) {
        this.damageEnemy(e, def.damage * ctx.hero.damageMult, aim.x, aim.y, 0.8, 'shot', false);
      }
    }
    ctx.effects.showBeam(origin.x, origin.y, end.x, end.y, GUN_HEIGHT);
    if (length < LASER_RANGE) ctx.effects.sparks(end.x, GUN_HEIGHT, end.y, 2, 0x80f8ff);
  }

  deployableShot(def: WeaponDef, origin: { x: number; y: number }, dir: { x: number; y: number }): void {
    this.ctx.projectiles.fire(def, origin, dir, { damageMult: this.ctx.stats.turretDamageMult, pierce: 0, source: 'turret' });
  }

  /**
   * @param blockable whether a riot shield can stop this hit. Bullets and turret shots can;
   * fire, the laser and explosions cannot.
   */
  damageEnemy(
    enemy: Enemy,
    amount: number,
    dirX: number,
    dirY: number,
    knock: number,
    source: DamageSource = 'shot',
    blockable = source === 'shot' || source === 'turret',
  ): void {
    const { ctx } = this;
    if (enemy.dead) return;
    if (blockable && enemy instanceof ShieldZombie && enemy.blocks(dirX, dirY)) {
      this.hitShield(enemy, amount, dirX, dirY, knock);
      return;
    }
    let damage = amount;
    let crit = false;
    if (source === 'shot') {
      if (Math.random() < ctx.stats.critChance) {
        damage *= 2;
        crit = true;
        ctx.effects.sparks(enemy.pos.x, enemy.visualHeight * 0.7, enemy.pos.y, 5, 0xffff40);
        ctx.sfx('crit');
      }
      if (Math.random() < ctx.stats.burnChance) enemy.ignite(BURN.time, BURN.dps * ctx.hero.damageMult * ctx.stats.burnDpsMult);
    }
    const heavy = enemy.kind === 'boss' || enemy.kind === 'brute';
    damage *= enemy.damageTakenMult;
    const killed = enemy.hit(damage, dirX, dirY, heavy ? knock * 0.15 : knock);
    const kind = crit ? 'crit' : source === 'burn' ? 'burn' : 'damage';
    ctx.floaters.show(enemy, kind, damage, enemy.pos.x, enemy.pos.y, enemy.visualHeight + 0.15);
    if (source !== 'burn') {
      if (Math.random() < 0.5) ctx.effects.blood(enemy.pos.x, enemy.pos.y, 2, enemy.visualHeight * 0.5);
      ctx.sfx('hit');
    }
    if (killed) this.killEnemy(enemy, dirX, dirY);
  }

  private hitShield(enemy: ShieldZombie, amount: number, dirX: number, dirY: number, knock: number): void {
    const { ctx } = this;
    enemy.shove(dirX, dirY, knock * 0.3);
    const h = enemy.visualHeight * 0.55;
    ctx.effects.sparks(enemy.pos.x - dirX * 0.35, h, enemy.pos.y - dirY * 0.35, 3, 0xe0f0ff);
    if (enemy.damageShield(amount)) {
      ctx.floaters.show(null, 'broken', 0, enemy.pos.x, enemy.pos.y, enemy.visualHeight + 0.35);
      ctx.effects.sparks(enemy.pos.x, h, enemy.pos.y, 14, 0xc0d0e0);
      ctx.sfx('shieldBreak');
      ctx.shake(0.12);
      ctx.meta.onShieldBroken();
      return;
    }
    ctx.floaters.show(enemy, 'block', amount, enemy.pos.x, enemy.pos.y, enemy.visualHeight + 0.15);
    ctx.sfx('clang');
  }

  /** Per-frame status effects: fire damage ticks and elite regeneration. */
  tickStatus(dt: number): void {
    const { enemies, effects } = this.ctx;
    for (let i = enemies.length - 1; i >= 0; i--) {
      const e = enemies[i];
      e.regenerate(dt);
      const damage = e.tickBurn(dt);
      if (damage <= 0) continue;
      effects.sparks(e.pos.x, e.visualHeight * 0.6, e.pos.y, 2, 0xff8020);
      this.damageEnemy(e, damage, 0, 0, 0, 'burn');
    }
  }

  /** Removes exploders that decided to blow themselves up next to the hero. */
  detonateExploders(): void {
    for (const e of this.ctx.enemies.filter((z) => z.detonate && !z.dead)) this.killEnemy(e, 0, 0, false);
  }

  /**
   * @param rewarded false when the enemy removed itself (an exploder popping next to the hero),
   * so it drops no XP and adds no score.
   */
  killEnemy(enemy: Enemy, dirX: number, dirY: number, rewarded = true): void {
    const { ctx } = this;
    if (!enemy.dead) enemy.hit(enemy.hp + 1, dirX, dirY, 0);
    const index = ctx.enemies.indexOf(enemy);
    if (index >= 0) ctx.enemies.splice(index, 1);
    ctx.dying.push(enemy);
    if (enemy.kind === 'exploder') ctx.timers.after(0.06, () => this.zombieBlast(enemy.pos.x, enemy.pos.y));
    if (enemy.elite === 'splitter') this.split(enemy);
    if (!rewarded) return;
    const elite = enemy.elite !== null;
    const stepUp = ctx.combo.add();
    ctx.run.score += Math.round(enemy.score * ctx.combo.multiplier);
    ctx.run.kills++;
    if (stepUp) {
      ctx.floaters.showText(`COMBO ×${formatMultiplier(ctx.combo.multiplier)}!`, 'combo', ctx.player.pos.x, ctx.player.pos.y, 1.9);
      ctx.sfx('combo');
    }
    if (elite || enemy.kind === 'brute') ctx.hitStop(HIT_STOP.heavyKill);
    const coins = ctx.meta.earnCoins(coinsForEnemy(enemy.kind, ctx.director.round) * (elite ? ELITE.coins : 1));
    if (enemy.kind === 'boss' || elite) ctx.floaters.show(null, 'coin', coins, enemy.pos.x, enemy.pos.y, enemy.visualHeight + 0.6);
    ctx.meta.onKill(enemy.kind, elite);
    const pieces = enemy.kind === 'boss' ? 12 : enemy.kind === 'brute' || elite ? 3 : 1;
    const xp = xpForEnemy(enemy.kind, ctx.director.round) * (elite ? ELITE.xp : 1);
    ctx.gems.drop(enemy.pos.x, enemy.pos.y, xp * ctx.stats.xpMult, pieces);
    if (elite && ctx.rng() < ELITE.crateChance) ctx.spawner.supplyDrop(undefined, enemy.pos);
    if (ctx.playing) {
      if (ctx.stats.lifeOnKill > 0) ctx.player.heal(ctx.stats.lifeOnKill);
      ctx.hero.onKill();
    }
    ctx.effects.blood(enemy.pos.x, enemy.pos.y, 10, enemy.visualHeight * 0.5);
    ctx.effects.decal(enemy.pos.x, enemy.pos.y, enemy.kind === 'brute' ? 1.3 : 0.9);
    ctx.sfx('zombieDie');
    if (enemy === ctx.boss) this.onBossKilled(ctx.boss);
  }

  /** Splitter elites burst into runners (normal ones, so they cannot chain-split). */
  private split(enemy: Enemy): void {
    const { ctx } = this;
    if (ctx.director.phase === 'roundClear') return;
    for (let i = 0; i < ELITE.splitCount; i++) {
      const a = ctx.rng() * Math.PI * 2;
      const spot = { x: enemy.pos.x + Math.cos(a) * 0.5, y: enemy.pos.y + Math.sin(a) * 0.5 };
      if (!isWalkable(ctx.map, Math.floor(spot.x), Math.floor(spot.y))) continue;
      ctx.spawner.spawnZombie('runner', spot, false);
    }
    ctx.effects.blood(enemy.pos.x, enemy.pos.y, 14, enemy.visualHeight * 0.5);
  }

  private onBossKilled(boss: Boss): void {
    const { ctx } = this;
    ctx.boss = null;
    ctx.slowMo = BOSS_SLOW_MO;
    ctx.shake(0.8);
    for (let i = 0; i < 7; i++) {
      ctx.timers.after(i * 0.18, () => {
        ctx.effects.explosion(boss.pos.x + (Math.random() - 0.5) * 2.5, boss.pos.y + (Math.random() - 0.5) * 2.5, 1.1);
        ctx.sfx('explosion');
        ctx.shake(0.3);
      });
    }
    ctx.effects.decal(boss.pos.x, boss.pos.y, 2.6);
    ctx.spawner.supplyDrop(undefined, boss.pos);
    ctx.spawner.supplyDrop('medkit', boss.pos);
    ctx.director.notifyBossDefeated();
  }

  /** An exploder popping: hurts the hero and every zombie around, so it can set off a chain. */
  private zombieBlast(x: number, y: number): void {
    const { ctx } = this;
    if (ctx.director.phase === 'roundClear') return;
    const { radius, playerDamage, enemyDamage } = EXPLODER_BLAST;
    ctx.effects.decal(x, y, 1.4);
    this.blastHero(x, y, radius, playerDamage * (1 + 0.1 * (ctx.director.round - 1)));
    this.blast(x, y, radius, enemyDamage, { falloff: false, knock: 6, shake: 0.3 });
  }

  /** An explosive barrel going off: hurts zombies and the hero, and sets off nearby barrels. */
  barrelBlast(x: number, y: number): void {
    const { ctx } = this;
    ctx.effects.decal(x, y, 1.6);
    this.blastHero(x, y, BARREL.blastRadius, BARREL.heroDamage);
    this.blast(x, y, BARREL.blastRadius, BARREL.enemyDamage * (1 + 0.2 * (ctx.director.round - 1)), { knock: 8, shake: 0.4 });
  }

  /** The hero's explosions (grenades, mines, rockets, Second Wind); boosted by Demolition skills. */
  explode(x: number, y: number, baseRadius: number, baseDamage: number): void {
    const s = this.ctx.stats;
    this.blast(x, y, baseRadius * s.explosionRadiusMult, baseDamage * s.explosionDamageMult, { knock: 7, shake: 0.35, napalm: s.napalm });
  }

  private blastHero(x: number, y: number, radius: number, damage: number): void {
    const { player } = this.ctx;
    const pd = Math.hypot(player.pos.x - x, player.pos.y - y);
    if (pd >= radius + player.radius) return;
    const falloff = 1 - Math.min(1, pd / (radius + player.radius)) * 0.5;
    this.hurtPlayer(damage * falloff, x, y);
  }

  /**
   * Shared explosion: damages every zombie in range (closer = more), throws the killed ones as
   * ragdolls, sets off barrels in range a moment later, and hit-stops on big multi-kills.
   */
  private blast(x: number, y: number, radius: number, damage: number, o: { knock: number; shake: number; falloff?: boolean; napalm?: boolean }): void {
    const { ctx } = this;
    ctx.effects.explosion(x, y, radius / 2.6);
    ctx.sfx('explosion');
    ctx.shake(o.shake);
    const heroDistance = Math.hypot(ctx.player.pos.x - x, ctx.player.pos.y - y);
    if (heroDistance < RUMBLE_RANGE) ctx.flow.rumble(0.45 * (1 - heroDistance / RUMBLE_RANGE), 110);
    let kills = 0;
    for (const e of [...ctx.enemies]) {
      const dx = e.pos.x - x;
      const dy = e.pos.y - y;
      const d = Math.hypot(dx, dy);
      if (d > radius + e.hitRadius) continue;
      const closeness = 1 - Math.min(1, d / (radius + e.hitRadius));
      const scale = o.falloff === false ? 1 : 1 - (1 - closeness) * 0.5;
      this.damageEnemy(e, damage * scale, dx / (d || 1), dy / (d || 1), o.knock, 'explosion');
      if (e.dead) {
        kills++;
        e.launch(dx || Math.random() - 0.5, dy || Math.random() - 0.5, 0.4 + closeness * 0.6);
      } else if (o.napalm) {
        e.ignite(BURN.time, BURN.dps * 1.2 * ctx.stats.burnDpsMult);
      }
    }
    for (const b of ctx.props.barrelsNear(x, y, radius)) ctx.timers.after(0.12, () => ctx.props.damageBarrel(b, BARREL.hp * 10, ctx));
    if (kills >= MULTI_KILL) ctx.hitStop(HIT_STOP.multiKill);
  }
  hurtPlayer(amount: number, fromX: number, fromY: number): void {
    const { ctx } = this;
    const { player } = ctx;
    if (!ctx.playing) return;
    if (!player.damage(amount * ctx.stats.damageTaken)) return;
    ctx.meta.onHeroHurt();
    ctx.combo.hurt();
    ctx.hitStop(HIT_STOP.hurt);
    ctx.flow.rumble(0.7, 140);
    ctx.sfx('hurt');
    ctx.hud.damageFlash();
    ctx.shake(0.25);
    ctx.effects.blood(player.pos.x, player.pos.y, 6);
    const dx = player.pos.x - fromX;
    const dy = player.pos.y - fromY;
    const d = Math.hypot(dx, dy) || 1;
    player.pos.x += (dx / d) * 0.25;
    player.pos.y += (dy / d) * 0.25;
    pushOut(ctx.map, player.pos, player.radius);
    if (player.hp > 0) return;
    if (ctx.abilities.useSecondWind()) {
      player.hp = player.maxHp * 0.3;
      player.invulnerable = 2.5;
      ctx.hero.buffs.add('secondWind', 2.5);
      ctx.hud.showBanner('SECOND WIND!', 'Not today...', 1.6);
      ctx.sfx('buff');
      this.explode(player.pos.x, player.pos.y, 2.2, 25);
      return;
    }
    ctx.flow.gameOver();
  }
}
