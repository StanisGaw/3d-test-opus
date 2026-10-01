import * as THREE from 'three';
import type { Assets } from '../gfx/assets.ts';

interface Particle {
  sprite: THREE.Sprite;
  material: THREE.SpriteMaterial;
  vx: number;
  vy: number;
  vz: number;
  gravity: number;
  life: number;
  maxLife: number;
  size: number;
  grow: number;
  frames: THREE.Texture[] | null;
}

interface ParticleOptions {
  size: number;
  life: number;
  vx?: number;
  vy?: number;
  vz?: number;
  gravity?: number;
  grow?: number;
  frames?: THREE.Texture[];
  rotation?: number;
  additive?: boolean;
}

const MAX_DECALS = 160;
const decalGeometry = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);

/** Short-lived visual effects: blood, sparks, explosions, smoke, muzzle flashes, decals and the laser beam. */
export class Effects {
  private readonly particles: Particle[] = [];
  private readonly decals: THREE.Mesh[] = [];
  private readonly decalMaterials: THREE.MeshBasicMaterial[];
  private readonly scene: THREE.Scene;
  private readonly assets: Assets;
  private readonly beam: THREE.Group;
  private beamTime = 0;

  constructor(scene: THREE.Scene, assets: Assets) {
    this.scene = scene;
    this.assets = assets;
    this.decalMaterials = assets.blood.map(
      (map) => new THREE.MeshBasicMaterial({ map, transparent: true, depthWrite: false, opacity: 0.85 }),
    );
    const beamGeometry = new THREE.BoxGeometry(1, 1, 1).translate(0.5, 0, 0);
    const outer = new THREE.Mesh(
      beamGeometry,
      new THREE.MeshBasicMaterial({ color: 0x40e8ff, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    outer.scale.set(1, 0.22, 0.22);
    const inner = new THREE.Mesh(beamGeometry, new THREE.MeshBasicMaterial({ color: 0xffffff }));
    inner.scale.set(1, 0.07, 0.07);
    this.beam = new THREE.Group();
    this.beam.add(outer, inner);
    this.beam.visible = false;
    scene.add(this.beam);
  }

  spawn(texture: THREE.Texture, x: number, h: number, z: number, o: ParticleOptions): void {
    const material = new THREE.SpriteMaterial({
      map: o.frames ? o.frames[0] : texture,
      transparent: true,
      depthWrite: false,
      rotation: o.rotation ?? 0,
      blending: o.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    const sprite = new THREE.Sprite(material);
    sprite.position.set(x, h, z);
    sprite.scale.setScalar(o.size);
    sprite.renderOrder = 5;
    this.scene.add(sprite);
    this.particles.push({
      sprite,
      material,
      vx: o.vx ?? 0,
      vy: o.vy ?? 0,
      vz: o.vz ?? 0,
      gravity: o.gravity ?? 0,
      life: o.life,
      maxLife: o.life,
      size: o.size,
      grow: o.grow ?? 0,
      frames: o.frames ?? null,
    });
  }

  blood(x: number, z: number, count: number, h = 0.6): void {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 1 + Math.random() * 3;
      this.spawn(this.assets.spark, x, h, z, {
        size: 0.1 + Math.random() * 0.1,
        life: 0.4 + Math.random() * 0.3,
        vx: Math.cos(a) * s,
        vz: Math.sin(a) * s,
        vy: 2 + Math.random() * 3,
        gravity: 14,
      });
      this.particles[this.particles.length - 1].material.color.setHex(Math.random() > 0.3 ? 0xa01018 : 0x60c040);
    }
  }

  sparks(x: number, h: number, z: number, count: number, color = 0xfff0a0): void {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 2 + Math.random() * 4;
      this.spawn(this.assets.spark, x, h, z, {
        size: 0.08,
        life: 0.15 + Math.random() * 0.15,
        vx: Math.cos(a) * s,
        vz: Math.sin(a) * s,
        vy: Math.random() * 3,
        gravity: 10,
        additive: true,
      });
      this.particles[this.particles.length - 1].material.color.setHex(color);
    }
  }

  explosion(x: number, z: number, scale = 1): void {
    this.spawn(this.assets.explosion[0], x, 0.2, z, { size: 3 * scale, life: 0.5, frames: this.assets.explosion });
    for (let i = 0; i < 6; i++) {
      this.spawn(this.assets.smoke, x + (Math.random() - 0.5) * scale, 0.5, z + (Math.random() - 0.5) * scale, {
        size: 0.6 * scale,
        life: 0.8 + Math.random() * 0.5,
        vy: 1 + Math.random(),
        grow: 1.2,
      });
    }
    this.sparks(x, 0.5, z, 14, 0xffc040);
  }

  smoke(x: number, h: number, z: number): void {
    this.spawn(this.assets.smoke, x, h, z, { size: 0.25, life: 0.45, vy: 0.4, grow: 1.4 });
  }

  muzzleFlash(x: number, h: number, z: number, rotation: number): void {
    this.spawn(this.assets.muzzle, x, h, z, { size: 0.55, life: 0.05, rotation, additive: true });
  }

  dust(x: number, z: number): void {
    for (let i = 0; i < 5; i++) {
      const a = Math.random() * Math.PI * 2;
      this.spawn(this.assets.smoke, x, 0.15, z, {
        size: 0.35,
        life: 0.5,
        vx: Math.cos(a) * 1.2,
        vz: Math.sin(a) * 1.2,
        vy: 0.3,
        grow: 1,
      });
      this.particles[this.particles.length - 1].material.color.setHex(0xb8a080);
    }
  }

  decal(x: number, z: number, size = 0.9): void {
    const material = this.decalMaterials[Math.floor(Math.random() * this.decalMaterials.length)];
    const mesh = new THREE.Mesh(decalGeometry, material);
    mesh.position.set(x, 0.015 + this.decals.length * 0.00005, z);
    mesh.rotation.y = Math.floor(Math.random() * 4) * (Math.PI / 2);
    mesh.scale.setScalar(size);
    mesh.renderOrder = 0;
    this.scene.add(mesh);
    this.decals.push(mesh);
    if (this.decals.length > MAX_DECALS) this.decals.shift()?.removeFromParent();
  }

  showBeam(x0: number, z0: number, x1: number, z1: number, h: number): void {
    const length = Math.hypot(x1 - x0, z1 - z0);
    this.beam.visible = true;
    this.beam.position.set(x0, h, z0);
    this.beam.rotation.set(0, -Math.atan2(z1 - z0, x1 - x0), 0);
    this.beam.scale.set(length, 1 + Math.random() * 0.4, 1 + Math.random() * 0.4);
    this.beamTime = 0.07;
  }

  update(dt: number): void {
    this.beamTime -= dt;
    if (this.beamTime <= 0) this.beam.visible = false;

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        p.sprite.removeFromParent();
        p.material.dispose();
        this.particles.splice(i, 1);
        continue;
      }
      p.vy -= p.gravity * dt;
      p.sprite.position.x += p.vx * dt;
      p.sprite.position.y = Math.max(0.03, p.sprite.position.y + p.vy * dt);
      p.sprite.position.z += p.vz * dt;
      const t = 1 - p.life / p.maxLife;
      if (p.frames) {
        p.material.map = p.frames[Math.min(p.frames.length - 1, Math.floor(t * p.frames.length))];
      } else {
        p.material.opacity = Math.min(1, (p.life / p.maxLife) * 2);
      }
      p.sprite.scale.setScalar(p.size * (1 + p.grow * t));
    }
  }

  clear(): void {
    for (const p of this.particles) {
      p.sprite.removeFromParent();
      p.material.dispose();
    }
    this.particles.length = 0;
    for (const d of this.decals) d.removeFromParent();
    this.decals.length = 0;
    this.beam.visible = false;
  }
}
