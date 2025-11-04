import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vitePluginAliOss from 'vite-plugin-ali-oss'
import * as dotenv from 'dotenv'
import path from 'path'
dotenv.config({path: path.resolve(process.cwd(), '.env.local')})

const options = {
  region: 'ap-beijing',
  SecretId: process.env.VITE_SECRET_ID!, //  Note: Add your SecretId
  SecretKey: process.env.VITE_SECRET_KEY!, // Note: Add your SecretKey
  bucket: 'pingtai-front-test-1313601664',
  // enabled: false,
  // test: true,
  // retry: 3
}

const prod = process.env.NODE_ENV === 'production'



// https://vite.dev/config/
export default defineConfig({
  // base: prod ? 'https://static-fe-test.ledupeiyou.com/path/2025test/' : '', // same with webpack public path
  base: prod ? 'https://foo.com/base/' : '', // same with webpack public path
  plugins: [vue(), vitePluginAliOss(options)],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    },
  },
})
