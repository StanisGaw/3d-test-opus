import * as THREE from 'three';
import { ActorSprite } from '../gfx/actorSprite.ts';
import { type AnimSet, type Assets, PX } from '../gfx/assets.ts';
import { CAMERA_DIR, SCREEN_RIGHT, SCREEN_UP } from '../gfx/iso.ts';
import type { Input } from '../systems/input.ts';
import type { WeaponId } from '../systems/weapons.ts';
import { moveCircle } from '../world/collision.ts';
import type { GameMap } from '../world/mapGen.ts';

export const GUN_HEIGHT = 0.55;
const SPEED = 5;
const DASH_SPEED = 15;
const DASH_TIME = 0.16;
const DASH_COOLDOWN = 1.1;
const HIT_INVULNERABILITY = 0.6;

export class Player {
  readonly pos = { x: 0, y: 0 };
  readonly radius = 0.3;
  maxHp = 100;
  hp = this.maxHp;
  /** Skill and buff multipliers. */
  speedMult = 1;
  dashCooldownMult = 1;
  /** Map-plane unit vector towards the cursor. */
  readonly aim = { x: 1, y: 0 };
  /** Screen-space angle of the cursor around the hero. */
  aimAngle = 0;
  invulnerable = 0;
  moving = false;
  private dashTime = 0;
  private dashCooldown = 0;
  private readonly dashDir = { x: 0, y: 0 };
  private readonly actor: ActorSprite;
  private readonly gun: THREE.Sprite;
  private readonly gunMaterial: THREE.SpriteMaterial;
  private readonly xray: THREE.Sprite;
  private readonly xrayMaterial: THREE.SpriteMaterial;
  private readonly assets: Assets;

  constructor(assets: Assets, scene: THREE.Scene) {
    this.assets = assets;
    this.actor = new ActorSprite(assets.hero, 1, assets.shadow, scene);
    this.gunMaterial = new THREE.SpriteMaterial({ map: assets.weapons.pistol.texture, alphaTest: 0.5, side: THREE.DoubleSide });
    this.gun = new THREE.Sprite(this.gunMaterial);
    this.gun.center.set(0.25, 0.5);
    scene.add(this.gun);
    // Silhouette that is only drawn where the hero is hidden behind walls or trees.
    this.xrayMaterial = new THREE.SpriteMaterial({
      map: assets.hero.flash[0],
      color: 0x4fa0ff,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
      depthFunc: THREE.GreaterDepth,
      side: THREE.DoubleSide,
    });
    this.xray = new THREE.Sprite(this.xrayMaterial);
    this.xray.center.set(0.5, 0);
    this.xray.renderOrder = 10;
    scene.add(this.xray);
  }

  get dashing(): boolean {
    return this.dashTime > 0;
  }

  /** Switches the hero's look (colour variant of the chosen hero). */
  setLook(anim: AnimSet): void {
    this.actor.setAnim(anim);
  }

  get dashReady(): number {
    return 1 - this.dashCooldown / (DASH_COOLDOWN * this.dashCooldownMult);
  }

  /** Changes max HP and heals by the gained amount. */
  setMaxHp(value: number): void {
    const gained = value - this.maxHp;
    this.maxHp = value;
    this.hp = Math.min(value, this.hp + Math.max(0, gained));
  }

  reset(x: number, y: number): void {
    this.pos.x = x;
    this.pos.y = y;
    this.hp = this.maxHp;
    this.invulnerable = 0;
    this.dashTime = 0;
    this.dashCooldown = 0;
  }

  teleport(x: number, y: number): void {
    this.pos.x = x;
    this.pos.y = y;
  }

  heal(amount: number): void {
    this.hp = Math.min(this.maxHp, this.hp + amount);
  }

  /** Returns true when damage was applied (not during invulnerability frames or dashes). */
  damage(amount: number): boolean {
    if (this.invulnerable > 0 || this.dashing || this.hp <= 0) return false;
    this.hp = Math.max(0, this.hp - amount);
    this.invulnerable = HIT_INVULNERABILITY;
    this.actor.flash(0.12);
    return true;
  }

