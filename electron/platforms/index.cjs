function selectPlatform(host = process.platform) {
  if (host === 'linux') return require('./linux.cjs');
  if (host === 'darwin') return require('./mac.cjs');
  if (host === 'win32') return require('./windows.cjs');
  throw new Error(`不支持的桌面运行平台：${host}`);
}
module.exports = { selectPlatform };
