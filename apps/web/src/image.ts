import { MAX_IMAGE_BYTES } from '@comanda/shared';

// Lado más largo de la foto que subimos. En el menú se ve chica; 1200 px alcanza
// para verla nítida en pantallas de alta densidad y pesa entre 100 y 300 KB.
const MAX_SIDE = 1200;

// Achica la foto en el navegador antes de subirla. Una foto de celular pesa 3 a 5 MB:
// subirla así gasta datos del dueño y después hace lenta la tienda para cada cliente.
// Hacerlo acá nos ahorra instalar en el servidor librerías nativas de imágenes.
export async function resizeImage(file: Blob): Promise<Blob> {
  let bitmap: ImageBitmap;
  try {
    // createImageBitmap respeta la orientación EXIF: una foto sacada con el celular
    // de costado no queda girada.
    bitmap = await createImageBitmap(file);
  } catch {
    // Por ejemplo, HEIC del iPhone en una compu (en el iPhone, Safari ya lo pasa a JPG).
    throw new Error('No pudimos leer esa foto. Probá con una JPG o PNG.');
  }

  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  const encode = (type: string, quality: number) =>
    new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
  // WebP pesa bastante menos que JPG. Safari no sabe generarlo desde un canvas
  // (devuelve PNG): en ese caso usamos JPG.
  let blob = await encode('image/webp', 0.82);
  if (!blob || blob.type !== 'image/webp') blob = await encode('image/jpeg', 0.85);
  if (!blob) throw new Error('No pudimos procesar esa foto.');
  if (blob.size > MAX_IMAGE_BYTES) throw new Error('La foto sigue siendo muy pesada. Probá con otra.');
  return blob;
}
