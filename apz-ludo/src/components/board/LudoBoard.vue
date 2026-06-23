<template lang="pug">
div(class="relative mx-auto aspect-square w-full max-w-xl overflow-hidden rounded-2xl border border-slate-300 bg-white shadow-sm")
  //- Background grid: 4 corner yards + cross cells + center
  div(class="grid h-full w-full" style="grid-template-columns: repeat(15, 1fr); grid-template-rows: repeat(15, 1fr)")
    HomeBase(v-for="(y, color) in YARDS" :key="color" :color="color" :row="y.row" :col="y.col")
    BoardCell(v-for="cell in crossCells" :key="`${cell.row}-${cell.col}`" :row="cell.row" :col="cell.col" :info="cell.info")
    //- Center pinwheel
    div(class="flex items-center justify-center" :style="centerStyle")
      div(class="rounded-md h-3/4 w-3/4" style="background: conic-gradient(#e11d48 0deg 90deg, #059669 90deg 180deg, #0284c7 180deg 270deg, #d97706 270deg 360deg)")

  //- Tokens layer
  div(class="pointer-events-none absolute inset-0")
    div(class="pointer-events-auto contents")
      Token(
        v-for="t in tokens" :key="t.key"
        :color="t.color" :row="t.row" :col="t.col"
        :stackIndex="t.stackIndex" :stackCount="t.stackCount"
        :movable="t.movable" :captured="t.captured"
        @move="$emit('move', t.tokenIndex)"
      )
</template>

<script setup>
import { computed } from 'vue';
import { YARDS, classifyCell, cellOf } from '@/utils/boardMap';
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
  lastCapture: { type: Object, default: null },
});
defineEmits(['move']);

const centerStyle = { gridRow: '7 / span 3', gridColumn: '7 / span 3' };

// All cross cells (the plus shape minus the 3×3 center) to render as the board.
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

// Flatten every token to a render descriptor, with per-cell stacking.
const tokens = computed(() => {
  const list = [];
  for (const p of props.players) {
    p.tokens.forEach((pos, tokenIndex) => {
      const [row, col] = cellOf(p.color, pos, tokenIndex);
      const movable =
        props.isMyTurn &&
        props.phase === 'moving' &&
        p.seat === props.mySeat &&
        props.availableMoves.includes(tokenIndex);
      list.push({
        key: `${p.color}-${tokenIndex}`,
        color: p.color,
        tokenIndex,
        row,
        col,
        movable,
        captured: false,
      });
    });
  }
  // stacking: group by cell
  const byCell = {};
  for (const t of list) {
    const k = `${t.row},${t.col}`;
    (byCell[k] ||= []).push(t);
  }
  for (const group of Object.values(byCell)) {
    group.forEach((t, i) => {
      t.stackIndex = i;
      t.stackCount = group.length;
    });
  }
  return list;
});
</script>
