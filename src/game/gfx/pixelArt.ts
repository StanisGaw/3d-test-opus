/** A sprite is a list of equal-width rows; each char is a palette key and '.' means transparent. */
export interface SpriteArt {
  readonly rows: readonly string[];
  readonly palette: Readonly<Record<string, string>>;
}

export const TRANSPARENT = '.';

export function artSize(art: SpriteArt): { width: number; height: number } {
  return { width: Math.max(...art.rows.map((r) => r.length)), height: art.rows.length };
}

/** Returns a list of problems (ragged rows, unknown palette keys). Empty list = valid art. */
export function validateArt(art: SpriteArt): string[] {
  const problems: string[] = [];
  const { width } = artSize(art);
  art.rows.forEach((row, y) => {
    if (row.length !== width) problems.push(`row ${y} has length ${row.length}, expected ${width}`);
    for (const ch of row) {
      if (ch !== TRANSPARENT && !(ch in art.palette)) problems.push(`row ${y} uses unknown key '${ch}'`);
    }
  });
  return problems;
}

export function withPalette(art: SpriteArt, overrides: Readonly<Record<string, string>>): SpriteArt {
  return { rows: art.rows, palette: { ...art.palette, ...overrides } };
}

/** Builds frames from a shared top part and per-frame bottom parts (e.g. walking legs). */
export function composeFrames(top: readonly string[], bottoms: readonly (readonly string[])[], palette: Readonly<Record<string, string>>): SpriteArt[] {
  return bottoms.map((bottom) => ({ rows: [...top, ...bottom], palette }));
}
