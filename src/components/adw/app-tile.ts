/** App tile sizes (px of the face), see .app-tile in src/styles/adwaita.css. */
export const TILE_SIZES = [24, 36, 48, 64, 96, 128, 160] as const;
export type TileSize = (typeof TILE_SIZES)[number];
/** Sizes a tile can switch to below 600px (`narrowSize`, the .narrow-* rules). */
export type NarrowTileSize = 48 | 64 | 96;

/** The supported tile size closest to `px` (ties go to the larger size). */
export function nearestTileSize(px: number): TileSize {
  let best: TileSize = TILE_SIZES[0];
  for (const size of TILE_SIZES) {
    if (Math.abs(size - px) <= Math.abs(best - px)) best = size;
  }
  return best;
}
