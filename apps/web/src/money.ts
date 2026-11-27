// Los montos viajan y se guardan en centavos (enteros). Acá se convierten
// a pesos para mostrarlos y de lo que escribe la persona a centavos.

// Dos formatos: con centavos y sin. En los menús de acá se escribe "$ 9.000", no "$ 9.000,00".
const withCents = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' });
const withoutCents = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

// 450050 -> "$ 4.500,50" · 900000 -> "$ 9.000"
export function formatPrice(cents: number): string {
  return (cents % 100 === 0 ? withoutCents : withCents).format(cents / 100);
}

// Para cargar un precio en el campo de edición: 450050 -> "4500,50", 450000 -> "4500".
export function centsToInput(cents: number): string {
  const pesos = Math.trunc(cents / 100);
  const rest = cents % 100;
  return rest === 0 ? String(pesos) : `${pesos},${String(rest).padStart(2, '0')}`;
}

// Lo que escribe la persona -> centavos, o null si no se entiende.
// Acepta la forma argentina ("4.500,50", "$ 4500") y también "4500.50".
export function parsePrice(text: string): number | null {
  let s = text.replace(/\$/g, '').replace(/\s/g, '');
  if (s === '') return null;

  if (s.includes(',')) {
    // Con coma: la coma es el decimal y los puntos separan miles.
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
    // "4.500" o "1.250.000": los puntos separan miles.
    s = s.replace(/\./g, '');
  }
  // Si no, un único punto es el decimal ("4500.50").

  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  // Math.round: 4500.1 * 100 da 450009.99999... en coma flotante.
  return Math.round(Number(s) * 100);
}
