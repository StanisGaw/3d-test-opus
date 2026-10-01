import * as THREE from 'three';
import { type SpriteArt, TRANSPARENT, artSize } from './pixelArt.ts';
import {
  BAT_FRAMES,
  BARREL_FRAMES,
  BLOATER_FRAMES,
  BOSS_VARIANTS,
  DRONE_ART,
  GLYPHS,
  GRAVE_ART,
  GRENADE_ART,
  HERO_FRAMES,
  HERO_VARIANTS,
  MINE_ART,
  PARACHUTE_ART,
  RIOT_FRAMES,
  SPITTER_FRAMES,
  SPIKE_ART,
  TURRET_ART,
  WEAPON_ART,
  ZOMBIE_FRAMES,
} from './spriteArt.ts';
import { WEAPONS, type WeaponId } from '../systems/weapons.ts';
import type { HeroId } from '../systems/heroes.ts';
import type { ZombieKind } from '../systems/waveDirector.ts';
import { Ground, type GameMap, Obstacle } from '../world/mapGen.ts';
import { createRng } from '../world/random.ts';

/** World units per texel. Ground uses the same density (16 texels per tile). */
export const PX = 1 / 16;
export const GROUND_TEXELS = 16;

export interface AnimSet {
  readonly frames: THREE.Texture[];
  readonly flash: THREE.Texture[];
  /** Same frames mirrored horizontally, for actors facing left. */
  readonly framesLeft: THREE.Texture[];
  readonly flashLeft: THREE.Texture[];
  readonly width: number;
  readonly height: number;
}

export type CrateKind = Exclude<WeaponId, 'pistol'> | 'medkit';

export interface Assets {
  hero: AnimSet;
  /** One animation set per playable hero (colour variants). */
  heroes: Record<HeroId, AnimSet>;
  /** Large portrait (data URL) for the hero select screen. */
  heroIcons: Record<HeroId, string>;
  zombies: Record<ZombieKind, AnimSet>;
  /** Riot zombie after its shield has been destroyed. */
  riotBroken: AnimSet;
  bosses: { name: string; anim: AnimSet }[];
  weapons: Record<WeaponId, { texture: THREE.Texture; flipped: THREE.Texture; width: number; height: number; icon: string }>;
  crates: Record<CrateKind, THREE.Texture>;
  parachute: THREE.Texture;
  grave: THREE.Texture;
  trees: THREE.Texture[];
  shadow: THREE.Texture;
  bullet: THREE.Texture;
  pellet: THREE.Texture;
  rocket: THREE.Texture;
  bile: THREE.Texture;
  flame: THREE.Texture;
  smoke: THREE.Texture;
  spark: THREE.Texture;
  muzzle: THREE.Texture;
  explosion: THREE.Texture[];
  blood: THREE.Texture[];
  rockSide: THREE.Texture;
  rockTop: THREE.Texture;
  wallSide: THREE.Texture;
  wallTop: THREE.Texture;
  /** One animation set per turret tier (1..3). */
  turrets: AnimSet[];
  drone: THREE.Texture;
  grenade: THREE.Texture;
  /** Lit and unlit mine frames. */
  mine: THREE.Texture[];
  /** XP gems: small, medium, large. */
  gems: THREE.Texture[];
  /** Explosive barrel: intact and damaged. */
  barrel: [AnimSet, AnimSet];
  /** Spike trap floor: down, warning, up. */
  spikes: THREE.Texture[];
}

function makeCanvas(width: number, height: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas is not supported');
  ctx.imageSmoothingEnabled = false;
  return [canvas, ctx];
}

export function artToCanvas(art: SpriteArt): HTMLCanvasElement {
  const { width, height } = artSize(art);
  const [canvas, ctx] = makeCanvas(width, height);
  art.rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const key = row[x];
      if (key === TRANSPARENT) continue;
      ctx.fillStyle = art.palette[key];
      ctx.fillRect(x, y, 1, 1);
    }
  });
  return canvas;
}

