<template lang="pug">
button(
  class="absolute flex items-center justify-center transition-all ease-in-out"
  :class="[{ 'cursor-pointer': movable, 'cursor-default': !movable, 'animate-capture': captured }]"
  :style="style"
  :disabled="!movable"
  @click="$emit('move')"
)
  svg(
    viewBox="0 0 32 32" fill="currentColor"
    class="h-full w-full"
    :class="[colorText, { 'animate-bob': movable }]"
    :style="movable ? 'filter: drop-shadow(0 0 3px rgba(15,23,42,0.55))' : 'filter: drop-shadow(0 1px 1px rgba(15,23,42,0.35))'"
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

// Position the pin over its grid cell (each cell = 1/15 of the board), nudged
// when several tokens share a cell so they don't fully overlap.
const style = computed(() => {
  const unit = 100 / 15;
  const size = 84; // pin is taller/narrower; a bit bigger than the old dot
  const pad = (100 - size) / 2;
  const nudge = props.stackCount > 1 ? (props.stackIndex - (props.stackCount - 1) / 2) * 0.9 : 0;
  return {
    left: `calc(${props.col * unit}% + ${pad / 15}% + ${nudge}%)`,
    top: `calc(${props.row * unit}% + ${pad / 15}% + ${nudge}%)`,
    width: `${(unit * size) / 100}%`,
    height: `${(unit * size) / 100}%`,
    transitionDuration: `${props.stepMs}ms`,
    zIndex: 10 + props.stackIndex + (props.movable ? 20 : 0),
  };
});
</script>
