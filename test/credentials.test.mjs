import assert from 'node:assert/strict'
import http from 'node:http'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import COS from 'cos-nodejs-sdk-v5'
import {
  createTemporaryCredentialProvider,
  requestTemporaryCredentials,
  uploadToCOS
} from '../index.js'

function credentials(overrides = {}) {
  const now = Math.floor(Date.now() / 1000)

  return {
    TmpSecretId: 'temporary-id',
    TmpSecretKey: 'temporary-key',
    SecurityToken: 'temporary-token',
    StartTime: now - 1,
    ExpiredTime: now + 3600,
    ...overrides
  }
}

const CREDENTIAL_ENDPOINT = 'https://credential.example.com/cos'

async function requestWithResponse(response) {
  return requestTemporaryCredentials({
    endpoint: CREDENTIAL_ENDPOINT,
    request: async () => response,
    transformResponse: () => response
  })
}

async function uploadWithCOSOptions(outDir, options = {}, base = 'https://static.example.com/app/') {
  return uploadToCOS({
    outDir,
    base,
    options: {
      bucket: 'test-1234567890',
      region: 'ap-beijing',
      SecretId: 'test-id',
      SecretKey: 'test-key',
      ...options
    }
  })
}

test('normalizes credential timestamps supplied in milliseconds', async () => {
  const now = Math.floor(Date.now() / 1000)
  const result = await requestWithResponse(credentials({
    StartTime: (now - 1) * 1000,
    ExpiredTime: (now + 3600) * 1000
  }))

  assert.equal(result.StartTime, now - 1)
  assert.equal(result.ExpiredTime, now + 3600)
})

test('does not treat a zero primary timestamp as a missing nullish value', async () => {
  const now = Math.floor(Date.now() / 1000)

  await assert.rejects(
    requestWithResponse(credentials({
      StartTime: 0,
      startTime: now - 1
    })),
    /StartTime is invalid/
  )
})

test('rejects a missing output directory for a full-directory upload', async () => {
  const parentDir = await mkdtemp(path.join(tmpdir(), 'walle-missing-output-'))
  const outDir = path.join(parentDir, 'missing')

  try {
    await assert.rejects(
      uploadToCOS({
        outDir,
        base: 'https://static.example.com/app/',
        options: { bucket: 'test-1234567890', region: 'ap-beijing', test: true }
      }),
      /output directory does not exist/
    )
  } finally {
    await rm(parentDir, { recursive: true, force: true })
  }
})

test('skips COS client initialization for an empty directory', async () => {
  const outDir = await mkdtemp(path.join(tmpdir(), 'walle-empty-output-'))
  const originalLog = console.log
  const logs = []
  console.log = (...args) => logs.push(args.map(String).join(' '))

  try {
    await uploadToCOS({
      outDir,
      base: 'https://static.example.com/app/',
      options: { bucket: 'test-1234567890', region: 'ap-beijing' }
    })
    assert.deepEqual(logs, [])
  } finally {
    console.log = originalLog
    await rm(outDir, { recursive: true, force: true })
  }
})

test('skips COS client initialization when SSR server assets are ignored', async () => {
  const outDir = await mkdtemp(path.join(tmpdir(), 'walle-empty-ssr-server-'))
  const originalLog = console.log
  const logs = []
  console.log = (...args) => logs.push(args.map(String).join(' '))

  try {
    await writeFile(path.join(outDir, 'server.js'), 'export default 1')
    await uploadToCOS({
      outDir,
      base: 'https://static.example.com/app/',
      ssrServer: true,
      options: { bucket: 'test-1234567890', region: 'ap-beijing' }
    })
    assert.deepEqual(logs, [])
  } finally {
    console.log = originalLog
    await rm(outDir, { recursive: true, force: true })
  }
})

test('skips explicit empty uploads without credentials but keeps required-option validation', async () => {
  const parentDir = await mkdtemp(path.join(tmpdir(), 'walle-empty-selected-'))
  const outDir = path.join(parentDir, 'missing')
  const upload = options => uploadToCOS({
    outDir,
    files: [],
    base: 'https://static.example.com/app/',
    options
  })

  try {
    await upload({ bucket: 'test-1234567890', region: 'ap-beijing' })
    await assert.rejects(upload({ bucket: '', region: 'ap-beijing' }), /bucket and region are required/)
  } finally {
    await rm(parentDir, { recursive: true, force: true })
  }
})