  tryDash(): boolean {
    if (this.dashCooldown > 0) return false;
    if (!this.moving) {
      this.dashDir.x = this.aim.x;
      this.dashDir.y = this.aim.y;
    }
    this.dashTime = DASH_TIME;
    this.dashCooldown = DASH_COOLDOWN * this.dashCooldownMult;
    return true;
  }

  update(dt: number, input: Input, map: GameMap, aimPoint: { x: number; y: number }, screenAim: number, weapon: WeaponId): void {
    this.invulnerable = Math.max(0, this.invulnerable - dt);
    this.dashCooldown = Math.max(0, this.dashCooldown - dt);

    const axes = input.moveAxes();
    // Analog sticks walk slower when pushed only a little; keys and full pushes give full speed.
    const strength = Math.min(1, Math.hypot(axes.x, axes.y));
    let mx = SCREEN_RIGHT.x * axes.x + SCREEN_UP.x * axes.y;
    let my = SCREEN_RIGHT.y * axes.x + SCREEN_UP.y * axes.y;
    const len = Math.hypot(mx, my);
    this.moving = len > 0;
    if (len > 0) {
      mx /= len;
      my /= len;
      if (!this.dashing) {
        this.dashDir.x = mx;
        this.dashDir.y = my;
      }
    }

    if (this.dashing) {
      this.dashTime -= dt;
      moveCircle(map, this.pos, this.radius, this.dashDir.x * DASH_SPEED * dt, this.dashDir.y * DASH_SPEED * dt);
    } else if (this.moving) {
      moveCircle(map, this.pos, this.radius, mx * SPEED * this.speedMult * strength * dt, my * SPEED * this.speedMult * strength * dt);
    }

    const ax = aimPoint.x - this.pos.x;
    const ay = aimPoint.y - this.pos.y;
    const alen = Math.hypot(ax, ay);
    if (alen > 0.05) {
      this.aim.x = ax / alen;
      this.aim.y = ay / alen;
    }
    this.aimAngle = screenAim;
    this.updateVisuals(dt, weapon);
  }

  private updateVisuals(dt: number, weapon: WeaponId): void {
    const facingLeft = Math.cos(this.aimAngle) < 0;
    this.actor.setFacing(facingLeft ? -1 : 1);
    this.actor.update(dt, this.moving ? 9 : 0);
    const blink = this.invulnerable > 0 && Math.floor(this.invulnerable * 20) % 2 === 0;
    this.actor.sprite.visible = !blink;
    this.actor.setPosition(this.pos.x, this.pos.y, this.dashing ? 0.1 : 0);

    this.xray.position.copy(this.actor.sprite.position);
    this.xray.scale.copy(this.actor.sprite.scale);
    this.xrayMaterial.map = this.actor.silhouette;

    const w = this.assets.weapons[weapon];
    const gunMap = facingLeft ? w.flipped : w.texture;
    if (this.gunMaterial.map !== gunMap) this.gunMaterial.map = gunMap;
    const scale = 0.95;
    this.gun.scale.set(w.width * PX * scale, w.height * PX * scale, 1);
    this.gunMaterial.rotation = this.aimAngle;
    // Push the gun slightly towards the camera so it renders in front of the body.
    this.gun.position
      .set(this.pos.x + this.aim.x * 0.12, GUN_HEIGHT, this.pos.y + this.aim.y * 0.12)
      .addScaledVector(CAMERA_DIR, this.aimAngle > 0.3 && this.aimAngle < Math.PI - 0.3 ? -0.25 : 0.35);
    this.gun.visible = !blink;
  }

  /** World position of the gun muzzle. */
  muzzle(): { x: number; y: number } {
    return { x: this.pos.x + this.aim.x * 0.75, y: this.pos.y + this.aim.y * 0.75 };
  }

  hide(): void {
    this.actor.sprite.visible = false;
    this.gun.visible = false;
    this.xray.visible = false;
  }

  show(): void {
    this.actor.sprite.visible = true;
    this.gun.visible = true;
    this.xray.visible = true;
  }
}
