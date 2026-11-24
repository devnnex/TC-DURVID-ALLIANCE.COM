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
      const scale = Math.min(1, MAX_SIDE / Math.max(picture.naturalWidth, picture.naturalHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(picture.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(picture.naturalHeight * scale));
      const context = canvas.getContext('2d');
      if (!context) throw Error('No se pudo preparar la foto. Intenta con otra imagen.');
      context.imageSmoothingQuality = 'high';
      let blob;
      for (const quality of [.84, .76, .68]) {
        context.clearRect(0, 0, canvas.width, canvas.height);
        context.drawImage(picture, 0, 0, canvas.width, canvas.height);
        blob = await encode(canvas, 'image/webp', quality);
        if (blob && blob.type === 'image/webp' && blob.size <= MAX_BYTES) break;
      }
      if (!blob || blob.type !== 'image/webp' || blob.size > MAX_BYTES) {
        // JPEG fallback for browsers without a WebP encoder; never keep the original.
        context.fillStyle = '#fff';context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(picture, 0, 0, canvas.width, canvas.height);
        blob = await encode(canvas, 'image/jpeg', .76);
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
    const caption = form.querySelector('[data-product-photo-status]');if (caption) caption.textContent = note || 'Opcional · se optimiza antes de guardar';
    const remove = form.querySelector('[data-remove-product-photo]');if (remove) remove.hidden = !url;
  }
  document.addEventListener('DOMContentLoaded', () => {
    const form = document.querySelector('#inventoryForm');if (!form) return;
    const field = document.createElement('div');field.className = 'inventory-photo-field wide';
    field.innerHTML = '<span data-product-photo-preview class="inventory-photo-preview">Sin foto</span><label>Foto del producto<input name="product_photo" type="file" accept="image/jpeg,image/png,image/webp"><small data-product-photo-status role="status">Opcional · se optimiza antes de guardar</small></label><button type="button" class="ghost small" data-remove-product-photo hidden>Quitar foto</button>';
    form.querySelector('.inventory-live-calculation').before(field);
    const input = field.querySelector('input');let generation = 0;
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