test('rejects a malformed credential start time', async () => {
  await assert.rejects(
    requestWithResponse(credentials({ StartTime: 'not-a-timestamp' })),
    /StartTime|start time/i
  )
})

test('rejects a malformed credential expiry time', async () => {
  await assert.rejects(
    requestWithResponse(credentials({ ExpiredTime: 'not-a-timestamp' })),
    /ExpiredTime|expiry time/i
  )
})

test('includes gateway details for HTTP and business failures', async () => {
  const server = http.createServer((request, response) => {
    response.setHeader('content-type', 'application/json')
    if (request.url === '/http-error') {
      response.statusCode = 400
      response.end(JSON.stringify({ message: 'channel not allowed\nplease check' }))
      return
    }
    response.end(JSON.stringify({ code: '1001', message: 'credential scope is not enabled' }))
  })

  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })

  const { port } = server.address()

  try {
    await assert.rejects(
      requestTemporaryCredentials({
        endpoint: `http://127.0.0.1:${port}/http-error`,
        params: {}
      }),
      /HTTP 400: channel not allowed please check/
    )
    await assert.rejects(
      requestTemporaryCredentials({
        endpoint: `http://127.0.0.1:${port}/business-error`,
        params: {}
      }),
      /does not contain credential data: credential scope is not enabled/
    )
  } finally {
    await new Promise(resolve => server.close(resolve))
  }
})

test('sets content length for credential POST bodies', async () => {
  const expectedBody = JSON.stringify({ scope: 'assets' })
  let observedRequest
  const server = http.createServer((request, response) => {
    const chunks = []
    request.on('data', chunk => chunks.push(chunk))
    request.on('end', () => {
      observedRequest = {
        contentLength: request.headers['content-length'],
        transferEncoding: request.headers['transfer-encoding'],
        body: Buffer.concat(chunks).toString('utf8')
      }
      response.setHeader('content-type', 'application/json')
      response.end(JSON.stringify({ data: credentials() }))
    })
  })

  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })

  const { port } = server.address()

  try {
    await requestTemporaryCredentials({
      endpoint: `http://127.0.0.1:${port}/credential`,
      method: 'POST',
      params: {},
      data: { scope: 'assets' }
    })

    assert.equal(observedRequest.contentLength, String(Buffer.byteLength(expectedBody)))
    assert.equal(observedRequest.transferEncoding, undefined)
    assert.equal(observedRequest.body, expectedBody)
  } finally {
    await new Promise(resolve => server.close(resolve))
  }
})

test('preserves typed-array credential request bodies as bytes', async () => {
  const expectedBody = Buffer.from([1, 2, 255])
  let receivedBody
  const server = http.createServer((request, response) => {
    const chunks = []
    request.on('data', chunk => chunks.push(chunk))
    request.on('end', () => {
      receivedBody = Buffer.concat(chunks)
      response.setHeader('content-type', 'application/json')
      response.end(JSON.stringify({ data: credentials() }))
    })
  })

  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })

  const { port } = server.address()

  try {
    await requestTemporaryCredentials({
      endpoint: `http://127.0.0.1:${port}/credential`,
      method: 'POST',
      params: {},
      data: new Uint8Array(expectedBody)
    })
    assert.deepEqual(receivedBody, expectedBody)
  } finally {
    await new Promise(resolve => server.close(resolve))
  }
})

test('uses the documented 60-second credential refresh window by default', async () => {
  let requestCount = 0
  const getCredentials = createTemporaryCredentialProvider({
    endpoint: CREDENTIAL_ENDPOINT,
    request: async () => {
      requestCount += 1
      return null
    },
    transformResponse: () => credentials({
      StartTime: Math.floor(Date.now() / 1000) - 1200,
      ExpiredTime: Math.floor(Date.now() / 1000) + 45
    })
  })

  await getCredentials()
  await getCredentials()

  assert.equal(requestCount, 2)
})

