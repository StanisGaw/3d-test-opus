import type { Meta } from '../play/meta.ts';
import { ACHIEVEMENTS, achievementProgress } from '../systems/achievements.ts';
import { HEROES, HERO_BY_ID, type HeroId } from '../systems/heroes.ts';
import { UPGRADES, type UpgradeId, checkPurchase, levelOf, upgradeCost } from '../systems/shop.ts';
import { WEAPON_BY_ID } from '../systems/weapons.ts';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, parent?: HTMLElement, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  parent?.appendChild(node);
  return node;
}

/** Shared modal frame: title, a scrollable body and a back button. */
export abstract class MetaModal {
  protected readonly root: HTMLElement;
  protected readonly body: HTMLElement;
  protected readonly header: HTMLElement;
  protected readonly back: HTMLButtonElement;

  constructor(parent: HTMLElement, id: string, title: string, onClose: () => void) {
    this.root = el('div', `meta-modal ${id} hidden`, parent);
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-modal', 'true');
    this.root.setAttribute('aria-labelledby', `${id}-title`);
    this.header = el('header', 'mm-header', this.root);
    const h = el('h2', 'mm-title', this.header, title);
    h.id = `${id}-title`;
    this.back = el('button', 'mm-back', this.header, 'Back [ESC]');
    this.back.type = 'button';
    this.back.addEventListener('click', onClose);
    this.body = el('div', 'mm-body', this.root);
  }

  get isOpen(): boolean {
    return !this.root.classList.contains('hidden');
  }

  protected show(): void {
    this.root.classList.remove('hidden');
    this.back.focus();
  }

  close(): void {
    this.root.classList.add('hidden');
  }
}

/** Base shop: permanent upgrades bought with coins between runs. */
export class ShopView extends MetaModal {
  private readonly wallet: HTMLElement;
  private readonly meta: Meta;
  private readonly onBuy: (id: UpgradeId) => void;

  constructor(parent: HTMLElement, meta: Meta, onBuy: (id: UpgradeId) => void, onClose: () => void) {
    super(parent, 'shop', 'Base shop', onClose);
    this.meta = meta;
    this.onBuy = onBuy;
    this.wallet = el('div', 'mm-wallet');
    this.wallet.setAttribute('aria-live', 'polite');
    this.header.insertBefore(this.wallet, this.back);
  }

  open(): void {
    this.render();
    this.show();
  }

  render(): void {
    const { meta } = this;
    this.wallet.textContent = `COINS ${meta.coins}`;
    const focused = document.activeElement instanceof HTMLElement ? document.activeElement.dataset.upgrade : undefined;
    this.body.replaceChildren(
      ...UPGRADES.map((u) => {
        const level = levelOf(meta.upgrades, u.id);
        const state = checkPurchase(meta.upgrades, meta.coins, u.id);
        const card = el('div', `shop-item ${state}`);
        el('div', 'shop-name', card, u.name);
        el('div', 'shop-pips', card, '■'.repeat(level) + '□'.repeat(u.maxLevel - level));
        el('div', 'shop-now', card, level > 0 ? `Now: ${u.effect(level)}` : 'Not bought yet');
        el('div', 'shop-next', card, state === 'maxed' ? 'MAX LEVEL' : `Next: ${u.effect(level + 1)}`);
        const button = el('button', 'shop-buy', card, state === 'maxed' ? 'Maxed' : `Buy · ${upgradeCost(u.id, level)} coins`);
        button.type = 'button';
        button.dataset.upgrade = u.id;
        button.setAttribute('aria-disabled', String(state !== 'ok'));
        button.setAttribute('aria-label', `${u.name}, level ${level} of ${u.maxLevel}. ${state === 'maxed' ? 'Maxed' : `Next: ${u.effect(level + 1)}, costs ${upgradeCost(u.id, level)} coins`}${state === 'noCoins' ? ', not enough coins' : ''}`);
        button.addEventListener('click', () => this.onBuy(u.id));
        return card;
      }),
    );
    if (focused) this.body.querySelector<HTMLButtonElement>(`[data-upgrade="${focused}"]`)?.focus();
  }

  /** Short shake when an upgrade cannot be bought. */
  reject(id: UpgradeId): void {
    const card = this.body.querySelector<HTMLElement>(`[data-upgrade="${id}"]`)?.parentElement;
    if (!card) return;
    card.classList.remove('shake');
    void card.offsetWidth;
    card.classList.add('shake');
  }
}

const dateFormat = new Intl.DateTimeFormat(undefined, { day: '2-digit', month: '2-digit', year: 'numeric' });

/** Achievements with progress, and the local top-10 leaderboard. */
export class RecordsView extends MetaModal {
  private readonly meta: Meta;

  constructor(parent: HTMLElement, meta: Meta, onClose: () => void) {
    super(parent, 'records', 'Records', onClose);
    this.meta = meta;
  }

  open(): void {
    this.render();
    this.show();
  }

