import { HEROES, type HeroId } from '../systems/heroes.ts';
import { type SpriteArt, composeFrames, withPalette } from './pixelArt.ts';

// All characters are drawn facing right; mirrored textures are generated for facing left.

const HERO_PALETTE = {
  k: '#1a1020',
  h: '#2b2140',
  s: '#f4c69c',
  S: '#c98e6a',
  m: '#1b2a6b',
  e: '#ffffff',
  b: '#2f6fe4',
  B: '#1c3e95',
  r: '#dd2a3c',
  R: '#8e1424',
  y: '#ffd83a',
};

const HERO_TOP = [
  '......kkkkk.....',
  '.....khhhhhk....',
  '....khhhhhhhk...',
  '....khhhsssssk..',
  '....khhmmmmemk..',
  '...kRkhssssssk..',
  '..kRrkkSsssk....',
  '.kRrrkbbyybbk...',
  '.kRrkbbyyyybbk..',
  '.kRrkbbbyybbBsk.',
  'kRrrkbbbbbbBsk..',
  'kRrrkByyyyyBk...',
  'kRrrrkbbbbbbk...',
  'kRRrrkbbkbbbk...',
];

const HERO_LEGS_IDLE = [
  '.kRRrkbbkkbbk...',
  '..kRRkbbk.kbbk..',
  '...kkkrrk.krrk..',
  '....krrrk.krrrk.',
  '....kkkkk.kkkkk.',
  '................',
];

const HERO_LEGS_STRIDE = [
  '.kRRrkbbkkbbk...',
  '..kRkbbk..kbbk..',
  '..kkbbk....kbbk.',
  '..krrk.....krrk.',
  '.krrrk.....krrrk',
  '.kkkkk.....kkkkk',
];

const HERO_LEGS_PASS = [
  '.kRRrkbbbbbk....',
  '..kRRkbbbbk.....',
  '...kkkbbbk......',
  '....krrrrk......',
  '....krrrrk......',
  '....kkkkkk......',
];

/** Idle, stride, idle, pass: a four-step walk cycle. */
export const HERO_FRAMES: SpriteArt[] = composeFrames(
  HERO_TOP,
  [HERO_LEGS_IDLE, HERO_LEGS_STRIDE, HERO_LEGS_IDLE, HERO_LEGS_PASS],
  HERO_PALETTE,
);

/** Every playable hero shares the art; only the colours change. */
export const HERO_VARIANTS: Readonly<Record<HeroId, SpriteArt[]>> = Object.fromEntries(
  HEROES.map((h) => [h.id, HERO_FRAMES.map((f) => withPalette(f, h.palette))]),
) as Record<HeroId, SpriteArt[]>;

const ZOMBIE_PALETTE = {
  k: '#10200f',
  g: '#86bb5c',
  G: '#557f3c',
  e: '#ff3a2a',
  w: '#e8e0c8',
  c: '#7c5a8e',
  C: '#4c3662',
  d: '#8a1010',
  p: '#4a4f70',
  P: '#2e3248',
};

const ZOMBIE_TOP = [
  '................',
  '....kkkkk.......',
  '...kgggggk......',
  '...kgGggggk.....',
  '...kggggeek.....',
  '...kGggggGk.....',
  '....kgwwgk......',
  '...kcckkkkkkkkk.',
  '..kcccggggggggk.',
  '..kcCckkkkkkkkk.',
  '..kcdccck.......',
  '..kccCcck.......',
  '..kkccckk.......',
];

const ZOMBIE_LEGS_A = [
  '..kpppPPk.......',
  '..kppkPPk.......',
  '..kpk.kPk.......',
  '.kGgk..kGgk.....',
  '.kkkk..kkkk.....',
];

const ZOMBIE_LEGS_B = [
  '..kpppPPk.......',
  '...kpPPk........',
  '...kpPk.........',
  '...kGgk.........',
  '...kkkk.........',
];

const ZOMBIE_BASE = composeFrames(ZOMBIE_TOP, [ZOMBIE_LEGS_A, ZOMBIE_LEGS_B], ZOMBIE_PALETTE);

