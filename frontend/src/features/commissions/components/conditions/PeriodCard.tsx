/** Dónde se corta cada periodo y cuándo se puede calcular, con las fechas del mes en curso como ejemplo. */

import { CalendarRange } from 'lucide-react';

import { cn } from '@/shared/lib/cn';
import { MilestoneTimeline, NeonContainer, StatTile, TextField } from '@/shared/ui';
import { dayAndMonth, examplePeriod, type SimpleField } from '../../lib/conditions';
import type { CommissionConditions } from '../../types';
import { Before, HEADER } from './fields';

type Change = (patch: Partial<CommissionConditions>) => void;

export function PeriodCard({
  draft, saved, editing, errors, change,
}: {
  draft: CommissionConditions;
  saved: CommissionConditions;
  editing: boolean;
  errors: Partial<Record<SimpleField, string>>;
  change: Change;
}) {
  const example = examplePeriod(draft.promo_day, draft.wait_days, draft.cutoff_day);
  const read = (value: string) => (value === '' ? NaN : Number(value));
  const dayChanged = draft.promo_day !== saved.promo_day;
  const changedWait = draft.wait_days !== saved.wait_days;
  const cutoffChanged = draft.cutoff_day !== saved.cutoff_day;

  return (
    <NeonContainer
      title="Periodo"
      subtitle="Dónde se corta cada periodo y cuándo se puede calcular"
      icon={<CalendarRange className="h-5 w-5" />}
      theme="slate"
    >
      {editing ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <TextField
              label="Día habitual de inicio de los días promocionales"
              type="number"
              min={1}
              max={31}
              value={Number.isNaN(draft.promo_day) ? '' : draft.promo_day}
              error={errors.promo_day}
              className={cn(dayChanged && !errors.promo_day && 'border-amber-500/70 bg-amber-500/10 font-bold')}
              onChange={(e) => change({ promo_day: read(e.target.value) })}
            />
            <Before value={dayChanged ? `día ${saved.promo_day}` : null} />
            {example && (
              <p className="mt-1 text-[11px] text-slate-500">
                El periodo de {example.name} iría del {dayAndMonth(example.start)} al {dayAndMonth(example.end)}.
              </p>
            )}
          </div>
          <div>
            <TextField
              label="Días de espera tras el fin del mes"
              type="number"
              min={0}
              max={60}
              value={Number.isNaN(draft.wait_days) ? '' : draft.wait_days}
              error={errors.wait_days}
              className={cn(changedWait && !errors.wait_days && 'border-amber-500/70 bg-amber-500/10 font-bold')}
              onChange={(e) => change({ wait_days: read(e.target.value) })}
            />
            <Before value={changedWait ? `${saved.wait_days} días` : null} />
            {example && <p className="mt-1 text-[11px] text-slate-500">Se podría calcular desde el {dayAndMonth(example.calc)}.</p>}
          </div>
          <div>
            <TextField
              label="Corte de los pagos adelantados (mes siguiente)"
              type="number"
              min={1}
              max={31}
              value={Number.isNaN(draft.cutoff_day) ? '' : draft.cutoff_day}
              error={errors.cutoff_day}
              className={cn(cutoffChanged && !errors.cutoff_day && 'border-amber-500/70 bg-amber-500/10 font-bold')}
              onChange={(e) => change({ cutoff_day: read(e.target.value) })}
            />
            <Before value={cutoffChanged ? `día ${saved.cutoff_day}` : null} />
            {example && (
              <p className="mt-1 text-[11px] text-slate-500">
                Lo instalado del {dayAndMonth(example.promoStart)} al {dayAndMonth(example.monthEndDate)} contaría si estaba pagado el {dayAndMonth(example.cutoff)}.
              </p>
            )}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="flex flex-col gap-3">
            <StatTile variant="boxed" size="lg" label="Inicio habitual de los días promocionales" value={`Día ${draft.promo_day}`} />
            <StatTile variant="boxed" size="lg" label="Espera tras el fin del mes" value={`${draft.wait_days} días`} />
            <StatTile variant="boxed" size="lg" label="Corte de los pagos adelantados" value={`Día ${draft.cutoff_day} del mes siguiente`} />
            <p className="text-xs text-slate-400">
              Los días habituales son solo la propuesta: cada periodo confirma los suyos al crearlo, porque se adelantan o se
              retrasan.
            </p>
          </div>
          {example && (
            <div className="flex min-w-0 flex-col gap-2 lg:col-span-2">
              <span className={HEADER}>Ejemplo · periodo de {example.name}</span>
              <p className="text-sm text-slate-300">
                Cuentan las instalaciones del <strong className="text-white">{dayAndMonth(example.start)}</strong> al{' '}
                <strong className="text-white">{dayAndMonth(example.end)}</strong>. Lo instalado en los días promocionales (del{' '}
                {dayAndMonth(example.promoStart)} al {dayAndMonth(example.monthEndDate)}) paga su primera factura un mes después, así que es
                del periodo siguiente, salvo que el cliente la adelante: pagada hasta el{' '}
                <strong className="text-white">{dayAndMonth(example.cutoff)}</strong>, cuenta en este.
              </p>
              <MilestoneTimeline
                className="my-2 space-y-5"
                milestones={[
                  { id: 'inicio', label: 'Empieza el periodo (días promocionales del mes anterior)', value: dayAndMonth(example.start), markerClass: 'bg-sky-500' },
                  { id: 'promo', label: 'Días promocionales: solo cuentan si adelantan el pago', value: dayAndMonth(example.promoStart), markerClass: 'bg-sky-300' },
                  { id: 'mes', label: 'Fin de mes: último día de instalación y empieza la espera', value: dayAndMonth(example.monthEndDate), markerClass: 'bg-slate-500' },
                  { id: 'calculo', label: 'Ya se puede calcular sin aviso', value: dayAndMonth(example.calc), markerClass: 'bg-amber-500' },
                  { id: 'corte', label: 'Corte de los pagos adelantados', value: dayAndMonth(example.cutoff), markerClass: 'bg-emerald-500' },
                ]}
              />
            </div>
          )}
        </div>
      )}
    </NeonContainer>
  );
}
