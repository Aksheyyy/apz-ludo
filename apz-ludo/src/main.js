import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import router from './router';
import { useAuthStore } from './stores/auth';
import './assets/styles/main.css';

const app = createApp(App);
app.use(createPinia());
app.use(router);

// Restore session before the first navigation so the router guard sees the real
// auth state (an invalid/expired token is cleared by bootstrap → fetchMe).
const auth = useAuthStore();
auth.bootstrap().finally(() => {
  app.mount('#app');
});
