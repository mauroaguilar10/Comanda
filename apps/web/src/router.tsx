import { useEffect, useSyncExternalStore, type AnchorHTMLAttributes, type MouseEvent } from 'react';

// Router mínimo con la History API del navegador. Para cuatro pantallas no hace
// falta una librería, y así se ve qué hace un router por dentro:
// cambia la URL sin recargar la página y avisa a React que se volvió a pintar.

function subscribe(onChange: () => void) {
  // popstate lo dispara el navegador con atrás/adelante; nosotros lo disparamos en navigate.
  window.addEventListener('popstate', onChange);
  return () => window.removeEventListener('popstate', onChange);
}

// El componente que lo use se vuelve a renderizar cada vez que cambia la URL.
export function usePath(): string {
  return useSyncExternalStore(subscribe, () => window.location.pathname);
}

export function navigate(to: string, opts: { replace?: boolean } = {}) {
  if (opts.replace) window.history.replaceState(null, '', to);
  else window.history.pushState(null, '', to);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

// Un <a> de verdad (se puede abrir en otra pestaña, el lector de pantalla lo anuncia
// como enlace), pero el clic normal navega sin recargar.
export function Link({ to, ...props }: { to: string } & AnchorHTMLAttributes<HTMLAnchorElement>) {
  function onClick(e: MouseEvent<HTMLAnchorElement>) {
    // Ctrl/Cmd/Shift + clic o clic del medio: que el navegador haga lo suyo.
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    navigate(to);
  }
  return <a href={to} onClick={onClick} {...props} />;
}

// Cambia la URL apenas se monta. Se usa, por ejemplo, para mandar a /login a quien no inició sesión.
export function Redirect({ to }: { to: string }) {
  useEffect(() => navigate(to, { replace: true }), [to]);
  return null;
}

// Lee un parámetro de la URL (?clave=valor). Se lee en cada render: navigate() ya hace
// que se vuelva a renderizar cuando cambia la URL.
export function getSearchParam(name: string): string | null {
  return new URLSearchParams(window.location.search).get(name);
}

// A dónde volver después de entrar o registrarse (?volver=/invitacion/...).
// Solo rutas internas: "/algo" sí, "//sitio-falso.com" o "https://..." no. Si no,
// alguien podría armar un link de login que después mande a la persona a otro sitio
// (un "open redirect", que se usa mucho para phishing).
export function getReturnTo(): string | null {
  const to = getSearchParam('volver');
  // "/\" también: algunos navegadores lo tratan como "//".
  return to && to.startsWith('/') && !to.startsWith('//') && !to.startsWith('/\\') ? to : null;
}

// Arma "/login?volver=..." para mandar a alguien a entrar y que después vuelva acá.
export function withReturnTo(path: string, returnTo: string, extra: Record<string, string> = {}): string {
  const params = new URLSearchParams({ ...extra, volver: returnTo });
  return `${path}?${params.toString()}`;
}
