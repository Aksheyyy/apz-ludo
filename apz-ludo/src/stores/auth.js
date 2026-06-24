import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import api from '@/services/api';
import { connectSocket, disconnectSocket } from '@/services/socket';

export const useAuthStore = defineStore('auth', () => {
  const token = ref(localStorage.getItem('token') || null);
  const user = ref(null);

  const isAuthenticated = computed(() => !!token.value);

  function setSession(newToken, newUser) {
    token.value = newToken;
    user.value = newUser;
    localStorage.setItem('token', newToken);
    connectSocket(newToken);
  }

  async function register(username, password) {
    const { data } = await api.post('/auth/register', { username, password });
    setSession(data.token, data.user);
  }

  async function login(username, password) {
    const { data } = await api.post('/auth/login', { username, password });
    setSession(data.token, data.user);
  }

  async function fetchMe() {
    const { data } = await api.get('/auth/me');
    user.value = data.user;
  }

  /** Called on app boot: if we have a token, reconnect the socket and load the user. */
  async function bootstrap() {
    if (!token.value) return;
    connectSocket(token.value);
    try {
      await fetchMe();
    } catch {
      logout(); // token invalid/expired
    }
  }

  function logout() {
    token.value = null;
    user.value = null;
    localStorage.removeItem('token');
    disconnectSocket();
  }

  return { token, user, isAuthenticated, register, login, fetchMe, bootstrap, logout };
});
