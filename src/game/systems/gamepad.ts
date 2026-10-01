/** The parts of the browser Gamepad object the game reads (so tests can pass a plain object). */
export interface PadLike {
  readonly connected?: boolean;
  readonly axes: readonly number[];
  readonly buttons: readonly { readonly pressed: boolean; readonly value?: number }[];
}

/** Buttons of the W3C "standard" mapping (Xbox names; PlayStation: A=✕, B=○, X=□, Y=△). */
export const PAD = {
  A: 0,
  B: 1,
  X: 2,
  Y: 3,
  LB: 4,
  RB: 5,
  LT: 6,
  RT: 7,
  VIEW: 8,
  MENU: 9,
  UP: 12,
  DOWN: 13,
  LEFT: 14,
  RIGHT: 15,
  /** Virtual buttons: the left stick pushed hard in a direction (used to move through menus). */
  STICK_UP: 100,
  STICK_DOWN: 101,
  STICK_LEFT: 102,
  STICK_RIGHT: 103,
} as const;

export const DEADZONE = 0.22;
const TRIGGER = 0.35;
/** Stick push that counts as a menu step, and how far it must come back before the next step. */
const STICK_STEP = 0.65;
const STICK_RELEASE = 0.35;

export interface Vec {
  x: number;
  y: number;
}

export interface PadState {
  readonly connected: boolean;
  /** Left stick, screen space: x right, y up. Length 0..1. */
  readonly move: Vec;
  /** Right stick direction (screen space, y up), or null inside the dead zone. */
  readonly aim: Vec | null;
  readonly fire: boolean;
  /** Buttons that went down this frame (see PAD). */
  readonly pressed: readonly number[];
}

const NO_PAD: PadState = { connected: false, move: { x: 0, y: 0 }, aim: null, fire: false, pressed: [] };

/** Radial dead zone that rescales the rest to 0..1, so small drift is ignored but full speed is still reachable. */
export function applyDeadzone(x: number, y: number, dz = DEADZONE): Vec {
  const len = Math.hypot(x, y);
  if (len <= dz) return { x: 0, y: 0 };
  const scaled = Math.min(1, (len - dz) / (1 - dz));
  return { x: (x / len) * scaled, y: (y / len) * scaled };
}

const isDown = (pad: PadLike, i: number): boolean => {
  const b = pad.buttons[i];
  if (!b) return false;
  return i === PAD.LT || i === PAD.RT ? b.pressed || (b.value ?? 0) > TRIGGER : b.pressed;
};

/** Turns raw gamepad polling into movement, aim, fire and edge-triggered button presses. */
export class PadReader {
  private prev = new Set<number>();
  private stickHeld = new Set<number>();

  read(pad: PadLike | null | undefined): PadState {
    if (!pad || pad.connected === false) {
      this.prev.clear();
      this.stickHeld.clear();
      return NO_PAD;
    }
    const lx = pad.axes[0] ?? 0;
    const ly = pad.axes[1] ?? 0;
    const move = applyDeadzone(lx, -ly);
    const rawAim = applyDeadzone(pad.axes[2] ?? 0, -(pad.axes[3] ?? 0), 0.35);
    const aimLen = Math.hypot(rawAim.x, rawAim.y);
    const aim = aimLen > 0 ? { x: rawAim.x / aimLen, y: rawAim.y / aimLen } : null;

    const now = new Set<number>();
    for (let i = 0; i < pad.buttons.length; i++) if (isDown(pad, i)) now.add(i);
    const pressed = [...now].filter((i) => !this.prev.has(i));
    this.prev = now;

    const stick: [number, boolean, boolean][] = [
      [PAD.STICK_UP, -ly > STICK_STEP, -ly < STICK_RELEASE],
      [PAD.STICK_DOWN, ly > STICK_STEP, ly < STICK_RELEASE],
      [PAD.STICK_LEFT, -lx > STICK_STEP, -lx < STICK_RELEASE],
      [PAD.STICK_RIGHT, lx > STICK_STEP, lx < STICK_RELEASE],
    ];
    for (const [id, pushed, released] of stick) {
      if (pushed && !this.stickHeld.has(id)) {
        this.stickHeld.add(id);
        pressed.push(id);
      } else if (released) {
        this.stickHeld.delete(id);
      }
    }
    return { connected: true, move, aim, fire: isDown(pad, PAD.RT) || isDown(pad, PAD.LT), pressed };
  }
}

/** Keyboard code that a pad button stands for during play (the game then handles it like a key). */
export const PLAY_BUTTONS: Readonly<Record<number, string>> = {
  [PAD.A]: 'Space',
  [PAD.X]: 'KeyR',
  [PAD.Y]: 'KeyQ',
  [PAD.B]: 'KeyT',
  [PAD.RB]: 'KeyG',
  [PAD.LB]: 'KeyE',
  [PAD.VIEW]: 'Tab',
  [PAD.MENU]: 'Escape',
};

export type MenuAction = 'next' | 'prev' | 'confirm' | 'back';

/** What a pad button does on menu screens. */
export function menuAction(button: number): MenuAction | null {
  switch (button) {
    case PAD.DOWN:
    case PAD.RIGHT:
    case PAD.STICK_DOWN:
    case PAD.STICK_RIGHT:
      return 'next';
    case PAD.UP:
    case PAD.LEFT:
    case PAD.STICK_UP:
    case PAD.STICK_LEFT:
      return 'prev';
    case PAD.A:
      return 'confirm';
    case PAD.B:
    case PAD.MENU:
    case PAD.VIEW:
      return 'back';
    default:
      return null;
  }
}

/**
 * Map-plane direction whose on-screen image points along a screen direction (x right, y up).
 * Screen "up" is foreshortened in the isometric view, so it needs a longer map step.
 */
export function screenToMapDir(sx: number, sy: number, right: Vec, up: Vec, sinElevation: number): Vec {
  const x = right.x * sx + (up.x * sy) / sinElevation;
  const y = right.y * sx + (up.y * sy) / sinElevation;
  const len = Math.hypot(x, y) || 1;
  return { x: x / len, y: y / len };
}
