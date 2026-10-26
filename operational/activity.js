/* Local demonstration log. Real activity is attributed and persisted by servicio seguro. */
globalThis.AllianceDemoActivity = (() => {
  const key='alliance-demo-activity-v1';
  const read=()=>{try{return JSON.parse(localStorage.getItem(key)||'[]');}catch{return [];}};
  function record({section,action,summary,actor,branch,entityId=null}) {
    const items=read(),at=new Date().toISOString();
    if(action==='VIEW'&&items.some(e=>e.section===section&&e.locationId===branch.slug&&e.actorId===actor.id&&e.action==='VIEW'&&Date.now()-Date.parse(e.at)<30000))return;
    const event={id:globalThis.crypto.randomUUID?.()||at+Math.random(),section,action,summary,actorId:actor.id,actorName:actor.full_name||actor.name,locationId:branch.slug,locationName:branch.name||branch.slug||'Centro operativo',entityId,at};
    try{localStorage.setItem(key,JSON.stringify([event,...items].slice(0,500)));}catch{}
  }
  return {read,record};
})();
