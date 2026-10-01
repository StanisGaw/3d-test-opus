import { type GameMap, type TilePoint, isWalkable, tileIndex } from './mapGen.ts';
import { createRng } from './random.ts';

export interface SpikeTile extends TilePoint {
  /** Offset in seconds so neighbouring traps do not all fire together. */
  readonly phase: number;
}

export interface PropLayout {
  /** Barrel centres in map units. */
  readonly barrels: readonly { x: number; y: number }[];
  readonly spikes: readonly SpikeTile[];
}

/** Spike traps go up for `up` seconds out of every `cycle`, with a short warning before. */
export const SPIKE_TIMING = { cycle: 3.2, up: 1.0, warn: 0.45 } as const;

const BARREL_GROUPS = 7;
const SPIKE_PATCHES = 5;
/** Keep traps away from the hero's spawn point. */
const SAFE_DISTANCE = 6;

export type SpikeState = 'down' | 'warn' | 'up';

export function spikeState(time: number, phase: number): SpikeState {
  const { cycle, up, warn } = SPIKE_TIMING;
  const t = (((time + phase) % cycle) + cycle) % cycle;
  if (t < up) return 'up';
  if (t > cycle - warn) return 'warn';
  return 'down';
}

function freeTile(map: GameMap, x: number, y: number, used: Set<number>): boolean {
  if (!isWalkable(map, x, y)) return false;
  const i = tileIndex(map, x, y);
  if (!map.reachable[i] || used.has(i)) return false;
  return Math.hypot(x - map.start.x, y - map.start.y) >= SAFE_DISTANCE;
}

function randomTile(map: GameMap, rng: () => number, used: Set<number>): TilePoint | null {
  for (let tries = 0; tries < 200; tries++) {
    const x = Math.floor(rng() * map.size);
    const y = Math.floor(rng() * map.size);
    if (freeTile(map, x, y, used)) return { x, y };
  }
  return null;
}

/**
 * Places explosive barrels (in small groups, so they can chain) and spike traps. The layout only
 * depends on the map seed, so a continued run gets the same traps.
 */
export function placeProps(map: GameMap): PropLayout {
  const rng = createRng((map.seed ^ 0x5bd1e995) >>> 0);
  const used = new Set<number>();
  const barrels: { x: number; y: number }[] = [];
  const spikes: SpikeTile[] = [];
  for (let g = 0; g < BARREL_GROUPS; g++) {
    const origin = randomTile(map, rng, used);
    if (!origin) break;
    const size = 1 + Math.floor(rng() * 3);
    const tiles = [origin, { x: origin.x + 1, y: origin.y }, { x: origin.x, y: origin.y + 1 }];
    for (const t of tiles.slice(0, size)) {
      if (!freeTile(map, t.x, t.y, used)) continue;
      used.add(tileIndex(map, t.x, t.y));
      barrels.push({ x: t.x + 0.5 + (rng() - 0.5) * 0.2, y: t.y + 0.5 + (rng() - 0.5) * 0.2 });
    }
  }
  for (let p = 0; p < SPIKE_PATCHES; p++) {
    const origin = randomTile(map, rng, used);
    if (!origin) break;
    const phase = rng() * SPIKE_TIMING.cycle;
    for (const [dx, dy] of [
      [0, 0],
      [1, 0],
      [0, 1],
      [1, 1],
    ]) {
      const x = origin.x + dx;
      const y = origin.y + dy;
      if (!freeTile(map, x, y, used)) continue;
      used.add(tileIndex(map, x, y));
      spikes.push({ x, y, phase });
    }
  }
  return { barrels, spikes };
}