export const ZOMBIE_FRAMES = {
  walker: ZOMBIE_BASE,
  runner: ZOMBIE_BASE.map((f) =>
    withPalette(f, { g: '#bccb94', G: '#808f62', c: '#c03c3c', C: '#7a2020', p: '#3a3a3a', P: '#1e1e1e' }),
  ),
  brute: ZOMBIE_BASE.map((f) =>
    withPalette(f, { g: '#6f8f4a', G: '#3f5a2a', c: '#8a6a3a', C: '#5a4020', p: '#5a3a2a', P: '#3a2418', e: '#ffd020' }),
  ),
} as const;

const BLOATER_PALETTE = {
  ...ZOMBIE_PALETTE,
  o: '#c8d070',
  O: '#8a9a40',
  y: '#fff060',
  r: '#ff7020',
};

const BLOATER_TOP = [
  '................',
  '.....kkkkk......',
  '....kgggggk.....',
  '....kggggeek....',
  '....kGgwwgGk....',
  '...kkkkkkkkkk...',
  '..kooyooorooook.',
  '.kooooooyoooyook',
  '.koyoooroooooook',
  '.koooooyoooroyOk',
  '.kOoorooooyooOOk',
  '..kOOooooooOOOk.',
  '...kkkOOOOOkkk..',
];

const BLOATER_LEGS_A = [
  '...kpppPPPPk....',
  '...kppk.kPPk....',
  '...kpk...kPk....',
  '..kGgk...kGgk...',
  '..kkkk...kkkk...',
];

const BLOATER_LEGS_B = [
  '...kpppPPPPk....',
  '....kppkPPk.....',
  '....kpk.kPk.....',
  '....kGgkGgk.....',
  '....kkkkkkk.....',
];

/** Swollen zombie full of gas; it pops like a grenade. */
export const BLOATER_FRAMES = composeFrames(BLOATER_TOP, [BLOATER_LEGS_A, BLOATER_LEGS_B], BLOATER_PALETTE);

const SPITTER_TOP = [
  '................',
  '....kkkkk.......',
  '...kgggggk......',
  '...kgGggeek.....',
  '...kgggggkkk....',
  '...kGggkvvvvk...',
  '....kgvVVVvk....',
  '...kccvVVVVvk...',
  '..kcccvvvvvk....',
  '..kcCckkkkkk....',
  '..kcdccck.......',
  '..kccCcck.......',
  '..kkccckk.......',
];

/** Hunched zombie with a bile sac in its throat. */
export const SPITTER_FRAMES = composeFrames(SPITTER_TOP, [ZOMBIE_LEGS_A, ZOMBIE_LEGS_B], {
  ...ZOMBIE_PALETTE,
  g: '#a890c0',
  G: '#6e5a88',
  c: '#4a6a3a',
  C: '#2e4424',
  v: '#98ff60',
  V: '#50c030',
});

const RIOT_PALETTE = {
  ...ZOMBIE_PALETTE,
  c: '#3a4a7a',
  C: '#222c50',
  p: '#2a3050',
  P: '#181c30',
  m: '#9aa4b0',
  M: '#5a626c',
  s: '#1c2028',
};

const RIOT_TOP = [
  '................',
  '....kkkkk.......',
  '...kgggggk......',
  '...kgGggkkkkkk..',
  '...kgggkmmmmmMk.',
  '...kGggkmsssmMk.',
  '....kgwkmmmmmMk.',
  '...kcckkmmmmmMk.',
  '..kcccgkmMmmmMk.',
  '..kcCcckmmmmmMk.',
  '..kcdcckmmMmmMk.',
  '..kccCckmmmmmMk.',
  '..kkccckmmmmmMk.',
];

const RIOT_LEGS_A = [
  '..kpppPkmmmmmMk.',
  '..kppkPkkkkkkkk.',
  '..kpk.kPk.......',
  '.kGgk..kGgk.....',
  '.kkkk..kkkk.....',
];

