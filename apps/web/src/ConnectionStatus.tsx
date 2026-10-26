import { useEffect,useState } from 'react';
import { Cloud,CloudOff } from 'lucide-react';
import { api } from './api';
export type Installation={provider:string;setup_required:boolean;setup_available:boolean};
export function useInstallation(){
  const [value,setValue]=useState<Installation>(),[error,setError]=useState(''),[checking,setChecking]=useState(true);
  useEffect(()=>{let alive=true;const load=async()=>{try{const result=await api<Installation>('/installation',{},undefined,false);if(alive){setValue(result);setError('');}}catch(e){if(alive){setValue(undefined);setError(e instanceof Error?e.message:'No se pudo comprobar la conexión.');}}finally{if(alive)setChecking(false);}};void load();const timer=window.setInterval(()=>void load(),30000);return()=>{alive=false;window.clearInterval(timer);};},[]);
  return {value,error,checking};
}
export function ConnectionStatus({state}:{state:ReturnType<typeof useInstallation>}){
  return <div className={`installation-status ${state.error?'unavailable':''}`} role="status">{state.error?<CloudOff size={17}/>:<Cloud size={17}/>}<span>{state.checking?'Comprobando conexión…':state.error|| (state.value?.provider?.startsWith('oracle')?'Conexión lista':'Entorno de prueba · Datos temporales')}</span></div>;
}