test('reuses valid cached credentials after a refresh request fails', async () => {
  const originalNow = Date.now
  const originalError = console.error
  let currentTime = Math.floor(originalNow() / 1000)
  let requestCount = 0
  const refreshError = new Error('temporary gateway error')
  Date.now = () => currentTime * 1000
  console.error = () => {}

  const getCredentials = createTemporaryCredentialProvider({
    endpoint: CREDENTIAL_ENDPOINT,
    request: async () => {
      requestCount += 1
      if (requestCount > 1) {
        throw refreshError
      }
      return null
    },
    transformResponse: () => credentials({
      StartTime: currentTime - 7200,
      ExpiredTime: currentTime + 7200
    })
  })

  try {
    const cachedCredentials = await getCredentials()
    currentTime += 7145

    const fallbackCredentials = await getCredentials()
    const cachedDuringBackoff = await getCredentials()

    assert.equal(fallbackCredentials, cachedCredentials)
    assert.equal(cachedDuringBackoff, cachedCredentials)
    assert.equal(requestCount, 2)
  } finally {
    Date.now = originalNow
    console.error = originalError
  }
})

test('caches short-lived credentials instead of refreshing on every call', async () => {
  let requestCount = 0
  const getCredentials = createTemporaryCredentialProvider({
    endpoint: CREDENTIAL_ENDPOINT,
    request: async () => {
      requestCount += 1
      return null
    },
    transformResponse: () => credentials({
      ExpiredTime: Math.floor(Date.now() / 1000) + 45
    })
  })

  await getCredentials()
  await getCredentials()

  assert.equal(requestCount, 1)
})

test('rejects an aborted credential response instead of remaining pending', async () => {
  const server = http.createServer((_request, response) => {
    response.writeHead(200, {
      'content-type': 'application/json',
      'content-length': '100',
      connection: 'close'
    })
    response.write('{"data":')
    response.socket.end()
  })

  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })

  const { port } = server.address()
  const pending = requestTemporaryCredentials({
    endpoint: `http://127.0.0.1:${port}/credential`,
    timeout: 0
  }).then(
    () => ({ status: 'resolved' }),
    error => ({ status: 'rejected', error })
  )
  let timer

  try {
    const outcome = await Promise.race([
      pending,
      new Promise(resolve => {
        timer = setTimeout(() => resolve({ status: 'pending' }), 400)
      })
    ])
    assert.equal(outcome.status, 'rejected')
    assert.match(String(outcome.error), /abort|response|socket|credential/i)
  } finally {
    clearTimeout(timer)
    await new Promise(resolve => server.close(resolve))
  }
})

test('rejects credential requests that exceed their deadline', async () => {
  const server = http.createServer(() => {})

  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })

  const { port } = server.address()

  try {
    await assert.rejects(
      requestTemporaryCredentials({
        endpoint: `http://127.0.0.1:${port}/credential`,
        timeout: 20
      }),
      /timed out/i
    )
  } finally {
    await new Promise(resolve => server.close(resolve))
  }
})

test('rejects incomplete permanent credentials before requesting temporary credentials', async () => {
  const outDir = await mkdtemp(path.join(tmpdir(), 'walle-partial-credentials-'))

  try {
    await writeFile(path.join(outDir, 'asset.js'), 'export default 1')
    await assert.rejects(
      uploadToCOS({
        outDir,
        base: 'https://static.example.com/app/',
        options: {
          bucket: 'test-1234567890',
          region: 'ap-beijing',
          SecretId: 'permanent-id'
        }
      }),
      /SecretId and SecretKey must be provided together/
    )
  } finally {
    await rm(outDir, { recursive: true, force: true })
  }
})