function silhouette(source: HTMLCanvasElement, color: string): HTMLCanvasElement {
  const [canvas, ctx] = makeCanvas(source.width, source.height);
  ctx.drawImage(source, 0, 0);
  ctx.globalCompositeOperation = 'source-in';
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  return canvas;
}

export function toTexture(canvas: HTMLCanvasElement): THREE.Texture {
  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/**
 * Mirrored copy of a canvas. three.js sprites ignore negative scale (the shader takes the
 * length of the scale vector), so mirroring has to be baked into the texture.
 */
function flipCanvas(source: HTMLCanvasElement, axis: 'x' | 'y'): HTMLCanvasElement {
  const [canvas, ctx] = makeCanvas(source.width, source.height);
  if (axis === 'x') ctx.setTransform(-1, 0, 0, 1, source.width, 0);
  else ctx.setTransform(1, 0, 0, -1, 0, source.height);
  ctx.drawImage(source, 0, 0);
  return canvas;
}

function animSet(frames: readonly SpriteArt[]): AnimSet {
  const canvases = frames.map(artToCanvas);
  const flashes = canvases.map((c) => silhouette(c, '#ffffff'));
  return {
    frames: canvases.map(toTexture),
    flash: flashes.map(toTexture),
    framesLeft: canvases.map((c) => toTexture(flipCanvas(c, 'x'))),
    flashLeft: flashes.map((c) => toTexture(flipCanvas(c, 'x'))),
    width: canvases[0].width,
    height: canvases[0].height,
  };
}

type Rgb = readonly [number, number, number];

function paintPixels(width: number, height: number, paint: (x: number, y: number) => Rgb | null, alpha = 255): HTMLCanvasElement {
  const [canvas, ctx] = makeCanvas(width, height);
  const image = ctx.createImageData(width, height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const c = paint(x, y);
      if (!c) continue;
      const i = (y * width + x) * 4;
      image.data[i] = c[0];
      image.data[i + 1] = c[1];
      image.data[i + 2] = c[2];
      image.data[i + 3] = alpha;
    }
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}

function outline(canvas: HTMLCanvasElement, color: string): HTMLCanvasElement {
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  const { width, height } = canvas;
  const data = ctx.getImageData(0, 0, width, height).data;
  const solid = (x: number, y: number) => x >= 0 && y >= 0 && x < width && y < height && data[(y * width + x) * 4 + 3] > 0;
  ctx.fillStyle = color;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (solid(x, y)) continue;
      if (solid(x + 1, y) || solid(x - 1, y) || solid(x, y + 1) || solid(x, y - 1)) ctx.fillRect(x, y, 1, 1);
    }
  }
  return canvas;
}

function crateCanvas(kind: CrateKind): HTMLCanvasElement {
  const size = 12;
  const medkit = kind === 'medkit';
  const letter = medkit ? '+' : (WEAPONS.find((w) => w.id === kind)?.letter ?? '?');
  const glyph = GLYPHS[letter];
  const canvas = paintPixels(size, size, (x, y) => {
    const edge = x === 0 || y === 0 || x === size - 1 || y === size - 1;
    if (edge) return [30, 18, 10];
    const corner = (x <= 2 || x >= size - 3) && (y <= 2 || y >= size - 3);
    if (!medkit && corner) return [150, 156, 166];
    const gx = x - 4;
    const gy = y - 3;
    const inGlyph = gx >= 0 && gx < 3 && gy >= 0 && gy < 5 && glyph[gy][gx] === '#';
    if (medkit) return inGlyph ? [220, 30, 40] : x === 1 || y === 1 ? [255, 255, 255] : [228, 228, 232];
    if (inGlyph) return [255, 230, 60];
    if (gx >= -1 && gx < 4 && gy >= -1 && gy < 6) return [60, 32, 16];
    return y % 4 === 0 ? [120, 72, 34] : [168, 104, 48];
  });
  return canvas;
}

