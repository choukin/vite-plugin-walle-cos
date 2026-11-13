import assert from 'assert'
import { readFileSync } from 'fs'
import { createRequire } from 'module'
import path from 'path'
import { fileURLToPath } from 'url'

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const packageName = 'vite-plugin-walle-cos'
const packageRequire = createRequire(path.join(packageRoot, 'package.json'))
const outputDirectory = path.join(packageRoot, 'test/compat')
const base = 'https://static.example.com/'
const assetName = 'runtime.mjs'

function hasUploadLog(logs) {
  return logs.some(line => line.includes('test upload path:') && line.includes(assetName))
}

async function captureLogs(runPlugin) {
  const logs = []
  const originalLog = console.log
  console.log = (...args) => logs.push(args.map(String).join(' '))

  try {
    await runPlugin()
  } finally {
    console.log = originalLog
  }

  return logs
}

async function run() {
  const runtimeFiles = ['index.js', 'vite.cjs', 'webpack.cjs', 'rollup-hook.cjs']
  const nodeBuiltinSpecifier = /(?:\bfrom\s*|\brequire\s*\(\s*|\bimport\s*(?:\(\s*)?)['"]node:/
  runtimeFiles.forEach(file => {
    const source = readFileSync(path.join(packageRoot, file), 'utf8')
    assert.strictEqual(
      nodeBuiltinSpecifier.test(source),
      false,
      `${file} must use Node ${process.versions.node}-compatible builtins`
    )
  })

  const esmEntry = await import(packageName)
  const esmVite = await import(`${packageName}/vite`)
  const esmWebpack = await import(`${packageName}/webpack`)
  assert.strictEqual(typeof esmEntry.default, 'function')
  assert.strictEqual(esmVite.default, esmEntry.default)
  assert.strictEqual(typeof esmEntry.requestTemporaryCredentials, 'function')
  assert.strictEqual(typeof esmEntry.createTemporaryCredentialProvider, 'function')
  assert.strictEqual(typeof esmEntry.uploadToCOS, 'function')
  assert.strictEqual(typeof esmWebpack.default, 'function')

  const cjsVite = packageRequire(packageName)
  const cjsViteSubpath = packageRequire(`${packageName}/vite`)
  const cjsWebpack = packageRequire(`${packageName}/webpack`)
  const supportsSequentialCloseBundle = packageRequire(path.join(packageRoot, 'rollup-hook.cjs'))
  const COS = packageRequire('cos-nodejs-sdk-v5')
  assert.strictEqual(cjsVite, cjsViteSubpath)
  assert.strictEqual(typeof cjsVite, 'function')
  assert.strictEqual(typeof cjsVite.requestTemporaryCredentials, 'function')
  assert.strictEqual(typeof cjsVite.createTemporaryCredentialProvider, 'function')
  assert.strictEqual(typeof cjsVite.uploadToCOS, 'function')
  assert.strictEqual(typeof cjsWebpack, 'function')
  assert.strictEqual(cjsWebpack.WebpackPluginWalleCOS, cjsWebpack)
  assert.strictEqual(typeof supportsSequentialCloseBundle, 'function')

  const originalUploadFile = COS.prototype.uploadFile
  const uploadCalls = []
  COS.prototype.uploadFile = function captureUploadOptions(params) {
    uploadCalls.push({
      storageClass: params.StorageClass,
      sliceSize: this.options.SliceSize,
      chunkSize: this.options.ChunkSize,
      requestSliceSize: params.SliceSize
    })
    return Promise.resolve()
  }

  try {
    const upload = options => esmEntry.uploadToCOS({
      outDir: outputDirectory,
      files: [assetName],
      base,
      options: {
        bucket: 'compat-1234567890',
        region: 'ap-beijing',
        SecretId: 'compat-id',
        SecretKey: 'compat-key',
        ...options
      }
    })
    await upload({})
    await upload({ StorageClass: 'STANDARD_IA', SliceSize: 2 * 1024 * 1024, ChunkSize: 4 * 1024 * 1024 })
  } finally {
    COS.prototype.uploadFile = originalUploadFile
  }

  assert.deepStrictEqual(uploadCalls, [
    {
      storageClass: 'STANDARD',
      sliceSize: 1024 * 1024,
      chunkSize: 1024 * 1024,
      requestSliceSize: undefined
    },
    {
      storageClass: 'STANDARD_IA',
      sliceSize: 2 * 1024 * 1024,
      chunkSize: 4 * 1024 * 1024,
      requestSliceSize: undefined
    }
  ])

  const esmPlugin = esmEntry.default({
    bucket: 'compat-1234567890',
    region: 'ap-beijing',
    test: true
  })
  esmPlugin.configResolved({
    root: packageRoot,
    base,
    build: { outDir: 'test/compat' }
  })
  const esmCloseBundle = esmPlugin.closeBundle
  const esmLogs = await captureLogs(() =>
    typeof esmCloseBundle === 'function' ? esmCloseBundle() : esmCloseBundle.handler()
  )
  assert.strictEqual(hasUploadLog(esmLogs), true, 'ESM Vite hook should find and report an asset')

  const cjsVitePlugin = cjsVite({
    bucket: 'compat-1234567890',
    region: 'ap-beijing',
    test: true
  })
  cjsVitePlugin.configResolved({
    root: packageRoot,
    base,
    build: { outDir: 'test/compat' }
  })
  const cjsCloseBundle = cjsVitePlugin.closeBundle
  const cjsViteLogs = await captureLogs(() =>
    typeof cjsCloseBundle === 'function' ? cjsCloseBundle() : cjsCloseBundle.handler()
  )
  assert.strictEqual(hasUploadLog(cjsViteLogs), true, 'CommonJS Vite hook should find and report an asset')

  let afterEmit
  const compiler = {
    options: {
      mode: 'production',
      output: { path: outputDirectory, publicPath: base }
    },
    watchMode: false,
    hooks: {
      afterEmit: {
        tapPromise(_name, handler) {
          afterEmit = handler
        }
      }
    }
  }

  new cjsWebpack({
    bucket: 'compat-1234567890',
    region: 'ap-beijing',
    test: true
  }).apply(compiler)
  assert.strictEqual(typeof afterEmit, 'function')

  const webpackLogs = await captureLogs(() =>
    afterEmit({
      assets: { [assetName]: {} },
      outputOptions: { path: outputDirectory, publicPath: base }
    })
  )
  assert.strictEqual(hasUploadLog(webpackLogs), true, 'Webpack hook should find and report its asset')
}

run()
  .then(() => console.log(`${process.version} compatibility smoke passed`))
  .catch(error => {
    console.error(error)
    process.exitCode = 1
  })
