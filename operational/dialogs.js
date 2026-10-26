/* Non-blocking application messages shared by every entry point. */
(() => {
  if(globalThis.AllianceDialogs)return;
  let queue=Promise.resolve();
  function open(kind,options){
    const config=typeof options==='string'?{message:options}:options||{};
    const run=()=>new Promise(resolve=>{
      if(!document.querySelector('#alliance-dialog-style')){
        const style=document.createElement('style');style.id='alliance-dialog-style';
        style.textContent=`.alliance-message{box-sizing:border-box;width:min(460px,calc(100vw - 32px));max-height:calc(100dvh - 32px);border:1px solid #ffffffbd;border-radius:26px;padding:0;background:#fcfdfef5;color:#1d2633;box-shadow:0 28px 100px #14213638;font:16px/1.5 system-ui,sans-serif}.alliance-message::backdrop{background:#17223155;backdrop-filter:blur(8px)}.alliance-message form{display:grid;gap:16px;padding:28px;margin:0}.alliance-message .message-symbol{display:grid;place-items:center;width:48px;height:48px;border-radius:16px;background:#fff0e8;color:#ba4d1b;font-size:26px;font-weight:650}.alliance-message h2{font:650 23px/1.25 system-ui;margin:0;letter-spacing:-.6px}.alliance-message p{margin:0;color:#566171;white-space:pre-line;overflow-wrap:anywhere}.alliance-message input{box-sizing:border-box;width:100%;font:inherit;font-size:16px;border:1px solid #d5dce5;border-radius:12px;padding:13px;background:white;color:#172231}.alliance-message footer{display:flex;gap:10px;justify-content:flex-end;margin-top:8px}.alliance-message button{font:600 15px/1.3 system-ui;border:1px solid #dce1e8;padding:13px 18px;border-radius:13px;background:#f0f3f7;color:#334054;cursor:pointer;min-height:46px}.alliance-message button[value=accept]{background:var(--accent,#166b56);border-color:transparent;color:white}.alliance-message button:focus-visible{outline:3px solid #478ae8;outline-offset:3px}@media(max-width:400px){.alliance-message form{padding:22px}.alliance-message footer{flex-direction:column-reverse}.alliance-message button{width:100%}}`;
        document.head.append(style);
      }
      const previous=document.activeElement,dialog=document.createElement('dialog');dialog.className='alliance-message';dialog.id='systemMessageDialog';dialog.setAttribute('aria-labelledby','systemMessageTitle');dialog.setAttribute('aria-describedby','systemMessageText');
      dialog.innerHTML='<form method="dialog" data-no-draft><span class="message-symbol" aria-hidden="true"></span><h2 id="systemMessageTitle"></h2><p id="systemMessageText"></p><input name="answer" aria-label="Respuesta"><footer><button value="cancel" type="submit"></button><button value="accept" type="submit"></button></footer></form>';
      dialog.querySelector('.message-symbol').textContent=kind==='confirm'?'?':'i';
      dialog.querySelector('h2').textContent=config.title||(kind==='confirm'?'Antes de continuar':'Un momento');dialog.querySelector('p').textContent=config.message||'';
      const input=dialog.querySelector('input');input.hidden=kind!=='prompt';input.disabled=kind!=='prompt';input.value=config.value||'';input.autocomplete='off';
      const cancel=dialog.querySelector('[value=cancel]');cancel.textContent=config.cancel||'Cancelar';cancel.hidden=kind==='alert';cancel.formNoValidate=true;
      const accept=dialog.querySelector('[value=accept]');accept.textContent=config.accept||(kind==='confirm'?'Sí, continuar':kind==='prompt'?'Guardar':'Entendido');
      input.addEventListener('keydown',event=>{if(event.key==='Enter'&&!event.isComposing){event.preventDefault();accept.click();}});
      dialog.addEventListener('click',event=>{if(event.target===dialog)dialog.close('cancel');});
      dialog.addEventListener('close',()=>{const accepted=dialog.returnValue==='accept',value=kind==='prompt'?(accepted?input.value:null):kind==='confirm'?accepted:undefined;dialog.remove();if(previous?.isConnected)previous.focus({preventScroll:true});resolve(value);},{once:true});
      document.body.append(dialog);dialog.showModal();(kind==='prompt'?input:kind==='confirm'?cancel:accept).focus({preventScroll:true});
    });
    const pending=queue.then(run,run);queue=pending.catch(()=>{});return pending;
  }
  globalThis.AllianceDialogs={confirm:options=>open('confirm',options),alert:options=>open('alert',options),prompt:options=>open('prompt',options)};
})();
