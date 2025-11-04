import { Plugin } from 'vite'
import {GetAuthorizationOptions, GetAuthorizationCallbackParams} from 'cos-nodejs-sdk-v5'

interface Options {
  /** tencent cloud cos region */
  region: string
  /** tencent cloud cos SecretId */
  SecretId: string
  /** tencent cloud cos SecretKey */
  SecretKey: string
  /** tencent cloud cos bucket */
  bucket: string
  /** Ignore file rules. If you use empty string `''`, no files will be ignored. Default '\*\*\/\*.html' */
  ignore?: string[] | string
  /** Only test path, no files upload. Default false */
  test?: boolean
  /** 禁用本插件上传. Default true */
  enabled?: boolean
  /** Number of retries when upload (default 0) */
  retry?: number
  /** 获取签名的回调方法，如果没有 SecretId、SecretKey 时，这个参数必选 */
  getAuthorization?: (options: GetAuthorizationOptions,
    /** callback 获取完签名或临时密钥后，回传给 SDK 的方法 */
      callback: (
        /** params 回传给 SDK 的签名或获取临时密钥 */
        params: GetAuthorizationCallbackParams,
      ) => void,) => void
  /** 超时时间，单位毫秒，默认为0，即不设置超时时间 */
  Timeout?: string | number
}

declare function vitePluginAliOss(options: Options): Plugin

export { vitePluginAliOss as default }
