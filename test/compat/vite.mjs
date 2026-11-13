import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, readdir, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'
import vitePluginWalleCOS from '../../index.js'

const vitePluginWalleCOSCjs = createRequire(fileURLToPath(new URL('../../package.json', import.meta.url)))('./vite.cjs')

const projectRoot = fileURLToPath(new URL('../..', import.meta.url))
const compatPrefix = process.env.COMPAT_PREFIX || path.join(projectRoot, 'example/vite-6')
const requireFromCompat = createRequire(path.join(compatPrefix, 'package.json'))
let viteEntry
try {
  viteEntry = requireFromCompat.resolve('vite')
} catch {
  throw new Error(`Vite is not installed in ${compatPrefix}; install it there or set COMPAT_PREFIX`)
}
const viteModule = await import(pathToFileURL(viteEntry).href)
const build = viteModule.build || viteModule.default?.build

assert.equal(typeof build, 'function', '无法加载 Vite build API')

const fixtureRoot = await realpath(await mkdtemp(path.join(tmpdir(), 'walle-vite-')))
const sourceDir = path.join(fixtureRoot, 'src')
const outDir = path.join(fixtureRoot, 'dist')
const uploadLogs = []
const originalConsoleLog = console.log

try {
  await mkdir(path.join(fixtureRoot, 'node_modules'), { recursive: true })
  await symlink(
    path.join(compatPrefix, 'node_modules', 'vite'),
    path.join(fixtureRoot, 'node_modules', 'vite'),
    process.platform === 'win32' ? 'junction' : 'dir'
  )
  await mkdir(sourceDir, { recursive: true })
  await writeFile(
    path.join(fixtureRoot, 'index.html'),
    '<!doctype html><html><body><div id="app"></div><script type="module" src="/src/main.js"></script></body></html>'
  )
  await writeFile(path.join(sourceDir, 'main.js'), "document.querySelector('#app').textContent = 'compat'\n")

  const runBuild = async (plugin, outputName) => {
    const outputPath = path.join(fixtureRoot, outputName)
    await build({
      root: fixtureRoot,
      configFile: false,
      logLevel: 'error',
      base: 'https://static.example.com/vite/',
      plugins: [
        {
          name: 'compat-late-close-bundle-asset',
          enforce: 'post',
          async closeBundle() {
            await writeFile(path.join(outputPath, 'late-close-bundle.txt'), 'late asset')
          }
        },
        plugin
      ],
      build: {
        outDir: outputName,
        emptyOutDir: true,
        minify: false
      }
    })
  }

  console.log = (...args) => {
    uploadLogs.push(args.map(String).join(' '))
    originalConsoleLog(...args)
  }
  const cosPlugin = vitePluginWalleCOS({
    region: 'ap-beijing',
    bucket: 'compat-test-1234567890',
    test: true
  })
  const cjsPlugin = vitePluginWalleCOSCjs({
    region: 'ap-beijing',
    bucket: 'compat-test-1234567890',
    test: true
  })
  try {
    await runBuild(cosPlugin, 'dist')
    await runBuild(cjsPlugin, 'dist-cjs')
  } finally {
    console.log = originalConsoleLog
  }

  const html = await readFile(path.join(outDir, 'index.html'), 'utf8')
  const assets = await readdir(path.join(outDir, 'assets'))
  const uploadEntries = uploadLogs.filter(line => line.includes('test upload path:'))
  const cjsEntries = uploadEntries.filter(line => line.includes('dist-cjs'))
  const esmEntries = uploadEntries.filter(line => !line.includes('dist-cjs'))
  assert.match(html, /<script[^>]+src=/)
  assert(assets.some(file => file.endsWith('.js')), 'Vite 未生成 JavaScript 资源')
  assert(esmEntries.some(line => line.includes('.js')), 'ESM 上传钩子未处理 JavaScript 资源')
  assert(cjsEntries.some(line => line.includes('.js')), 'CJS 上传钩子未处理 JavaScript 资源')
  if (typeof cosPlugin.closeBundle === 'object') {
    assert(esmEntries.some(line => line.includes('late-close-bundle.txt')), 'ESM 上传钩子未处理后续 closeBundle 资源')
  }
  if (typeof cjsPlugin.closeBundle === 'object') {
    assert(cjsEntries.some(line => line.includes('late-close-bundle.txt')), 'CJS 上传钩子未处理后续 closeBundle 资源')
  }
  assert(!uploadEntries.some(line => line.includes('index.html')), '上传钩子不应默认处理 HTML')

  console.log(`Vite ${process.env.COMPAT_VERSION || 'installed'} compatibility passed`)
} finally {
  await rm(fixtureRoot, { recursive: true, force: true })
}
