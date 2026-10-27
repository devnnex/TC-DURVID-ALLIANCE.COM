import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AdministrationPage, PersonalAccount } from './Administration';
import { useEmbeddedTransport } from './api';
import { demoContext } from '../../../packages/shared/demo';
import type { Context } from '../../../packages/shared/domain';
import './style.css';

type BranchRuntime = {
  isDemo?: boolean;
  permission: (code: string) => boolean;
  user: () => { id: string; full_name: string; username: string } | null;
  identity?: () => { context: Context };
  adminRequest: (path: string, options: RequestInit, locationId?: string) => Promise<unknown>;
};
const runtime = () => (window as unknown as { OracleDb: BranchRuntime }).OracleDb;
const branch = () => (window as unknown as { BRANCH_CONFIG: { slug: string; name: string; color?: string } }).BRANCH_CONFIG;
const cssUrl = new URL('team-panel.css', document.currentScript?.getAttribute('src') ? new URL(document.currentScript.getAttribute('src')!, location.href) : location.href);
const mounted = new WeakSet<HTMLElement>();

function contextForBranch(): Context {
  const db = runtime();
  if (!db.isDemo) return structuredClone(db.identity!().context);
  const context = structuredClone(demoContext), current = branch(), user = db.user()!;
  context.user = { ...context.user, id: user.id, name: user.full_name, username: user.username };
  if (!context.locations.some(l => l.slug === current.slug)) context.locations.push({ ...context.locations[0], id: 'demo-' + current.slug, slug: current.slug, name: current.name, color: current.color || '#a47a47', active: true });
  return context;
}

function EmbeddedTeam({ initial, personal=false }: { initial: Context; personal?: boolean }) {
  const [context, setContext] = useState(initial);
  const current = context.locations.find(l => l.slug === branch().slug);
  const Page = personal ? PersonalAccount : AdministrationPage;
  return <main className="setup-page team-centre embedded-team">
    <Page context={context} demo={!!runtime().isDemo} selectedLocation={current?.id} onContext={setContext} embedded branchName={current?.name || branch().name} />
  </main>;
}

export async function mount(host: HTMLElement, { personal=false }: { personal?: boolean } = {}) {
  const db = runtime();
  if (!db.user()) throw new Error('Inicia sesión para consultar tu usuario.');
  if (mounted.has(host)) return;
  host.dataset.allianceTeamHost = '';
  const shadow = host.shadowRoot || host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = ':host{display:block;min-width:0;font:400 15px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#24282e}.setup-page.team-centre.embedded-team{padding:0;max-width:none;--accent:var(--branch-accent,#407dd6)}.modal-backdrop{z-index:500}';
  const link = document.createElement('link'); link.rel = 'stylesheet'; link.href = cssUrl.href;
  const loaded = new Promise<void>((resolve, reject) => { link.onload = () => resolve(); link.onerror = () => reject(new Error('No se pudo cargar la presentación de Usuarios. Vuelve a abrir la sección.')); });
  const root = document.createElement('div');root.style.setProperty('--branch-accent',getComputedStyle(host).getPropertyValue('--accent').trim()||branch().color||'#407dd6');
  shadow.replaceChildren(link, style, root);
  await loaded;
  useEmbeddedTransport((path, options, locationId) => db.adminRequest(path, options, locationId));
  createRoot(root).render(<EmbeddedTeam initial={contextForBranch()} personal={personal} />);
  mounted.add(host);
}
