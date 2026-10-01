interface Timer {
  t: number;
  readonly fn: () => void;
}

/** Runs callbacks after a delay. Callbacks may schedule new timers (e.g. chained explosions). */
export class Timers {
  private list: Timer[] = [];

  after(seconds: number, fn: () => void): void {
    this.list.push({ t: seconds, fn });
  }

  update(dt: number): void {
    const due: Timer[] = [];
    this.list = this.list.filter((timer) => {
      timer.t -= dt;
      if (timer.t > 0) return true;
      due.push(timer);
      return false;
    });
    for (const timer of due) timer.fn();
  }

  get pending(): number {
    return this.list.length;
  }

  clear(): void {
    this.list = [];
  }
}
