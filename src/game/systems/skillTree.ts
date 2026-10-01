export type BranchId = 'assault' | 'survival' | 'demolition' | 'tech';

export type SkillId =
  | 'dmg'
  | 'rof'
  | 'mag'
  | 'crit'
  | 'pierce'
  | 'burn'
  | 'frenzy'
  | 'hp'
  | 'armor'
  | 'speed'
  | 'regen'
  | 'dash'
  | 'vamp'
  | 'secondWind'
  | 'grenade'
  | 'blast'
  | 'mine'
  | 'cluster'
  | 'resupply'
  | 'napalm'
  | 'turret'
  | 'magnet'
  | 'turretDmg'
  | 'turretTime'
  | 'drone'
  | 'overdrive';


export interface SkillDef {
  readonly id: SkillId;
  readonly branch: BranchId;

  /** Row inside the branch; deeper tiers need earlier skills. */
  readonly tier: number;
  readonly name: string;
  readonly maxRank: number;
  readonly requires?: { readonly id: SkillId; readonly rank: number };
  /** Effect text for a given rank (1..maxRank). */
  readonly effect: (rank: number) => string;
  /** Longer explanation shown in the tooltip: how it works and what it affects. */
  readonly details: string;
  /** Short gameplay advice. */
  readonly tip?: string;
}

export interface BranchDef {
  readonly id: BranchId;
  readonly name: string;
  readonly tagline: string;
}


export const BRANCHES: readonly BranchDef[] = [
  { id: 'assault', name: 'Assault', tagline: 'Guns & bullets' },
  { id: 'survival', name: 'Survival', tagline: 'Stay alive' },
  { id: 'demolition', name: 'Demolition', tagline: 'Grenades & mines' },
  { id: 'tech', name: 'Tech', tagline: 'Turrets & drones' },

];

const pct = (value: number): string => `${Math.round(value * 100)}%`;

