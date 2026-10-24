import { defineConfig, mergeConfig } from 'vite';
import baseConfig from '../vite.config';

export default mergeConfig(
  baseConfig,
  defineConfig({
    server: {
      port: 3100,
      proxy: {
        '/api': {
          target: 'http://localhost:4100',
          changeOrigin: true,
        },
      },
    },
  })
);
