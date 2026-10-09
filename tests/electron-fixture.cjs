const { test: baseTest, _electron: electron } = require('@playwright/test');
const { appendFileSync } = require('node:fs');
const sessions = new WeakMap();
const applications = new WeakMap();

// Teardown runs after Playwright has recorded the test body's original failure.
// Manual close() calls collect errors here instead of replacing a pending throw.
const test = baseTest.extend({
  electronApplications: [async ({}, use, info) => {
    const state = { applications: [], cleanupErrors: [] };
    sessions.set(info, state);
    try { await use(); }
    finally {
      for (const application of state.applications) await close(application);
      if (state.cleanupErrors.length) {
        const diagnostics = JSON.stringify({
          originalErrors: info.errors,
          cleanupErrors: state.cleanupErrors.map(({ stage, error }) => ({ stage, message: error.message, stack: error.stack })),
        }, null, 2);
        appendFileSync(info.outputPath('electron-cleanup.log'), diagnostics);
        await info.attach('Electron cleanup diagnostics', { body: diagnostics, contentType: 'application/json' });
        if (!info.errors.length) throw new AggregateError(state.cleanupErrors.map(item => item.error), 'Electron cleanup failed.');
      }
      sessions.delete(info);
    }
  }, { auto: true }],
});

async function launch(options) {
  const info = test.info();
  const session = sessions.get(info);
  if (!session) throw new Error('Import test from electron-fixture.cjs to preserve Electron cleanup diagnostics.');
  const application = await electron.launch({ chromiumSandbox: true, ...options });
  const state = { session, info, closed: false, tracing: false };
  applications.set(application, state);
  session.applications.push(application);
  const child = application.process();
  const log = info.outputPath('electron-process.log');
  const record = (event, details) => appendFileSync(log, `${JSON.stringify({ time: new Date().toISOString(), event, ...details })}\n`);
  record('launch', { launcherPid: child.pid, exitCode: child.exitCode, signalCode: child.signalCode });
  child.on('exit', (code, signal) => record('exit', { code, signal }));
  child.on('close', (code, signal) => record('close', { code, signal }));
  for (const stream of [child.stdout, child.stderr]) {
    stream?.on('data', (chunk) => appendFileSync(log, chunk));
  }
  try {
    await application.evaluate(({ app }) => {
      const record = (event, details) => console.error('[electron-diagnostics]', JSON.stringify({ time: new Date().toISOString(), event, pid: process.pid, ...details }));
      record('main-process', { electron: process.versions.electron });
      app.on('render-process-gone', (_event, contents, details) => record('render-process-gone', { webContentsId: contents.id, ...details }));
      app.on('child-process-gone', (_event, details) => record('child-process-gone', details));
    });
    await application.context().tracing.start({ screenshots: true, snapshots: true, sources: true });
    state.tracing = true;
  } catch (error) {
    await close(application);
    throw error;
  }
  return application;
}

async function close(application) {
  const state = applications.get(application);
  if (!state || state.closed) return;
  state.closed = true;
  for (const [stage, cleanup] of [
    ['trace', () => stopTracing(application)],
    ['application', () => application.close()],
  ]) {
    try { await cleanup(); }
    catch (error) { state.session.cleanupErrors.push({ stage, error }); }
  }
}

async function stopTracing(application) {
  const state = applications.get(application);
  if (!state?.tracing) return;
  state.tracing = false;
  await application.context().tracing.stop({ path: state.info.outputPath('electron-context-trace.zip') });
}

async function chooseEditor(application, program) {
  await application.evaluate(({ app, dialog }, program) => {
    if (process.platform === 'linux' || process.platform === 'win32') {
      const require = process.getBuiltinModule('module').createRequire(`${app.getAppPath()}/package.json`);
      const platform = require(process.platform === 'win32' ? './electron/platforms/windows.cjs' : './electron/platforms/linux.cjs');
      platform.chooseEditor = async () => program;
    } else dialog.showOpenDialog = async () => ({ canceled: program === null, filePaths: program === null ? [] : [program] });
  }, program);
}
module.exports = { test, launch, close, stopTracing, chooseEditor };
