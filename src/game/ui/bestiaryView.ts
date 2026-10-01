import type { AnimSet, Assets } from '../gfx/assets.ts';
import { BESTIARY, ELITE_APPLIES_TO, ELITE_INFO, type Attack, type AttackStyle, type BestiaryEntry } from '../systems/bestiary.ts';
import { ELITE } from '../systems/elites.ts';
import { MetaModal } from './metaViews.ts';

type Mode = 'idle' | 'walk' | 'attack';
const MODES: readonly Mode[] = ['idle', 'walk', 'attack'];
const SCALE = 5;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, parent?: HTMLElement, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  parent?.appendChild(node);
  return node;
}

interface Preview {
  readonly entry: BestiaryEntry;
  readonly anim: AnimSet;
  readonly canvas: HTMLCanvasElement;
  mode: Mode;
  attackIndex: number;
  time: number;
}

/** Attack pose for the preview: the sprites have no attack frames, so the pose is a telegraph (flash, swell, lunge). */
export function attackPose(style: AttackStyle, t: number): { dx: number; dy: number; scale: number; flash: boolean; fx: 'none' | 'burst' | 'bile' } {
  const k = t % 1.6;
  switch (style) {
    case 'bite':
    case 'bash': {
      const lunge = k < 0.7 ? 0 : k < 0.9 ? (k - 0.7) / 0.2 : Math.max(0, 1 - (k - 0.9) / 0.4);
      return { dx: lunge * 14, dy: 0, scale: 1, flash: k > 0.5 && k < 0.7, fx: 'none' };
    }
    case 'swoop': {
      const s = Math.sin(Math.min(1, k / 1.2) * Math.PI);
      return { dx: s * 14, dy: -s * 6, scale: 1, flash: false, fx: 'none' };
    }
    case 'charge': {
      const run = k < 0.5 ? 0 : (k - 0.5) / 1.1;
      return { dx: run * 22 - 4, dy: 0, scale: 1, flash: k < 0.5 && Math.floor(k * 12) % 2 === 0, fx: 'none' };
    }
    case 'spit':
      return { dx: k > 0.7 && k < 0.9 ? -3 : 0, dy: 0, scale: 1, flash: k < 0.7 && Math.floor(k * 16) % 2 === 0, fx: k >= 0.8 ? 'bile' : 'none' };
    case 'pop': {
      const swell = k < 0.9 ? 1 + 0.12 * (k / 0.9) : 1;
      return { dx: 0, dy: 0, scale: swell + (k > 0.9 && k < 1.1 ? 0.5 : 0), flash: k < 0.9 && Math.floor(k * 14) % 2 === 0, fx: k >= 0.9 && k < 1.3 ? 'burst' : 'none' };
    }
  }
}

/** Monster encyclopedia: stats, attacks and animated Idle / Walk / Attack previews. */
export class BestiaryView extends MetaModal {
  private readonly assets: Assets;
  private readonly previews: Preview[] = [];
  private raf = 0;
  private last = 0;

  constructor(parent: HTMLElement, assets: Assets, onClose: () => void) {
    super(parent, 'bestiary', 'Bestiary', onClose);
    this.assets = assets;
  }

