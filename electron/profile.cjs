const fs = require('node:fs/promises');
const path = require('node:path');
const { parse } = require('smol-toml');
const { isWithin } = require('./files.cjs');

// Build input only. User preferences never supply application identity.
async function readProfile(root) {
  const value = parse(await fs.readFile(path.join(root, 'setting.toml'), 'utf8')).profile;
  const fields = ['name', 'tagline', 'email', 'github', 'repository', 'copyright', 'license', 'profile-photo'];
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('源码 setting.toml 的 profile 必须是表。');
  for (const field of fields) if (typeof value[field] !== 'string' || !value[field].trim()) throw new Error(`源码 setting.toml 的 profile.${field} 必须是非空文本。`);
  if (!/^[^\s@?]+@[^\s@?]+$/.test(value.email)) throw new Error('profile.email 必须是有效的邮箱地址。');
  for (const field of ['github', 'repository']) {
    const url = new URL(value[field]);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error(`profile.${field} 必须是 HTTP / HTTPS 地址。`);
  }
  const publicRoot = await fs.realpath(path.join(root, 'public'));
  if (path.isAbsolute(value['profile-photo'])) throw new Error('profile-photo 必须是 public/ 内的相对路径。');
  const photo = await fs.realpath(path.resolve(publicRoot, value['profile-photo']));
  if (!isWithin(publicRoot, photo)) throw new Error('profile-photo 必须位于 public/ 内。');
  const bytes = await fs.readFile(photo);
  const mime = bytes.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff])) ? 'image/jpeg'
    : bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ? 'image/png' : null;
  if (!mime) throw new Error('profile-photo 必须是 JPEG 或 PNG 图片。');
  const profile = Object.fromEntries(fields.filter((field) => field !== 'profile-photo').map((field) => [field, value[field]]));
  return { ...profile, photoUrl: `data:${mime};base64,${bytes.toString('base64')}` };
}

module.exports = { readProfile };
