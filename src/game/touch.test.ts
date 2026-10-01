import { describe, expect, it } from 'vitest';
import { STICK_RADIUS, stickVector } from './systems/touch.ts';

describe('stickVector', () => {
  it('is zero at the origin and inside the dead zone', () => {
    expect(stickVector(0, 0)).toEqual({ x: 0, y: 0 });
    expect(stickVector(2, -2)).toEqual({ x: 0, y: 0 });
  });

  it('flips y so that pushing the thumb up gives positive y', () => {
    const v = stickVector(0, -STICK_RADIUS);
    expect(v.x).toBeCloseTo(0);
    expect(v.y).toBeCloseTo(1);
  });

  it('points right for a thumb to the right and clamps to length 1', () => {
    const v = stickVector(STICK_RADIUS * 3, 0);
    expect(v.x).toBeCloseTo(1);
    expect(v.y).toBeCloseTo(0);
    expect(Math.hypot(v.x, v.y)).toBeLessThanOrEqual(1.0001);
  });

  it('scales smoothly between the dead zone and the radius', () => {
    const half = stickVector(STICK_RADIUS / 2, 0);
    expect(half.x).toBeGreaterThan(0.3);
    expect(half.x).toBeLessThan(0.7);
  });
});
