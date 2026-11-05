import { createConnection, createServer, type Server, type Socket } from 'node:net'
import { chmodSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { CaptureStartOptions } from '../../shared/app-info'
import { CaptureManager } from './capture-manager'

export function getControlSocketPath(): string {
  const userId = typeof process.getuid === 'function' ? process.getuid() : process.env.USERNAME || 'user'
  return join(tmpdir(), `nettrace-control-${userId}.sock`)
}

export class CaptureControlServer {
  private server: Server | null = null
  private ownsSocket = false
  private readonly socketPath = getControlSocketPath()

  constructor(private readonly captureManager: CaptureManager) {}

  async start(): Promise<void> {
    if (this.server) return
    await removeStaleSocket(this.socketPath)
    const server = createServer((socket) => this.handleConnection(socket))
    try {
      await new Promise<void>((resolvePromise, reject) => {
        server.once('error', reject)
        server.listen(this.socketPath, () => {
          server.removeListener('error', reject)
          resolvePromise()
        })
      })
    } catch (error) {
      server.close()
      throw error
    }
    try {
      chmodSync(this.socketPath, 0o600)
    } catch (error) {
      await new Promise<void>((resolvePromise) => server.close(() => resolvePromise()))
      rmSync(this.socketPath, { force: true })
      throw error
    }
    this.server = server
    this.ownsSocket = true
  }

  async stop(): Promise<void> {
    if (this.server) {
      const server = this.server
      this.server = null
      await new Promise<void>((resolvePromise) => server.close(() => resolvePromise()))
    }
    if (this.ownsSocket && existsSync(this.socketPath)) rmSync(this.socketPath, { force: true })
    this.ownsSocket = false
  }

  private handleConnection(socket: Socket): void {
    socket.setEncoding('utf8')
    let buffer = ''
    let started = false
    let finished = false
    let connected = true
    let stopRequested = false
    let stopStarted = false
    let unsubscribeOutput: (() => void) | undefined
    let unsubscribeExit: (() => void) | undefined

    const send = (message: Record<string, unknown>) => {
      if (socket.destroyed) return
      try {
        socket.write(`${JSON.stringify(message)}\n`)
      } catch {
        // A disconnected CLI client must not affect the capture process.
      }
    }
    const detach = () => {
      unsubscribeOutput?.()
      unsubscribeExit?.()
      unsubscribeOutput = undefined
      unsubscribeExit = undefined
    }

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
          const request = JSON.parse(line) as { type?: string; options?: CaptureStartOptions }
          if (request.type === 'start' && !started) {
            started = true
            void this.startSession(request.options, send, detach, () => connected && !stopRequested, (unsubscribe) => {
              unsubscribeOutput = unsubscribe.output
              unsubscribeExit = unsubscribe.exit
            }, () => { finished = true })
          } else if (request.type === 'stop' && started) {
            stopRequested = true
            stopStarted = true
            void this.captureManager.stop()
          } else {
            send({ type: 'error', message: '无效的 NetTrace CLI 请求' })
          }
        } catch {
          send({ type: 'error', message: '无法解析 NetTrace CLI 请求' })
        }
      }
    })

    socket.on('close', () => {
      connected = false
      detach()
      if (started && !finished && !stopStarted) {
        stopStarted = true
        void this.captureManager.stop()
      }
    })
    socket.on('error', () => {
      connected = false
      detach()
      if (started && !finished && !stopStarted) {
        stopStarted = true
        void this.captureManager.stop()
      }
    })
  }

  private async startSession(
    options: CaptureStartOptions | undefined,
    send: (message: Record<string, unknown>) => void,
    detach: () => void,
    isConnected: () => boolean,
    setUnsubscribers: (unsubscribe: { output: () => void; exit: () => void }) => void,
    markFinished: () => void,
  ): Promise<void> {
    if (!options) {
      markFinished()
      send({ type: 'error', message: '缺少启动参数' })
      return
    }

    const unsubscribeOutput = this.captureManager.subscribeOutput((stream, chunk) => {
      send({ type: 'output', stream, data: chunk.toString('base64') })
    })
    const unsubscribeExit = this.captureManager.subscribeExit((code, signal) => {
      markFinished()
      send({ type: 'exit', code, signal })
      detach()
    })
    setUnsubscribers({ output: unsubscribeOutput, exit: unsubscribeExit })

    try {
      const status = await this.captureManager.start(options)
      if (!isConnected()) {
        markFinished()
        detach()
        await this.captureManager.stop()
        return
      }
      send({ type: 'started', pid: status.pid, devtoolsPort: status.devtoolsPort })
    } catch (error) {
      markFinished()
      detach()
      send({ type: 'error', message: error instanceof Error ? error.message : String(error) })
    }
  }
}

async function removeStaleSocket(path: string): Promise<void> {
  if (!existsSync(path)) return
  await new Promise<void>((resolvePromise, reject) => {
    const probe = createConnection(path)
    const timeout = setTimeout(() => {
      probe.destroy()
      reject(new Error('已有 NetTrace 控制服务正在运行'))
    }, 500)
    probe.once('connect', () => {
      clearTimeout(timeout)
      probe.destroy()
      reject(new Error('已有 NetTrace 控制服务正在运行'))
    })
    probe.once('error', (error: NodeJS.ErrnoException) => {
      clearTimeout(timeout)
      if (error.code === 'ECONNREFUSED' || error.code === 'ENOENT') {
        rmSync(path, { force: true })
        resolvePromise()
      } else {
        reject(error)
      }
    })
  })
}