export const SKILLS: readonly SkillDef[] = [
  {
    id: 'dmg',
    branch: 'assault',
    tier: 0,
    name: 'Hollow Points',
    maxRank: 5,
    effect: (r) => `+${pct(0.1 * r)} weapon damage`,
    details: 'Every bullet, pellet, flame and laser beam from your own guns hits harder. Rockets hit harder too, and so does the fire from Incendiary Rounds. Turrets and drones are not affected.',
    tip: 'The safest first pick: it helps every weapon you find.',
  },
  {
    id: 'rof',
    branch: 'assault',
    tier: 0,
    name: 'Hair Trigger',
    maxRank: 5,
    effect: (r) => `+${pct(0.08 * r)} fire rate`,
    details: 'All your weapons shoot faster. It stacks with Kill Frenzy. Faster shooting also empties magazines faster.',
    tip: 'Pair it with Extended Mags so you reload less often.',
  },
  {
    id: 'mag',
    branch: 'assault',
    tier: 0,
    name: 'Extended Mags',
    maxRank: 3,
    effect: (r) => `+${pct(0.3 * r)} magazine, -${pct(0.15 * r)} reload time`,
    details: 'Bigger magazines and faster reloads for every weapon with a magazine, including the pistol. The laser never reloads, so it gains nothing from this skill.',
  },
  {
    id: 'crit',
    branch: 'assault',
    tier: 1,
    name: 'Deadeye',
    maxRank: 3,
    requires: { id: 'dmg', rank: 2 },
    effect: (r) => `${pct(0.07 * r)} chance for x2 critical hits`,
    details: 'Each of your own shots may deal double damage. A critical hit shows a big yellow number with "!". Turrets, drones, explosions and fire never crit.',
    tip: 'Shotguns roll the chance for every pellet.',
  },
  {
    id: 'pierce',
    branch: 'assault',
    tier: 1,
    name: 'Penetrator',
    maxRank: 2,
    requires: { id: 'rof', rank: 2 },
    effect: (r) => `Bullets pierce ${r} extra ${r === 1 ? 'enemy' : 'enemies'}`,
    details: 'Bullets and shotgun pellets fly on after a hit and damage the next zombie in line. A riot shield still stops them. Rockets, flames and the laser are not affected.',
    tip: 'Strong against long lines of walkers in corridors.',
  },
  {
    id: 'burn',
    branch: 'assault',
    tier: 1,
    name: 'Incendiary Rounds',
    maxRank: 3,
    requires: { id: 'mag', rank: 1 },
    effect: (r) => `${pct(0.12 * r)} chance to ignite (10 dmg/s for 3s)`,
    details: 'Your shots may set the target on fire. A burning zombie takes 10 damage per second for 3 seconds (more with Hollow Points). Fire damage goes through riot shields, but a shot blocked by a shield cannot ignite.',
  },
  {
    id: 'frenzy',
    branch: 'assault',
    tier: 2,
    name: 'Kill Frenzy',
    maxRank: 1,
    requires: { id: 'crit', rank: 2 },
    effect: () => 'Kills grant 4s: +35% fire rate, +15% speed',
    details: 'Every kill starts or refreshes a 4-second Frenzy buff. While it lasts you shoot 35% faster and run 15% faster. The buff shows in the buff bar.',
    tip: 'In a big wave the buff almost never runs out.',
  },

  {
    id: 'hp',
    branch: 'survival',
    tier: 0,
    name: 'Toughness',
    maxRank: 5,
    effect: (r) => `+${20 * r} max HP`,
    details: 'Raises your maximum health. Each level-up heals 15% of max HP, so more health also means bigger heals.',
  },
  {
    id: 'armor',
    branch: 'survival',
    tier: 0,
    name: 'Kevlar Vest',
    maxRank: 3,
    effect: (r) => `-${pct(0.08 * r)} damage taken`,
    details: 'Reduces all damage you take: bites, bat attacks, bile, boss charges and exploder blasts.',
    tip: 'Rank 3 unlocks Second Wind.',
  },
  {
    id: 'speed',
    branch: 'survival',
    tier: 0,
    name: 'Sprinter',
    maxRank: 3,
    effect: (r) => `+${pct(0.07 * r)} move speed`,
    details: 'You walk faster. It helps you escape runners, dodge spitter bile and reach supply crates first.',
  },
  {
    id: 'regen',
    branch: 'survival',
    tier: 1,
    name: 'Regeneration',
    maxRank: 3,
    requires: { id: 'hp', rank: 2 },
    effect: (r) => `Heal ${(0.6 * r).toFixed(1)} HP per second`,
    details: 'You slowly heal all the time, even in the middle of a fight.',
    tip: 'At rank 3 you get back about 108 HP per minute.',
  },
  {
    id: 'dash',
    branch: 'survival',
    tier: 1,
    name: 'Dash',
    maxRank: 4,
    requires: { id: 'speed', rank: 1 },
    effect: (r) => (r === 1 ? 'Unlocks dash [Space]' : `Dash cooldown -${pct(0.18 * (r - 1))}`),
    details: 'Unlocks the dash [Space]: a short burst in your move direction during which you cannot be hurt and can run through zombies. The base wait is 1.1 s. Further ranks make it ready again sooner.',
    tip: 'Dash through a boss charge instead of running away from it.',
  },
  {
    id: 'vamp',
    branch: 'survival',
    tier: 2,
    name: 'Vampirism',
    maxRank: 3,
    requires: { id: 'regen', rank: 1 },
    effect: (r) => `Heal ${r} HP per kill`,
    details: 'Every zombie you kill heals you. Kills by turrets, drones and explosions count too.',
    tip: 'Best with hordes of weak walkers and bats.',
  },
  {
    id: 'secondWind',
    branch: 'survival',
    tier: 2,
    name: 'Second Wind',
    maxRank: 1,
    requires: { id: 'armor', rank: 3 },
    effect: () => 'Once per round: survive a lethal hit with 30% HP',
    details: 'The first hit that would kill you in a round does not. Instead your HP is set to 30%, you cannot be hurt for 2.5 s, and a small blast pushes the nearest zombies away. It recharges every round.',
  },

  {
    id: 'grenade',
    branch: 'demolition',
    tier: 0,
    name: 'Frag Grenades',
    maxRank: 3,
    effect: (r) => `${r} ${r === 1 ? 'grenade' : 'grenades'} per round [G / RMB]`,
    details: 'Throw a grenade at the cursor, up to 8 m away. It deals 90 damage in a 2.8 m radius. Grenades refill at the start of every round.',
    tip: 'Throw it at an exploder in a crowd for a chain reaction.',
  },
  {
    id: 'blast',
    branch: 'demolition',
    tier: 1,
    name: 'Bigger Boom',
    maxRank: 3,
    requires: { id: 'grenade', rank: 1 },
    effect: (r) => `+${pct(0.2 * r)} explosion damage, +${pct(0.12 * r)} radius`,
    details: 'All your explosions hit harder and wider: grenades, bomblets, mines, rockets and the Second Wind blast. Exploder zombies do not get stronger.',
  },
  {
    id: 'mine',
    branch: 'demolition',
    tier: 1,
    name: 'Proximity Mines',
    maxRank: 3,
    requires: { id: 'grenade', rank: 1 },
    effect: (r) => `${2 * r} mines per round [Q]`,
    details: 'Place a mine at your feet. It arms after 0.8 s and explodes when a zombie comes close: 120 damage in a 2.4 m radius. Up to 10 mines can lie on the map. Flying bats do not trigger them.',
    tip: 'Drop mines behind you while you run from a brute.',
  },
  {
    id: 'cluster',
    branch: 'demolition',
    tier: 2,
    name: 'Cluster Bombs',
    maxRank: 1,
    requires: { id: 'blast', rank: 2 },
    effect: () => 'Grenades burst into 4 bomblets',
    details: 'After a grenade explodes, 4 bomblets scatter around it. Each one deals 40 damage in a 1.7 m radius.',
  },
  {
    id: 'resupply',
    branch: 'demolition',
    tier: 2,
    name: 'Resupply',
    maxRank: 2,
    requires: { id: 'mine', rank: 1 },
    effect: (r) => `+${r} grenade & mine after every wave`,
    details: 'Each cleared wave gives back grenades and mines. You can never go above your per-round maximum.',
  },
  {
    id: 'napalm',
    branch: 'demolition',
    tier: 3,
    name: 'Napalm',
    maxRank: 1,
    requires: { id: 'cluster', rank: 1 },
    effect: () => 'Explosions set zombies on fire',
    details: 'Every zombie caught in one of your explosions starts to burn: 12 damage per second for 3 seconds.',
    tip: 'Burning damage also goes through riot shields.',
  },

  {
    id: 'turret',
    branch: 'tech',
    tier: 0,
    name: 'Sentry Turret',
    maxRank: 3,
    effect: (r) => `${r} ${r === 1 ? 'turret' : 'turrets'} per round [T]${r >= 2 ? ', twin guns' : ''}${r >= 3 ? ', top tier' : ''}`,
    details: 'Deploy a turret next to you. It shoots the nearest zombie it can see, up to 9 m away, for 25 s. Rank 2 adds a second gun and faster fire, rank 3 is the top tier with the fastest fire. Badges show the tier: blue, yellow, orange. Up to 4 turrets at once. Turrets are removed when a new map loads.',
    tip: 'Turrets shooting from the side go around riot shields.',
  },
  {
    id: 'magnet',
    branch: 'tech',
    tier: 0,
    name: 'XP Magnet',
    maxRank: 2,
    effect: (r) => `+${pct(0.6 * r)} XP pickup radius`,
    details: 'XP crystals fly to you from further away. The base radius is 2.2 m. At the end of a round all crystals are collected anyway.',
  },
  {
    id: 'turretDmg',
    branch: 'tech',
    tier: 1,
    name: 'Calibration',
    maxRank: 3,
    requires: { id: 'turret', rank: 1 },
    effect: (r) => `Turrets & drones: +${pct(0.3 * r)} damage, +${pct(0.2 * r)} fire rate`,
    details: 'Your turrets and drones hit harder and shoot faster. It does not change your own guns.',
  },
  {
    id: 'turretTime',
    branch: 'tech',
    tier: 1,
    name: 'Power Cells',
    maxRank: 2,
    requires: { id: 'turret', rank: 1 },
    effect: (r) => `Turrets last +${15 * r}s`,
    details: 'Turrets stay on the field longer before they shut down. The base time is 25 s.',
  },
  {
    id: 'drone',
    branch: 'tech',
    tier: 2,
    name: 'Combat Drone',
    maxRank: 2,
    requires: { id: 'turret', rank: 2 },
    effect: (r) => `${r} ${r === 1 ? 'drone orbits' : 'drones orbit'} you and shoot`,
    details: 'Drones fly around you and shoot the nearest visible zombie, up to 8 m away. They never run out and they stay with you between rounds.',
    tip: 'Great against bats, which are hard to aim at.',
  },
  {
    id: 'overdrive',
    branch: 'tech',
    tier: 3,
    name: 'Overdrive',
    maxRank: 1,
    requires: { id: 'drone', rank: 1 },
    effect: () => '[E] 12s: turrets go red, fire much faster and shoot rockets (40s cooldown)',
    details: 'Press E to overload all your turrets for 12 seconds. They glow red, shoot at their old, faster rate and top tier turrets also launch rockets. It does not change your own guns or your drones. Then it needs 40 s to recharge.',
    tip: 'Deploy your turrets first, then overload them for the boss.',
  },
];

