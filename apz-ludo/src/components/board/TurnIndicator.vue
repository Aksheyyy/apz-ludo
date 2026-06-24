<template lang="pug">
div(class="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 shadow-sm py-1.5")
  span(class="h-3 w-3 rounded-full" :class="dotClass")
  span(class="text-sm font-medium text-slate-700") {{ label }}
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  color: { type: String, default: null },
  isMine: { type: Boolean, default: false },
  name: { type: String, default: '' },
});

const dotClass = computed(
  () =>
    ({
      red: 'bg-player-red',
      green: 'bg-player-green',
      yellow: 'bg-player-yellow',
      blue: 'bg-player-blue',
    })[props.color] || 'bg-slate-300'
);
const label = computed(() => (props.isMine ? 'Your turn' : `${props.name || props.color}'s turn`));
</script>
