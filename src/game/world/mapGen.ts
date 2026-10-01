import { createRng, fractalNoise, randomInt } from './random.ts';

export const Ground = {
  Grass: 0,
  GrassDark: 1,
  Dirt: 2,
  Sand: 3,
  Water: 4,
  StoneFloor: 5,
  GraveDirt: 6,
} as const;
export type Ground = (typeof Ground)[keyof typeof Ground];

export const Obstacle = {
  None: 0,
  Rock: 1,
  Wall: 2,
  Tree: 3,
  Grave: 4,
} as const;
export type Obstacle = (typeof Obstacle)[keyof typeof Obstacle];

export interface TilePoint {
  x: number;
  y: number;
}

export interface GameMap {
  readonly size: number;
  readonly seed: number;
  readonly ground: Uint8Array;
  readonly obstacle: Uint8Array;
  /** 1 when the tile is walkable and connected to the start tile. */
  readonly reachable: Uint8Array;
  readonly start: TilePoint;
}

const BORDER = 2;
const SAFE_RADIUS = 5;

export const tileIndex = (map: GameMap, x: number, y: number): number => y * map.size + x;

export const inBounds = (map: GameMap, x: number, y: number): boolean =>
  x >= 0 && y >= 0 && x < map.size && y < map.size;

export function isWalkable(map: GameMap, x: number, y: number): boolean {
  if (!inBounds(map, x, y)) return false;
  const i = tileIndex(map, x, y);
  return map.obstacle[i] === Obstacle.None && map.ground[i] !== Ground.Water;
}

/** Bullets fly over water and graves, but not through rocks, walls or trees. */
export function blocksShot(map: GameMap, x: number, y: number): boolean {
  if (!inBounds(map, x, y)) return true;
  const o = map.obstacle[tileIndex(map, x, y)];
  return o === Obstacle.Rock || o === Obstacle.Wall || o === Obstacle.Tree;
}

function carveRuin(ground: Uint8Array, obstacle: Uint8Array, size: number, rng: () => number): void {
  const w = randomInt(rng, 6, 10);
  const h = randomInt(rng, 6, 10);
  const x0 = randomInt(rng, BORDER + 1, size - BORDER - w - 2);
  const y0 = randomInt(rng, BORDER + 1, size - BORDER - h - 2);
  const midX = x0 + Math.floor(w / 2);
  const midY = y0 + Math.floor(h / 2);
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) {
      const i = y * size + x;
      ground[i] = Ground.StoneFloor;
      obstacle[i] = Obstacle.None;
      const edge = x === x0 || y === y0 || x === x0 + w - 1 || y === y0 + h - 1;
      const door = x === midX || y === midY || x === midX - 1 || y === midY - 1;
      if (edge && !door && rng() > 0.18) obstacle[i] = Obstacle.Wall;
    }
  }
}

function carveGraveyard(ground: Uint8Array, obstacle: Uint8Array, size: number, rng: () => number): void {
  const w = randomInt(rng, 6, 9);
  const h = randomInt(rng, 5, 8);
  const x0 = randomInt(rng, BORDER + 1, size - BORDER - w - 2);
  const y0 = randomInt(rng, BORDER + 1, size - BORDER - h - 2);
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) {
      const i = y * size + x;
      ground[i] = Ground.GraveDirt;
      const isGraveSlot = (x - x0) % 2 === 1 && (y - y0) % 2 === 1;
      obstacle[i] = isGraveSlot && rng() > 0.25 ? Obstacle.Grave : Obstacle.None;
    }
  }
}

function floodReachable(size: number, ground: Uint8Array, obstacle: Uint8Array, start: TilePoint): Uint8Array {
  const reachable = new Uint8Array(size * size);
  const queue = new Int32Array(size * size);
  let head = 0;
  let tail = 0;
  const startIndex = start.y * size + start.x;
  reachable[startIndex] = 1;
  queue[tail++] = startIndex;
  const walkable = (i: number) => obstacle[i] === Obstacle.None && ground[i] !== Ground.Water;
  while (head < tail) {
    const i = queue[head++];
    const x = i % size;
    const y = (i / size) | 0;
    const neighbours = [
      [x + 1, y],
      [x - 1, y],
      [x, y + 1],
      [x, y - 1],
    ];
    for (const [nx, ny] of neighbours) {
      if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
      const ni = ny * size + nx;
      if (reachable[ni] || !walkable(ni)) continue;
      reachable[ni] = 1;
      queue[tail++] = ni;
    }
  }
  return reachable;
}

export function generateMap(seed: number, size = 72): GameMap {
  const rng = createRng(seed);
  const ground = new Uint8Array(size * size);
  const obstacle = new Uint8Array(size * size);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const elevation = fractalNoise(x / 16, y / 16, seed);
      const moisture = fractalNoise(x / 11, y / 11, seed + 77);
      const path = Math.abs(fractalNoise(x / 14, y / 14, seed + 5, 3) - 0.5);

      if (elevation < 0.3) ground[i] = Ground.Water;
      else if (elevation < 0.35) ground[i] = Ground.Sand;
      else if (path < 0.025) ground[i] = Ground.Dirt;
      else ground[i] = moisture > 0.58 ? Ground.GrassDark : Ground.Grass;

      if (ground[i] === Ground.Water || ground[i] === Ground.Dirt) continue;
      if (elevation > 0.72) obstacle[i] = Obstacle.Rock;
      else if (moisture > 0.56 && rng() < (moisture - 0.56) * 1.4) obstacle[i] = Obstacle.Tree;
      else if (rng() < 0.012) obstacle[i] = Obstacle.Tree;
      else if (rng() < 0.006) obstacle[i] = Obstacle.Rock;
    }
  }

  const ruins = randomInt(rng, 3, 5);
  for (let r = 0; r < ruins; r++) carveRuin(ground, obstacle, size, rng);
  const graveyards = randomInt(rng, 1, 2);
  for (let g = 0; g < graveyards; g++) carveGraveyard(ground, obstacle, size, rng);

  const start = { x: Math.floor(size / 2), y: Math.floor(size / 2) };
  for (let y = start.y - SAFE_RADIUS; y <= start.y + SAFE_RADIUS; y++) {
    for (let x = start.x - SAFE_RADIUS; x <= start.x + SAFE_RADIUS; x++) {
      if ((x - start.x) ** 2 + (y - start.y) ** 2 > SAFE_RADIUS ** 2) continue;
      const i = y * size + x;
      obstacle[i] = Obstacle.None;
      if (ground[i] === Ground.Water || ground[i] === Ground.Sand) ground[i] = Ground.Grass;
    }
  }

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const isBorder = x < BORDER || y < BORDER || x >= size - BORDER || y >= size - BORDER;
      if (isBorder) obstacle[y * size + x] = Obstacle.Rock;
    }
  }

  const reachable = floodReachable(size, ground, obstacle, start);
  return { size, seed, ground, obstacle, reachable, start };
}

/** Finds a random reachable tile whose distance to (cx, cy) is within [minDist, maxDist]. */
export function findTileInRing(
  map: GameMap,
  rng: () => number,
  cx: number,
  cy: number,
  minDist: number,
  maxDist: number,
  attempts = 60,
): TilePoint | null {
  for (let a = 0; a < attempts; a++) {
    const angle = rng() * Math.PI * 2;
    const dist = minDist + rng() * (maxDist - minDist);
    const x = Math.floor(cx + Math.cos(angle) * dist);
    const y = Math.floor(cy + Math.sin(angle) * dist);
    if (inBounds(map, x, y) && map.reachable[tileIndex(map, x, y)]) return { x, y };
  }
  return null;
}
