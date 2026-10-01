import { type GameMap, isWalkable } from './mapGen.ts';

export const UNREACHABLE = 0xffff;

const DIRS: ReadonlyArray<readonly [number, number, number]> = [
  [1, 0, 10],
  [-1, 0, 10],
  [0, 1, 10],
  [0, -1, 10],
  [1, 1, 14],
  [1, -1, 14],
  [-1, 1, 14],
  [-1, -1, 14],
];

/** Dijkstra-style distance field (in 1/10 tiles) from a target tile; used to steer enemies around obstacles. */
export class FlowField {
  readonly distance: Uint16Array;
  private targetX = -1;
  private targetY = -1;
  private readonly map: GameMap;

  constructor(map: GameMap) {
    this.map = map;
    this.distance = new Uint16Array(map.size * map.size).fill(UNREACHABLE);
  }

  get target(): { x: number; y: number } {
    return { x: this.targetX, y: this.targetY };
  }

  private canStep(x: number, y: number, dx: number, dy: number): boolean {
    if (!isWalkable(this.map, x + dx, y + dy)) return false;
    if (dx !== 0 && dy !== 0) {
      return isWalkable(this.map, x + dx, y) && isWalkable(this.map, x, y + dy);
    }
    return true;
  }

  update(tx: number, ty: number): void {
    if (tx === this.targetX && ty === this.targetY) return;
    this.targetX = tx;
    this.targetY = ty;
    const { size } = this.map;
    const dist = this.distance;
    dist.fill(UNREACHABLE);
    if (!isWalkable(this.map, tx, ty)) return;

    // Bucket queue: edge weights are 10 or 14, so a simple sorted-by-bucket queue is fast and exact.
    const buckets: number[][] = [];
    const push = (i: number, d: number) => {
      (buckets[d] ??= []).push(i);
    };
    dist[ty * size + tx] = 0;
    push(ty * size + tx, 0);
    for (let d = 0; d < buckets.length; d++) {
      const bucket = buckets[d];
      if (!bucket) continue;
      for (const i of bucket) {
        if (dist[i] !== d) continue;
        const x = i % size;
        const y = (i / size) | 0;
        for (const [dx, dy, cost] of DIRS) {
          if (!this.canStep(x, y, dx, dy)) continue;
          const ni = (y + dy) * size + (x + dx);
          const nd = d + cost;
          if (nd < dist[ni] && nd < UNREACHABLE) {
            dist[ni] = nd;
            push(ni, nd);
          }
        }
      }
      buckets[d] = [];
    }
  }

  /** Returns a unit direction towards the neighbour tile closest to the target, or null if stuck. */
  direction(x: number, y: number): { x: number; y: number } | null {
    const { size } = this.map;
    if (x < 0 || y < 0 || x >= size || y >= size) return null;
    let best = this.distance[y * size + x];
    let bestDir: { x: number; y: number } | null = null;
    for (const [dx, dy] of DIRS) {
      if (!this.canStep(x, y, dx, dy)) continue;
      const d = this.distance[(y + dy) * size + (x + dx)];
      if (d < best) {
        best = d;
        const len = Math.hypot(dx, dy);
        bestDir = { x: dx / len, y: dy / len };
      }
    }
    return bestDir;
  }
}
