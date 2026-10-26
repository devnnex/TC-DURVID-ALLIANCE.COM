export function accessPortalUrl(details: { currentUrl: string; embedded: boolean; branch?: { slug: string; name: string }; roles?: readonly string[] }) {
  const url = new URL(details.embedded ? '../../index.html' : '../index.html', details.currentUrl);
  if (details.branch) {
    url.searchParams.set('branch', details.branch.slug);
    url.searchParams.set('mode', details.roles?.includes('WAITER') ? 'waiter' : 'panel');
    // New branches use the shared branch page and their own display name.
    if (!['gcobarf', 'cocteleria', 'cafeteria'].includes(details.branch.slug)) url.searchParams.set('name', details.branch.name);
  }
  return url.href;
}

export function accessMessage(details: { name: string; username: string; password?: string; branch: string; url: string }) {
  return [
    '*TC-DURVID · Tu acceso al sistema*',
    '',
    `Hola, ${details.name}. Estos son tus datos de acceso:`,
    '',
    `*Negocio:* ${details.branch}`,
    `*Usuario:* ${details.username}`,
    details.password ? `*Contraseña:* ${details.password}` : '*Contraseña:* usa tu contraseña actual.',
    '',
    '*Ingresa aquí:*',
    details.url,
    '',
    'Conserva estos datos y no compartas tu contraseña.'
  ].join('\n');
}
