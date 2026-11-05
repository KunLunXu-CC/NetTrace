export interface AppInfo {
  name: string
  version: string
  platform: string
}

export const APP_INFO_CHANNEL = 'app:get-info'

export interface AppBridge {
  getInfo(): Promise<AppInfo>
  getCaptureStatus(includeRecords?: boolean): Promise<CaptureStatus>
  startCapture(options: CaptureStartOptions): Promise<{ pid: number; devtoolsPort: number }>
  stopCapture(): Promise<void>
  onCaptureRecord(listener: (record: CaptureRecord) => void): () => void
}

export interface CaptureStartOptions {
  cwd: string
  command: string
  args?: string[]
  shell?: boolean
  env?: Record<string, string | undefined>
  captureBodies: boolean
  devtoolsPort?: number
}

export interface CaptureRecord {
  id: string
  timestamp: string
  processId: number
  method: string
  url: string
  requestHeaders: Record<string, string>
  requestBody?: string
  status?: number
  responseHeaders?: Record<string, string>
  responseBody?: string
  durationMs: number
  error?: string
  source?: 'node' | 'chromium'
}

export interface CaptureStatus {
  running: boolean
  pid?: number
  devtoolsPort?: number
  cwd?: string
  command?: string
  captureBodies?: boolean
  records: CaptureRecord[]
}

export interface CapturedEvent {
  captureId: string
  record: CaptureRecord
}

export const CAPTURE_START_CHANNEL = 'capture:start'
export const CAPTURE_STOP_CHANNEL = 'capture:stop'
export const CAPTURE_STATUS_CHANNEL = 'capture:status'
export const CAPTURE_RECORD_CHANNEL = 'capture:record'
