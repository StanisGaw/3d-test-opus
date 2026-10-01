import * as THREE from 'three';
import { type Assets, PX, createGroundCanvas, toTexture } from './assets.ts';
import { screenX, spriteMaterial } from './iso.ts';
import { type GameMap, Obstacle, tileIndex } from '../world/mapGen.ts';
import { createRng } from '../world/random.ts';

const FADE_RADIUS = 3.5;

/** Three.js scene objects for one procedurally generated map. */
export class WorldView {
  readonly group = new THREE.Group();
  private readonly trees = new Map<number, THREE.Sprite>();
  private readonly faded = new Set<THREE.Sprite>();
  private readonly disposables: { dispose(): void }[] = [];
  private readonly map: GameMap;

  constructor(map: GameMap, assets: Assets) {
    this.map = map;
    const rng = createRng(map.seed ^ 0xabc);
    this.buildGround();
    this.buildBlocks(assets, rng);
    this.buildSprites(assets, rng);
  }

  private buildGround(): void {
    const { size } = this.map;
    const texture = toTexture(createGroundCanvas(this.map));
    const material = new THREE.MeshLambertMaterial({ map: texture });
    const geometry = new THREE.PlaneGeometry(size, size);
    const ground = new THREE.Mesh(geometry, material);
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(size / 2, 0, size / 2);
    ground.receiveShadow = true;
    this.group.add(ground);

    const outsideMaterial = new THREE.MeshLambertMaterial({ color: 0x2b2f28 });
    const outside = new THREE.Mesh(new THREE.PlaneGeometry(size * 4, size * 4), outsideMaterial);
    outside.rotation.x = -Math.PI / 2;
    outside.position.set(size / 2, -0.05, size / 2);
    this.group.add(outside);
    this.disposables.push(texture, material, geometry, outsideMaterial, outside.geometry);
  }

  private buildBlocks(assets: Assets, rng: () => number): void {
    const { size, obstacle } = this.map;
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const rockMaterials = this.boxMaterials(assets.rockSide, assets.rockTop);
    const wallMaterials = this.boxMaterials(assets.wallSide, assets.wallTop);
    this.disposables.push(geometry, ...rockMaterials, ...wallMaterials);

    const cells = { rock: [] as number[], wall: [] as number[] };
    for (let i = 0; i < obstacle.length; i++) {
      if (obstacle[i] === Obstacle.Rock) cells.rock.push(i);
      else if (obstacle[i] === Obstacle.Wall) cells.wall.push(i);
    }
    const matrix = new THREE.Matrix4();
    const place = (list: number[], materials: THREE.Material[], height: (x: number, y: number) => number) => {
      const mesh = new THREE.InstancedMesh(geometry, materials, list.length);
      list.forEach((i, n) => {
        const x = i % size;
        const y = Math.floor(i / size);
        const h = height(x, y);
        matrix.makeScale(1, h, 1).setPosition(x + 0.5, h / 2, y + 0.5);
        mesh.setMatrixAt(n, matrix);
      });
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.group.add(mesh);
    };
    const border = (x: number, y: number) => x < 2 || y < 2 || x >= size - 2 || y >= size - 2;
    place(cells.rock, rockMaterials, (x, y) => (border(x, y) ? 1.6 + rng() * 0.8 : 0.55 + rng() * 0.6));
    place(cells.wall, wallMaterials, () => (rng() < 0.3 ? 0.6 + rng() * 0.3 : 1.1 + rng() * 0.3));
  }

  private boxMaterials(side: THREE.Texture, top: THREE.Texture): THREE.Material[] {
    const sideMaterial = new THREE.MeshLambertMaterial({ map: side });
    const topMaterial = new THREE.MeshLambertMaterial({ map: top });
    return [sideMaterial, sideMaterial, topMaterial, sideMaterial, sideMaterial, sideMaterial];
  }

  private buildSprites(assets: Assets, rng: () => number): void {
    const { size, obstacle } = this.map;
    const graveMaterial = spriteMaterial(assets.grave);
    this.disposables.push(graveMaterial);
    for (let i = 0; i < obstacle.length; i++) {
      const x = i % size;
      const y = Math.floor(i / size);
      if (obstacle[i] === Obstacle.Tree) {
        const texture = assets.trees[Math.floor(rng() * assets.trees.length)];
        const material = spriteMaterial(texture);
        const tree = new THREE.Sprite(material);
        const scale = 0.9 + rng() * 0.35;
        tree.center.set(0.5, 0.04);
        tree.scale.set(24 * PX * scale * (rng() < 0.5 ? -1 : 1), 32 * PX * scale, 1);
        tree.position.set(x + 0.5 + (rng() - 0.5) * 0.2, 0, y + 0.5 + (rng() - 0.5) * 0.2);
        this.group.add(tree);
        this.trees.set(i, tree);
        this.disposables.push(material);
      } else if (obstacle[i] === Obstacle.Grave) {
        const grave = new THREE.Sprite(graveMaterial);
        grave.center.set(0.5, 0);
        grave.scale.set(10 * PX * 1.3, 12 * PX * 1.3, 1);
        grave.position.set(x + 0.5, 0, y + 0.5);
        this.group.add(grave);
      }
    }
  }

  /** Fades trees that stand between the camera and the player so the hero stays visible. */
  updateOcclusion(px: number, py: number): void {
    for (const sprite of this.faded) this.setFaded(sprite, false);
    this.faded.clear();
    const r = Math.ceil(FADE_RADIUS);
    for (let y = Math.floor(py) - r; y <= Math.floor(py) + r; y++) {
      for (let x = Math.floor(px) - r; x <= Math.floor(px) + r; x++) {
        if (x < 0 || y < 0 || x >= this.map.size || y >= this.map.size) continue;
        const tree = this.trees.get(tileIndex(this.map, x, y));
        if (!tree) continue;
        const dx = tree.position.x - px;
        const dy = tree.position.z - py;
        const inFront = dx + dy > -0.2;
        if (inFront && Math.abs(screenX(dx, dy)) < 1.3 && Math.hypot(dx, dy) < FADE_RADIUS) {
          this.setFaded(tree, true);
          this.faded.add(tree);
        }
      }
    }
  }

  private setFaded(sprite: THREE.Sprite, faded: boolean): void {
    const material = sprite.material;
    material.transparent = faded;
    material.opacity = faded ? 0.35 : 1;
    material.alphaTest = faded ? 0.1 : 0.5;
    material.depthWrite = !faded;
  }

  dispose(): void {
    this.group.removeFromParent();
    for (const d of this.disposables) d.dispose();
    this.group.traverse((o) => {
      if (o instanceof THREE.InstancedMesh) o.dispose();
    });
  }
}
