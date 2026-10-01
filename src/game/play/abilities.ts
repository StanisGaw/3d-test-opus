import type { GameContext } from '../core/context.ts';
import type { PlayerStats } from '../systems/skillTree.ts';
import type { AbilityView } from '../ui/hud.ts';
import { isWalkable } from '../world/mapGen.ts';
import { OVERDRIVE } from './heroBuild.ts';

/** Grenades, mines, turrets (charges per round), Overdrive (cooldown) and the once-per-round Second Wind. */
export class Abilities {
  readonly charges = { grenades: 0, mines: 0, turrets: 0 };
  overdriveCooldown = 0;
  private secondWindUsed = false;
  private readonly ctx: GameContext;

  constructor(ctx: GameContext) {
    this.ctx = ctx;
  }

  reset(): void {
    this.overdriveCooldown = 0;
  }

  /** Fills every charge to the maximum and re-arms Second Wind (start of a run and of each round). */
  refill(): void {
    const s = this.ctx.stats;
    this.charges.grenades = s.grenades;
    this.charges.mines = s.mines;
    this.charges.turrets = s.turrets;
    this.secondWindUsed = false;
  }

  /** Adds charges that a stats change just unlocked, so a new skill works right away. */
  grantNewCharges(prev: PlayerStats, next: PlayerStats): void {
    this.charges.grenades += Math.max(0, next.grenades - prev.grenades);
    this.charges.mines += Math.max(0, next.mines - prev.mines);
    this.charges.turrets += Math.max(0, next.turrets - prev.turrets);
  }

  /** Resupply skill: returns grenades and mines after a wave, up to the round maximum. */
  resupply(): void {
    const s = this.ctx.stats;
    if (s.resupply <= 0 || (s.grenades <= 0 && s.mines <= 0)) return;
    this.charges.grenades = Math.min(s.grenades, this.charges.grenades + s.resupply);
    this.charges.mines = Math.min(s.mines, this.charges.mines + s.resupply);
    this.ctx.hud.toast('RESUPPLY!');
  }

  update(dt: number): void {
    this.overdriveCooldown = Math.max(0, this.overdriveCooldown - dt);
  }

  /** Uses Second Wind if it is learned and still unused this round. */
  useSecondWind(): boolean {
    if (!this.ctx.stats.secondWind || this.secondWindUsed) return false;
    this.secondWindUsed = true;
    return true;
  }

  private locked(what: string): void {
    this.ctx.hud.toast(`${what}: UNLOCK IN SKILL TREE [TAB]`);
    this.ctx.sfx('error');
  }

  /** Dash [Space]: works only after the Dash skill is learned. */
  dash(): void {
    const { ctx } = this;
    if (!ctx.stats.dash) return this.locked('DASH');
    if (!ctx.player.tryDash()) return;
    ctx.sfx('dash');
    ctx.effects.dust(ctx.player.pos.x, ctx.player.pos.y);
  }

  throwGrenade(): void {
    const { ctx } = this;
    if (ctx.stats.grenades <= 0) return this.locked('GRENADES');
    if (this.charges.grenades <= 0) return ctx.hud.toast('NO GRENADES');
    this.charges.grenades--;
    ctx.throwables.throwGrenade(ctx.map, ctx.player.pos, ctx.aimPoint, ctx.stats.cluster);
    ctx.sfx('throw');
  }

  placeMine(): void {
    const { ctx } = this;
    if (ctx.stats.mines <= 0) return this.locked('MINES');
    if (this.charges.mines <= 0) return ctx.hud.toast('NO MINES');
    this.charges.mines--;
    ctx.throwables.placeMine(ctx.player.pos.x, ctx.player.pos.y);
    ctx.sfx('mineArm');
  }

  deployTurret(): void {
    const { ctx } = this;
    const { player } = ctx;
    if (ctx.stats.turrets <= 0) return this.locked('TURRETS');
    if (this.charges.turrets <= 0) return ctx.hud.toast('NO TURRETS');
    const front = { x: player.pos.x + player.aim.x * 0.9, y: player.pos.y + player.aim.y * 0.9 };
    const spot = isWalkable(ctx.map, Math.floor(front.x), Math.floor(front.y)) ? front : { ...player.pos };
    this.charges.turrets--;
    ctx.deployables.deployTurret(spot.x, spot.y, ctx.stats.turretTier, ctx.stats.turretDuration);
    ctx.effects.dust(spot.x, spot.y);
    ctx.sfx('deploy');
  }

  activateOverdrive(): void {
    const { ctx } = this;
    if (!ctx.stats.overdrive) return this.locked('OVERDRIVE');
    if (this.overdriveCooldown > 0) return ctx.hud.toast(`OVERDRIVE READY IN ${Math.ceil(this.overdriveCooldown)}s`);
    this.overdriveCooldown = OVERDRIVE.cooldown;
    ctx.hero.buffs.add('overdrive', OVERDRIVE.time);
    ctx.hud.toast('OVERDRIVE!');
    ctx.sfx('buff');
    ctx.shake(0.3);
  }

  views(): AbilityView[] {
    const s = this.ctx.stats;
    const c = this.charges;
    return [
      { id: 'grenade', key: 'G', label: 'Grenade', unlocked: s.grenades > 0, charges: c.grenades, maxCharges: s.grenades, cooldown: 0, active: false },
      { id: 'mine', key: 'Q', label: 'Mine', unlocked: s.mines > 0, charges: c.mines, maxCharges: s.mines, cooldown: 0, active: false },
      { id: 'turret', key: 'T', label: 'Turret', unlocked: s.turrets > 0, charges: c.turrets, maxCharges: s.turrets, cooldown: 0, active: false },
      {
        id: 'overdrive',
        key: 'E',
        label: 'Overdrive',
        unlocked: s.overdrive,
        charges: null,
        maxCharges: 0,
        cooldown: this.overdriveCooldown / OVERDRIVE.cooldown,
        active: this.ctx.hero.buffs.has('overdrive'),
      },
    ];
  }
}
