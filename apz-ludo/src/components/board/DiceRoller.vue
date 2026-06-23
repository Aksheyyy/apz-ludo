<template lang="pug">
.flex.flex-col.items-center.gap-2
  button.relative.flex.h-16.w-16.items-center.justify-center.rounded-2xl.bg-white.shadow-md.ring-1.ring-slate-200.transition(
    :class="{ 'animate-dice': rolling, 'opacity-40 cursor-not-allowed': !enabled, 'hover:shadow-lg cursor-pointer': enabled }"
    :disabled="!enabled"
    @click="$emit('roll')"
  )
    //- Pip faces
    .grid.h-10.w-10.grid-cols-3.grid-rows-3(class="gap-0.5" v-if="value")
      span.flex.items-center.justify-center(v-for="i in 9" :key="i")
        span.h-2.w-2.rounded-full.bg-slate-800(v-if="pips.includes(i)")
    span.text-xl.text-slate-300(v-else) 🎲
  span.text-xs.font-medium.text-slate-500 {{ hint }}
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  value: { type: Number, default: null },
  enabled: { type: Boolean, default: false },
  rolling: { type: Boolean, default: false },
});
defineEmits(['roll']);

// Pip positions for faces 1..6 in a 3×3 grid (cells 1..9).
const PIPS = {
  1: [5],
  2: [3, 7],
  3: [3, 5, 7],
  4: [1, 3, 7, 9],
  5: [1, 3, 5, 7, 9],
  6: [1, 3, 4, 6, 7, 9],
};
const pips = computed(() => PIPS[props.value] || []);
const hint = computed(() => {
  if (props.rolling) return 'Rolling…';
  if (props.enabled) return 'Tap to roll';
  return '';
});
</script>
