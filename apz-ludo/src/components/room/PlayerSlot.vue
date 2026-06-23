<template lang="pug">
.flex.items-center.gap-3.rounded-xl.border.p-3(:class="player ? 'border-slate-200 bg-white' : 'border-dashed border-slate-200 bg-slate-50'")
  span.h-4.w-4.rounded-full(:class="player ? dotClass : 'bg-slate-200'")
  template(v-if="player")
    span.text-sm.font-medium.text-slate-800 {{ player.username }}
    span.ml-auto.text-xs.text-slate-400(v-if="isCreator") host
  span.text-sm.text-slate-400(v-else) Waiting for player…
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  player: { type: Object, default: null },
  creatorId: { type: Number, default: null },
});

const dotClass = computed(
  () =>
    ({
      red: 'bg-player-red',
      green: 'bg-player-green',
      yellow: 'bg-player-yellow',
      blue: 'bg-player-blue',
    })[props.player?.color] || 'bg-slate-300'
);
const isCreator = computed(() => props.player && props.player.userId === props.creatorId);
</script>
