import * as THREE from 'three';

const POOL_SIZE = 90;
/** Hits on the same target within this window are merged into one number. */
const MERGE_WINDOW = 0.15;

/** `block` = damage soaked by a shield, `broken` = the shield just broke, `elite` = label over an elite zombie. */
export type FloaterKind = 'damage' | 'crit' | 'burn' | 'xp' | 'block' | 'broken' | 'coin' | 'elite' | 'combo';

const LIFETIME: Record<FloaterKind, number> = { damage: 0.75, crit: 1.0, burn: 0.6, xp: 1.0, block: 0.6, broken: 1.2, coin: 1.3, elite: 1.8, combo: 1.1 };
const RISE: Record<FloaterKind, number> = { damage: 0.9, crit: 1.2, burn: 0.6, xp: 1.1, block: 0.6, broken: 1.3, coin: 1.2, elite: 0.8, combo: 1.0 };

interface Floater {
  readonly node: HTMLElement;
  key: object | null;
  kind: FloaterKind;
  amount: number;
  /** Fixed text instead of a number (labels). */
  text: string | null;
  x: number;
  y: number;
  h: number;
  age: number;
  life: number;
  drift: number;
  active: boolean;
}

export const formatFloater = (kind: FloaterKind, amount: number): string => {
  if (kind === 'broken') return 'SHIELD BROKEN!';
  const value = Math.max(1, Math.round(amount));
  if (kind === 'xp') return `+${value} XP`;
  if (kind === 'coin') return `+${value} COINS`;
  return kind === 'crit' ? `${value}!` : String(value);
};

/** Pooled DOM labels that float up from a world position and fade out (damage numbers, +XP). */
export class FloatingText {
  private readonly layer: HTMLElement;
  private readonly pool: Floater[] = [];
  private readonly v = new THREE.Vector3();
  private next = 0;

  constructor(root: HTMLElement) {
    this.layer = document.createElement('div');
    this.layer.className = 'floaters';
    this.layer.setAttribute('aria-hidden', 'true');
    root.insertBefore(this.layer, root.firstChild);
    for (let i = 0; i < POOL_SIZE; i++) {
      const node = document.createElement('div');
      node.className = 'floater';
      node.style.display = 'none';
      this.layer.appendChild(node);
      this.pool.push({ node, key: null, kind: 'damage', amount: 0, text: null, x: 0, y: 0, h: 0, age: 0, life: 1, drift: 0, active: false });
    }
  }

  /** Shows `amount` above a world position. Rapid hits with the same key and kind add up. */
  show(key: object | null, kind: FloaterKind, amount: number, x: number, y: number, h: number): void {
    if (key) {
      const merged = this.pool.find((f) => f.active && f.key === key && f.kind === kind && f.text === null && f.age < MERGE_WINDOW);
      if (merged) {
        merged.amount += amount;
        merged.node.textContent = formatFloater(kind, merged.amount);
        return;
      }
    }
    this.spawn(key, kind, amount, null, x, y, h);
  }

  /** Shows a fixed label (never merged), e.g. "ELITE · SWIFT". */
  showText(text: string, kind: FloaterKind, x: number, y: number, h: number): void {
    this.spawn(null, kind, 0, text, x, y, h);
  }

  private spawn(key: object | null, kind: FloaterKind, amount: number, text: string | null, x: number, y: number, h: number): void {
    const f = this.pool[this.next];
    this.next = (this.next + 1) % this.pool.length;
    f.key = key;
    f.kind = kind;
    f.amount = amount;
    f.text = text;
    f.x = x;
    f.y = y;
    f.h = h;
    f.age = 0;
    f.life = LIFETIME[kind];
    f.drift = text ? 0 : (Math.random() - 0.5) * 24;
    f.active = true;
    f.node.className = `floater floater-${kind}`;
    f.node.textContent = text ?? formatFloater(kind, amount);
    // Stay invisible until the first update() places the label over the target.
    f.node.style.opacity = '0';
    f.node.style.display = 'block';
  }

  update(dt: number, camera: THREE.Camera, width: number, height: number): void {
    for (const f of this.pool) {
      if (!f.active) continue;
      f.age += dt;
      const t = f.age / f.life;
      if (t >= 1) {
        f.active = false;
        f.key = null;
        f.node.style.display = 'none';
        continue;
      }
      // Ease out: rise quickly, then hang while fading.
      const rise = RISE[f.kind] * (1 - (1 - t) * (1 - t));
      this.v.set(f.x, f.h + rise, f.y).project(camera);
      const sx = (this.v.x * 0.5 + 0.5) * width + f.drift * t;
      const sy = (-this.v.y * 0.5 + 0.5) * height;
      const pop = f.kind === 'crit' ? 1 + Math.max(0, 0.6 - t * 4) : 1 + Math.max(0, 0.3 - t * 3);
      f.node.style.transform = `translate(${sx.toFixed(1)}px, ${sy.toFixed(1)}px) translate(-50%, -50%) scale(${pop.toFixed(2)})`;
      f.node.style.opacity = String(t < 0.55 ? 1 : 1 - (t - 0.55) / 0.45);
    }
  }

  clear(): void {
    for (const f of this.pool) {
      f.active = false;
      f.key = null;
      f.node.style.display = 'none';
    }
  }
}
