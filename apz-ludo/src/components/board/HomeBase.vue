<template lang="pug">
.flex.items-center.justify-center(:style="gridStyle" :class="bgClass")
  //- White pad; tokens (rendered in the token layer) sit on top as the 4 dots.
  .rounded-xl.bg-white(class="h-3/4 w-3/4")
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  color: { type: String, required: true },
  row: { type: Number, required: true },
  col: { type: Number, required: true },
});

// Span a 6×6 region of the 15×15 grid.
const gridStyle = computed(() => ({
  gridRow: `${props.row + 1} / span 6`,
  gridColumn: `${props.col + 1} / span 6`,
}));

const bgClass = computed(
  () =>
    ({
      red: 'bg-player-red',
      green: 'bg-player-green',
      yellow: 'bg-player-yellow',
      blue: 'bg-player-blue',
    })[props.color]
);
</script>
