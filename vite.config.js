import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

const repositoryName = process.env.GITHUB_REPOSITORY?.split('/')[1]
// const base =
//   process.env.GITHUB_ACTIONS === 'true' && repositoryName
//     ? `/${repositoryName}/`
//     : '/'
const base = '/'

// https://vite.dev/config/
export default defineConfig({
  base,
  plugins: [vue()],
})
