import { contextBridge, ipcRenderer } from 'electron'
import { APP_INFO_CHANNEL, CAPTURE_RECORD_CHANNEL, CAPTURE_START_CHANNEL, CAPTURE_STATUS_CHANNEL, CAPTURE_STOP_CHANNEL, type AppBridge, type CaptureRecord } from '../shared/app-info'

const appBridge: AppBridge = {
  getInfo: () => ipcRenderer.invoke(APP_INFO_CHANNEL),
  getCaptureStatus: (includeRecords) => ipcRenderer.invoke(CAPTURE_STATUS_CHANNEL, includeRecords),
  startCapture: (options) => ipcRenderer.invoke(CAPTURE_START_CHANNEL, options),
  stopCapture: () => ipcRenderer.invoke(CAPTURE_STOP_CHANNEL),
  onCaptureRecord: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, record: CaptureRecord) => listener(record)
    ipcRenderer.on(CAPTURE_RECORD_CHANNEL, handler)
    return () => ipcRenderer.removeListener(CAPTURE_RECORD_CHANNEL, handler)
  },
}

contextBridge.exposeInMainWorld('netTrace', appBridge)
