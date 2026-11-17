/** Dónde se corta cada periodo y cuándo se puede calcular, con las fechas del mes en curso como ejemplo. */

import { CalendarRange } from 'lucide-react';

import { cn } from '@/shared/lib/cn';
import { MilestoneTimeline, NeonContainer, StatTile, TextField } from '@/shared/ui';
import { diaYMes, periodoEjemplo, type CampoSimple } from '../../lib/condiciones';
import type { CondicionesComision } from '../../types';
import { Antes, CABECERA } from './campos';

type Cambiar = (patch: Partial<CondicionesComision>) => void;

export function PeriodoCard({
  borrador, guardadas, editando, errores, cambiar,
}: {
  borrador: CondicionesComision;
  guardadas: CondicionesComision;
  editando: boolean;
  errores: Partial<Record<CampoSimple, string>>;
  cambiar: Cambiar;
}) {
  const ejemplo = periodoEjemplo(borrador.dia_promocional, borrador.dias_espera, borrador.dia_corte);
  const leer = (valor: string) => (valor === '' ? NaN : Number(valor));
  const diaCambiado = borrador.dia_promocional !== guardadas.dia_promocional;
  const esperaCambiada = borrador.dias_espera !== guardadas.dias_espera;
  const corteCambiado = borrador.dia_corte !== guardadas.dia_corte;

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
              value={Number.isNaN(borrador.dia_promocional) ? '' : borrador.dia_promocional}
              error={errores.dia_promocional}
              className={cn(diaCambiado && !errores.dia_promocional && 'border-amber-500/70 bg-amber-500/10 font-bold')}
              onChange={(e) => cambiar({ dia_promocional: leer(e.target.value) })}
            />
            <Antes valor={diaCambiado ? `día ${guardadas.dia_promocional}` : null} />
            {ejemplo && (
              <p className="mt-1 text-[11px] text-slate-500">
                El periodo de {ejemplo.nombre} iría del {diaYMes(ejemplo.inicio)} al {diaYMes(ejemplo.fin)}.
              </p>
            )}
          </div>
          <div>
            <TextField
              label="Días de espera tras el fin del mes"
              type="number"
              min={0}
              max={60}
              value={Number.isNaN(borrador.dias_espera) ? '' : borrador.dias_espera}
              error={errores.dias_espera}
              className={cn(esperaCambiada && !errores.dias_espera && 'border-amber-500/70 bg-amber-500/10 font-bold')}
              onChange={(e) => cambiar({ dias_espera: leer(e.target.value) })}
            />
            <Antes valor={esperaCambiada ? `${guardadas.dias_espera} días` : null} />
            {ejemplo && <p className="mt-1 text-[11px] text-slate-500">Se podría calcular desde el {diaYMes(ejemplo.calculo)}.</p>}
          </div>
          <div>
            <TextField
              label="Corte de los pagos adelantados (mes siguiente)"
              type="number"
              min={1}
              max={31}
              value={Number.isNaN(borrador.dia_corte) ? '' : borrador.dia_corte}
              error={errores.dia_corte}
              className={cn(corteCambiado && !errores.dia_corte && 'border-amber-500/70 bg-amber-500/10 font-bold')}
              onChange={(e) => cambiar({ dia_corte: leer(e.target.value) })}
            />
            <Antes valor={corteCambiado ? `día ${guardadas.dia_corte}` : null} />
            {ejemplo && (
              <p className="mt-1 text-[11px] text-slate-500">
                Lo instalado del {diaYMes(ejemplo.inicioPromo)} al {diaYMes(ejemplo.finDeMes)} contaría si estaba pagado el {diaYMes(ejemplo.corte)}.
              </p>
            )}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="flex flex-col gap-3">
            <StatTile variant="boxed" size="lg" label="Inicio habitual de los días promocionales" value={`Día ${borrador.dia_promocional}`} />
            <StatTile variant="boxed" size="lg" label="Espera tras el fin del mes" value={`${borrador.dias_espera} días`} />
            <StatTile variant="boxed" size="lg" label="Corte de los pagos adelantados" value={`Día ${borrador.dia_corte} del mes siguiente`} />
            <p className="text-xs text-slate-400">
              Los días habituales son solo la propuesta: cada periodo confirma los suyos al crearlo, porque se adelantan o se
              retrasan.
            </p>
          </div>
          {ejemplo && (
            <div className="flex min-w-0 flex-col gap-2 lg:col-span-2">
              <span className={CABECERA}>Ejemplo · periodo de {ejemplo.nombre}</span>
              <p className="text-sm text-slate-300">
                Cuentan las instalaciones del <strong className="text-white">{diaYMes(ejemplo.inicio)}</strong> al{' '}
                <strong className="text-white">{diaYMes(ejemplo.fin)}</strong>. Lo instalado en los días promocionales (del{' '}
                {diaYMes(ejemplo.inicioPromo)} al {diaYMes(ejemplo.finDeMes)}) paga su primera factura un mes después, así que es
                del periodo siguiente, salvo que el cliente la adelante: pagada hasta el{' '}
                <strong className="text-white">{diaYMes(ejemplo.corte)}</strong>, cuenta en este.
              </p>
              <MilestoneTimeline
                className="my-2 space-y-5"
                milestones={[
                  { id: 'inicio', label: 'Empieza el periodo (días promocionales del mes anterior)', value: diaYMes(ejemplo.inicio), markerClass: 'bg-sky-500' },
                  { id: 'promo', label: 'Días promocionales: solo cuentan si adelantan el pago', value: diaYMes(ejemplo.inicioPromo), markerClass: 'bg-sky-300' },
                  { id: 'mes', label: 'Fin de mes: último día de instalación y empieza la espera', value: diaYMes(ejemplo.finDeMes), markerClass: 'bg-slate-500' },
                  { id: 'calculo', label: 'Ya se puede calcular sin aviso', value: diaYMes(ejemplo.calculo), markerClass: 'bg-amber-500' },
                  { id: 'corte', label: 'Corte de los pagos adelantados', value: diaYMes(ejemplo.corte), markerClass: 'bg-emerald-500' },
                ]}
              />
            </div>
          )}
        </div>
      )}
    </NeonContainer>
  );
}