const TREE_PALETTES: readonly (readonly Rgb[])[] = [
  [[34, 82, 40], [52, 118, 52], [86, 156, 70], [130, 190, 90]],
  [[24, 64, 44], [36, 94, 60], [58, 128, 76], [96, 164, 104]],
  [[92, 44, 24], [150, 72, 30], [206, 118, 40], [240, 170, 70]],
];

function treeCanvas(seed: number, palette: readonly Rgb[]): HTMLCanvasElement {
  const rng = createRng(seed);
  const width = 24;
  const height = 32;
  const blobs = Array.from({ length: 4 }, () => ({
    x: 12 + (rng() - 0.5) * 8,
    y: 11 + (rng() - 0.5) * 8,
    r: 5 + rng() * 3.5,
  }));
  const canvas = paintPixels(width, height, (x, y) => {
    for (const b of blobs) {
      const dx = x + 0.5 - b.x;
      const dy = y + 0.5 - b.y;
      if (dx * dx + dy * dy > b.r * b.r) continue;
      const light = (-dx - dy * 1.3) / b.r + (rng() - 0.5) * 0.6;
      const index = light > 0.9 ? 3 : light > 0.1 ? 2 : light > -0.7 ? 1 : 0;
      return palette[index];
    }
    const trunk = x >= 10 && x <= 13 && y >= 18 && y <= 30;
    if (trunk) return x === 10 ? [70, 44, 26] : x === 13 ? [58, 34, 20] : [104, 66, 38];
    return null;
  });
  return outline(canvas, '#101a10');
}

function radialCanvas(size: number, colors: readonly Rgb[], noiseSeed: number): HTMLCanvasElement {
  const rng = createRng(noiseSeed);
  const c = (size - 1) / 2;
  return paintPixels(size, size, (x, y) => {
    const d = Math.hypot(x - c, y - c) / (size / 2) + (rng() - 0.5) * 0.25;
    if (d > 1) return null;
    return colors[Math.min(colors.length - 1, Math.floor(d * colors.length))];
  });
}

function explosionFrames(): THREE.Texture[] {
  const size = 32;
  const frames: THREE.Texture[] = [];
  const count = 7;
  for (let f = 0; f < count; f++) {
    const t = f / (count - 1);
    const rng = createRng(900 + f);
    const radius = 5 + t * 10;
    const hole = t > 0.5 ? (t - 0.5) * 2 * radius * 0.8 : 0;
    const c = size / 2;
    const canvas = paintPixels(size, size, (x, y) => {
      const d = Math.hypot(x + 0.5 - c, y + 0.5 - c) + (rng() - 0.5) * 3;
      if (d > radius || d < hole) return null;
      const k = d / radius;
      if (t > 0.7) return k > 0.7 ? [70, 66, 70] : [110, 104, 104];
      if (k < 0.35 - t * 0.3) return [255, 255, 230];
      if (k < 0.6) return [255, 214, 70];
      if (k < 0.85) return [245, 120, 30];
      return [160, 40, 20];
    });
    frames.push(toTexture(canvas));
  }
  return frames;
}

function bloodCanvas(seed: number): HTMLCanvasElement {
  const rng = createRng(seed);
  const drops = Array.from({ length: 6 }, (_, i) => ({
    x: 8 + (rng() - 0.5) * (i === 0 ? 2 : 12),
    y: 8 + (rng() - 0.5) * (i === 0 ? 2 : 12),
    r: i === 0 ? 4 + rng() * 2 : 1 + rng() * 2,
  }));
  return paintPixels(16, 16, (x, y) => {
    for (const d of drops) {
      if (Math.hypot(x + 0.5 - d.x, y + 0.5 - d.y) <= d.r) return rng() > 0.8 ? [150, 16, 20] : [110, 8, 14];
    }
    return null;
  });
}