const RIOT_LEGS_B = [
  '..kpppPkmmmmmMk.',
  '...kpPkkkkkkkkk.',
  '...kpPk.........',
  '...kGgk.........',
  '...kkkk.........',
];

/** Riot cop zombie behind a steel shield; without the shield it is a plain zombie in uniform. */
export const RIOT_FRAMES = {
  shielded: composeFrames(RIOT_TOP, [RIOT_LEGS_A, RIOT_LEGS_B], RIOT_PALETTE),
  broken: ZOMBIE_BASE.map((f) => withPalette(f, { c: RIOT_PALETTE.c, C: RIOT_PALETTE.C, p: RIOT_PALETTE.p, P: RIOT_PALETTE.P })),
} as const;

const BAT_PALETTE = { k: '#140a18', b: '#5a3a6a', B: '#3a2248', e: '#ff3030', w: '#f0f0f0' };

/** Wings up, wings down. */
export const BAT_FRAMES: SpriteArt[] = [
  {
    palette: BAT_PALETTE,
    rows: [
      'k..........k',
      'kk........kk',
      'kbk.kkkk.kbk',
      'kbBkbeebkBbk',
      '.kbBbbbbBbk.',
      '..kkbbbbkk..',
      '....kwwk....',
      '.....kk.....',
    ],
  },
  {
    palette: BAT_PALETTE,
    rows: [
      '............',
      '............',
      '....kkkk....',
      '...kbeebk...',
      '.kkbbbbbbkk.',
      'kBbbbbbbbbBk',
      'kbk.kwwk.kbk',
      'kk...kk...kk',
    ],
  },
];

const BOSS_PALETTE = {
  k: '#1a0a1a',
  f: '#9a4a8a',
  F: '#5e2a5a',
  n: '#ff94b4',
  N: '#c05070',
  e: '#ffe030',
  E: '#300000',
  w: '#f0e8d0',
  c: '#d8d4b0',
  d: '#7a0a14',
  g: '#98ff60',
};

const BOSS_TOP = [
  '........kkkkkkk.........',
  '......kknNnnNnkk........',
  '.....knnNnnnNnnNk.......',
  '....knNnnkkkknnnnk......',
  '....kffkkeeeekkffk......',
  '...kfffkeeEEeekfffk.....',
  '...kfffkeeEEeekffffk....',
  '..kffffkkeeeekkfffffk...',
  '..kfFffffkkkkffffFffk...',
  '.kffFfkwkwkwkwkffFfffk..',
  '.kfffkdkkkkkkkdkfffffk..',
  'kffFfkwkwkwkwkwkfFffffk.',
  'kfffffkkkkkkkkkffffFfffk',
  'kfFfffffggffffffffFfffck',
  'kffFfffgggffFfffffffkcck',
  '.kfffffffffffFffffffkcck',
  '.kkffFffffFffffffffkkcck',
  '..kffffffffffffffkkckkk.',
];

const BOSS_LEGS_A = [
  '..kFfffkkkkkkkfffk.kk...',
  '..kfffk......kfffk......',
  '.kFffk........kfffk.....',
  '.kfffk........kFffk.....',
  'kccckk.......kccccck....',
  'kkkkk........kkkkkkk....',
];

const BOSS_LEGS_B = [
  '..kFfffkkkkkkkfffk.kk...',
  '...kfffk....kfffk.......',
  '...kFffk....kfffk.......',
  '...kfffk....kFffk.......',
  '..kccckk...kccccck......',
  '..kkkkk....kkkkkkk......',
];

const BOSS_BASE = composeFrames(BOSS_TOP, [BOSS_LEGS_A, BOSS_LEGS_B], BOSS_PALETTE);

export interface BossVariant {
  readonly name: string;
  readonly frames: SpriteArt[];
}

