import { createServer, type Server, type Socket } from 'node:net'
import { spawn, type ChildProcess } from 'node:child_process'
import { chmodSync, existsSync, mkdtempSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { CaptureRecord, CaptureStartOptions, CaptureStatus } from '../../shared/app-info'
import { CdpCapture } from './cdp-capture'

const MAX_RECORDS = 10_000
const BUILT_HOOK_PATH = fileURLToPath(new URL('../main/capture/node-hook.cjs', import.meta.url))

export class CaptureManager {
  private server: Server | null = null
  private child: ChildProcess | null = null
  private socketDirectory: string | null = null
  private records: CaptureRecord[] = []
  private listeners = new Set<(record: CaptureRecord) => void>()
  private cdpCapture: CdpCapture | null = null
  private devtoolsPort: number | undefined
  private activeCwd: string | undefined
  private activeCommand: string | undefined
  private activeCaptureBodies = false
  private outputListeners = new Set<(stream: 'stdout' | 'stderr', chunk: Buffer) => void>()
  private exitListeners = new Set<(code: number | null, signal: NodeJS.Signals | null) => void>()
  private starting = false
  private startGeneration = 0

  async start(options: CaptureStartOptions): Promise<{ pid: number; devtoolsPort: number }> {
    if (this.child || this.starting) throw new Error('已有捕获会话正在运行或启动中')
    this.starting = true
    try {
      return await this.startProcess(options)
    } finally {
      this.starting = false
    }
  }

  private async startProcess(options: CaptureStartOptions): Promise<{ pid: number; devtoolsPort: number }> {
    const generation = this.startGeneration
    const cwd = resolve(options.cwd.trim())
    const command = options.command.trim()
    if (!command) throw new Error('请输入要启动的命令')
    if (!statSync(cwd, { throwIfNoEntry: false })?.isDirectory()) throw new Error(`项目目录不存在：${cwd}`)
    const devtoolsPort = options.devtoolsPort ?? await findFreePort()
    if (generation !== this.startGeneration) throw new Error('启动已取消')

    const hookPath = resolve(dirname(fileURLToPath(import.meta.url)), 'capture/node-hook.cjs')
    if (!existsSync(hookPath) && !existsSync(BUILT_HOOK_PATH)) throw new Error(`找不到请求采集 hook：${hookPath}`)
    const selectedHookPath = existsSync(hookPath) ? hookPath : BUILT_HOOK_PATH
    this.socketDirectory = mkdtempSync(join(tmpdir(), 'nettrace-'))
    const socketPath = join(this.socketDirectory, 'capture.sock')
    this.server = createServer((socket) => this.acceptRecord(socket))
    try {
      await new Promise<void>((resolvePromise, reject) => {
        this.server?.once('error', reject)
        this.server?.listen(socketPath, () => {
          this.server?.removeListener('error', reject)
          resolvePromise()
        })
      })
    } catch (error) {
      await this.closeServer()
      throw error
    }
    if (generation !== this.startGeneration) {
      await this.closeServer()
      throw new Error('启动已取消')
    }
    chmodSync(socketPath, 0o600)
    const env = { ...process.env, ...options.env }
    const existingOptions = env.NODE_OPTIONS ?? ''
    const escapedHookPath = selectedHookPath.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
    const requireOption = `--require="${escapedHookPath}"`
    env.NODE_OPTIONS = `${existingOptions} ${requireOption}`.trim()
    env.NETTRACE_CAPTURE_SOCKET = socketPath
    env.NETTRACE_CAPTURE_BODIES = options.captureBodies ? '1' : '0'
    env.NETTRACE_CAPTURE_CDP_PORT = String(devtoolsPort)
    this.devtoolsPort = devtoolsPort

    this.records = []
    this.activeCwd = cwd
    this.activeCommand = [command, ...(options.args ?? [])].join(' ')
    this.activeCaptureBodies = options.captureBodies
    this.cdpCapture = new CdpCapture((record) => this.publish(record), options.captureBodies, devtoolsPort)
    this.cdpCapture.start()
    const shell = options.shell ?? (options.args === undefined || process.platform === 'win32')
    this.child = spawn(command, options.args ?? [], {
      cwd,
      env,
      shell,
      detached: process.platform !== 'win32',
      stdio: ['inherit', 'pipe', 'pipe'],
    })
    const child = this.child
    child.stdout?.on('data', (chunk: Buffer) => this.publishOutput('stdout', chunk))
    child.stderr?.on('data', (chunk: Buffer) => this.publishOutput('stderr', chunk))
    child.once('close', () => {
      if (this.child !== child) return
      this.child = null
      this.devtoolsPort = undefined
      this.activeCwd = undefined
      this.activeCommand = undefined
      this.activeCaptureBodies = false
      this.cdpCapture?.stop()
      this.cdpCapture = null
      for (const listener of this.exitListeners) listener(child.exitCode, child.signalCode)
      void this.closeServer()
    })
    await new Promise<void>((resolvePromise, reject) => {
      child.once('spawn', () => resolvePromise())
      child.once('error', reject)
    }).catch(async (error: unknown) => {
      if (this.child === child) this.child = null
      this.devtoolsPort = undefined
      this.activeCwd = undefined
      this.activeCommand = undefined
      this.activeCaptureBodies = false
      this.cdpCapture?.stop()
      this.cdpCapture = null
      await this.closeServer()
      throw error
    })
    return { pid: child.pid ?? 0, devtoolsPort }
  }

  async stop(): Promise<void> {
    this.startGeneration += 1
    const child = this.child
    if (child) {
      if (child.exitCode === null && child.signalCode === null) signalProcessTree(child, 'SIGTERM')
      await new Promise<void>((resolvePromise) => {
        let closed = false
        let graceTimer: ReturnType<typeof setTimeout> | undefined
        let killTimer: ReturnType<typeof setTimeout> | undefined
        const finish = () => {
          if (closed) return
          closed = true
          if (graceTimer) clearTimeout(graceTimer)
          if (killTimer) clearTimeout(killTimer)
          child.removeListener('close', finish)
          resolvePromise()
        }
        child.once('close', finish)
        graceTimer = setTimeout(() => {
          if (closed) return
          signalProcessTree(child, 'SIGKILL')
          killTimer = setTimeout(finish, 1000)
        }, 3000)
      })
    }
    if (this.child === child) this.child = null
    if (this.child === null) {
      this.activeCwd = undefined
      this.activeCommand = undefined
      this.activeCaptureBodies = false
    }
    await this.closeServer()
    this.cdpCapture?.stop()
    this.cdpCapture = null
  }

  getStatus(includeRecords = true): CaptureStatus {
    return {
      running: Boolean(this.child),
      pid: this.child?.pid,
      devtoolsPort: this.devtoolsPort,
      cwd: this.activeCwd,
      command: this.activeCommand,
      captureBodies: this.activeCaptureBodies,
      records: includeRecords ? [...this.records] : [],
    }
  }

  subscribe(listener: (record: CaptureRecord) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  subscribeOutput(listener: (stream: 'stdout' | 'stderr', chunk: Buffer) => void): () => void {
    this.outputListeners.add(listener)
    return () => this.outputListeners.delete(listener)
  }

  subscribeExit(listener: (code: number | null, signal: NodeJS.Signals | null) => void): () => void {
    this.exitListeners.add(listener)
    return () => this.exitListeners.delete(listener)
  }

  private acceptRecord(socket: Socket): void {
    let buffer = ''
    socket.setEncoding('utf8')
    socket.on('data', (chunk: string) => {
      buffer += chunk
      if (buffer.length > 1024 * 1024) {
        socket.destroy()
        return
      }
      let newline = buffer.indexOf('\n')
      while (newline >= 0) {
        const line = buffer.slice(0, newline)
        buffer = buffer.slice(newline + 1)
        newline = buffer.indexOf('\n')
        try {
          const record = JSON.parse(line) as CaptureRecord
          if (!record.id || !record.url || !record.method) continue
          record.id = `${record.processId}-${record.id}`
          this.publish(record)
        } catch {
          // Ignore malformed or partial records from a child process.
        }
      }
    })
  }

  private publish(record: CaptureRecord): void {
    this.records.push(record)
    if (this.records.length > MAX_RECORDS) this.records.splice(0, this.records.length - MAX_RECORDS)
    for (const listener of this.listeners) listener(record)
  }

  private publishOutput(stream: 'stdout' | 'stderr', chunk: Buffer): void {
    for (const listener of this.outputListeners) listener(stream, chunk)
    if (this.outputListeners.size > 0) return
    const output = stream === 'stdout' ? process.stdout : process.stderr
    output.write(chunk)
  }

  private async closeServer(): Promise<void> {
    if (this.server) {
      const server = this.server
      this.server = null
      await new Promise<void>((resolvePromise) => server.close(() => resolvePromise()))
    }
    if (this.socketDirectory) {
      rmSync(this.socketDirectory, { recursive: true, force: true })
      this.socketDirectory = null
    }
  }
}

function signalProcessTree(child: ChildProcess, signal: NodeJS.Signals): void {
  if (!child.pid) return
  if (process.platform === 'win32') {
    const killer = spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], { stdio: 'ignore' })
    killer.unref()
    return
  }
  try {
    process.kill(-child.pid, signal)
  } catch {
    child.kill(signal)
  }
}

async function findFreePort(): Promise<number> {
  const server = createServer()
  await new Promise<void>((resolvePromise, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => resolvePromise())
  })
  const address = server.address()
  await new Promise<void>((resolvePromise) => server.close(() => resolvePromise()))
  if (!address || typeof address === 'string') throw new Error('无法分配 Chromium 调试端口')
  return address.port
}
