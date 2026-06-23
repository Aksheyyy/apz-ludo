<template lang="pug">
div(class="mx-auto max-w-md px-4 py-24 text-center")
  BaseCard
    p(class="text-slate-600" v-if="!error") Joining room {{ roomId }}…
    template(v-else)
      p(class="font-medium text-rose-600") {{ error }}
      BaseButton(class="mt-4" @click="$router.push('/lobby')") Back to lobby
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useRoomStore } from '@/stores/room';
import BaseCard from '@/components/ui/BaseCard.vue';
import BaseButton from '@/components/ui/BaseButton.vue';

const route = useRoute();
const router = useRouter();
const room = useRoomStore();

const roomId = route.params.id;
const error = ref('');

onMounted(async () => {
  try {
    await room.joinRoom(roomId);
    router.replace({ name: 'room', params: { id: roomId } });
  } catch (e) {
    // Already in the room? Just go there. Otherwise surface the reason.
    if (e.code === 'ALREADY_JOINED') {
      router.replace({ name: 'room', params: { id: roomId } });
    } else if (e.code === 'GAME_ALREADY_STARTED') {
      router.replace({ name: 'game', params: { id: roomId } });
    } else {
      error.value = e.message || 'Could not join this room.';
    }
  }
});
</script>
