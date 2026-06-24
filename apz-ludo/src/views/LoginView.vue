<template lang="pug">
div(class="mx-auto max-w-md px-4 py-16")
  BaseCard
    h1(class="text-xl font-semibold text-slate-900") {{ isRegister ? 'Create your account' : 'Welcome back' }}
    p(class="mt-1 text-sm text-slate-500") {{ isRegister ? 'Pick a username to start playing.' : 'Sign in to play Ludo with friends.' }}

    form(class="mt-6 space-y-4" @submit.prevent="submit")
      BaseInput(v-model="username" label="Username" placeholder="yourname" autocomplete="username")
      BaseInput(v-model="password" label="Password" type="password" placeholder="••••••" autocomplete="current-password")
      p(class="text-sm text-rose-600" v-if="error") {{ error }}
      BaseButton(class="w-full" type="submit" size="lg" :disabled="loading") {{ loading ? 'Please wait…' : (isRegister ? 'Create account' : 'Sign in') }}

    div(class="mt-4 text-center text-sm text-slate-500")
      | {{ isRegister ? 'Already have an account?' : "Don't have an account?" }}
      button(class="ml-1 font-medium text-indigo-600 hover:text-indigo-700" @click="toggle") {{ isRegister ? 'Sign in' : 'Create one' }}
</template>

<script setup>
import { ref } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import BaseCard from '@/components/ui/BaseCard.vue';
import BaseInput from '@/components/ui/BaseInput.vue';
import BaseButton from '@/components/ui/BaseButton.vue';

const auth = useAuthStore();
const router = useRouter();
const route = useRoute();

const isRegister = ref(false);
const username = ref('');
const password = ref('');
const error = ref('');
const loading = ref(false);

function toggle() {
  isRegister.value = !isRegister.value;
  error.value = '';
}

async function submit() {
  error.value = '';
  loading.value = true;
  try {
    if (isRegister.value) await auth.register(username.value, password.value);
    else await auth.login(username.value, password.value);
    router.push(route.query.redirect || '/lobby');
  } catch (e) {
    error.value = e.message || 'Something went wrong.';
  } finally {
    loading.value = false;
  }
}
</script>
