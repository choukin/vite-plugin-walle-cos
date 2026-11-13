import type { Options as COSUploadOptions } from './index.js'

export interface WebpackOptions extends COSUploadOptions {
  /** 覆盖 Webpack output.publicPath；完整 http(s) URL、// 协议相对地址，或任意路径 / 相对前缀 */
  base?: string
  /** 覆盖 Webpack output.path */
  outDir?: string
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
        callback: (compilation: WebpackCompilation, done: (error?: Error) => void) => void,
      ) => void
    }
  }
}

export interface WebpackCompilation {
  assets?: Record<string, unknown>
  outputOptions?: {
    path?: string
    publicPath?: string
  }
}

declare class WebpackPluginWalleCOS {
  constructor(options: WebpackOptions)
  apply(compiler: WebpackCompiler): void
}

export { WebpackPluginWalleCOS }
export default WebpackPluginWalleCOS
