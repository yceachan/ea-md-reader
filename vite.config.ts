import { defineConfig, type UserConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const { readProfile } = createRequire(import.meta.url)('./electron/profile.cjs');

export default defineConfig(async ({ command }): Promise<UserConfig> => {
  const nonce = command === 'serve' ? randomBytes(18).toString('base64') : undefined;
  const profile = JSON.stringify(await readProfile(fileURLToPath(new URL('.', import.meta.url))));
  return {
    plugins: [react(), {
      name: 'emd-built-profile',
      generateBundle() { this.emitFile({ type: 'asset', fileName: 'profile.json', source: profile }); },
      configureServer(server) {
        server.middlewares.use('/profile.json', (_request, response) => {
          response.setHeader('Content-Type', 'application/json');
          response.end(profile);
        });
      },
    }, {
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
