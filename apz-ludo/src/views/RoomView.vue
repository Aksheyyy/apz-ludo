<template lang="pug">
.mx-auto.max-w-xl.px-4.py-12
  BaseCard
    .flex.items-start.justify-between
      div
        h1.text-xl.font-semibold.text-slate-900 Waiting room
        p.mt-1.text-sm.text-slate-500 Room code
          span.ml-1.font-mono.font-semibold.text-slate-800 {{ roomId }}
      .text-right(v-if="showCountdown")
        p.text-xs.text-slate-400 Expires in
        p.font-mono.text-lg.font-semibold(:class="remaining < 60 ? 'text-rose-600' : 'text-slate-700'") {{ label }}

    .mt-6
      p.mb-2.text-sm.font-medium.text-slate-700 Players ({{ players.length }}/4)
      PlayerList(:players="players" :creatorId="room.current?.creatorId")

    .mt-6(v-if="shareUrl")
      p.mb-2.text-sm.font-medium.text-slate-700 Invite link
      ShareLink(:url="shareUrl")

    p.mt-4.text-sm.text-rose-600(v-if="error") {{ error }}

    .mt-6.flex.gap-3
      BaseButton(variant="secondary" @click="leave") Leave
      BaseButton(
        v-if="room.isCreator"
        :disabled="players.length < 2"
        @click="start"
      ) {{ players.length < 2 ? 'Need 2+ players' : 'Start game' }}
      p.self-center.text-sm.text-slate-400(v-else) Waiting for host to start…
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

// Navigate everyone into the game when it starts.
function onGameStarted() {
  router.push({ name: 'game', params: { id: roomId } });
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
  getSocket()?.on('game:started', onGameStarted);
  if (room.current?.expiresAt) startCountdown(room.current.expiresAt);
});

watch(
  () => room.current?.expiresAt,
  (v) => v && showCountdown.value && startCountdown(v)
);
watch(() => room.expired, (v) => v && (error.value = 'This room expired.'));
watch(() => room.closed, (v) => v && router.push('/lobby'));

onUnmounted(() => {
  stopCountdown();
  getSocket()?.off('game:started', onGameStarted);
});
</script>
