/** El formulario que crea un periodo o cambia sus días promocionales. */

import { useState, type FormEvent } from 'react';
import { CalendarRange } from 'lucide-react';

import { Button, DatePicker } from '@/shared/ui';
import { previousDay, formatDateValue, nextMonth, monthName } from '../lib/format';
import type { PeriodProposal } from '../types';

interface PeriodFormProps {
  proposal: PeriodProposal;
  guardando: boolean;
  onSave: (body: { period: string; promo_start: string; start?: string; advance_cutoff: string }) => void;
  onClose: () => void;
}

/** El primer y el último día de un `YYYY-MM`, en ISO. */
function monthBounds(periodo: string): [string, string] {
  const [anio, mes] = periodo.split('-').map(Number);
  return [`${periodo}-01`, `${periodo}-${String(new Date(anio, mes, 0).getDate()).padStart(2, '0')}`];
}

/**
 * El periodo va del inicio de los días promocionales del mes anterior al fin
 * del mes. Lo instalado en los días promocionales del mes paga su primera
 * mensualidad un mes más tarde y cuenta para el periodo siguiente, salvo que
 * el cliente la adelante: pagada hasta el corte (el 22 del mes siguiente, o el
 * día en que se saque el informe) cuenta en este. El corte es además la
 * ventana de pago de todo el periodo: sin la primera mensualidad pagada hasta
 * ese día, ninguna venta se paga. Como los días promocionales
 * se adelantan o se retrasan, se confirman cada mes (el 25 es solo la propuesta).
 *
 * El inicio solo se pregunta si el mes anterior no tiene periodo: si lo
 * tiene, es donde empezaron sus días promocionales.
 */
export function PeriodForm({ proposal, guardando, onSave: onGuardar, onClose: onCerrar }: PeriodFormProps) {
  const [inicio, setStart] = useState(proposal.start);
  const [inicioPromo, setPromoStart] = useState(proposal.promo_start);
  const [corte, setCutoff] = useState(proposal.advance_cutoff);

  const enviar = (event: FormEvent) => {
    event.preventDefault();
    onGuardar({
      period: proposal.period,
      promo_start: inicioPromo,
      advance_cutoff: corte,
      ...(proposal.ask_start ? { start: inicio } : {}),
    });
  };

  // Los días promocionales de un mes empiezan dentro de ese mes, y el corte cae en el siguiente.
  const [monthStart, monthEnd] = monthBounds(proposal.period);
  const next = nextMonth(proposal.period);
  const [nextStart, nextEnd] = monthBounds(next);

  return (
    <form onSubmit={enviar} className="space-y-5">
      <div className="flex items-start gap-3 rounded-2xl border border-slate-800 bg-surface-tertiary/40 p-4 text-xs text-slate-300">
        <CalendarRange className="h-6 w-6 flex-shrink-0 text-slate-500" />
        <p>
          Cuenta lo instalado desde el inicio de los días promocionales del mes anterior hasta el fin de este mes.
          Lo instalado en los días promocionales de este mes paga su primera mensualidad un mes después, así que
          su comisión va al periodo siguiente, salvo que el cliente la adelante: pagada hasta el día de corte,
          cuenta en este. El corte vale para todo el periodo: una venta sin la primera mensualidad pagada hasta
          ese día no se paga, aunque después lleguen facturas pagadas.
        </p>
      </div>

      {proposal.ask_start ? (
        <DatePicker
          label="Inicio de los días promocionales del mes anterior"
          hint="El mes anterior no tiene periodo de comisiones: indica dónde empezaron sus días promocionales. Es el primer día que cuenta."
          value={inicio}
          onChange={setStart}
        />
      ) : (
        <p className="text-xs text-slate-400">
          Empieza el <strong className="text-white">{formatDateValue(inicio)}</strong>, donde empezaron los días
          promocionales del periodo anterior.
        </p>
      )}

      <DatePicker
        label="Inicio de los días promocionales de este mes"
        hint="Normalmente el 25. Lo instalado desde este día cuenta para el periodo siguiente, salvo que adelante el pago."
        value={inicioPromo}
        onChange={setPromoStart}
        min={monthStart}
        max={monthEnd}
      />

      <DatePicker
        label="Corte de pagos"
        hint={`Normalmente el 22 de ${monthName(next)}, cuando se saca el informe. Solo cuenta la primera mensualidad pagada hasta este día; lo de los días promocionales pagado después va al periodo siguiente.`}
        value={corte}
        onChange={setCutoff}
        min={nextStart}
        max={nextEnd}
      />

      {inicio && inicioPromo && (
        <p className="text-xs text-slate-400">
          Cuenta lo instalado del <strong className="text-white">{formatDateValue(inicio)}</strong> al{' '}
          <strong className="text-white">{formatDateValue(previousDay(inicioPromo))}</strong> con la primera mensualidad
          pagada hasta el corte, y del{' '}
          <strong className="text-white">{formatDateValue(inicioPromo)}</strong> al <strong className="text-white">{formatDateValue(monthEnd)}</strong>{' '}
          solo con la primera mensualidad pagada hasta el <strong className="text-white">{corte ? formatDateValue(corte) : '—'}</strong>.
        </p>
      )}

      <div className="flex justify-end gap-3">
        <Button type="button" variant="outline" onClick={onCerrar}>Cancelar</Button>
        <Button type="submit" isLoading={guardando}>Guardar periodo</Button>
      </div>
    </form>
  );
}
