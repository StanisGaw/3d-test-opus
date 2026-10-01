import type { GameContext } from '../core/context.ts';
import { type AchievementDef, BurstCounter, type LifetimeStats, newlyUnlocked } from '../systems/achievements.ts';
import { type ProfileData, type RunRecord, addToLeaderboard, loadProfile, saveProfile } from '../systems/profile.ts';
import { type PurchaseResult, type UpgradeId, type UpgradeLevels, checkPurchase, levelOf, upgradeCost } from '../systems/shop.ts';
import type { KeyValueStore } from '../systems/storage.ts';
import type { ZombieKind } from '../systems/waveDirector.ts';
import { HERO_BY_ID, type HeroId } from '../systems/heroes.ts';

export interface RunResult {
  readonly coinsEarned: number;
  readonly totalCoins: number;
  /** 1-based leaderboard place, or null if the run did not make the top list. */
  readonly place: number | null;
}

/**
 * Progress that survives between runs: coins, base upgrades, achievements, lifetime stats,
 * leaderboard and settings. Gameplay reports events here; the profile is written to storage
 * at checkpoints, purchases, unlocks and the end of a run.
 */
export class Meta {
  readonly profile: ProfileData;
  /** Coins earned in the current run; they go to the wallet when the run ends (the HUD keeps showing them). */
  runCoins = 0;
  private readonly unlocked: Set<string>;
  private readonly burst = new BurstCounter();
  private hurtThisWave = false;
  private readonly store: KeyValueStore;
  private readonly ctx: GameContext;

  constructor(store: KeyValueStore, ctx: GameContext) {
    this.store = store;
    this.ctx = ctx;
    this.profile = loadProfile(store);
    this.unlocked = new Set(this.profile.achievements);
  }

  get coins(): number {
    return this.profile.coins;
  }

  get upgrades(): UpgradeLevels {
    return this.profile.upgrades;
  }

  get lifetime(): Readonly<LifetimeStats> {
    return this.profile.lifetime;
  }

  isUnlocked(id: string): boolean {
    return this.unlocked.has(id);
  }

  persist(): void {
    saveProfile(this.store, this.profile);
  }

  // ---------------------------------------------------------------- shop

  buy(id: UpgradeId): PurchaseResult {
    const result = checkPurchase(this.profile.upgrades, this.profile.coins, id);
    if (result !== 'ok') return result;
    const level = levelOf(this.profile.upgrades, id);
    this.profile.coins -= upgradeCost(id, level);
    this.profile.upgrades[id] = level + 1;
    this.profile.lifetime.upgradesBought++;
    this.checkAchievements();
    this.persist();
    return 'ok';
  }

  setMusic(on: boolean): void {
    this.profile.settings.music = on;
    this.persist();
  }

  // ---------------------------------------------------------------- heroes

  hasHero(id: HeroId): boolean {
    return this.profile.heroes.includes(id);
  }

  /** Buys a hero with coins. */
  unlockHero(id: HeroId): 'ok' | 'owned' | 'noCoins' {
    if (this.hasHero(id)) return 'owned';
    const cost = HERO_BY_ID[id].cost;
    if (this.profile.coins < cost) return 'noCoins';
    this.profile.coins -= cost;
    this.profile.heroes.push(id);
    this.profile.lifetime.heroesUnlocked = this.profile.heroes.length;
    this.checkAchievements();
    this.persist();
    return 'ok';
  }

  selectHero(id: HeroId): void {
    if (!this.hasHero(id)) return;
    this.profile.selectedHero = id;
    this.persist();
  }

  // ---------------------------------------------------------------- run events

  startRun(coins = 0): void {
    this.runCoins = coins;
    this.burst.reset();
    this.hurtThisWave = false;
  }

  /** Adds coins (boosted by Bounty Hunter) and returns how many were really added. */
  earnCoins(base: number): number {
    const amount = Math.max(0, Math.round(base * this.ctx.stats.coinMult));
    this.runCoins += amount;
    this.profile.lifetime.coinsEarned += amount;
    return amount;
  }

  onKill(kind: ZombieKind | 'boss', elite = false): void {
    const life = this.profile.lifetime;
    life.kills++;
    if (kind === 'bat') life.bats++;
    if (kind === 'boss') life.bosses++;
    if (elite) life.elites++;
    life.bestBurst = Math.max(life.bestBurst, this.burst.add(this.ctx.time));
    life.bestCombo = Math.max(life.bestCombo, this.ctx.combo.count);
    this.checkAchievements();
  }

  onShieldBroken(): void {
    this.profile.lifetime.shieldsBroken++;
    this.checkAchievements();
  }

  onHeroHurt(): void {
    this.hurtThisWave = true;
  }

  onWaveCleared(): void {
    if (!this.hurtThisWave) this.profile.lifetime.flawlessWaves++;
    this.hurtThisWave = false;
    this.checkAchievements();
  }

  /** Damage taken during the boss fight does not spoil the first wave of the next round. */
  onRoundCleared(): void {
    this.hurtThisWave = false;
    this.checkAchievements();
  }

  /** Updates best-of records from the run in progress and unlocks achievements. */
  checkAchievements(): void {
    const { ctx } = this;
    const life = this.profile.lifetime;
    if (ctx.playing || ctx.state === 'cards' || ctx.state === 'skills') {
      life.bestRound = Math.max(life.bestRound, ctx.director.round);
      life.bestLevel = Math.max(life.bestLevel, ctx.hero.progression.level);
      life.bestScore = Math.max(life.bestScore, ctx.run.score);
      life.bestCards = Math.max(life.bestCards, ctx.hero.perks.total);
    }
    const fresh = newlyUnlocked(this.unlocked, life);
    if (fresh.length === 0) return;
    for (const a of fresh) this.unlock(a);
    this.persist();
  }

  private unlock(a: AchievementDef): void {
    this.unlocked.add(a.id);
    this.profile.achievements.push(a.id);
    this.profile.coins += a.reward;
    this.ctx.hud.showAchievement(a.name, a.text, a.reward);
    this.ctx.sfx('achievement');
  }

  /** Banks the run's coins, records it on the leaderboard and saves the profile. */
  endRun(record: Omit<RunRecord, 'date'>): RunResult {
    const coinsEarned = this.runCoins;
    this.profile.coins += coinsEarned;
    this.profile.lifetime.runs++;
    this.profile.lifetime.bestScore = Math.max(this.profile.lifetime.bestScore, record.score);
    const { board, place } = addToLeaderboard(this.profile.leaderboard, { ...record, date: Date.now() });
    this.profile.leaderboard = board;
    this.checkAchievements();
    this.persist();
    return { coinsEarned, totalCoins: this.profile.coins, place };
  }
}