/** Skills that need `id` before they can be learned. */
export const unlockedBy = (id: SkillId): SkillDef[] => SKILLS.filter((s) => s.requires?.id === id);

export type SkillStatus = 'learn' | 'noPoints' | 'locked' | 'maxed';

export interface SkillInfo {
  readonly name: string;
  readonly branch: string;
  readonly rank: number;
  readonly maxRank: number;
  readonly details: string;
  readonly tip?: string;
  /** Every rank with its effect; `owned` ranks are learned, `next` is the one a point buys. */
  readonly ranks: readonly { rank: number; text: string; owned: boolean; next: boolean }[];
  readonly requires?: { readonly name: string; readonly rank: number; readonly met: boolean };
  readonly unlocks: readonly string[];
  readonly status: SkillStatus;
}

/** Everything the tooltip needs to explain a skill in its current state. */
export function describeSkill(tree: SkillTree, id: SkillId): SkillInfo {
  const def = SKILL_BY_ID[id];
  const rank = tree.rank(id);
  const check = tree.check(id);
  const branch = BRANCHES.find((b) => b.id === def.branch)?.name ?? def.branch;
  return {
    name: def.name,
    branch,
    rank,
    maxRank: def.maxRank,
    details: def.details,
    tip: def.tip,
    ranks: Array.from({ length: def.maxRank }, (_, i) => ({ rank: i + 1, text: def.effect(i + 1), owned: i < rank, next: i === rank })),
    requires: def.requires && {
      name: SKILL_BY_ID[def.requires.id].name,
      rank: def.requires.rank,
      met: tree.rank(def.requires.id) >= def.requires.rank,
    },
    unlocks: unlockedBy(id).map((s) => (s.requires && s.requires.rank > 1 ? `${s.name} (at rank ${s.requires.rank})` : s.name)),
    status: check === 'ok' ? 'learn' : check,
  };
}
export const SKILL_BY_ID: Readonly<Record<SkillId, SkillDef>> = Object.fromEntries(SKILLS.map((s) => [s.id, s])) as Record<SkillId, SkillDef>;

