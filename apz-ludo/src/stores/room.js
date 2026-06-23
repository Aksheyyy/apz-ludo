import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import api from '@/services/api';
import { getSocket } from '@/services/socket';
import { useAuthStore } from './auth';

export const useRoomStore = defineStore('room', () => {
  const current = ref(null); // { id, status, creatorId, expiresAt, players: [...] }
  const expired = ref(false);
  const closed = ref(false);

  const players = computed(() => current.value?.players ?? []);
  const isCreator = computed(() => {
    const auth = useAuthStore();
    return current.value && auth.user && current.value.creatorId === auth.user.id;
  });
  const isFull = computed(() => players.value.length >= (current.value?.maxPlayers ?? 4));
  const freeSeats = computed(() => (current.value?.maxPlayers ?? 4) - players.value.length);

  async function createRoom() {
    const { data } = await api.post('/rooms');
    return data; // { roomId, joinUrl, expiresAt }
  }

  async function joinRoom(roomId) {
    const { data } = await api.post(`/rooms/${roomId}/join`);
    current.value = data;
    return data;
  }

  async function loadRoom(roomId) {
    const { data } = await api.get(`/rooms/${roomId}`);
    current.value = data;
    return data;
  }

  async function leaveRoom(roomId) {
    await api.post(`/rooms/${roomId}/leave`);
    current.value = null;
  }

  /** Subscribe this socket to a room and keep `current` in sync with the server. */
  function bindSocket() {
    const socket = getSocket();
    if (!socket) return;
    socket.off('room:state');
    socket.off('room:expired');
    socket.off('room:closed');
    socket.on('room:state', (state) => {
      current.value = state;
    });
    socket.on('room:expired', () => {
      expired.value = true;
    });
    socket.on('room:closed', () => {
      closed.value = true;
    });
  }

  function subscribe(roomId) {
    expired.value = false;
    closed.value = false;
    const socket = getSocket();
    if (socket) socket.emit('room:join', { roomId });
  }

  function reset() {
    current.value = null;
    expired.value = false;
    closed.value = false;
  }

  return {
    current, expired, closed, players, isCreator, isFull, freeSeats,
    createRoom, joinRoom, loadRoom, leaveRoom, bindSocket, subscribe, reset,
  };
});
