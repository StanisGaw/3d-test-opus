import { ATTACK_COOLDOWN, BOSS_STATS, EXPLODER_BLAST, EXPLODER_FUSE, EXPLODER_TRIGGER, SHIELD_HP, SPITTER_BILE, SPITTER_RANGE, ZOMBIE_STATS } from '../entities/enemies.ts';
import { ELITES, ELITE_AFFIXES, ELITE_KINDS } from './elites.ts';
import { UNLOCK_STAGE, WAVES_PER_ROUND, type ZombieKind } from './waveDirector.ts';

/** How a monster's attack looks in the bestiary preview (the sprites only have a walk cycle). */
export type AttackStyle = 'bite' | 'pop' | 'spit' | 'bash' | 'charge' | 'swoop';

export interface Attack {
  readonly name: string;
  readonly text: string;
  readonly style: AttackStyle;
}

export interface BestiaryEntry {
  readonly id: ZombieKind | 'boss';
  readonly name: string;
  readonly role: string;
  readonly lore: string;
  /** First stage (round 1 wave 1 = 1) where it shows up; 1 = from the start. */
  readonly appearsAt: string;
  readonly stats: readonly [label: string, value: string][];
  readonly attacks: readonly Attack[];
  readonly tips: readonly string[];
  /** Animation sprite speed (frames per second) used for the Walk preview. */
  readonly walkRate: number;
}

const speedLabel = (v: number): string => `${v.toFixed(2)} tiles/s`;

function stageLabel(kind: Exclude<ZombieKind, 'walker'>): string {
  const stage = UNLOCK_STAGE[kind];
  return `Round ${Math.floor((stage - 1) / WAVES_PER_ROUND) + 1}, wave ${((stage - 1) % WAVES_PER_ROUND) + 1}`;
}

function base(kind: ZombieKind): [string, string][] {
  const z = ZOMBIE_STATS[kind];
  return [
    ['HP (round 1)', String(z.hp)],
    ['Speed', speedLabel(z.speed)],
    ['Contact damage', z.damage > 0 ? String(z.damage) : '— (explosion only)'],
    ['Hit radius', z.hitRadius.toFixed(2)],
    ['Score', String(z.score)],
  ];
}

const bite = (damage: number): Attack => ({ name: 'Bite', style: 'bite', text: `Touching the hero deals ${damage} damage, then ${ATTACK_COOLDOWN}s cooldown.` });

