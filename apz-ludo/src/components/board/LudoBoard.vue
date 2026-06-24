<template lang="pug">
div(class="relative mx-auto aspect-square w-full max-w-xl overflow-hidden rounded-2xl border border-slate-300 bg-white shadow-sm")
  //- Background grid: 4 corner yards + cross cells + center
  div(class="grid h-full w-full" style="grid-template-columns: repeat(15, 1fr); grid-template-rows: repeat(15, 1fr)")
    HomeBase(v-for="(y, color) in YARDS" :key="color" :color="color" :row="y.row" :col="y.col")
    BoardCell(v-for="cell in crossCells" :key="`${cell.row}-${cell.col}`" :row="cell.row" :col="cell.col" :info="cell.info")
    //- Center pinwheel — each triangle matches the home lane it points to
    //- (left=red, top=green, right=yellow, bottom=blue).
    div(class="flex items-center justify-center" :style="centerStyle")
      div(class="rounded-md" style="width:75%;height:75%;background: conic-gradient(from 45deg, #d97706 0deg 90deg, #0284c7 90deg 180deg, #e11d48 180deg 270deg, #059669 270deg 360deg)")

  //- Tokens layer
  div(class="pointer-events-none absolute inset-0")
    div(class="pointer-events-auto contents")
      Token(
        v-for="t in tokens" :key="t.key"
        :color="t.color" :row="t.row" :col="t.col"
        :stackIndex="t.stackIndex" :stackCount="t.stackCount"
        :movable="t.movable" :captured="t.captured" :stepMs="STEP_MS"
        @move="$emit('move', t.tokenIndex)"
      )
</template>

<script setup>
import { computed, reactive, ref, watch } from 'vue';
import { YARDS, classifyCell, cellOf, toProgress, fromProgress } from '@/utils/boardMap';
import HomeBase from './HomeBase.vue';
import BoardCell from './BoardCell.vue';
import Token from './Token.vue';

const props = defineProps({
  players: { type: Array, default: () => [] },
  currentSeat: { type: Number, default: null },
  mySeat: { type: Number, default: null },
  availableMoves: { type: Array, default: () => [] },
  isMyTurn: { type: Boolean, default: false },
  phase: { type: String, default: null },
});
defineEmits(['move']);

const STEP_MS = 150;
const centerStyle = { gridRow: '7 / span 3', gridColumn: '7 / span 3' };

// All cross cells (the plus shape minus the 3×3 center).
const crossCells = computed(() => {
  const cells = [];
  for (let row = 0; row < 15; row++) {
    for (let col = 0; col < 15; col++) {
      const inCross = (row >= 6 && row <= 8) || (col >= 6 && col <= 8);
      const inCenter = row >= 6 && row <= 8 && col >= 6 && col <= 8;
      if (!inCross || inCenter) continue;
      const info = classifyCell(row, col);
      if (info) cells.push({ row, col, info });
    }
  }
  return cells;
});

// ── Token hop animation ──────────────────────────────────────────────
// `display` holds the position each token is currently *shown* at; it lags the
// authoritative state and steps cell-by-cell toward it.
const display = reactive({}); // key -> encoded pos
const captureAnim = reactive({}); // key -> bool (flash while returning to base)
const animating = ref(0);
const keyOf = (color, i) => `${color}-${i}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function stepsBetween(color, fromPos, toPos) {
  if (fromPos === -1 || toPos === -1) return [toPos]; // exit base / captured → single move
  const fromP = toProgress(color, fromPos);
  const toP = toPos === 999 ? 57 : toProgress(color, toPos);
  if (toP <= fromP) return [toPos];
  const out = [];
  for (let p = fromP + 1; p <= toP; p++) out.push(fromProgress(color, p));
  return out;
}

async function animateToken(key, color, fromPos, toPos) {
  animating.value++;
  try {
    if (toPos === -1 && fromPos !== -1) {
      // Captured: let the capturing token land first, then hop home with a flash.
      captureAnim[key] = true;
      await sleep(STEP_MS * 2);
      display[key] = -1;
      await sleep(STEP_MS);
      captureAnim[key] = false;
    } else {
      for (const pos of stepsBetween(color, fromPos, toPos)) {
        display[key] = pos;
        await sleep(STEP_MS);
      }
      display[key] = toPos;
    }
  } finally {
    animating.value--;
  }
}

// Drive animations from authoritative state changes.
watch(
  () => props.players,
  (players) => {
    for (const p of players) {
      p.tokens.forEach((pos, i) => {
        const k = keyOf(p.color, i);
        if (!(k in display)) {
          display[k] = pos; // first render — no animation
        } else if (display[k] !== pos) {
          animateToken(k, p.color, display[k], pos);
        }
      });
    }
  },
  { deep: true, immediate: true }
);

// Build render descriptors from the *displayed* positions, with per-cell stacking.
const tokens = computed(() => {
  const list = [];
  const settled = animating.value === 0;
  for (const p of props.players) {
    p.tokens.forEach((pos, tokenIndex) => {
      const key = keyOf(p.color, tokenIndex);
      const shown = key in display ? display[key] : pos;
      const [row, col] = cellOf(p.color, shown, tokenIndex);
      const movable =
        settled &&
        props.isMyTurn &&
        props.phase === 'moving' &&
        p.seat === props.mySeat &&
        props.availableMoves.includes(tokenIndex);
      list.push({ key, color: p.color, tokenIndex, row, col, movable, captured: !!captureAnim[key] });
    });
  }
  const byCell = {};
  for (const t of list) (byCell[`${t.row},${t.col}`] ||= []).push(t);
  for (const group of Object.values(byCell)) {
    group.forEach((t, i) => {
      t.stackIndex = i;
      t.stackCount = group.length;
    });
  }
  return list;
});
</script>
