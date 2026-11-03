/* Floating selectors remain in their dialog's top layer and fit the viewport. */
globalThis.AllianceSelectors=(()=>{
  const norm=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  function floating(panel,anchor,onClose=()=>{}){
    if(panel.allianceFloatingClose)return panel.allianceFloatingClose;
    panel.setAttribute('popover','manual');panel.classList.add('alliance-floating');panel.hidden=false;
    const place=()=>{
      if(!anchor.isConnected){close();return;}
      const r=anchor.getBoundingClientRect(),gap=6,pad=12,vw=document.documentElement.clientWidth,vh=innerHeight;
      const width=Math.min(Math.max(r.width,280),vw-pad*2),below=vh-r.bottom-pad,above=r.top-pad,up=below<180&&above>below;
      panel.style.width=width+'px';panel.style.maxHeight=Math.max(80,Math.min(320,(up?above:below)-gap))+'px';
      panel.style.left=Math.max(pad,Math.min(r.left,vw-width-pad))+'px';panel.style.top=(up?Math.max(pad,r.top-gap-panel.getBoundingClientRect().height):r.bottom+gap)+'px';
    };
    const outside=e=>{if(!panel.contains(e.target)&&!anchor.contains(e.target))close();};
    const key=e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close();anchor.focus?.({preventScroll:true});}};
    const dialog=anchor.closest('dialog');
    function close(){if(!panel.allianceFloatingClose)return;delete panel.allianceFloatingClose;if(panel.hidePopover&&panel.matches(':popover-open'))panel.hidePopover();panel.hidden=true;window.removeEventListener('resize',place);document.removeEventListener('scroll',place,true);document.removeEventListener('pointerdown',outside,true);panel.removeEventListener('keydown',key);dialog?.removeEventListener('close',close);onClose();}
    panel.allianceFloatingClose=close;panel.showPopover?.();place();requestAnimationFrame(place);
    window.addEventListener('resize',place);document.addEventListener('scroll',place,true);document.addEventListener('pointerdown',outside,true);panel.addEventListener('keydown',key);dialog?.addEventListener('close',close);
    return close;
  }
  function stock(anchor,items,select){
    document.querySelectorAll('.cost-stock-menu').forEach(p=>{p.allianceFloatingClose?.();p.remove();});
    const panel=document.createElement('div');panel.className='cost-stock-menu';panel.innerHTML='<input type="search" placeholder="Buscar o seleccionar insumo…" aria-label="Buscar insumo de la macro"><div role="listbox" aria-label="Insumos de la macro"></div><p role="status"></p>';anchor.after(panel);
    const input=panel.querySelector('input'),list=panel.querySelector('[role=listbox]');anchor.setAttribute('aria-expanded','true');
    const close=floating(panel,anchor.closest('.cost-source-heading')||anchor,()=>{anchor.setAttribute('aria-expanded','false');panel.remove();});
    const draw=()=>{list.replaceChildren();for(const item of items.filter(i=>norm(i.name).includes(norm(input.value)))){const button=document.createElement('button');button.type='button';button.setAttribute('role','option');button.textContent=item.name+' · '+(item.unit==='u'?'unidades':item.unit);button.onclick=async()=>{close();try{await select(item);}catch(error){await AllianceDialogs.alert(error.message);}};list.append(button);}if(!list.children.length)panel.querySelector('[role=status]').textContent='No hay insumos que coincidan.';else panel.querySelector('[role=status]').textContent='';};
    input.oninput=draw;panel.onkeydown=e=>{if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();const choices=[...list.children],index=choices.indexOf(document.activeElement);choices[(index+(e.key==='ArrowDown'?1:-1)+choices.length)%choices.length]?.focus();}else if(e.key==='Enter'&&document.activeElement===input){e.preventDefault();list.firstElementChild?.click();}};draw();input.focus({preventScroll:true});return close;
  }
  return {floating,stock};
})();
