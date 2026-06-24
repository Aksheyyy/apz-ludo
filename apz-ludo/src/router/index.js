import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from '@/stores/auth';

const routes = [
  { path: '/', redirect: '/lobby' },
  { path: '/login', name: 'login', component: () => import('@/views/LoginView.vue') },
  { path: '/lobby', name: 'lobby', component: () => import('@/views/LobbyView.vue'), meta: { requiresAuth: true } },
  { path: '/room/:id', name: 'room', component: () => import('@/views/RoomView.vue'), meta: { requiresAuth: true } },
  { path: '/game/:id', name: 'game', component: () => import('@/views/GameView.vue'), meta: { requiresAuth: true } },
  // The shareable link target — auto-joins then redirects into the room.
  { path: '/join/:id', name: 'join', component: () => import('@/views/JoinView.vue'), meta: { requiresAuth: true } },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

router.beforeEach((to) => {
  const auth = useAuthStore();
  if (to.meta.requiresAuth && !auth.isAuthenticated) {
    // Preserve where the user was headed (e.g. a /join/:id link) for after login.
    return { name: 'login', query: { redirect: to.fullPath } };
  }
  if (to.name === 'login' && auth.isAuthenticated) {
    return { name: 'lobby' };
  }
});

export default router;
