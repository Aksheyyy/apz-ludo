<template lang="pug">
div(class="flex flex-col items-center gap-2")
  button(class="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-white shadow-md transition"
    :class="{ 'animate-dice': rolling, 'opacity-40 cursor-not-allowed': !enabled, 'hover:shadow-lg cursor-pointer': enabled }"
    :style="glowStyle"
    :disabled="!enabled"
    @click="$emit('roll')"
  )
    //- Show pip face: cycle through random values while rolling, show result when done
    div(class="grid h-10 w-10 grid-cols-3 grid-rows-3 gap-0.5" v-if="showFace")
      span(class="flex items-center justify-center" v-for="i in 9" :key="i")
        span(class="h-2 w-2 rounded-full bg-slate-800" v-if="displayPips.includes(i)")
    span(class="text-xl text-slate-300" v-else) 🎲
  span(class="text-xs font-medium" :style="hintStyle") {{ hint }}
</template>

<script setup>
import { computed, ref, watch } from 'vue';

const props = defineProps({
  value: { type: Number, default: null },
  enabled: { type: Boolean, default: false },
  rolling: { type: Boolean, default: false },
  // Hex color of whoever's turn it is — used to glow the dice in their color.
  activeColor: { type: String, default: null },
});
defineEmits(['roll']);

const PIPS = {
  1: [5],
  2: [3, 7],
  3: [3, 5, 7],
  4: [1, 3, 7, 9],
  5: [1, 3, 5, 7, 9],
  6: [1, 3, 4, 6, 7, 9],
};

// Cycle through random faces at ~80 ms intervals while rolling so the dice
// appears to tumble through values before landing on the final result.
const rollingFace = ref(1);

watch(
  () => props.rolling,
  (rolling, _prev, onCleanup) => {
    if (!rolling) return;
    const interval = setInterval(() => {
      rollingFace.value = Math.ceil(Math.random() * 6);
    }, 80);
    onCleanup(() => clearInterval(interval));
  }
);

const pips = computed(() => PIPS[props.value] || []);
const displayPips = computed(() => PIPS[props.rolling ? rollingFace.value : props.value] || []);
const showFace = computed(() => !!(props.value || props.rolling));
const hint = computed(() => {
  if (props.rolling) return 'Rolling…';
  if (props.enabled) return 'Tap to roll';
  return '';
});

// Ring + soft glow in the active player's color so it's obvious whose turn it
// is right at the dice. Falls back to a neutral ring when no color is set.
const glowStyle = computed(() => {
  const c = props.activeColor;
  if (!c) return { boxShadow: '0 0 0 1px #e2e8f0' };
  return { boxShadow: `0 0 0 3px ${c}, 0 0 16px 2px ${c}88` };
});
const hintStyle = computed(() => (props.activeColor ? { color: props.activeColor } : { color: '#64748b' }));
</script>
