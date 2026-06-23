<template lang="pug">
div(class="border border-slate-200" :style="gridStyle" :class="cellClass")
  span(class="flex h-full w-full items-center justify-center text-slate-300" v-if="info.isSafe && !info.isStart")
    span(class="text-[10px]") ★
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  row: { type: Number, required: true },
  col: { type: Number, required: true },
  info: { type: Object, required: true }, // from classifyCell
});

const gridStyle = computed(() => ({
  gridRow: props.row + 1,
  gridColumn: props.col + 1,
}));

// Track cells are white; start cells + home columns take the player tint.
const tint = {
  red: 'bg-player-red/80',
  green: 'bg-player-green/80',
  yellow: 'bg-player-yellow/80',
  blue: 'bg-player-blue/80',
};
const homeTint = {
  red: 'bg-player-red/30',
  green: 'bg-player-green/30',
  yellow: 'bg-player-yellow/30',
  blue: 'bg-player-blue/30',
};

const cellClass = computed(() => {
  if (props.info.kind === 'home') return homeTint[props.info.color];
  if (props.info.isStart) return tint[props.info.color];
  return 'bg-white';
});
</script>
