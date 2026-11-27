import { meResponseSchema, type LoginInput, type MeResponse, type RegisterInput } from '@comanda/shared';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ApiError, request } from './api';

// Quién está usando la app. La web nunca ve la cookie (es httpOnly):
// para saber si hay sesión le pregunta a la API con GET /auth/me.
type AuthState =
  | { status: 'loading' }
  | { status: 'anonymous' }
  | { status: 'authenticated'; me: MeResponse }
  // Algo inesperado (por ejemplo, la API respondió con otra forma de datos).
  // Sin este estado la pantalla quedaba en "Cargando…" para siempre.
  | { status: 'error' };

interface AuthContextValue {
  state: AuthState;
  login(input: LoginInput): Promise<void>;
  register(input: RegisterInput): Promise<void>;
  logout(): Promise<void>;
  // Vuelve a pedir /auth/me (por ejemplo, después de crear un local).
  refresh(): Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// Envuelve la app y comparte el estado de la sesión con todas las pantallas,
// sin pasarlo de componente en componente.
export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading' });

  const refresh = useCallback(async () => {
    try {
      setState({ status: 'authenticated', me: await request('/auth/me', meResponseSchema) });
    } catch (err) {
      // 401 es lo normal si no hay sesión. Otro error de la API (caída, sin red) también nos deja
      // en "anónimo": el login va a mostrar el error al intentar entrar.
      if (err instanceof ApiError) {
        setState({ status: 'anonymous' });
        return;
      }
      // Cualquier otra cosa es un bug: lo dejamos en la consola para poder investigarlo
      // y mostramos una pantalla de error en vez de quedarnos cargando.
      console.error(err);
      setState({ status: 'error' });
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value = useMemo<AuthContextValue>(
    () => ({
      state,
      refresh,
      async login(input) {
        const me = await request('/auth/login', meResponseSchema, { method: 'POST', body: input });
        setState({ status: 'authenticated', me });
      },
      async register(input) {
        const me = await request('/auth/register', meResponseSchema, { method: 'POST', body: input });
        setState({ status: 'authenticated', me });
      },
      async logout() {
        await request('/auth/logout', null, { method: 'POST' });
        setState({ status: 'anonymous' });
      },
    }),
    [state, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth tiene que usarse adentro de <AuthProvider>');
  return ctx;
}
