<script setup lang="ts">
import { reactive, ref } from 'vue'
import type { FormError } from '@nuxt/ui'
import type { AuthStatus } from '@123pan/shared-types'

const emit = defineEmits<{ authenticated: [status: AuthStatus] }>()

const tabItems = [
  { label: '密码登录', slot: 'password' as const },
  { label: 'Cookie 登录', slot: 'cookie' as const },
  { label: '扫码登录', slot: 'qr' as const }
]

const state = reactive({
  passport: '',
  password: ''
})
const cookieText = ref('')
const loading = ref(false)
const errorMessage = ref('')

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

function openQrLogin(): Promise<void> {
  return window.api.openQrLogin()
}

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
  <div class="flex h-screen items-center justify-center bg-default px-4">
    <div class="w-full max-w-sm rounded-lg border border-default bg-elevated/40 p-8">
      <div class="mb-6 flex flex-col items-center gap-2">
        <UIcon name="i-lucide-cloud" class="size-10 text-primary" />
        <h1 class="text-lg font-semibold text-highlighted">登录 123云盘</h1>
      </div>

      <UAlert
        v-if="errorMessage"
        color="error"
        variant="soft"
        icon="i-lucide-triangle-alert"
        :title="errorMessage"
        class="mb-4"
      />

      <UTabs :items="tabItems" size="sm">
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
            <UIcon name="i-lucide-scan-line" class="size-12 text-primary" />
            <p class="text-sm text-muted">
              将打开 123pan 官方登录窗口，使用 123云盘 App 扫码即可，登录成功后自动进入应用。
            </p>
            <UButton
              size="lg"
              block
              icon="i-lucide-external-link"
              :disabled="loading"
              @click="openQrLogin"
            >
              打开官方登录窗口
            </UButton>
          </div>
        </template>
      </UTabs>

      <p class="mt-4 text-center text-xs text-dimmed">凭证仅保存在本机（加密存储），不会上传</p>
    </div>
  </div>
</template>
