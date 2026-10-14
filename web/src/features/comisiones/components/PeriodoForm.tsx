/** El formulario que crea un periodo o cambia sus días promocionales. */

import { useState, type FormEvent } from 'react';
import { CalendarRange } from 'lucide-react';

import { Button, DatePicker } from '@/shared/ui';
import { formatoFecha } from '../lib/formato';
import type { PropuestaPeriodo } from '../types';

interface PeriodoFormProps {
  propuesta: PropuestaPeriodo;
  guardando: boolean;
  onGuardar: (body: { periodo: string; inicio_promo: string; inicio?: string }) => void;
  onCerrar: () => void;
}

/** El día anterior a una fecha ISO. */
function diaAnterior(iso: string): string {
  const fecha = new Date(`${iso}T12:00:00`);
  fecha.setDate(fecha.getDate() - 1);
  return fecha.toISOString().slice(0, 10);
}

/**
 * El periodo va del inicio de los días promocionales del mes anterior al día
 * antes de los del mes: lo instalado en días promocionales paga su primera
 * mensualidad un mes más tarde y cuenta para el periodo siguiente. Como se
 * adelantan o se retrasan, se confirman cada mes (el 25 es solo la propuesta).
 *
 * El inicio solo se pregunta si el mes anterior no tiene periodo: si lo
 * tiene, es donde empezaron sus días promocionales.
 */
export function PeriodoForm({ propuesta, guardando, onGuardar, onCerrar }: PeriodoFormProps) {
  const [inicio, setInicio] = useState(propuesta.inicio);
  const [inicioPromo, setInicioPromo] = useState(propuesta.inicio_promo);

  const enviar = (event: FormEvent) => {
    event.preventDefault();
    onGuardar({
      periodo: propuesta.periodo,
      inicio_promo: inicioPromo,
      ...(propuesta.preguntar_inicio ? { inicio } : {}),
    });
  };

  // Los días promocionales de un mes empiezan dentro de ese mes.
  const [anio, mes] = propuesta.periodo.split('-').map(Number);
  const inicioMes = `${propuesta.periodo}-01`;
  const finMes = `${propuesta.periodo}-${String(new Date(anio, mes, 0).getDate()).padStart(2, '0')}`;

  return (
    <form onSubmit={enviar} className="space-y-5">
      <div className="flex items-start gap-3 rounded-2xl border border-slate-800 bg-surface-tertiary/40 p-4 text-xs text-slate-300">
        <CalendarRange className="h-6 w-6 flex-shrink-0 text-slate-500" />
        <p>
          Cuenta lo instalado desde el inicio de los días promocionales del mes anterior hasta el día antes de
          los de este mes. Lo instalado en días promocionales paga su primera mensualidad un mes después, así
          que su comisión va al periodo siguiente.
        </p>
      </div>

      {propuesta.preguntar_inicio ? (
        <DatePicker
          label="Inicio de los días promocionales del mes anterior"
          hint="El mes anterior no tiene periodo de comisiones: indica dónde empezaron sus días promocionales. Es el primer día que cuenta."
          value={inicio}
          onChange={setInicio}
        />
      ) : (
        <p className="text-xs text-slate-400">
          Empieza el <strong className="text-white">{formatoFecha(inicio)}</strong>, donde empezaron los días
          promocionales del periodo anterior.
        </p>
      )}

      <DatePicker
        label="Inicio de los días promocionales de este mes"
        hint="Normalmente el 25. Lo instalado desde este día cuenta para el periodo siguiente."
        value={inicioPromo}
        onChange={setInicioPromo}
        min={inicioMes}
        max={finMes}
      />

      {inicio && inicioPromo && (
        <p className="text-xs text-slate-400">
          Ventana del periodo: <strong className="text-white">{formatoFecha(inicio)}</strong> al{' '}
          <strong className="text-white">{formatoFecha(diaAnterior(inicioPromo))}</strong>, ambos incluidos.
        </p>
      )}

      <div className="flex justify-end gap-3">
        <Button type="button" variant="outline" onClick={onCerrar}>Cancelar</Button>
        <Button type="submit" isLoading={guardando}>Guardar periodo</Button>
      </div>
    </form>
  );
}
