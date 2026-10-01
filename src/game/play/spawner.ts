import type { GameContext } from '../core/context.ts';
import { Boss, Enemy } from '../entities/enemies.ts';
import type { Crate } from '../entities/crates.ts';
import type { CrateKind } from '../gfx/assets.ts';
import { ELITES, rollElite } from '../systems/elites.ts';
import { roundClearCoins, roundClearXp, waveClearCoins, waveClearXp } from '../systems/progression.ts';
import type { DirectorEvent, ZombieKind } from '../systems/waveDirector.ts';
import { findTileInRing } from '../world/mapGen.ts';

/** Delay after the boss dies before the reward cards appear, so the victory can play out. */
const CARD_PICK_DELAY = 2.2;
/** Bats spawned within this many seconds of each other join the same flock. */
const FLOCK_WINDOW = 2.5;

const CRATE_WEIGHTS: readonly [CrateKind, number][] = [
  ['heavy', 30],
  ['shotgun', 22],
  ['rocket', 16],
  ['flame', 16],
  ['laser', 16],
];

const PICKUP_NAMES: Record<CrateKind, string> = {
  heavy: 'HEAVY MACHINE GUN!',
  shotgun: 'SHOTGUN!',
  rocket: 'ROCKET LAUNCHER!',
  flame: 'FLAME SHOT!',
  laser: 'LASER GUN!',
  medkit: 'MEDKIT +40',
};

/** Reacts to the wave director: spawns zombies and bosses, drops supply crates, rewards cleared waves and rounds. */
export class Spawner {
  private readonly ctx: GameContext;
  private lastBatSpawn: { x: number; y: number; time: number } | null = null;

  constructor(ctx: GameContext) {
    this.ctx = ctx;
  }

  reset(): void {
    this.lastBatSpawn = null;
  }

  handle(events: readonly DirectorEvent[]): void {
    const { ctx } = this;
    for (const e of events) {
      switch (e.type) {
        case 'banner':
          ctx.hud.showBanner(e.title, e.subtitle);
          ctx.sfx('banner');
          break;
        case 'spawn':
          this.spawnZombie(e.kind);
          break;
        case 'spawnBoss':
          this.spawnBoss();
          break;
        case 'supplyDrop':
          this.supplyDrop();
          break;
        case 'waveCleared':
          this.onWaveCleared(e.wave);
          break;
        case 'roundCleared':
          this.onRoundCleared(e.round);
          break;
        case 'newRound':
          this.onNewRound();
          break;
      }
    }
  }

  private onWaveCleared(wave: number): void {
    const { ctx } = this;
    const s = ctx.stats;
    ctx.run.score += 100 * wave * ctx.director.round;
    const xp = Math.round(waveClearXp(ctx.director.round, wave) * s.xpMult);
    ctx.hero.gainXp(xp);
    ctx.hero.showBonusXp(xp);
    this.showBonusCoins(ctx.meta.earnCoins(waveClearCoins(wave)));
    if (s.waveHeal > 0) ctx.player.heal(s.waveHeal);
    ctx.abilities.resupply();
    ctx.meta.onWaveCleared();
    ctx.flow.checkpoint(wave + 1);
  }

  private onRoundCleared(round: number): void {
    const { ctx } = this;
    ctx.run.bossesDefeated++;
    ctx.player.heal(30);
    for (const z of [...ctx.enemies]) ctx.combat.killEnemy(z, 0, 0);
    const xp = Math.round(roundClearXp(round) * ctx.stats.xpMult);
    ctx.hero.gainXp(xp);
    ctx.hero.showBonusXp(xp);
    this.showBonusCoins(ctx.meta.earnCoins(roundClearCoins(round)));
    ctx.gems.collectAll();
    ctx.meta.onRoundCleared();
    ctx.timers.after(CARD_PICK_DELAY, () => ctx.flow.offerCards());
  }

  private showBonusCoins(amount: number): void {
    const { player } = this.ctx;
    if (amount > 0) this.ctx.floaters.show(null, 'coin', amount, player.pos.x, player.pos.y, 2.1);
    this.ctx.sfx('coin');
  }

  /** Fades to black, then swaps in a fresh map, refills the round charges and saves a checkpoint. */
  private onNewRound(): void {
    const { ctx } = this;
    ctx.hud.fade(true);
    ctx.timers.after(0.6, () => {
      const leftover = ctx.gems.flush();
      if (leftover > 0) ctx.hero.gainXp(leftover);
      ctx.projectiles.clear();
      ctx.crates.clear();
      ctx.effects.clear();
      ctx.deployables.clearTurrets();
      ctx.throwables.clear();
      ctx.flow.loadMap(Math.floor(ctx.rng() * 1e9));
      ctx.abilities.refill();
      ctx.hud.fade(false);
      ctx.flow.checkpoint(1);
    });
  }

