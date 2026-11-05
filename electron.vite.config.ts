import { resolve } from 'node:path'
import { copyFileSync, mkdirSync } from 'node:fs'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'

function copyCaptureHook() {
  const copyAssets = () => {
    const target = resolve('out/main/capture')
    mkdirSync(target, { recursive: true })
    copyFileSync(resolve('src/backend/capture/node-hook.cjs'), resolve(target, 'node-hook.cjs'))
    const cliTarget = resolve(target, 'cli')
    mkdirSync(cliTarget, { recursive: true })
    copyFileSync(resolve('bin/nettrace.cjs'), resolve(cliTarget, 'nettrace.cjs'))
    copyFileSync(resolve('scripts/install-cli.cjs'), resolve(target, 'cli-installer.cjs'))
  }

  return {
    name: 'copy-capture-hook',
    writeBundle() {
      copyAssets()
    },
  }
}

export default defineConfig({
  main: {
    build: {
      rollupOptions: {
        input: resolve('src/backend/main.ts'),
        output: { entryFileNames: 'index.js' },
      },
    },
    plugins: [externalizeDepsPlugin(), copyCaptureHook()],
  },
  preload: {
    build: {
      rollupOptions: {
        input: resolve('src/backend/preload.ts'),
        output: { entryFileNames: 'index.js' },
      },
    },
    plugins: [externalizeDepsPlugin()],
  },
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer'),
        '@shared': resolve('src/shared'),
      },
    },
    plugins: [react(), tailwindcss()],
  },
})
