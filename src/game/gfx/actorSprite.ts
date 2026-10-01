import * as THREE from 'three';
import { type AnimSet, PX } from './assets.ts';
import { spriteMaterial } from './iso.ts';

const shadowGeometry = new THREE.PlaneGeometry(1, 0.55).rotateX(-Math.PI / 2);
const auraGeometry = new THREE.RingGeometry(0.38, 0.52, 24).rotateX(-Math.PI / 2).scale(1, 1, 0.6);
let shadowMaterial: THREE.MeshBasicMaterial | null = null;

export function createShadow(texture: THREE.Texture, size: number): THREE.Mesh {
  shadowMaterial ??= new THREE.MeshBasicMaterial({ map: texture, transparent: true, opacity: 0.38, depthWrite: false });
  const mesh = new THREE.Mesh(shadowGeometry, shadowMaterial);
  mesh.scale.setScalar(size);
  mesh.renderOrder = 1;
  return mesh;
}

/** Animated, camera-facing pixel sprite with a blob shadow and a white hit flash. */
export class ActorSprite {
  readonly sprite: THREE.Sprite;
  readonly shadow: THREE.Mesh;
  readonly material: THREE.SpriteMaterial;
  private anim: AnimSet;
  private readonly baseScale: number;
  private frame = 0;
  private animTime = 0;
  private flashTime = 0;
  private facing = 1;
  private aura: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial> | null = null;
  private auraTime = 0;
  private readonly parent: THREE.Object3D;

  constructor(anim: AnimSet, scale: number, shadowTexture: THREE.Texture, parent: THREE.Object3D) {
    this.anim = anim;
    this.baseScale = scale;
    this.parent = parent;
    this.material = spriteMaterial(anim.frames[0]);
    this.sprite = new THREE.Sprite(this.material);
    this.sprite.center.set(0.5, 0);
    this.shadow = createShadow(shadowTexture, anim.width * PX * scale * 0.9);
    this.applyScale();
    parent.add(this.sprite, this.shadow);
  }

  get height(): number {
    return this.anim.height * PX * this.baseScale;
  }

  private applyScale(pulse = 1): void {
    this.sprite.scale.set(this.anim.width * PX * this.baseScale * pulse, this.anim.height * PX * this.baseScale * pulse, 1);
  }

  get facingLeft(): boolean {
    return this.facing < 0;
  }

  /** White silhouette of the frame on screen, e.g. for the hero's x-ray outline. */
  get silhouette(): THREE.Texture {
    return (this.facingLeft ? this.anim.flashLeft : this.anim.flash)[this.frame];
  }

  /** Faces the sprite left (dir < 0) or right. Mirroring is done by swapping to mirrored textures. */
  setFacing(dir: number): void {
    const next = dir < 0 ? -1 : 1;
    if (next === this.facing) return;
    this.facing = next;
    this.refreshMap();
  }

  /** Swaps the animation (e.g. a zombie losing its shield). */
  setAnim(anim: AnimSet): void {
    this.anim = anim;
    this.frame = 0;
    this.animTime = 0;
    this.applyScale();
    this.refreshMap();
  }

  /** Extra size multiplier on top of the base scale, used for pulsing. */
  setPulse(amount: number): void {
    this.applyScale(amount);
  }
  setPosition(x: number, z: number, lift = 0): void {
    this.sprite.position.set(x, lift, z);
    this.shadow.position.set(x, 0.02, z);
    this.aura?.position.set(x, 0.03, z);
  }

  /** Glowing ring under the feet (elite zombies, overloaded turrets). Calling it again only changes the colour. */
  setAura(color: number): void {
    if (this.aura) {
      this.aura.material.color.setHex(color);
      return;
    }
    const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending });
    this.aura = new THREE.Mesh(auraGeometry, material);
    this.aura.scale.setScalar(this.anim.width * PX * this.baseScale * 1.3);
    this.aura.renderOrder = 2;
    this.aura.position.copy(this.shadow.position);
    this.parent.add(this.aura);
  }

  clearAura(): void {
    if (!this.aura) return;
    this.aura.removeFromParent();
    this.aura.material.dispose();
    this.aura = null;
  }

  /** Base colour of the sprite (white = no tint). */
  tint(color: number): void {
    this.material.color.setHex(color);
  }

  flash(duration = 0.07): void {
    this.flashTime = duration;
  }

  /** Advances the walk cycle; `rate` is frames per second (0 = idle on frame 0). */
  update(dt: number, rate: number): void {
    if (rate > 0) {
      this.animTime += dt * rate;
      this.frame = Math.floor(this.animTime) % this.anim.frames.length;
    } else {
      this.animTime = 0;
      this.frame = 0;
    }
    this.flashTime -= dt;
    this.refreshMap();
    if (this.aura) {
      this.auraTime += dt;
      this.aura.material.opacity = 0.55 + Math.sin(this.auraTime * 6) * 0.25;
      this.aura.visible = this.sprite.visible && this.shadow.visible;
    }
  }

  private refreshMap(): void {
    const left = this.facingLeft;
    const set = this.flashTime > 0 ? (left ? this.anim.flashLeft : this.anim.flash) : left ? this.anim.framesLeft : this.anim.frames;
    const map = set[this.frame];
    if (this.material.map !== map) this.material.map = map;
  }

  dispose(): void {
    this.sprite.removeFromParent();
    this.shadow.removeFromParent();
    this.material.dispose();
    if (this.aura) {
      this.aura.removeFromParent();
      this.aura.material.dispose();
    }
  }
}
