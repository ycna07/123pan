<script setup lang="ts">
import { reactive, ref } from 'vue'
import type { FormError } from '@nuxt/ui'

const emit = defineEmits<{ authenticated: [account: string] }>()

const state = reactive({
  passport: '',
  password: ''
})
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

async function onSubmit(): Promise<void> {
  loading.value = true
  errorMessage.value = ''
  try {
    const status = await window.api.login({
      passport: state.passport.trim(),
      password: state.password
    })
    emit('authenticated', status.account ?? state.passport.trim())
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
        <p class="text-sm text-muted">使用 123pan 账号密码登录</p>
      </div>

      <UAlert
        v-if="errorMessage"
        color="error"
        variant="soft"
        icon="i-lucide-triangle-alert"
        :title="errorMessage"
        class="mb-4"
      />

      <UForm :validate="validate" :state="state" class="space-y-4" @submit="onSubmit">
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

      <p class="mt-4 text-center text-xs text-dimmed">凭证仅保存在本机（加密存储），不会上传</p>
    </div>
  </div>
</template>
