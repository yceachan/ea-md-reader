const fs = require('node:fs/promises');
const path = require('node:path');
const { MARKDOWN_EXTENSIONS, HTML_EXTENSIONS } = require('../files.cjs');

const DEFAULT_SIZE = { width: 1180, height: 850 };
const MIN_SIZE = { width: 620, height: 440 };
function supported() { return process.env.XDG_CURRENT_DESKTOP?.split(':').includes('KDE') === true; }
async function countDocuments(cwd) {
  const entries = await fs.readdir(cwd, { withFileTypes: true });
  return entries.filter((entry) => entry.isFile() && (MARKDOWN_EXTENSIONS.has(path.extname(entry.name).toLowerCase()) || HTML_EXTENSIONS.has(path.extname(entry.name).toLowerCase()))).length;
}
function geometry(mode, count, area) {
  const focused = mode === 'focus' && count > 0;
  const width = mode === 'focus' && count === 1 ? MIN_SIZE.width : mode === 'focus' && count > 1 ? Math.floor(area.width / 2) : Math.floor(Math.min(DEFAULT_SIZE.width, area.width));
  const height = Math.floor(focused ? area.height : Math.min(DEFAULT_SIZE.height, area.height));
  if (width < MIN_SIZE.width || height < MIN_SIZE.height) throw new Error('鼠标屏幕工作区不足以容纳启动布局的最小尺寸。');
  return { x: Math.round(area.x + (area.width - width) / (focused ? 1 : 2)), y: focused ? Math.round(area.y) : Math.round(area.y + (area.height - height) / 2), width, height };
}
async function context(layout, cwd) {
  const root = await fs.realpath(cwd);
  const count = layout === 'focus' ? await countDocuments(root) : 0;
  const workspace = layout === 'focus' && count > 1;
  return { root, count, workspace, panels: { left: layout === 'default' || workspace, right: layout === 'default' } };
}
async function prepare({ layout, count, screen }) {
  if (process.env.XDG_SESSION_TYPE === 'wayland' && !process.argv.includes('--ozone-platform=x11')) {
    return require('./kde-wayland.cjs').prepare({ layout, count });
  }
  const area = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
  return { geometry: geometry(layout, count, area) };
}
module.exports = { supported, context, prepare, geometry, countDocuments, DEFAULT_SIZE, MIN_SIZE };
