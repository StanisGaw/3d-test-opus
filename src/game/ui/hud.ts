import type { StatLine } from '../systems/skillTree.ts';
import { WEAPONS, type Arsenal } from '../systems/weapons.ts';

export interface MinimapDot {
  x: number;
  y: number;
  color: string;
  size: number;
}

export interface GameOverStats {
  score: number;
  round: number;
  wave: number;
  kills: number;
  bosses: number;
  level: number;
  coinsEarned: number;
  totalCoins: number;
  /** Leaderboard place, or null when the run did not make the list. */
  place: number | null;
}

export interface MenuAction {
  readonly label: string;
  readonly onClick: () => void;
  /** The main action is bigger and blinks. */
  readonly primary?: boolean;
  readonly detail?: string;
}

export interface TitleInfo {
  readonly coins: number;
  /** Text of the saved checkpoint, or null when there is nothing to continue. */
  readonly checkpoint: string | null;
  readonly musicOn: boolean;
}

export interface AbilityView {
  readonly id: string;
  readonly key: string;
  readonly label: string;
  /** Hidden when the skill isn't learned. */
  readonly unlocked: boolean;
  /** Charges left, or null for cooldown based abilities. */
  readonly charges: number | null;
  readonly maxCharges: number;
  /** 0 = ready, 1 = just used. */
  readonly cooldown: number;
  readonly active: boolean;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, parent?: HTMLElement, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  parent?.appendChild(node);
  return node;
}

/** DOM overlay: health, score, round info, weapon bar, boss bar, banners, minimap and screens. */
export class Hud {
  private readonly root: HTMLElement;
  private readonly hpFill: HTMLElement;
  private readonly hpText: HTMLElement;
  private readonly dashFill: HTMLElement;
  private readonly score: HTMLElement;
  private readonly roundInfo: HTMLElement;
  private readonly remaining: HTMLElement;
  private readonly bossBar: HTMLElement;
  private readonly bossName: HTMLElement;
  private readonly bossFill: HTMLElement;
  private readonly bannerTitle: HTMLElement;
  private readonly bannerSub: HTMLElement;
  private readonly banner: HTMLElement;
  private readonly toastEl: HTMLElement;
  private slotTap: ((slot: number) => void) | null = null;
  private readonly slots: { root: HTMLElement; ammo: HTMLElement }[] = [];
  private readonly crosshair: HTMLElement;
  private readonly vignette: HTMLElement;
  private readonly fader: HTMLElement;
  private readonly overlay: HTMLElement;
  private readonly minimap: HTMLCanvasElement;
  private readonly minimapCtx: CanvasRenderingContext2D;
  private minimapBase: HTMLCanvasElement | null = null;
  private readonly indicators: HTMLElement[] = [];
  private readonly muteEl: HTMLElement;
  private readonly levelEl: HTMLElement;
  private readonly xpFill: HTMLElement;
  private readonly xpText: HTMLElement;
  private readonly pointsEl: HTMLElement;
  private readonly buffsEl: HTMLElement;
  private readonly abilityBar: HTMLElement;
  private readonly abilities = new Map<string, { root: HTMLElement; count: HTMLElement; cooldown: HTMLElement }>();
  private readonly reloadEl: HTMLElement;
  private readonly reloadFill: HTMLElement;
  private readonly statsPanel: HTMLElement;
  private readonly coinsEl: HTMLElement;
  private readonly savedEl: HTMLElement;
  private readonly achievementsEl: HTMLElement;
  private readonly comboEl: HTMLElement;
  private readonly comboCount: HTMLElement;
  private readonly comboMult: HTMLElement;
  private readonly comboFill: HTMLElement;
  private savedTimer = 0;
  private bannerTimer = 0;
  private toastTimer = 0;
  private readonly cache = new Map<string, string | number>();

