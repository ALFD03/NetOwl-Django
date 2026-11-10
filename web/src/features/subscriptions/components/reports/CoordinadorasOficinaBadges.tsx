/**
 * Las coordinadoras de oficina de un site en el Sales Report, como insignias
 * bajo el título del site: `nombre | Medio · Total | Objetivo · %`.
 *
 * - **Medio**: lo que vendió ella misma (la nombra `Medio`).
 * - **Total**: las de su oficina (la nombra `Vendedor`), la vendiera quien la vendiera.
 * - **Objetivo · %**: su objetivo de ventas del mes y el cumplimiento, que se
 *   mide contra las de Medio. El objetivo se edita en Catálogos › Ventas › Objetivos.
 *
 * Los conteos llegan por día de instalación y se suman hasta el corte elegido
 * en la barra de días, así que cambiar de día no pide nada al servidor.
 */

import { UserRound } from 'lucide-react';

import { cn } from '@/shared/lib/cn';
import { formatInteger, formatTwoDecimals } from '@/shared/utils/formatters';
import { useObjetivosConfig } from '../../hooks/useObjetivos';
import { TEXTO_TONO, tonoCumplimiento } from '../../lib/objetivos';

/** Una coordinadora tal y como la sirve `get_coordinadoras_oficina`. */
export interface CoordinadoraOficina {
  id: number;
  nombre: string;
  /** El site del reporte del que cuelga. */
  site: string;
  /** Instalaciones de cada día del mes (31 posiciones) en que es el `Medio`. */
  propias_dia: number[];
  /** Ídem, en que es el `Vendedor`. */
  oficina_dia: number[];
  /** Ventas esperadas en el mes; nulo si no hay objetivo ni general. */
  objetivo: number | null;
  origen_objetivo: 'individual' | 'general' | null;
}

/** La suma de los días 1..`dia` (o del mes entero sin corte). */
const hasta = (dias: number[], dia: number | null): number =>
  dias.slice(0, dia ?? dias.length).reduce((total, n) => total + Number(n || 0), 0);

const Separador = () => <span className="h-4 w-px bg-slate-700" aria-hidden />;

export function CoordinadorasOficinaBadges({
  coordinadoras,
  dia = null,
  className,
}: {
  coordinadoras: CoordinadoraOficina[];
  /** El día del corte; nulo es el mes entero. */
  dia?: number | null;
  className?: string;
}) {
  const { semaforo } = useObjetivosConfig();
  if (coordinadoras.length === 0) return null;

  return (
    <div className={cn('flex flex-wrap gap-2', className)} aria-label="Coordinadoras de oficina del site">
      {coordinadoras.map((c) => {
        const propias = hasta(c.propias_dia, dia);
        const oficina = hasta(c.oficina_dia, dia);
        const pct = c.objetivo ? (propias / c.objetivo) * 100 : null;
        return (
          <div
            key={c.id}
            className="flex flex-wrap items-center gap-x-2.5 gap-y-1 rounded-xl border border-sky-500/30 bg-sky-500/10 px-3 py-1.5 text-xs"
            title={dia ? `Ventas hasta el día ${dia}` : 'Ventas del mes'}
          >
            <span className="flex items-center gap-1.5 font-bold text-white">
              <UserRound className="h-3.5 w-3.5 text-sky-400" />
              {c.nombre}
            </span>
            <Separador />
            <span className="flex items-baseline gap-1.5">
              <span className="text-[9px] font-black uppercase tracking-wider text-slate-400">Medio</span>
              <span className="font-mono font-black tabular-nums text-white">{formatInteger(propias)}</span>
              <span className="text-slate-600">·</span>
              <span className="text-[9px] font-black uppercase tracking-wider text-slate-400">Total</span>
              <span className="font-mono font-bold tabular-nums text-slate-200">{formatInteger(oficina)}</span>
            </span>
            <Separador />
            <span className="flex items-baseline gap-1.5">
              <span className="text-[9px] font-black uppercase tracking-wider text-slate-400">Objetivo</span>
              {c.objetivo === null ? (
                <span className="text-slate-500" title="Sin objetivo: fíjalo en Catálogos › Ventas › Objetivos">—</span>
              ) : (
                <>
                  <span
                    className="font-mono font-bold tabular-nums text-sky-300"
                    title={c.origen_objetivo === 'individual' ? 'Objetivo propio' : 'Objetivo general'}
                  >
                    {formatInteger(c.objetivo)}
                  </span>
                  <span className="text-slate-600">·</span>
                  <span className={cn('font-mono font-black tabular-nums', pct !== null && TEXTO_TONO[tonoCumplimiento(pct, semaforo)])}>
                    {pct === null ? '—' : `${formatTwoDecimals(pct)}%`}
                  </span>
                </>
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
}
