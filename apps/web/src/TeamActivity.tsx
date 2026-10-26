import { useEffect,useRef,useState } from 'react';
import { Activity,ArrowRight,Check,Eye,RefreshCw } from 'lucide-react';
import { api } from './api';
import '../../../operational/activity.js';
import type { Context } from '../../../packages/shared/domain';
export const sectionNames:Record<string,string>={dashboard:'Inicio',service:'Atender mesa',accounts:'Cuentas',inventory:'Inventario',movements:'Movimientos',income:'Ventas',assistant:'Asistente IA',menu:'Mesas y menú',brand:'Configuración',users:'Usuarios y accesos',activity:'Seguimiento',costing:'Costo de productos',tips:'Propinas',supplies:'Insumos y compras',kitchen:'Preparación en Inicio',customers:'Clientes y cartera',cash:'Turnos de Ventas'};
export type TeamEvent={id:string;actorId:string|null;actorName:string;locationId:string|null;locationName:string;section:string;action:string;summary:string;entityId?:string;occurredAt?:string;deviceId?:string;at:string};
type Page={items:TeamEvent[];hasMore:boolean};
const demoLog=()=> (globalThis as unknown as {AllianceDemoActivity:{read:()=>TeamEvent[];record:(e:unknown)=>void}}).AllianceDemoActivity;
export function trackCentre(context:Context,demo:boolean,branchId:string|undefined,section:string){
  if(demo){const branch=context.locations.find(l=>l.id===branchId);demoLog().record({section,action:'VIEW',summary:'Consultó esta sección',actor:context.user,branch:branch||{slug:'centre',name:'Centro operativo'}});}
  else void api('/activity/visit',{method:'POST',body:JSON.stringify({section})},branchId).catch(()=>{});
}
export function TeamActivity({context,demo,branchId,users}:{context:Context;demo:boolean;branchId?:string;users:{id:string;name:string}[]}){
  const generation=useRef(0);
  const [items,setItems]=useState<TeamEvent[]>([]),[error,setError]=useState(''),[busy,setBusy]=useState(false),[hasMore,setMore]=useState(false),[offset,setOffset]=useState(0);
  const [branch,setBranch]=useState(branchId||''),[actor,setActor]=useState(''),[section,setSection]=useState(''),[kind,setKind]=useState('all'),[days,setDays]=useState('30');
  const load=async(append=false,signal?:AbortSignal)=>{const current=++generation.current;setBusy(true);setError('');try{
    const next=append?offset+50:0;let page:Page;
    if(demo){const slug=context.locations.find(l=>l.id===branch)?.slug;const found=demoLog().read().filter(e=>(!branch||e.locationId===slug)&&(!actor||e.actorId===actor)&&(!section||e.section===section)&&(kind==='all'||(kind==='views')===(e.action==='VIEW'))&&Date.now()-Date.parse(e.at)<=Number(days)*86400000);page={items:found.slice(next,next+50),hasMore:found.length>next+50};}
    else page=await api<Page>('/admin/activity',{method:'POST',signal,body:JSON.stringify({location_id:branch,actor_user_id:actor,section,kind,days:Number(days),offset:next})});
    if(signal?.aborted||current!==generation.current)return;setItems(v=>append?[...v,...page.items]:page.items);setMore(page.hasMore);setOffset(next);
  }catch(e){if(!signal?.aborted&&current===generation.current)setError(e instanceof Error?e.message:'No se pudo consultar el seguimiento.');}finally{if(!signal?.aborted&&current===generation.current)setBusy(false);}};
  useEffect(()=>{const controller=new AbortController();void load(false,controller.signal);return()=>controller.abort();},[branch,actor,section,kind,days]);
  return <div className="team-activity"><div className="team-toolbar"><div><h2>Seguimiento del equipo</h2><p>Quién lo hizo, dónde y cuándo. Los cambios aparecen al confirmarse.</p></div><button className="secondary" disabled={busy} onClick={()=>void load()}><RefreshCw size={16}/>Actualizar</button></div>
    <div className="team-filters"><label>Sucursal<select aria-label="Sucursal" value={branch} onChange={e=>setBranch(e.target.value)}><option value="">Todas + centro operativo</option>{context.locations.map(l=><option key={l.id} value={l.id}>{l.name}</option>)}</select></label><label>Responsable<select aria-label="Responsable" value={actor} onChange={e=>setActor(e.target.value)}><option value="">Todos los responsables</option>{users.map(u=><option key={u.id} value={u.id}>{u.name}</option>)}</select></label><label>Sección<select aria-label="Sección" value={section} onChange={e=>setSection(e.target.value)}><option value="">Todas las secciones</option>{Object.entries(sectionNames).filter(([code])=>code!=='assistant').map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label><label>Actividad<select aria-label="Actividad" value={kind} onChange={e=>setKind(e.target.value)}><option value="all">Visitas y cambios</option><option value="changes">Solo cambios</option><option value="views">Solo visitas</option></select></label><label>Período<select aria-label="Período" value={days} onChange={e=>setDays(e.target.value)}><option value="1">Últimas 24 horas</option><option value="7">Últimos 7 días</option><option value="30">Últimos 30 días</option><option value="90">Últimos 90 días</option></select></label></div>
    {demo&&<p className="notice">Actividad de tu demostración en este dispositivo. Los registros reales se guardan en servicio seguro.</p>}
    {error&&<p className="form-error" role="alert">{error}</p>}{busy&&<p role="status" className="muted">Consultando actividad…</p>}
    <ol className="team-timeline">{items.map(e=><li key={e.id}><span className={'event-symbol '+(e.action==='VIEW'?'visit':'change')}>{e.action==='VIEW'?<Eye size={18}/>:<Check size={18}/>}</span><div><strong>{e.actorName}</strong><p>{e.action==='VIEW'?'Consultó '+(sectionNames[e.section]||e.section):e.summary}</p><small>{e.locationName} · {sectionNames[e.section]||e.section}</small></div><time dateTime={e.at}>{new Intl.DateTimeFormat('es-CO',{dateStyle:'medium',timeStyle:'short',timeZone:'America/Bogota'}).format(new Date(e.occurredAt||e.at))}{e.occurredAt&&<small>Hora del equipo · confirmado en servicio seguro</small>}</time></li>)}</ol>
    {!items.length&&!busy&&!error&&<div className="team-empty"><Activity size={32}/><h3>Todo empieza con una acción</h3><p>Las visitas y los cambios del equipo aparecerán aquí. Prueba otro filtro si buscas una actividad anterior.</p></div>}
    {hasMore&&<button className="secondary full" disabled={busy} onClick={()=>void load(true)}>Ver más actividad<ArrowRight size={16}/></button>}
    <p className="team-footnote">Una visita indica que se abrió una sección; cada cambio identifica una operación confirmada. Las consultas automáticas no llenan este registro.</p>
  </div>;
}
