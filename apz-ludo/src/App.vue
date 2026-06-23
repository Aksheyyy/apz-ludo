<template lang="pug">
#app-shell.min-h-screen.flex.flex-col
  header.border-b.border-slate-200.bg-white
    .mx-auto.max-w-5xl.px-4.h-14.flex.items-center.justify-between
      router-link.text-lg.font-semibold.tracking-tight.text-slate-900(to="/")
        span.text-indigo-600 APZ
        |  Ludo
      .flex.items-center.gap-3(v-if="auth.isAuthenticated")
        span.text-sm.text-slate-500 {{ auth.user?.username }}
        button.text-sm.text-slate-500(class="hover:text-slate-900" @click="logout") Sign out
  main.flex-1
    router-view
</template>

<script setup>
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';

const auth = useAuthStore();
const router = useRouter();

function logout() {
  auth.logout();
  router.push('/login');
}
</script>
