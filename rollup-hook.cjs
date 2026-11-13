'use strict'

const fs = require('fs')
const path = require('path')
const { createRequire } = require('module')

const detectedRoots = new Map()

module.exports = function supportsSequentialCloseBundle(root) {
  const cacheKey = String(root)
  if (detectedRoots.has(cacheKey)) {
    return detectedRoots.get(cacheKey)
  }

  let supported = false
  try {
    const requireFromRoot = createRequire(path.join(root, 'package.json'))
    const viteEntry = requireFromRoot.resolve('vite')
    const requireFromVite = createRequire(viteEntry)
    const rollupEntry = requireFromVite.resolve('rollup')
    const rollupPackagePath = path.resolve(path.dirname(rollupEntry), '../package.json')
    const { version } = JSON.parse(fs.readFileSync(rollupPackagePath, 'utf8'))
    supported = Number.parseInt(version, 10) >= 3
  } catch {
    console.warn(`[vite-plugin-walle-cos] could not detect Rollup from ${root}; using the legacy closeBundle hook`)
  }

  detectedRoots.set(cacheKey, supported)
  return supported
}
