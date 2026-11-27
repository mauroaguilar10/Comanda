// Aviso sonoro de pedido nuevo, generado con la Web Audio API (sin archivos de sonido).
//
// Los navegadores no dejan reproducir sonido hasta que la persona toca algo en la página
// ("autoplay policy"). Por eso el panel tiene un botón "Activar sonido": ese clic crea y
// habilita el AudioContext, y desde ahí podemos sonar cuando entra un pedido.

let context: AudioContext | null = null;

export async function enableSound(): Promise<boolean> {
  try {
    context ??= new AudioContext();
    await context.resume();
    return context.state === 'running';
  } catch {
    return false;
  }
}

export function soundEnabled(): boolean {
  return context?.state === 'running';
}

// Dos tonos cortos ("din-don"), fuerte como para escucharse con la cocina andando.
export function playNewOrder() {
  if (!context || context.state !== 'running') return;
  const now = context.currentTime;
  [880, 660].forEach((frequency, i) => {
    const osc = context!.createOscillator();
    const gain = context!.createGain();
    osc.type = 'sine';
    osc.frequency.value = frequency;
    const start = now + i * 0.25;
    // Sube y baja el volumen suave para que no "chasquee".
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.4, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.22);
    osc.connect(gain).connect(context!.destination);
    osc.start(start);
    osc.stop(start + 0.25);
  });
}
