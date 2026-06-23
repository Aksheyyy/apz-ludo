<template lang="pug">
div(class="rounded-2xl border border-slate-200 bg-white shadow-sm" :class="padding")
  slot
</template>

<script setup>
defineProps({
  padding: { type: String, default: 'p-6' },
});
</script>
