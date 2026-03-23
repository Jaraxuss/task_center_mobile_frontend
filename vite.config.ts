import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

const DEFAULT_PROXY_TARGET = 'http://127.0.0.1:8000';
const DEFAULT_PORT = 5174;

function trimTrailingSlash(value: string) {
  return value.replace(/\/$/, '');
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  const proxyTarget = trimTrailingSlash(env.VITE_API_PROXY_TARGET || env.VITE_API_BASE_URL || DEFAULT_PROXY_TARGET);

  return {
    plugins: [react()],
    server: {
      host: '0.0.0.0',
      port: DEFAULT_PORT,
      proxy: {
        '/api': {
          target: proxyTarget,
          changeOrigin: true,
        },
      },
    },
  };
});
