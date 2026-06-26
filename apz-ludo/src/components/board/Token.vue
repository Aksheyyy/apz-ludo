<template lang="pug">
button(
  class="absolute flex items-center justify-center transition-all ease-in-out"
  :class="[{ 'cursor-pointer': movable, 'cursor-default': !movable, 'animate-capture': captured }]"
  :style="style"
  :disabled="!movable"
  @click="$emit('move')"
)
  //- Rotation wrapper: counter-rotates the board's rotation so the pin always
  //- points up. Kept separate from the bob animation (on the SVG) so the two
  //- transforms compose instead of overriding each other.
  div(class="flex h-full w-full items-center justify-center" :style="rotateStyle")
    svg(
      viewBox="0 0 32 32" fill="currentColor"
      class="h-full w-full"
      :class="[colorText, { 'animate-bob': movable }]"
      :style="svgStyle"
    )
      path(d="M4 12q0-3.264 1.6-6.016t4.384-4.352 6.016-1.632 6.016 1.632 4.384 4.352 1.6 6.016q0 1.376-0.672 3.2t-1.696 3.68-2.336 3.776-2.56 3.584-2.336 2.944-1.728 2.080l-0.672 0.736q-0.256-0.256-0.672-0.768t-1.696-2.016-2.368-3.008-2.528-3.52-2.368-3.84-1.696-3.616-0.672-3.232zM8 12q0 3.328 2.336 5.664t5.664 2.336 5.664-2.336 2.336-5.664-2.336-5.632-5.664-2.368-5.664 2.368-2.336 5.632z")
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  color: { type: String, required: true },
  row: { type: Number, required: true },
  col: { type: Number, required: true },
  stackIndex: { type: Number, default: 0 },
  stackCount: { type: Number, default: 1 },
  movable: { type: Boolean, default: false },
  captured: { type: Boolean, default: false },
  stepMs: { type: Number, default: 150 },
  // Counter-rotate the SVG by the board rotation so pins always point upward.
  counterRotate: { type: Number, default: 0 },
  finished: { type: Boolean, default: false },
});
defineEmits(['move']);

const colorText = computed(
  () =>
    ({
      red: 'text-player-red',
      green: 'text-player-green',
      yellow: 'text-player-yellow',
      blue: 'text-player-blue',
    })[props.color]
);

// When several tokens share a cell, lay them out in a small cluster (as a
// fraction of one cell) instead of piling them on the same spot. Returns
// [dx, dy] offsets in cell-fractions.
function clusterOffset(index, count, finished = false) {
  if (count <= 1) return [0, 0];
  const s = finished ? 0.14 : 0.24; // spread, as a fraction of a cell
  if (count === 2) return index === 0 ? [-s, 0] : [s, 0];
  // 3 or 4 tokens → 2×2 grid
  const grid = [[-s, -s], [s, -s], [-s, s], [s, s]];
  return grid[index % 4];
}

// Position the pin over its grid cell (each cell = 1/15 of the board). Tokens
// sharing a cell are shrunk and spread into a cluster so each stays readable.
const style = computed(() => {
  const unit = 100 / 15;
  const stacked = props.stackCount > 1;
  const size = props.finished
    ? (stacked ? 40 : 64)
    : (stacked ? 54 : 84);
  const pad = (100 - size) / 2;
  const [dx, dy] = clusterOffset(props.stackIndex, props.stackCount, props.finished);
  return {
    left: `calc(${props.col * unit}% + ${pad / 15}% + ${dx * unit}%)`,
    top: `calc(${props.row * unit}% + ${pad / 15}% + ${dy * unit}%)`,
    width: `${(unit * size) / 100}%`,
    height: `${(unit * size) / 100}%`,
    transitionDuration: `${props.stepMs}ms`,
    zIndex: 10 + props.stackIndex + (props.movable ? 20 : 0),
  };
});

// Counter-rotate so the pin always points up regardless of board rotation.
// On the wrapper (not the SVG) so it doesn't clash with the bob animation.
const rotateStyle = computed(() => ({
  transform: props.counterRotate ? `rotate(${-props.counterRotate}deg)` : undefined,
}));

const svgStyle = computed(() => ({
  filter: props.movable
    ? 'drop-shadow(0 0 3px rgba(15,23,42,0.55))'
    : 'drop-shadow(0 1px 1px rgba(15,23,42,0.35))',
}));
</script>
