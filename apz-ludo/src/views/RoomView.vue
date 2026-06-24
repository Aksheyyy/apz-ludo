<template lang="pug">
div(class="mx-auto max-w-xl px-4 py-12")
  BaseCard
    div(class="flex items-start justify-between")
      div
        h1(class="text-xl font-semibold text-slate-900") Waiting room
        p(class="mt-1 text-sm text-slate-500") Room code
          span(class="ml-1 font-mono font-semibold text-slate-800") {{ roomId }}
      div(class="text-right" v-if="showCountdown")
        p(class="text-xs text-slate-400") Expires in
        p(class="font-mono text-lg font-semibold" :class="remaining < 60 ? 'text-rose-600' : 'text-slate-700'") {{ label }}

    div(class="mt-6")
      p(class="mb-2 text-sm font-medium text-slate-700") Players ({{ players.length }}/4)
      PlayerList(:players="players" :creatorId="room.current?.creatorId")

    div(class="mt-6" v-if="shareUrl")
      p(class="mb-2 text-sm font-medium text-slate-700") Invite link
      ShareLink(:url="shareUrl")

    p(class="mt-4 text-sm text-rose-600" v-if="error") {{ error }}

    div(class="mt-6 flex gap-3")
      BaseButton(variant="secondary" @click="leave") Leave
      BaseButton(
        v-if="room.isCreator"
        :disabled="players.length < 2"
        @click="start"
      ) {{ players.length < 2 ? 'Need 2+ players' : 'Start game' }}
      p(class="self-center text-sm text-slate-400" v-else) Waiting for host to start…
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useRoomStore } from '@/stores/room';
import { useGameStore } from '@/stores/game';
import { getSocket } from '@/services/socket';
import { useCountdown } from '@/composables/useCountdown';
import BaseCard from '@/components/ui/BaseCard.vue';
import BaseButton from '@/components/ui/BaseButton.vue';
import PlayerList from '@/components/room/PlayerList.vue';
import ShareLink from '@/components/room/ShareLink.vue';

const route = useRoute();
const router = useRouter();
const room = useRoomStore();
const game = useGameStore();
const { remaining, label, start: startCountdown, stop: stopCountdown } = useCountdown();

const roomId = route.params.id;
const error = ref('');

const players = computed(() => room.players);
const showCountdown = computed(() => players.value.length < 2 && room.current?.status === 'waiting');
const shareUrl = computed(() => `${window.location.origin}/join/${roomId}`);

function start() {
  game.startGame(roomId);
}

async function leave() {
  try {
    await room.leaveRoom(roomId);
  } catch {
    /* ignore */
  }
  router.push('/lobby');
}

function goToGame() {
  router.push({ name: 'game', params: { id: roomId } });
}
// Re-subscribe after a socket reconnect (transient drop / 8s grace).
function onReconnect() {
  room.subscribe(roomId);
}

onMounted(async () => {
  room.bindSocket();
  game.bindSocket();
  try {
    await room.loadRoom(roomId);
  } catch (e) {
    error.value = e.message;
  }
  room.subscribe(roomId);
  const socket = getSocket();
  socket?.on('game:started', goToGame);
  socket?.on('connect', onReconnect);
  // If the game is already running (e.g. we arrived late), go straight in.
  if (room.current?.status === 'playing') goToGame();
  else if (room.current?.expiresAt) startCountdown(room.current.expiresAt);
});

watch(
  () => room.current?.expiresAt,
  (v) => v && showCountdown.value && startCountdown(v)
);
// Robustness: navigate on status flip too, in case game:started was missed.
watch(() => room.current?.status, (s) => s === 'playing' && goToGame());
watch(() => room.expired, (v) => v && (error.value = 'This room expired.'));
watch(() => room.closed, (v) => v && router.push('/lobby'));

onUnmounted(() => {
  stopCountdown();
  const socket = getSocket();
  socket?.off('game:started', goToGame);
  socket?.off('connect', onReconnect);
});
</script>
