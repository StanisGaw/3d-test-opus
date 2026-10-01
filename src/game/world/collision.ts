import { type GameMap, blocksShot, isWalkable } from './mapGen.ts';

export interface Vec2 {
  x: number;
  y: number;
}

/**
 * Moves a circle by (dx, dy) and pushes it out of non-walkable tiles.
 * Axes are resolved separately so entities slide along walls.
 */
export function moveCircle(map: GameMap, pos: Vec2, radius: number, dx: number, dy: number): void {
  // Sub-steps prevent tunnelling through one-tile walls on fast moves (dashes, boss charges).
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / (radius * 0.9)));
  const sx = dx / steps;
  const sy = dy / steps;
  for (let i = 0; i < steps; i++) {
    pos.x += sx;
    pushOut(map, pos, radius);
    pos.y += sy;
    pushOut(map, pos, radius);
  }
}

export function pushOut(map: GameMap, pos: Vec2, radius: number): void {
  const minX = Math.floor(pos.x - radius);
  const maxX = Math.floor(pos.x + radius);
  const minY = Math.floor(pos.y - radius);
  const maxY = Math.floor(pos.y + radius);
  for (let ty = minY; ty <= maxY; ty++) {
    for (let tx = minX; tx <= maxX; tx++) {
      if (isWalkable(map, tx, ty)) continue;
      const nearestX = Math.max(tx, Math.min(pos.x, tx + 1));
      const nearestY = Math.max(ty, Math.min(pos.y, ty + 1));
      const ox = pos.x - nearestX;
      const oy = pos.y - nearestY;
      const distSq = ox * ox + oy * oy;
      if (distSq >= radius * radius) continue;
      if (distSq > 1e-9) {
        const dist = Math.sqrt(distSq);
        const push = radius - dist;
        pos.x += (ox / dist) * push;
        pos.y += (oy / dist) * push;
      } else {
        // Centre is inside the tile: push out through the closest edge.
        const left = pos.x - tx;
        const right = tx + 1 - pos.x;
        const top = pos.y - ty;
        const bottom = ty + 1 - pos.y;
        const m = Math.min(left, right, top, bottom);
        if (m === left) pos.x = tx - radius;
        else if (m === right) pos.x = tx + 1 + radius;
        else if (m === top) pos.y = ty - radius;
        else pos.y = ty + 1 + radius;
      }
    }
  }
}

/** True when a bullet could fly from A to B without hitting rocks, walls or trees. */
export function hasLineOfSight(map: GameMap, a: Vec2, b: Vec2): boolean {
  const dist = Math.hypot(b.x - a.x, b.y - a.y);
  const steps = Math.ceil(dist / 0.3);
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    if (blocksShot(map, Math.floor(a.x + (b.x - a.x) * t), Math.floor(a.y + (b.y - a.y) * t))) return false;
  }
  return true;
}

/** Walks from A towards B and returns the last point before an obstacle (for thrown items). */
export function clampToLineOfSight(map: GameMap, a: Vec2, b: Vec2): Vec2 {
  const dist = Math.hypot(b.x - a.x, b.y - a.y);
  const steps = Math.max(1, Math.ceil(dist / 0.2));
  let last = { x: a.x, y: a.y };
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const p = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    if (!isWalkable(map, Math.floor(p.x), Math.floor(p.y))) return last;
    last = p;
  }
  return last;
}

/** Distance from point P to segment AB, plus the projection parameter t in [0, 1]. */
export function pointSegmentDistance(p: Vec2, a: Vec2, b: Vec2): { dist: number; t: number } {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const lenSq = abx * abx + aby * aby;
  const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.y - a.y) * aby) / lenSq));
  const cx = a.x + abx * t;
  const cy = a.y + aby * t;
  return { dist: Math.hypot(p.x - cx, p.y - cy), t };
}
