import * as THREE from 'three';
import { createShadow } from '../gfx/actorSprite.ts';
import { type Assets, type CrateKind, PX } from '../gfx/assets.ts';
import { SCREEN_RIGHT, spriteMaterial } from '../gfx/iso.ts';

const DROP_HEIGHT = 9;
const FALL_SPEED = 1.7;
const LIFETIME = 30;
const PICKUP_RADIUS = 0.85;

export interface Crate {
  readonly kind: CrateKind;
  readonly x: number;
  readonly y: number;
  height: number;
  life: number;
  swayTime: number;
  readonly box: THREE.Sprite;
  readonly chute: THREE.Sprite;
  readonly chuteMaterial: THREE.SpriteMaterial;
  readonly boxMaterial: THREE.SpriteMaterial;
  readonly shadow: THREE.Mesh;
}

/** Metal Slug style supply drops: a crate with a weapon letter floating down on a parachute. */
export class Crates {
  readonly list: Crate[] = [];
  private readonly scene: THREE.Scene;
  private readonly assets: Assets;

  constructor(scene: THREE.Scene, assets: Assets) {
    this.scene = scene;
    this.assets = assets;
  }

  drop(kind: CrateKind, x: number, y: number): void {
    const boxMaterial = spriteMaterial(this.assets.crates[kind]);
    const box = new THREE.Sprite(boxMaterial);
    box.center.set(0.5, 0);
    box.scale.set(12 * PX * 1.4, 12 * PX * 1.4, 1);
    const chuteMaterial = new THREE.SpriteMaterial({ map: this.assets.parachute, transparent: true, alphaTest: 0.1, side: THREE.DoubleSide });
    const chute = new THREE.Sprite(chuteMaterial);
    chute.center.set(0.5, 0);
    chute.scale.set(20 * PX * 1.6, 12 * PX * 1.6, 1);
    const shadow = createShadow(this.assets.shadow, 0.6);
    this.scene.add(box, chute, shadow);
    const crate: Crate = { kind, x, y, height: DROP_HEIGHT, life: LIFETIME, swayTime: Math.random() * 6, box, chute, chuteMaterial, boxMaterial, shadow };
    this.list.push(crate);
    this.place(crate);
  }

  private place(c: Crate): void {
    const falling = c.height > 0;
    const sway = falling ? Math.sin(c.swayTime * 1.8) * 0.35 * Math.min(1, c.height / 2) : 0;
    const x = c.x + SCREEN_RIGHT.x * sway;
    const z = c.y + SCREEN_RIGHT.y * sway;
    c.box.position.set(x, c.height, z);
    c.chute.position.set(x, c.height + 0.95, z);
    c.chuteMaterial.rotation = falling ? -sway * 0.35 : 0;
    c.shadow.position.set(c.x, 0.02, c.y);
    c.shadow.scale.setScalar(0.4 + 0.6 * (1 - c.height / DROP_HEIGHT));
  }

  /** Updates falling/landed crates and returns crates picked up by the player this frame. */
  update(dt: number, px: number, py: number, onLand: (c: Crate) => void): Crate[] {
    const picked: Crate[] = [];
    for (let i = this.list.length - 1; i >= 0; i--) {
      const c = this.list[i];
      c.swayTime += dt;
      if (c.height > 0) {
        c.height = Math.max(0, c.height - FALL_SPEED * dt);
        if (c.height === 0) onLand(c);
      } else {
        c.life -= dt;
        // Parachute collapses after landing.
        c.chute.scale.y = Math.max(0, c.chute.scale.y - dt * 2);
        c.chuteMaterial.opacity = Math.max(0, c.chuteMaterial.opacity - dt * 2);
        const blink = c.life < 5 && Math.floor(c.life * 6) % 2 === 0;
        c.box.visible = !blink;
      }
      this.place(c);
      const reachable = c.height < 0.9 && Math.hypot(px - c.x, py - c.y) < PICKUP_RADIUS;
      if (reachable) picked.push(c);
      if (reachable || c.life <= 0) this.remove(i);
    }
    return picked;
  }

  private remove(index: number): void {
    const c = this.list[index];
    c.box.removeFromParent();
    c.chute.removeFromParent();
    c.shadow.removeFromParent();
    c.boxMaterial.dispose();
    c.chuteMaterial.dispose();
    this.list.splice(index, 1);
  }

  clear(): void {
    for (let i = this.list.length - 1; i >= 0; i--) this.remove(i);
  }
}
