import type vitePluginWalleCOS = require('./index.d.cts')

declare class WebpackPluginWalleCOS {
  static WebpackPluginWalleCOS: typeof WebpackPluginWalleCOS
  constructor(options: WebpackPluginWalleCOS.WebpackOptions)
  apply(compiler: WebpackPluginWalleCOS.WebpackCompiler): void
}

declare namespace WebpackPluginWalleCOS {
  export interface WebpackOptions extends vitePluginWalleCOS.Options {
    /** Override Webpack output.publicPath; accepts an HTTP(S) URL, a //-prefixed protocol-relative URL, or any path / relative prefix. */
    base?: string
    /** Override Webpack output.path. */
    outDir?: string
  }

  export interface WebpackCompilation {
    assets?: Record<string, unknown>
    outputOptions?: {
      path?: string
      publicPath?: string
    }
  }

  export interface WebpackCompiler {
    options: {
      mode?: 'development' | 'production' | 'none'
      output?: {
        path?: string
        publicPath?: string
      }
    }
    watchMode?: boolean
    hooks: {
      afterEmit: {
        tapPromise?: (name: string, callback: (compilation: WebpackCompilation) => Promise<void>) => void
        tapAsync: (
          name: string,
          callback: (compilation: WebpackCompilation, done: (error?: Error) => void) => void
        ) => void
      }
    }
  }
}

export = WebpackPluginWalleCOS
