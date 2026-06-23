/**
 * Ludo board geometry and position encoding. Pure constants + helpers, no state.
 *
 * Token position encoding (matches games.state JSONB):
 *   -1        → in base (home yard)
 *   0..51     → absolute cell on the 52-cell main track
 *   100..105  → the player's 6-cell home column
 *   999       → finished (reached center)
 *
 * "Progress" is a per-color linear measure of distance travelled:
 *   0..50  → on the main track   (51 cells; a color never steps on its own
 *            home-entry cell, so absolute-cell ↔ progress is 1:1 per color)
 *   51..56 → home column         (→ encoded 100..105)
 *   57     → center / finished   (→ encoded 999)
 */
export const MAIN_TRACK_LEN = 52;
export const HOME_COLUMN_LEN = 6;
export const LAST_MAIN_PROGRESS = 50; // progress 0..50 are main-track cells
export const CENTER_PROGRESS = 57; // exact progress that means "finished"

export const HOME_BASE = -1;
export const FINISHED = 999;

// Each color's entry cell (where a token lands when it leaves base).
export const START_OFFSET = { red: 0, green: 13, yellow: 26, blue: 39 };

// Safe cells: the 4 entry cells + the 4 star cells (entry + 8). No captures here.
export const SAFE_CELLS = new Set([0, 8, 13, 21, 26, 34, 39, 47]);

export const isMainCell = (pos) => pos >= 0 && pos < MAIN_TRACK_LEN;
export const isHomeColumn = (pos) => pos >= 100 && pos < 100 + HOME_COLUMN_LEN;
export const isSafe = (pos) => isMainCell(pos) && SAFE_CELLS.has(pos);

/** Absolute encoded position → that color's linear progress (0..56). */
export function toProgress(color, pos) {
  if (isHomeColumn(pos)) return LAST_MAIN_PROGRESS + 1 + (pos - 100); // 51..56
  // main-track cell
  return (((pos - START_OFFSET[color]) % MAIN_TRACK_LEN) + MAIN_TRACK_LEN) % MAIN_TRACK_LEN;
}

/** A color's linear progress → absolute encoded position. */
export function fromProgress(color, progress) {
  if (progress <= LAST_MAIN_PROGRESS) {
    return (START_OFFSET[color] + progress) % MAIN_TRACK_LEN; // 0..51
  }
  if (progress < CENTER_PROGRESS) {
    return 100 + (progress - (LAST_MAIN_PROGRESS + 1)); // 51..56 → 100..105
  }
  return FINISHED; // progress === 57
}
