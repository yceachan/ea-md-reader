const { contextBridge, ipcRenderer } = require('electron');
function subscribe(channel, listener) {
  const handler = (_event, payload) => listener(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}
contextBridge.exposeInMainWorld('emd', {
  window: (action) => ipcRenderer.invoke('emd:window', action),
  onWindowState: (listener) => subscribe('emd:window-state', listener),
  onDisplayWidth: (listener) => subscribe('emd:display-width', listener),
  settings: () => ipcRenderer.invoke('emd:settings'),
  startupState: () => ipcRenderer.invoke('emd:startup-state'),
  chooseStartup: (layout) => ipcRenderer.invoke('emd:startup-choice', layout),
  profile: () => ipcRenderer.invoke('emd:profile'),
  profileLink: (target) => ipcRenderer.invoke('emd:profile-link', target),
  chooseEditor: (kind) => ipcRenderer.invoke('emd:editor-choice', kind),
  clearEditor: (kind) => ipcRenderer.invoke('emd:editor-clear', kind),
  editDocument: (id, choose = false) => ipcRenderer.invoke('emd:edit-document', id, choose),
  editWorkspace: (root, filePath) => ipcRenderer.invoke('emd:edit-workspace', root, filePath),
  documentMenu: (id, root) => ipcRenderer.invoke('emd:document-menu', id, root),
  onDocumentUpdate: (listener) => subscribe('emd:document-update', listener),
  ready: () => ipcRenderer.invoke('emd:ready'),
  command: (id, documentId) => ipcRenderer.invoke('emd:command', id, documentId),
  activeDocument: (id) => ipcRenderer.invoke('emd:active-document', id),
  workspace: (id, root) => ipcRenderer.invoke('emd:workspace', id, root),
  workspaceOpen: (root, filePath, newTab, activeId) => ipcRenderer.invoke('emd:workspace-open', root, filePath, newTab, activeId),
  workspaceMenu: (root, filePath, activeId) => ipcRenderer.invoke('emd:workspace-menu', root, filePath, activeId),
  onWorkspaceAction: (listener) => subscribe('emd:workspace-action', listener),
  save: (id) => ipcRenderer.invoke('emd:save', id),
  close: (id) => ipcRenderer.invoke('emd:close', id),
  reload: (id) => ipcRenderer.invoke('emd:reload', id),
  link: (id, href) => ipcRenderer.invoke('emd:link', id, href),
  find: (text, forward) => ipcRenderer.invoke('emd:find', text, forward),
  onDocument: (listener) => subscribe('emd:document', listener),
  onActivate: (listener) => subscribe('emd:activate', listener),
  onAction: (listener) => subscribe('emd:action', listener),
  onAnchor: (listener) => subscribe('emd:anchor', listener),
  onError: (listener) => subscribe('emd:error', listener),
});