test('passes COS slice thresholds to the client and defaults storage class per upload', async () => {
  const outDir = await mkdtemp(path.join(tmpdir(), 'walle-upload-options-'))
  const originalUploadFile = COS.prototype.uploadFile
  const originalLog = console.log
  const uploadCalls = []
  const uploadLogs = []
  console.log = (...args) => uploadLogs.push(args.map(String).join(' '))
  COS.prototype.uploadFile = function captureUploadOptions(params) {
    uploadCalls.push({
      params,
      sliceSize: this.options.SliceSize,
      chunkSize: this.options.ChunkSize,
      secretId: this.options.SecretId,
      secretKey: this.options.SecretKey
    })
    return Promise.resolve()
  }

  try {
    await writeFile(path.join(outDir, 'asset.js'), 'export default 1')
    await uploadWithCOSOptions(outDir)
    await uploadWithCOSOptions(outDir, { SliceSize: undefined, ChunkSize: undefined })
    await uploadWithCOSOptions(outDir, { StorageClass: 'STANDARD_IA' })
    await uploadWithCOSOptions(outDir, { StorageClass: '' })
    await uploadWithCOSOptions(outDir, { SliceSize: 2 * 1024 * 1024 })
    await uploadWithCOSOptions(outDir, {
      StorageClass: 'STANDARD_IA',
      SliceSize: 3 * 1024 * 1024,
      ChunkSize: 4 * 1024 * 1024
    })
    const rawPrefixedStart = uploadLogs.length
    await uploadWithCOSOptions(outDir, { UseRawKey: true })
    const rawPrefixedLogs = uploadLogs.slice(rawPrefixedStart)
    const rawRootStart = uploadLogs.length
    await uploadWithCOSOptions(outDir, { UseRawKey: true }, 'https://static.example.com/')
    const rawRootLogs = uploadLogs.slice(rawRootStart)
    await uploadWithCOSOptions(outDir, {
      SecretId: 'lower-priority-id',
      SecretKey: undefined,
      Credentials: { secretId: 'sdk-id', secretKey: 'sdk-key' }
    })

    assert.equal(uploadCalls[0].params.StorageClass, 'STANDARD')
    assert.equal('SliceSize' in uploadCalls[0].params, false)
    assert.equal(uploadCalls[0].sliceSize, 1024 * 1024)
    assert.equal(uploadCalls[0].chunkSize, 1024 * 1024)

    assert.equal(uploadCalls[1].sliceSize, 1024 * 1024)
    assert.equal(uploadCalls[1].chunkSize, 1024 * 1024)
    assert.equal('SliceSize' in uploadCalls[1].params, false)

    assert.equal(uploadCalls[2].params.StorageClass, 'STANDARD_IA')
    assert.equal('SliceSize' in uploadCalls[2].params, false)

    assert.equal(uploadCalls[3].params.StorageClass, 'STANDARD')
    assert.equal('SliceSize' in uploadCalls[3].params, false)

    assert.equal(uploadCalls[4].params.StorageClass, 'STANDARD')
    assert.equal('SliceSize' in uploadCalls[4].params, false)
    assert.equal(uploadCalls[4].sliceSize, 2 * 1024 * 1024)

    assert.equal(uploadCalls[5].params.StorageClass, 'STANDARD_IA')
    assert.equal('SliceSize' in uploadCalls[5].params, false)
    assert.equal(uploadCalls[5].sliceSize, 3 * 1024 * 1024)
    assert.equal(uploadCalls[5].chunkSize, 4 * 1024 * 1024)

    assert.equal(uploadCalls[0].params.Key, 'app/asset.js')
    assert.equal(uploadCalls[6].params.Key, 'app/asset.js')
    assert.ok(rawPrefixedLogs.some(line => line.includes('=> https://static.example.com/app/asset.js')))
    assert.equal(uploadCalls[7].params.Key, 'asset.js')
    assert.ok(rawRootLogs.some(line => line.includes('=> https://static.example.com/asset.js')))
    assert.equal(uploadCalls[8].secretId, 'sdk-id')
    assert.equal(uploadCalls[8].secretKey, 'sdk-key')

    await assert.rejects(
      uploadWithCOSOptions(outDir, {
        SecretId: undefined,
        SecretKey: undefined,
        Credentials: { secretId: 'only-id' }
      }),
      /Credentials\.secretId and Credentials\.secretKey must be provided together/
    )
    await assert.rejects(
      uploadWithCOSOptions(outDir, {
        SecretId: undefined,
        SecretKey: undefined,
        Credentials: {}
      }),
      /Credentials\.secretId and Credentials\.secretKey must be provided together/
    )
    await assert.rejects(
      uploadWithCOSOptions(outDir, {
        Credentials: { secretId: 123, secretKey: 456 }
      }),
      /Credentials\.secretId and Credentials\.secretKey must be provided together/
    )
    await assert.rejects(
      uploadWithCOSOptions(outDir, {
        Credentials: { secretId: ' ', secretKey: '\t' }
      }),
      /Credentials\.secretId and Credentials\.secretKey must be provided together/
    )

    await assert.rejects(
      uploadWithCOSOptions(outDir, { SliceSize: Number.NaN }),
      /SliceSize must be a positive safe integer in bytes; received NaN/
    )
    await assert.rejects(
      uploadWithCOSOptions(outDir, { ForcePathStyle: true }),
      /ForcePathStyle is not supported by cos-nodejs-sdk-v5/
    )
  } finally {
    COS.prototype.uploadFile = originalUploadFile
    console.log = originalLog
    await rm(outDir, { recursive: true, force: true })
  }
})

