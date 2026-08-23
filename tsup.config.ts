import { defineConfig } from 'tsup'

export default defineConfig({
  clean: true,
  dts: false,
  entry: ['src/server.ts'],
  format: ['esm'],
  sourcemap: true,
  target: 'node22',
})
