const { test } = require('node:test');
const assert = require('node:assert/strict');
const { prepare, MIN_SIZE } = require('../electron/platforms/windows-startup.cjs');

test('Windows 专注布局使用鼠标屏幕的 DIP 工作区，支持负坐标和较窄分屏', async () => {
  const area = { x: -1000, y: -100, width: 1000, height: 700 };
  const pointer = { x: -500, y: 0 };
  const screen = { getCursorScreenPoint: () => pointer, getDisplayNearestPoint: point => { assert.equal(point, pointer); return { workArea: area }; } };
  assert.deepEqual((await prepare({ layout: 'focus', count: 2, screen })).geometry, { x: -500, y: -100, width: 500, height: 700 });
  area.width = 660;
  assert.deepEqual((await prepare({ layout: 'focus', count: 2, screen })).geometry, { x: -670, y: -100, width: MIN_SIZE.width, height: 700 });
  area.width = 500;
  assert.deepEqual((await prepare({ layout: 'focus', count: 1, screen })).geometry, { x: -1000, y: -100, width: 500, height: 700 });
  await assert.rejects(prepare({ layout: 'focus', count: 2, screen }), /最小尺寸/);
  area.height = 200;
  await assert.rejects(prepare({ layout: 'default', count: 0, screen }), /最小尺寸/);
});
