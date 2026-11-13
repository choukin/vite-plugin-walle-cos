'use strict'

const packName = 'vite-plugin-walle-cos'
let resolveSequentialCloseBundleSupport

function supportsSequentialCloseBundle(root) {
  if (resolveSequentialCloseBundleSupport === undefined) {
    try {
      resolveSequentialCloseBundleSupport = require('./rollup-hook.cjs')
    } catch (error) {
      console.warn(
        `[${packName}] could not load the Rollup hook resolver; using the legacy closeBundle hook`,
        error
      )
      resolveSequentialCloseBundleSupport = null
    }
  }

  return resolveSequentialCloseBundleSupport ? resolveSequentialCloseBundleSupport(root) : false
}

function vitePluginWalleCOS(options = {}) {
  let resolvedConfig
  let useSequentialCloseBundle = false
  let pluginPromise
  const getPlugin = () => {
    if (!pluginPromise) {
      pluginPromise = import('./index.js').then(({ default: createVitePlugin }) => createVitePlugin(options))
    }
    return pluginPromise
  }
  const runCloseBundle = async () => {
    const plugin = await getPlugin()
    if (resolvedConfig) {
      plugin.configResolved(resolvedConfig)
    }
    const closeBundle = plugin.closeBundle
    await (typeof closeBundle === 'function' ? closeBundle() : closeBundle.handler())
  }

  return {
    name: packName,
    enforce: 'post',
    apply: 'build',
    configResolved(config) {
      resolvedConfig = config
      useSequentialCloseBundle = supportsSequentialCloseBundle(config.root)
    },
    get closeBundle() {
      return useSequentialCloseBundle
        ? { order: 'post', sequential: true, handler: runCloseBundle }
        : runCloseBundle
    }
  }
}

module.exports = vitePluginWalleCOS
module.exports.default = vitePluginWalleCOS
module.exports.requestTemporaryCredentials = options =>
  import('./index.js').then(({ requestTemporaryCredentials }) => requestTemporaryCredentials(options))
module.exports.createTemporaryCredentialProvider = options => {
  let providerPromise
  return (...args) => {
    if (!providerPromise) {
      providerPromise = import('./index.js').then(({ createTemporaryCredentialProvider }) =>
        createTemporaryCredentialProvider(options)
      )
    }
    return providerPromise.then(provider => provider(...args))
  }
}
module.exports.uploadToCOS = options =>
  import('./index.js').then(({ uploadToCOS }) => uploadToCOS(options))
