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

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];
const DIAS_SEMANA = ['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá', 'Do'];

const dos = (n: number) => String(n).padStart(2, '0');
const iso = (anio: number, mes: number, dia: number) => `${anio}-${dos(mes + 1)}-${dos(dia)}`;

/** Hoy en `YYYY-MM-DD`, en hora local: `toISOString` daría el día UTC. */
function hoyIso(): string {
  const d = new Date();
  return iso(d.getFullYear(), d.getMonth(), d.getDate());
}

/** `YYYY-MM-DD` → `DD/MM/YYYY`, sin pasar por `Date` para no moverla de día. */
function etiqueta(valor: string): string {
  const [a, m, d] = valor.split('-');
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
  const [vista, setVista] = useState<{ anio: number; mes: number; modo: 'dias' | 'meses' }>(() =>
    mesDe(value || hoyIso()),
  );

  const abrir = () => {
    if (disabled) return;
    if (!isOpen) setVista(mesDe(value || hoyIso()));
    toggle();
  };

  const fueraDeRango = (fecha: string) => Boolean((min && fecha < min) || (max && fecha > max));

  const elegir = (fecha: string) => {
    if (fueraDeRango(fecha)) return;
    onChange(fecha);
    close();
  };

  const moverMes = (delta: number) =>
    setVista((v) => {
      const total = v.anio * 12 + v.mes + delta;
      return { ...v, anio: Math.floor(total / 12), mes: total % 12 };
    });

  const hoy = hoyIso();
  // Lunes primero: `getDay` da 0 al domingo.
  const hueco = (new Date(vista.anio, vista.mes, 1).getDay() + 6) % 7;
  const diasDelMes = new Date(vista.anio, vista.mes + 1, 0).getDate();

  const botonNav = 'rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-800 hover:text-white';

  return (
    <div className={containerClassName}>
      <label className="mb-1.5 block text-xs font-semibold text-slate-300">{label}</label>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={abrir}
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
        <span className={value ? 'text-white' : 'text-slate-500'}>{value ? etiqueta(value) : placeholder}</span>
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
                onClick={() => (vista.modo === 'dias' ? moverMes(-1) : moverMes(-12))}
                className={botonNav}
                aria-label={vista.modo === 'dias' ? 'Mes anterior' : 'Año anterior'}
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setVista((v) => ({ ...v, modo: v.modo === 'dias' ? 'meses' : 'dias' }))}
                className="rounded-lg px-2 py-1 text-sm font-black tracking-wide text-white hover:bg-slate-800"
                title={vista.modo === 'dias' ? 'Elegir mes y año' : 'Volver a los días'}
              >
                {vista.modo === 'dias' ? `${MESES[vista.mes]} ${vista.anio}` : vista.anio}
              </button>
              <button
                type="button"
                onClick={() => (vista.modo === 'dias' ? moverMes(1) : moverMes(12))}
                className={botonNav}
                aria-label={vista.modo === 'dias' ? 'Mes siguiente' : 'Año siguiente'}
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            {vista.modo === 'meses' ? (
              <div className="grid grid-cols-3 gap-2">
                {MESES.map((nombre, mes) => (
                  <button
                    key={nombre}
                    type="button"
                    onClick={() => setVista((v) => ({ ...v, mes, modo: 'dias' }))}
                    className={cn(
                      'rounded-xl py-2.5 text-xs font-bold transition-all',
                      mes === vista.mes
                        ? 'bg-brand text-white shadow-lg shadow-brand/30'
                        : 'text-slate-300 hover:bg-slate-800/80 hover:text-white',
                    )}
                  >
                    {nombre.slice(0, 3)}
                  </button>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-7 gap-1 text-center">
                {DIAS_SEMANA.map((d) => (
                  <span key={d} className="pb-1 text-[10px] font-bold uppercase text-slate-500">
                    {d}
                  </span>
                ))}
                {Array.from({ length: hueco }, (_, i) => (
                  <span key={`hueco-${i}`} />
                ))}
                {Array.from({ length: diasDelMes }, (_, i) => {
                  const fecha = iso(vista.anio, vista.mes, i + 1);
                  const elegido = fecha === value;
                  const bloqueado = fueraDeRango(fecha);
                  return (
                    <button
                      key={fecha}
                      type="button"
                      disabled={bloqueado}
                      onClick={() => elegir(fecha)}
                      className={cn(
                        'h-8 rounded-lg text-xs font-semibold transition-all',
                        elegido && 'bg-brand font-black text-white shadow-lg shadow-brand/30',
                        !elegido && !bloqueado && 'text-slate-300 hover:bg-slate-800/80 hover:text-white',
                        !elegido && fecha === hoy && 'ring-1 ring-brand/60',
                        bloqueado && 'cursor-not-allowed text-slate-700',
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
                onClick={() => elegir(hoy)}
                disabled={fueraDeRango(hoy)}
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

function mesDe(fecha: string): { anio: number; mes: number; modo: 'dias' } {
  return { anio: Number(fecha.slice(0, 4)), mes: Number(fecha.slice(5, 7)) - 1, modo: 'dias' };
}
