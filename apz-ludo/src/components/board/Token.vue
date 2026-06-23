<template lang="pug">
button.absolute.rounded-full.border-2.border-white.shadow-md.transition.duration-300(
  :class="[colorClass, { 'ring-2 ring-offset-1 ring-slate-900 cursor-pointer animate-turn': movable, 'cursor-default': !movable, 'animate-capture': captured }]"
  :style="style"
  :disabled="!movable"
  @click="$emit('move')"
)
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  color: { type: String, required: true },
  // grid cell [row, col]
  row: { type: Number, required: true },
  col: { type: Number, required: true },
  // stacking: index within the same cell + total in that cell
  stackIndex: { type: Number, default: 0 },
  stackCount: { type: Number, default: 1 },
  movable: { type: Boolean, default: false },
  captured: { type: Boolean, default: false },
});
defineEmits(['move']);

const colorClass = computed(
  () =>
    ({
      red: 'bg-player-red',
      green: 'bg-player-green',
      yellow: 'bg-player-yellow',
      blue: 'bg-player-blue',
    })[props.color]
);

// Position the token over its grid cell (cells are 1/15 of the board each),
// with a small offset when several tokens share a cell.
const style = computed(() => {
  const unit = 100 / 15;
  const size = 72; // % of a cell
  const pad = (100 - size) / 2;
  const nudge = props.stackCount > 1 ? (props.stackIndex - (props.stackCount - 1) / 2) * 0.7 : 0;
  return {
    left: `calc(${props.col * unit}% + ${pad / 15}% + ${nudge}%)`,
    top: `calc(${props.row * unit}% + ${pad / 15}% + ${nudge}%)`,
    width: `${(unit * size) / 100}%`,
    height: `${(unit * size) / 100}%`,
    zIndex: 10 + props.stackIndex,
  };
});
</script>