export type SkillRanks = Readonly<Record<SkillId, number>>;

/** All derived gameplay numbers for a set of skill ranks. */
export interface PlayerStats {
  damageMult: number;
  fireRateMult: number;
  magMult: number;
  reloadMult: number;
  critChance: number;
  pierce: number;
  burnChance: number;
  frenzy: boolean;
  maxHp: number;
  damageTaken: number;
  speedMult: number;
  regen: number;
  dash: boolean;
  dashCooldownMult: number;
  lifeOnKill: number;
  secondWind: boolean;
  grenades: number;
  explosionDamageMult: number;
  explosionRadiusMult: number;
  mines: number;
  cluster: boolean;
  resupply: number;
  napalm: boolean;
  turrets: number;
  turretTier: number;
  turretDamageMult: number;
  turretFireRateMult: number;
  turretDuration: number;
  drones: number;
  magnetRadius: number;
  overdrive: boolean;
  /** HP healed after every cleared wave (Field Medic card). */
  waveHeal: number;
  xpMult: number;
  /** How often supply crates drop, relative to normal. */
  dropRateMult: number;
  /** Coins earned, relative to normal (Bounty Hunter upgrade). */
  coinMult: number;
  /** Burn damage multiplier (Pyro). */
  burnDpsMult: number;
}

