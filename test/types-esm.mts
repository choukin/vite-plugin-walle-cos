import type { TemporaryCredentialMethod, TemporaryCredentialMethodInput } from 'vite-plugin-walle-cos'
import vitePluginWalleCOS, {
  createTemporaryCredentialProvider,
  requestTemporaryCredentials,
  uploadToCOS
} from 'vite-plugin-walle-cos'
import WebpackPluginWalleCOS from 'vite-plugin-walle-cos/webpack'

vitePluginWalleCOS({ bucket: 'test-1234567890', region: 'ap-beijing' })
const callbackMethod: TemporaryCredentialMethod = 'GET'
const lowercaseInputMethod: TemporaryCredentialMethodInput = 'post'
const mixedCaseInputMethod: TemporaryCredentialMethodInput = 'pOsT'
void callbackMethod
void lowercaseInputMethod
void mixedCaseInputMethod
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
  SecretId: 'secret-id-placeholder',
  SecretKey: 'secret-key-placeholder',
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
createTemporaryCredentialProvider()
void requestTemporaryCredentials()
void uploadToCOS({ base: 'https://static.example.com/', options: { bucket: 'test-1234567890', region: 'ap-beijing' } })
// @ts-expect-error COS SDK Protocol only accepts HTTP protocols.
vitePluginWalleCOS({ bucket: 'test-1234567890', region: 'ap-beijing', Protocol: 'ftp:' })
// @ts-expect-error COS StorageClass must be a supported literal.
vitePluginWalleCOS({ bucket: 'test-1234567890', region: 'ap-beijing', StorageClass: 'NOT_A_STORAGE_CLASS' })
// @ts-expect-error Plugin option names remain checked for typos.
vitePluginWalleCOS({ bucket: 'test-1234567890', region: 'ap-beijing', Storageclass: 'ARCHIVE' })
// @ts-expect-error The COS SDK no longer supports ForcePathStyle.
vitePluginWalleCOS({ bucket: 'test-1234567890', region: 'ap-beijing', ForcePathStyle: true })
new WebpackPluginWalleCOS({ bucket: 'test-1234567890', region: 'ap-beijing' })
