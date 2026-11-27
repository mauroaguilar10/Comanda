import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { AwsClient } from 'aws4fetch';

// Dónde se guardan los archivos subidos (por ahora, fotos de productos).
// La app solo conoce esta interfaz; en desarrollo se usa el disco y en producción R2.
export interface FileStorage {
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  delete(key: string): Promise<void>;
  // URL pública para mostrar el archivo en un <img>.
  url(key: string): string;
}

// Claves que generamos nosotros: "products/<uuid>/<uuid>-<random>.webp".
// Las validamos antes de tocar el disco para que nadie pueda pedir "../../.env".
const KEY_PATTERN = /^products\/[0-9a-f-]{36}\/[0-9a-f-]{36}-[A-Za-z0-9_-]+\.(webp|jpg|png)$/;
export const isValidKey = (key: string) => KEY_PATTERN.test(key);

// Disco local, para desarrollo. La API sirve los archivos en /uploads (ver app.ts).
// En producción no sirve: el contenedor de Docker pierde el disco al redesplegar.
export function createLocalStorage(dir: string, publicBaseUrl: string): FileStorage & { read(key: string): Promise<Buffer | null> } {
  const root = resolve(dir);
  const pathFor = (key: string) => {
    if (!isValidKey(key)) throw new Error(`Clave de archivo inválida: ${key}`);
    const path = resolve(join(root, key));
    // Doble chequeo: el archivo final tiene que quedar dentro de la carpeta.
    if (!path.startsWith(root + sep)) throw new Error(`Clave fuera de la carpeta: ${key}`);
    return path;
  };

  return {
    async put(key, body) {
      const path = pathFor(key);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, body);
    },
    async delete(key) {
      await rm(pathFor(key), { force: true });
    },
    url(key) {
      return `${publicBaseUrl}/uploads/${key}`;
    },
    async read(key) {
      if (!isValidKey(key)) return null;
      try {
        return await readFile(pathFor(key));
      } catch {
        return null;
      }
    },
  };
}

export interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  // Dominio público del bucket, por ejemplo https://fotos.mauroaglr.com
  publicUrl: string;
}

// Cloudflare R2, para producción. R2 habla el mismo protocolo que Amazon S3:
// aws4fetch firma cada pedido con las credenciales (firma "AWS v4") y lo manda con fetch.
export function createR2Storage(config: R2Config): FileStorage {
  const client = new AwsClient({
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    service: 's3',
    region: 'auto',
  });
  const endpoint = `https://${config.accountId}.r2.cloudflarestorage.com/${config.bucket}`;

  async function send(method: 'PUT' | 'DELETE', key: string, init: RequestInit = {}) {
    if (!isValidKey(key)) throw new Error(`Clave de archivo inválida: ${key}`);
    const res = await client.fetch(`${endpoint}/${key}`, { method, ...init });
    // DELETE de algo que no existe devuelve 204 igual: no es un error.
    if (!res.ok) throw new Error(`R2 ${method} ${key} respondió ${res.status}: ${await res.text()}`);
  }

  return {
    async put(key, body, contentType) {
      await send('PUT', key, {
        body: new Uint8Array(body),
        headers: {
          'content-type': contentType,
          // La clave cambia con cada foto nueva, así que el navegador puede guardarla un año.
          'cache-control': 'public, max-age=31536000, immutable',
        },
      });
    },
    async delete(key) {
      await send('DELETE', key);
    },
    url(key) {
      return `${config.publicUrl}/${key}`;
    },
  };
}
