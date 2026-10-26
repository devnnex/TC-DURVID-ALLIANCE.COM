// Double-click entry: use HTTP so sessions, modules and offline storage work.
if (window.location.protocol === 'file:' && !window.ALLIANCE_CONFIG.API_URL.includes('/ords/')) {
  const taskApi = new URL(window.ALLIANCE_CONFIG.API_URL);
  window.location.replace(new URL('/site/index.html', taskApi.origin).href);
}
