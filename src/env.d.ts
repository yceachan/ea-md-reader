/// <reference types="vite/client" />

type ReaderDocument = { id: string; path: string; name: string; text: string; } & (
  { kind: 'markdown' } | { kind: 'html'; pageUrl: string }
);
interface WorkspaceNode { name: string; path: string; children?: WorkspaceNode[]; }
type ReaderWorkspace = { root: string; name: string; activeAncestors: string[]; } & (
  { nodes: WorkspaceNode[]; error?: never } | { nodes: null; error: string }
);
type ReaderCommand = 'openDocument' | 'saveAs' | 'closeTab' | 'reloadDocument' | 'findInDocument' | 'nextTab' | 'previousTab' | 'quit' | 'zoomIn' | 'zoomOut' | 'zoomReset' | 'toggleFullscreen' | 'toggleFileMenu' | 'openDeveloperTools' | 'openSettings';
type EditorKind = 'markdown' | 'html';
type StartupLayout = 'default' | 'focus';
interface ReaderSettings { editors: Record<EditorKind, { program: string } | null>; startup: { layout: StartupLayout }; startupSupported: boolean; }
interface ReaderProfile { name: string; tagline: string; email: string; github: string; repository: string; copyright: string; license: string; photoUrl: string; }
type CommandHints = Record<ReaderCommand, string>;
type CommandAvailability = Record<ReaderCommand, boolean>;
interface CommandAction { id: ReaderCommand; documentId: string | null; }
interface WorkspaceAction { action: 'open' | 'new-tab' | 'refresh'; path?: string; }
interface Window {
  emd: {
    window(action: 'minimize' | 'maximize' | 'close'): Promise<void>;
    onWindowState(listener: (maximized: boolean) => void): () => void;
    onDisplayWidth(listener: (width: number) => void): () => void;
    settings(): Promise<ReaderSettings | null>;
    startupState(): Promise<{ workspace: boolean; root: string | null; panels: { left: boolean; right: boolean } }>;
    chooseStartup(layout: StartupLayout): Promise<ReaderSettings | null>;
    profile(): Promise<ReaderProfile | null>;
    profileLink(target: 'email' | 'github' | 'repository'): Promise<void>;
    chooseEditor(kind: EditorKind): Promise<ReaderSettings | null>;
    clearEditor(kind: EditorKind): Promise<ReaderSettings | null>;
    editDocument(id: string, choose?: boolean): Promise<boolean | null>;
    editWorkspace(root: string, path: string): Promise<boolean | null>;
    documentMenu(id: string, root?: string): Promise<void>;
    onDocumentUpdate(listener: (document: ReaderDocument) => void): () => void;
    ready(): Promise<CommandHints>;
    command(id: ReaderCommand, documentId?: string): Promise<boolean>;
    activeDocument(id: string | null): Promise<CommandAvailability>;
    workspace(id: string | null, root?: string): Promise<ReaderWorkspace | null>;
    workspaceOpen(root: string, path: string, newTab: boolean, activeId: string | null): Promise<boolean | null>;
    workspaceMenu(root: string, path: string | null, activeId: string | null): Promise<void>;
    onWorkspaceAction(listener: (action: WorkspaceAction) => void): () => void;
    save(id: string): Promise<string | null>;
    close(id: string): Promise<void>;
    reload(id: string): Promise<ReaderDocument | null>;
    link(id: string, href: string): Promise<void>;
    find(text: string, forward: boolean): Promise<void>;
    onDocument(listener: (document: ReaderDocument) => void): () => void;
    onActivate(listener: (id: string) => void): () => void;
    onAction(listener: (action: CommandAction) => void): () => void;
    onAnchor(listener: (anchor: string) => void): () => void;
    onError(listener: (message: string) => void): () => void;
  };
}
