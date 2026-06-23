import { ref, computed, onUnmounted } from 'vue';

/**
 * Live countdown to a target timestamp. Returns reactive remaining seconds and
 * a mm:ss label. Used for the 5-minute room-expiry timer.
 */
export function useCountdown() {
  const remaining = ref(0);
  let timer = null;

  const label = computed(() => {
    const s = Math.max(0, remaining.value);
    const m = Math.floor(s / 60);
    const sec = String(s % 60).padStart(2, '0');
    return `${m}:${sec}`;
  });

  function start(targetIso) {
    stop();
    const target = new Date(targetIso).getTime();
    const tick = () => {
      remaining.value = Math.max(0, Math.round((target - Date.now()) / 1000));
      if (remaining.value <= 0) stop();
    };
    tick();
    timer = setInterval(tick, 1000);
  }

  function stop() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  onUnmounted(stop);

  return { remaining, label, start, stop };
}
