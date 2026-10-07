const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { randomUUID } = require('node:crypto');
const { spawn } = require('node:child_process');
const { createInterface } = require('node:readline');
const { geometry, DEFAULT_SIZE, MIN_SIZE } = require('./kde-startup.cjs');

async function prepare({ layout, count }) {
  const token = randomUUID().replaceAll('-', '');
  const request = { layout, count, pid: process.pid, defaults: DEFAULT_SIZE, minimum: MIN_SIZE, service: `io.github.yceachan.Emd.Layout.r${token}`, plugin: `emd-startup-${token}` };
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'emd-startup-'));
  const file = path.join(directory, 'startup.js');
  const template = await fs.readFile(path.join(__dirname, 'kde-startup.js'), 'utf8');
  await fs.writeFile(file, template.replace('__REQUEST__', JSON.stringify(request)).replace('__GEOMETRY__', geometry.toString()));
  const helper = process.resourcesPath && !process.defaultApp ? path.join(process.resourcesPath, 'emd-kde-startup') : path.join(__dirname, '..', '..', 'native-build', 'emd-kde-startup');
  const child = spawn(helper, [file, request.service, request.plugin], { stdio: ['pipe', 'pipe', 'pipe'] });
  let resolveContext, fail, resolveApplied, done = false, appliedMessage = null, stderr = '';
  const context = new Promise((resolve, reject) => { resolveContext = resolve; fail = reject; });
  child.stderr.on('data', (bytes) => { stderr += bytes; });
  child.on('error', (error) => fail(error));
  createInterface({ input: child.stdout }).on('line', (line) => {
    try {
      const message = JSON.parse(line);
      if (message.event === 'context') resolveContext(message);
      else if (message.event === 'error') { done = true; fail(new Error(message.message)); }
      else if (message.event === 'applied') { done = true; appliedMessage = message; }
    } catch (error) { fail(error); }
  });
  const closed = new Promise((resolve) => child.once('close', async (code) => {
    try {
      await fs.rm(directory, { recursive: true, force: true });
      if (code !== 0 || !done) fail(new Error(stderr.trim() || 'KWin 启动布局桥接未完成。'));
      else if (appliedMessage) resolveApplied(appliedMessage);
    } catch (error) { fail(error); }
    finally { resolve(); }
  }));
  const dispose = () => child.stdin.end();
  let bounds;
  try { bounds = await context; }
  catch (error) { dispose(); await closed; throw error; }
  const applied = new Promise((resolve, reject) => { resolveApplied = resolve; fail = reject; });
  return { geometry: bounds.geometry, displayWidth: bounds.displayWidth, applied, dispose };
}
module.exports = { prepare };
