<template lang="pug">
div(
  class="flex items-center gap-2 rounded-full border px-3 py-1.5 shadow-sm animate-turn transition-colors duration-300"
  :class="containerClass"
  :style="glowStyle"
)
  span(class="h-3 w-3 rounded-full flex-shrink-0" :class="dotClass")
  span(class="text-sm font-semibold" :class="labelClass") {{ label }}
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  color: { type: String, default: null },
  isMine: { type: Boolean, default: false },
  name: { type: String, default: '' },
});

// Per-color styling. Class strings must be complete literals so Tailwind JIT
// picks them up during its content scan.
const COLOR_CONFIG = {
  red:    { border: 'border-player-red',    bg: 'bg-rose-50',    text: 'text-player-red',    dot: 'bg-player-red',    glow: 'rgba(225,29,72,0.35)'  },
  green:  { border: 'border-player-green',  bg: 'bg-emerald-50', text: 'text-player-green',  dot: 'bg-player-green',  glow: 'rgba(5,150,105,0.35)'  },
  yellow: { border: 'border-player-yellow', bg: 'bg-amber-50',   text: 'text-player-yellow', dot: 'bg-player-yellow', glow: 'rgba(217,119,6,0.35)'  },
  blue:   { border: 'border-player-blue',   bg: 'bg-sky-50',     text: 'text-player-blue',   dot: 'bg-player-blue',   glow: 'rgba(2,132,199,0.35)'  },
};
const FALLBACK = { border: 'border-slate-200', bg: 'bg-white', text: 'text-slate-700', dot: 'bg-slate-300', glow: 'rgba(79,70,229,0.35)' };

const cfg = computed(() => COLOR_CONFIG[props.color] || FALLBACK);
const containerClass = computed(() => `${cfg.value.border} ${cfg.value.bg}`);
const labelClass = computed(() => cfg.value.text);
const dotClass = computed(() => cfg.value.dot);
const glowStyle = computed(() => ({ '--glow-color': cfg.value.glow }));
const label = computed(() => (props.isMine ? 'Your turn' : `${props.name || props.color}'s turn`));
</script>
