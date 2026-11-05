#!/usr/bin/env node
'use strict'

const { accessSync, constants, copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } = require('node:fs')
const { delimiter, dirname, join, resolve } = require('node:path')
const { homedir } = require('node:os')

const MANAGED_MARKER = 'Managed by NetTrace CLI installer'

function installCliCommand(sourcePath) {
  const source = resolve(sourcePath)
  if (!statSync(source, { throwIfNoEntry: false })?.isFile()) {
    throw new Error(`CLI bundle is missing: ${source}`)
  }

  const binDirectory = findBinDirectory()
  mkdirSync(binDirectory, { recursive: true })
  const commandPath = join(binDirectory, process.platform === 'win32' ? 'nettrace.cmd' : 'nettrace')
  const existing = readFileSyncIfPresent(commandPath)
  if (existing && !existing.includes(MANAGED_MARKER)) {
    throw new Error(`Cannot install the CLI because another command already exists: ${commandPath}`)
  }

  let cliPath = commandPath
  let command
  if (process.platform === 'win32') {
    cliPath = join(binDirectory, 'nettrace-cli.cjs')
    copyFileSync(source, cliPath)
    command = `@echo off\r\nREM ${MANAGED_MARKER}\r\nnode "%~dp0nettrace-cli.cjs" %*\r\n`
  } else {
    command = addManagedMarker(readFileSync(source, 'utf8'))
  }

  const temporaryPath = `${commandPath}.${process.pid}.tmp`
  try {
    writeFileSync(temporaryPath, command, { mode: 0o755 })
    renameSync(temporaryPath, commandPath)
  } finally {
    rmSync(temporaryPath, { force: true })
  }
  if (process.platform !== 'win32') accessSync(cliPath, constants.X_OK)
  return commandPath
}

function findBinDirectory() {
  const home = resolve(homedir())
  const pathDirectories = (process.env.PATH || '').split(delimiter).filter(Boolean).map((directory) => resolve(directory))
  if (process.env.NETTRACE_CLI_BIN_DIR) return resolve(process.env.NETTRACE_CLI_BIN_DIR)
  const defaults = process.platform === 'darwin'
    ? [join(home, 'Library', 'pnpm'), join(home, '.local', 'bin')]
    : process.platform === 'win32'
      ? [process.env.APPDATA && join(process.env.APPDATA, 'npm')].filter(Boolean)
      : [join(home, '.local', 'bin')]
  const commandName = process.platform === 'win32' ? 'nettrace.cmd' : 'nettrace'
  for (const directory of pathDirectories) {
    const commandPath = join(directory, commandName)
    if (!existsSync(commandPath)) continue
    const existing = readFileSyncIfPresent(commandPath)
    if (existing?.includes(MANAGED_MARKER)) return directory
    throw new Error(`Cannot install the CLI because another command already exists on PATH: ${commandPath}`)
  }

  for (const directory of pathDirectories) {
    if (directory !== home && !directory.startsWith(`${home}/`)) continue
    try {
      accessSync(directory, constants.W_OK)
    } catch {
      // Continue to another user-owned PATH directory.
      continue
    }
    return directory
  }
  for (const directory of defaults) {
    if (!directory) continue
    if (existsSync(join(directory, commandName))) continue
    return directory
  }
  throw new Error('No writable user bin directory is available. Configure NETTRACE_CLI_BIN_DIR and add it to PATH.')
}

function readFileSyncIfPresent(path) {
  try {
    return readFileSync(path, 'utf8')
  } catch {
    return undefined
  }
}

function addManagedMarker(source) {
  const shebangEnd = source.indexOf('\n')
  if (!source.startsWith('#!') || shebangEnd < 0) return `#!/usr/bin/env node\n// ${MANAGED_MARKER}\n${source}`
  return `${source.slice(0, shebangEnd + 1)}// ${MANAGED_MARKER}\n${source.slice(shebangEnd + 1)}`
}

if (require.main === module) {
  const sourceIndex = process.argv.indexOf('--source')
  if (sourceIndex < 0 || !process.argv[sourceIndex + 1]) {
    process.stderr.write('Usage: install-cli.cjs --source <cli-file>\n')
    process.exit(2)
  }
  try {
    const commandPath = installCliCommand(process.argv[sourceIndex + 1])
    process.stdout.write(`[NetTrace] Installed nettrace command: ${commandPath}\n`)
    const pathDirectories = (process.env.PATH || '').split(delimiter).filter(Boolean).map((directory) => resolve(directory))
    if (!pathDirectories.includes(dirname(commandPath))) {
      process.stderr.write(`[NetTrace] Add ${dirname(commandPath)} to PATH to use nettrace from a terminal.\n`)
    }
  } catch (error) {
    process.stderr.write(`[NetTrace] Could not install the nettrace command: ${error.message}\n`)
    process.exit(1)
  }
}

module.exports = { installCliCommand }
