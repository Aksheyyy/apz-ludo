<template lang="pug">
div(id="app-shell" class="min-h-screen flex flex-col")
  header(class="border-b border-slate-200 bg-white")
    div(class="mx-auto max-w-5xl px-4 h-14 flex items-center justify-between")
      router-link(class="text-lg font-semibold tracking-tight text-slate-900" to="/")
        span(class="text-indigo-600") APZ
        |  Ludo
      div(class="flex items-center gap-3" v-if="auth.isAuthenticated")
        span(class="text-sm text-slate-500") {{ auth.user?.username }}
        button(class="text-sm text-slate-500 hover:text-slate-900" @click="logout") Sign out
  main(class="flex-1")
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
