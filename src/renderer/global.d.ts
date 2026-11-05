import type { AppBridge } from '../shared/app-info'

declare global {
  interface Window {
    netTrace: AppBridge
  }
}

export {}
