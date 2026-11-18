/** Dónde se corta cada periodo y cuándo se puede calcular, con las fechas del mes en curso como ejemplo. */

import { CalendarRange } from 'lucide-react';

import { cn } from '@/shared/lib/cn';
import { MilestoneTimeline, NeonContainer, StatTile, TextField } from '@/shared/ui';
import { dayAndMonth, examplePeriod, type CampoSimple } from '../../lib/conditions';
import type { CommissionConditions } from '../../types';
import { Antes, CABECERA } from './fields';

type Cambiar = (patch: Partial<CommissionConditions>) => void;

export function PeriodCard({
  borrador, guardadas, editando, errores, cambiar,
}: {
  borrador: CommissionConditions;
  guardadas: CommissionConditions;
  editando: boolean;
  errores: Partial<Record<CampoSimple, string>>;
  cambiar: Cambiar;
}) {
  const ejemplo = examplePeriod(borrador.promo_day, borrador.wait_days, borrador.cutoff_day);
  const read = (valor: string) => (valor === '' ? NaN : Number(valor));
  const dayChanged = borrador.promo_day !== guardadas.promo_day;
  const esperaCambiada = borrador.wait_days !== guardadas.wait_days;
  const cutoffChanged = borrador.cutoff_day !== guardadas.cutoff_day;

  return (
    <NeonContainer
      title="Periodo"
      subtitle="Dónde se corta cada periodo y cuándo se puede calcular"
      icon={<CalendarRange className="h-5 w-5" />}
      theme="slate"
    >
      {editando ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <TextField
              label="Día habitual de inicio de los días promocionales"
              type="number"
              min={1}
              max={31}
              value={Number.isNaN(borrador.promo_day) ? '' : borrador.promo_day}
              error={errores.promo_day}
              className={cn(dayChanged && !errores.promo_day && 'border-amber-500/70 bg-amber-500/10 font-bold')}
              onChange={(e) => cambiar({ promo_day: read(e.target.value) })}
            />
            <Antes value={dayChanged ? `día ${guardadas.promo_day}` : null} />
            {ejemplo && (
              <p className="mt-1 text-[11px] text-slate-500">
                El periodo de {ejemplo.name} iría del {dayAndMonth(ejemplo.start)} al {dayAndMonth(ejemplo.end)}.
              </p>
            )}
          </div>
          <div>
            <TextField
              label="Días de espera tras el fin del mes"
              type="number"
              min={0}
              max={60}
              value={Number.isNaN(borrador.wait_days) ? '' : borrador.wait_days}
              error={errores.wait_days}
              className={cn(esperaCambiada && !errores.wait_days && 'border-amber-500/70 bg-amber-500/10 font-bold')}
              onChange={(e) => cambiar({ wait_days: read(e.target.value) })}
            />
            <Antes value={esperaCambiada ? `${guardadas.wait_days} días` : null} />
            {ejemplo && <p className="mt-1 text-[11px] text-slate-500">Se podría calcular desde el {dayAndMonth(ejemplo.calculo)}.</p>}
          </div>
          <div>
            <TextField
              label="Corte de los pagos adelantados (mes siguiente)"
              type="number"
              min={1}
              max={31}
              value={Number.isNaN(borrador.cutoff_day) ? '' : borrador.cutoff_day}
              error={errores.cutoff_day}
              className={cn(cutoffChanged && !errores.cutoff_day && 'border-amber-500/70 bg-amber-500/10 font-bold')}
              onChange={(e) => cambiar({ cutoff_day: read(e.target.value) })}
            />
            <Antes value={cutoffChanged ? `día ${guardadas.cutoff_day}` : null} />
            {ejemplo && (
              <p className="mt-1 text-[11px] text-slate-500">
                Lo instalado del {dayAndMonth(ejemplo.promoStart)} al {dayAndMonth(ejemplo.monthEndDate)} contaría si estaba pagado el {dayAndMonth(ejemplo.corte)}.
              </p>
            )}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="flex flex-col gap-3">
            <StatTile variant="boxed" size="lg" label="Inicio habitual de los días promocionales" value={`Día ${borrador.promo_day}`} />
            <StatTile variant="boxed" size="lg" label="Espera tras el fin del mes" value={`${borrador.wait_days} días`} />
            <StatTile variant="boxed" size="lg" label="Corte de los pagos adelantados" value={`Día ${borrador.cutoff_day} del mes siguiente`} />
            <p className="text-xs text-slate-400">
              Los días habituales son solo la propuesta: cada periodo confirma los suyos al crearlo, porque se adelantan o se
              retrasan.
            </p>
          </div>
          {ejemplo && (
            <div className="flex min-w-0 flex-col gap-2 lg:col-span-2">
              <span className={CABECERA}>Ejemplo · periodo de {ejemplo.name}</span>
              <p className="text-sm text-slate-300">
                Cuentan las instalaciones del <strong className="text-white">{dayAndMonth(ejemplo.start)}</strong> al{' '}
                <strong className="text-white">{dayAndMonth(ejemplo.end)}</strong>. Lo instalado en los días promocionales (del{' '}
                {dayAndMonth(ejemplo.promoStart)} al {dayAndMonth(ejemplo.monthEndDate)}) paga su primera factura un mes después, así que es
                del periodo siguiente, salvo que el cliente la adelante: pagada hasta el{' '}
                <strong className="text-white">{dayAndMonth(ejemplo.corte)}</strong>, cuenta en este.
              </p>
              <MilestoneTimeline
                className="my-2 space-y-5"
                milestones={[
                  { id: 'inicio', label: 'Empieza el periodo (días promocionales del mes anterior)', value: dayAndMonth(ejemplo.start), markerClass: 'bg-sky-500' },
                  { id: 'promo', label: 'Días promocionales: solo cuentan si adelantan el pago', value: dayAndMonth(ejemplo.promoStart), markerClass: 'bg-sky-300' },
                  { id: 'mes', label: 'Fin de mes: último día de instalación y empieza la espera', value: dayAndMonth(ejemplo.monthEndDate), markerClass: 'bg-slate-500' },
                  { id: 'calculo', label: 'Ya se puede calcular sin aviso', value: dayAndMonth(ejemplo.calculo), markerClass: 'bg-amber-500' },
                  { id: 'corte', label: 'Corte de los pagos adelantados', value: dayAndMonth(ejemplo.corte), markerClass: 'bg-emerald-500' },
                ]}
              />
            </div>
          )}
        </div>
      )}
    </NeonContainer>
  );
}
