// Tipos de imagen que aceptamos y cómo reconocerlos por sus primeros bytes ("magic bytes").
// No alcanza con el header content-type: lo manda el cliente y puede mentir.
// Así nadie sube un HTML o un ejecutable diciendo que es una foto.
export const IMAGE_TYPES = {
  'image/webp': { ext: 'webp', matches: (b: Buffer) => ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 12) === 'WEBP' },
  'image/jpeg': { ext: 'jpg', matches: (b: Buffer) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  'image/png': {
    ext: 'png',
    matches: (b: Buffer) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  },
} as const;

export type ImageType = keyof typeof IMAGE_TYPES;

function ascii(b: Buffer, start: number, end: number): string {
  return b.subarray(start, end).toString('ascii');
}

// Devuelve el tipo si el contenido coincide con lo que dice el header; si no, null.
export function detectImage(body: Buffer, declaredType: string): ImageType | null {
  const type = declaredType.split(';')[0]!.trim().toLowerCase();
  if (!(type in IMAGE_TYPES)) return null;
  return IMAGE_TYPES[type as ImageType].matches(body) ? (type as ImageType) : null;
}
