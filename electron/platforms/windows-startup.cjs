const { context, geometry } = require('./kde-startup.cjs');
const MIN_SIZE = { width: 330, height: 240 };

async function prepare({ layout, count, screen }) {
  const area = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
  // All coordinates are Electron DIPs, including on scaled and negative-origin monitors.
  return { geometry: geometry(layout, count, area, MIN_SIZE) };
}
module.exports = { supported: () => true, context, prepare, MIN_SIZE };
