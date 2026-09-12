import { computed } from 'vue'
import type { ComputedRef } from 'vue'
import { useColorMode } from '@vueuse/core'

/** 浅色/深色模式：与 Nuxt UI 内置的 useDark 使用同一 storage key，状态互通 */
export function useAppColorMode(): { isDark: ComputedRef<boolean>; toggle: () => void } {
  const colorMode = useColorMode()
  const isDark = computed(() => colorMode.value === 'dark')

  function toggle(): void {
    colorMode.value = isDark.value ? 'light' : 'dark'
  }

  return { isDark, toggle }
}
