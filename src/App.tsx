import { useEffect, useRef, useState } from 'react';
import Article from './components/Article';
import Outline from './components/Outline';
import TocDock from './components/TocDock';
import Workspace from './components/Workspace';
import PanelResize from './components/PanelResize';
import Settings from './components/Settings';
import Profile from './components/Profile';
import logo from '../assets/emd.svg';
import type { RenderResult } from './lib/markdown';

const MIN_READING_WIDTH = 360;
const AUTO_READING_WIDTH = 520;
const PANEL_GUTTER = 5;

function Icon({ name }: { name: 'workspace' | 'menu' | 'settings' | 'open' | 'save' | 'close' | 'refresh' | 'outline' | 'search' | 'minimize' | 'maximize' | 'restore' }) {
  const paths = {
    workspace: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9 4v16M5.5 8h1M5.5 12h1" /></>,
    menu: <path d="M4 6h16M4 12h16M4 18h16" />,
    settings: <><path d="m9.5 3-.5 2-2 1.2-2-.6L3 9l1.5 1.4v2.3L3 14l2 3.5 2-.6L9 18l.5 3h5l.5-3 2-1.1 2 .6 2-3.5-1.5-1.3v-2.3L21 9l-2-3.4-2 .6L15 5l-.5-2Z" /><circle cx="12" cy="12" r="3" /></>,
    open: <><path d="M3 7V5a2 2 0 0 1 2-2h4l2 3h8a2 2 0 0 1 2 2v2" /><path d="M3 7v12h16l3-10H7L3 19" /></>,
    save: <><path d="M12 3v12m-4-4 4 4 4-4M4 15v5h16v-5" /></>,
    minimize: <path d="M5 12h14" />,
    maximize: <rect x="5" y="5" width="14" height="14" rx="1" />,
    restore: <><path d="M8 5V3h13v13h-2" /><rect x="3" y="8" width="13" height="13" rx="1" /></>,
    close: <path d="m6 6 12 12M6 18 18 6" />,
    refresh: <><path d="M20 8a8 8 0 1 0 0 8M20 3v5h-5" /></>,
    outline: <><path d="M8 5h13M8 12h13M8 19h13" /><circle cx="3" cy="5" r=".5" /><circle cx="3" cy="12" r=".5" /><circle cx="3" cy="19" r=".5" /></>,
    search: <><circle cx="10" cy="10" r="6" /><path d="m15 15 6 6" /></>,
  };
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

export default function App() {
  const [tabs, setTabs] = useState<ReaderDocument[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [headings, setHeadings] = useState<Record<string, RenderResult['headings']>>({});
  const [maximized, setMaximized] = useState(false);
  const [panels, setPanels] = useState({ left: false, right: false });
  const [startupReady, setStartupReady] = useState(false);
  const [startupWorkspace, setStartupWorkspace] = useState(false);
  const [panelWidths, setPanelWidths] = useState({ left: 240, right: 240 });
  const [availableWidth, setAvailableWidth] = useState(window.innerWidth);
  const [displayWidth, setDisplayWidth] = useState(window.screen.availWidth);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const workspaceRoot = useRef<string | undefined>(undefined);
  const [hints, setHints] = useState<CommandHints | null>(null);
  const [commandAvailability, setCommandAvailability] = useState<CommandAvailability | null>(null);
  const [workspace, setWorkspace] = useState<ReaderWorkspace | null>(null);
  const [workspaceLoading, setWorkspaceLoading] = useState(false);
  const [workspaceRevision, setWorkspaceRevision] = useState(0);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const [finding, setFinding] = useState(false);
  const [query, setQuery] = useState('');
  const [anchor, setAnchor] = useState<string | null>(null);
  const [fileMenu, setFileMenu] = useState(false);
  const [progress, setProgress] = useState(0);
  const findInput = useRef<HTMLInputElement>(null);
  const commands = useRef<(action: CommandAction) => void>(() => {});
  const workspaceActions = useRef<(action: WorkspaceAction) => void>(() => {});
  const workspaceElement = useRef<HTMLElement>(null);
  const tabbar = useRef<HTMLElement>(null);
  const workspaceTrigger = useRef<HTMLButtonElement>(null);
  const outlineTrigger = useRef<HTMLButtonElement>(null);
  const active = tabs.find((tab) => tab.id === activeId);
  const outlineRail = active?.kind === 'markdown' ? 32 : 0;
  const leftWidth = Math.min(panelWidths.left, availableWidth - MIN_READING_WIDTH - PANEL_GUTTER - outlineRail);
  const rightWidth = Math.min(panelWidths.right, availableWidth - MIN_READING_WIDTH - PANEL_GUTTER);
  const leftOverlay = availableWidth < (startupWorkspace ? 180 + MIN_READING_WIDTH + outlineRail : panelWidths.left + AUTO_READING_WIDTH) + PANEL_GUTTER;
  const rightOverlay = availableWidth <= displayWidth / 2 || availableWidth < (panels.left && !leftOverlay ? leftWidth + PANEL_GUTTER : 0) + panelWidths.right + AUTO_READING_WIDTH + PANEL_GUTTER;
  const hasWorkspace = !!active || startupWorkspace;
  const overlaySide = hasWorkspace && panels.left && leftOverlay ? 'left' : active?.kind === 'markdown' && panels.right && rightOverlay ? 'right' : null;

  function closeOverlay(side = overlaySide) {
    if (!side) return;
    setPanels((current) => ({ ...current, [side]: false }));
    (side === 'left' ? workspaceTrigger : outlineTrigger).current?.focus();
  }

  function togglePanel(side: 'left' | 'right') {
    const other = side === 'left' ? 'right' : 'left';
    setPanels((current) => ({ ...current, [side]: !current[side],
      ...(!current[side] && (side === 'left' ? leftOverlay : rightOverlay) && (other === 'left' ? leftOverlay : rightOverlay) ? { [other]: false } : {}),
    }));
  }
  async function openWorkspaceFile(path: string, newTab: boolean) {
    if (workspace) {
      const opened = await window.emd.workspaceOpen(workspace.root, path, newTab || activeId === null, activeId);
      if (opened && leftOverlay) closeOverlay('left');
    }
  }
  workspaceActions.current = ({ action, path }) => {
    if (action === 'refresh') setWorkspaceRevision((value) => value + 1);
    else if (path) openWorkspaceFile(path, action === 'new-tab');
  };

  async function save(id = activeId) {
    if (!id) return;
    const destination = await window.emd.save(id);
    if (destination) setMessage({ text: `已另存为 ${destination}`, error: false });
  }
  async function close(id = activeId) {
    if (!id) return;
    const index = tabs.findIndex((tab) => tab.id === id);
    await window.emd.close(id);
    setTabs((current) => current.filter((tab) => tab.id !== id));
    setHeadings((current) => { const next = { ...current }; delete next[id]; return next; });
    if (id === activeId) setActiveId(tabs[index + 1]?.id ?? tabs[index - 1]?.id ?? null);
  }
  async function reload(id = activeId) {
    if (!id) return;
    const document = await window.emd.reload(id);
    if (document) { setTabs((current) => current.map((tab) => tab.id === document.id ? document : tab)); setMessage({ text: '已重新读取文件', error: false }); }
  }
  function nextTab(delta: number) {
    if (!tabs.length) return;
    const index = tabs.findIndex((tab) => tab.id === activeId);
    setActiveId(tabs[(index + delta + tabs.length) % tabs.length].id);
  }
  function updateProgress(id: string | null) {
    if (!id || id !== activeId) return;
    const panel = document.getElementById(`panel-${id}`);
    if (!panel) return;
    const distance = panel.scrollHeight - panel.clientHeight;
    setProgress(distance > 0 ? Math.round(panel.scrollTop / distance * 100) : 100);
  }
  commands.current = ({ id, documentId }) => {
    const actions: Partial<Record<ReaderCommand, () => void>> = {
      saveAs: () => { void save(documentId); }, closeTab: () => { void close(documentId); }, reloadDocument: () => { void reload(documentId); },
      toggleFileMenu: () => setFileMenu((value) => !value), findInDocument: () => { setFinding(true); findInput.current?.focus(); },
      nextTab: () => nextTab(1), previousTab: () => nextTab(-1),
      openSettings: () => setSettingsOpen(true),
    };
    actions[id]?.();
  };

  useEffect(() => {
    const cleanups = [
      window.emd.onWindowState(setMaximized),
      window.emd.onDisplayWidth(setDisplayWidth),
      window.emd.onDocumentUpdate((document) => setTabs((current) => current.map((tab) => tab.id === document.id ? document : tab))),
      window.emd.onDocument((document) => {
        setTabs((current) => current.some((tab) => tab.id === document.id) ? current.map((tab) => tab.id === document.id ? document : tab) : [...current, document]);
        setActiveId(document.id); setAnchor(null);
      }),
      window.emd.onWorkspaceAction((action) => workspaceActions.current(action)),
      window.emd.onActivate((id) => { setActiveId(id); setAnchor(null); }),
      window.emd.onAction((action) => commands.current(action)),
      window.emd.onAnchor(setAnchor),
      window.emd.onError((text) => setMessage({ text, error: true })),
    ];
    void window.emd.startupState().then((value) => {
      setStartupWorkspace(value.workspace);
      workspaceRoot.current = value.root ?? undefined;
      setPanels(value.panels);
      setStartupReady(true);
    });
    void window.emd.ready().then(setHints);
    return () => cleanups.forEach((cleanup) => cleanup());
  }, []);
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => setAvailableWidth(entry.contentRect.width));
    observer.observe(workspaceElement.current!);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (leftOverlay && rightOverlay && panels.left && panels.right) setPanels((current) => ({ ...current, right: false }));
  }, [leftOverlay, rightOverlay, panels.left, panels.right]);
  useEffect(() => {
    const element = tabbar.current;
    if (!element) return;
    function scroll(event: WheelEvent) {
      if (event.ctrlKey || !event.deltaY) return;
      event.preventDefault();
      const amount = event.deltaMode === 1 ? event.deltaY * 24 : event.deltaMode === 2 ? element!.clientWidth * event.deltaY : event.deltaY;
      element!.scrollLeft += amount;
    }
    element.addEventListener('wheel', scroll, { passive: false });
    return () => element.removeEventListener('wheel', scroll);
  }, [tabs.length > 0]);
  useEffect(() => { if (activeId) document.getElementById(`tab-${activeId}`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }, [activeId]);
  useEffect(() => { void window.emd.activeDocument(activeId).then(setCommandAvailability); }, [activeId]);
  useEffect(() => {
    if (!startupReady) return;
    if (!active && !startupWorkspace) { setWorkspace(null); setWorkspaceLoading(false); return; }
    let canceled = false;
    if (!workspace) setWorkspaceLoading(true);
    void window.emd.workspace(active?.id ?? null, workspaceRoot.current).then((result) => {
      if (!canceled) {
        if (result) workspaceRoot.current = result.root;
        if (result) setWorkspace(result); setWorkspaceLoading(false);
      }
    });
    return () => { canceled = true; };
  }, [active?.id, active?.path, workspaceRevision, startupReady]);
  useEffect(() => { document.title = active ? `${active.name} — Ea.Md.Reader` : 'Ea.Md.Reader'; }, [active?.name]);
  useEffect(() => { updateProgress(activeId); }, [activeId]);
  useEffect(() => {
    if (finding) findInput.current?.focus();
    else { setQuery(''); void window.emd.find('', true); }
  }, [finding]);
  useEffect(() => {
    if (!query) { void window.emd.find('', true); return; }
    const timer = setTimeout(() => { void window.emd.find(query, true); }, 120);
    return () => clearTimeout(timer);
  }, [query, activeId, active?.path, active?.text]);
  useEffect(() => {
    if (!message || message.error) return;
    const timer = setTimeout(() => setMessage(null), 5000);
    return () => clearTimeout(timer);
  }, [message]);
  useEffect(() => {
    if (!fileMenu) return;
    const dismiss = (event: MouseEvent) => { if (!(event.target as Element).closest('.file-menu')) setFileMenu(false); };
    document.addEventListener('click', dismiss);
    return () => document.removeEventListener('click', dismiss);
  }, [fileMenu]);

  const sections = activeId ? headings[activeId] ?? [] : [];
  return <div className={`app${window.emd.nativeWindowControls ? ' native-window-controls' : ''}`} onKeyDown={(event) => {
    if (!settingsOpen && !profileOpen && event.key === 'Escape') { closeOverlay(); setFileMenu(false); setFinding(false); setMessage(null); }
  }}>
    <header className="toolbar" onDoubleClick={(event) => { if (!(event.target as Element).closest('button, .file-menu')) void window.emd.window('maximize'); }}>
      <span className="brand"><button className="profile-trigger" aria-label="个人资料" title="个人资料" onClick={() => { setMessage(null); setProfileOpen(true); }}><img className="app-logo" src={logo} alt="" /></button>
        <button ref={workspaceTrigger} className={`icon-button workspace-trigger ${panels.left && hasWorkspace ? 'selected' : ''}`} title="显示 / 隐藏工作区" aria-label="显示工作区" aria-pressed={panels.left && hasWorkspace} disabled={!hasWorkspace} onClick={() => togglePanel('left')}><Icon name="workspace" /></button>
        <span className="wordmark">Ea<span className="wordmark-dot">.</span>Md<span className="wordmark-dot">.</span>Reader</span></span>
      <div className="file-actions">
        <div className="file-menu">
          <button className="icon-button menu-trigger" title={`文件菜单 · ${hints?.toggleFileMenu ?? ''}`} aria-label="文件" aria-haspopup="menu" aria-expanded={fileMenu} onClick={() => { void window.emd.command('toggleFileMenu'); }}><Icon name="menu" /></button>
          {fileMenu && <div className="menu-popup" role="menu">
            <button role="menuitem" onClick={() => { setFileMenu(false); void window.emd.command('openDocument'); }}>打开… <kbd>{hints?.openDocument}</kbd></button>
            <button role="menuitem" disabled={!commandAvailability?.saveAs} onClick={() => { setFileMenu(false); void window.emd.command('saveAs'); }}>另存为… <kbd>{hints?.saveAs}</kbd></button>
            <div className="menu-divider" />
            <button role="menuitem" disabled={!commandAvailability?.closeTab} onClick={() => { setFileMenu(false); void window.emd.command('closeTab'); }}>关闭标签页 <kbd>{hints?.closeTab}</kbd></button>
            <div className="menu-divider" />
            <button role="menuitem" onClick={() => { setFileMenu(false); void window.emd.command('openSettings'); }}>设置…</button>
            <button role="menuitem" onClick={() => { setFileMenu(false); void window.emd.command('openDeveloperTools'); }}>开发者控制台 <kbd>{hints?.openDeveloperTools}</kbd></button>
            <div className="menu-divider" />
            <button role="menuitem" onClick={() => { void window.emd.command('quit'); }}>退出 <kbd>{hints?.quit}</kbd></button>
          </div>}
        </div>
        <button className="icon-button" title="设置" aria-label="设置" onClick={() => { void window.emd.command('openSettings'); }}><Icon name="settings" /></button>
        <button className="icon-button" title={`打开文件 · ${hints?.openDocument ?? ''}`} aria-label="打开文件" onClick={() => { void window.emd.command('openDocument'); }}><Icon name="open" /></button>
        <button className="icon-button" title={`另存为 · ${hints?.saveAs ?? ''}`} aria-label="另存为" disabled={!commandAvailability?.saveAs} onClick={() => { void window.emd.command('saveAs'); }}><Icon name="save" /></button>
      </div>
      <span className="toolbar-path" title={active?.path}>{active?.path ?? 'Markdown / HTML 阅读器'}</span>
      <div className="toolbar-actions">
        <button className="icon-button" title={`查找 · ${hints?.findInDocument ?? ''}`} aria-label="查找" disabled={!commandAvailability?.findInDocument} onClick={() => { void window.emd.command('findInDocument'); }}><Icon name="search" /></button>
        <button ref={outlineTrigger} className={`icon-button ${panels.right && active?.kind === 'markdown' ? 'selected' : ''}`} title="显示目录" aria-label="显示目录" aria-pressed={panels.right && active?.kind === 'markdown'} disabled={active?.kind !== 'markdown'} onClick={() => togglePanel('right')}><Icon name="outline" /></button>
      </div>
      {!window.emd.nativeWindowControls && <div className="window-controls">
        <button aria-label="最小化窗口" title="最小化" onClick={() => { void window.emd.window('minimize'); }}><Icon name="minimize" /></button>
        <button aria-label={maximized ? '还原窗口' : '最大化窗口'} title={maximized ? '还原' : '最大化'} onClick={() => { void window.emd.window('maximize'); }}><Icon name={maximized ? 'restore' : 'maximize'} /></button>
        <button className="window-close" aria-label="关闭窗口" title="关闭" onClick={() => { void window.emd.window('close'); }}><Icon name="close" /></button>
      </div>}
    </header>
    {tabs.length > 0 && <nav ref={tabbar} className="tabbar" role="tablist" aria-label="已打开的文件">
      {tabs.map((tab) => <div className={`tab ${tab.id === activeId ? 'active' : ''}`} key={tab.id}
        onContextMenu={(event) => { event.preventDefault(); void window.emd.documentMenu(tab.id, workspace?.root); }}
        onMouseDown={(event) => { if (event.button === 1) event.preventDefault(); }}
        onAuxClick={(event) => { if (event.button === 1) { event.preventDefault(); void window.emd.command('closeTab', tab.id); } }}>
        <button className="tab-select" role="tab" aria-selected={tab.id === activeId} aria-controls={`panel-${tab.id}`} id={`tab-${tab.id}`} title={tab.path} onClick={() => { setActiveId(tab.id); setAnchor(null); }}><span className="file-badge">{tab.kind === 'html' ? 'HTML' : 'MD'}</span><span className="tab-name">{tab.name}</span></button>
        <button className="tab-close" aria-label={`关闭 ${tab.name}`} title="关闭标签页" onClick={() => { void window.emd.command('closeTab', tab.id); }}><Icon name="close" /></button>
      </div>)}
      <button className="new-tab" title="打开更多文件" aria-label="打开更多文件" onClick={() => { void window.emd.command('openDocument'); }}>+</button>
    </nav>}
    {finding && <div className="findbar"><Icon name="search" /><input ref={findInput} aria-label="查找内容" placeholder="在文档中查找…" value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); void window.emd.find(query, !event.shiftKey); } }} /><button title="上一个" onClick={() => { void window.emd.find(query, false); }}>↑</button><button title="下一个" onClick={() => { void window.emd.find(query, true); }}>↓</button><button className="icon-button" aria-label="关闭查找" onClick={() => setFinding(false)}><Icon name="close" /></button></div>}
    <main className="workspace" ref={workspaceElement}>
      {overlaySide && <button className="panel-backdrop" aria-label="关闭面板覆盖层" onClick={() => closeOverlay()} />}
      {hasWorkspace && panels.left && <>
        <aside className={`workspace-sidebar sidebar ${leftOverlay ? 'panel-overlay left' : ''}`} aria-label="工作区面板" style={{ width: leftOverlay ? panelWidths.left : leftWidth }}>
          {leftOverlay && <button className="panel-close" aria-label="关闭工作区面板" onClick={() => closeOverlay('left')}><Icon name="close" /></button>}
          <Workspace workspace={workspace} loading={workspaceLoading} activePath={active?.path ?? ''} onOpen={openWorkspaceFile}
            onEdit={(path) => { if (workspace) void window.emd.editWorkspace(workspace.root, path); }}
            onMenu={(path) => { if (workspace) void window.emd.workspaceMenu(workspace.root, path, active?.id ?? null); }} />
        </aside>
        {!leftOverlay && <PanelResize side="left" width={leftWidth} maxWidth={Math.min(420, availableWidth - (active?.kind === 'markdown' ? panels.right && !rightOverlay ? rightWidth : 32 : 0) - MIN_READING_WIDTH - PANEL_GUTTER)} onResize={(left) => setPanelWidths((current) => ({ ...current, left }))} />}
      </>}
      <div className="reading-area">
      {!tabs.length && <section className="welcome">
        <div className="welcome-mark"><span>e</span><span className="paper-line" /><span className="paper-line short" /></div>
        <p className="eyebrow">A QUIET PLACE TO READ</p>
        <h1>打开一页，静心阅读。</h1>
        <p className="welcome-description">阅读 Markdown 与自包含 HTML。<br />公式、代码、图表，以及页面中的交互。</p>
        <button className="open-button" onClick={() => { void window.emd.command('openDocument'); }}><Icon name="open" />打开 Markdown / HTML<span>{hints?.openDocument}</span></button>
        <p className="welcome-hint">也可以在终端运行 <code>emd 文件.md 页面.html</code></p>
        <div className="welcome-footer"><span>ea-kb 的纸色与排版</span><span>只读阅读 · 多标签页</span></div>
      </section>}
      {tabs.map((tab) => <section className={`document-panel ${tab.kind === 'html' ? 'html-panel' : ''}`} hidden={tab.id !== activeId} role="tabpanel" aria-labelledby={`tab-${tab.id}`} id={`panel-${tab.id}`} key={`${tab.id}-${tab.path}`} onScroll={() => updateProgress(tab.id)}>
        {tab.kind === 'html' ? <iframe className="html-page" title={tab.name} src={tab.pageUrl} sandbox="allow-scripts" onLoad={() => { if (tab.id === activeId && query) void window.emd.find(query, true); }} /> : <article className="article">
          <div className="document-meta"><span>MARKDOWN</span><span className="meta-dot">·</span><span>{Math.max(1, Math.ceil(tab.text.length / 600))} 分钟阅读</span><span className="readonly-badge">只读</span></div>
          <Article document={tab} active={tab.id === activeId} anchor={tab.id === activeId ? anchor : null} onHeadings={(id, values) => setHeadings((current) => ({ ...current, [id]: values }))} onRendered={() => updateProgress(tab.id)} onAnchorConsumed={() => setAnchor(null)} onError={(text) => setMessage({ text, error: true })} />
          <div className="document-end"><span />文档结束<span /></div>
        </article>}
      </section>)}
      </div>
      {active?.kind === 'markdown' && <div className="outline-slot" style={{ width: panels.right && !rightOverlay ? rightWidth : 32 }}><aside className={`outline sidebar ${panels.right ? (rightOverlay ? 'panel-overlay right' : '') : 'collapsed'}`} aria-label="目录面板" style={{ width: panels.right ? rightOverlay ? panelWidths.right : rightWidth : 32 }}>
        {panels.right && !rightOverlay && <PanelResize side="right" width={rightWidth} maxWidth={Math.min(420, availableWidth - (panels.left && !leftOverlay ? leftWidth : 0) - MIN_READING_WIDTH - PANEL_GUTTER)} onResize={(right) => setPanelWidths((current) => ({ ...current, right }))} />}
        {panels.right && rightOverlay && <button className="panel-close" aria-label="关闭目录面板" onClick={() => closeOverlay('right')}><Icon name="close" /></button>}
        <TocDock expanded={panels.right} onToggle={() => togglePanel('right')} />
        <div className="outline-content" hidden={!panels.right}><Outline key={active.path} headings={sections} onSelect={(id) => {
        document.getElementById(`panel-${activeId}`)?.querySelectorAll<HTMLElement>('[id]').forEach((element) => { if (element.id === id) element.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
        if (rightOverlay) closeOverlay('right');
        }} /></div>
      </aside></div>}
    </main>
    {settingsOpen && <Settings onClose={() => setSettingsOpen(false)} onChanged={() => setMessage(null)} error={message?.error ? message.text : undefined} />}
    {profileOpen && <Profile onClose={() => setProfileOpen(false)} error={message?.error ? message.text : undefined} />}
    {message && <div className={`notification ${message.error ? 'error' : ''}`} role={message.error ? 'alert' : 'status'}><span>{message.text}</span><button className="icon-button" aria-label="关闭提示" onClick={() => setMessage(null)}><Icon name="close" /></button></div>}
    <footer className="statusbar"><span><span className="status-dot" />{active ? '只读' : '就绪'}</span><span>{tabs.length ? `${tabs.length} 个标签页` : 'emd 0.1.0'}</span><span className="status-spacer" />{active && <><span>UTF-8</span><button className="status-reload" title={`重新读取文件 · ${hints?.reloadDocument ?? ''}`} aria-label="重新读取文件" onClick={() => { void window.emd.command('reloadDocument'); }}><Icon name="refresh" /></button>{active.kind === 'markdown' && <span className="progress">{progress}%</span>}</>}</footer>
  </div>;
}
