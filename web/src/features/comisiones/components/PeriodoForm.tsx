/** El formulario que crea un periodo o cambia sus días promocionales. */

import { useState, type FormEvent } from 'react';
import { CalendarRange } from 'lucide-react';

import { Button, DatePicker } from '@/shared/ui';
import { diaAnterior, formatoFecha, mesSiguiente, nombreMes } from '../lib/formato';
import type { PropuestaPeriodo } from '../types';

interface PeriodoFormProps {
  propuesta: PropuestaPeriodo;
  guardando: boolean;
  onGuardar: (body: { periodo: string; inicio_promo: string; inicio?: string; corte_adelantos: string }) => void;
  onCerrar: () => void;
}

/** El primer y el último día de un `YYYY-MM`, en ISO. */
function limitesDelMes(periodo: string): [string, string] {
  const [anio, mes] = periodo.split('-').map(Number);
  return [`${periodo}-01`, `${periodo}-${String(new Date(anio, mes, 0).getDate()).padStart(2, '0')}`];
}

/**
 * El periodo va del inicio de los días promocionales del mes anterior al fin
 * del mes. Lo instalado en los días promocionales del mes paga su primera
 * mensualidad un mes más tarde y cuenta para el periodo siguiente, salvo que
 * el cliente la adelante: pagada hasta el corte (el 22 del mes siguiente, o el
 * día en que se saque el informe) cuenta en este. Como los días promocionales
 * se adelantan o se retrasan, se confirman cada mes (el 25 es solo la propuesta).
 *
 * El inicio solo se pregunta si el mes anterior no tiene periodo: si lo
 * tiene, es donde empezaron sus días promocionales.
 */
export function PeriodoForm({ propuesta, guardando, onGuardar, onCerrar }: PeriodoFormProps) {
  const [inicio, setInicio] = useState(propuesta.inicio);
  const [inicioPromo, setInicioPromo] = useState(propuesta.inicio_promo);
  const [corte, setCorte] = useState(propuesta.corte_adelantos);

  const enviar = (event: FormEvent) => {
    event.preventDefault();
    onGuardar({
      periodo: propuesta.periodo,
      inicio_promo: inicioPromo,
      corte_adelantos: corte,
      ...(propuesta.preguntar_inicio ? { inicio } : {}),
    });
  };

  // Los días promocionales de un mes empiezan dentro de ese mes, y el corte cae en el siguiente.
  const [inicioMes, finMes] = limitesDelMes(propuesta.periodo);
  const siguiente = mesSiguiente(propuesta.periodo);
  const [inicioSiguiente, finSiguiente] = limitesDelMes(siguiente);

  return (
    <form onSubmit={enviar} className="space-y-5">
      <div className="flex items-start gap-3 rounded-2xl border border-slate-800 bg-surface-tertiary/40 p-4 text-xs text-slate-300">
        <CalendarRange className="h-6 w-6 flex-shrink-0 text-slate-500" />
        <p>
          Cuenta lo instalado desde el inicio de los días promocionales del mes anterior hasta el fin de este mes.
          Lo instalado en los días promocionales de este mes paga su primera mensualidad un mes después, así que
          su comisión va al periodo siguiente, salvo que el cliente la adelante: pagada hasta el día de corte,
          cuenta en este.
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
        hint="Normalmente el 25. Lo instalado desde este día cuenta para el periodo siguiente, salvo que adelante el pago."
        value={inicioPromo}
        onChange={setInicioPromo}
        min={inicioMes}
        max={finMes}
      />

      <DatePicker
        label="Corte de los pagos adelantados"
        hint={`Normalmente el 22 de ${nombreMes(siguiente)}, cuando se saca el informe. Lo pagado después ya cuenta en el periodo siguiente.`}
        value={corte}
        onChange={setCorte}
        min={inicioSiguiente}
        max={finSiguiente}
      />

      {inicio && inicioPromo && (
        <p className="text-xs text-slate-400">
          Cuenta lo instalado del <strong className="text-white">{formatoFecha(inicio)}</strong> al{' '}
          <strong className="text-white">{formatoFecha(diaAnterior(inicioPromo))}</strong>, y del{' '}
          <strong className="text-white">{formatoFecha(inicioPromo)}</strong> al <strong className="text-white">{formatoFecha(finMes)}</strong>{' '}
          solo con la primera mensualidad pagada hasta el <strong className="text-white">{corte ? formatoFecha(corte) : '—'}</strong>.
        </p>
      )}

      <div className="flex justify-end gap-3">
        <Button type="button" variant="outline" onClick={onCerrar}>Cancelar</Button>
        <Button type="submit" isLoading={guardando}>Guardar periodo</Button>
      </div>
    </form>
  );
}
