<template lang="pug">
.flex.items-center.gap-2.rounded-xl.border.border-slate-200.bg-slate-50.p-2
  input.flex-1.bg-transparent.px-2.text-sm.text-slate-600(class="focus:outline-none" :value="url" readonly)
  BaseButton(size="sm" variant="secondary" @click="copy") {{ copied ? 'Copied!' : 'Copy' }}
</template>

<script setup>
import { ref } from 'vue';
import BaseButton from '@/components/ui/BaseButton.vue';

const props = defineProps({ url: { type: String, required: true } });

const copied = ref(false);
async function copy() {
  try {
    await navigator.clipboard.writeText(props.url);
    copied.value = true;
    setTimeout(() => (copied.value = false), 1500);
  } catch {
    /* clipboard unavailable; ignore */
  }
}
</script>