export const BOSS_VARIANTS: readonly BossVariant[] = [
  { name: 'THE ABOMINATION', frames: BOSS_BASE },
  {
    name: 'BUTCHER KING',
    frames: BOSS_BASE.map((f) => withPalette(f, { f: '#b86a4a', F: '#6e3a28', n: '#ffb080', N: '#c07050', g: '#ff4040' })),
  },
  {
    name: 'ROTLORD',
    frames: BOSS_BASE.map((f) =>
      withPalette(f, { f: '#4a8a7a', F: '#285a4e', n: '#d0ff90', N: '#80b050', e: '#ff4040', g: '#e0ff40' }),
    ),
  },
];

const WEAPON_PALETTE = {
  k: '#141418',
  g: '#9aa0aa',
  G: '#565c66',
  w: '#dfe4ea',
  b: '#7a4a22',
  o: '#e07020',
  r: '#d02020',
  c: '#70f4ff',
  C: '#2090b0',
  y: '#ffd040',
};

export const WEAPON_ART: Readonly<Record<string, SpriteArt>> = {
  pistol: {
    palette: WEAPON_PALETTE,
    rows: ['............', '.kkkkkkkkkk.', '.kwwwwwwwwgk', '.kgGGGGkkkk.', '.kGGk.......', '..kk........'],
  },
  heavy: {
    palette: WEAPON_PALETTE,
    rows: [
      '....kkkk........',
      'kkkkkGGkkkkkkkkk',
      'kbbkgggggwwwwwwk',
      'kbbkGGGGGkkkkkkk',
      '.kkkkGGk........',
      '.....kk.........',
    ],
  },
  shotgun: {
    palette: WEAPON_PALETTE,
    rows: ['................', 'kkkkkkkkkkkkkkkk', 'kbbbbkggggwwwwwk', 'kbbkkbbbkkkkkkkk', '.kk..kkk........'],
  },
  rocket: {
    palette: WEAPON_PALETTE,
    rows: [
      '.kkkkkkkkkkkkkk.',
      'kGggggggggggggGk',
      'kGgooogggggrrgGk',
      'kGggggggggggggGk',
      '.kkkkGGkkkkkkkk.',
      '.....kk.........',
    ],
  },
  flame: {
    palette: WEAPON_PALETTE,
    rows: [
      '..kkk...........',
      '.koook.kkkkkkk..',
      'kkoookkgggggggkk',
      'kGGGGGGGGGGGGGGr',
      '.kGGk.kk.......k',
      '..kk............',
    ],
  },
  laser: {
    palette: WEAPON_PALETTE,
    rows: ['..kkkkkkkkkkk...', 'kkGGGGcCcCcGGkkk', 'kbbkggggggggwwcc', 'kbkkGGkkkkkkkkkk', '.k..kk..........'],
  },
};

export const PARACHUTE_ART: SpriteArt = {
  palette: { k: '#2a1a10', w: '#f4f0e0', r: '#e03a30' },
  rows: [
    '......kkkkkkkk......',
    '....kkwwrrwwrrkk....',
    '...kwwrrwwrrwwrrk...',
    '..kwrrwwrrwwrrwwrk..',
    '.kwwrrwwrrwwrrwwrrk.',
    'kkkkkkkkkkkkkkkkkkkk',
    '.k......k..k......k.',
    '..k.....k..k.....k..',
    '...k....k..k....k...',
    '....k...k..k...k....',
    '.....k..k..k..k.....',
    '......k.k..k.k......',
  ],
};

export const GRAVE_ART: SpriteArt = {
  palette: { k: '#1a1a22', w: '#a8a8b8', g: '#787888', G: '#4a3a2a' },
  rows: [
    '...kkkk...',
    '..kwwwwk..',
    '.kwwwwwwk.',
    '.kwwkkwwk.',
    '.kwkkkkwk.',
    '.kwwkkwwk.',
    '.kwwkkwwk.',
    '.kwwwwwwk.',
    '.kgwwwwgk.',
    '.kggggggk.',
    'kkkkkkkkkk',
    'kGGGGGGGGk',
  ],
};

const TURRET_LEGS = [
  '....kgggggk.....',
  '.....kkkkk......',
  '......kGk.......',
  '.....kGGGk......',
  '....kG.k.Gk.....',
  '...kG..k..Gk....',
  '..kk...k...kk...',
];

