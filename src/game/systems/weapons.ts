export type WeaponId = 'pistol' | 'heavy' | 'shotgun' | 'rocket' | 'flame' | 'laser';
export type ProjectileKind = 'bullet' | 'pellet' | 'rocket' | 'flame' | 'beam';

export interface WeaponDef {
  readonly id: WeaponId;
  readonly slot: number;
  readonly name: string;
  /** Metal Slug style crate letter. */
  readonly letter: string;
  readonly pickupAmmo: number;
  readonly maxAmmo: number;
  /** Infinity = no magazine: the weapon fires straight from its ammo and never reloads. */
  readonly magSize: number;
  readonly reloadTime: number;
  readonly fireInterval: number;
  readonly damage: number;
  readonly projectile: ProjectileKind;
  readonly pellets: number;
  readonly spread: number;
  readonly speed: number;
  readonly lifetime: number;
  readonly color: number;
  readonly shake: number;
}

export const WEAPONS: readonly WeaponDef[] = [
  { id: 'pistol', slot: 1, name: 'Pistol', letter: 'P', pickupAmmo: Infinity, maxAmmo: Infinity, magSize: 12, reloadTime: 1.0, fireInterval: 0.26, damage: 12, projectile: 'bullet', pellets: 1, spread: 0.03, speed: 24, lifetime: 0.9, color: 0xfff2a0, shake: 0.03 },
  { id: 'heavy', slot: 2, name: 'Heavy MG', letter: 'H', pickupAmmo: 200, maxAmmo: 400, magSize: 60, reloadTime: 1.6, fireInterval: 0.065, damage: 10, projectile: 'bullet', pellets: 1, spread: 0.09, speed: 28, lifetime: 0.8, color: 0xffc040, shake: 0.05 },
  { id: 'shotgun', slot: 3, name: 'Shotgun', letter: 'S', pickupAmmo: 30, maxAmmo: 60, magSize: 6, reloadTime: 1.4, fireInterval: 0.7, damage: 11, projectile: 'pellet', pellets: 9, spread: 0.45, speed: 22, lifetime: 0.32, color: 0xffe0a0, shake: 0.18 },
  { id: 'rocket', slot: 4, name: 'Rocket', letter: 'R', pickupAmmo: 20, maxAmmo: 40, magSize: 3, reloadTime: 1.5, fireInterval: 0.75, damage: 70, projectile: 'rocket', pellets: 1, spread: 0, speed: 13, lifetime: 2.2, color: 0xff7030, shake: 0.12 },
  { id: 'flame', slot: 5, name: 'Flame Shot', letter: 'F', pickupAmmo: 150, maxAmmo: 300, magSize: 100, reloadTime: 1.8, fireInterval: 0.035, damage: 4, projectile: 'flame', pellets: 1, spread: 0.25, speed: 10, lifetime: 0.5, color: 0xff8020, shake: 0.02 },
  { id: 'laser', slot: 6, name: 'Laser', letter: 'L', pickupAmmo: 180, maxAmmo: 360, magSize: Infinity, reloadTime: 0, fireInterval: 0.05, damage: 6, projectile: 'beam', pellets: 1, spread: 0, speed: 0, lifetime: 0.06, color: 0x60f0ff, shake: 0.02 },
];

export const WEAPON_BY_ID: Readonly<Record<WeaponId, WeaponDef>> = Object.fromEntries(
  WEAPONS.map((w) => [w.id, w]),
) as Record<WeaponId, WeaponDef>;

const deployable = (base: WeaponDef, overrides: Partial<WeaponDef>): WeaponDef => ({ ...base, slot: 0, pickupAmmo: 0, maxAmmo: Infinity, ...overrides });

/** Guns mounted on sentry turrets and drones (not selectable by the player). */
export const TURRET_GUN = deployable(WEAPON_BY_ID.heavy, { fireInterval: 0.22, damage: 9, spread: 0.06, lifetime: 0.45 });
export const TURRET_ROCKET = deployable(WEAPON_BY_ID.rocket, { fireInterval: 2.5, damage: 50 });
export const DRONE_GUN = deployable(WEAPON_BY_ID.pistol, { fireInterval: 0.45, damage: 7, spread: 0.04, lifetime: 0.4 });

/** Skill tree multipliers applied to every weapon. */
export interface ArsenalMods {
  fireRateMult: number;
  magMult: number;
  reloadMult: number;
}

/** JSON-safe ammo state (the pistol's infinite reserve is implied). */
export interface ArsenalSnapshot {
  current: WeaponId;
  pistolMag: number;
  ammo: Partial<Record<WeaponId, { mag: number; reserve: number }>>;
}

export class Arsenal {
  private readonly reserve = new Map<WeaponId, number>();
  private readonly mag = new Map<WeaponId, number>();
  private cooldown = 0;
  private reloadTimer = 0;
  private reloadDuration = 0;
  readonly mods: ArsenalMods = { fireRateMult: 1, magMult: 1, reloadMult: 1 };
  /** When true shots don't use ammo. */
  freeAmmo = false;
  current: WeaponId = 'pistol';

  constructor() {
    this.reset();
  }

  reset(): void {
    for (const w of WEAPONS) {
      this.reserve.set(w.id, w.id === 'pistol' ? Infinity : 0);
      this.mag.set(w.id, w.id === 'pistol' ? w.magSize : 0);
    }
    this.current = 'pistol';
    this.cooldown = 0;
    this.reloadTimer = 0;
    this.mods.fireRateMult = 1;
    this.mods.magMult = 1;
    this.mods.reloadMult = 1;
    this.freeAmmo = false;
  }

