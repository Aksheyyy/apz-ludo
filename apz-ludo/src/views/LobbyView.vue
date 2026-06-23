<template lang="pug">
.mx-auto.max-w-2xl.px-4.py-12
  .text-center
    h1.text-2xl.font-semibold.tracking-tight.text-slate-900 Play Ludo with friends
    p.mt-2.text-slate-500 Create a room and share the link, or join with a code.

  .mt-8.grid.gap-4(class="sm:grid-cols-2")
    BaseCard
      h2.font-semibold.text-slate-900 Create a room
      p.mt-1.text-sm.text-slate-500 You'll get a link to share. Up to 4 players.
      BaseButton.mt-4.w-full(size="lg" :disabled="creating" @click="create") {{ creating ? 'Creating…' : 'Create room' }}

    BaseCard
      h2.font-semibold.text-slate-900 Join a room
      p.mt-1.text-sm.text-slate-500 Enter the 6-character room code.
      .mt-4.flex.gap-2
        BaseInput.flex-1(v-model="code" placeholder="AB12CD")
        BaseButton(size="lg" :disabled="!code || joining" @click="join") Join

  p.mt-4.text-center.text-sm.text-rose-600(v-if="error") {{ error }}
</template>

<script setup>
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useRoomStore } from '@/stores/room';
import BaseCard from '@/components/ui/BaseCard.vue';
import BaseInput from '@/components/ui/BaseInput.vue';
import BaseButton from '@/components/ui/BaseButton.vue';

const room = useRoomStore();
const router = useRouter();

const code = ref('');
const error = ref('');
const creating = ref(false);
const joining = ref(false);

async function create() {
  error.value = '';
  creating.value = true;
  try {
    const { roomId } = await room.createRoom();
    router.push({ name: 'room', params: { id: roomId } });
  } catch (e) {
    error.value = e.message;
  } finally {
    creating.value = false;
  }
}

function join() {
  // Reuse the same auto-join flow as the share link.
  router.push({ name: 'join', params: { id: code.value.trim().toUpperCase() } });
}
</script>