const TURRET_HEADS = [
  [
    '.....kkkkk......',
    '....kgggggk.....',
    '...kgGGGGGgkkkkk',
    '...kgGyyGGgwwwwk',
    '...kgGGGGGgkkkkk',
  ],
  [
    '.....kkkkk......',
    '....kgggggkkkkkk',
    '...kgGGGGGgwwwwk',
    '...kgGyyGGgkkkkk',
    '...kgGGGGGgwwwwk',
    '...kgGGGGGgkkkkk',
  ],
  [
    '.....kkkkk......',
    '....kgggggkkkkkk',
    '...kgGGGGGgwwwwk',
    '...kgGyyGGgkkkkk',
    '...kgGGGGGgwwwwk',
    '...kgGGGGGgkkkkk',
  ],
];

const TURRET_PALETTES = [
  { g: '#9aa0aa', G: '#565c66', B: '#3d8bff' },
  { g: '#a4b068', G: '#5a6630', B: '#ffd633' },
  { g: '#d09078', G: '#8a3a30', B: '#ff8a1e' },
];

/** Tier badge above the turret: one pip per tier, coloured blue, yellow or orange. */
const turretBadge = (tier: number): string[] => {
  const pips = (cell: string): string => `.${Array.from({ length: tier }, () => cell).join('.')}`.padEnd(16, '.');
  return [pips('kkk'), pips('kBk'), pips('kkk')];
};

/** Sentry turret per tech tier: single gun, twin guns, and the top tier with twin guns and no rockets. Badge colour shows the tier. */
export const TURRET_ART: readonly SpriteArt[] = TURRET_HEADS.map((head, i) => ({
  rows: [...turretBadge(i + 1), ...head, ...TURRET_LEGS],
  palette: { k: '#141418', y: '#7cff6a', w: '#dfe4ea', ...TURRET_PALETTES[i] },
}));

export const DRONE_ART: SpriteArt = {
  palette: { k: '#141418', g: '#b0c4d8', G: '#5a6c80', c: '#70f4ff' },
  rows: ['kkkk....kkkk', '.kk......kk.', '..kkkkkkkk..', '.kgggggggck.', '.kgGGGGGGgk.', '..kkkkkkkk..', '.....kk.....'],
};

export const GRENADE_ART: SpriteArt = {
  palette: { k: '#141418', g: '#6a8a3a', G: '#3e5a22', y: '#ffd040' },
  rows: ['..kk..', '.kyk..', '.kkkk.', 'kGgGgk', 'kgGgGk', 'kGgGgk', '.kkkk.'],
};

const MINE_ROWS = ['....kk....', '..kkrrkk..', '.kgggggggk', 'kkkkkkkkkk'];
export const MINE_ART: readonly SpriteArt[] = [
  { rows: MINE_ROWS, palette: { k: '#141418', g: '#707868', r: '#ff3020' } },
  { rows: MINE_ROWS, palette: { k: '#141418', g: '#707868', r: '#501010' } },
];

const BARREL_PALETTE = { k: '#140a08', r: '#d0301c', R: '#8a1a10', y: '#ffd040', w: '#f0e8d0', g: '#6a6068' };

const BARREL_ROWS = [
  '..kkkkkk..',
  '.kgggggggk',
  '.kRrrrrrRk',
  'kRrrrrrrRk',
  'kggggggggk',
  'kRryyyyrRk',
  'kRrykkyrRk',
  'kRryyyyrRk',
  'kggggggggk',
  'kRrrrrrrRk',
  '.kRrrrrRk.',
  '..kkkkkk..',
];

/** Explosive barrel: intact, then dented and leaking once it has been hit. */
export const BARREL_FRAMES: SpriteArt[] = [
  { palette: BARREL_PALETTE, rows: BARREL_ROWS },
  {
    palette: { ...BARREL_PALETTE, r: '#e86030', y: '#ffffff' },
    rows: BARREL_ROWS.map((row, y) => (y === 3 ? 'kRrr..rrRk' : y === 9 ? 'kRr.rrrrRk' : row)),
  },
];

