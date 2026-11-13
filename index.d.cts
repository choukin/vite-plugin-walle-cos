declare function vitePluginWalleCOS(options?: vitePluginWalleCOS.Options): vitePluginWalleCOS.WalleVitePlugin

declare namespace vitePluginWalleCOS {
  export interface TemporaryCredentials {
    TmpSecretId: string
    TmpSecretKey: string
    SecurityToken: string
    StartTime: number
    ExpiredTime: number
  }

  export type TemporaryCredentialMethod = 'GET' | 'POST'
  export type TemporaryCredentialMethodInput =
    | 'GET'
    | 'Get'
    | 'GeT'
    | 'GEt'
    | 'gET'
    | 'gEt'
    | 'geT'
    | 'get'
    | 'POST'
    | 'POSt'
    | 'POsT'
    | 'POst'
    | 'PoST'
    | 'PoSt'
    | 'PosT'
    | 'Post'
    | 'pOST'
    | 'pOSt'
    | 'pOsT'
    | 'pOst'
    | 'poST'
    | 'poSt'
    | 'posT'
    | 'post'

  export interface TemporaryCredentialRequest {
    url: string
    method: TemporaryCredentialMethod
    params?: Record<string, unknown>
    headers: Record<string, string>
    data?: unknown
    timeout: number
  }

  export interface TemporaryCredentialOptions {
    endpoint?: string
    /** HTTP method, case-insensitive; only GET (default) and POST are supported. */
    method?: TemporaryCredentialMethodInput
    params?: Record<string, unknown>
    headers?: Record<string, string>
    data?: unknown
    timeout?: number
    request?: (options: TemporaryCredentialRequest) => Promise<unknown>
    transformResponse?: (response: unknown) => TemporaryCredentials | Record<string, unknown> | Promise<TemporaryCredentials | Record<string, unknown>>
    refreshBeforeExpires?: number
  }

  export interface GetAuthorizationOptions {
    Bucket: string
    Region: string
    Method: 'GET' | 'DELETE' | 'POST' | 'PUT' | 'OPTIONS' | 'get' | 'delete' | 'post' | 'put' | 'options'
    Pathname: string
    Key: string
    Query: Record<string, unknown>
    Headers: Record<string, unknown>
    Scope: Array<{
      action: string
      bucket: string
      region: string
      prefix: string
    }>
    SystemClockOffset: number
  }

  export interface GetAuthorizationCredentials {
    TmpSecretId: string
    TmpSecretKey: string
    SecurityToken?: string
    XCosSecurityToken?: string
    StartTime: number
    ExpiredTime: number
    ScopeLimit?: boolean
    Authorization?: string
  }

  export type GetAuthorizationCallbackParams = string | GetAuthorizationCredentials

  export interface COSCredentials {
    secretId: string
    secretKey: string
  }

  export type COSStorageClass =
    | 'STANDARD'
    | 'STANDARD_IA'
    | 'ARCHIVE'
    | 'DEEP_ARCHIVE'
    | 'INTELLIGENT_TIERING'
    | 'MAZ_STANDARD'
    | 'MAZ_STANDARD_IA'
    | 'MAZ_INTELLIGENT_TIERING'

  export interface Options {
    region: string
    SecretId?: string
    SecretKey?: string
    /** Lowercase alias of SecretId; SecretId wins when both are set. */
    secretId?: string
    /** Lowercase alias of SecretKey; SecretKey wins when both are set. */
    secretKey?: string
    bucket: string
    ignore?: string[] | string
    test?: boolean
    /** Whether uploads are enabled. Defaults to true; watch compilations are always skipped under Webpack. */
    enabled?: boolean
    retry?: number
    getAuthorization?: (
      options: GetAuthorizationOptions,
      callback: (params: GetAuthorizationCallbackParams) => void
    ) => void
    Timeout?: string | number
    /** COS SDK 静态凭证；secretId 与 secretKey 必须同时提供 */
    Credentials?: COSCredentials
    /** 自定义 COS 域名，支持 {Bucket} / {Region} / {AppId} 占位符 */
    Domain?: string
    /** 请求协议：`http`、`http:`、`https` 或 `https:` */
    Protocol?: 'http' | 'http:' | 'https' | 'https:'
    /** 是否把 Host 加入签名计算，默认 true */
    ForceSignHost?: boolean
    /** COS 存储类型，按单个上传请求传递；省略时插件传入 STANDARD */
    StorageClass?: COSStorageClass
    /** COS SDK 分片上传阈值，单位字节；省略时使用 SDK 默认 1 MiB */
    SliceSize?: number
    SecurityToken?: string
    XCosSecurityToken?: string
    ChunkRetryTimes?: number
    FileParallelLimit?: number
    ChunkParallelLimit?: number
    ChunkSize?: number
    CopyChunkParallelLimit?: number
    CopyChunkSize?: number
    CopySliceSize?: number
    MaxPartNumber?: number
    ProgressInterval?: number
    UploadQueueSize?: number
    ServiceDomain?: string
    Proxy?: string
    Tunnel?: boolean
    CompatibilityMode?: boolean
    UseRawKey?: boolean
    CorrectClockSkew?: boolean
    SystemClockOffset?: number
    UploadCheckContentMd5?: boolean
    UploadAddMetaMd5?: boolean
    UploadIdCacheLimit?: number
    ConfCwd?: string
    FollowRedirect?: boolean
    UseAccelerate?: boolean
    KeepAlive?: boolean
    Ip?: string
    StrictSsl?: boolean
    UserAgent?: string
    AutoSwitchHost?: boolean
    ObjectKeySimplifyCheck?: boolean
    CopySourceParser?: (source: string) => null | { Bucket: string; Region: string; Key: string }
    temporaryCredentials?: boolean | TemporaryCredentialOptions
  }

  export interface UploadOptions {
    outDir?: string
    files?: string[]
    base: string
    ssrClient?: boolean
    ssrServer?: boolean
    options: Options
  }

  export type CloseBundleHandler = () => Promise<void>

  /** Rollup 3+ uses an object hook; Rollup 2 only accepts a function */
  export type CloseBundleHook =
    | CloseBundleHandler
    | { order: 'post'; sequential: true; handler: CloseBundleHandler }

  export interface WalleVitePlugin {
    name: string
    enforce: 'post'
    apply: 'build'
    configResolved(config: {
      root: string
      base: string
      build?: {
        outDir?: string
        ssrManifest?: boolean | string
        ssr?: boolean | string
        /** `true` on Vite 2 - 5, an options object on Vite 6+; truthy means a watch build. */
        watch?: boolean | Record<string, unknown> | null
      }
    }): void
    readonly closeBundle: CloseBundleHook
  }

  export function requestTemporaryCredentials(
    options?: TemporaryCredentialOptions
  ): Promise<TemporaryCredentials>

  export function createTemporaryCredentialProvider(
    options?: TemporaryCredentialOptions
  ): () => Promise<TemporaryCredentials>

  export function uploadToCOS(options: UploadOptions): Promise<void>
}

export = vitePluginWalleCOS
