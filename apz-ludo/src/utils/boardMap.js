/**
 * Maps the server's token-position encoding onto a 15×15 grid (row, col).
 * Mirrors server/src/game/board.js — keep the two in sync.
 *
 * Layout (matches the classic board): red top-left, green top-right,
 * yellow bottom-right, blue bottom-left.
 */

// The 52 main-track cells, index 0..51, as [row, col]. Index 0 = red's start.
export const MAIN_PATH = [
  [6, 1], [6, 2], [6, 3], [6, 4], [6, 5],        // 0-4
  [5, 6], [4, 6], [3, 6], [2, 6], [1, 6],        // 5-9
  [0, 6], [0, 7], [0, 8],                         // 10-12
  [1, 8], [2, 8], [3, 8], [4, 8], [5, 8],        // 13-17  (green start = 13 → [1,8])
  [6, 9], [6, 10], [6, 11], [6, 12], [6, 13],    // 18-22
  [6, 14], [7, 14], [8, 14],                      // 23-25
  [8, 13], [8, 12], [8, 11], [8, 10], [8, 9],    // 26-30  (yellow start = 26 → [8,13])
  [9, 8], [10, 8], [11, 8], [12, 8], [13, 8],    // 31-35
  [14, 8], [14, 7], [14, 6],                      // 36-38
  [13, 6], [12, 6], [11, 6], [10, 6], [9, 6],    // 39-43  (blue start = 39 → [13,6])
  [8, 5], [8, 4], [8, 3], [8, 2], [8, 1],        // 44-48
  [8, 0], [7, 0], [6, 0],                         // 49-51
];

// Each color's 5-cell home column (encoded 100..104), running toward center.
// The 6th cell each direction previously used ([7,6],[6,7],[7,8],[8,7]) falls
// inside the 3×3 center pinwheel area and is excluded — tokens there looked
// like they were already home.
export const HOME_PATHS = {
  red: [[7, 1], [7, 2], [7, 3], [7, 4], [7, 5]],
  green: [[1, 7], [2, 7], [3, 7], [4, 7], [5, 7]],
  yellow: [[7, 13], [7, 12], [7, 11], [7, 10], [7, 9]],
  blue: [[13, 7], [12, 7], [11, 7], [10, 7], [9, 7]],
};

export const START_INDEX = { red: 0, green: 13, yellow: 26, blue: 39 };
export const SAFE_INDICES = new Set([0, 8, 13, 21, 26, 34, 39, 47]);
export const CENTER = [7, 7];

const MAIN_TRACK_LEN = 52;

// Encoded position ↔ per-color linear progress (mirrors server/src/game/board.js),
// used to compute the intermediate cells a token hops through when animating.
export function toProgress(color, pos) {
  if (pos >= 100 && pos < 105) return 51 + (pos - 100); // home column (5 cells: 100–104)
  return (((pos - START_INDEX[color]) % MAIN_TRACK_LEN) + MAIN_TRACK_LEN) % MAIN_TRACK_LEN;
}
export function fromProgress(color, progress) {
  if (progress <= 50) return (START_INDEX[color] + progress) % MAIN_TRACK_LEN;
  if (progress < 56) return 100 + (progress - 51); // 51–55 → encoded 100–104
  return 999; // progress ≥ 56 → FINISHED
}

// Where the 4 tokens sit while in base, per color (a centered 2×2 inside each
// 6×6 corner yard). Fractional grid coords place them evenly on the white pad.
export const YARD_SLOTS = {
  red: [[1.5, 1.5], [1.5, 3.5], [3.5, 1.5], [3.5, 3.5]],
  green: [[1.5, 10.5], [1.5, 12.5], [3.5, 10.5], [3.5, 12.5]],
  yellow: [[10.5, 10.5], [10.5, 12.5], [12.5, 10.5], [12.5, 12.5]],
  blue: [[10.5, 1.5], [10.5, 3.5], [12.5, 1.5], [12.5, 3.5]],
};

// Each color's 6×6 corner yard: { row, col } top-left origin (for rendering).
export const YARDS = {
  red: { row: 0, col: 0 },
  green: { row: 0, col: 9 },
  yellow: { row: 9, col: 9 },
  blue: { row: 9, col: 0 },
};

const startColorByIndex = { 0: 'red', 13: 'green', 26: 'yellow', 39: 'blue' };

// Fast lookups keyed by "row,col".
const pathByKey = {};
MAIN_PATH.forEach(([r, c], i) => (pathByKey[`${r},${c}`] = i));
const homeByKey = {};
for (const [color, cells] of Object.entries(HOME_PATHS)) {
  cells.forEach(([r, c]) => (homeByKey[`${r},${c}`] = color));
}

/** Grid [row, col] for one token, given its color, encoded position and index. */
export function cellOf(color, pos, tokenIndex) {
  if (pos === -1) return YARD_SLOTS[color][tokenIndex];
  if (pos === 999) return CENTER;
  if (pos >= 100) return HOME_PATHS[color][pos - 100];
  return MAIN_PATH[pos];
}

/**
 * Classify a cross cell for rendering. Returns null for cells that belong to a
 * corner yard or the center (rendered separately).
 *   { kind: 'track'|'home', color?, isStart?, isSafe? }
 */
export function classifyCell(row, col) {
  const key = `${row},${col}`;
  if (key in pathByKey) {
    const idx = pathByKey[key];
    return {
      kind: 'track',
      color: startColorByIndex[idx] || null,
      isStart: idx in startColorByIndex,
      isSafe: SAFE_INDICES.has(idx),
    };
  }
  if (key in homeByKey) return { kind: 'home', color: homeByKey[key] };
  return null; // arm-corner filler ([6,6] etc.) — render as blank
}
