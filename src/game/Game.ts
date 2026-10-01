import { GameContext, type GameFlow } from './core/context.ts';
import { Stage } from './core/stage.ts';
import { createAssets, createMinimapCanvas } from './gfx/assets.ts';
import { WorldView } from './gfx/worldView.ts';
import { captureCheckpoint, restoreBuild, restoreLoadout } from './play/checkpoint.ts';
import { Sfx } from './systems/audio.ts';
import { Input } from './systems/input.ts';
import { TouchControls, isTouchDevice } from './systems/touch.ts';
import { PAD, PLAY_BUTTONS, PadReader, type MenuAction as PadMenuAction, menuAction, screenToMapDir } from './systems/gamepad.ts';
import { SCREEN_RIGHT, SCREEN_UP, SIN_ELEVATION } from './gfx/iso.ts';
import type { TrackId } from './systems/music.ts';
import type { PerkId } from './systems/perks.ts';
import { type RunSave, clearSave, describeCheckpoint, loadSave, writeSave } from './systems/saveGame.ts';
import { type UpgradeId, startingKit } from './systems/shop.ts';
import { HERO_BY_ID, type HeroId } from './systems/heroes.ts';
import type { SkillId } from './systems/skillTree.ts';
import { browserStore } from './systems/storage.ts';
import { WaveDirector } from './systems/waveDirector.ts';
import { CardPickView } from './ui/cardPickView.ts';
import { FloatingText } from './ui/floatingText.ts';
import { Hud, type MenuAction } from './ui/hud.ts';
import { HudPresenter } from './ui/hudPresenter.ts';
import { HeroSelectView, RecordsView, ShopView } from './ui/metaViews.ts';
import { SkillTreeView } from './ui/skillTreeView.ts';
import { separateEnemies } from './world/crowd.ts';
import { FlowField } from './world/flowField.ts';
import { generateMap } from './world/mapGen.ts';
import { placeProps } from './world/props.ts';

const MAX_FRAME_TIME = 0.05;
const SLOW_MO_SCALE = 0.35;
/** World speed during a hit-stop: almost frozen, but not a hard pause. */
const HIT_STOP_SCALE = 0.05;
const GAME_OVER_DELAY = 1.2;
/** Boss music tempo once the boss is below half health. */
const ENRAGED_MUSIC_SPEED = 1.15;
/** How far ahead of the hero the right stick puts the aim point (grenades land there). */
const PAD_AIM_DISTANCE = 6;
/** Shared merge key so crystals picked up together show one "+XP" label. */
const XP_FLOAT_KEY = {};

/**
 * Top level: owns the frame loop, keyboard handling and screen flow (menu, pause, skill tree,
 * reward cards, shop, records, game over). Gameplay itself lives in GameContext and the play/ modules.
 */
export class Game implements GameFlow {
  private readonly stage: Stage;
  private readonly input: Input;
  private readonly audio = new Sfx();
  private readonly hud: Hud;
  private readonly floaters: FloatingText;
  private readonly skillView: SkillTreeView;
  private readonly cardView: CardPickView;
  private readonly shopView: ShopView;
  private readonly recordsView: RecordsView;
  private readonly heroView: HeroSelectView;
  private readonly ctx: GameContext;
  private readonly presenter: HudPresenter;
  private worldView: WorldView | null = null;
  private lastFrame = performance.now();
  private wasReloading = false;
  private readonly padReader = new PadReader();
  private pad: Gamepad | null = null;
  private touch: TouchControls | null = null;

