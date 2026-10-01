import { describe, expect, it } from 'vitest';
import { SCREEN_RIGHT, SCREEN_UP, SIN_ELEVATION, screenAngle } from './gfx/iso.ts';
import { PAD, PadReader, type PadLike, applyDeadzone, menuAction, screenToMapDir } from './systems/gamepad.ts';

const pad = (axes: number[] = [0, 0, 0, 0], down: number[] = [], triggers: Record<number, number> = {}): PadLike => ({
  connected: true,
  axes,
  buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: down.includes(i), value: triggers[i] ?? (down.includes(i) ? 1 : 0) })),
});

describe('gamepad', () => {
  it('given a drifting stick, when read, then small values are ignored and a full push stays at full length', () => {
    expect(applyDeadzone(0.1, 0.1)).toEqual({ x: 0, y: 0 });
    const full = applyDeadzone(1, 0);
    expect(full.x).toBeCloseTo(1);
    const half = applyDeadzone(0.6, 0);
    expect(half.x).toBeGreaterThan(0);
    expect(half.x).toBeLessThan(0.6);
  });

  it('given a held button, when read on several frames, then it is reported as pressed only once', () => {
    const r = new PadReader();
    expect(r.read(pad([0, 0, 0, 0], [PAD.A])).pressed).toContain(PAD.A);
    expect(r.read(pad([0, 0, 0, 0], [PAD.A])).pressed).not.toContain(PAD.A);
    r.read(pad());
    expect(r.read(pad([0, 0, 0, 0], [PAD.A])).pressed).toContain(PAD.A);
  });

  it('given the sticks, when read, then move is in screen space with y up and aim is a unit vector', () => {
    const s = new PadReader().read(pad([0, -1, 0.8, 0.1]));
    expect(s.move.y).toBeCloseTo(1);
    expect(s.move.x).toBeCloseTo(0);
    expect(Math.hypot(s.aim!.x, s.aim!.y)).toBeCloseTo(1);
    expect(s.aim!.y).toBeLessThan(0);
    expect(new PadReader().read(pad([0, 0, 0.1, 0.1])).aim).toBeNull();
  });

  it('given an analog trigger, when half pulled, then the hero fires', () => {
    expect(new PadReader().read(pad([0, 0, 0, 0], [], { [PAD.RT]: 0.5 })).fire).toBe(true);
    expect(new PadReader().read(pad([0, 0, 0, 0], [], { [PAD.RT]: 0.1 })).fire).toBe(false);
  });

  it('given the left stick held down in a menu, when read, then it steps once until it is let go', () => {
    const r = new PadReader();
    expect(r.read(pad([0, 0.9])).pressed).toContain(PAD.STICK_DOWN);
    expect(r.read(pad([0, 0.9])).pressed).not.toContain(PAD.STICK_DOWN);
    r.read(pad([0, 0]));
    expect(r.read(pad([0, 0.9])).pressed).toContain(PAD.STICK_DOWN);
  });

  it('given menu buttons, when mapped, then the D-pad moves focus, A confirms and B goes back', () => {
    expect(menuAction(PAD.DOWN)).toBe('next');
    expect(menuAction(PAD.STICK_UP)).toBe('prev');
    expect(menuAction(PAD.A)).toBe('confirm');
    expect(menuAction(PAD.B)).toBe('back');
    expect(menuAction(PAD.RB)).toBeNull();
  });

  it('given a stick direction, when turned into a map direction, then it points the same way on screen', () => {
    for (const deg of [0, 30, 90, 135, 200, 290]) {
      const a = (deg * Math.PI) / 180;
      const dir = screenToMapDir(Math.cos(a), Math.sin(a), SCREEN_RIGHT, SCREEN_UP, SIN_ELEVATION);
      const back = screenAngle(dir.x, dir.y);
      const diff = Math.atan2(Math.sin(back - a), Math.cos(back - a));
      expect(Math.abs(diff)).toBeLessThan(1e-9);
    }
  });

  it('given no pad, when read, then nothing is pressed and the hero does not move', () => {
    const s = new PadReader().read(null);
    expect(s.connected).toBe(false);
    expect(s.pressed).toEqual([]);
    expect(s.move).toEqual({ x: 0, y: 0 });
  });
});
