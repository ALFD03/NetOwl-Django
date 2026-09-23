/**
 * El semáforo de una métrica dibujado como una barra: rojo, amarillo y verde,
 * con los dos umbrales marcados encima.
 *
 * Lo usan la pestaña de objetivos (para leer el semáforo de un vistazo) y el
 * formulario que lo edita (para ver el efecto mientras se escribe).
 */

import { cn } from '@/shared/lib/cn';
import { formatObjetivo } from '../../lib/objetivos';

export type MetricaSemaforo = 'crecimiento' | 'churn' | 'cumplimiento';

interface Tramo {
  tono: 'red' | 'yellow' | 'green';
  desde: number;
  hasta: number;
  texto: string;
}

const COLOR_TRAMO: Record<Tramo['tono'], { barra: string; chip: string; punto: string }> = {
  red: { barra: 'bg-rose-500/80', chip: 'text-rose-300', punto: 'bg-rose-500' },
  yellow: { barra: 'bg-amber-400/85', chip: 'text-amber-300', punto: 'bg-amber-400' },
  green: { barra: 'bg-emerald-500/85', chip: 'text-emerald-300', punto: 'bg-emerald-500' },
};

const NOMBRE_TONO: Record<Tramo['tono'], string> = { red: 'Rojo', yellow: 'Amarillo', green: 'Verde' };

/** Un número a medio escribir (`NaN`) se dibuja como 0 en vez de romper la barra. */
const finito = (n: number): number => (Number.isFinite(n) ? n : 0);

/**
 * Los tres tramos de la métrica sobre un rango de dibujo con margen a los dos
 * lados, para que ningún color quede reducido a una raya.
 */
function tramos(metrica: MetricaSemaforo, verdeBruto: number, amarilloBruto: number) {
  const verde = finito(verdeBruto);
  const amarillo = finito(amarilloBruto);
  const f = formatObjetivo;

  if (metrica === 'churn') {
    // Menos es mejor: verde desde 0 hasta `verde`, amarillo hasta `amarillo`.
    const hasta = Math.max(amarillo, verde) + Math.max(Math.abs(amarillo - verde), 2);
    return {
      desde: 0,
      hasta,
      marcas: [verde, amarillo],
      tramos: [
        { tono: 'green', desde: 0, hasta: verde, texto: `≤ ${f(verde)}` },
        { tono: 'yellow', desde: verde, hasta: amarillo, texto: `${f(verde)} – ${f(amarillo)}` },
        { tono: 'red', desde: amarillo, hasta, texto: `> ${f(amarillo)}` },
      ] as Tramo[],
    };
  }

  // Más es mejor: rojo por debajo de `amarillo`, amarillo hasta `verde`, verde desde `verde`.
  const hueco = Math.max(Math.abs(verde - amarillo), metrica === 'cumplimiento' ? 20 : 2);
  const desde = metrica === 'cumplimiento' ? 0 : Math.min(amarillo, verde) - hueco;
  const hasta = Math.max(verde, amarillo) + hueco;
  return {
    desde,
    hasta,
    marcas: [amarillo, verde],
    tramos: [
      { tono: 'red', desde, hasta: amarillo, texto: `< ${f(amarillo)}` },
      { tono: 'yellow', desde: amarillo, hasta: verde, texto: `${f(amarillo)} – ${f(verde)}` },
      { tono: 'green', desde: verde, hasta, texto: `≥ ${f(verde)}` },
    ] as Tramo[],
  };
}

export interface EscalaSemaforoProps {
  metrica: MetricaSemaforo;
  verde: number;
  amarillo: number;
  className?: string;
}

export function EscalaSemaforo({ metrica, verde, amarillo, className }: EscalaSemaforoProps) {
  const escala = tramos(metrica, verde, amarillo);
  const rango = escala.hasta - escala.desde || 1;
  const posicion = (valor: number) =>
    Math.min(100, Math.max(0, ((valor - escala.desde) / rango) * 100));

  return (
    <div className={cn('space-y-3', className)}>
      {/* Los umbrales, encima de la barra, en su posición real. */}
      <div className="relative h-4">
        {escala.marcas.map((marca, i) => (
          <span
            key={i}
            className="absolute -translate-x-1/2 text-[10px] font-black text-white"
            style={{ left: `${posicion(finito(marca))}%` }}
          >
            {formatObjetivo(finito(marca))}
          </span>
        ))}
      </div>

      <div className="relative">
        <div className="flex h-3 w-full overflow-hidden rounded-full bg-slate-800">
          {escala.tramos.map((tramo) => (
            <div
              key={tramo.tono}
              className={cn('h-full transition-all', COLOR_TRAMO[tramo.tono].barra)}
              style={{ width: `${Math.max(0, posicion(tramo.hasta) - posicion(tramo.desde))}%` }}
            />
          ))}
        </div>
        {escala.marcas.map((marca, i) => (
          <span
            key={i}
            className="absolute -top-1 h-5 w-0.5 -translate-x-1/2 rounded-full bg-white/80"
            style={{ left: `${posicion(finito(marca))}%` }}
          />
        ))}
      </div>

      <div className="grid grid-cols-3 gap-2">
        {escala.tramos.map((tramo) => (
          <div key={tramo.tono} className="flex items-center gap-1.5 text-[10px]">
            <span className={cn('h-2 w-2 flex-shrink-0 rounded-full', COLOR_TRAMO[tramo.tono].punto)} />
            <span className={cn('font-black uppercase tracking-wider', COLOR_TRAMO[tramo.tono].chip)}>
              {NOMBRE_TONO[tramo.tono]}
            </span>
            <span className="truncate text-slate-400">{tramo.texto}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
