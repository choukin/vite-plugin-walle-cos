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
  /** 临时密钥接口地址，必填；未提供时上传直接报错 */
  endpoint?: string
  /** 请求方法，不区分大小写，仅支持 GET（默认）和 POST */
  method?: TemporaryCredentialMethodInput
  /** URL 查询参数，默认不附加 */
  params?: Record<string, unknown>
  /** 请求头 */
  headers?: Record<string, string>
  /** 非 GET/HEAD 请求的请求体；普通对象默认序列化为 JSON */
  data?: unknown
  /** 请求超时，单位毫秒，默认 10000；非正数或非法值回退到默认值 */
  timeout?: number
  /** 自定义请求实现，返回接口响应体 */
  request?: (options: TemporaryCredentialRequest) => Promise<unknown>
  /** 将自定义接口响应转换为临时密钥 */
  transformResponse?: (response: unknown) => TemporaryCredentials | Record<string, unknown> | Promise<TemporaryCredentials | Record<string, unknown>>
  /** 到期前提前刷新秒数，默认 60 */
  refreshBeforeExpires?: number
}

export interface Options {
  /** Tencent COS 地域 */
  region: string
  /** 永久密钥 ID；未配置完整永久密钥时默认改用临时密钥 */
  SecretId?: string
  /** 永久密钥 Key；未配置完整永久密钥时默认改用临时密钥 */
  SecretKey?: string
  /** SecretId 的小写别名；同时配置时以 SecretId 为准 */
  secretId?: string
  /** SecretKey 的小写别名；同时配置时以 SecretKey 为准 */
  secretKey?: string
  /** Tencent COS 存储桶 */
  bucket: string
  /** 文件忽略规则，默认忽略所有 HTML 文件；传空字符串表示不忽略 */
  ignore?: string[] | string
  /** 仅打印上传路径，不上传文件，默认 false */
  test?: boolean
  /** 是否启用上传，默认 true；Webpack 下 watch 编译始终跳过 */
  enabled?: boolean
  /** 上传失败重试次数，默认 0 */
  retry?: number
  /** 自定义 COS SDK 授权回调；优先级低于显式 temporaryCredentials 配置 */
  getAuthorization?: (
    options: GetAuthorizationOptions,
    callback: (params: GetAuthorizationCallbackParams) => void,
  ) => void
  /** COS SDK 超时时间，单位毫秒 */
  Timeout?: string | number
  /** COS SDK 静态凭证；secretId 与 secretKey 必须同时提供 */
  Credentials?: COSCredentials
  /** COS SDK 自定义域名，支持 {Bucket} / {Region} / {AppId} 占位符；只影响请求地址与签名，不影响对象键 */
  Domain?: string
  /** COS SDK 请求协议：`http`、`http:`、`https` 或 `https:`；省略时由 SDK 决定 */
  Protocol?: 'http' | 'http:' | 'https' | 'https:'
  /** 是否把 Host 加入签名计算，SDK 默认 true；关闭会降低安全性 */
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
  /** 临时密钥配置；无永久密钥时默认启用，设为 false 可禁用 */
  temporaryCredentials?: boolean | TemporaryCredentialOptions
}

export interface UploadOptions {
  outDir?: string
  /** Restrict uploads to these paths relative to outDir; missing entries reject the upload */
  files?: string[]
  base: string
  ssrClient?: boolean
  ssrServer?: boolean
  options: Options
}

export type CloseBundleHandler = () => Promise<void>

/** Rollup 3+ 使用顺序 hook 对象；Rollup 2 只能使用函数形式 */
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
      /** Vite 2 - 5 为 `true`，Vite 6 及以后为配置对象；非空表示 watch 构建 */
      watch?: boolean | Record<string, unknown> | null
    }
  }): void
  readonly closeBundle: CloseBundleHook
}

export declare function requestTemporaryCredentials(options?: TemporaryCredentialOptions): Promise<TemporaryCredentials>

export declare function createTemporaryCredentialProvider(
  options?: TemporaryCredentialOptions,
): () => Promise<TemporaryCredentials>

export declare function uploadToCOS(options: UploadOptions): Promise<void>

declare function vitePluginWalleCOS(options?: Options): WalleVitePlugin

export default vitePluginWalleCOS
