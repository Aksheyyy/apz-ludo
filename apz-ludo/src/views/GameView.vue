<template lang="pug">
div(class="mx-auto max-w-3xl px-4 py-8")
  template(v-if="game.state")
    div(class="mb-4 flex items-center justify-between")
      div(class="flex items-center gap-3")
        h1(class="text-lg font-semibold text-slate-900") Ludo
        span(class="font-mono text-sm text-slate-400") {{ roomId }}
      div(class="flex items-center gap-3")
        TurnIndicator(:color="game.currentColor" :isMine="game.isMyTurn" :name="currentName")
        BaseButton(variant="ghost" size="sm" @click="confirmLeave = true") Leave

    p(class="mb-3 text-center text-sm text-amber-600" v-if="game.notice") {{ game.notice }}

    div(class="grid gap-6 items-start md:grid-cols-[3fr_1fr]")
      LudoBoard(
        :players="game.state.players"
        :currentSeat="game.state.currentSeat"
        :mySeat="game.mySeat"
        :availableMoves="game.availableMoves"
        :isMyTurn="game.isMyTurn"
        :phase="game.phase"
        @move="move"
      )

      div(class="space-y-4")
        BaseCard(padding="p-4")
          p(class="mb-3 text-xs font-medium uppercase tracking-wide text-slate-400") Players
          div(class="space-y-2")
            div(class="flex items-center gap-2" v-for="p in game.state.players" :key="p.seat" :class="{ 'opacity-40': p.left }")
              span(class="h-3 w-3 rounded-full" :class="dot(p.color)")
              span(class="text-sm font-medium capitalize text-slate-700") {{ p.color }}
              span(class="text-xs text-slate-400" v-if="p.left") (left)
              span(class="ml-auto text-xs text-slate-400") {{ p.finished }}/4

        div(class="flex flex-col items-center gap-2")
          DiceRoller(
            :value="game.state.lastDice"
            :enabled="game.isMyTurn && game.phase === 'rolling'"
            :rolling="game.rolling"
            :activeColor="currentHex"
            @roll="roll"
          )
          //- Turn countdown — only shown during my turn
          div(v-if="game.isMyTurn && game.phase !== 'finished' && timerSecs > 0" class="relative h-10 w-10")
            svg(viewBox="0 0 36 36" class="h-10 w-10 -rotate-90")
              circle(cx="18" cy="18" r="15" fill="none" stroke="#e2e8f0" stroke-width="3")
              circle(cx="18" cy="18" r="15" fill="none" :stroke="timerStroke" stroke-width="3"
                stroke-dasharray="94.25" :stroke-dashoffset="timerDashOffset"
                class="transition-all duration-1000 ease-linear")
            span(class="absolute inset-0 flex items-center justify-center text-xs font-bold" :class="timerTextClass") {{ timerSecs }}

  p(class="py-24 text-center text-slate-500" v-else) Loading game…

  //- Game over
  BaseModal(:modelValue="!!game.winner" title="Game over" :closeable="false")
    p(class="text-slate-600") {{ winText }}
    BaseButton(class="mt-4 w-full" @click="exit") Back to lobby

  //- Room closed due to inactivity
  BaseModal(:modelValue="!!game.aborted && !game.winner" title="Room closed" :closeable="false")
    p(class="text-slate-600") This game was closed after 2 minutes with no moves.
    BaseButton(class="mt-4 w-full" @click="exit") Back to lobby

  //- Leave confirm
  BaseModal(v-model="confirmLeave" title="Leave the game?")
    p(class="text-slate-600") If you leave, you forfeit. The game continues for the others (or ends if you're the last two).
    div(class="mt-4 flex gap-3")
      BaseButton(variant="secondary" @click="confirmLeave = false") Cancel
      BaseButton(variant="danger" @click="leave") Leave
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useGameStore } from '@/stores/game';
import { useAuthStore } from '@/stores/auth';
import { getSocket } from '@/services/socket';
import BaseCard from '@/components/ui/BaseCard.vue';
import BaseButton from '@/components/ui/BaseButton.vue';
import BaseModal from '@/components/ui/BaseModal.vue';
import LudoBoard from '@/components/board/LudoBoard.vue';
import DiceRoller from '@/components/board/DiceRoller.vue';
import TurnIndicator from '@/components/board/TurnIndicator.vue';

const route = useRoute();
const router = useRouter();
const game = useGameStore();
const auth = useAuthStore();
const roomId = route.params.id;

const confirmLeave = ref(false);

// ── Turn timer ───────────────────────────────────────────────────────────────
const TURN_SECS = 30;
const timerSecs = ref(0);

watch(
  [() => game.isMyTurn, () => game.phase],
  ([isMyTurn, phase], _prev, onCleanup) => {
    timerSecs.value = 0;
    if (!isMyTurn || phase === 'finished' || !phase) return;

    timerSecs.value = TURN_SECS;
    const ticker = setInterval(() => {
      timerSecs.value = Math.max(0, timerSecs.value - 1);
    }, 1000);

    onCleanup(() => clearInterval(ticker));
  }
);

const timerStroke = computed(() => {
  if (timerSecs.value > 15) return '#22c55e';
  if (timerSecs.value > 8)  return '#f59e0b';
  return '#ef4444';
});
const timerTextClass = computed(() => {
  if (timerSecs.value > 15) return 'text-green-600';
  if (timerSecs.value > 8)  return 'text-amber-600';
  return 'text-red-600 animate-pulse';
});
// Circumference of r=15 circle ≈ 94.25. dashoffset=0 → full ring; =94.25 → empty.
const timerDashOffset = computed(() => (94.25 * (1 - timerSecs.value / TURN_SECS)).toFixed(2));
// ─────────────────────────────────────────────────────────────────────────────

const dot = (c) =>
  ({ red: 'bg-player-red', green: 'bg-player-green', yellow: 'bg-player-yellow', blue: 'bg-player-blue' })[c];

// Hex equivalents of the player colors (matches tailwind.config.js), used to
// glow the dice in the active player's color.
const COLOR_HEX = { red: '#e11d48', green: '#059669', yellow: '#d97706', blue: '#0284c7' };
const currentHex = computed(() => COLOR_HEX[game.currentColor] || null);

const currentName = computed(
  () => game.state?.players.find((p) => p.seat === game.state.currentSeat)?.color ?? ''
);

const winText = computed(() => {
  if (!game.winner) return '';
  const iWon = game.winner.winnerUserId === auth.user?.id;
  const p = game.state?.players.find((x) => x.seat === game.winner.winnerSeat);
  const base = iWon ? '🎉 You win!' : `${p?.color ?? 'A player'} wins.`;
  return game.winner.reason === 'last-player' ? `${base} Everyone else left.` : base;
});

function roll() {
  game.rollDice(roomId);
}
function move(tokenIndex) {
  game.moveToken(roomId, tokenIndex);
}
function leave() {
  game.leaveGame(roomId);
  confirmLeave.value = false;
  exit();
}
function exit() {
  game.reset();
  router.push('/lobby');
}

function resubscribe() {
  getSocket()?.emit('room:join', { roomId });
}
onMounted(() => {
  game.bindSocket();
  game.setRoom(roomId);
  // Re-subscribe so a refresh / reconnect mid-game re-receives the board.
  resubscribe();
  getSocket()?.on('connect', resubscribe);
});
onUnmounted(() => {
  getSocket()?.off('connect', resubscribe);
});
</script>
