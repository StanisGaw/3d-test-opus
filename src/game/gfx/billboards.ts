import * as THREE from 'three';
import { CAMERA_DIR } from './iso.ts';

/**
 * Rotation that makes a plane face the isometric camera. The camera only ever moves, never turns,
 * so one fixed orientation replaces per-sprite billboarding.
 */
export const CAMERA_FACING = new THREE.Quaternion().setFromRotationMatrix(
  new THREE.Matrix4().lookAt(CAMERA_DIR, new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 1, 0)),
);

export interface BatchOptions {
  readonly capacity: number;
  readonly additive?: boolean;
  /** Pixel-art cut-out (no blending, writes depth), like sprites with alphaTest. */
  readonly alphaTest?: number;
  /** Anchor at the bottom edge (things standing on the ground) instead of the centre. */
  readonly anchorBottom?: boolean;
  readonly renderOrder?: number;
}

const planeCentre = new THREE.PlaneGeometry(1, 1);
const planeBottom = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0);
const WHITE = new THREE.Color(1, 1, 1);

/**
 * Many copies of one textured sprite drawn with a single InstancedMesh (one draw call).
 * Call `begin()`, `add()` for every visible item, then `end()` once per frame.
 */
export class BillboardBatch {
  readonly mesh: THREE.InstancedMesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private count = 0;
  private readonly capacity: number;
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly spin = new THREE.Quaternion();
  private readonly p = new THREE.Vector3();
  private readonly s = new THREE.Vector3();
  private readonly c = new THREE.Color();
  private static readonly axis = new THREE.Vector3(0, 0, 1);

  constructor(scene: THREE.Scene, texture: THREE.Texture, o: BatchOptions) {
    this.capacity = o.capacity;
    const cutout = o.alphaTest !== undefined;
    const material = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: !cutout,
      alphaTest: o.alphaTest ?? 0,
      depthWrite: cutout,
      blending: o.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.mesh = new THREE.InstancedMesh(o.anchorBottom ? planeBottom : planeCentre, material, o.capacity);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < o.capacity; i++) this.mesh.setColorAt(i, WHITE);
    this.mesh.count = 0;
    // Instances move all over the map, so the mesh-level bounding sphere is meaningless.
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = o.renderOrder ?? 0;
    scene.add(this.mesh);
  }

  get size(): number {
    return this.count;
  }

  begin(): void {
    this.count = 0;
  }

  /**
   * Adds one copy at world (x, h, z). `rotation` turns it on screen (counter-clockwise, like
   * SpriteMaterial.rotation). `brightness` darkens it, which fades additive items out.
   * Returns false when the batch is full.
   */
  add(x: number, h: number, z: number, width: number, height: number, rotation = 0, brightness = 1): boolean {
    if (this.count >= this.capacity) return false;
    this.spin.setFromAxisAngle(BillboardBatch.axis, rotation);
    this.q.copy(CAMERA_FACING).multiply(this.spin);
    this.m.compose(this.p.set(x, h, z), this.q, this.s.set(width, height, 1));
    this.mesh.setMatrixAt(this.count, this.m);
    if (brightness !== 1 || this.mesh.instanceColor) this.mesh.setColorAt(this.count, this.c.setScalar(brightness));
    this.count++;
    return true;
  }

  end(): void {
    this.mesh.count = this.count;
    // An empty InstancedMesh still costs a draw call, so hide it instead.
    this.mesh.visible = this.count > 0;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  dispose(): void {
    this.mesh.removeFromParent();
    this.mesh.material.dispose();
    this.mesh.dispose();
  }
}
