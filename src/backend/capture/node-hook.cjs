const http = require('node:http')
const https = require('node:https')
const net = require('node:net')
const crypto = require('node:crypto')
const zlib = require('node:zlib')
const childProcess = require('node:child_process')
const { URL } = require('node:url')

const captureSocketPath = process.env.NETTRACE_CAPTURE_SOCKET
if (captureSocketPath && !process.versions.electron) {
  const originalSpawn = childProcess.spawn
  childProcess.spawn = function netTraceSpawn(command, args, options) {
    const cdpPort = String(process.env.NETTRACE_CAPTURE_CDP_PORT || '9230')
    const commandName = String(command)
    if (!Array.isArray(args)) return originalSpawn.apply(this, arguments)
    const launchArgs = [...args]
    const isOpenLauncher = /(^|\/)open$/i.test(commandName) && launchArgs.includes('--args')
    const isElectronExecutable = /(^|\/)electron(?:\.cmd)?$/i.test(commandName)
    if (isOpenLauncher) {
      const argsIndex = launchArgs.indexOf('--args')
      const appArgs = []
      const originalAppArgs = launchArgs.slice(argsIndex + 1)
      for (let index = 0; index < originalAppArgs.length; index++) {
        const arg = String(originalAppArgs[index])
        if (arg === '--remote-debugging-port') {
          index++
          continue
        }
        if (arg.startsWith('--remote-debugging-port=')) continue
        appArgs.push(originalAppArgs[index])
      }
      launchArgs.splice(argsIndex + 1, launchArgs.length - argsIndex - 1, `--remote-debugging-port=${cdpPort}`, ...appArgs)
    } else if (isElectronExecutable) {
      for (let index = launchArgs.length - 1; index >= 0; index--) {
        if (String(launchArgs[index]).startsWith('--remote-debugging-port=')) launchArgs.splice(index, 1)
        else if (launchArgs[index] === '--remote-debugging-port') launchArgs.splice(index, 2)
      }
      launchArgs.unshift(`--remote-debugging-port=${cdpPort}`)
    } else {
      return originalSpawn.apply(this, arguments)
    }
    return originalSpawn.call(this, command, launchArgs, options)
  }
  // ESM named imports from Node built-ins need this sync to observe the patched spawn export.
  require('node:module').syncBuiltinESMExports()
}

