#!/usr/bin/env node
'use strict'

const { createConnection } = require('node:net')
const { tmpdir } = require('node:os')
const { join } = require('node:path')
const { StringDecoder } = require('node:string_decoder')

function usage() {
  process.stdout.write([
    'Usage:',
    '  nettrace run [--capture-bodies] -- <command> [args...]',
    '',
    'Examples:',
    '  nettrace run -- pnpm dev',
    '  nettrace run -- npm run dev',
    '  nettrace run --capture-bodies -- node server.js',
    '',
    'The command runs in the current directory. Start the NetTrace desktop app first.',
  ].join('\n') + '\n')
}

function parseArguments(args) {
  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') return { help: true }
  if (args.shift() !== 'run') return { error: '未知子命令。当前支持 `nettrace run`。' }
  let captureBodies = false
  if (args[0] === '--capture-bodies') {
    captureBodies = true
    args.shift()
  }
  if (args[0] === '--') args.shift()
  if (args.length === 0) return { error: '请在 `--` 后提供要运行的命令。' }
  return { command: args[0], commandArgs: args.slice(1), captureBodies }
}

const parsed = parseArguments(process.argv.slice(2))
if (parsed.help) {
  usage()
  process.exit(0)
}
if (parsed.error) {
  process.stderr.write(`${parsed.error}\n\n`)
  usage()
  process.exit(2)
}

const userId = typeof process.getuid === 'function' ? process.getuid() : process.env.USERNAME || 'user'
const socketPath = join(tmpdir(), `nettrace-control-${userId}.sock`)
const socket = createConnection(socketPath)
const outputDecoders = {
  stdout: new StringDecoder('utf8'),
  stderr: new StringDecoder('utf8'),
}
let buffer = ''
let started = false
let finished = false
let requestedSignal = null
let stopTimer

function finish(code) {
  if (finished) return
  finished = true
  if (stopTimer) clearTimeout(stopTimer)
  for (const stream of ['stdout', 'stderr']) {
    const tail = outputDecoders[stream].end()
    if (tail) (stream === 'stdout' ? process.stdout : process.stderr).write(tail)
  }
  process.exitCode = requestedSignal === 'SIGINT' ? 130 : requestedSignal === 'SIGTERM' ? 143 : code ?? 0
  socket.end()
}

function requestStop(signal) {
  if (finished || requestedSignal) return
  requestedSignal = signal
  if (!started) {
    socket.destroy()
    return
  }
  socket.write(`${JSON.stringify({ type: 'stop' })}\n`)
  stopTimer = setTimeout(() => finish(signal === 'SIGINT' ? 130 : 143), 5000)
  stopTimer.unref()
}

process.on('SIGINT', () => requestStop('SIGINT'))
process.on('SIGTERM', () => requestStop('SIGTERM'))

socket.once('connect', () => {
  const cwd = process.cwd()
  socket.write(`${JSON.stringify({
    type: 'start',
    options: {
      cwd,
      command: parsed.command,
      args: parsed.commandArgs,
      env: process.env,
      captureBodies: parsed.captureBodies,
    },
  })}\n`)
})

socket.on('data', (chunk) => {
  buffer += chunk.toString()
  let newline = buffer.indexOf('\n')
  while (newline >= 0) {
    const line = buffer.slice(0, newline)
    buffer = buffer.slice(newline + 1)
    newline = buffer.indexOf('\n')
    let message
    try {
      message = JSON.parse(line)
    } catch {
      continue
    }
    if (message.type === 'started') {
      started = true
      process.stderr.write(`[NetTrace] 捕获已接入 · PID ${message.pid} · ${process.cwd()}\n`)
    } else if (message.type === 'output') {
      const decoded = Buffer.from(String(message.data || ''), 'base64')
      const text = outputDecoders[message.stream === 'stderr' ? 'stderr' : 'stdout'].write(decoded)
      if (text) (message.stream === 'stderr' ? process.stderr : process.stdout).write(text)
    } else if (message.type === 'error') {
      process.stderr.write(`[NetTrace] ${message.message || '启动失败'}\n`)
      finish(1)
    } else if (message.type === 'exit') {
      if (message.signal) process.stderr.write(`[NetTrace] 进程以 ${message.signal} 退出\n`)
      const exitCode = message.code ?? (message.signal === 'SIGINT' ? 130 : message.signal === 'SIGTERM' ? 143 : 1)
      finish(exitCode)
    }
  }
})

socket.on('error', (error) => {
  if (finished) return
  if (!started && ['ENOENT', 'ECONNREFUSED'].includes(error.code)) {
    process.stderr.write('[NetTrace] 桌面端未运行，请先启动 NetTrace 再执行命令。\n')
  } else {
    process.stderr.write(`[NetTrace] 与桌面端的连接已断开：${error.message}\n`)
  }
  finish(1)
})

socket.on('close', () => {
  if (!finished) finish(1)
})
