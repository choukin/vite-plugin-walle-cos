import color from 'picocolors'
import { globSync } from 'tinyglobby'
import path from 'path'
import COS from 'cos-nodejs-sdk-v5'
import { URL } from 'node:url'
// 引入 ./package.json 中的 name 字段
import packageInfo from './package.json' with { type: 'json' }
const packName = packageInfo.name

import { normalizePath } from 'vite'

const retry = async (fn, time) => {
  while (true) {
    try {
      await fn()
      break
    } catch (error) {
      console.log(`🌹 ~ retry ~ error:`, error)

      if (time > 0) {
        time -= 1
        console.error(color.red(error))
        await new Promise(resolve => setTimeout(resolve, 500))
        console.log('')
        console.log('')
        console.log(`[vite-plugin-walle-cos] retry upload after 0.5s, ${time} times left`)
        console.log('')
      } else {
        throw new Error(error)
      }
    }
  }
}

export default function vitePluginWalleCOS(options) {
  let baseConfig = '/'
  let buildConfig = {}

  if (options.enabled !== void 0 && !options.enabled) {
    return
  }

  return {
    name: packName,
    enforce: 'post',
    apply: 'build',
    configResolved(config) {
      baseConfig = config.base
      buildConfig = config.build
    },

    closeBundle: {
      sequential: true,
      order: 'post',
      async handler() {
        if (!/^http/i.test(baseConfig)) {
          throw Error(`${packName} base must be a url`)
        }

        const outDirPath = normalizePath(path.resolve(normalizePath(buildConfig.outDir)))

        const { pathname: cosBasePath, origin: cosOrigin } = new URL(baseConfig)

        const createOssOption = Object.assign({}, options)
        delete createOssOption.overwrite
        delete createOssOption.ignore
        delete createOssOption.headers
        delete createOssOption.test
        delete createOssOption.enabled
        delete createOssOption.retry

        const client = new COS(createOssOption)
        const ssrClient = buildConfig.ssrManifest
        const ssrServer = buildConfig.ssr

        const files = globSync(
          outDirPath + '/**/*',
          {
            absolute: true,
            dot: true,
            ignore:
              // custom ignore
              options.ignore !== undefined ? options.ignore :
                // ssr client ignore
                ssrClient ? ['**/ssr-manifest.json', '**/*.html'] :
                  // ssr server ignore
                  ssrServer ? ['**'] :
                    // default ignore
                    '**/*.html'
          }
        )


        console.log('')
        console.log(`${packName} upload start` + (ssrClient ? ' (ssr client)' : ssrServer ? ' (ssr server)' : ''))
        console.log('')

        const startTime = new Date().getTime()

        for (const fileFullPath of files) {
          const filePath = normalizePath(fileFullPath).split(outDirPath)[1] // eg: '/assets/vendor.bfb92b77.js'

          const cosFilePath = cosBasePath.replace(/\/$/, '') + filePath // eg: '/base/assets/vendor.bfb92b77.js'

          const completePath = cosOrigin + cosFilePath // eg: 'https://foo.com/base/assets/vendor.bfb92b77.js'

          const output = `${buildConfig.outDir + filePath} => ${color.green(completePath)}`

          if (options.test) {
            console.log(`test upload path: ${output}`)
            continue
          }

          try {
            await retry(async () => {
              // https://cloud.tencent.com/document/product/436/64980
              await client.uploadFile({
                Bucket: options.bucket,    /* 填入您自己的存储桶，必须字段 */
                Region: options.region,    /* 存储桶所在地域，例如 ap-beijing，必须字段 */
                Key: cosFilePath,          /* 存储在桶里的对象键（例如1.jpg，a/b/test.txt），必须字段 */
                StorageClass: 'STANDARD',
                FilePath: fileFullPath,            /* 上传文件路径必须字段 */
                SliceSize: 1024 * 1024 * 5,     /* 触发分块上传的阈值，超过5MB使用分块上传，非必须字段 */
              }
              )
              console.log(`upload complete0: ${output}`)
            }, Number(options.retry || 0))



            // await client.head(cosFilePath);
            // console.log(`${color.gray('files exists')}: ${output}`)

          } catch (error) {
            console.log(`🌹 ~ vitePluginWalleCOS ~ error:`, error)

            await retry(async () => {
              await client.uploadFile({
                Bucket: options.bucket,    /* 填入您自己的存储桶，必须字段 */
                Region: options.region,    /* 存储桶所在地域，例如 ap-beijing，必须字段 */
                Key: cosFilePath,          /* 存储在桶里的对象键（例如1.jpg，a/b/test.txt），必须字段 */
                StorageClass: 'STANDARD',
                FilePath: fileFullPath,            /* 上传文件路径必须字段 */
                SliceSize: 1024 * 1024 * 5,     /* 触发分块上传的阈值，超过5MB使用分块上传，非必须字段 */
              }
              )
              console.log(`upload complete1: ${output}`)
            }, Number(options.retry || 0))
          }
        }

        const duration = (new Date().getTime() - startTime) / 1000

        console.log('')
        console.log(`${packName} upload complete ^_^, cost ${duration.toFixed(2)}s`)
        console.log('')
      }
    }
  }
}

