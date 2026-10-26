// Shared login controls work in every branch, including opening the HTML directly.
document.addEventListener('DOMContentLoaded', () => {
  const toggle = document.querySelector('.login-password-toggle');
  const password = document.querySelector('#loginPassword');
  toggle?.addEventListener('click', () => {
    const show = password.type === 'password';
    password.type = show ? 'text' : 'password';
    toggle.textContent = show ? 'Ocultar' : 'Mostrar';
    toggle.setAttribute('aria-label', show ? 'Ocultar contraseña' : 'Mostrar contraseña');
    toggle.setAttribute('aria-pressed', String(show));
  });
});

// Uses the authenticated session timestamp; section changes and reloads never invent a new login.
globalThis.AllianceSessionBadge={render(user){
  const root=document.querySelector('.admin-app, #waiterApp');if(!root)return;
  let badge=root.querySelector('#currentSessionBadge');
  if(!user){if(badge)badge.hidden=true;return;}
  if(!badge){badge=document.createElement('div');badge.id='currentSessionBadge';badge.className='current-session-corner';badge.setAttribute('role','group');badge.setAttribute('aria-label','Usuario conectado');badge.innerHTML='<span data-session-name></span><span aria-hidden="true">·</span><span data-session-label>Último inicio de sesión:</span><time data-session-time></time>';root.prepend(badge);}
  const name=user.full_name||user.name||user.username||'Usuario';
  badge.hidden=false;badge.querySelector('[data-session-name]').textContent=name;
  badge.querySelector('[data-session-name]').title=name;
  const time=badge.querySelector('[data-session-time]'),stamp=user.last_login_at,date=stamp?new Date(stamp):null;
  if(date&&Number.isFinite(date.getTime())){time.dateTime=date.toISOString();time.textContent=new Intl.DateTimeFormat('en-US',{timeZone:'America/Bogota',hour:'numeric',minute:'2-digit',hour12:true}).format(date).toLowerCase();time.title=new Intl.DateTimeFormat('es-CO',{timeZone:'America/Bogota',dateStyle:'long',timeStyle:'short'}).format(date);}
  else{time.removeAttribute('datetime');time.removeAttribute('title');time.textContent='Hora no disponible';}
}};
