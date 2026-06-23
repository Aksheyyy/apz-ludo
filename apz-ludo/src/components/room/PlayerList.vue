<template lang="pug">
div(class="space-y-2")
  PlayerSlot(v-for="i in maxPlayers" :key="i" :player="players[i - 1] || null" :creatorId="creatorId")
</template>

<script setup>
import PlayerSlot from './PlayerSlot.vue';

defineProps({
  players: { type: Array, default: () => [] },
  maxPlayers: { type: Number, default: 4 },
  creatorId: { type: Number, default: null },
});
</script>