export const BESTIARY: readonly BestiaryEntry[] = [
  {
    id: 'walker', name: 'Walker', role: 'Basic horde', appearsAt: 'From the start', walkRate: 5, lore: 'The shambling rank and file. Slow, stubborn, and everywhere.',
    stats: base('walker'), attacks: [bite(ZOMBIE_STATS.walker.damage)],
    tips: ['Its pace wobbles, so it is easy to kite.', 'Can roll an elite affix from wave 3.'],
  },
  {
    id: 'runner', name: 'Runner', role: 'Fast flanker', appearsAt: stageLabel('runner'), walkRate: 10, lore: 'Starved and sprinting, it trades toughness for speed.',
    stats: base('runner'), attacks: [bite(ZOMBIE_STATS.runner.damage)],
    tips: ['Twice as fast as a walker but dies to one or two shots.', 'Splitter elites spawn runners when they die.'],
  },
  {
    id: 'bat', name: 'Bat', role: 'Flying pest', appearsAt: stageLabel('bat'), walkRate: 12, lore: 'Ignores walls and mines, weaving in on a wavy line.',
    stats: [...base('bat'), ['Flies', 'Yes (walls and mines do not stop it)']],
    attacks: [{ name: 'Bite and retreat', style: 'swoop', text: `Dives in for ${ZOMBIE_STATS.bat.damage} damage, then backs off for 0.6s.` }],
    tips: ['Very low HP: any spray weapon clears a flock.', 'Hard to hide from behind walls.'],
  },
  {
    id: 'exploder', name: 'Exploder', role: 'Walking bomb', appearsAt: stageLabel('exploder'), walkRate: 5, lore: 'Bloated with gas. It also pops if you shoot it down.',
    stats: [...base('exploder'), ['Blast radius', String(EXPLODER_BLAST.radius)], ['Blast damage', `${EXPLODER_BLAST.playerDamage} hero / ${EXPLODER_BLAST.enemyDamage} zombies`]],
    attacks: [{ name: 'Detonation', style: 'pop', text: `Within ${EXPLODER_TRIGGER} tiles it lights a ${EXPLODER_FUSE}s fuse (slows to 35% speed) and bursts, hurting everyone nearby.` }],
    tips: ['Kill it far away: the blast also damages other zombies.'],
  },
  {
    id: 'brute', name: 'Brute', role: 'Heavy tank', appearsAt: stageLabel('brute'), walkRate: 5, lore: 'A hulking mass of muscle that shrugs off pistol fire.',
    stats: base('brute'), attacks: [bite(ZOMBIE_STATS.brute.damage)],
    tips: ['Slowest zombie, so keep moving and use heavy weapons.'],
  },
  {
    id: 'spitter', name: 'Spitter', role: 'Ranged', appearsAt: stageLabel('spitter'), walkRate: 5, lore: 'Keeps its distance and lobs acid at the hero.',
    stats: [...base('spitter'), ['Preferred range', `${SPITTER_RANGE.min}–${SPITTER_RANGE.max} tiles`], ['Bile speed', String(SPITTER_BILE.speed)]],
    attacks: [
      { name: 'Bile', style: 'spit', text: `0.55s telegraph (flashes), then a bile shot for ${SPITTER_BILE.damage} damage; 2.2–3s cooldown.` },
      bite(ZOMBIE_STATS.spitter.damage),
    ],
    tips: ['It backs off when you get closer than 4 tiles and strafes at range.', 'Needs a clear line of sight: break it with cover.'],
  },
  {
    id: 'shield', name: 'Riot Zombie', role: 'Armoured', appearsAt: stageLabel('shield'), walkRate: 5, lore: 'A steel shield soaks every bullet from the front.',
    stats: [...base('shield'), ['Shield HP (round 1)', String(SHIELD_HP)]],
    attacks: [{ ...bite(ZOMBIE_STATS.shield.damage), name: 'Bash' , style: 'bash' }],
    tips: ['Hit it from behind or burn the shield down.', 'When the shield breaks it runs 35% faster.'],
  },
  {
    id: 'boss', name: 'Boss', role: `Round boss (after wave ${WAVES_PER_ROUND})`, appearsAt: 'After each round’s final wave', walkRate: 4,
    lore: 'A different abomination guards each round: The Abomination, Butcher King, Rotlord…',
    stats: [
      ['HP (round 1)', `${BOSS_STATS.hp} (+${BOSS_STATS.hpPerRound} per round)`],
      ['Speed', `${speedLabel(BOSS_STATS.speed)} (×1.35 when enraged)`],
      ['Contact damage', String(BOSS_STATS.damage)],
      ['Hit radius', BOSS_STATS.hitRadius.toFixed(2)],
      ['Score', `${BOSS_STATS.score} × round`],
    ],
    attacks: [
      { name: 'Charge', style: 'charge', text: `Flashes, then rushes at ${BOSS_STATS.chargeSpeed} tiles/s for ${BOSS_STATS.chargeDamage} damage. Hitting a wall stuns it for 1.1s.` },
      { name: 'Bile volleys', style: 'spit', text: '3 volleys of 5 shots (4 when enraged), finished by a ring of 16 shots.' },
      { name: 'Summon', style: 'pop', text: 'Roars and calls 3 + round zombies around itself.' },
      { name: 'Contact', style: 'bash', text: `Touching it deals ${BOSS_STATS.damage} damage.` },
    ],
    tips: ['Below 50% HP it is enraged: faster, shorter windups.', 'Dodge the charge sideways so it hits the wall.'],
  },
];

export const ELITE_INFO = ELITE_AFFIXES.map((id) => ELITES[id]);
export const ELITE_APPLIES_TO = [...ELITE_KINDS];
