const NATIVE_MENU_KEYS = new Set(['Tab', 'Enter', 'NumpadEnter', 'Space']);

/** Keyboard + mouse state. Movement keys are read by physical key code, so WASD works on any layout. */
export class Input {
  private readonly down = new Set<string>();
  private readonly pressedQueue: string[] = [];
  mouseX = window.innerWidth / 2;
  mouseY = window.innerHeight / 2;
  firing = false;
  wheel = 0;
  /** True while a menu is shown, so keyboard users can move between and press its buttons. */
  menuMode = false;
  /** Left stick of a gamepad (screen space, y up). */
  padMove = { x: 0, y: 0 };
  /** Gamepad trigger held. */
  padFire = false;
  /** Last right stick direction (screen space, y up). */
  padAim = { x: 1, y: 0 };
  /** Which device aims: the last one that moved wins. */
  aimSource: 'mouse' | 'pad' = 'mouse';
  private readonly element: HTMLElement;

  constructor(element: HTMLElement) {
    this.element = element;
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    element.addEventListener('mousemove', this.onMouseMove);
    element.addEventListener('mousedown', this.onMouseDown);
    window.addEventListener('mouseup', this.onMouseUp);
    element.addEventListener('wheel', this.onWheel, { passive: true });
    element.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  private readonly onKeyDown = (e: KeyboardEvent) => {
    // In menus, Tab / Enter / Space on a button keep their normal meaning (move focus, press).
    const onButton = e.target instanceof Element && e.target.closest('button') !== null;
    if (this.menuMode && onButton && NATIVE_MENU_KEYS.has(e.code)) return;
    if (e.code === 'Space' || e.code === 'Tab' || e.code.startsWith('Arrow')) e.preventDefault();
    if (!e.repeat) this.pressedQueue.push(e.code);
    this.down.add(e.code);
  };

  private readonly onKeyUp = (e: KeyboardEvent) => {
    this.down.delete(e.code);
  };

  private readonly onBlur = () => {
    this.down.clear();
    this.firing = false;
  };

  private readonly onMouseMove = (e: MouseEvent) => {
    this.mouseX = e.clientX;
    this.mouseY = e.clientY;
    this.aimSource = 'mouse';
  };

  private readonly onMouseDown = (e: MouseEvent) => {
    if (e.button === 0) this.firing = true;
    // Right click is queued like a key press so it can throw grenades.
    if (e.button === 2) this.pressedQueue.push('Mouse2');
    this.element.focus();
  };

  private readonly onMouseUp = (e: MouseEvent) => {
    if (e.button === 0) this.firing = false;
  };

  private readonly onWheel = (e: WheelEvent) => {
    this.wheel += Math.sign(e.deltaY);
  };

  isDown(code: string): boolean {
    return this.down.has(code);
  }

  /** Returns key codes pressed since the last call (edge-triggered). */
  consumePressed(): string[] {
    return this.pressedQueue.splice(0);
  }

  /** Adds a key press from another device (gamepad buttons are mapped to key codes). */
  queue(code: string): void {
    this.pressedQueue.push(code);
  }

  /** Mouse button or gamepad trigger held. */
  get shooting(): boolean {
    return this.firing || this.padFire;
  }

  consumeWheel(): number {
    const w = this.wheel;
    this.wheel = 0;
    return w;
  }

  /** Movement axes in screen space: x = right, y = up. Keyboard wins; otherwise the gamepad stick (analog). */
  moveAxes(): { x: number; y: number } {
    const x = (this.isDown('KeyD') || this.isDown('ArrowRight') ? 1 : 0) - (this.isDown('KeyA') || this.isDown('ArrowLeft') ? 1 : 0);
    const y = (this.isDown('KeyW') || this.isDown('ArrowUp') ? 1 : 0) - (this.isDown('KeyS') || this.isDown('ArrowDown') ? 1 : 0);
    if (x !== 0 || y !== 0) return { x, y };
    return { x: this.padMove.x, y: this.padMove.y };
  }
}