function stoneCanvas(seed: number, top: boolean): HTMLCanvasElement {
  const rng = createRng(seed);
  return paintPixels(16, 16, (x, y) => {
    const n = rng();
    const crack = (x * 7 + y * 3) % 11 === 0 && n > 0.4;
    const base = top ? 128 : 96;
    const shade = base + Math.floor(n * 20) - (crack ? 40 : 0) - (top ? 0 : y * 1.5);
    const edge = x === 0 || y === 0 || x === 15 || y === 15;
    const v = edge ? shade - 30 : shade;
    return [v, v - 4, v + 6];
  });
}

function brickCanvas(seed: number, top: boolean): HTMLCanvasElement {
  const rng = createRng(seed);
  return paintPixels(16, 16, (x, y) => {
    const n = rng() * 18;
    if (top) return [120 + n, 104 + n, 92 + n];
    const row = Math.floor(y / 4);
    const mortar = y % 4 === 3 || (x + (row % 2) * 4) % 8 === 7;
    if (mortar) return [70, 60, 58];
    return [138 + n, 64 + n * 0.5, 50 + n * 0.3];
  });
}

export function createAssets(): Assets {
  const weapons = {} as Assets['weapons'];
  for (const w of WEAPONS) {
    const canvas = artToCanvas(WEAPON_ART[w.id]);
    const iconScale = 3;
    const [icon, ictx] = makeCanvas(canvas.width * iconScale, canvas.height * iconScale);
    ictx.drawImage(canvas, 0, 0, icon.width, icon.height);
    weapons[w.id] = {
      texture: toTexture(canvas),
      // Aiming left rotates the gun by ~180 degrees; the vertical flip keeps the grip below the barrel.
      flipped: toTexture(flipCanvas(canvas, 'y')),
      width: canvas.width,
      height: canvas.height,
      icon: icon.toDataURL(),
    };
  }
  const crateKinds: CrateKind[] = ['heavy', 'shotgun', 'rocket', 'flame', 'laser', 'medkit'];
  const crates = Object.fromEntries(crateKinds.map((k) => [k, toTexture(crateCanvas(k))])) as Record<CrateKind, THREE.Texture>;

  const shadowCanvas = paintPixels(16, 8, (x, y) => {
    const dx = (x + 0.5 - 8) / 8;
    const dy = (y + 0.5 - 4) / 4;
    return dx * dx + dy * dy <= 1 ? [0, 0, 0] : null;
  });

  return {
    hero: animSet(HERO_FRAMES),
    heroes: Object.fromEntries(Object.entries(HERO_VARIANTS).map(([id, frames]) => [id, animSet(frames)])) as Record<HeroId, AnimSet>,
    heroIcons: Object.fromEntries(
      Object.entries(HERO_VARIANTS).map(([id, frames]) => {
        const art = artToCanvas(frames[0]);
        const [icon, ictx] = makeCanvas(art.width * 5, art.height * 5);
        ictx.drawImage(art, 0, 0, icon.width, icon.height);
        return [id, icon.toDataURL()];
      }),
    ) as Record<HeroId, string>,
    zombies: {
      walker: animSet(ZOMBIE_FRAMES.walker),
      runner: animSet(ZOMBIE_FRAMES.runner),
      brute: animSet(ZOMBIE_FRAMES.brute),
      exploder: animSet(BLOATER_FRAMES),
      spitter: animSet(SPITTER_FRAMES),
      shield: animSet(RIOT_FRAMES.shielded),
      bat: animSet(BAT_FRAMES),
    },
    riotBroken: animSet(RIOT_FRAMES.broken),
    bosses: BOSS_VARIANTS.map((v) => ({ name: v.name, anim: animSet(v.frames) })),
    weapons,
    crates,
    parachute: toTexture(artToCanvas(PARACHUTE_ART)),
    grave: toTexture(artToCanvas(GRAVE_ART)),
    trees: [0, 1, 2, 3, 4].map((i) => toTexture(treeCanvas(40 + i, TREE_PALETTES[i % 2 === 0 ? 0 : 1]))).concat(
      toTexture(treeCanvas(77, TREE_PALETTES[2])),
    ),
    shadow: toTexture(shadowCanvas),
    bullet: toTexture(radialCanvas(4, [[255, 255, 255], [255, 240, 120], [255, 180, 40]], 1)),
    pellet: toTexture(radialCanvas(3, [[255, 255, 220], [255, 200, 80]], 2)),
    rocket: toTexture(
      paintPixels(8, 4, (x, y) => {
        if (x >= 6) return y === 0 || y === 3 ? null : [230, 60, 40];
        if (x <= 1) return y === 1 || y === 2 ? [255, 200, 60] : [120, 120, 120];
        return y === 0 || y === 3 ? [60, 70, 60] : [110, 130, 100];
      }),
    ),
    bile: toTexture(radialCanvas(6, [[220, 255, 160], [140, 230, 60], [60, 140, 30]], 3)),
    flame: toTexture(radialCanvas(8, [[255, 255, 200], [255, 210, 60], [255, 130, 30], [200, 50, 20]], 4)),
    smoke: toTexture(radialCanvas(8, [[180, 176, 170], [130, 126, 124], [90, 88, 90]], 5)),
    spark: toTexture(paintPixels(2, 2, () => [255, 255, 200])),
    muzzle: toTexture(
      paintPixels(8, 8, (x, y) => {
        const cx = Math.abs(x - 3.5);
        const cy = Math.abs(y - 3.5);
        if (cx + cy < 2) return [255, 255, 255];
        if (cx < 1 || cy < 1 || cx + cy < 3.2) return [255, 210, 70];
        return null;
      }),
    ),
    explosion: explosionFrames(),
    blood: [11, 12, 13].map((s) => toTexture(bloodCanvas(s))),
    rockSide: toTexture(stoneCanvas(21, false)),
    rockTop: toTexture(stoneCanvas(22, true)),
    wallSide: toTexture(brickCanvas(31, false)),
    wallTop: toTexture(brickCanvas(32, true)),
    turrets: TURRET_ART.map((art) => animSet([art])),
    drone: toTexture(artToCanvas(DRONE_ART)),
    grenade: toTexture(artToCanvas(GRENADE_ART)),
    mine: MINE_ART.map((art) => toTexture(artToCanvas(art))),
    barrel: [animSet([BARREL_FRAMES[0]]), animSet([BARREL_FRAMES[1]])],
    spikes: SPIKE_ART.map((art) => toTexture(artToCanvas(art))),
    gems: [
      gemCanvas([150, 230, 255], [40, 120, 230]),
      gemCanvas([170, 255, 150], [40, 170, 60]),
      gemCanvas([255, 170, 255], [170, 40, 200]),
    ].map(toTexture),
  };
}