  spawnZombie(kind: ZombieKind, at?: { x: number; y: number }, canBeElite = !at): void {
    const { ctx } = this;
    let x: number;
    let y: number;
    const flock = this.lastBatSpawn;
    const inFlock = flock !== null && ctx.time - flock.time < FLOCK_WINDOW;
    if (at) {
      x = at.x;
      y = at.y;
    } else if (kind === 'bat' && flock && inFlock) {
      // Bats arrive in flocks: follow-up bats appear next to the previous one.
      x = flock.x + (ctx.rng() - 0.5) * 1.6;
      y = flock.y + (ctx.rng() - 0.5) * 1.6;
    } else {
      const { x: px, y: py } = ctx.player.pos;
      const tile = findTileInRing(ctx.map, ctx.rng, px, py, 12, 19) ?? findTileInRing(ctx.map, ctx.rng, px, py, 6, 12);
      if (!tile) return;
      x = tile.x + 0.5;
      y = tile.y + 0.5;
    }
    if (kind === 'bat') {
      if (!inFlock) ctx.sfx('screech');
      this.lastBatSpawn = { x, y, time: ctx.time };
    }
    const d = ctx.director;
    const elite = canBeElite ? rollElite(kind, d.round, d.wave, ctx.rng(), ctx.rng()) : null;
    const enemy = Enemy.zombie(kind, d.round, ctx.assets, ctx.scene, x, y, elite);
    ctx.enemies.push(enemy);
    if (elite) {
      ctx.floaters.showText(`ELITE · ${ELITES[elite].name.toUpperCase()}`, 'elite', x, y, enemy.visualHeight + 0.3);
      ctx.sfx('elite');
    }
  }

  /** Boss minions: only on tiles the flow field can reach. */
  summon(x: number, y: number): void {
    const { ctx } = this;
    if (!ctx.map.reachable[Math.floor(y) * ctx.map.size + Math.floor(x)]) return;
    this.spawnZombie(ctx.rng() < 0.3 ? 'runner' : 'walker', { x, y });
  }

  spawnBoss(): void {
    const { ctx } = this;
    const { x, y } = ctx.player.pos;
    const tile = findTileInRing(ctx.map, ctx.rng, x, y, 8, 12) ?? findTileInRing(ctx.map, ctx.rng, x, y, 4, 16);
    if (!tile) {
      ctx.director.notifyBossDefeated();
      return;
    }
    const boss = new Boss(ctx.director.round, ctx.assets, ctx.scene, tile.x + 0.5, tile.y + 0.5);
    ctx.boss = boss;
    ctx.enemies.push(boss);
    ctx.effects.dust(boss.pos.x, boss.pos.y);
    ctx.shake(0.4);
    ctx.hud.showBanner(boss.name, 'Boss battle!', 2.2);
  }

  supplyDrop(kind?: CrateKind, near?: { x: number; y: number }): void {
    const { ctx } = this;
    const origin = near ?? ctx.player.pos;
    const tile = findTileInRing(ctx.map, ctx.rng, origin.x, origin.y, near ? 1 : 3, near ? 3 : 8);
    if (!tile) return;
    ctx.crates.drop(kind ?? this.randomCrateKind(), tile.x + 0.5, tile.y + 0.5);
    ctx.sfx('chute');
  }

  /** Medkits are more likely when the hero is hurt. */
  private randomCrateKind(): CrateKind {
    const { ctx } = this;
    const medkitChance = ctx.player.hp < ctx.player.maxHp * 0.5 ? 0.35 : 0.14;
    if (ctx.rng() < medkitChance) return 'medkit';
    const total = CRATE_WEIGHTS.reduce((s, [, w]) => s + w, 0);
    let roll = ctx.rng() * total;
    for (const [kind, weight] of CRATE_WEIGHTS) {
      roll -= weight;
      if (roll <= 0) return kind;
    }
    return 'heavy';
  }

  /** Picks up supply crates the hero walks into. */
  updateCrates(dt: number): void {
    const { ctx } = this;
    const picked = ctx.crates.update(dt, ctx.player.pos.x, ctx.player.pos.y, (c) => ctx.effects.dust(c.x, c.y));
    for (const c of picked) this.collect(c);
  }

  private collect(c: Crate): void {
    const { ctx } = this;
    if (c.kind === 'medkit') ctx.player.heal(40);
    else ctx.arsenal.pickup(c.kind);
    ctx.hud.toast(PICKUP_NAMES[c.kind]);
    ctx.sfx('pickup');
    ctx.effects.sparks(c.x, 0.4, c.y, 16, 0xfff080);
  }
}
