<template lang="pug">
transition(name="fade")
  .fixed.inset-0.z-50.flex.items-center.justify-center.p-4(v-if="modelValue")
    .absolute.inset-0.backdrop-blur-sm(class="bg-slate-900/60" @click="closeable && $emit('update:modelValue', false)")
    .relative.w-full.max-w-md.rounded-2xl.border.border-slate-200.bg-white.p-6.shadow-xl
      h3.text-lg.font-semibold.text-slate-900(v-if="title") {{ title }}
      .mt-3
        slot
</template>

<script setup>
defineProps({
  modelValue: { type: Boolean, default: false },
  title: { type: String, default: '' },
  closeable: { type: Boolean, default: true },
});
defineEmits(['update:modelValue']);
</script>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
