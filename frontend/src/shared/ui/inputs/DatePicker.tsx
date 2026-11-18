/** Selector de un día concreto, con calendario propio. */

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';

import { cn } from '@/shared/lib/cn';
import { useAnchoredPanel } from './useAnchoredPanel';

interface DatePickerProps {
  label: string;
  /** `YYYY-MM-DD`, o cadena vacía si no hay fecha. */
  value: string;
  onChange: (value: string) => void;
  /** Primer día elegible, `YYYY-MM-DD`. Los anteriores se ven pero no se pulsan. */
  min?: string;
  /** Último día elegible, `YYYY-MM-DD`. */
  max?: string;
  placeholder?: string;
  disabled?: boolean;
  /** Ofrece «Borrar» en el pie. Solo tiene sentido si la fecha es opcional. */
  clearable?: boolean;
  /** Texto de ayuda bajo el campo. */
  hint?: string;
  containerClassName?: string;
}

const MONTHS = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];
const WEEKDAYS = ['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá', 'Do'];

const dos = (n: number) => String(n).padStart(2, '0');
const iso = (year: number, month: number, day: number) => `${year}-${dos(month + 1)}-${dos(day)}`;

/** Hoy en `YYYY-MM-DD`, en hora local: `toISOString` daría el día UTC. */
function todayIso(): string {
  const d = new Date();
  return iso(d.getFullYear(), d.getMonth(), d.getDate());
}

/** `YYYY-MM-DD` → `DD/MM/YYYY`, sin pasar por `Date` para no moverla de día. */
function labelFor(value: string): string {
  const [a, m, d] = value.split('-');
  return `${d}/${m}/${a}`;
}

/**
 * Selector de fecha.
 *
 * **No se escribe: solo se elige en el calendario.** Un `<input type="date">`
 * deja teclear, pinta el control del navegador —distinto en cada uno y ajeno
 * al tema— y su desplegable es nativo, con los mismos problemas de posición
 * dentro de los `motion.div` que describe `useAnchoredPanel`.
 *
 * Las fechas viajan como `YYYY-MM-DD` y se comparan como cadenas, que en ese
 * formato ordenan igual que las fechas; nunca pasan por `Date` salvo para
 * saber qué día de la semana cae el 1 del mes.
 *
 * Pulsar el mes y el año de la cabecera cambia a una vista de meses, para
 * llegar a una fecha lejana —un ingreso de hace años— sin ir de mes en mes.
 */
