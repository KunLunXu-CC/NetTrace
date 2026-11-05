import type { CaptureRecord } from '../../shared/app-info'

interface DevToolsTarget {
  id: string
  type: string
  url: string
  webSocketDebuggerUrl?: string
}

interface CapturedRequestState {
  record: CaptureRecord
  startedAt: number
}

interface CdpMessage {
  id?: number
  method?: string
  params?: Record<string, unknown>
  result?: Record<string, unknown>
}

const MAX_BODY_BYTES = 128 * 1024
const MAX_TOTAL_BUFFER_BYTES = 10 * 1024 * 1024
const REDACTED_HEADERS = /(authorization|proxy-authorization|cookie|set-cookie|api[_-]?key|token|secret|password)/i

function sanitizeHeaders(input: Record<string, unknown> | undefined): Record<string, string> {
  const headers: Record<string, string> = {}
  for (const [key, raw] of Object.entries(input ?? {})) {
    const value = Array.isArray(raw) ? raw.join(', ') : String(raw)
    headers[key.toLowerCase()] = REDACTED_HEADERS.test(key) ? '[REDACTED]' : redactBody(value)
  }
  return headers
}

function redactBody(value: string, includeQuery = false): string {
  let sanitized = value
  try {
    const url = new URL(value)
    url.username = ''
    url.password = ''
    if (includeQuery) {
      for (const key of [...url.searchParams.keys()]) {
        if (/(token|secret|password|api[_-]?key|credential|auth)/i.test(key)) url.searchParams.set(key, '[REDACTED]')
      }
    }
    sanitized = url.toString()
  } catch {
    // A body string is not a URL; continue with key based secret scrubbing.
  }
  return sanitized
    .replace(/("(?:access[_-]?token|refresh[_-]?token|token|secret|password|api[_-]?key|credential|auth)"\s*:\s*")[^"]*/gi, '$1[REDACTED]')
    .replace(/((?:access[_-]?token|refresh[_-]?token|token|secret|password|api[_-]?key|credential|auth)\s*[=:]\s*)[^&\s,]+/gi, '$1[REDACTED]')
}

export class CdpCapture {
  private timer: ReturnType<typeof setInterval> | null = null
  private readonly sockets = new Map<string, WebSocket>()
  private readonly records = new Map<string, CapturedRequestState>()
  private readonly webSocketUrls = new Map<string, string>()
  private readonly commands = new Map<string, Map<number, (result: Record<string, unknown>) => void>>()
  private nextCommandId = 0

  constructor(
    private readonly onRecord: (record: CaptureRecord) => void,
    private readonly captureBodies: boolean,
    private readonly port = 9230,
  ) {}

  start(): void {
    if (this.timer) return
    void this.discoverTargets()
    this.timer = setInterval(() => void this.discoverTargets(), 1000)
    this.timer.unref?.()
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    for (const socket of this.sockets.values()) socket.close()
    this.sockets.clear()
    this.records.clear()
    this.webSocketUrls.clear()
  }

  private async discoverTargets(): Promise<void> {
    try {
      const response = await fetch(`http://127.0.0.1:${this.port}/json/list`, { signal: AbortSignal.timeout(800) })
      if (!response.ok) return
      const targets = (await response.json()) as DevToolsTarget[]
      for (const target of targets) {
        if (target.type !== 'page' || !target.webSocketDebuggerUrl || this.sockets.has(target.id)) continue
        this.attachTarget(target)
      }
    } catch {
      // The optional DevTools endpoint may not be enabled for a launch command.
    }
  }

  private attachTarget(target: DevToolsTarget): void {
    const socket = new WebSocket(target.webSocketDebuggerUrl!)
    this.sockets.set(target.id, socket)
    socket.addEventListener('open', () => this.send(socket, 'Network.enable', {
      maxTotalBufferSize: MAX_TOTAL_BUFFER_BYTES,
      maxResourceBufferSize: MAX_BODY_BYTES,
      maxPostDataSize: MAX_BODY_BYTES,
    }))
    socket.addEventListener('message', (event) => {
      try {
        this.handleMessage(socket, JSON.parse(String(event.data)) as CdpMessage)
      } catch {
        // Ignore malformed DevTools messages.
      }
    })
    socket.addEventListener('close', () => {
      this.forgetTarget(target.id)
    })
    socket.addEventListener('error', () => {
      this.forgetTarget(target.id)
    })
  }

  private send(socket: WebSocket, method: string, params?: Record<string, unknown>, callback?: (result: Record<string, unknown>) => void): void {
    const id = ++this.nextCommandId
    if (callback) {
      const socketKey = this.socketKey(socket)
      let callbacks = this.commands.get(socketKey)
      if (!callbacks) {
        callbacks = new Map()
        this.commands.set(socketKey, callbacks)
      }
      callbacks.set(id, callback)
    }
    socket.send(JSON.stringify({ id, method, ...(params ? { params } : {}) }))
  }

