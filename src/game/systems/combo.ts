/** Kills within this many seconds keep the combo going. */
export const COMBO_WINDOW = 2.5;
/** Every this many kills the score multiplier goes up by one step. */
export const COMBO_STEP = 10;
const STEP_BONUS = 0.25;
const MAX_MULT = 3;

export const comboMultiplier = (count: number): number => Math.min(MAX_MULT, 1 + Math.floor(count / COMBO_STEP) * STEP_BONUS);

/** 1.25 → "1.25", 1.5 → "1.5", 2 → "2". */
export const formatMultiplier = (m: number): string => String(Number(m.toFixed(2)));

/** Kill streak: each kill refreshes the timer; the streak raises the score multiplier. */
export class Combo {
  count = 0;
  best = 0;
  private timer = 0;

  get active(): boolean {
    return this.count > 0 && this.timer > 0;
  }

  get multiplier(): number {
    return comboMultiplier(this.count);
  }

  /** 1 right after a kill, 0 when the combo is about to end. */
  get timeLeft(): number {
    return Math.max(0, this.timer / COMBO_WINDOW);
  }

  /** Adds a kill. Returns true when the kill reached a new multiplier step. */
  add(): boolean {
    const before = this.multiplier;
    this.count++;
    this.timer = COMBO_WINDOW;
    this.best = Math.max(this.best, this.count);
    return this.multiplier > before;
  }

  /** Taking damage halves the streak instead of ending it. */
  hurt(): void {
    this.count = Math.floor(this.count / 2);
    if (this.count === 0) this.timer = 0;
  }

  /** Returns the length of a combo that just ran out, or 0. */
  update(dt: number): number {
    if (this.count === 0) return 0;
    this.timer -= dt;
    if (this.timer > 0) return 0;
    const ended = this.count;
    this.count = 0;
    this.timer = 0;
    return ended;
  }

  reset(): void {
    this.count = 0;
    this.best = 0;
    this.timer = 0;
  }
}
