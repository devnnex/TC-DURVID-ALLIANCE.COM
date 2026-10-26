import '../../../operational/dialogs.js';
export function confirmAction(message:string):Promise<boolean>{
  return (globalThis as unknown as {AllianceDialogs:{confirm:(message:string)=>Promise<boolean>}}).AllianceDialogs.confirm(message);
}
