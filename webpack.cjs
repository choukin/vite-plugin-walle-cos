'use strict'

const pluginName = 'vite-plugin-walle-cos'

class WebpackPluginWalleCOS {
  constructor(options = {}) {
    this.options = options
  }

  apply(compiler) {
    if (this.options.enabled === false) {
      return
    }

    let skipReported = false
    const upload = async compilation => {
      // enabled 是唯一的上传开关：关闭时这里根本不会注册钩子，打开时除 watch 编译外一律上传。
      // watch 编译会反复触发 afterEmit，逐次上传既慢又容易把半成品传上去，因此始终跳过。
      if (compiler.watchMode) {
        if (!skipReported) {
          skipReported = true
          console.log(`[${pluginName}] skipping COS upload: watch mode builds are not uploaded`)
        }
        return
      }

      const outputOptions = compilation.outputOptions || compiler.options.output || {}
      const outDir = this.options.outDir || outputOptions.path
      const configuredBase =
        this.options.base === null || this.options.base === undefined
          ? outputOptions.publicPath
          : this.options.base
      const base = configuredBase === undefined || configuredBase === '' || configuredBase === 'auto'
        ? '/'
        : configuredBase
      const files = typeof compilation.getAssets === 'function'
        ? compilation.getAssets().map(asset => asset.name)
        : Object.keys(compilation.assets || {})
      const { uploadToCOS } = await import('./index.js')

      await uploadToCOS({
        outDir,
        files,
        base,
        options: this.options
      })
    }

    if (compiler.hooks.afterEmit.tapPromise) {
      compiler.hooks.afterEmit.tapPromise(pluginName, upload)
      return
    }

    compiler.hooks.afterEmit.tapAsync(pluginName, (compilation, callback) => {
      upload(compilation).then(() => callback(), callback)
    })
  }
}

module.exports = WebpackPluginWalleCOS
module.exports.default = WebpackPluginWalleCOS
module.exports.WebpackPluginWalleCOS = WebpackPluginWalleCOS