  private render(): void {
    const { meta } = this;
    const done = ACHIEVEMENTS.filter((a) => meta.isUnlocked(a.id)).length;

    const achievements = el('section', 'rec-section rec-achievements');
    el('h3', 'rec-heading', achievements, `Achievements ${done}/${ACHIEVEMENTS.length}`);
    const list = el('ul', 'rec-list', achievements);
    for (const a of ACHIEVEMENTS) {
      const unlocked = meta.isUnlocked(a.id);
      const p = achievementProgress(a, meta.lifetime);
      const item = el('li', `rec-ach${unlocked ? ' unlocked' : ''}`, list);
      el('span', 'rec-mark', item, unlocked ? '★' : '☆');
      const text = el('span', 'rec-ach-body', item);
      el('span', 'rec-ach-name', text, a.name);
      el('span', 'rec-ach-text', text, a.text);
      el('span', 'rec-ach-side', item, unlocked ? `+${a.reward}` : a.target > 1 ? `${p.value}/${p.target}` : `+${a.reward}`);
    }

    const board = el('section', 'rec-section rec-board');
    el('h3', 'rec-heading', board, 'Top 10 runs');
    if (meta.profile.leaderboard.length === 0) {
      el('p', 'rec-empty', board, 'No runs yet. Play one!');
    } else {
      const table = el('table', 'rec-table', board);
      const head = el('tr', '', el('thead', '', table));
      for (const h of ['#', 'Score', 'Hero', 'Reached', 'Lv', 'Kills', 'Date']) el('th', '', head, h);
      const tbody = el('tbody', '', table);
      meta.profile.leaderboard.forEach((r, i) => {
        const row = el('tr', '', tbody);
        for (const cell of [String(i + 1), String(r.score), HERO_BY_ID[r.hero].name, `R${r.round} W${r.wave}`, String(r.level), String(r.kills), dateFormat.format(r.date)]) el('td', '', row, cell);
      });
    }
    const life = meta.lifetime;
    const totals = el('div', 'rec-totals', board);
    for (const [label, value] of [
      ['Runs', life.runs],
      ['Zombies', life.kills],
      ['Bosses', life.bosses],
      ['Coins earned', life.coinsEarned],
    ] as const) {
      const cell = el('div', 'rec-total', totals);
      el('span', '', cell, label);
      el('b', '', cell, String(value));
    }
    this.body.replaceChildren(achievements, board);
  }
}

/** Hero screen before a new run: pick an owned hero or buy a locked one with coins. */
export class HeroSelectView extends MetaModal {
  private readonly meta: Meta;
  private readonly icons: Readonly<Record<HeroId, string>>;
  private readonly onPlay: (id: HeroId) => void;
  private readonly onUnlock: (id: HeroId) => void;
  private readonly wallet: HTMLElement;

  constructor(
    parent: HTMLElement,
    meta: Meta,
    icons: Readonly<Record<HeroId, string>>,
    onPlay: (id: HeroId) => void,
    onUnlock: (id: HeroId) => void,
    onClose: () => void,
  ) {
    super(parent, 'heroes', 'Choose your hero', onClose);
    this.meta = meta;
    this.icons = icons;
    this.onPlay = onPlay;
    this.onUnlock = onUnlock;
    this.wallet = el('div', 'mm-wallet');
    this.header.insertBefore(this.wallet, this.back);
  }

  open(): void {
    this.render();
    this.show();
    this.focusHero(this.meta.profile.selectedHero);
  }

  focusHero(id: HeroId): void {
    this.body.querySelector<HTMLButtonElement>(`[data-hero="${id}"]`)?.focus();
  }

  render(): void {
    const { meta } = this;
    this.wallet.textContent = `COINS ${meta.coins}`;
    this.body.replaceChildren(
      ...HEROES.map((h) => {
        const owned = meta.hasHero(h.id);
        const card = el('div', `hero-card${owned ? ' owned' : ' locked'}${meta.profile.selectedHero === h.id ? ' selected' : ''}`);
        const img = el('img', 'hero-portrait', card);
        img.src = this.icons[h.id];
        img.alt = '';
        el('div', 'hero-name', card, h.name);
        el('div', 'hero-title', card, h.title);
        el('p', 'hero-passive', card, h.passive);
        const start = h.startWeapons.map((w) => WEAPON_BY_ID[w].name).join(', ');
        if (start) el('div', 'hero-line', card, `Starts with: ${start}`);
        const button = el('button', 'hero-action', card);
        button.type = 'button';
        button.dataset.hero = h.id;
        if (owned) {
          button.textContent = `Play as ${h.name}`;
          button.addEventListener('click', () => this.onPlay(h.id));
        } else {
          const affordable = meta.coins >= h.cost;
          button.textContent = `Unlock · ${h.cost} coins`;
          button.setAttribute('aria-disabled', String(!affordable));
          button.addEventListener('click', () => this.onUnlock(h.id));
        }
        button.setAttribute('aria-label', `${h.name}, ${h.title}. ${h.passive}. ${owned ? 'Play' : `Locked, costs ${h.cost} coins`}`);
        return card;
      }),
    );
  }

  reject(id: HeroId): void {
    const card = this.body.querySelector<HTMLElement>(`[data-hero="${id}"]`)?.parentElement;
    if (!card) return;
    card.classList.remove('shake');
    void card.offsetWidth;
    card.classList.add('shake');
  }
}
