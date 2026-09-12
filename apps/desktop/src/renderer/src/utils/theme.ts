import { computed } from 'vue'
import type { ComputedRef } from 'vue'
import { useColorMode } from '@vueuse/core'

export type AppColorMode = 'auto' | 'light' | 'dark'

/** 浅色/深色/跟随系统：与 Nuxt UI 内置的 useDark 使用同一 storage key，状态互通 */
export function useAppColorMode(): {
  isDark: ComputedRef<boolean>
  preference: ComputedRef<AppColorMode>
  setMode: (mode: AppColorMode) => void
  toggle: () => void
} {
  const colorMode = useColorMode()
  const isDark = computed(() => colorMode.value === 'dark')
  const preference = computed(() => colorMode.store.value as AppColorMode)

  function setMode(mode: AppColorMode): void {
    colorMode.store.value = mode
  }

  function toggle(): void {
    setMode(isDark.value ? 'light' : 'dark')
  }

  return { isDark, preference, setMode, toggle }
}