export const BASE_MAX_HP = 100;
export const BASE_MAGNET_RADIUS = 2.2;

export function computeStats(r: SkillRanks): PlayerStats {
  return {
    damageMult: 1 + 0.1 * r.dmg,
    fireRateMult: 1 + 0.08 * r.rof,
    magMult: 1 + 0.3 * r.mag,
    reloadMult: 1 - 0.15 * r.mag,
    critChance: 0.07 * r.crit,
    pierce: r.pierce,
    burnChance: 0.12 * r.burn,
    frenzy: r.frenzy > 0,
    maxHp: BASE_MAX_HP + 20 * r.hp,
    damageTaken: 1 - 0.08 * r.armor,
    speedMult: 1 + 0.07 * r.speed,
    regen: 0.6 * r.regen,
    dash: r.dash > 0,
    dashCooldownMult: 1 - 0.18 * Math.max(0, r.dash - 1),
    lifeOnKill: r.vamp,
    secondWind: r.secondWind > 0,
    grenades: r.grenade,
    explosionDamageMult: 1 + 0.2 * r.blast,
    explosionRadiusMult: 1 + 0.12 * r.blast,
    mines: 2 * r.mine,
    cluster: r.cluster > 0,
    resupply: r.resupply,
    napalm: r.napalm > 0,
    turrets: r.turret,
    turretTier: r.turret,
    turretDamageMult: 1 + 0.3 * r.turretDmg,
    turretFireRateMult: 1 + 0.2 * r.turretDmg,
    turretDuration: 25 + 15 * r.turretTime,
    drones: r.drone,
    magnetRadius: BASE_MAGNET_RADIUS * (1 + 0.6 * r.magnet),
    overdrive: r.overdrive > 0,
    waveHeal: 0,
    xpMult: 1,
    dropRateMult: 1,
    coinMult: 1,
    burnDpsMult: 1,
  };
}
export type BuyResult = 'ok' | 'noPoints' | 'maxed' | 'locked';

export interface StatLine {
  readonly label: string;
  readonly value: string;
  /** True when a skill changed it from the base value. */
  readonly boosted: boolean;
  /** Shown in the always visible HUD panel. */
  readonly core: boolean;
}

const bonus = (mult: number): string => `${mult >= 1 ? '+' : '-'}${Math.round(Math.abs(mult - 1) * 100)}%`;
const percent = (value: number): string => `${Math.round(value * 100)}%`;

