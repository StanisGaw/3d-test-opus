export interface Vec {
  x: number;
  y: number;
}

/** Radius (px) of the joystick base; the knob can travel this far from where the thumb landed. */
export const STICK_RADIUS = 56;
const MOVE_DEADZONE = 0.12;
/** Aim stick deflection that starts shooting. */
export const FIRE_THRESHOLD = 0.3;

/** Converts a thumb offset (screen px, y down) into a stick vector (x right, y up, length 0..1). */
export function stickVector(dx: number, dy: number, radius = STICK_RADIUS, deadzone = MOVE_DEADZONE): Vec {
  const len = Math.hypot(dx, dy);
  if (len === 0) return { x: 0, y: 0 };
  const mag = Math.min(1, len / radius);
  if (mag <= deadzone) return { x: 0, y: 0 };
  const scaled = (mag - deadzone) / (1 - deadzone);
  return { x: (dx / len) * scaled, y: (-dy / len) * scaled };
}

/** True on phones and tablets (primary input is a finger). */
export function isTouchDevice(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia?.('(pointer: coarse)').matches === true || 'ontouchstart' in window;
}

export interface TouchHandlers {
  /** Edge-triggered key press (same codes as the keyboard: Space, KeyR, KeyG, ...). */
  key(code: string): void;
  /** Next / previous weapon. */
  cycle(dir: 1 | -1): void;
}

interface Stick {
  zone: HTMLElement;
  base: HTMLElement;
  knob: HTMLElement;
  pointerId: number | null;
  origin: Vec;
  value: Vec;
}

const BUTTONS: { label: string; code: string; cls: string }[] = [
  { label: 'DASH', code: 'Space', cls: 'tc-dash' },
  { label: 'RELOAD', code: 'KeyR', cls: 'tc-reload' },
  { label: 'BOMB', code: 'KeyG', cls: 'tc-grenade' },
  { label: 'MINE', code: 'KeyQ', cls: 'tc-mine' },
  { label: 'TURRET', code: 'KeyT', cls: 'tc-turret' },
  { label: 'OVER', code: 'KeyE', cls: 'tc-over' },
];

/**
 * On-screen controls for touch screens: floating left stick moves, floating right stick aims and
 * shoots (twin stick), plus action buttons. Pointer events + touch-action:none keep the browser
 * from scrolling / zooming and from sending emulated mouse events.
 */
export class TouchControls {
  /** Movement stick (screen space, y up). */
  move: Vec = { x: 0, y: 0 };
  /** Last aim direction (unit vector, screen space, y up). */
  aim: Vec = { x: 1, y: 0 };
  /** True while the aim stick is pushed far enough to shoot. */
  fire = false;
  /** True once the aim stick has been used, so the game switches to stick aiming. */
  aimed = false;

  private readonly root: HTMLElement;
  private readonly left: Stick;
  private readonly right: Stick;
  private visible = false;

  constructor(parent: HTMLElement, handlers: TouchHandlers) {
    this.root = document.createElement('div');
    this.root.className = 'touch-controls hidden';
    parent.append(this.root);

    this.left = this.makeStick('tc-left');
    this.right = this.makeStick('tc-right');
    this.bindStick(this.left, (v) => {
      this.move = v;
    });
    this.bindStick(this.right, (v) => {
      this.right.value = v;
      const len = Math.hypot(v.x, v.y);
      this.fire = len >= FIRE_THRESHOLD;
      if (len > 0) {
        this.aim = { x: v.x / len, y: v.y / len };
        this.aimed = true;
      }
    });

    const buttons = document.createElement('div');
    buttons.className = 'tc-buttons';
    this.root.append(buttons);
    for (const b of BUTTONS) buttons.append(this.makeButton(b.label, b.cls, () => handlers.key(b.code)));
    this.root.append(this.makeButton('◀', 'tc-prev', () => handlers.cycle(-1)));
    this.root.append(this.makeButton('▶', 'tc-next', () => handlers.cycle(1)));
    this.root.append(this.makeButton('SKILLS', 'tc-skills', () => handlers.key('Tab')));
    this.root.append(this.makeButton('II', 'tc-pause', () => handlers.key('Escape')));

    this.root.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  setVisible(visible: boolean): void {
    if (visible === this.visible) return;
    this.visible = visible;
    this.root.classList.toggle('hidden', !visible);
    if (!visible) this.releaseAll();
  }

  private makeStick(cls: string): Stick {
    const zone = document.createElement('div');
    zone.className = `tc-zone ${cls}`;
    const base = document.createElement('div');
    base.className = 'tc-base';
    const knob = document.createElement('div');
    knob.className = 'tc-knob';
    base.append(knob);
    zone.append(base);
    this.root.append(zone);
    return { zone, base, knob, pointerId: null, origin: { x: 0, y: 0 }, value: { x: 0, y: 0 } };
  }

  private bindStick(stick: Stick, onChange: (v: Vec) => void): void {
    const { zone } = stick;
    const update = (e: PointerEvent): void => {
      const v = stickVector(e.clientX - stick.origin.x, e.clientY - stick.origin.y);
      const dx = e.clientX - stick.origin.x;
      const dy = e.clientY - stick.origin.y;
      const len = Math.hypot(dx, dy) || 1;
      const k = Math.min(len, STICK_RADIUS) / len;
      stick.knob.style.transform = `translate(${dx * k}px, ${dy * k}px)`;
      onChange(v);
    };
    zone.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (stick.pointerId !== null) return;
      stick.pointerId = e.pointerId;
      zone.setPointerCapture(e.pointerId);
      stick.origin = { x: e.clientX, y: e.clientY };
      const r = zone.getBoundingClientRect();
      stick.base.style.left = `${e.clientX - r.left}px`;
      stick.base.style.top = `${e.clientY - r.top}px`;
      stick.base.classList.add('active');
      update(e);
    });
    zone.addEventListener('pointermove', (e) => {
      if (e.pointerId === stick.pointerId) update(e);
    });
    const end = (e: PointerEvent): void => {
      if (e.pointerId !== stick.pointerId) return;
      this.releaseStick(stick, onChange);
    };
    zone.addEventListener('pointerup', end);
    zone.addEventListener('pointercancel', end);
    zone.addEventListener('lostpointercapture', end);
  }

  private releaseStick(stick: Stick, onChange: (v: Vec) => void): void {
    stick.pointerId = null;
    stick.base.classList.remove('active');
    stick.knob.style.transform = 'translate(0, 0)';
    onChange({ x: 0, y: 0 });
  }

  private releaseAll(): void {
    this.releaseStick(this.left, (v) => {
      this.move = v;
    });
    this.releaseStick(this.right, () => {
      this.fire = false;
    });
  }

  private makeButton(label: string, cls: string, onPress: () => void): HTMLElement {
    const b = document.createElement('div');
    b.className = `tc-btn ${cls}`;
    b.textContent = label;
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      b.classList.add('down');
      onPress();
    });
    const up = (): void => b.classList.remove('down');
    b.addEventListener('pointerup', up);
    b.addEventListener('pointercancel', up);
    b.addEventListener('pointerleave', up);
    return b;
  }
}
