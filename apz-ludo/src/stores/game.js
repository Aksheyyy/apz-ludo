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
  const aborted = ref(null); // { reason } when the room was closed (e.g. inactivity)
  const roomId = ref(null); // current room, for auto-move

  // Keep the dice tumbling for at least this long so the roll animation is
  // actually visible even when the server replies instantly.
  const ROLL_MIN_MS = 700;
  let rollStartedAt = 0;

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
      'turn:changed', 'token:captured', 'game:over', 'player:left', 'game:abandoned',
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
      // Hold the rolling animation until the minimum duration has elapsed, then
      // reveal the value. This is the single place that ends a roll animation.
      const wait = Math.max(0, ROLL_MIN_MS - (Date.now() - rollStartedAt));
      setTimeout(() => {
        rolling.value = false;
      }, wait);
    });
    socket.on('moves:available', ({ tokenIndexes }) => {
      availableMoves.value = tokenIndexes;
      // The server moved us to the 'moving' phase but only told us (not opponents,
      // for anti-cheat). Reflect it locally so moveToken() is allowed.
      if (state.value) state.value.phase = 'moving';
      // If there's exactly one legal move, play it automatically — but only after
      // the roll animation has finished and the value has been visible for a beat.
      if (tokenIndexes.length === 1 && roomId.value) {
        const only = tokenIndexes[0];
        const wait = Math.max(0, ROLL_MIN_MS - (Date.now() - rollStartedAt)) + 500;
        setTimeout(() => moveToken(roomId.value, only), wait);
      }
    });
    socket.on('turn:changed', ({ currentSeat }) => {
      if (state.value) {
        state.value.currentSeat = currentSeat;
        state.value.phase = 'rolling';
        // Don't clear lastDice immediately — players should see what was rolled
        // before the display resets. Clear after a short delay instead.
      }
      availableMoves.value = [];
      // Don't clear `rolling` here — the dice:rolled handler owns ending the
      // animation, so a no-move roll still gets its full tumble.
      setTimeout(() => {
        // Guard: only clear if the turn hasn't changed again in the meantime.
        if (state.value && state.value.currentSeat === currentSeat) {
          state.value.lastDice = null;
        }
      }, 2000);
    });
    socket.on('token:captured', (payload) => {
      lastCapture.value = { ...payload, at: Date.now() };
    });
    socket.on('player:left', ({ color }) => {
      notice.value = `${color} left the game`;
    });
    socket.on('game:abandoned', (payload) => {
      aborted.value = payload || { reason: 'inactivity' };
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
    rollStartedAt = Date.now();
    getSocket()?.emit('dice:roll', { roomId });
  }
  function moveToken(roomId, tokenIndex) {
    if (!isMyTurn.value || phase.value !== 'moving') return;
    if (!availableMoves.value.includes(tokenIndex)) return;
    getSocket()?.emit('token:move', { roomId, tokenIndex });
  }
  function leaveGame(rid) {
    getSocket()?.emit('game:leave', { roomId: rid });
  }
  function setRoom(rid) {
    roomId.value = rid;
  }

  function reset() {
    state.value = null;
    availableMoves.value = [];
    winner.value = null;
    lastCapture.value = null;
    rolling.value = false;
    notice.value = '';
    aborted.value = null;
  }

  return {
    state, availableMoves, winner, lastCapture, rolling, notice, aborted, roomId,
    mySeat, isMyTurn, phase, currentColor,
    bindSocket, startGame, rollDice, moveToken, leaveGame, setRoom, reset,
  };
});
