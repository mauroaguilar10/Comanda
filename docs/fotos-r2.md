# Fotos de productos en Cloudflare R2

En desarrollo las fotos se guardan en `apps/api/uploads` y las sirve la propia API. En producción eso no sirve: el contenedor de Docker pierde ese disco cada vez que se redespliega. Por eso en producción van a **Cloudflare R2**, un almacenamiento de archivos compatible con S3 y sin costo por descarga.

La API elige sola: si están las cinco variables `R2_*`, usa R2; si no hay ninguna, usa el disco. Si hay algunas sí y otras no, no arranca y avisa qué falta.

## Cómo configurarlo (una sola vez)

1. **Crear el bucket.** En el panel de Cloudflare: *R2 Object Storage → Create bucket*. Nombre: `comanda-fotos`. Ubicación: automática.
2. **Darle un dominio público.** En el bucket: *Settings → Public access → Custom domains → Connect domain* y poné `fotos.mauroaglr.com` (el dominio tiene que estar en tu cuenta de Cloudflare). Así cualquiera puede **ver** las fotos, pero solo la API puede subirlas o borrarlas.
3. **Crear las credenciales de la API.** En *R2 Object Storage → Manage API tokens → Create API token*:
   - Permisos: **Object Read & Write**.
   - Alcance: **solo el bucket `comanda-fotos`** (si se filtran, no tocan nada más).
   - Al crearlo te muestra el *Access Key ID* y el *Secret Access Key* **una sola vez**: guardalos en el gestor de contraseñas.
4. **Cargar las variables en el servidor de la API** (nunca en el repo):

   ```env
   R2_ACCOUNT_ID=<el Account ID que aparece en la portada de R2>
   R2_ACCESS_KEY_ID=<Access Key ID>
   R2_SECRET_ACCESS_KEY=<Secret Access Key>
   R2_BUCKET=comanda-fotos
   R2_PUBLIC_URL=https://fotos.mauroaglr.com
   ```

5. **Probar:** reiniciá la API, subí una foto desde la pantalla del menú y fijate que la URL de la imagen empiece con `https://fotos.mauroaglr.com/`.

## Cómo funciona

- La web achica la foto antes de subirla (lado más largo de 1200 px, WebP, o JPG en Safari): una foto de celular de 3 a 5 MB queda en 100 a 300 KB.
- La API recibe la imagen (máximo 2 MB), revisa por los primeros bytes que de verdad sea JPG, PNG o WebP, y la sube a R2 con una clave nueva: `products/<local>/<producto>-<azar>.webp`.
- En la base se guarda la **clave**, no la URL. Si cambia el dominio de las fotos, se cambia `R2_PUBLIC_URL` y listo.
- Al cambiar o quitar la foto, o borrar el producto, se borra el archivo viejo.
