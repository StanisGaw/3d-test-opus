/** A body thrown by an explosion: flies, spins, bounces on the ground and comes to rest. */
export interface Body {
  x: number;
  y: number;
  /** Height above the ground. */
  h: number;
  vx: number;
  vy: number;
  vh: number;
  angle: number;
  spin: number;
  bounces: number;
  resting: boolean;
}

export const RAGDOLL = { gravity: 24, restitution: 0.35, groundFriction: 6, maxBounces: 2 } as const;

/** Starts a throw away from a blast. `power` 0..1 scales the speed. */
export function launchBody(x: number, y: number, dirX: number, dirY: number, power: number, spinSign = 1): Body {
  const len = Math.hypot(dirX, dirY) || 1;
  const speed = 4 + 6 * power;
  return {
    x,
    y,
    h: 0.05,
    vx: (dirX / len) * speed,
    vy: (dirY / len) * speed,
    vh: 5 + 4 * power,
    angle: 0,
    spin: spinSign * (8 + 8 * power),
    bounces: 0,
    resting: false,
  };
}

export function stepBody(b: Body, dt: number): void {
  if (b.resting) return;
  b.vh -= RAGDOLL.gravity * dt;
  b.x += b.vx * dt;
  b.y += b.vy * dt;
  b.h += b.vh * dt;
  b.angle += b.spin * dt;
  if (b.h > 0) return;
  b.h = 0;
  if (b.bounces >= RAGDOLL.maxBounces || Math.abs(b.vh) < 2) {
    b.resting = true;
    b.vh = 0;
    b.spin = 0;
    // Land flat on the side it spun towards.
    b.angle = (Math.sign(b.angle) || 1) * (Math.PI / 2);
    return;
  }
  b.bounces++;
  b.vh = -b.vh * RAGDOLL.restitution;
  const friction = Math.exp(-RAGDOLL.groundFriction * 0.05);
  b.vx *= friction;
  b.vy *= friction;
  b.spin *= 0.5;
}
