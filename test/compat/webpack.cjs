'use strict'

const assert = require('node:assert/strict')
const { mkdtemp, mkdir, readFile, rm, writeFile } = require('node:fs/promises')
const { tmpdir } = require('node:os')
const path = require('node:path')
const { createRequire } = require('node:module')
const WebpackPluginWalleCOS = require('../../webpack.cjs')

const projectRoot = path.resolve(__dirname, '../..')
const compatPrefix = process.env.COMPAT_PREFIX || projectRoot
const requireFromCompat = createRequire(path.join(compatPrefix, 'package.json'))
let webpack
try {
  webpack = requireFromCompat('webpack')
} catch {
  throw new Error(`Webpack is not installed in ${compatPrefix}; install it there or set COMPAT_PREFIX`)
}

assert.equal(typeof webpack, 'function', '无法加载 Webpack API')

async function compile(config) {
  await new Promise((resolve, reject) => {
    const compiler = webpack(config)
    compiler.run((error, stats) => {
      const finish = compileError => {
        if (compileError) {
          reject(compileError)
          return
        }
        if (!stats || stats.hasErrors()) {
          const details = stats ? stats.toString({ all: false, errors: true }) : 'Webpack 未返回构建结果'
          reject(new Error(details))
          return
        }
        resolve()
      }

      if (error) {
        finish(error)
        return
      }
      if (typeof compiler.close === 'function') {
        compiler.close(finish)
      } else {
        finish()
      }
    })
  })
}

async function main() {
  const fixtureRoot = await mkdtemp(path.join(tmpdir(), 'walle-webpack-'))
  const sourceDir = path.join(fixtureRoot, 'src')
  const outDir = path.join(fixtureRoot, 'dist')
  const uploadLogs = []
  const originalLog = console.log
  console.log = (...args) => {
    uploadLogs.push(args.map(String).join(' '))
    originalLog(...args)
  }

  try {
    await mkdir(sourceDir, { recursive: true })
    const entry = path.join(sourceDir, 'main.js')
    await writeFile(entry, "document.body.dataset.compat = 'true'\n")

    await compile({
      mode: 'production',
      entry,
      output: {
        path: outDir,
        filename: 'bundle.js',
        publicPath: 'https://static.example.com/webpack/'
      },
      optimization: {
        minimize: false
      },
      plugins: [
        new WebpackPluginWalleCOS({
          region: 'ap-beijing',
          bucket: 'compat-test-1234567890',
          test: true
        })
      ]
    })

    const bundle = await readFile(path.join(outDir, 'bundle.js'), 'utf8')
    const uploadEntries = uploadLogs.filter(line => line.includes('test upload path:'))
    assert.match(bundle, /compat/)
    assert(uploadEntries.some(line => line.includes('bundle.js')), '上传钩子未处理当前构建资源')
    console.log(`Webpack ${process.env.COMPAT_VERSION || 'installed'} compatibility passed`)
  } finally {
    console.log = originalLog
    await rm(fixtureRoot, { recursive: true, force: true })
  }
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
