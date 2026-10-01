import type { GameContext } from '../core/context.ts';
import type { PerkId } from '../systems/perks.ts';
import type { RunSave } from '../systems/saveGame.ts';
import { SKILLS, type SkillId } from '../systems/skillTree.ts';

/** Collects everything needed to continue the run later, right before `nextWave`. */
export function captureCheckpoint(ctx: GameContext, nextWave: number): Omit<RunSave, 'version'> {
  const { hero } = ctx;
  const skills: Partial<Record<SkillId, number>> = {};
  for (const s of SKILLS) {
    const r = hero.skills.rank(s.id);
    if (r > 0) skills[s.id] = r;
  }
  const perks: Partial<Record<PerkId, number>> = {};
  for (const [id, n] of hero.perks.owned) if (n > 0) perks[id] = n;
  return {
    savedAt: Date.now(),
    round: ctx.director.round,
    nextWave,
    mapSeed: ctx.mapSeed,
    heroId: hero.heroId,
    run: { ...ctx.run, coins: ctx.meta.runCoins },
    hero: {
      level: hero.progression.level,
      xp: hero.progression.xp,
      totalXp: hero.progression.totalXp,
      points: hero.skills.points,
      skills,
      perks,
      hp: ctx.player.hp,
    },
    arsenal: ctx.arsenal.snapshot(),
    charges: { ...ctx.abilities.charges },
  };
}

/** Rebuilds the hero's build and run counters from a save. The map and director are set by the caller. */
export function restoreBuild(ctx: GameContext, save: RunSave): void {
  const { hero } = ctx;
  hero.setHero(save.heroId);
  hero.skills.restore(save.hero.skills, save.hero.points);
  hero.perks.restore(save.hero.perks);
  hero.progression.restore(save.hero.level, save.hero.xp, save.hero.totalXp);
  ctx.run.score = save.run.score;
  ctx.run.kills = save.run.kills;
  ctx.run.bossesDefeated = save.run.bossesDefeated;
  ctx.meta.startRun(save.run.coins);
}

/** Restores the hero's health, ammo and charges once the stats and map are in place. */
export function restoreLoadout(ctx: GameContext, save: RunSave): void {
  const s = ctx.stats;
  ctx.player.hp = Math.min(ctx.player.maxHp, save.hero.hp);
  ctx.arsenal.restore(save.arsenal);
  ctx.abilities.charges.grenades = Math.min(s.grenades, save.charges.grenades);
  ctx.abilities.charges.mines = Math.min(s.mines, save.charges.mines);
  ctx.abilities.charges.turrets = Math.min(s.turrets, save.charges.turrets);
}
