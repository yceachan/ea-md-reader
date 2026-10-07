import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { randomBytes } from 'node:crypto';

export default defineConfig(({ command }) => {
  const nonce = command === 'serve' ? randomBytes(18).toString('base64') : undefined;
  return {
    plugins: [react(), {
      name: 'emd-dev-csp',
      apply: 'serve',
      transformIndexHtml: {
        order: 'pre',
        handler: html => html
          .replace("script-src 'self'", `script-src 'self' 'nonce-${nonce}'`)
          .replace("connect-src 'self'", "connect-src 'self' ws://127.0.0.1:*"),
      },
    }],
    html: { cspNonce: nonce },
    base: './',
    build: { outDir: 'dist' },
  };
});
