'use strict'

const { copyFileSync, mkdirSync } = require('node:fs')
const { resolve } = require('node:path')

const target = resolve('out/main/capture')
mkdirSync(resolve(target, 'cli'), { recursive: true })
copyFileSync(resolve('src/backend/capture/node-hook.cjs'), resolve(target, 'node-hook.cjs'))
copyFileSync(resolve('bin/nettrace.cjs'), resolve(target, 'cli/nettrace.cjs'))
copyFileSync(resolve('scripts/install-cli.cjs'), resolve(target, 'cli-installer.cjs'))
