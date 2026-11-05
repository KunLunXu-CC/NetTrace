import { contextBridge, ipcRenderer } from 'electron'
import { APP_INFO_CHANNEL, type AppBridge } from '../shared/app-info'

const appBridge: AppBridge = {
  getInfo: () => ipcRenderer.invoke(APP_INFO_CHANNEL),
}

contextBridge.exposeInMainWorld('netTrace', appBridge)
