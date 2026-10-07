const { watch } = require('node:fs');
const path = require('node:path');
const { setTimeout: delay } = require('node:timers/promises');
const { readDocument } = require('./files.cjs');

function editorSessions({ documents, changed, onError }) {
  const targets = new Map();
  const opened = (filePath) => [...documents.values()].filter((document) => document.path === filePath);
  function dispose(target) {
    clearTimeout(target.timer);
    target.watcher?.close();
    targets.delete(target.path);
  }
  function releaseUnused() {
    for (const target of targets.values()) if (!target.sessions && !opened(target.path).length) dispose(target);
  }
  async function readSnapshot(filePath) {
    for (let attempt = 0; ; attempt++) {
      try { return await readDocument(filePath); }
      catch (error) { if (error.code !== 'ENOENT' || attempt === 2) throw error; await delay(30); }
    }
  }
  function refresh(target) {
    target.queue = target.queue.then(async () => {
      if (targets.get(target.path) !== target || !opened(target.path).length) return;
      const snapshot = await readSnapshot(target.path);
      if (snapshot.path !== target.path) throw new Error('文件路径已改变，请重新打开。');
      if (targets.get(target.path) !== target) return;
      for (const document of opened(target.path)) {
        if (document.bytes.equals(snapshot.bytes)) continue;
        const next = { ...snapshot, id: document.id };
        documents.set(document.id, next);
        changed(next);
      }
    }).catch((error) => { if (targets.get(target.path) === target) onError(new Error(`${target.path}\n${error.message}`)); });
    return target.queue;
  }
  function ensure(filePath) {
    let target = targets.get(filePath);
    if (!target) {
      target = { path: filePath, sessions: 0, timer: null, watcher: null, queue: Promise.resolve() };
      targets.set(filePath, target);
    }
    if (!target.watcher) {
      try {
        const watcher = watch(path.dirname(filePath), { persistent: false }, (_event, name) => {
          if (name && name.toString() !== path.basename(filePath)) return;
          clearTimeout(target.timer);
          target.timer = setTimeout(() => { void refresh(target); }, 80);
          target.timer.unref();
        });
        target.watcher = watcher;
        watcher.on('error', (error) => {
          watcher.close();
          if (targets.get(filePath) === target) { target.watcher = null; onError(new Error(`无法监听 ${filePath}\n${error.message}`)); }
        });
      } catch (error) { targets.delete(filePath); throw error; }
    }
    return target;
  }
  return {
    async open(filePath, start) {
      const target = ensure(filePath);
      target.sessions++;
      let session;
      try { session = await start(); }
      catch (error) { target.sessions--; releaseUnused(); throw error; }
      if (session.completion) {
        void session.completion.then(async () => { if (session.waitForFile) await refresh(target); }).catch((error) => {
          if (targets.get(filePath) === target) onError(error);
        }).finally(() => { target.sessions--; releaseUnused(); });
      } else { target.sessions--; releaseUnused(); }
      return true;
    },
    refresh() { return Promise.all([...targets.values()].map(refresh)); },
    releaseUnused,
    dispose() { for (const target of targets.values()) dispose(target); },
  };
}

module.exports = { editorSessions };
