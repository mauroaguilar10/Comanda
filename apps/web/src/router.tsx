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
