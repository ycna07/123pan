<script setup lang="ts">
import type { AppVersions } from '@123pan/shared-types'

defineProps<{ versions: AppVersions }>()
</script>

<template>
  <ul class="versions">
    <li class="electron-version">Electron v{{ versions.electron }}</li>
    <li class="chrome-version">Chromium v{{ versions.chrome }}</li>
    <li class="node-version">Node v{{ versions.node }}</li>
  </ul>
</template>
