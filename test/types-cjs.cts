import vitePluginWalleCOS = require('vite-plugin-walle-cos')
import type * as EsmTypes from 'vite-plugin-walle-cos' with { 'resolution-mode': 'import' }
import WebpackPluginWalleCOS = require('vite-plugin-walle-cos/webpack')

vitePluginWalleCOS({ bucket: 'test-1234567890', region: 'ap-beijing' })
for (const method of ['GET', 'POST', 'get', 'post', 'GeT', 'pOsT'] as const) {
  vitePluginWalleCOS({
    bucket: 'test-1234567890',
    region: 'ap-beijing',
    temporaryCredentials: {
      endpoint: 'https://credentials.example.com',
      method,
      request: async ({ method: requestMethod }) => {
        const normalizedMethod: 'GET' | 'POST' = requestMethod
        void normalizedMethod
        return {}
      }
    }
  })
}
// @ts-expect-error Temporary credential requests only support GET and POST.
vitePluginWalleCOS({ bucket: 'test-1234567890', region: 'ap-beijing', temporaryCredentials: { endpoint: 'https://credentials.example.com', method: 'PATCH' } })
vitePluginWalleCOS({
  bucket: 'test-1234567890',
  region: 'ap-beijing',
  Domain: 'https://cdn.example.com/{Bucket}',
  Protocol: 'https:',
  ForceSignHost: false,
  StorageClass: 'STANDARD_IA',
  SliceSize: 2 * 1024 * 1024,
  ChunkSize: 4 * 1024 * 1024,
  UseAccelerate: true
})
vitePluginWalleCOS({
  bucket: 'test-1234567890',
  region: 'ap-beijing',
  Credentials: { secretId: 'secret-id-placeholder', secretKey: 'secret-key-placeholder' }
})
// @ts-expect-error Both static credential fields are required.
vitePluginWalleCOS({ bucket: 'test-1234567890', region: 'ap-beijing', Credentials: {} })
void vitePluginWalleCOS.requestTemporaryCredentials()
void vitePluginWalleCOS.uploadToCOS({
  base: 'https://static.example.com/',
  options: { bucket: 'test-1234567890', region: 'ap-beijing' }
})
new WebpackPluginWalleCOS({ bucket: 'test-1234567890', region: 'ap-beijing' })
WebpackPluginWalleCOS.WebpackPluginWalleCOS
// @ts-expect-error COS SDK Protocol only accepts HTTP protocols.
vitePluginWalleCOS({ bucket: 'test-1234567890', region: 'ap-beijing', Protocol: 'ftp:' })
// @ts-expect-error COS StorageClass must be a supported literal.
vitePluginWalleCOS({ bucket: 'test-1234567890', region: 'ap-beijing', StorageClass: 'NOT_A_STORAGE_CLASS' })
// @ts-expect-error Plugin option names remain checked for typos.
vitePluginWalleCOS({ bucket: 'test-1234567890', region: 'ap-beijing', Storageclass: 'ARCHIVE' })
// @ts-expect-error The COS SDK no longer supports ForcePathStyle.
vitePluginWalleCOS({ bucket: 'test-1234567890', region: 'ap-beijing', ForcePathStyle: true })

// The ESM and CommonJS declarations are maintained separately; keep them aligned.
declare const esmOptions: EsmTypes.Options
declare const cjsOptions: vitePluginWalleCOS.Options
const optionsFromEsm: vitePluginWalleCOS.Options = esmOptions
const optionsFromCjs: EsmTypes.Options = cjsOptions
declare const esmStorageClass: EsmTypes.COSStorageClass
const storageClassFromEsm: vitePluginWalleCOS.COSStorageClass = esmStorageClass
declare const cjsStorageClass: vitePluginWalleCOS.COSStorageClass
const storageClassFromCjs: EsmTypes.COSStorageClass = cjsStorageClass
declare const esmCredentials: EsmTypes.COSCredentials
const credentialsFromEsm: vitePluginWalleCOS.COSCredentials = esmCredentials
declare const cjsCredentials: vitePluginWalleCOS.COSCredentials
const credentialsFromCjs: EsmTypes.COSCredentials = cjsCredentials
void optionsFromEsm
void optionsFromCjs
void storageClassFromEsm
void storageClassFromCjs
void credentialsFromEsm
void credentialsFromCjs

declare const esmTemporaryCredentials: EsmTypes.TemporaryCredentialOptions
const temporaryCredentialsFromEsm: vitePluginWalleCOS.TemporaryCredentialOptions = esmTemporaryCredentials
declare const esmMethod: EsmTypes.TemporaryCredentialMethod
const cjsMethod: vitePluginWalleCOS.TemporaryCredentialMethod = esmMethod
declare const cjsMethodInput: vitePluginWalleCOS.TemporaryCredentialMethodInput
const esmMethodInput: EsmTypes.TemporaryCredentialMethodInput = cjsMethodInput
const mixedCaseInputMethod: vitePluginWalleCOS.TemporaryCredentialMethodInput = 'pOsT'
void temporaryCredentialsFromEsm
void cjsMethod
void esmMethodInput
void mixedCaseInputMethod
