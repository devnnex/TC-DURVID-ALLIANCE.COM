/* Shared COP inputs: presentation in whole pesos, numeric values for calculations. */
globalThis.AllianceMoney = (() => {
  function number(value) {
    if (value && typeof value === 'object') {
      if (value.dataset?.rawValue !== undefined && value.value === value.dataset.formattedValue) return value.dataset.rawValue === '' ? null : Number(value.dataset.rawValue);
      value = value.value;
    }
    if (typeof value === 'number') return value;
    const original = String(value ?? ''), text = original.replace(/[$\s]/g, '');
    if (!text) return null;
    // Accept pasted Colombian prices, including an explicit decimal part.
    const normalized = text.includes(',') ? text.replace(/\./g, '').replace(',', '.')
      : original.includes('$') || /^-?\d{1,3}(\.\d{3})+$/.test(text) ? text.replace(/\./g, '') : text;
    return /^-?\d+(\.\d+)?$/.test(normalized) ? Number(normalized) : NaN;
  }
  function format(value, {allowEmpty = true} = {}) {
    const n = number(value);
    if (n === null) return allowEmpty ? '' : '$0';
    if (!Number.isFinite(n)) return String(value?.value ?? value ?? '');
    return (n < 0 ? '-$' : '$') + Math.abs(Math.round(n)).toLocaleString('es-CO', {maximumFractionDigits: 0});
  }
  function set(input, value) {
    const n = number(value);input.value = format(value);
    input.dataset.rawValue = n === null ? '' : String(n);input.dataset.formattedValue = input.value;
    validate(input);
  }
  function validate(input) {
    const n = number(input);
    const error = n === null ? (input.required ? 'Escribe un valor en pesos.' : '')
      : !Number.isFinite(n) ? 'Escribe un valor válido en pesos.'
      : n < Number(input.getAttribute('min') ?? 0) ? 'Escribe un valor desde cero.'
      : input.hasAttribute('max') && n > Number(input.getAttribute('max')) ? 'El valor supera el máximo permitido.' : '';
    input.setCustomValidity(error);return !error;
  }
  function edit(input) {
    const old = input.value, cursor = input.selectionStart ?? old.length;
    const digits = old.slice(0, cursor).replace(/\D/g, '').length;
    set(input, old);
    if (cursor === old.length) input.setSelectionRange(input.value.length, input.value.length);
    else {let seen=0,position=0;while(position<input.value.length && seen<digits){if(/\d/.test(input.value[position]))seen++;position++;}input.setSelectionRange(position,position);}
  }
  function bind(root = document) {
    root.querySelectorAll('[data-currency-input]').forEach(input => {
      if (input.dataset.currencyBound === 'true') return;
      input.dataset.currencyBound = 'true';set(input, input.value);
      input.addEventListener('input', () => edit(input));
    });
  }
  return {number,format,set,validate,edit,bind};
})();
