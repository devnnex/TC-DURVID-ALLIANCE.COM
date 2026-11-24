import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AdministrationPage, PersonalAccount } from './Administration';
import { useEmbeddedTransport } from './api';
import { demoContext } from '../../../packages/shared/demo';
import type { Context } from '../../../packages/shared/domain';
import './style.css';
import { WaiterPerformance } from './WaiterPerformance';
import type { Administration } from '../../../packages/shared/administration';

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
const roots = new WeakMap<HTMLElement,ReturnType<typeof createRoot>>();
export function unmount(host:HTMLElement){roots.get(host)?.unmount();roots.delete(host);mounted.delete(host);}

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

function PerformanceAnalysis({context}:{context:Context}) {
  const location=context.locations.find(l=>l.slug===branch().slug),[members,setMembers]=useState<{id:string;name:string;progressSince?:string}[]>(),[error,setError]=useState('');
  useEffect(()=>{let active=true;if(!location)return;
    const load=async()=>{
      if(runtime().isDemo){setMembers([]);return;}
      // The existing administration boundary remains in force; no directory is
      // exposed to a role that previously could not read it.
      const data=await runtime().adminRequest('/admin/overview',{},location.id) as Administration;
      if(active)setMembers(data.users.filter(u=>u.access.some(a=>a.location_id===location.id&&a.roles.includes('WAITER'))).map(u=>({id:u.id,name:u.name,progressSince:u.progressSince?.[location.id]})));
    };void load().catch(e=>{if(active)setError(e.message);});return()=>{active=false;};
  },[context.user.id,location?.id]);
  if(error)return <p className="form-error" role="alert">{error}</p>;
  if(!members)return <p role="status">Consultando el equipo de este negocio…</p>;
  if(!members.length)return <div className="team-empty"><h3>Tu equipo aparecerá aquí</h3><p>Agrega integrantes con rol Mesero desde Usuarios para ver sus resultados.</p></div>;
  return <WaiterPerformance members={members} locationId={location!.id} branchSlug={location!.slug}/>;
}
export async function mount(host: HTMLElement, { personal=false,performance=false }: { personal?: boolean;performance?:boolean } = {}) {
  const db = runtime();
  if (!db.user()) throw new Error('Inicia sesión para consultar tu usuario.');
  if(performance&&(!['cocteleria','cafeteria'].includes(branch().slug)||!db.permission('sales.read')))throw new Error('No tienes acceso al análisis de meseros de este negocio.');
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
  if(!host.isConnected)return;
  useEmbeddedTransport((path, options, locationId) => db.adminRequest(path, options, locationId));
  const reactRoot=createRoot(root);roots.set(host,reactRoot);
  reactRoot.render(performance?<PerformanceAnalysis context={contextForBranch()}/>:<EmbeddedTeam initial={contextForBranch()} personal={personal} />);
  mounted.add(host);
}