test('does not mutate caller-provided COS credential objects', async () => {
  const outDir = await mkdtemp(path.join(tmpdir(), 'walle-static-credentials-'))
  const sharedCredentials = Object.freeze({ secretId: 'sdk-id', secretKey: 'sdk-key' })
  const originalUploadFile = COS.prototype.uploadFile
  COS.prototype.uploadFile = () => Promise.resolve()

  try {
    await writeFile(path.join(outDir, 'asset.js'), 'export default 1')
    await uploadWithCOSOptions(outDir, { Credentials: sharedCredentials })
    await uploadWithCOSOptions(outDir, { Credentials: sharedCredentials })
  } finally {
    COS.prototype.uploadFile = originalUploadFile
    await rm(outDir, { recursive: true, force: true })
  }
})

test('accepts lowercase secretId and secretKey aliases', async () => {
  const outDir = await mkdtemp(path.join(tmpdir(), 'walle-lowercase-credentials-'))
  const originalUploadFile = COS.prototype.uploadFile
  const originalLog = console.log
  const uploadCalls = []
  console.log = () => {}
  COS.prototype.uploadFile = function captureUploadOptions(params) {
    uploadCalls.push({
      key: params.Key,
      secretId: this.options.SecretId,
      secretKey: this.options.SecretKey,
      forwardedLowercaseSecretId: 'secretId' in this.options
    })
    return Promise.resolve()
  }

  try {
    await writeFile(path.join(outDir, 'asset.js'), 'export default 1')
    await uploadToCOS({
      outDir,
      base: 'https://static.example.com/app/',
      options: {
        bucket: 'test-1234567890',
        region: 'ap-beijing',
        secretId: 'lowercase-id',
        secretKey: 'lowercase-key'
      }
    })
    await uploadToCOS({
      outDir,
      base: 'https://static.example.com/app/',
      options: {
        bucket: 'test-1234567890',
        region: 'ap-beijing',
        SecretId: 'uppercase-id',
        SecretKey: 'uppercase-key',
        secretId: 'lowercase-id',
        secretKey: 'lowercase-key'
      }
    })

    assert.equal(uploadCalls.length, 2)
    assert.equal(uploadCalls[0].secretId, 'lowercase-id')
    assert.equal(uploadCalls[0].secretKey, 'lowercase-key')
    assert.equal(uploadCalls[0].forwardedLowercaseSecretId, false)
    assert.equal(uploadCalls[1].secretId, 'uppercase-id')
    assert.equal(uploadCalls[1].secretKey, 'uppercase-key')
  } finally {
    COS.prototype.uploadFile = originalUploadFile
    console.log = originalLog
    await rm(outDir, { recursive: true, force: true })
  }
})

test('rejects non-string lowercase permanent credential aliases', async () => {
  const outDir = await mkdtemp(path.join(tmpdir(), 'walle-invalid-lowercase-credentials-'))

  try {
    await writeFile(path.join(outDir, 'asset.js'), 'export default 1')
    await assert.rejects(
      uploadWithCOSOptions(outDir, {
        SecretId: undefined,
        SecretKey: undefined,
        secretId: 123,
        secretKey: 'lowercase-key'
      }),
      /SecretId and SecretKey must be provided together as non-empty strings/
    )
  } finally {
    await rm(outDir, { recursive: true, force: true })
  }
})