/** Small diamond shaped XP crystal with a light top-left and dark bottom-right half. */
function gemCanvas(light: Rgb, dark: Rgb): HTMLCanvasElement {
  const w = 5;
  const h = 7;
  return outline(
    paintPixels(w + 2, h + 2, (x, y) => {
      const dx = Math.abs(x - 3);
      const dy = Math.abs(y - 4);
      if (dx / 2.5 + dy / 3.5 > 1) return null;
      if (x === 2 && y === 3) return [255, 255, 255];
      return x + y < 7 ? light : dark;
    }),
    '#0d0b12',
  );
}

const GROUND_COLORS: Record<Ground, Rgb> = {
  [Ground.Grass]: [76, 128, 58],
  [Ground.GrassDark]: [56, 100, 50],
  [Ground.Dirt]: [124, 94, 62],
  [Ground.Sand]: [198, 178, 122],
  [Ground.Water]: [38, 84, 140],
  [Ground.StoneFloor]: [108, 108, 118],
  [Ground.GraveDirt]: [78, 64, 54],
};

/** Paints the whole procedural map into one pixel-art canvas (16 texels per tile). */
export function createGroundCanvas(map: GameMap): HTMLCanvasElement {
  const t = GROUND_TEXELS;
  const size = map.size * t;
  const rng = createRng(map.seed ^ 0x5eed);
  const [canvas, ctx] = makeCanvas(size, size);
  const image = ctx.createImageData(size, size);
  const data = image.data;
  const groundAt = (tx: number, ty: number): number =>
    tx < 0 || ty < 0 || tx >= map.size || ty >= map.size ? Ground.Grass : map.ground[ty * map.size + tx];

  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const tx = Math.floor(px / t);
      const ty = Math.floor(py / t);
      const lx = px % t;
      const ly = py % t;
      const g = groundAt(tx, ty) as Ground;
      const n = rng();
      let [r, gg, b] = GROUND_COLORS[g];
      const jitter = Math.floor((n - 0.5) * 14);
      r += jitter;
      gg += jitter;
      b += jitter;

      switch (g) {
        case Ground.Grass:
        case Ground.GrassDark:
          if (n > 0.93) [r, gg, b] = [r + 30, gg + 36, b + 16];
          else if (n < 0.004) [r, gg, b] = [240, 230, 120];
          else if (n < 0.007) [r, gg, b] = [236, 236, 240];
          break;
        case Ground.Dirt:
          if (n > 0.95) [r, gg, b] = [156, 126, 92];
          else if (n < 0.05) [r, gg, b] = [90, 66, 44];
          break;
        case Ground.Sand:
          if (n > 0.94) [r, gg, b] = [168, 148, 100];
          break;
        case Ground.Water: {
          const wave = (px + Math.floor(py / 3) * 5) % 13 < 3 && py % 6 === 0;
          if (wave) [r, gg, b] = [96, 150, 200];
          const nearLand =
            (lx < 2 && groundAt(tx - 1, ty) !== Ground.Water) ||
            (lx > t - 3 && groundAt(tx + 1, ty) !== Ground.Water) ||
            (ly < 2 && groundAt(tx, ty - 1) !== Ground.Water) ||
            (ly > t - 3 && groundAt(tx, ty + 1) !== Ground.Water);
          if (nearLand) [r, gg, b] = n > 0.4 ? [196, 228, 240] : [120, 170, 210];
          break;
        }
        case Ground.StoneFloor:
          if (lx % 8 === 0 || ly % 8 === 0) [r, gg, b] = [78, 78, 88];
          else if (n > 0.97) [r, gg, b] = [60, 90, 50];
          break;
        case Ground.GraveDirt:
          if (n > 0.9) [r, gg, b] = [98, 82, 70];
          break;
      }

      const o = map.obstacle[ty * map.size + tx];
      if (o === Obstacle.Tree) {
        const dx = (lx - 7.5) / 8;
        const dy = (ly - 9) / 6;
        if (dx * dx + dy * dy < 1) {
          r *= 0.6;
          gg *= 0.6;
          b *= 0.65;
        }
      }

      const i = (py * size + px) * 4;
      data[i] = r;
      data[i + 1] = gg;
      data[i + 2] = b;
      data[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}

/** Tiny top-down overview used by the HUD minimap (1 pixel per tile). */
export function createMinimapCanvas(map: GameMap): HTMLCanvasElement {
  return paintPixels(map.size, map.size, (x, y) => {
    const i = y * map.size + x;
    switch (map.obstacle[i]) {
      case Obstacle.Rock:
        return [96, 96, 104];
      case Obstacle.Wall:
        return [150, 80, 60];
      case Obstacle.Tree:
        return [30, 70, 34];
      case Obstacle.Grave:
        return [150, 150, 160];
    }
    return GROUND_COLORS[map.ground[i] as Ground];
  });
}
