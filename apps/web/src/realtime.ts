import { SOCKET_PATH, type SocketAck } from '@comanda/shared';
import { useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';

export type LiveStatus = 'connecting' | 'live' | 'offline';

// Misma lógica que api.ts: en producción la API está en VITE_API_URL; en desarrollo,
// Vite pasa /api/socket.io a la API (ver vite.config.ts, ws: true).
function createSocket(): Socket {
  const apiUrl = import.meta.env.VITE_API_URL;
  return apiUrl
    ? io(apiUrl, { path: SOCKET_PATH, withCredentials: true })
    : io({ path: `/api${SOCKET_PATH}`, withCredentials: true });
}

interface Options {
  // Se llama en cada conexión (también al reconectar): pide escuchar lo que corresponde.
  subscribe: (socket: Socket) => Promise<SocketAck>;
  // Qué hacer con cada evento del servidor.
  handlers: Record<string, (payload: unknown) => void>;
  // Después de (re)conectar volvemos a pedir los datos: mientras estuvimos desconectados
  // pudo pasar algo y ese aviso se perdió.
  onSync: () => void;
}

// Conexión de tiempo real mientras el componente está en pantalla.
// `key` identifica qué se escucha: si cambia, se cierra la conexión y se abre otra.
export function useRealtime(key: string, options: Options): LiveStatus {
  const [status, setStatus] = useState<LiveStatus>('connecting');
  // Guardamos las opciones en una ref: así el efecto no se rehace en cada render
  // (los handlers son funciones nuevas cada vez) pero siempre usa las últimas.
  const latest = useRef(options);
  latest.current = options;

  useEffect(() => {
    const socket = createSocket();

    socket.on('connect', async () => {
      try {
        const ack = await latest.current.subscribe(socket);
        setStatus(ack.ok ? 'live' : 'offline');
        if (ack.ok) latest.current.onSync();
      } catch {
        setStatus('offline');
      }
    });
    // Socket.IO reintenta solo; mientras tanto mostramos que no estamos en vivo.
    socket.on('disconnect', () => setStatus('offline'));
    socket.on('connect_error', () => setStatus('offline'));
    socket.onAny((event: string, payload: unknown) => latest.current.handlers[event]?.(payload));

    return () => {
      socket.disconnect();
    };
  }, [key]);

  return status;
}

// Indicador "En vivo" / "Reconectando…" para mostrar en pantalla.
export function liveLabel(status: LiveStatus): string {
  return status === 'live' ? 'En vivo' : status === 'connecting' ? 'Conectando…' : 'Reconectando…';
}