if (captureSocketPath) {
  const socketPath = process.env.NETTRACE_CAPTURE_SOCKET
  const captureBodies = process.env.NETTRACE_CAPTURE_BODIES === '1'
  const maxBodyBytes = 128 * 1024
  const secretHeader = /(authorization|proxy-authorization|cookie|set-cookie|api[_-]?key|token|secret|password)/i

  function redactValue(value) {
    const input = String(value).replace(/((?:access[_-]?token|refresh[_-]?token|token|secret|password|api[_-]?key|credential|auth)\s*["']?\s*[:=]\s*["']?)[^&\s,"'}]+/gi, '$1[REDACTED]')
    try {
      const url = new URL(input)
      url.username = ''
      url.password = ''
      return url.toString()
    } catch {
      return input
    }
  }

  function stringifyHeaders(headers) {
    const result = {}
    if (!headers) return result
    if (Array.isArray(headers)) {
      for (let index = 0; index + 1 < headers.length; index += 2) {
        const key = String(headers[index]).toLowerCase()
        const value = secretHeader.test(key) ? '[REDACTED]' : redactValue(headers[index + 1])
        result[key] = result[key] ? `${result[key]}, ${value}` : value
      }
      return result
    }
    for (const [key, value] of Object.entries(headers)) {
      const normalizedKey = key.toLowerCase()
      const headerValue = Array.isArray(value) ? value.join(', ') : String(value)
      result[normalizedKey] = secretHeader.test(normalizedKey) ? '[REDACTED]' : redactValue(headerValue)
    }
    return result
  }

  function serializeBody(chunks) {
    if (!captureBodies || chunks.length === 0) return undefined
    const body = Buffer.concat(chunks).subarray(0, maxBodyBytes)
    return redactValue(body.toString('utf8'))
  }

  function isTextContentType(value) {
    const contentType = String(value || '').toLowerCase()
    return !contentType || contentType.startsWith('text/') || /^application\/(json|[^;]+\+json|xml|[^;]+\+xml|javascript|x-www-form-urlencoded)(?:;|$)/.test(contentType)
  }

  function serializeRequestBody(chunks, headers) {
    const contentType = String(headers?.['content-type'] || '')
    if (/^(multipart\/form-data|application\/octet-stream|image\/|audio\/|video\/)/i.test(contentType)) return '[binary request body]'
    return serializeBody(chunks)
  }

  function serializeResponseBody(chunks, headers) {
    if (!captureBodies || chunks.length === 0) return undefined
    if (!isTextContentType(headers?.['content-type'])) return '[binary response]'
    let body = Buffer.concat(chunks).subarray(0, maxBodyBytes)
    const encoding = String(headers?.['content-encoding'] || '').toLowerCase().trim()
    if (encoding && encoding !== 'identity') {
      if (chunks.truncated) return `[compressed response truncated (${encoding})]`
      try {
        if (encoding === 'gzip' || encoding === 'x-gzip') body = zlib.gunzipSync(body, { maxOutputLength: maxBodyBytes })
        else if (encoding === 'deflate') body = zlib.inflateSync(body, { maxOutputLength: maxBodyBytes })
        else if (encoding === 'br') body = zlib.brotliDecompressSync(body, { maxOutputLength: maxBodyBytes })
        else return `[compressed response omitted (${encoding})]`
      } catch {
        return `[compressed response omitted (${encoding}; decode failed or expanded beyond 128 KB)]`
      }
    }
    return redactValue(body.toString('utf8').slice(0, maxBodyBytes))
  }

  function appendLimited(chunks, chunk, encoding) {
    const currentSize = chunks.totalSize || 0
    const remaining = maxBodyBytes - currentSize
    if (remaining <= 0) {
      chunks.truncated = true
      return
    }
    let value
    if (Buffer.isBuffer(chunk)) value = chunk
    else if (ArrayBuffer.isView(chunk)) value = Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength)
    else if (chunk instanceof ArrayBuffer) value = Buffer.from(chunk)
    else value = Buffer.from(String(chunk), typeof encoding === 'string' ? encoding : undefined)
    const limited = Buffer.from(value.subarray(0, remaining))
    chunks.push(limited)
    chunks.totalSize = currentSize + limited.length
    if (value.length > remaining) chunks.truncated = true
  }

  async function readStreamLimited(stream) {
    if (!stream) return undefined
    const reader = stream.getReader()
    const chunks = []
    let size = 0
    try {
      while (size < maxBodyBytes) {
        const { done, value } = await reader.read()
        if (done) break
        const part = Buffer.from(value).subarray(0, maxBodyBytes - size)
        chunks.push(part)
        size += part.length
        if (part.length < value.byteLength) break
      }
    } finally {
      await reader.cancel().catch(() => undefined)
    }
    return redactValue(Buffer.concat(chunks).toString('utf8'))
  }

  function emit(record) {
    if (!socketPath) return
    try {
      const client = net.createConnection(socketPath)
      client.on('connect', () => client.end(`${JSON.stringify(record)}\n`))
      client.on('error', () => client.destroy())
    } catch {
      // Capture must never interrupt the observed request.
    }
  }

  function patchRequest(module, protocol) {
    const originalRequest = module.request
    module.request = function netTraceRequest(...args) {
      let requestOptions = args[0]
      let parsedUrl
      if (typeof requestOptions === 'string' || requestOptions instanceof URL) {
        parsedUrl = new URL(requestOptions.toString())
        requestOptions = { protocol: parsedUrl.protocol, hostname: parsedUrl.hostname, port: parsedUrl.port || undefined, path: `${parsedUrl.pathname}${parsedUrl.search}`, ...(typeof args[1] === 'object' ? args[1] : {}) }
        args = [requestOptions, ...(typeof args[1] === 'function' ? [args[1]] : args.slice(2))]
      }

      const options = typeof requestOptions === 'object' && requestOptions ? requestOptions : {}
      const startedAt = Date.now()
      const id = crypto.randomUUID()
      const chunks = []
      const method = String(options.method || 'GET').toUpperCase()
      const headers = stringifyHeaders(options.headers)
      if (options.auth) headers.authorization = '[REDACTED]'
      if (options.headers?.authorization || options.headers?.Authorization) headers.authorization = '[REDACTED]'
      let url
      if (parsedUrl) {
        url = redactValue(`${parsedUrl.origin}${options.path || `${parsedUrl.pathname}${parsedUrl.search}`}`)
      } else {
        url = `${options.protocol || protocol}//${options.hostname || options.host || 'localhost'}`
        if (options.port) url += `:${options.port}`
        url += options.path || '/'
        url = redactValue(url)
      }
      const requestBodyChunks = []
      const record = {
        id,
        timestamp: new Date().toISOString(),
        processId: process.pid,
        source: 'node',
        method,
        url,
        requestHeaders: headers,
        requestBody: undefined,
        durationMs: 0,
      }
      let emitted = false
      const req = originalRequest.apply(this, args)
      const originalWrite = req.write
      const originalEndForRequest = req.end
      req.write = function captureWrite(chunk, ...writeArgs) {
        if (captureBodies && chunk != null) appendLimited(requestBodyChunks, chunk, writeArgs[0])
        return originalWrite.call(this, chunk, ...writeArgs)
      }
      req.end = function captureEnd(chunk, ...endArgs) {
        if (captureBodies && chunk != null) appendLimited(requestBodyChunks, chunk, endArgs[0])
        const result = originalEndForRequest.call(this, chunk, ...endArgs)
        // Headers may be added with setHeader() after request(), so snapshot the final set.
        record.requestHeaders = stringifyHeaders(req.getHeaders())
        if (options.auth) record.requestHeaders.authorization = '[REDACTED]'
        record.requestBody = serializeRequestBody(requestBodyChunks, req.getHeaders())
        return result
      }
      req.on('response', (res) => {
        if (captureBodies) res.on('data', (chunk) => appendLimited(chunks, chunk))
        res.on('end', () => {
          if (emitted) return
          emitted = true
          record.status = res.statusCode
          record.responseHeaders = stringifyHeaders(res.headers)
          record.responseBody = serializeResponseBody(chunks, res.headers)
          record.durationMs = Date.now() - startedAt
          emit(record)
        })
      })
      req.on('error', (error) => {
        if (emitted) return
        emitted = true
        record.error = String(error.message || error)
        record.durationMs = Date.now() - startedAt
        emit(record)
      })
      return req
    }
  }

  patchRequest(http, 'http:')
  patchRequest(https, 'https:')

  function createTracedFetch(fetchImplementation) {
    return async function netTraceFetch(input, init) {
      const startedAt = Date.now()
      const request = input instanceof Request ? input : null
      const url = typeof input === 'string' || input instanceof URL ? input.toString() : request?.url || String(input)
      const method = String(init?.method || request?.method || 'GET').toUpperCase()
      const headers = new Headers(request?.headers)
      new Headers(init?.headers).forEach((value, key) => headers.set(key, value))
      const requestHeaders = stringifyHeaders(Object.fromEntries(headers.entries()))
      let requestBody
      let requestBodyPromise
      if (captureBodies) {
        try {
          const body = init?.body
          if (typeof body === 'string') requestBody = redactValue(body.slice(0, maxBodyBytes))
          else if (body instanceof URLSearchParams) requestBody = redactValue(body.toString().slice(0, maxBodyBytes))
          else if (body instanceof ArrayBuffer || ArrayBuffer.isView(body)) requestBody = '[binary body]'
          else if (body === undefined && request) requestBodyPromise = readStreamLimited(request.clone().body).catch(() => undefined)
        } catch {
          // Request capture is best-effort and must not alter fetch behavior.
        }
      }
      const record = { id: crypto.randomUUID(), timestamp: new Date().toISOString(), processId: process.pid, source: 'node', method, url: redactValue(url), requestHeaders, requestBody, durationMs: 0 }
      try {
        const response = await fetchImplementation.call(this, input, init)
        const pendingCaptures = []
        try {
          record.status = response.status
          record.responseHeaders = stringifyHeaders(Object.fromEntries(response.headers.entries()))
          if (captureBodies && /^(text\/|application\/(json|[^;]+\+json|xml|[^;]+\+xml|javascript|x-www-form-urlencoded))/i.test(response.headers.get('content-type') || '')) {
            pendingCaptures.push(readStreamLimited(response.clone().body).then((body) => { record.responseBody = body }, () => undefined))
          }
        } catch {
          // A failed capture must not turn a successful request into a failed fetch.
        }
        if (requestBodyPromise) pendingCaptures.push(requestBodyPromise.then((body) => { record.requestBody = body }, () => undefined))
        record.durationMs = Date.now() - startedAt
        if (pendingCaptures.length > 0) void Promise.all(pendingCaptures).then(() => emit(record))
        else emit(record)
        return response
      } catch (error) {
        record.error = String(error?.message || error)
        record.durationMs = Date.now() - startedAt
        emit(record)
        throw error
      }
    }
  }

  try {
    if (process.versions.electron && process.type === 'browser') {
      const { app } = require('electron')
      const cdpPort = Number(process.env.NETTRACE_CAPTURE_CDP_PORT || 9230)
      if (Number.isInteger(cdpPort) && cdpPort > 0 && cdpPort <= 65535) {
        app.commandLine.appendSwitch('remote-debugging-port', String(cdpPort))
        app.commandLine.appendSwitch('remote-debugging-address', '127.0.0.1')
        app.commandLine.appendSwitch('remote-allow-origins', '*')
      }
    }
    const { net } = require('electron')
    if (typeof net?.fetch === 'function' && !net.fetch.__netTraceWrapped) {
      const originalNetFetch = net.fetch
      const wrappedNetFetch = createTracedFetch(originalNetFetch.bind(net))
      wrappedNetFetch.__netTraceWrapped = true
      net.fetch = wrappedNetFetch
    }
  } catch {
    // The debug endpoint is optional; main-process HTTP capture remains available.
  }

  if (typeof globalThis.fetch === 'function') {
    const originalFetch = globalThis.fetch
    const tracedFetch = createTracedFetch(originalFetch.bind(globalThis))
    tracedFetch.__netTraceWrapped = true
    globalThis.fetch = tracedFetch
    try {
      const { session, net } = require('electron')
      const defaultSession = session.defaultSession
      if (defaultSession && typeof defaultSession.fetch === 'function') {
        if (!defaultSession.fetch.__netTraceWrapped) {
          const wrappedSessionFetch = createTracedFetch(defaultSession.fetch.bind(defaultSession))
          wrappedSessionFetch.__netTraceWrapped = true
          defaultSession.fetch = wrappedSessionFetch
        }
      }
      if (typeof net?.fetch === 'function' && !net.fetch.__netTraceWrapped) {
        const wrappedNetFetch = createTracedFetch(net.fetch.bind(net))
        wrappedNetFetch.__netTraceWrapped = true
        net.fetch = wrappedNetFetch
      }
    } catch {
      // session.fetch is not available in every Electron release.
    }
  }

  try {
    const Module = require('node:module')
    const originalLoad = Module._load
    const patched = new WeakSet()
    function instrumentWebSocketExport(exported) {
      const WebSocketConstructor = exported?.WebSocket ?? exported
      const prototype = WebSocketConstructor?.prototype
      if (!prototype || patched.has(prototype) || typeof prototype.send !== 'function' || typeof prototype.emit !== 'function') return exported
      patched.add(prototype)
      const originalSend = prototype.send
      const originalEmit = prototype.emit
      prototype.send = function netTraceWsSend(data, ...args) {
        emitWebSocketFrame(this, 'WS →', data)
        return originalSend.call(this, data, ...args)
      }
      prototype.emit = function netTraceWsEmit(event, data, ...args) {
        if (event === 'message') emitWebSocketFrame(this, 'WS ←', data, args[0] === true)
        return originalEmit.call(this, event, data, ...args)
      }
      return exported
    }
    function emitWebSocketFrame(socket, method, data, isBinary = typeof data !== 'string') {
      const url = redactValue(String(socket.url || socket._url || socket._url?.href || ''))
      if (!url) return
      let body
      if (captureBodies) {
        if (isBinary) body = '[binary WebSocket frame]'
        else body = redactValue(String(data).slice(0, maxBodyBytes))
      }
      emit({ id: crypto.randomUUID(), timestamp: new Date().toISOString(), processId: process.pid, source: 'node', method, url, requestHeaders: {}, requestBody: body, durationMs: 0 })
    }
    Module._load = function netTraceModuleLoad(request, parent, isMain) {
      const loaded = originalLoad.call(this, request, parent, isMain)
      if (request === 'ws') return instrumentWebSocketExport(loaded)
      return loaded
    }
  } catch {
    // Node ws instrumentation is optional; supported browser WebSockets are collected through CDP.
  }
}