  constructor(root: HTMLElement, weaponIcons: Readonly<Record<string, { icon: string }>>) {
    this.root = root;
    const topLeft = el('div', 'hud-top-left', root);
    el('div', 'hud-label', topLeft, 'HP');
    const hpBar = el('div', 'bar hp-bar', topLeft);
    this.hpFill = el('div', 'bar-fill', hpBar);
    this.hpText = el('div', 'bar-text', hpBar);
    el('div', 'hud-label', topLeft, 'DASH');
    const dashBar = el('div', 'bar dash-bar', topLeft);
    this.dashFill = el('div', 'bar-fill', dashBar);
    this.levelEl = el('div', 'hud-label hud-level', topLeft, 'LV 1');
    const xpBar = el('div', 'bar xp-bar', topLeft);
    this.xpFill = el('div', 'bar-fill', xpBar);
    this.xpText = el('div', 'bar-text', xpBar);
    this.score = el('div', 'hud-score', topLeft, 'SCORE 0');
    this.coinsEl = el('div', 'hud-coins', topLeft, 'COINS 0');
    this.pointsEl = el('div', 'hud-points hidden', topLeft);
    this.buffsEl = el('div', 'hud-buffs', topLeft);

    this.comboEl = el('div', 'hud-combo hidden', root);
    this.comboCount = el('div', 'combo-count', this.comboEl);
    this.comboMult = el('div', 'combo-mult', this.comboEl);
    const comboTrack = el('div', 'combo-track', this.comboEl);
    this.comboFill = el('div', 'combo-fill', comboTrack);

    const topCenter = el('div', 'hud-top-center', root);
    this.roundInfo = el('div', 'hud-round', topCenter, 'ROUND 1');
    this.remaining = el('div', 'hud-remaining', topCenter);
    this.bossBar = el('div', 'boss-bar hidden', topCenter);
    this.bossName = el('div', 'boss-name', this.bossBar);
    const bossTrack = el('div', 'bar boss-track', this.bossBar);
    this.bossFill = el('div', 'bar-fill', bossTrack);

    this.minimap = el('canvas', 'minimap', root);
    this.minimap.width = 144;
    this.minimap.height = 144;
    const ctx = this.minimap.getContext('2d');
    if (!ctx) throw new Error('2D canvas is not supported');
    this.minimapCtx = ctx;
    this.minimapCtx.imageSmoothingEnabled = false;

    this.banner = el('div', 'banner hidden', root);
    this.bannerTitle = el('div', 'banner-title', this.banner);
    this.bannerSub = el('div', 'banner-sub', this.banner);
    this.toastEl = el('div', 'toast hidden', root);

    const bar = el('div', 'weapon-bar', root);
    for (const w of WEAPONS) {
      const slot = el('div', 'slot', bar);
      el('div', 'slot-key', slot, String(w.slot));
      const img = el('img', 'slot-icon', slot);
      img.src = weaponIcons[w.id].icon;
      img.alt = w.name;
      el('div', 'slot-name', slot, w.name);
      const ammo = el('div', 'slot-ammo', slot);
      this.slots.push({ root: slot, ammo });
      slot.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        this.slotTap?.(w.slot);
      });
    }

    this.abilityBar = el('div', 'ability-bar', root);
    this.statsPanel = el('div', 'hud-stats', root);
    this.statsPanel.setAttribute('aria-label', 'Hero stats');

    this.muteEl = el('div', 'hud-mute', root, '');
    this.crosshair = el('div', 'crosshair', root);
    this.reloadEl = el('div', 'reload hidden', root);
    el('div', 'reload-label', this.reloadEl, 'Reload');
    const reloadTrack = el('div', 'reload-track', this.reloadEl);
    this.reloadFill = el('div', 'reload-fill', reloadTrack);
    this.vignette = el('div', 'vignette', root);
    this.fader = el('div', 'fader', root);
    this.savedEl = el('div', 'hud-saved', root, 'CHECKPOINT SAVED');
    this.savedEl.setAttribute('aria-hidden', 'true');
    this.achievementsEl = el('div', 'achievements', root);
    this.achievementsEl.setAttribute('role', 'status');
    this.achievementsEl.setAttribute('aria-live', 'polite');
    this.overlay = el('div', 'overlay hidden', root);
  }

  private setText(key: string, node: HTMLElement, text: string): void {
    if (this.cache.get(key) === text) return;
    this.cache.set(key, text);
    node.textContent = text;
  }

  private setWidth(key: string, node: HTMLElement, ratio: number): void {
    const value = Math.round(Math.max(0, Math.min(1, ratio)) * 1000) / 10;
    if (this.cache.get(key) === value) return;
    this.cache.set(key, value);
    node.style.width = `${value}%`;
  }

  setHealth(hp: number, max: number): void {
    this.setWidth('hp', this.hpFill, hp / max);
    this.setText('hpText', this.hpText, `${Math.ceil(hp)}/${max}`);
    this.hpFill.classList.toggle('low', hp / max < 0.3);
  }

  setDash(ready: number): void {
    this.setWidth('dash', this.dashFill, ready);
  }

  setScore(score: number): void {
    this.setText('score', this.score, `SCORE ${score.toString().padStart(7, '0')}`);
  }

  setCoins(coins: number): void {
    this.setText('coins', this.coinsEl, `COINS ${coins}`);
  }

  /** Kill streak counter; hidden below 3 kills. `timeLeft` is 0..1. */
  setCombo(count: number, multiplier: string, timeLeft: number): void {
    const visible = count >= 3;
    this.comboEl.classList.toggle('hidden', !visible);
    if (!visible) return;
    this.setText('comboCount', this.comboCount, `${count} COMBO`);
    this.setText('comboMult', this.comboMult, `SCORE ×${multiplier}`);
    this.setWidth('comboFill', this.comboFill, timeLeft);
  }

  /** Small "checkpoint saved" note in the corner. */
  flashSaved(): void {
    this.savedEl.classList.add('on');
    this.savedTimer = 1.8;
  }

  /** Slides in an achievement card; several unlocks stack and each fades out on its own. */
  showAchievement(name: string, text: string, reward: number): void {
    const card = el('div', 'achievement', this.achievementsEl);
    el('div', 'achievement-title', card, 'Achievement unlocked');
    el('div', 'achievement-name', card, name);
    el('div', 'achievement-text', card, `${text} · +${reward} coins`);
    window.setTimeout(() => card.classList.add('out'), 3600);
    window.setTimeout(() => card.remove(), 4200);
  }

  setRound(text: string, remaining: string): void {
    this.setText('round', this.roundInfo, text);
    this.setText('remaining', this.remaining, remaining);
  }

  setWeapons(arsenal: Arsenal): void {
    WEAPONS.forEach((w, i) => {
      const slot = this.slots[i];
      const reserve = arsenal.reserveOf(w.id);
      const label = !arsenal.has(w.id)
        ? '0'
        : arsenal.usesMagazine(w.id)
          ? `${arsenal.magOf(w.id)}/${Number.isFinite(reserve) ? reserve : '∞'}`
          : String(arsenal.ammoOf(w.id));
      this.setText(`ammo${i}`, slot.ammo, label);
      slot.root.classList.toggle('active', arsenal.current === w.id);
      slot.root.classList.toggle('empty', !arsenal.has(w.id));
    });
    this.reloadEl.classList.toggle('hidden', !arsenal.reloading);
    if (arsenal.reloading) this.setWidth('reload', this.reloadFill, arsenal.reloadProgress);
  }

  setLevel(level: number, xp: number, needed: number, points: number): void {
    this.setText('level', this.levelEl, `LV ${level}`);
    this.setWidth('xp', this.xpFill, xp / needed);
    this.setText('xpText', this.xpText, `${Math.floor(xp)}/${needed} XP`);
    this.pointsEl.classList.toggle('hidden', points <= 0);
    this.setText('points', this.pointsEl, `+${points} skill ${points === 1 ? 'point' : 'points'} [TAB]`);
  }

  /** Always visible core stats; call when stats change. */
  setStats(lines: readonly StatLine[]): void {
    this.statsPanel.replaceChildren(
      ...lines
        .filter((l) => l.core)
        .map((l) => {
          const row = el('div', `hud-stat${l.boosted ? ' boosted' : ''}`);
          el('span', 'hud-stat-label', row, l.label);
          el('span', 'hud-stat-value', row, l.value);
          return row;
        }),
    );
  }

  setBuffs(buffs: readonly { label: string; remaining: number }[]): void {
    this.setText('buffs', this.buffsEl, buffs.map((b) => `${b.label} ${b.remaining.toFixed(1)}s`).join('  '));
  }

  setAbilities(list: readonly AbilityView[]): void {
    for (const a of list) {
      let view = this.abilities.get(a.id);
      if (!view) {
        const root = el('div', 'ability', this.abilityBar);
        el('div', 'ability-key', root, a.key);
        el('div', 'ability-name', root, a.label);
        const count = el('div', 'ability-count', root);
        const cooldown = el('div', 'ability-cooldown', root);
        view = { root, count, cooldown };
        this.abilities.set(a.id, view);
      }
      view.root.classList.toggle('hidden', !a.unlocked);
      if (!a.unlocked) continue;
      const empty = a.charges !== null ? a.charges <= 0 : a.cooldown > 0;
      view.root.classList.toggle('empty', empty && !a.active);
      view.root.classList.toggle('active', a.active);
      this.setText(`ab-${a.id}`, view.count, a.charges !== null ? `${a.charges}/${a.maxCharges}` : a.active ? 'ON' : a.cooldown > 0 ? '...' : 'READY');
      this.setWidth(`abc-${a.id}`, view.cooldown, a.cooldown);
    }
  }

  setBoss(name: string | null, hp = 0, max = 1): void {
    this.bossBar.classList.toggle('hidden', name === null);
    if (name === null) return;
    this.setText('bossName', this.bossName, name);
    this.setWidth('boss', this.bossFill, hp / max);
  }

  setMuted(muted: boolean): void {
    this.setText('mute', this.muteEl, muted ? 'SOUND OFF [M]' : '');
  }

  showBanner(title: string, subtitle: string, duration = 2.6): void {
    this.bannerTitle.textContent = title;
    this.bannerSub.textContent = subtitle;
    this.banner.classList.remove('hidden');
    this.banner.classList.remove('pop');
    void this.banner.offsetWidth;
    this.banner.classList.add('pop');
    this.bannerTimer = duration;
  }

  hideBanner(): void {
    this.banner.classList.add('hidden');
    this.bannerTimer = 0;
  }

  toast(text: string): void {
    this.toastEl.textContent = text;
    this.toastEl.classList.remove('hidden');
    this.toastEl.classList.remove('pop');
    void this.toastEl.offsetWidth;
    this.toastEl.classList.add('pop');
    this.toastTimer = 1.4;
  }

  damageFlash(): void {
    this.vignette.classList.remove('hit');
    void this.vignette.offsetWidth;
    this.vignette.classList.add('hit');
  }

  fade(on: boolean): void {
    this.fader.classList.toggle('on', on);
  }

  moveCrosshair(x: number, y: number): void {
    this.crosshair.style.transform = `translate(${x}px, ${y}px)`;
    this.reloadEl.style.transform = `translate(${x}px, ${y}px)`;
  }

  setMinimapBase(canvas: HTMLCanvasElement): void {
    this.minimapBase = canvas;
  }

  drawMinimap(dots: readonly MinimapDot[], mapSize: number): void {
    const ctx = this.minimapCtx;
    const scale = this.minimap.width / mapSize;
    ctx.clearRect(0, 0, this.minimap.width, this.minimap.height);
    if (this.minimapBase) ctx.drawImage(this.minimapBase, 0, 0, this.minimap.width, this.minimap.height);
    for (const d of dots) {
      ctx.fillStyle = d.color;
      ctx.fillRect(Math.floor(d.x * scale - d.size / 2), Math.floor(d.y * scale - d.size / 2), d.size, d.size);
    }
  }

  /** Arrows on the screen edge pointing at off-screen supply crates. */
  setIndicators(points: readonly { x: number; y: number; angle: number }[]): void {
    while (this.indicators.length < points.length) this.indicators.push(el('div', 'indicator', this.root, '▲'));
    this.indicators.forEach((node, i) => {
      const p = points[i];
      node.style.display = p ? 'block' : 'none';
      if (p) node.style.transform = `translate(${p.x}px, ${p.y}px) rotate(${p.angle}rad)`;
    });
  }

  update(dt: number): void {
    if (this.bannerTimer > 0) {
      this.bannerTimer -= dt;
      if (this.bannerTimer <= 0) this.banner.classList.add('hidden');
    }
    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) this.toastEl.classList.add('hidden');
    }
    if (this.savedTimer > 0) {
      this.savedTimer -= dt;
      if (this.savedTimer <= 0) this.savedEl.classList.remove('on');
    }
  }

  /** Replaces the overlay with a fresh panel and focuses its first button. */
  private showScreen(className: string, build: (panel: HTMLElement) => void): void {
    this.overlay.replaceChildren();
    const panel = el('div', `panel ${className}`, this.overlay);
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    build(panel);
    const heading = panel.querySelector('h1, h2');
    if (heading) {
      heading.id = `screen-${className}-title`;
      panel.setAttribute('aria-labelledby', heading.id);
    }
    this.overlay.classList.remove('hidden');
    panel.querySelector<HTMLButtonElement>('button')?.focus();
  }

  private menu(parent: HTMLElement, actions: readonly MenuAction[]): void {
    const nav = el('div', 'menu', parent);
    for (const a of actions) {
      const button = el('button', a.primary ? 'menu-btn start' : 'menu-btn', nav, a.label);
      button.type = 'button';
      if (a.detail) el('span', 'menu-detail', button, a.detail);
      button.addEventListener('click', (e) => {
        e.stopPropagation();
        a.onClick();
      });
    }
  }

  /** Called when a weapon slot is tapped (touch screens). */
  onSlotTap(handler: (slot: number) => void): void {
    this.slotTap = handler;
  }

  showTitle(info: TitleInfo, actions: readonly MenuAction[]): void {
    this.showScreen('title', (panel) => {
      const h1 = el('h1', '', panel, 'ZOMBIE STRIKE');
      el('span', '', h1, 'ISO');
      el('p', 'tag', panel, 'Pixel superhero vs. endless undead hordes');
      el('div', 'wallet', panel, `COINS ${info.coins}`);
      this.menu(panel, actions);
      const controls = el('div', 'controls', panel);
      const keys: [string, string][] = [
        ['WASD', 'move'],
        ['MOUSE', 'aim & shoot'],
        ['1-6 / WHEEL', 'switch weapon'],
        ['R', 'reload'],
        ['SPACE', 'dash (skill tree)'],
        ['TAB', 'skill tree'],
        ['G / RMB', 'grenade · Q mine'],
        ['T', 'turret · E overload turrets'],
        ['ESC', 'pause · M mute'],
        ['N', `music ${info.musicOn ? 'on' : 'off'}`],
        ['PAD', 'sticks move & aim · RT shoot · A dash'],
        ['PAD', 'RB grenade · Y mine · B turret · X reload'],
        ['TOUCH', 'left stick move · right stick aim & shoot'],
      ];
      for (const [key, action] of keys) {
        const row = el('div', '', controls);
        el('b', '', row, key);
        row.append(` ${action}`);
      }
      el('p', 'hint', panel, 'The game saves a checkpoint at the start of every round and after every wave.');
    });
  }

  showPause(actions: readonly MenuAction[]): void {
    this.showScreen('pause', (panel) => {
      el('h2', '', panel, 'PAUSED');
      this.menu(panel, actions);
      el('p', 'hint', panel, 'Quitting keeps your last checkpoint. You can continue from the main menu.');
    });
  }

  showGameOver(stats: GameOverStats, actions: readonly MenuAction[]): void {
    this.showScreen('game-over', (panel) => {
      el('h2', 'dead', panel, 'GAME OVER');
      if (stats.place !== null) el('div', 'record', panel, stats.place === 1 ? 'NEW HIGH SCORE!' : `TOP ${stats.place} ON THE LEADERBOARD!`);
      const list = el('div', 'stats', panel);
      const rows: [string, string][] = [
        ['SCORE', String(stats.score)],
        ['REACHED', `ROUND ${stats.round} · WAVE ${stats.wave}`],
        ['HERO LEVEL', String(stats.level)],
        ['ZOMBIES KILLED', String(stats.kills)],
        ['BOSSES DEFEATED', String(stats.bosses)],
        ['COINS EARNED', `+${stats.coinsEarned} (wallet ${stats.totalCoins})`],
      ];
      for (const [label, value] of rows) {
        const row = el('div', '', list, `${label} `);
        el('b', '', row, value);
      }
      this.menu(panel, actions);
    });
  }
  hideOverlay(): void {
    this.overlay.classList.add('hidden');
    this.overlay.onclick = null;
  }
}