  open(): void {
    this.render();
    this.show();
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.tick);
  }

  override close(): void {
    cancelAnimationFrame(this.raf);
    super.close();
  }

  private animFor(entry: BestiaryEntry): AnimSet {
    if (entry.id === 'boss') return this.assets.bosses[0].anim;
    return this.assets.zombies[entry.id];
  }

  private render(): void {
    this.previews.length = 0;
    const cards = BESTIARY.map((entry) => this.card(entry));
    const elites = el('section', 'bst-card bst-elites');
    el('h3', 'bst-name', elites, 'Elite affixes');
    el('p', 'bst-lore', elites, `Some ${ELITE_APPLIES_TO.join(', ')} zombies spawn as elites: ×${ELITE.hp} HP, ×${ELITE.speed} speed, ×${ELITE.scale} size, ×${ELITE.score} score, plus one trait.`);
    const list = el('ul', 'bst-list', elites);
    for (const e of ELITE_INFO) el('li', '', list, `${e.name}: ${e.text}`);
    this.body.replaceChildren(...cards, elites);
  }

  private card(entry: BestiaryEntry): HTMLElement {
    const card = el('section', 'bst-card');
    const head = el('div', 'bst-head', card);
    const canvas = el('canvas', 'bst-canvas', head);
    const anim = this.animFor(entry);
    canvas.width = Math.ceil(anim.width * SCALE + 90);
    canvas.height = anim.height * SCALE + 30;
    const titles = el('div', 'bst-titles', head);
    el('h3', 'bst-name', titles, entry.name);
    el('div', 'bst-role', titles, entry.role);
    el('div', 'bst-appear', titles, `Appears: ${entry.appearsAt}`);

    const preview: Preview = { entry, anim, canvas, mode: 'idle', attackIndex: 0, time: 0 };
    this.previews.push(preview);
    const tabs = el('div', 'bst-tabs', card);
    const buttons = new Map<Mode, HTMLButtonElement>();
    for (const mode of MODES) {
      const b = el('button', 'bst-tab', tabs, mode[0].toUpperCase() + mode.slice(1));
      b.type = 'button';
      b.addEventListener('click', () => {
        preview.mode = mode;
        preview.time = 0;
        for (const [m, btn] of buttons) btn.classList.toggle('active', m === mode);
      });
      buttons.set(mode, b);
    }
    buttons.get('idle')?.classList.add('active');

    el('p', 'bst-lore', card, entry.lore);
    const stats = el('dl', 'bst-stats', card);
    for (const [label, value] of entry.stats) {
      el('dt', '', stats, label);
      el('dd', '', stats, value);
    }
    el('h4', 'bst-sub', card, 'Attacks');
    const attacks = el('ul', 'bst-list', card);
    entry.attacks.forEach((a: Attack, i) => {
      const li = el('li', 'bst-attack', attacks);
      el('b', '', li, a.name + ': ');
      li.append(a.text);
      li.addEventListener('mouseenter', () => {
        preview.attackIndex = i;
      });
      li.addEventListener('click', () => {
        preview.attackIndex = i;
        preview.mode = 'attack';
        preview.time = 0;
        for (const [m, btn] of buttons) btn.classList.toggle('active', m === 'attack');
      });
    });
    el('h4', 'bst-sub', card, 'Tips');
    const tips = el('ul', 'bst-list', card);
    for (const t of entry.tips) el('li', '', tips, t);
    return card;
  }

  private readonly tick = (now: number): void => {
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    for (const p of this.previews) this.draw(p, dt);
    this.raf = requestAnimationFrame(this.tick);
  };

  private draw(p: Preview, dt: number): void {
    const ctx = p.canvas.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    p.time += dt;
    ctx.clearRect(0, 0, p.canvas.width, p.canvas.height);
    const { anim } = p;
    const w = anim.width * SCALE;
    const h = anim.height * SCALE;
    const baseY = p.canvas.height - 14;
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(p.canvas.width / 2 - 10, baseY, w * 0.4, 6, 0, 0, Math.PI * 2);
    ctx.fill();

    const attack = p.entry.attacks[Math.min(p.attackIndex, p.entry.attacks.length - 1)];
    let frame = 0;
    let dx = 0;
    let dy = 0;
    let scale = 1;
    let flash = false;
    let fx: 'none' | 'burst' | 'bile' = 'none';
    if (p.mode === 'walk') {
      frame = Math.floor(p.time * p.entry.walkRate) % anim.frames.length;
      dx = Math.sin(p.time * 1.5) * 10;
    } else if (p.mode === 'attack') {
      const pose = attackPose(attack.style, p.time);
      ({ dx, dy, scale, flash, fx } = pose);
      frame = attack.style === 'charge' || attack.style === 'swoop' ? Math.floor(p.time * 10) % anim.frames.length : 0;
    }
    const set = flash ? anim.flash : anim.frames;
    const img = set[frame].image as CanvasImageSource;
    const sw = w * scale;
    const sh = h * scale;
    const x = p.canvas.width / 2 - 10 - sw / 2 + dx;
    ctx.drawImage(img, x, baseY - sh + dy, sw, sh);
    if (fx === 'bile') {
      const t = (p.time % 1.6) - 0.8;
      ctx.fillStyle = '#9adf3a';
      ctx.fillRect(x + sw + t * 60, baseY - sh * 0.6, 8, 8);
    } else if (fx === 'burst') {
      ctx.strokeStyle = '#ffb030';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(x + sw / 2, baseY - sh / 2, ((p.time % 1.6) - 0.9) * 90 + 10, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (p.mode === 'attack') {
      ctx.fillStyle = '#ffd23a';
      ctx.font = '12px monospace';
      ctx.fillText(attack.name, 6, 14);
    }
  }
}
