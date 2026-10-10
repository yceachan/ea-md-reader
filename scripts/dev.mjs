import { spawn } from 'node:child_process';
import { join, relative } from 'node:path';
import { constants } from 'node:os';
import electron from 'electron';
import { createServer } from 'vite';
import { root, ensureBuild } from './artifacts.mjs';

let server, child, closed, timer;
let stopping = false, restarting = false, restartPending = false;
const args = process.argv.slice(2);
const profile = args.some(arg => arg === '--user-data-dir' || arg.startsWith('--user-data-dir=')) ? [] : [`--user-data-dir=${join(root, '.dev/profile')}`];

async function stopElectron() {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  const current = child;
  current.kill('SIGTERM');
  const force = setTimeout(() => current.kill('SIGKILL'), 3000);
  try { await closed; }
  finally { clearTimeout(force); }
}

async function shutdown(code) {
  if (stopping) return;
  stopping = true;
  clearTimeout(timer);
  try { await stopElectron(); }
  finally { await server?.close(); process.exitCode = code; }
}

function launch(url) {
  child = spawn(electron, [root, ...profile, ...args], { stdio: 'inherit', env: { ...process.env, EMD_DEV_URL: url } });
  console.log(`[dev] Electron PID ${child.pid}`);
  closed = new Promise(resolve => child.once('close', (code, signal) => {
    resolve();
    if (!restarting && !stopping) void shutdown(code ?? 128 + constants.signals[signal]).catch(fail);
  }));
  child.once('error', error => { console.error(error.message); void shutdown(1).catch(fail); });
}

function fail(error) {
  console.error(error);
  process.exitCode = 1;
  if (!stopping) void shutdown(1).catch(error => console.error(error));
}

try {
  await ensureBuild(['icons', 'native']);
  server = await createServer({ root, server: { host: '127.0.0.1', port: 0 } });
  await server.listen();
  const url = new URL('index.html', server.resolvedUrls.local[0]).href;
  console.log(`[dev] ${url} · React/CSS 热更新，electron/ 修改后重启`);
  async function restart() {
    if (stopping) return;
    if (restarting) { restartPending = true; return; }
    restarting = true;
    try { await stopElectron(); if (!stopping) launch(url); }
    finally {
      restarting = false;
      if (restartPending) { restartPending = false; void restart().catch(fail); }
    }
  }
  server.watcher.add(join(root, 'electron'));
  server.watcher.on('all', (_event, file) => {
    const name = relative(root, file).replaceAll('\\', '/');
    if (!name.startsWith('electron/') || !/\.(?:cjs|js)$/.test(name)) return;
    clearTimeout(timer);
    timer = setTimeout(() => { void restart().catch(fail); }, 150);
  });
  process.once('SIGINT', () => { void shutdown(130).catch(fail); });
  process.once('SIGTERM', () => { void shutdown(143).catch(fail); });
  launch(url);
} catch (error) { console.error(error.message); await shutdown(1); }
