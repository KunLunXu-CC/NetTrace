export interface AppInfo {
  name: string
  version: string
  platform: string
}

export const APP_INFO_CHANNEL = 'app:get-info'

export interface AppBridge {
  getInfo(): Promise<AppInfo>
}
