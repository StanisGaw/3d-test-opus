import type { GameContext } from '../core/context.ts';
import { formatMultiplier } from '../systems/combo.ts';
import { BUFF_LABELS } from '../systems/progression.ts';
import { WAVES_PER_ROUND, type ZombieKind } from '../systems/waveDirector.ts';
import type { MinimapDot } from './hud.ts';

const MINIMAP_INTERVAL = 0.1;
const INDICATOR_MARGIN = 36;

const MINIMAP_COLORS: Partial<Record<ZombieKind | 'boss', string>> = {
  boss: '#ff40ff',
  exploder: '#ffb020',
  spitter: '#90ff50',
  shield: '#80b0ff',
  bat: '#c080ff',
};

/** Copies game state into the HUD every frame: bars, round info, abilities, minimap and crate arrows. */
export class HudPresenter {
  private readonly ctx: GameContext;
  private minimapTimer = 0;

  constructor(ctx: GameContext) {
    this.ctx = ctx;
  }

  update(dt: number): void {
    const { ctx } = this;
    const { hud, director: d, player, hero, boss } = ctx;
    hud.setHealth(player.hp, player.maxHp);
    hud.setDash(ctx.stats.dash ? player.dashReady : 0);
    hud.setScore(ctx.run.score);
    hud.setCoins(ctx.meta.runCoins);
    hud.setCombo(ctx.combo.count, formatMultiplier(ctx.combo.multiplier), ctx.combo.timeLeft);
    hud.setWeapons(ctx.arsenal);
    const phase =
      d.phase === 'boss' || d.phase === 'bossWarning' ? 'BOSS' : d.phase === 'roundClear' ? 'CLEAR' : `WAVE ${Math.max(1, d.wave)}/${WAVES_PER_ROUND}`;
    const remaining = d.phase === 'wave' ? `ZOMBIES LEFT ${d.remainingToSpawn + ctx.enemies.length}` : '';
    hud.setRound(`ROUND ${d.round} · ${phase}`, remaining);
    hud.setBoss(boss ? boss.name : null, boss?.hp ?? 0, boss?.maxHp ?? 1);
    const p = hero.progression;
    hud.setLevel(p.level, p.xp, p.needed, hero.skills.points);
    hud.setBuffs(hero.buffs.list().map((b) => ({ label: BUFF_LABELS[b.id], remaining: b.remaining })));
    hud.setAbilities(ctx.abilities.views());

    this.minimapTimer -= dt;
    if (this.minimapTimer <= 0) {
      this.minimapTimer = MINIMAP_INTERVAL;
      this.drawMinimap();
    }
    this.updateIndicators();
  }

  private drawMinimap(): void {
    const { ctx } = this;
    const dots: MinimapDot[] = [
      ...ctx.props.liveBarrels.map((b) => ({ x: b.x, y: b.y, color: '#ff7a30', size: 2 })),
      ...ctx.crates.list.map((c) => ({ x: c.x, y: c.y, color: '#ffe040', size: 4 })),
      ...ctx.deployables.positions.map((t) => ({ x: t.x, y: t.y, color: '#50b0ff', size: 4 })),
      ...ctx.enemies.map((e) => ({
        x: e.pos.x,
        y: e.pos.y,
        color: e.elite ? '#ffd23a' : (MINIMAP_COLORS[e.kind] ?? '#ff3030'),
        size: e.kind === 'boss' ? 6 : e.elite ? 4 : 2,
      })),
      { x: ctx.player.pos.x, y: ctx.player.pos.y, color: '#ffffff', size: 4 },
    ];
    ctx.hud.drawMinimap(dots, ctx.map.size);
  }

  /** Arrows on the screen edge pointing at supply crates that are off screen. */
  private updateIndicators(): void {
    const { ctx } = this;
    const w = window.innerWidth;
    const h = window.innerHeight;
    const indicators: { x: number; y: number; angle: number }[] = [];
    for (const c of ctx.crates.list) {
      const p = ctx.stage.project(c.x, Math.max(0.3, c.height), c.y);
      if (Math.abs(p.x) <= 0.95 && Math.abs(p.y) <= 0.95) continue;
      const sx = (p.x * 0.5 + 0.5) * w;
      const sy = (-p.y * 0.5 + 0.5) * h;
      indicators.push({
        x: Math.max(INDICATOR_MARGIN, Math.min(w - INDICATOR_MARGIN, sx)),
        y: Math.max(INDICATOR_MARGIN, Math.min(h - INDICATOR_MARGIN, sy)),
        angle: Math.atan2(sy - h / 2, sx - w / 2) + Math.PI / 2,
      });
    }
    ctx.hud.setIndicators(indicators);
  }
}