  get def(): WeaponDef {
    return WEAPON_BY_ID[this.current];
  }

  magSizeOf(id: WeaponId): number {
    return Math.max(1, Math.round(WEAPON_BY_ID[id].magSize * this.mods.magMult));
  }

  usesMagazine(id: WeaponId): boolean {
    return Number.isFinite(WEAPON_BY_ID[id].magSize);
  }

  magOf(id: WeaponId): number {
    return this.mag.get(id) ?? 0;
  }

  reserveOf(id: WeaponId): number {
    return this.reserve.get(id) ?? 0;
  }

  /** Rounds in the magazine plus the reserve. */
  ammoOf(id: WeaponId): number {
    return this.magOf(id) + this.reserveOf(id);
  }

  has(id: WeaponId): boolean {
    return this.ammoOf(id) > 0;
  }

  get reloading(): boolean {
    return this.reloadTimer > 0;
  }

  /** 0..1 while reloading. */
  get reloadProgress(): number {
    return this.reloading ? 1 - this.reloadTimer / this.reloadDuration : 0;
  }

  private equip(id: WeaponId): void {
    if (this.current !== id) this.reloadTimer = 0;
    this.current = id;
  }

  /** Selects weapon by number key; returns false when the slot is empty or unknown. */
  selectSlot(slot: number): boolean {
    const weapon = WEAPONS.find((w) => w.slot === slot);
    if (!weapon || !this.has(weapon.id)) return false;
    this.equip(weapon.id);
    if (this.magOf(weapon.id) === 0) this.reload();
    return true;
  }

  /** Cycles to the next owned weapon (mouse wheel). */
  cycle(step: 1 | -1): void {
    const owned = WEAPONS.filter((w) => this.has(w.id));
    const index = owned.findIndex((w) => w.id === this.current);
    const next = owned[(index + step + owned.length) % owned.length];
    this.equip(next.id);
    if (this.magOf(next.id) === 0) this.reload();
  }

  /** Adds crate ammo and equips the weapon, like in Metal Slug. A crate always arrives with a full magazine. */
  pickup(id: WeaponId): void {
    const def = WEAPON_BY_ID[id];
    const total = Math.min(def.maxAmmo, this.ammoOf(id) + def.pickupAmmo);
    const inMag = Math.min(total, Math.max(this.magOf(id), this.magSizeOf(id)));
    this.mag.set(id, inMag);
    this.reserve.set(id, total - inMag);
    this.equip(id);
    if (this.current === id) this.reloadTimer = 0;
  }

  /** Starts a reload of the current weapon. Returns false if it's not needed or not possible. */
  reload(): boolean {
    const id = this.current;
    if (this.reloading || this.magOf(id) >= this.magSizeOf(id) || this.reserveOf(id) <= 0) return false;
    this.reloadDuration = WEAPON_BY_ID[id].reloadTime * this.mods.reloadMult;
    this.reloadTimer = this.reloadDuration;
    return true;
  }

  update(dt: number): void {
    this.cooldown = Math.max(0, this.cooldown - dt);
    if (!this.reloading) return;
    this.reloadTimer -= dt;
    if (this.reloadTimer > 0) return;
    this.reloadTimer = 0;
    const id = this.current;
    const take = Math.min(this.magSizeOf(id) - this.magOf(id), this.reserveOf(id));
    this.mag.set(id, this.magOf(id) + take);
    this.reserve.set(id, this.reserveOf(id) - take);
  }

  /** Ammo of every weapon except the infinite pistol reserve, for save games. */
  snapshot(): ArsenalSnapshot {
    const ammo: ArsenalSnapshot['ammo'] = {};
    for (const w of WEAPONS) {
      if (w.id === 'pistol') continue;
      if (this.ammoOf(w.id) > 0) ammo[w.id] = { mag: this.magOf(w.id), reserve: this.reserveOf(w.id) };
    }
    return { current: this.current, ammo, pistolMag: this.magOf('pistol') };
  }

  /** Restores a snapshot; unknown or broken values fall back to an empty weapon. */
  restore(s: ArsenalSnapshot): void {
    this.reset();
    for (const w of WEAPONS) {
      if (w.id === 'pistol') continue;
      const a = s.ammo[w.id];
      if (!a) continue;
      const mag = Math.max(0, Math.floor(a.mag));
      const reserve = Math.max(0, Math.floor(a.reserve));
      const total = Math.min(w.maxAmmo, mag + reserve);
      this.mag.set(w.id, Math.min(mag, total));
      this.reserve.set(w.id, total - Math.min(mag, total));
    }
    this.mag.set('pistol', Math.max(0, Math.min(WEAPON_BY_ID.pistol.magSize * 3, Math.floor(s.pistolMag))));
    this.current = WEAPON_BY_ID[s.current] && this.has(s.current) ? s.current : 'pistol';
  }

  /** Returns the fired weapon when the trigger results in a shot, otherwise null. */
  tryFire(): WeaponDef | null {
    if (this.cooldown > 0 || this.reloading) return null;
    const def = this.def;
    if (!this.has(def.id)) {
      this.equip('pistol');
      return null;
    }
    if (this.magOf(def.id) <= 0) {
      this.reload();
      return null;
    }
    this.cooldown = def.fireInterval / this.mods.fireRateMult;
    if (this.freeAmmo) return def;
    const left = this.magOf(def.id) - 1;
    this.mag.set(def.id, left);
    if (left <= 0) {
      if (this.reserveOf(def.id) > 0) this.reload();
      else this.equip('pistol');
    }
    return def;
  }
}
