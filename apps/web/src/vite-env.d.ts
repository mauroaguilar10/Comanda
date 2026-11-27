/// <reference types="vite/client" />

// Variables de entorno que usa la web. Vite solo expone al navegador las que
// empiezan con VITE_, y quedan escritas en el JS final: nunca pongas secretos acá.
interface ImportMetaEnv {
  // Dirección de la API en producción, por ejemplo https://api.mauroaglr.com.
  // En desarrollo no se define y se usa /api (el proxy de Vite).
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