test('does not mask a credential error after a later authorization succeeds', async () => {
  const outDir = await mkdtemp(path.join(tmpdir(), 'walle-credential-race-'))
  const credentialError = new Error('credential gateway unavailable')
  const originalUploadFile = COS.prototype.uploadFile
  const originalLog = console.log
  const originalError = console.error
  let requestCount = 0
  console.log = () => {}
  console.error = () => {}

  COS.prototype.uploadFile = function uploadFileWithAuthorizationRace() {
    const getAuthorization = this.options.getAuthorization
    return new Promise((resolve, reject) => {
      const firstAuthorization = new Promise(callback => getAuthorization({}, callback))
      setImmediate(async () => {
        const secondAuthorization = new Promise(callback => getAuthorization({}, callback))
        const [first, second] = await Promise.all([firstAuthorization, secondAuthorization])
        if (first.TmpSecretId || !second.TmpSecretId) {
          reject(new Error('authorization callbacks did not exercise failure followed by success'))
          return
        }
        reject(new Error('getAuthorization callback params missing "TmpSecretId"'))
      })
    })
  }

  try {
    await writeFile(path.join(outDir, 'asset.js'), 'export default 1')
    await assert.rejects(
      uploadToCOS({
        outDir,
        base: 'https://static.example.com/app/',
        options: {
          bucket: 'test-1234567890',
          region: 'ap-beijing',
          temporaryCredentials: {
            endpoint: CREDENTIAL_ENDPOINT,
            request: async () => {
              if (requestCount++ === 0) {
                throw credentialError
              }
              return null
            },
            transformResponse: () => credentials()
          }
        }
      }),
      error => error === credentialError
    )
  } finally {
    COS.prototype.uploadFile = originalUploadFile
    console.log = originalLog
    console.error = originalError
    await rm(outDir, { recursive: true, force: true })
  }
})

test('does not reuse a delayed credential error from a prior upload attempt', async () => {
  const outDir = await mkdtemp(path.join(tmpdir(), 'walle-stale-credential-error-'))
  const originalUploadFile = COS.prototype.uploadFile
  const originalLog = console.log
  const originalError = console.error
  const staleError = new Error('stale credential request failure')
  const currentError = new Error('current credential request failure')
  let uploadCount = 0
  let requestCount = 0
  console.log = () => {}
  console.error = () => {}

  COS.prototype.uploadFile = function uploadFileWithDelayedAuthorization() {
    uploadCount += 1
    if (uploadCount === 1) {
      this.options.getAuthorization({}, () => {})
      return Promise.reject(new Error('unrelated upload transport failure'))
    }

    return new Promise(resolve => this.options.getAuthorization({}, resolve))
      .then(() => Promise.reject(new Error('getAuthorization callback params missing "TmpSecretId"')))
  }

  try {
    await writeFile(path.join(outDir, 'asset.js'), 'export default 1')
    await assert.rejects(
      uploadToCOS({
        outDir,
        base: 'https://static.example.com/app/',
        options: {
          bucket: 'test-1234567890',
          region: 'ap-beijing',
          retry: 1,
          temporaryCredentials: {
            endpoint: CREDENTIAL_ENDPOINT,
            request: async () => {
              const currentRequest = requestCount++
              if (currentRequest === 0) {
                await new Promise(resolve => setTimeout(resolve, 10))
                throw staleError
              }
              throw currentError
            }
          }
        }
      }),
      error => error === currentError && error !== staleError
    )
  } finally {
    COS.prototype.uploadFile = originalUploadFile
    console.log = originalLog
    console.error = originalError
    await rm(outDir, { recursive: true, force: true })
  }
})

test('preserves COS upload errors when credential refresh also fails', async () => {
  const outDir = await mkdtemp(path.join(tmpdir(), 'walle-cos-upload-error-'))
  const originalUploadFile = COS.prototype.uploadFile
  const originalError = console.error
  console.error = () => {}
  COS.prototype.uploadFile = function uploadFileWithAccessDenied() {
    return new Promise((resolve, reject) => {
      this.options.getAuthorization({}, () => reject(new Error('403 AccessDenied')))
    })
  }

  try {
    await writeFile(path.join(outDir, 'asset.js'), 'export default 1')
    await assert.rejects(
      uploadToCOS({
        outDir,
        base: 'https://static.example.com/app/',
        options: {
          bucket: 'test-1234567890',
          region: 'ap-beijing',
          temporaryCredentials: {
            endpoint: CREDENTIAL_ENDPOINT,
            request: async () => {
              throw new Error('credential gateway timeout')
            }
          }
        }
      }),
      /403 AccessDenied/
    )
  } finally {
    COS.prototype.uploadFile = originalUploadFile
    console.error = originalError
    await rm(outDir, { recursive: true, force: true })
  }
})

