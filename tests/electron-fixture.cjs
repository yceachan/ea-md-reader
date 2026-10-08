const { test, _electron: electron } = require('@playwright/test');
const { appendFileSync } = require('node:fs');

async function launch(options) {
  const application = await electron.launch({ chromiumSandbox: true, ...options });
  const log = test.info().outputPath('electron-process.log');
  for (const stream of [application.process().stdout, application.process().stderr]) {
    stream.on('data', (chunk) => appendFileSync(log, chunk));
  }
  try {
    await application.context().tracing.start({ screenshots: true, snapshots: true, sources: true });
  } catch (error) {
    try { await application.close(); }
    catch (closeError) { throw new AggregateError([error, closeError], 'Cannot start tracing or close Electron.'); }
    throw error;
  }
  return application;
}

async function close(application) {
  try {
    await application.context().tracing.stop({ path: test.info().outputPath('electron-context-trace.zip') });
  } finally {
    await application.close();
  }
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
module.exports = { launch, close, chooseEditor };
