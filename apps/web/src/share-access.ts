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
