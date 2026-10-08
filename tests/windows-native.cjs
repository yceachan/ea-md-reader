const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { promisify } = require('node:util');
const execute = promisify(require('node:child_process').execFile);

async function nativeDriver() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'emd-native-driver-'));
  const executable = path.join(directory, 'driver.exe');
  const framework = path.join(process.env.SystemRoot, 'Microsoft.NET/Framework64/v4.0.30319');
  try {
    await execute(path.join(framework, 'csc.exe'), ['/nologo', '/target:exe', '/codepage:65001',
      '/reference:System.Web.Extensions.dll', `/reference:${path.join(framework, 'WPF/UIAutomationClient.dll')}`,
      `/reference:${path.join(framework, 'WPF/UIAutomationTypes.dll')}`, `/reference:${path.join(framework, 'WPF/WindowsBase.dll')}`,
      `/out:${executable}`, path.join(__dirname, 'windows-native-driver.cs'), path.join(__dirname, 'windows-shell-driver.cs')], { windowsHide: true });
    return {
      async run(...args) { return JSON.parse((await execute(executable, args.map(String), { windowsHide: true })).stdout); },
      dispose: () => fs.rm(directory, { recursive: true, force: true }),
    };
  } catch (error) { await fs.rm(directory, { recursive: true, force: true }); throw error; }
}
async function hwnd(application) {
  return application.evaluate(({ BrowserWindow }) => {
    const handle = BrowserWindow.getAllWindows()[0].getNativeWindowHandle();
    return handle.length === 8 ? handle.readBigUInt64LE().toString() : handle.readUInt32LE().toString();
  });
}
module.exports = { nativeDriver, hwnd };