  constructor(container: HTMLElement, hudRoot: HTMLElement) {
    this.stage = new Stage(container);
    const assets = createAssets();
    this.input = new Input(this.stage.canvas);
    this.hud = new Hud(hudRoot, assets.weapons);
    this.floaters = new FloatingText(hudRoot);
    this.ctx = new GameContext({
      stage: this.stage,
      assets,
      hud: this.hud,
      floaters: this.floaters,
      audio: this.audio,
      flow: this,
      store: browserStore(),
    });
    this.presenter = new HudPresenter(this.ctx);
    this.skillView = new SkillTreeView(hudRoot, (id) => this.buySkill(id), () => this.closeSkills());
    this.cardView = new CardPickView(hudRoot, (id) => this.pickCard(id));
    this.shopView = new ShopView(hudRoot, this.ctx.meta, (id) => this.buyUpgrade(id), () => this.closeMetaView());
    this.recordsView = new RecordsView(hudRoot, this.ctx.meta, () => this.closeMetaView());
    this.heroView = new HeroSelectView(
      hudRoot,
      this.ctx.meta,
      assets.heroIcons,
      (id) => this.pickHero(id),
      (id) => this.unlockHero(id),
      () => this.closeMetaView(),
    );
    this.audio.setMusicEnabled(this.ctx.meta.profile.settings.music);
    if (isTouchDevice()) this.enableTouch();

    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.ctx.playing) this.pause();
    });
    window.addEventListener('pagehide', () => this.ctx.meta.persist());
    // Browsers only allow audio after a user gesture; the first one starts the menu music.
    const unlockAudio = (): void => this.audio.unlock();
    window.addEventListener('pointerdown', unlockAudio, { once: true });
    window.addEventListener('keydown', unlockAudio, { once: true });
    this.loadMap(Math.floor(this.ctx.rng() * 1e9));
    this.showMenu();
    requestAnimationFrame(this.loop);
  }

  // ---------------------------------------------------------------- menus

  private get save(): RunSave | null {
    return loadSave(this.ctx.store);
  }

  private showMenu(): void {
    const { ctx } = this;
    ctx.state = 'title';
    this.hud.setBoss(null);
    const save = this.save;
    const actions: MenuAction[] = [];
    if (save) actions.push({ label: 'Continue', detail: describeCheckpoint(save), primary: true, onClick: () => this.startGame(save) });
    actions.push({ label: 'New game', detail: 'choose a hero', primary: !save, onClick: () => this.openMetaView('heroes') });
    actions.push({ label: 'Base shop', detail: `${ctx.meta.coins} coins`, onClick: () => this.openMetaView('shop') });
    actions.push({ label: 'Records', onClick: () => this.openMetaView('records') });
    this.hud.showTitle({ coins: ctx.meta.coins, checkpoint: save ? describeCheckpoint(save) : null, musicOn: this.audio.musicEnabled }, actions);
  }

  private openMetaView(which: 'shop' | 'records' | 'heroes'): void {
    this.ctx.state = 'title';
    this.hud.hideOverlay();
    if (which === 'shop') this.shopView.open();
    else if (which === 'records') this.recordsView.open();
    else this.heroView.open();
  }

  private closeMetaView(): void {
    this.shopView.close();
    this.recordsView.close();
    this.heroView.close();
    this.showMenu();
  }

  private pickHero(id: HeroId): void {
    this.heroView.close();
    this.ctx.meta.selectHero(id);
    this.startGame(null, id);
  }

  private unlockHero(id: HeroId): void {
    if (this.ctx.meta.unlockHero(id) === 'ok') {
      this.ctx.sfx('buy');
      this.hud.toast(`${HERO_BY_ID[id].name.toUpperCase()} UNLOCKED!`);
    } else {
      this.ctx.sfx('error');
      this.heroView.reject(id);
    }
    this.heroView.render();
    this.heroView.focusHero(id);
  }

  private buyUpgrade(id: UpgradeId): void {
    if (this.ctx.meta.buy(id) === 'ok') {
      this.ctx.sfx('buy');
    } else {
      this.ctx.sfx('error');
      this.shopView.reject(id);
    }
    this.shopView.render();
  }

  private toggleMusic(): void {
    const on = !this.audio.musicEnabled;
    this.audio.setMusicEnabled(on);
    this.ctx.meta.setMusic(on);
    this.hud.toast(on ? 'MUSIC ON [N]' : 'MUSIC OFF [N]');
  }

  // ---------------------------------------------------------------- runs

  /** Starts a run: from a checkpoint, or a new one (a previous checkpoint is then banked and dropped). */
  private startGame(save: RunSave | null, heroId: HeroId = this.ctx.meta.profile.selectedHero): void {
    this.audio.unlock();
    this.hud.hideOverlay();
    this.stage.focus();
    if (!save) this.abandonSave();
    this.newGame(save, heroId);
  }

  /** A run left behind by starting a new game still pays its coins and counts on the leaderboard. */
  private abandonSave(): void {
    const old = this.save;
    if (!old) return;
    this.ctx.meta.startRun(old.run.coins);
    this.ctx.meta.endRun({ score: old.run.score, round: old.round, wave: Math.min(old.nextWave - 1, 3), level: old.hero.level, kills: old.run.kills, hero: old.heroId });
    clearSave(this.ctx.store);
  }

  private newGame(save: RunSave | null, heroId: HeroId): void {
    const { ctx } = this;
    for (const e of [...ctx.enemies, ...ctx.dying]) e.dispose();
    ctx.enemies.length = 0;
    ctx.dying.length = 0;
    ctx.boss = null;
    ctx.projectiles.clear();
    ctx.crates.clear();
    ctx.effects.clear();
    ctx.timers.clear();
    ctx.arsenal.reset();
    this.floaters.clear();
    ctx.deployables.clear();
    ctx.throwables.clear();
    ctx.gems.clear();
    this.cardView.close();
    ctx.hero.reset();
    ctx.hero.setHero(save ? save.heroId : heroId);
    ctx.abilities.reset();
    ctx.spawner.reset();
    ctx.director = new WaveDirector(ctx.rng);
    ctx.run.score = 0;
    ctx.run.kills = 0;
    ctx.run.bossesDefeated = 0;
    ctx.slowMo = 0;
    ctx.freeze = 0;
    ctx.combo.reset();
    const kit = startingKit(ctx.meta.upgrades);
    if (save) {
      restoreBuild(ctx, save);
      ctx.director.resumeAt(save.round, save.nextWave);
    } else {
      ctx.meta.startRun();
      ctx.hero.skills.points = kit.points;
    }
    ctx.hero.applyStats();
    ctx.abilities.refill();
    this.loadMap(save ? save.mapSeed : Math.floor(ctx.rng() * 1e9));
    ctx.player.reset(ctx.map.start.x + 0.5, ctx.map.start.y + 0.5);
    ctx.player.show();
    if (save) restoreLoadout(ctx, save);
    else for (const w of [...kit.weapons, ...HERO_BY_ID[heroId].startWeapons]) ctx.arsenal.pickup(w);
    this.hud.setBoss(null);
    ctx.state = 'playing';
    if (!save) this.checkpoint(1);
  }

  /** Writes the run to storage so it can be continued before `nextWave`. */
  checkpoint(nextWave: number): void {
    writeSave(this.ctx.store, captureCheckpoint(this.ctx, nextWave));
    this.ctx.meta.persist();
    this.hud.flashSaved();
  }
  loadMap(seed: number): void {
    const { ctx } = this;
    this.worldView?.dispose();
    ctx.mapSeed = seed;
    ctx.map = generateMap(seed);
    ctx.field = new FlowField(ctx.map);
    this.worldView = new WorldView(ctx.map, ctx.assets);
    this.stage.scene.add(this.worldView.group);
    ctx.player.teleport(ctx.map.start.x + 0.5, ctx.map.start.y + 0.5);
    ctx.props.load(ctx.map, placeProps(ctx.map));
    this.hud.setMinimapBase(createMinimapCanvas(ctx.map));
  }

  /** Back to gameplay from any modal screen. */
  private resumePlay(): void {
    this.ctx.state = 'playing';
    this.lastFrame = performance.now();
    this.stage.focus();
  }

  private pause(): void {
    this.ctx.state = 'paused';
    this.input.firing = false;
    this.ctx.meta.persist();
    this.hud.showPause([
      { label: 'Resume', primary: true, onClick: () => this.resume() },
      { label: 'Quit to menu', detail: 'keeps the last checkpoint', onClick: () => this.quitToMenu() },
    ]);
  }

  private resume(): void {
    this.hud.hideOverlay();
    this.resumePlay();
  }

  /** Leaves the run; it can be continued from the last checkpoint. */
  private quitToMenu(): void {
    this.skillView.close();
    this.cardView.close();
    this.ctx.meta.persist();
    this.showMenu();
  }

  gameOver(): void {
    const { ctx } = this;
    ctx.state = 'gameover';
    ctx.player.hide();
    ctx.effects.blood(ctx.player.pos.x, ctx.player.pos.y, 30);
    ctx.effects.explosion(ctx.player.pos.x, ctx.player.pos.y, 0.8);
    ctx.sfx('explosion');
    this.hud.setBoss(null);
    clearSave(ctx.store);
    const stats = {
      score: ctx.run.score,
      round: ctx.director.round,
      wave: ctx.director.wave,
      kills: ctx.run.kills,
      bosses: ctx.run.bossesDefeated,
      level: ctx.hero.progression.level,
      hero: ctx.hero.heroId,
    };
    const result = ctx.meta.endRun(stats);
    ctx.timers.after(GAME_OVER_DELAY, () => {
      if (ctx.state !== 'gameover') return;
      this.hud.showGameOver({ ...stats, ...result }, [
        { label: 'Play again [R]', primary: true, onClick: () => this.startGame(null) },
        { label: 'Base shop', detail: `${result.totalCoins} coins`, onClick: () => this.openMetaView('shop') },
        { label: 'Records', onClick: () => this.openMetaView('records') },
        { label: 'Main menu', onClick: () => this.showMenu() },
      ]);
    });
  }

  private openSkills(): void {
    this.ctx.state = 'skills';
    this.input.firing = false;
    this.skillView.open(this.ctx.hero.skills, this.ctx.hero.progression.level, this.ctx.stats);
  }

  private closeSkills(): void {
    if (this.ctx.state !== 'skills') return;
    this.skillView.close();
    this.resumePlay();
  }

  private buySkill(id: SkillId): void {
    const { hero } = this.ctx;
    if (hero.buySkill(id) === 'ok') {
      this.ctx.sfx('skill');
    } else {
      this.ctx.sfx('error');
      this.skillView.reject(id);
    }
    this.skillView.render(hero.skills, hero.progression.level, hero.stats);
  }

  offerCards(): void {
    const { ctx } = this;
    if (!ctx.playing) return;
    const offer = ctx.hero.perks.offer(ctx.rng);
    if (offer.length === 0) return;
    ctx.state = 'cards';
    this.input.firing = false;
    this.hud.hideBanner();
    ctx.sfx('banner');
    this.cardView.open(offer, ctx.hero.perks, ctx.director.round);
  }

  private pickCard(id: PerkId): void {
    if (this.ctx.state !== 'cards' || !this.ctx.hero.takePerk(id)) return;
    this.cardView.close();
    this.ctx.sfx('pickup');
    this.resumePlay();
  }

  // ---------------------------------------------------------------- frame loop

  private readonly loop = (now: number): void => {
    requestAnimationFrame(this.loop);
    const { ctx } = this;
    const rawDt = Math.min(MAX_FRAME_TIME, (now - this.lastFrame) / 1000);
    this.lastFrame = now;
    if (this.input.aimSource === 'mouse') this.hud.moveCrosshair(this.input.mouseX, this.input.mouseY);
    this.pollPad();
    this.pollTouch();
    this.handleKeys();
    this.updateMusic();
    const simulating = ctx.state === 'playing' || ctx.state === 'gameover';
    if (simulating) {
      ctx.slowMo -= rawDt;
      ctx.freeze -= rawDt;
    }
    const timeScale = ctx.freeze > 0 ? HIT_STOP_SCALE : ctx.slowMo > 0 ? SLOW_MO_SCALE : 1;
    if (simulating) this.update(rawDt * timeScale, rawDt);
    this.stage.follow(ctx.player.pos.x, ctx.player.pos.y, rawDt);
    if (simulating) this.floaters.update(rawDt * timeScale, this.stage.camera, window.innerWidth, window.innerHeight);
    this.stage.render();
  };

  private update(dt: number, rawDt: number): void {
    const { ctx } = this;
    ctx.time += dt;
    this.hud.update(rawDt);
    ctx.timers.update(rawDt);

    const alive = ctx.playing;
    if (alive) {
      const screenAim = this.aim();
      ctx.hero.buffs.update(dt);
      ctx.abilities.update(dt);
      ctx.hero.refreshModifiers();
      ctx.arsenal.update(dt);
      if (ctx.stats.regen > 0) ctx.player.heal(ctx.stats.regen * dt);
      ctx.player.update(dt, this.input, ctx.map, ctx.aimPoint, screenAim, ctx.arsenal.current);
      ctx.props.pushOut(ctx.player.pos, ctx.player.radius);
      if (this.input.shooting) ctx.combat.fire();
      if (ctx.arsenal.reloading && !this.wasReloading) ctx.sfx('reload');
      this.wasReloading = ctx.arsenal.reloading;
      ctx.spawner.handle(ctx.director.update(dt, ctx.enemies.length));
      ctx.combo.update(dt);
    }

    ctx.field.update(Math.floor(ctx.player.pos.x), Math.floor(ctx.player.pos.y));
    for (const e of ctx.enemies) e.update(dt, ctx, ctx.time);
    ctx.combat.detonateExploders();
    separateEnemies(ctx.enemies, ctx.player, ctx.map);
    for (const e of ctx.enemies) if (!e.flying) ctx.props.pushOut(e.pos, e.bodyRadius);
    ctx.props.update(dt, ctx.time, ctx);
    ctx.combat.tickStatus(dt);
    ctx.projectiles.update(dt, ctx);
    ctx.deployables.update(dt, ctx, ctx.stats, ctx.time, ctx.hero.buffs.has('overdrive'));
    ctx.throwables.update(dt, ctx);
    for (let i = ctx.dying.length - 1; i >= 0; i--) {
      if (ctx.dying[i].updateDeath(dt)) {
        ctx.dying[i].dispose();
        ctx.dying.splice(i, 1);
      }
    }

    if (alive) {
      ctx.spawner.updateCrates(dt);
      const xp = ctx.gems.update(dt, ctx.player.pos.x, ctx.player.pos.y, ctx.stats.magnetRadius, ctx.time, (x, y, value) =>
        this.floaters.show(XP_FLOAT_KEY, 'xp', value, x, y, 0.5),
      );
      if (xp > 0) {
        ctx.sfx('gem');
        ctx.hero.gainXp(xp);
      }
    }
    ctx.effects.update(dt);
    this.worldView?.updateOcclusion(ctx.player.pos.x, ctx.player.pos.y);
    this.presenter.update(rawDt);
  }

  // ---------------------------------------------------------------- gamepad

  /** Aims with the mouse, or with the right stick when the pad was used last. Returns the screen-space aim angle. */
  private aim(): number {
    const { ctx } = this;
    if (this.input.aimSource === 'mouse') return this.stage.aim(this.input.mouseX, this.input.mouseY, ctx.player.pos, ctx.aimPoint);
    const a = this.input.padAim;
    const dir = screenToMapDir(a.x, a.y, SCREEN_RIGHT, SCREEN_UP, SIN_ELEVATION);
    ctx.aimPoint.x = ctx.player.pos.x + dir.x * PAD_AIM_DISTANCE;
    ctx.aimPoint.y = ctx.player.pos.y + dir.y * PAD_AIM_DISTANCE;
    const p = this.stage.project(ctx.aimPoint.x, 0.55, ctx.aimPoint.y);
    this.hud.moveCrosshair((p.x * 0.5 + 0.5) * window.innerWidth, (-p.y * 0.5 + 0.5) * window.innerHeight);
    return Math.atan2(a.y, a.x);
  }

  /** Shows the on-screen controls (phones, tablets) and lets a tap on a weapon slot select it. */
  private enableTouch(): void {
    document.body.classList.add('touch');
    this.touch = new TouchControls(document.body, {
      key: (code) => this.input.queue(code),
      cycle: (dir) => {
        if (this.ctx.playing) this.ctx.arsenal.cycle(dir);
      },
    });
    this.hud.onSlotTap((slot) => {
      if (this.ctx.playing && !this.ctx.arsenal.selectSlot(slot)) this.hud.toast('NO AMMO');
    });
  }

  /** Copies the on-screen sticks into Input; the controls only show while playing. */
  private pollTouch(): void {
    const t = this.touch;
    if (!t) return;
    const { ctx } = this;
    const active = ctx.playing && !this.shopView.isOpen && !this.recordsView.isOpen && !this.heroView.isOpen;
    t.setVisible(active);
    this.input.touchMove = active ? t.move : { x: 0, y: 0 };
    this.input.touchFire = active && t.fire;
    if (active && t.aimed) {
      this.input.padAim = t.aim;
      this.input.aimSource = 'pad';
    }
  }

  /** Reads the first connected gamepad: sticks and triggers go to Input, buttons become key presses or menu steps. */
  private pollPad(): void {
    const pads = typeof navigator.getGamepads === 'function' ? navigator.getGamepads() : [];
    const pad = [...pads].find((p): p is Gamepad => p !== null && p.connected) ?? null;
    if (pad && !this.pad) this.hud.toast('GAMEPAD CONNECTED');
    this.pad = pad;
    const s = this.padReader.read(pad);
    const { ctx } = this;
    this.input.padMove = ctx.playing ? s.move : { x: 0, y: 0 };
    this.input.padFire = ctx.playing && s.fire;
    if (s.aim) {
      this.input.padAim = s.aim;
      this.input.aimSource = 'pad';
    }
    const inMenu = !ctx.playing || this.shopView.isOpen || this.recordsView.isOpen || this.heroView.isOpen;
    for (const button of s.pressed) {
      if (inMenu) {
        const action = menuAction(button);
        if (action) this.padMenu(action);
      } else if (button === PAD.LEFT || button === PAD.RIGHT) {
        ctx.arsenal.cycle(button === PAD.RIGHT ? 1 : -1);
      } else if (PLAY_BUTTONS[button]) {
        this.input.queue(PLAY_BUTTONS[button]);
      }
    }
  }

  /** Moves focus between the buttons of the screen on top, presses the focused one, or goes back. */
  private padMenu(action: PadMenuAction): void {
    const { ctx } = this;
    if (action === 'back') {
      if (this.shopView.isOpen || this.recordsView.isOpen || this.heroView.isOpen) this.closeMetaView();
      else if (ctx.state === 'skills') this.closeSkills();
      else if (ctx.state === 'paused') this.resume();
      return;
    }
    const layer = [...document.querySelectorAll<HTMLElement>('.meta-modal, .skill-tree, .card-pick, .overlay')].find(
      (el) => !el.classList.contains('hidden') && el.offsetParent !== null,
    );
    if (!layer) return;
    const buttons = [...layer.querySelectorAll<HTMLButtonElement>('button')].filter((b) => b.offsetParent !== null);
    if (buttons.length === 0) return;
    const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (action === 'confirm') {
      if (current >= 0) buttons[current].click();
      else buttons[0].focus();
      return;
    }
    const step = action === 'next' ? 1 : -1;
    buttons[(current + step + buttons.length) % buttons.length].focus();
  }

  /** Short gamepad vibration (ignored by pads and browsers that cannot rumble). */
  rumble(strength: number, ms: number): void {
    const actuator = this.pad?.vibrationActuator as { playEffect?: (type: string, params: object) => Promise<unknown> } | undefined;
    void actuator?.playEffect?.('dual-rumble', { duration: ms, strongMagnitude: strength, weakMagnitude: strength * 0.6 })?.catch(() => undefined);
  }

  // ---------------------------------------------------------------- input

  private handleKeys(): void {
    const { ctx } = this;
    this.input.menuMode = ctx.state === 'title' || ctx.state === 'paused' || ctx.state === 'gameover' || ctx.state === 'cards';
    for (const code of this.input.consumePressed()) {
      if (code === 'KeyN') {
        this.toggleMusic();
        continue;
      }
      if (this.shopView.isOpen || this.recordsView.isOpen || this.heroView.isOpen) {
        if (code === 'Escape') this.closeMetaView();
        continue;
      }
      if (ctx.state === 'skills') {
        if (code === 'Tab' || code === 'KeyK' || code === 'Escape') this.closeSkills();
        continue;
      }
      if (ctx.state === 'cards') {
        const slot = /^(?:Digit|Numpad)([1-9])$/.exec(code);
        if (slot) this.cardView.pickSlot(Number(slot[1]) - 1);
        else if (code === 'KeyM') this.hud.setMuted(this.audio.toggleMute());
        continue;
      }
      if (code === 'Escape' || code === 'KeyP') {
        if (ctx.state === 'playing') this.pause();
        else if (ctx.state === 'paused') this.resume();
      } else if (code === 'KeyM') {
        this.hud.setMuted(this.audio.toggleMute());
      } else if (code === 'KeyR' && ctx.state === 'gameover') {
        this.startGame(null);
      } else if (ctx.playing) {
        this.handlePlayKey(code);
      }
    }
    const wheel = this.input.consumeWheel();
    if (wheel !== 0 && ctx.playing) ctx.arsenal.cycle(wheel > 0 ? 1 : -1);
  }

  /** Calm music in menus and breaks, battle music during waves, faster boss music for the boss. */
  private updateMusic(): void {
    const { ctx } = this;
    const d = ctx.director;
    const inRun = ctx.state !== 'title' && ctx.state !== 'gameover';
    let track: TrackId = 'calm';
    let speed = 1;
    if (inRun && (d.phase === 'boss' || d.phase === 'bossWarning')) {
      track = 'boss';
      speed = ctx.boss?.enraged ? ENRAGED_MUSIC_SPEED : 1;
    } else if (inRun && d.phase === 'wave') {
      track = 'battle';
    }
    const volume = ctx.playing ? 1 : ctx.state === 'gameover' ? 0.45 : 0.6;
    this.audio.updateMusic(track, speed, volume);
  }

  private handlePlayKey(code: string): void {
    const { ctx } = this;
    const digit = /^(?:Digit|Numpad)([1-9])$/.exec(code);
    if (digit) {
      if (!ctx.arsenal.selectSlot(Number(digit[1]))) this.hud.toast('NO AMMO');
    } else if (code === 'Space' || code === 'ShiftLeft') {
      ctx.abilities.dash();
    } else if (code === 'Tab' || code === 'KeyK') {
      this.openSkills();
    } else if (code === 'KeyR') {
      ctx.arsenal.reload();
    } else if (code === 'KeyG' || code === 'Mouse2') {
      ctx.abilities.throwGrenade();
    } else if (code === 'KeyQ') {
      ctx.abilities.placeMine();
    } else if (code === 'KeyT') {
      ctx.abilities.deployTurret();
    } else if (code === 'KeyE') {
      ctx.abilities.activateOverdrive();
    }
  }
}