test('accepts XCosSecurityToken supplied by the credential gateway', async () => {
  const now = Math.floor(Date.now() / 1000)
  const result = await requestWithResponse({
    TmpSecretId: 'temporary-id',
    TmpSecretKey: 'temporary-key',
    XCosSecurityToken: 'temporary-token',
    StartTime: now - 1,
    ExpiredTime: now + 3600
  })

  assert.equal(result.SecurityToken, 'temporary-token')
})

test('falls back to the default timeout for non-positive values', async () => {
  let observedTimeout
  await requestTemporaryCredentials({
    endpoint: CREDENTIAL_ENDPOINT,
    timeout: 0,
    request: async requestOptions => {
      observedTimeout = requestOptions.timeout
      return { data: credentials() }
    }
  })

  assert.equal(observedTimeout, 10000)
})

test('rejects a credential request without an endpoint', async () => {
  await assert.rejects(
    requestTemporaryCredentials({ request: async () => null }),
    /temporary credential endpoint is required/
  )
})

test('rejects an invalid credential endpoint URL', async () => {
  await assert.rejects(
    requestTemporaryCredentials({ endpoint: 'not-a-url', request: async () => null }),
    /not a valid URL/
  )
  await assert.rejects(
    requestTemporaryCredentials({ endpoint: 'ftp://credential.example.com/cos', request: async () => null }),
    /must be an http\(s\) URL/
  )
})

test('only allows GET and POST credential requests and normalizes the method', async () => {
  const methods = []
  const request = async requestOptions => {
    methods.push(requestOptions.method)
    return { data: credentials() }
  }

  await requestTemporaryCredentials({ endpoint: CREDENTIAL_ENDPOINT, request })
  await requestTemporaryCredentials({ endpoint: CREDENTIAL_ENDPOINT, method: 'post', request })
  assert.deepEqual(methods, ['GET', 'POST'])

  await assert.rejects(
    requestTemporaryCredentials({ endpoint: CREDENTIAL_ENDPOINT, method: 'PUT', request }),
    /must be GET or POST/
  )
})

test('requires an endpoint before uploading with temporary credentials', async () => {
  const outDir = await mkdtemp(path.join(tmpdir(), 'walle-no-endpoint-'))

  try {
    await writeFile(path.join(outDir, 'asset.js'), 'export default 1')
    await assert.rejects(
      uploadToCOS({
        outDir,
        base: 'https://static.example.com/app/',
        options: { bucket: 'test-1234567890', region: 'ap-beijing' }
      }),
      /temporary credential endpoint is required/
    )
  } finally {
    await rm(outDir, { recursive: true, force: true })
  }
})

test('rejects provider calls without a credential endpoint', async () => {
  const getCredentials = createTemporaryCredentialProvider({})

  await assert.rejects(getCredentials(), /temporary credential endpoint is required/)
})

test('rejects when only some selected upload files are missing', async () => {
  const outDir = await mkdtemp(path.join(tmpdir(), 'walle-partial-files-'))

  try {
    await writeFile(path.join(outDir, 'keep.js'), 'export default 1')
    await assert.rejects(
      uploadToCOS({
        outDir,
        files: ['keep.js', 'missing.js'],
        base: 'https://static.example.com/app/',
        options: { bucket: 'test-1234567890', region: 'ap-beijing', test: true }
      }),
      /selected upload files were not found[\s\S]*missing\.js/
    )
  } finally {
    await rm(outDir, { recursive: true, force: true })
  }
})

test('surfaces the original temporary credential request error', async () => {
  const outDir = await mkdtemp(path.join(tmpdir(), 'walle-credential-error-'))
  const credentialError = new Error('credential gateway unavailable')
  const originalLog = console.log
  const originalError = console.error
  console.log = () => {}
  console.error = () => {}

  try {
    await writeFile(path.join(outDir, 'asset.js'), 'export default 1')
    await assert.rejects(
      uploadToCOS({
        outDir,
        base: 'https://static.example.com/app/',
        options: {
          bucket: 'test-1234567890',
          region: 'ap-beijing',
          temporaryCredentials: {
            endpoint: CREDENTIAL_ENDPOINT,
            request: async () => {
              throw credentialError
            }
          }
        }
      }),
      error => error === credentialError || error.cause === credentialError
    )
  } finally {
    console.log = originalLog
    console.error = originalError
    await rm(outDir, { recursive: true, force: true })
  }
})
