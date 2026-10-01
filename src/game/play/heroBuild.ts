import type { GameContext } from '../core/context.ts';
import { DEFAULT_HERO, type HeroId, applyHero } from '../systems/heroes.ts';
import { PERK_BY_ID, PerkDeck, type PerkId, applyPerks } from '../systems/perks.ts';
import { Buffs, Progression } from '../systems/progression.ts';
import { applyUpgrades } from '../systems/shop.ts';
import { BASE_MAX_HP, type BuyResult, type PlayerStats, type SkillId, SkillTree, statLines } from '../systems/skillTree.ts';

/** Frenzy buff: fire rate and move speed bonus after a kill. */
export const FRENZY = { time: 4, fireRate: 1.35, speed: 1.15 } as const;
/** Overdrive buff: overloads every sentry turret (red glow, faster fire, rockets on the top tier). */
export const OVERDRIVE = { time: 12, cooldown: 40 } as const;

/** The hero's build for one run: level, skill tree, reward cards, timed buffs and the stats they produce. */
export class HeroBuild {
  readonly skills = new SkillTree();
  readonly perks = new PerkDeck();
  readonly progression = new Progression();
  readonly buffs = new Buffs();
  stats: PlayerStats = this.skills.stats();
  /** Weapon damage multiplier including timed buffs. */
  damageMult = 1;
  /** The hero played in this run. */
  heroId: HeroId = DEFAULT_HERO;
  private readonly ctx: GameContext;

  constructor(ctx: GameContext) {
    this.ctx = ctx;
  }

  /** Picks the hero for the next run: look and passive. */
  setHero(id: HeroId): void {
    this.heroId = id;
    this.ctx.player.setLook(this.ctx.assets.heroes[id]);
  }

  reset(): void {
    this.skills.reset();
    this.perks.reset();
    this.progression.reset();
    this.buffs.clear();
    this.ctx.player.maxHp = BASE_MAX_HP;
  }

  /** Recomputes stats from the skill tree and reward cards. Newly gained charges are usable right away. */
  applyStats(): void {
    const { ctx } = this;
    const prev = this.stats;
    const next = applyPerks(applyUpgrades(applyHero(this.skills.stats(), this.heroId), ctx.meta.upgrades), this.perks.owned);
    this.stats = next;
    ctx.director.dropRateMult = next.dropRateMult;
    ctx.player.setMaxHp(next.maxHp);
    ctx.abilities.grantNewCharges(prev, next);
    ctx.deployables.setDroneCount(next.drones);
    ctx.hud.setStats(statLines(next));
  }

  /** Applies skill multipliers plus active buffs to weapons and movement. Called every frame. */
  refreshModifiers(): void {
    const { ctx, stats: s } = this;
    const frenzy = this.buffs.has('frenzy');
    ctx.arsenal.mods.fireRateMult = s.fireRateMult * (frenzy ? FRENZY.fireRate : 1);
    ctx.arsenal.mods.magMult = s.magMult;
    ctx.arsenal.mods.reloadMult = s.reloadMult;
    ctx.player.speedMult = s.speedMult * (frenzy ? FRENZY.speed : 1);
    ctx.player.dashCooldownMult = s.dashCooldownMult;
    this.damageMult = s.damageMult;
  }

  gainXp(amount: number): void {
    const { ctx } = this;
    const levels = this.progression.add(amount);
    if (levels <= 0) return;
    this.skills.points += levels;
    ctx.player.heal(ctx.player.maxHp * 0.15);
    ctx.hud.toast(`LEVEL ${this.progression.level}! +${levels} SKILL ${levels === 1 ? 'POINT' : 'POINTS'} [TAB]`);
    ctx.sfx('levelup');
    ctx.meta.checkAchievements();
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      ctx.effects.sparks(ctx.player.pos.x + Math.cos(a) * 0.6, 0.3, ctx.player.pos.y + Math.sin(a) * 0.6, 2, 0xe0a8ff);
    }
  }

  /** Shows bonus XP (wave or round clear) floating above the hero. */
  showBonusXp(amount: number): void {
    const { player } = this.ctx;
    this.ctx.floaters.show(null, 'xp', amount, player.pos.x, player.pos.y, 1.7);
  }

  buySkill(id: SkillId): BuyResult {
    const result = this.skills.buy(id);
    if (result === 'ok') this.applyStats();
    return result;
  }

  /** Takes a reward card; returns false if it cannot be taken. */
  takePerk(id: PerkId): boolean {
    if (!this.perks.take(id)) return false;
    if (id === 'training') this.skills.points++;
    this.applyStats();
    if (id === 'ironSkin') this.ctx.player.heal(this.ctx.player.maxHp);
    this.ctx.hud.toast(`${PERK_BY_ID[id].name.toUpperCase()}!`);
    this.ctx.meta.checkAchievements();
    return true;
  }

  /** Starts or refreshes Frenzy after a kill, if the skill is learned. */
  onKill(): void {
    if (!this.stats.frenzy) return;
    if (!this.buffs.has('frenzy')) this.ctx.sfx('buff');
    this.buffs.add('frenzy', FRENZY.time);
  }
}
