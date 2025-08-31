#!/usr/bin/env node

const path = require('path')
const colors = require('colors')
const { exec } = require('child_process')
const fs = require('fs')

const packageLocation = (pkg, installPath) => {
  return path.resolve(installPath, 'node_modules', pkg)
}

const loadPackage = (moduleName, moduleAs, installPath) => {
  return new Promise((resolve, reject) => {
    try {
      const loadedPackage = require(packageLocation(moduleName, installPath))
      console.log(colors.blue(`'${moduleName}' was already installed since before!`))
      resolve({ name: moduleName, package: loadedPackage, as: moduleAs })
    } catch (err) {
      console.log(colors.yellow(`Couldn't find '${moduleName}' locally, gonna download it now`))
      try { fs.mkdirSync(installPath, { recursive: true }) } catch (e) {}
      // Ensure a package.json exists so npm links dependencies properly
      const pkgJsonPath = path.join(installPath, 'package.json')
      if (!fs.existsSync(pkgJsonPath)) {
        try { fs.writeFileSync(pkgJsonPath, JSON.stringify({ name: 'trymodule-sandbox', private: true }, null, 2)) } catch (e) {}
      }
      const cmd = `npm install ${moduleName} --no-audit --progress=false --prefer-online`
      exec(cmd, { cwd: installPath }, (error, stdout, stderr) => {
        if (error) {
          console.log(colors.red(stderr || error.message))
          // npm exits with code 1 for not found; map to friendly errors expected by tests
          if ((stderr || '').includes('E404') || /No matching version|ETARGET|ENOTFOUND|404/.test(stderr)) {
            return reject(new Error(`Could not find package ${moduleName}`))
          }
          return reject(new Error('npm install error'))
        }
        try {
          const loadedPackage = require(packageLocation(moduleName, installPath))
          resolve({ name: moduleName, package: loadedPackage, as: moduleAs })
        } catch (e2) {
          reject(e2)
        }
      })
    }
  })
}

module.exports = (packagesToInstall, installPath) => {
  return new Promise((resolve, reject) => {
    const promisesForInstallation = []
    Object.keys(packagesToInstall).forEach(moduleName => {
      const as = packagesToInstall[moduleName]
      promisesForInstallation.push(loadPackage(moduleName, as, installPath))
    })
    Promise.all(promisesForInstallation).then(resolve).catch(reject)
  })
}