/** Human readable stats, in display order. */
export function statLines(s: PlayerStats): StatLine[] {
  const base = computeStats(Object.fromEntries(SKILLS.map((k) => [k.id, 0])) as Record<SkillId, number>);
  const line = (label: string, value: string, boosted: boolean, core = false): StatLine => ({ label, value, boosted, core });
  return [
    line('Damage', bonus(s.damageMult), s.damageMult !== base.damageMult, true),
    line('Fire rate', bonus(s.fireRateMult), s.fireRateMult !== base.fireRateMult, true),
    line('Crit x2', percent(s.critChance), s.critChance > 0, true),
    line('Max HP', String(s.maxHp), s.maxHp !== base.maxHp, true),
    line('Armor', percent(1 - s.damageTaken), s.damageTaken !== 1, true),
    line('Speed', bonus(s.speedMult), s.speedMult !== 1, true),
    line('Regen', `${s.regen.toFixed(1)}/s`, s.regen > 0, true),
    line('Explosions', bonus(s.explosionDamageMult), s.explosionDamageMult !== 1, true),
    line('Magazine', bonus(s.magMult), s.magMult !== 1),
    line('Reload', bonus(s.reloadMult), s.reloadMult !== 1),
    line('Pierce', String(s.pierce), s.pierce > 0),
    line('Ignite', percent(s.burnChance), s.burnChance > 0),
    line('Burn dmg', bonus(s.burnDpsMult), s.burnDpsMult !== 1),
    line('Life/kill', String(s.lifeOnKill), s.lifeOnKill > 0),
    line('Dash CD', bonus(s.dashCooldownMult), s.dashCooldownMult !== 1),
    line('Grenades', String(s.grenades), s.grenades > 0),
    line('Mines', String(s.mines), s.mines > 0),
    line('Turrets', String(s.turrets), s.turrets > 0),
    line('Turret dmg', bonus(s.turretDamageMult), s.turretDamageMult !== 1),
    line('Drones', String(s.drones), s.drones > 0),
    line('XP magnet', `${s.magnetRadius.toFixed(1)}m`, s.magnetRadius !== base.magnetRadius),
    line('XP gain', bonus(s.xpMult), s.xpMult !== 1),
    line('Crate drops', bonus(s.dropRateMult), s.dropRateMult !== 1),
    line('Wave heal', String(s.waveHeal), s.waveHeal > 0),
    line('Coins', bonus(s.coinMult), s.coinMult !== 1),
  ];
}

/** Skill ranks and unspent points for one run. */
export class SkillTree {
  points = 0;
  private readonly ranks = new Map<SkillId, number>();

  rank(id: SkillId): number {
    return this.ranks.get(id) ?? 0;
  }

  isUnlocked(id: SkillId): boolean {
    const req = SKILL_BY_ID[id].requires;
    return !req || this.rank(req.id) >= req.rank;
  }

  check(id: SkillId): BuyResult {
    if (this.rank(id) >= SKILL_BY_ID[id].maxRank) return 'maxed';
    if (!this.isUnlocked(id)) return 'locked';
    if (this.points <= 0) return 'noPoints';
    return 'ok';
  }

  buy(id: SkillId): BuyResult {
    const result = this.check(id);
    if (result !== 'ok') return result;
    this.ranks.set(id, this.rank(id) + 1);
    this.points--;
    return 'ok';
  }

  get spent(): number {
    let total = 0;
    for (const r of this.ranks.values()) total += r;
    return total;
  }

  snapshot(): SkillRanks {
    return Object.fromEntries(SKILLS.map((s) => [s.id, this.rank(s.id)])) as Record<SkillId, number>;
  }

  stats(): PlayerStats {
    return computeStats(this.snapshot());
  }

  reset(): void {
    this.ranks.clear();
    this.points = 0;
  }

  /** Loads ranks from a save; unknown skills are ignored and ranks above a skill's maximum are clamped. */
  restore(ranks: Partial<Record<SkillId, number>>, points: number): void {
    this.reset();
    for (const s of SKILLS) {
      const r = Math.min(s.maxRank, Math.max(0, Math.floor(ranks[s.id] ?? 0)));
      if (r > 0) this.ranks.set(s.id, r);
    }
    this.points = Math.max(0, Math.floor(points));
  }
}
