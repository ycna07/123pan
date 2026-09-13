<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import type { FormError } from '@nuxt/ui'
import type { AuthStatus, QrLoginState } from '@123pan/shared-types'
import { useAppColorMode } from '@renderer/utils/theme'
import QRCode from 'qrcode'

const props = defineProps<{ cancelable?: boolean }>()

const emit = defineEmits<{ authenticated: [status: AuthStatus]; cancel: [] }>()

const { isDark, toggle: toggleColorMode } = useAppColorMode()

const tabItems = [
  { label: '密码登录', slot: 'password' as const, value: 'password' as const },
  { label: 'Cookie 登录', slot: 'cookie' as const, value: 'cookie' as const },
  { label: '扫码登录', slot: 'qr' as const, value: 'qr' as const }
]
const activeTab = ref<'password' | 'cookie' | 'qr'>('password')

const state = reactive({
  passport: '',
  password: ''
})
const cookieText = ref('')
const loading = ref(false)
const errorMessage = ref('')

const qrCanvas = ref<HTMLCanvasElement | null>(null)
const qrUrl = ref('')
const qrStatus = ref<QrLoginState | null>(null)
const qrLoading = ref(false)
const qrStatusText: Record<string, string> = {
  waiting: '等待扫码…',
  scanned: '已扫码，请在手机上确认',
  logging: '已确认，正在登录…',
  cancelled: '登录已取消',
  expired: '二维码已过期'
}

function validate(formState: typeof state): FormError[] {
  const errors: FormError[] = []
  if (!formState.passport.trim()) {
    errors.push({ name: 'passport', message: '请输入账号' })
  }
  if (!formState.password) {
    errors.push({ name: 'password', message: '请输入密码' })
  }
  return errors
}

function loginPassword(): Promise<AuthStatus> {
  return window.api.login({ passport: state.passport.trim(), password: state.password })
}

function loginCookie(): Promise<AuthStatus> {
  return window.api.loginWithCookie(cookieText.value)
}

async function startQrLogin(): Promise<void> {
  qrLoading.value = true
  errorMessage.value = ''
  try {
    const { qrUrl: url } = await window.api.qrStart()
    qrUrl.value = url
    qrStatus.value = { status: 'waiting' }
    await nextTick()
    if (qrCanvas.value) {
      await QRCode.toCanvas(qrCanvas.value, url, { width: 220, margin: 1 })
    }
  } catch (error) {
    stopQrLogin()
    errorMessage.value = error instanceof Error ? error.message : '生成二维码失败，请稍后重试'
  } finally {
    qrLoading.value = false
  }
}

function stopQrLogin(): void {
  if (qrUrl.value) window.api.qrStop()
  qrUrl.value = ''
  qrStatus.value = null
}

watch(activeTab, (tab) => {
  if (tab !== 'qr') stopQrLogin()
})

let removeQrStatusListener: (() => void) | null = null

onMounted(() => {
  removeQrStatusListener = window.api.onQrStatus((qrState) => {
    qrStatus.value = qrState
  })
})

onBeforeUnmount(() => {
  removeQrStatusListener?.()
  stopQrLogin()
})

async function submitLogin(action: () => Promise<AuthStatus>): Promise<void> {
  loading.value = true
  errorMessage.value = ''
  try {
    const status = await action()
    emit('authenticated', status)
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '登录失败，请稍后重试'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="relative flex h-screen items-center justify-center bg-default px-4">
    <UButton
      v-if="props.cancelable"
      icon="i-lucide-arrow-left"
      color="neutral"
      variant="ghost"
      size="sm"
      class="absolute top-4 left-4"
      aria-label="返回"
      @click="emit('cancel')"
    />
    <UButton
      :icon="isDark ? 'i-lucide-sun' : 'i-lucide-moon'"
      color="neutral"
      variant="ghost"
      size="sm"
      class="absolute top-4 right-4"
      :aria-label="isDark ? '切换到浅色模式' : '切换到深色模式'"
      @click="toggleColorMode"
    />
    <div class="w-full max-w-sm rounded-lg border border-default bg-elevated/40 p-8">
      <div class="mb-6 flex flex-col items-center gap-2">
        <UIcon name="i-lucide-cloud" class="size-10 text-primary" />
        <h1 class="text-lg font-semibold text-highlighted">
          {{ props.cancelable ? '添加账户' : '登录 123云盘' }}
        </h1>
      </div>

      <UAlert
        v-if="errorMessage"
        color="error"
        variant="soft"
        icon="i-lucide-triangle-alert"
        :title="errorMessage"
        class="mb-4"
      />

      <UTabs v-model="activeTab" :items="tabItems" size="sm">
        <template #password>
          <UForm
            :validate="validate"
            :state="state"
            class="space-y-4 pt-4"
            @submit="submitLogin(loginPassword)"
          >
            <UFormField label="账号" name="passport">
              <UInput
                v-model="state.passport"
                placeholder="手机号或邮箱"
                size="lg"
                class="w-full"
                autocomplete="username"
              />
            </UFormField>
            <UFormField label="密码" name="password">
              <UInput
                v-model="state.password"
                type="password"
                placeholder="请输入密码"
                size="lg"
                class="w-full"
                autocomplete="current-password"
              />
            </UFormField>
            <UButton type="submit" size="lg" block :loading="loading">登 录</UButton>
          </UForm>
        </template>

        <template #cookie>
          <div class="space-y-4 pt-4">
            <p class="text-xs text-muted">
              在已登录 123pan 的浏览器中复制 Cookie（F12 → Network → 请求头），粘贴到下方即可登录。
            </p>
            <UTextarea
              v-model="cookieText"
              :rows="5"
              placeholder="粘贴 Cookie、Authorization 头或单个 token..."
              class="w-full"
            />
            <UButton
              size="lg"
              block
              icon="i-lucide-cookie"
              :loading="loading"
              :disabled="!cookieText.trim()"
              @click="submitLogin(loginCookie)"
            >
              验证并登录
            </UButton>
          </div>
        </template>

        <template #qr>
          <div class="flex flex-col items-center gap-3 pt-4 pb-2 text-center">
            <div v-if="qrUrl" class="rounded-lg bg-white p-2">
              <canvas ref="qrCanvas" class="block size-[220px]" />
            </div>
            <UIcon v-else name="i-lucide-scan-line" class="size-12 text-primary" />
            <p class="text-sm text-muted">
              {{ qrStatusText[qrStatus?.status ?? ''] ?? '使用 123云盘 App 扫码登录' }}
            </p>
            <UButton
              size="lg"
              block
              :icon="qrUrl ? 'i-lucide-refresh-cw' : 'i-lucide-scan-line'"
              :loading="qrLoading"
              @click="startQrLogin"
            >
              {{ qrUrl ? '重新生成二维码' : '生成登录二维码' }}
            </UButton>
          </div>
        </template>
      </UTabs>

      <p class="mt-4 text-center text-xs text-dimmed">凭证仅保存在本机（加密存储），不会上传</p>
    </div>
  </div>
</template>
