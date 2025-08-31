#! /usr/bin/env node

const repl = require('repl')
const path = require('path')
const os = require('os')
const colors = require('colors')
const vm = require('vm')
const { rm } = require('node:fs/promises')
const loadPackages = require('./index')
const { mkdirSync, existsSync } = require('fs')

const TRYMODULE_PATH = process.env.TRYMODULE_PATH || path.resolve(os.homedir(), '.trymodule')
const TRYMODULE_HISTORY_PATH = process.env.TRYMODULE_HISTORY_PATH || path.resolve(TRYMODULE_PATH, 'repl_history')

const flags = []
const packages = {} // data looks like [moduleName, as]

const makeVariableFriendly = str => str.replace(/-|\./g, '_')

process.argv.slice(2).forEach(arg => {
  if (arg[0] === '-') {
    // matches '--clear', etc
    flags.push(arg)
  } else if (arg.indexOf('=') > -1) {
    // matches 'lodash=_', etc
    const i = arg.indexOf('=')
    const module = arg.slice(0, i)
    const as = arg.slice(i + 1)
    packages[module] = makeVariableFriendly(as)
  } else {
    // assume it's just a regular module name: 'lodash', 'express', etc
    packages[arg] = makeVariableFriendly(arg)
  }
})

const logGreen = (msg) => console.log(colors.green(msg))
const hasFlag = (flag) => flags.includes(flag)
const addPackageToObject = (obj, pkg) => {
  logGreen(`Package '${pkg.name}' was loaded and assigned to '${pkg.as}' in the current scope`)
  obj[pkg.as] = pkg.package
  return obj
}

async function clearCache () {
  try {
    const nodeModulesPath = path.join(TRYMODULE_PATH, 'node_modules')
    await rm(nodeModulesPath, { recursive: true, force: true })
    logGreen('Cache successfully cleared!')
  } catch (err) {
    console.error('Error removing cache:', err)
    process.exit(1)
  }
}

async function startRepl () {
  // Ensure install directory exists
  if (!existsSync(TRYMODULE_PATH)) {
    try {
      mkdirSync(TRYMODULE_PATH, { recursive: true })
    } catch (e) {
      console.error('Failed to create directory:', e)
      process.exit(1)
    }
  }

  try {
    const installedPackages = await loadPackages(packages, TRYMODULE_PATH)
    const contextPackages = installedPackages.reduce((context, pkg) => {
      return addPackageToObject(context, pkg)
    }, {})
    console.log('REPL started...')
    if (!process.env.TRYMODULE_NONINTERACTIVE) {
      const replServer = repl.start({
        prompt: '> ',
        eval: (cmd, context, filename, callback) => {
          try {
            const script = new vm.Script(cmd)
            const runInContext = () => script.runInContext(replServer.context)
            // Add a timeout to prevent hanging
            const timeoutMs = 5000
            const resultPromise = Promise.race([
              Promise.resolve().then(runInContext),
              new Promise((resolve, reject) => setTimeout(() => reject(new Error('Evaluation timeout')), timeoutMs))
            ])
            resultPromise.then((result) => {
              if (result instanceof Promise || (result && typeof result.then === 'function')) {
                console.log('Returned a Promise. waiting for result...')
                result.then((val) => callback(null, val))
                  .catch((err) => callback(err))
              } else {
                callback(null, result)
              }
            }).catch((err) => callback(err))
          } catch (err) {
            callback(err)
          }
        }
      })

      // Use built-in REPL persistent history (Node >=11.10)
      if (replServer.setupHistory) {
        replServer.setupHistory(TRYMODULE_HISTORY_PATH, (err) => {
          if (err) console.error('History setup error:', err)
        })
      }

      Object.assign(replServer.context, contextPackages)
    }
  } catch (err) {
    console.error(err && err.message ? err.message : err)
    process.exit(1)
  }
}

(async () => {
  if (hasFlag('--clear')) {
    await clearCache()
    process.exit(0)
  } else {
    logGreen('Starting a REPL with packages installed and loaded for you...')
    await startRepl()
  }
})()
