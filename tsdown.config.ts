import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/server.ts'],
  format: 'esm',
  fixedExtension: false,
  platform: 'node',
  target: 'node22',
  outDir: 'dist',
  sourcemap: true,
  clean: true,
  deps: {
    neverBundle: true,
  },
})
