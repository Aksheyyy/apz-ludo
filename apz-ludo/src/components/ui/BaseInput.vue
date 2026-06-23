<template lang="pug">
label.block
  span.mb-1.block.text-sm.font-medium.text-slate-700(v-if="label") {{ label }}
  input.w-full.rounded-xl.border.border-slate-200.bg-white.px-3.py-2.text-sm.text-slate-900.shadow-sm.transition(
    class="placeholder:text-slate-400 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
    :type="type"
    :value="modelValue"
    :placeholder="placeholder"
    :autocomplete="autocomplete"
    @input="$emit('update:modelValue', $event.target.value)"
  )
</template>

<script setup>
defineProps({
  modelValue: { type: String, default: '' },
  label: { type: String, default: '' },
  type: { type: String, default: 'text' },
  placeholder: { type: String, default: '' },
  autocomplete: { type: String, default: 'off' },
});
defineEmits(['update:modelValue']);
</script>
