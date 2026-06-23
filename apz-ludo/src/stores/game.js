import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { getSocket } from '@/services/socket';
import { useAuthStore } from './auth';

export const useGameStore = defineStore('game', () => {
  const state = ref(null); // authoritative board state from the server
  const availableMoves = ref([]); // token indexes the current player may move
  const winner = ref(null); // { winnerSeat, winnerUserId, reason? }
  const lastCapture = ref(null); // for capture animation
  const rolling = ref(false); // local dice animation flag
  const notice = ref(''); // transient message (e.g. "green left the game")

  const mySeat = computed(() => {
    const auth = useAuthStore();
    if (!state.value || !auth.user) return null;
    const me = state.value.players.find((p) => p.userId === auth.user.id);
    return me ? me.seat : null;
  });
  const isMyTurn = computed(
    () => state.value && mySeat.value !== null && state.value.currentSeat === mySeat.value
  );
  const phase = computed(() => state.value?.phase ?? null);
  const currentColor = computed(() => {
    if (!state.value) return null;
    return state.value.players.find((p) => p.seat === state.value.currentSeat)?.color ?? null;
  });

  function bindSocket() {
    const socket = getSocket();
    if (!socket) return;
    for (const ev of [
      'game:started', 'game:state', 'dice:rolled', 'moves:available',
      'turn:changed', 'token:captured', 'game:over', 'player:left',
    ]) {
      socket.off(ev);
    }

    socket.on('game:started', ({ state: s }) => {
      state.value = s;
      winner.value = null;
      availableMoves.value = [];
    });
    socket.on('game:state', ({ state: s }) => {
      state.value = s;
      availableMoves.value = []; // cleared until next roll
      rolling.value = false;
    });
    socket.on('dice:rolled', ({ value }) => {
      if (state.value) state.value.lastDice = value;
      rolling.value = false;
    });
    socket.on('moves:available', ({ tokenIndexes }) => {
      availableMoves.value = tokenIndexes;
      // The server moved us to the 'moving' phase but only told us (not opponents,
      // for anti-cheat). Reflect it locally so moveToken() is allowed.
      if (state.value) state.value.phase = 'moving';
    });
    socket.on('turn:changed', ({ currentSeat }) => {
      if (state.value) {
        state.value.currentSeat = currentSeat;
        state.value.phase = 'rolling';
        state.value.lastDice = null;
      }
      availableMoves.value = [];
      rolling.value = false;
    });
    socket.on('token:captured', (payload) => {
      lastCapture.value = { ...payload, at: Date.now() };
    });
    socket.on('player:left', ({ color }) => {
      notice.value = `${color} left the game`;
    });
    socket.on('game:over', (payload) => {
      winner.value = payload;
      if (state.value) state.value.phase = 'finished';
    });
  }

  function startGame(roomId) {
    getSocket()?.emit('game:start', { roomId });
  }
  function rollDice(roomId) {
    if (!isMyTurn.value || phase.value !== 'rolling') return;
    rolling.value = true;
    getSocket()?.emit('dice:roll', { roomId });
  }
  function moveToken(roomId, tokenIndex) {
    if (!isMyTurn.value || phase.value !== 'moving') return;
    if (!availableMoves.value.includes(tokenIndex)) return;
    getSocket()?.emit('token:move', { roomId, tokenIndex });
  }
  function leaveGame(roomId) {
    getSocket()?.emit('game:leave', { roomId });
  }

  function reset() {
    state.value = null;
    availableMoves.value = [];
    winner.value = null;
    lastCapture.value = null;
    rolling.value = false;
    notice.value = '';
  }

  return {
    state, availableMoves, winner, lastCapture, rolling, notice,
    mySeat, isMyTurn, phase, currentColor,
    bindSocket, startGame, rollDice, moveToken, leaveGame, reset,
  };
});
