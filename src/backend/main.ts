import { app, BrowserWindow, ipcMain } from 'electron'
import { join } from 'node:path'
import { CaptureManager } from './capture/capture-manager'
import { CaptureControlServer } from './capture/control-server'
import { APP_INFO_CHANNEL, CAPTURE_RECORD_CHANNEL, CAPTURE_START_CHANNEL, CAPTURE_STATUS_CHANNEL, CAPTURE_STOP_CHANNEL, type AppInfo, type CaptureStartOptions } from '../shared/app-info'

const currentDir = __dirname
const { installCliCommand } = require('./capture/cli-installer.cjs') as { installCliCommand: (sourcePath: string) => string }
let mainWindow: BrowserWindow | null = null
let waitingForCaptureCleanup = false
const captureManager = new CaptureManager()
const captureControlServer = new CaptureControlServer(captureManager)

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    title: 'NetTrace',
    backgroundColor: '#10141b',
    webPreferences: {
      preload: join(currentDir, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void mainWindow.loadFile(join(currentDir, '../renderer/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

ipcMain.handle(APP_INFO_CHANNEL, (): AppInfo => ({
  name: app.getName(),
  version: app.getVersion(),
  platform: process.platform,
}))

ipcMain.handle(CAPTURE_STATUS_CHANNEL, (_event, includeRecords?: boolean) => captureManager.getStatus(includeRecords !== false))
ipcMain.handle(CAPTURE_START_CHANNEL, (_event, options: CaptureStartOptions) => captureManager.start(options))
ipcMain.handle(CAPTURE_STOP_CHANNEL, () => captureManager.stop())
captureManager.subscribe((record) => {
  mainWindow?.webContents.send(CAPTURE_RECORD_CHANNEL, record)
})

app.whenReady().then(async () => {
  try {
    const commandPath = installCliCommand(join(currentDir, 'capture/cli/nettrace.cjs'))
    console.info(`[NetTrace] CLI command ready: ${commandPath}`)
  } catch (error) {
    console.warn('[NetTrace] CLI command installation failed:', error)
  }
  try {
    await captureControlServer.start()
  } catch (error) {
    console.error('[NetTrace] CLI control server unavailable:', error)
  }
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
}).catch((error: unknown) => {
  console.error('Failed to start NetTrace:', error)
  app.quit()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', (event) => {
  if (waitingForCaptureCleanup) return
  event.preventDefault()
  waitingForCaptureCleanup = true
  void captureManager.stop().then(() => captureControlServer.stop()).finally(() => app.quit())
})
