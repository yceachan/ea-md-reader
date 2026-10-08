// Implement an adapter with packOptions, install(context), and uninstall(context) to enable a platform.
const platforms = {
  kde: { name: 'KDE/Linux', os: 'linux', load: () => import('./platforms/kde.mjs') },
  gnome: { name: 'GNOME/Linux', os: 'linux' },
  mac: { name: 'macOS', os: 'darwin', load: () => import('./platforms/mac.mjs') },
  windows: { name: 'Windows', os: 'win32', load: () => import('./platforms/windows.mjs') },
};

export function parsePlatformArgs(args) {
  let platform;
  const rest = [];
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === '--platform' || arg.startsWith('--platform=')) {
      if (platform !== undefined) throw new Error('--platform 只能指定一次。');
      platform = arg === '--platform' ? args[++index] : arg.slice('--platform='.length);
      if (!platform || platform.startsWith('-')) throw new Error('--platform 需要指定 kde、gnome、mac 或 windows。');
    } else rest.push(arg);
  }
  return { platform, rest };
}

export function selectPlatform(requested, host = process.platform, desktop = process.env.XDG_CURRENT_DESKTOP ?? '') {
  const id = requested ?? (host === 'linux' ? (desktop.toUpperCase().split(':').includes('GNOME') ? 'gnome' : 'kde') : { darwin: 'mac', win32: 'windows' }[host]);
  const platform = Object.hasOwn(platforms, id) ? platforms[id] : null;
  if (!platform) throw new Error(`未知平台：${id ?? host}。可选：kde、gnome、mac、windows。`);
  if (!platform.load) throw new Error(`${platform.name} 接入点为 TODO，尚未实现打包和安装。`);
  if (platform.os !== host) throw new Error(`${platform.name} 目前要求在 ${platform.os} 机器上执行。`);
  return platform;
}
