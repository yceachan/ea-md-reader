import { useEffect, useState } from 'react';

function Folder({ node, activePath, activeAncestors, onOpen, onMenu }: {
  node: WorkspaceNode; activePath: string; activeAncestors: string[]; onOpen: (path: string, newTab: boolean) => void; onMenu: (path: string) => void;
}) {
  const containsActive = activeAncestors.includes(node.path);
  const [expanded, setExpanded] = useState(containsActive);
  useEffect(() => { if (containsActive) setExpanded(true); }, [containsActive]);
  if (!node.children) return <li role="none">
    <button className={`workspace-file ${activePath === node.path ? 'active' : ''}`} role="treeitem" aria-selected={activePath === node.path} title={node.path}
      onClick={(event) => onOpen(node.path, event.altKey)} onContextMenu={(event) => { event.preventDefault(); onMenu(node.path); }}>
      <span className="file-badge">{/\.html?$/i.test(node.name) ? 'HTML' : 'MD'}</span><span>{node.name}</span>
    </button>
  </li>;
  return <li role="none">
    <button className="workspace-folder" role="treeitem" aria-expanded={expanded} title={node.path} onClick={() => setExpanded((value) => !value)} onContextMenu={(event) => { event.preventDefault(); onMenu(node.path); }}>
      <svg className={expanded ? 'expanded' : ''} viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true"><path d="m4 2 4 4-4 4" /></svg>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true"><path d="M3 7V5h6l3 3h9v12H3Z" /></svg><span>{node.name}</span>
    </button>
    {expanded && <ul role="group">{node.children.map((child) => <Folder key={child.path} node={child} activePath={activePath} activeAncestors={activeAncestors} onOpen={onOpen} onMenu={onMenu} />)}</ul>}
  </li>;
}

export default function Workspace({ workspace, loading, activePath, onOpen, onMenu, onRefresh }: {
  workspace: ReaderWorkspace | null; loading: boolean; activePath: string;
  onOpen: (path: string, newTab: boolean) => void; onMenu: (path: string) => void; onRefresh: () => void;
}) {
  return <>
    <div className="sidebar-header"><p className="sidebar-title">WORKSPACE</p>
      <button className="icon-button" aria-label="刷新工作区" title="刷新工作区" disabled={loading} onClick={onRefresh}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M20 8a8 8 0 1 0 0 8M20 3v5h-5" /></svg>
      </button>
    </div>
    {workspace && <p className="workspace-root" title={workspace.root} onContextMenu={(event) => { event.preventDefault(); onMenu(workspace.root); }}>{workspace.name || workspace.root}</p>}
    <nav className="sidebar-scroll" aria-label="工作区文件">
      {loading ? <p className="sidebar-empty" role="status">正在扫描 Markdown 和 HTML…</p> : workspace ? <ul role="tree" aria-label={workspace.root}>{workspace.nodes.map((node) => <Folder key={node.path} node={node} activePath={activePath} activeAncestors={workspace.activeAncestors} onOpen={onOpen} onMenu={onMenu} />)}</ul> : <p className="sidebar-empty">工作区未加载，请刷新重试。</p>}
    </nav>
  </>;
}
