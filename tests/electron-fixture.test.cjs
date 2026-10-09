const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');

async function harness(run, { traceError, closeError, startError } = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'emd-fixture-test-'));
  const info = { errors: [], attachments: [], outputPath: file => path.join(directory, file), async attach(name, value) { this.attachments.push({ name, ...value }); } };
  const child = new EventEmitter(); child.stdout = new EventEmitter(); child.stderr = new EventEmitter(); child.pid = 123;
  let fixture;
  const baseTest = { info: () => info, extend(value) { fixture = value.electronApplications[0]; return this; } };
  const calls = [];
  const application = {
    process: () => child,
    evaluate: async () => {},
    context: () => ({ tracing: {
      async start() { calls.push('start'); if (startError) throw startError; },
      async stop() { calls.push('trace'); if (traceError) throw traceError; },
    } }),
    async close() { calls.push('close'); child.emit('exit', null, 'SIGSEGV'); child.emit('close', null, 'SIGSEGV'); if (closeError) throw closeError; },
  };
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'electron-fixture.cjs'), 'utf8'), {
    module, console,
    require: name => name === '@playwright/test' ? { test: baseTest, _electron: { launch: async () => application } } : require(name),
  });
  try { await run({ api: module.exports, fixture, info, calls, application, directory }); }
  finally { fs.rmSync(directory, { recursive: true, force: true }); }
}

test('Electron fixture 保留原始失败，同时记录 trace 和应用清理失败、退出信号', async () => {
  const original = new Error('original assertion');
  await harness(async ({ api, fixture, info, calls, directory }) => {
    await fixture({}, async () => {
      const application = await api.launch({});
      await api.close(application);
      await api.close(application);
      info.errors.push({ message: original.message });
    }, info);
    assert.deepEqual(calls, ['start', 'trace', 'close']);
    assert.equal(info.errors[0].message, original.message);
    const diagnostics = JSON.parse(fs.readFileSync(path.join(directory, 'electron-cleanup.log'), 'utf8'));
    assert.deepEqual(diagnostics.cleanupErrors.map(item => item.stage), ['trace', 'application']);
    assert.equal(diagnostics.originalErrors[0].message, original.message);
    assert.equal(info.attachments.length, 1);
    assert.match(fs.readFileSync(path.join(directory, 'electron-process.log'), 'utf8'), /"event":"exit","code":null,"signal":"SIGSEGV"/);
  }, { traceError: new Error('trace context closed'), closeError: new Error('application close failed') });
});

test('Electron fixture 没有原始失败时，单独清理失败必须判失败且仍关闭应用', async () => {
  await harness(async ({ api, fixture, info, calls }) => {
    await assert.rejects(fixture({}, async () => { await api.close(await api.launch({})); }, info), error => {
      assert.equal(error.name, 'AggregateError');
      assert.equal(error.errors[0].message, 'trace failed');
      return true;
    });
    assert.deepEqual(calls, ['start', 'trace', 'close']);
  }, { traceError: new Error('trace failed') });
});

test('Electron fixture 自动关闭遗漏的应用，显式结束 trace 后不重复收尾', async () => {
  await harness(async ({ api, fixture, info, calls }) => {
    await fixture({}, async () => { await api.stopTracing(await api.launch({})); }, info);
    assert.deepEqual(calls, ['start', 'trace', 'close']);
    assert.equal(info.attachments.length, 0);
  });
});

test('Electron fixture trace 启动失败保留原错，应用清理错误只作附加诊断', async () => {
  const original = new Error('cannot start trace');
  await harness(async ({ api, fixture, info, calls }) => {
    await fixture({}, async () => {
      await assert.rejects(api.launch({}), error => error === original);
      info.errors.push({ message: original.message });
    }, info);
    assert.deepEqual(calls, ['start', 'close']);
    assert.equal(info.attachments.length, 1);
  }, { startError: original, closeError: new Error('cannot close app') });
});