  private socketKey(socket: WebSocket): string {
    for (const [targetId, targetSocket] of this.sockets) if (targetSocket === socket) return targetId
    return 'unknown'
  }

  private forgetTarget(targetId: string): void {
    this.sockets.delete(targetId)
    this.commands.delete(targetId)
    const prefix = `${targetId}:`
    for (const requestKey of this.records.keys()) if (requestKey.startsWith(prefix)) this.records.delete(requestKey)
    for (const requestKey of this.webSocketUrls.keys()) if (requestKey.startsWith(prefix)) this.webSocketUrls.delete(requestKey)
  }

  private handleMessage(socket: WebSocket, message: CdpMessage): void {
    if (message.id) {
      const callbacks = this.commands.get(this.socketKey(socket))
      const callback = callbacks?.get(message.id)
      callbacks?.delete(message.id)
      if (callback) callback(message.result ?? {})
      return
    }
    const params = message.params ?? {}
    const requestId = String(params.requestId ?? '')
    const requestKey = `${this.socketKey(socket)}:${requestId}`
    if (message.method === 'Network.webSocketCreated') {
      this.webSocketUrls.set(requestKey, String(params.url ?? ''))
      return
    }
    if (message.method === 'Network.webSocketClosed') {
      this.webSocketUrls.delete(requestKey)
      return
    }
    if (message.method === 'Network.webSocketFrameSent' || message.method === 'Network.webSocketFrameReceived') {
      const response = params.response as Record<string, unknown> | undefined
      const payload = response?.payloadData
      const url = this.webSocketUrls.get(requestKey)
      if (url && payload !== undefined) {
        this.onRecord({
          id: `cdp-ws-${requestKey}-${Date.now()}-${Math.random()}`,
          timestamp: new Date().toISOString(),
          processId: 0,
          source: 'chromium',
          method: message.method.endsWith('Sent') ? 'WS →' : 'WS ←',
          url: redactBody(url, true),
          requestHeaders: {},
          requestBody: this.captureBodies
            ? Number(response?.opcode) === 2
              ? '[binary WebSocket frame]'
              : redactBody(String(payload)).slice(0, MAX_BODY_BYTES)
            : undefined,
          durationMs: 0,
        })
      }
      return
    }
    if (!requestId) return

    if (message.method === 'Network.requestWillBeSent') {
      const request = params.request as Record<string, unknown>
      const headers = sanitizeHeaders(request.headers as Record<string, unknown>)
      const url = redactBody(String(request.url ?? ''), true)
      const record: CaptureRecord = {
        id: `cdp-${requestKey}`,
        timestamp: new Date().toISOString(),
        processId: 0,
        source: 'chromium',
        method: String(request.method ?? 'GET'),
        url,
        requestHeaders: headers,
        requestBody: this.captureBodies && typeof request.postData === 'string' ? redactBody(request.postData).slice(0, MAX_BODY_BYTES) : undefined,
        durationMs: 0,
      }
      this.records.set(requestKey, { record, startedAt: performance.now() })
    } else if (message.method === 'Network.responseReceived') {
      const state = this.records.get(requestKey)
      if (!state) return
      const response = params.response as Record<string, unknown>
      state.record.status = Number(response.status)
      state.record.responseHeaders = sanitizeHeaders(response.headers as Record<string, unknown>)
      state.record.url = redactBody(String(response.url ?? state.record.url), true)
    } else if (message.method === 'Network.loadingFailed') {
      const state = this.records.get(requestKey)
      if (!state) return
      state.record.error = String(params.errorText ?? 'Network request failed')
      state.record.durationMs = Math.round(performance.now() - state.startedAt)
      this.records.delete(requestKey)
      this.onRecord(state.record)
    } else if (message.method === 'Network.loadingFinished') {
      const state = this.records.get(requestKey)
      if (!state) return
      state.record.durationMs = Math.round(performance.now() - state.startedAt)
      this.records.delete(requestKey)
      if (this.captureBodies) {
        const encodedDataLength = Number(params.encodedDataLength)
        if (Number.isFinite(encodedDataLength) && encodedDataLength > MAX_BODY_BYTES) {
          state.record.responseBody = '[response body omitted: exceeds 128 KB]'
          this.onRecord(state.record)
          return
        }
        this.send(socket, 'Network.getResponseBody', { requestId }, (result) => {
          const rawBody = String(result.body ?? '')
          state.record.responseBody = result.base64Encoded === true
            ? '[binary response]'
            : redactBody(rawBody).slice(0, MAX_BODY_BYTES)
          this.onRecord(state.record)
        })
      } else {
        this.onRecord(state.record)
      }
    }
  }
}
