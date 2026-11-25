/* Compress product photos before they enter the existing menu document/backup. */
globalThis.AllianceProductPhotos = (() => {
  const MAX_BYTES = 80 * 1024, MAX_SIDE = 640;
  const encode = (canvas, type, quality) => new Promise(resolve => canvas.toBlob(resolve, type, quality));
  async function optimize(file) {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file?.type)) throw Error('Elige una foto JPG, PNG o WebP.');
    if (file.size > 20 * 1024 * 1024) throw Error('Elige una foto de menos de 20 MB.');
    const url = URL.createObjectURL(file), picture = new Image();
    try {
      picture.src = url;
      await picture.decode();
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      if (!context) throw Error('No se pudo preparar la foto. Intenta con otra imagen.');
      let blob;
      for (const side of [MAX_SIDE,560,480,400,320]) {
        const scale = Math.min(1, side / Math.max(picture.naturalWidth, picture.naturalHeight));
        canvas.width = Math.max(1, Math.round(picture.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(picture.naturalHeight * scale));
        context.imageSmoothingQuality = 'high';
        context.drawImage(picture, 0, 0, canvas.width, canvas.height);
        let supportsWebp = true;
        for (const quality of [.84,.76,.7]) {
          blob = await encode(canvas, 'image/webp', quality);
          if (blob?.type !== 'image/webp') {supportsWebp=false;break;}
          if (blob.size <= MAX_BYTES) break;
        }
        if (!supportsWebp) {
          context.fillStyle='#fff';context.fillRect(0,0,canvas.width,canvas.height);
          context.drawImage(picture,0,0,canvas.width,canvas.height);
          blob=await encode(canvas,'image/jpeg',.8);
        }
        if (blob && ['image/webp','image/jpeg'].includes(blob.type) && blob.size <= MAX_BYTES) break;
      }
      if (!blob || blob.size > MAX_BYTES) throw Error('Esta foto tiene demasiado detalle. Elige una más sencilla para conservar buena calidad y poco espacio.');
      const dataUrl = await new Promise((resolve, reject) => { const reader = new FileReader();reader.onload = () => resolve(reader.result);reader.onerror = reject;reader.readAsDataURL(blob); });
      return {dataUrl, bytes: blob.size, originalBytes: file.size, width: canvas.width, height: canvas.height};
    } catch (error) {
      if (error.name === 'EncodingError') throw Error('No pudimos leer la foto. Prueba con otra imagen JPG, PNG o WebP.');
      throw error;
    } finally { URL.revokeObjectURL(url); }
  }
  function preview(form, url = '', note = '') {
    form.productPhoto = url;
    const box = form.querySelector('[data-product-photo-preview]');
    if (box) { box.replaceChildren(); if (url) {const img = new Image();img.src = url;img.alt = 'Foto del producto';box.append(img);} else box.textContent = 'Sin foto'; }
    const caption = form.querySelector('[data-product-photo-status]');if (caption) caption.textContent = note || 'Optimización automática · máximo 80 KB';
    const choose=form.querySelector('[data-choose-product-photo]');if(choose)choose.querySelector('span').textContent=url?'Cambiar foto':'Elegir foto';
    const remove = form.querySelector('[data-remove-product-photo]');if (remove) remove.hidden = !url;
  }
  document.addEventListener('DOMContentLoaded', () => {
    const form = document.querySelector('#inventoryForm');if (!form) return;
    const compact=['cafeteria','cocteleria'].includes(window.BRANCH_CONFIG?.slug);
    if(compact){
      document.querySelector('#inventoryDialog').classList.add('is-digital-menu-editor');
      for(const [name,style] of [['product_name','inventory-name-field'],['product_code','inventory-code-field'],['category_id','inventory-category-field'],['new_category','inventory-new-category-field']])form.elements[name].closest('label').classList.add(style);
      form.append(form.querySelector('.inventory-form-actions'));
    }
    const field = document.createElement('div');field.className = 'inventory-photo-field wide';
    field.classList.toggle('is-premium-photo',compact);
    field.innerHTML = '<span data-product-photo-preview class="inventory-photo-preview">Sin foto</span><div class="inventory-photo-copy"><strong>Foto del producto</strong><small data-product-photo-status role="status">Optimización automática · máximo 80 KB</small><input class="'+(compact?'inventory-photo-input':'')+'" name="product_photo" type="file" aria-label="Foto del producto" accept="image/jpeg,image/png,image/webp"></div>'+(compact?'<button type="button" class="inventory-photo-choose" data-choose-product-photo aria-label="Elegir o cambiar foto del producto"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M12 16V4m-4 4 4-4 4 4M4 15v5h16v-5"/></svg><span>Elegir foto</span></button>':'')+'<button type="button" class="ghost small" data-remove-product-photo hidden>Quitar foto</button>';
    if(!compact)field.innerHTML='<span data-product-photo-preview class="inventory-photo-preview">Sin foto</span><label>Foto del producto<input name="product_photo" type="file" accept="image/jpeg,image/png,image/webp"><small data-product-photo-status role="status">Optimización automática · máximo 80 KB</small></label><button type="button" class="ghost small" data-remove-product-photo hidden>Quitar foto</button>';
    form.querySelector('.inventory-live-calculation').before(field);
    const input = field.querySelector('input');let generation = 0;
    field.querySelector('[data-choose-product-photo]')?.addEventListener('click',()=>input.click());
    form.addEventListener('reset', () => {generation++;form.photoPending = false;preview(form);});
    input.addEventListener('change', async () => {
      const file = input.files[0];if (!file) return;
      const current = ++generation;form.photoPending = true;
      field.querySelector('[data-product-photo-status]').textContent = 'Optimizando foto…';
      try {const result = await optimize(file);if (current !== generation) return;preview(form, result.dataUrl, 'Lista · '+Math.ceil(result.bytes/1024)+' KB · '+result.width+' × '+result.height+' px');}
      catch (error) {if (current === generation) {preview(form, form.productPhoto, error.message);input.value = '';}}
      finally {if (current === generation) form.photoPending = false;}
    });
    field.querySelector('[data-remove-product-photo]').onclick = () => {generation++;form.photoPending = false;input.value = '';preview(form);};
  });
  return {optimize, preview};
})();