export function DatePicker({
  label,
  value,
  onChange,
  min,
  max,
  placeholder = 'Seleccionar fecha...',
  disabled = false,
  clearable = false,
  hint,
  containerClassName,
}: DatePickerProps) {
  const { isOpen, coords, triggerRef, panelRef, toggle, close } = useAnchoredPanel<HTMLButtonElement>({
    width: 288,
    estimatedHeight: 360,
  });

  // El mes que se enseña al abrir: el de la fecha elegida, o el de hoy. Se
  // fija al abrir y no con un efecto, para que navegar no lo pise.
  const [view, setView] = useState<{ year: number; month: number; mode: 'dias' | 'meses' }>(() =>
    monthOf(value || todayIso()),
  );

  const open = () => {
    if (disabled) return;
    if (!isOpen) setView(monthOf(value || todayIso()));
    toggle();
  };

  const outOfRange = (date: string) => Boolean((min && date < min) || (max && date > max));

  const choose = (date: string) => {
    if (outOfRange(date)) return;
    onChange(date);
    close();
  };

  const shiftMonth = (delta: number) =>
    setView((v) => {
      const total = v.year * 12 + v.month + delta;
      return { ...v, year: Math.floor(total / 12), month: total % 12 };
    });

  const today = todayIso();
  // Lunes primero: `getDay` da 0 al domingo.
  const gap = (new Date(view.year, view.month, 1).getDay() + 6) % 7;
  const daysOfMonth = new Date(view.year, view.month + 1, 0).getDate();

  const navButton = 'rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-800 hover:text-white';

  return (
    <div className={containerClassName}>
      <label className="mb-1.5 block text-xs font-semibold text-slate-300">{label}</label>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={open}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-label={label}
        className={cn(
          'flex w-full items-center gap-2 rounded-lg border bg-surface-tertiary py-2 pl-3 pr-4 text-left text-xs transition-colors',
          isOpen ? 'border-brand ring-1 ring-brand' : 'border-slate-700 hover:border-slate-600',
          disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer',
        )}
      >
        <CalendarDays className="h-4 w-4 flex-shrink-0 text-slate-400" />
        <span className={value ? 'text-white' : 'text-slate-500'}>{value ? labelFor(value) : placeholder}</span>
      </button>
      {hint && <p className="mt-1 text-[10px] leading-tight text-slate-500">{hint}</p>}

      {isOpen &&
        coords &&
        createPortal(
          <div
            ref={panelRef}
            role="dialog"
            aria-label={label}
            style={{ top: coords.top, left: coords.left, width: coords.width }}
            className="fixed z-[100] rounded-2xl border border-slate-700/80 bg-surface-secondary p-4 shadow-2xl backdrop-blur-xl"
          >
            <div className="mb-3 flex items-center justify-between border-b border-slate-800 pb-3">
              <button
                type="button"
                onClick={() => (view.mode === 'dias' ? shiftMonth(-1) : shiftMonth(-12))}
                className={navButton}
                aria-label={view.mode === 'dias' ? 'Mes anterior' : 'Año anterior'}
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setView((v) => ({ ...v, mode: v.mode === 'dias' ? 'meses' : 'dias' }))}
                className="rounded-lg px-2 py-1 text-sm font-black tracking-wide text-white hover:bg-slate-800"
                title={view.mode === 'dias' ? 'Elegir mes y año' : 'Volver a los días'}
              >
                {view.mode === 'dias' ? `${MONTHS[view.month]} ${view.year}` : view.year}
              </button>
              <button
                type="button"
                onClick={() => (view.mode === 'dias' ? shiftMonth(1) : shiftMonth(12))}
                className={navButton}
                aria-label={view.mode === 'dias' ? 'Mes siguiente' : 'Año siguiente'}
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            {view.mode === 'meses' ? (
              <div className="grid grid-cols-3 gap-2">
                {MONTHS.map((name, month) => (
                  <button
                    key={name}
                    type="button"
                    onClick={() => setView((v) => ({ ...v, month, mode: 'dias' }))}
                    className={cn(
                      'rounded-xl py-2.5 text-xs font-bold transition-all',
                      month === view.month
                        ? 'bg-brand text-white shadow-lg shadow-brand/30'
                        : 'text-slate-300 hover:bg-slate-800/80 hover:text-white',
                    )}
                  >
                    {name.slice(0, 3)}
                  </button>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-7 gap-1 text-center">
                {WEEKDAYS.map((d) => (
                  <span key={d} className="pb-1 text-[10px] font-bold uppercase text-slate-500">
                    {d}
                  </span>
                ))}
                {Array.from({ length: gap }, (_, i) => (
                  <span key={`hueco-${i}`} />
                ))}
                {Array.from({ length: daysOfMonth }, (_, i) => {
                  const date = iso(view.year, view.month, i + 1);
                  const chosen = date === value;
                  const locked = outOfRange(date);
                  return (
                    <button
                      key={date}
                      type="button"
                      disabled={locked}
                      onClick={() => choose(date)}
                      className={cn(
                        'h-8 rounded-lg text-xs font-semibold transition-all',
                        chosen && 'bg-brand font-black text-white shadow-lg shadow-brand/30',
                        !chosen && !locked && 'text-slate-300 hover:bg-slate-800/80 hover:text-white',
                        !chosen && date === today && 'ring-1 ring-brand/60',
                        locked && 'cursor-not-allowed text-slate-700',
                      )}
                    >
                      {i + 1}
                    </button>
                  );
                })}
              </div>
            )}

            <div className="mt-3 flex items-center justify-between border-t border-slate-800 pt-3 text-[10px] font-bold">
              {clearable ? (
                <button
                  type="button"
                  onClick={() => {
                    onChange('');
                    close();
                  }}
                  className="text-slate-500 transition-colors hover:text-rose-400"
                >
                  Borrar
                </button>
              ) : (
                <span />
              )}
              <button
                type="button"
                onClick={() => choose(today)}
                disabled={outOfRange(today)}
                className="text-brand transition-colors hover:text-brand-hover disabled:cursor-not-allowed disabled:text-slate-700"
              >
                Hoy
              </button>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}

function monthOf(date: string): { year: number; month: number; mode: 'dias' } {
  return { year: Number(date.slice(0, 4)), month: Number(date.slice(5, 7)) - 1, mode: 'dias' };
}
