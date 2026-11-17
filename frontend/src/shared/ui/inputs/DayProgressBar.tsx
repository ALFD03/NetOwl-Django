import { useMemo } from 'react';
import { NeonContainer } from '../surfaces/NeonContainer';

const MONTH_NAMES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'] as const;

/** Ancho del manejador nativo, en px. El navegador lo mantiene dentro de la
 *  pista, asi que las marcas y la etiqueta usan la misma correccion para no
 *  desalinearse en los extremos. */
const THUMB_PX = 16;

interface Props {
  /** Dias con datos calculados (1..31). */
  availableDays: number[];
  /** Total de dias del mes. */
  daysInMonth: number;
  selectedDay: number;
  onSelect: (day: number) => void;
  /** Mes del corte en formato YYYY-MM. Habilita la fecha legible. */
  periodoMes?: string;
  label?: string;
  className?: string;
}

const parseMes = (periodoMes?: string): { year: number; month: number } | null => {
  const match = periodoMes?.match(/^(\d{4})-(\d{2})/);
  return match ? { year: Number(match[1]), month: Number(match[2]) } : null;
};

/**
 * Linea de tiempo del mes: se arrastra el manejador para elegir la fecha de corte.
 *
 * Es compacta a proposito, una sola franja de unos 50px: vive en la barra fija
 * de arriba junto a los filtros, y cada pixel suyo se lo quita a los datos.
 *
 * El tramo con datos calculados se pinta solido y el resto queda atenuado. El
 * manejador se ajusta siempre al dia calculado mas cercano, de modo que no se
 * puede soltar sobre un hueco sin metricas.
 */
export function DayProgressBar({
  availableDays,
  daysInMonth,
  selectedDay,
  onSelect,
  periodoMes,
  label = 'Fecha de corte',
}: Props) {
  const available = useMemo(() => new Set(availableDays), [availableDays]);
  const mes = useMemo(() => parseMes(periodoMes), [periodoMes]);

  const ticks = useMemo(() => {
    const marks = new Set<number>([1, daysInMonth]);
    for (let day = 5; day < daysInMonth; day += 5) marks.add(day);
    // El ultimo dia queda pegado al multiplo de 5 anterior y se solaparian.
    if (daysInMonth - 1 > 0 && marks.has(daysInMonth - 1)) marks.delete(daysInMonth - 1);
    return [...marks].sort((a, b) => a - b);
  }, [daysInMonth]);

  if (daysInMonth <= 0) return null;

  /** Posicion horizontal del dia, corregida por el ancho del manejador. */
  const posOf = (day: number): string => {
    const ratio = daysInMonth > 1 ? (day - 1) / (daysInMonth - 1) : 0;
    return `calc(${ratio * 100}% + ${(0.5 - ratio) * THUMB_PX}px)`;
  };

  /** El slider recorre todos los dias; al soltar se ajusta al calculado mas cercano. */
  const snap = (raw: number) => {
    if (!availableDays.length) return;
    const nearest = availableDays.reduce((best, day) =>
      Math.abs(day - raw) < Math.abs(best - raw) ? day : best,
    );
    if (nearest !== selectedDay) onSelect(nearest);
  };

  const ultimoCalculado = availableDays[availableDays.length - 1] ?? 1;
  const tieneDatos = available.has(selectedDay);
  const fechaLegible = !tieneDatos
    ? 'Sin datos'
    : mes
      ? `${selectedDay} ${MONTH_NAMES[mes.month - 1]} ${mes.year}`
      : `Dia ${selectedDay}`;

  return (
    <NeonContainer theme="blue" noPadding className="px-4 py-2.5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-5">
        {/* La fecha va a un lado y no flotando sobre el manejador: era una fila
            entera de alto solo para la etiqueta. */}
        <div className="flex shrink-0 items-baseline justify-between gap-3 sm:block">
          <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">{label}</p>
          <p className="whitespace-nowrap text-sm font-bold tabular-nums text-white">
            {fechaLegible}
            <span className="ml-2 text-[11px] font-semibold text-slate-500">
              {availableDays.length}/{daysInMonth} días
            </span>
          </p>
        </div>

        <div className="min-w-0 flex-1">
          <div className="relative flex h-4 items-center">
            {/* Pista completa del mes (dias sin metricas). */}
            <div className="absolute h-1.5 w-full rounded-full bg-surface-primary" />
            {/* Tramo ya calculado. */}
            <div
              className="absolute h-1.5 rounded-full bg-brand/25"
              style={{ width: posOf(ultimoCalculado) }}
            />
            {/* Tramo hasta el corte seleccionado. */}
            <div
              className="absolute h-1.5 rounded-full bg-brand transition-[width]"
              style={{ width: tieneDatos ? posOf(selectedDay) : 0 }}
            />
            {ticks.map((day) => (
              <span
                key={day}
                aria-hidden
                className="absolute h-2.5 w-px -translate-x-1/2 bg-purple-600"
                style={{ left: posOf(day) }}
              />
            ))}

            <input
              type="range"
              min={1}
              max={daysInMonth}
              step={1}
              value={selectedDay || 1}
              onChange={(e) => snap(Number(e.target.value))}
              disabled={!availableDays.length}
              aria-label={label}
              aria-valuetext={fechaLegible}
              className="day-slider absolute h-4 w-full disabled:cursor-not-allowed disabled:opacity-40"
            />
          </div>

          <div className="relative mt-0.5 h-2.5">
            {ticks.map((day) => (
              <span
                key={day}
                className="absolute -translate-x-1/2 text-[10px] font-semibold leading-none tabular-nums text-blue-500"
                style={{ left: posOf(day) }}
              >
                {day}
              </span>
            ))}
          </div>
        </div>
      </div>
    </NeonContainer>
  );
}