const SPIKE_PALETTE = { k: '#241e2a', d: '#8a8494', m: '#c8ccd8', w: '#ffffff', r: '#ff3020' };

/** Floor trap seen from above: plate with holes, red warning holes, and raised steel spikes. */
export const SPIKE_ART: readonly SpriteArt[] = [
  {
    palette: SPIKE_PALETTE,
    rows: [
      'kkkkkkkkkkkkkkkk',
      'kddddddddddddddk',
      'kdkddkddkddkdddk',
      'kddddddddddddddk',
      'kddkddkddkddkddk',
      'kddddddddddddddk',
      'kdkddkddkddkdddk',
      'kddddddddddddddk',
      'kddkddkddkddkddk',
      'kddddddddddddddk',
      'kdkddkddkddkdddk',
      'kddddddddddddddk',
      'kddkddkddkddkddk',
      'kddddddddddddddk',
      'kddddddddddddddk',
      'kkkkkkkkkkkkkkkk',
    ],
  },
  {
    palette: SPIKE_PALETTE,
    rows: [
      'kkkkkkkkkkkkkkkk',
      'kddddddddddddddk',
      'kdrddrddrddrdddk',
      'kddddddddddddddk',
      'kddrddrddrddrddk',
      'kddddddddddddddk',
      'kdrddrddrddrdddk',
      'kddddddddddddddk',
      'kddrddrddrddrddk',
      'kddddddddddddddk',
      'kdrddrddrddrdddk',
      'kddddddddddddddk',
      'kddrddrddrddrddk',
      'kddddddddddddddk',
      'kddddddddddddddk',
      'kkkkkkkkkkkkkkkk',
    ],
  },
  {
    palette: SPIKE_PALETTE,
    rows: [
      'kkkkkkkkkkkkkkkk',
      'kddddddddddddddk',
      'kdwddwddwddwdddk',
      'kdmddmddmddmdddk',
      'kddwddwddwddwddk',
      'kddmddmddmddmddk',
      'kdwddwddwddwdddk',
      'kdmddmddmddmdddk',
      'kddwddwddwddwddk',
      'kddmddmddmddmddk',
      'kdwddwddwddwdddk',
      'kdmddmddmddmdddk',
      'kddwddwddwddwddk',
      'kddmddmddmddmddk',
      'kddddddddddddddk',
      'kkkkkkkkkkkkkkkk',
    ],
  },
];

/** 3x5 glyphs used to stamp Metal Slug style letters on supply crates. */
export const GLYPHS: Readonly<Record<string, readonly string[]>> = {
  H: ['#.#', '#.#', '###', '#.#', '#.#'],
  S: ['###', '#..', '###', '..#', '###'],
  R: ['##.', '#.#', '##.', '#.#', '#.#'],
  F: ['###', '#..', '##.', '#..', '#..'],
  L: ['#..', '#..', '#..', '#..', '###'],
  P: ['##.', '#.#', '##.', '#..', '#..'],
  '+': ['...', '.#.', '###', '.#.', '...'],
};

export const ALL_ART: readonly SpriteArt[] = [
  ...HERO_FRAMES,
  ...Object.values(HERO_VARIANTS).flat(),
  ...ZOMBIE_FRAMES.walker,
  ...ZOMBIE_FRAMES.runner,
  ...ZOMBIE_FRAMES.brute,
  ...BLOATER_FRAMES,
  ...SPITTER_FRAMES,
  ...RIOT_FRAMES.shielded,
  ...RIOT_FRAMES.broken,
  ...BAT_FRAMES,
  ...BOSS_VARIANTS.flatMap((v) => v.frames),
  ...Object.values(WEAPON_ART),
  PARACHUTE_ART,
  GRAVE_ART,
  ...TURRET_ART,
  DRONE_ART,
  GRENADE_ART,
  ...MINE_ART,
  ...BARREL_FRAMES,
  ...SPIKE_ART,
];
