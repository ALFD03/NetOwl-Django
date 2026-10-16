/** Comisiones › Informe: lo que cobra cada persona en un periodo. */

import { useMemo, useState } from 'react';
import { router } from '@inertiajs/react';
import {
  AlertTriangle, CalendarRange, CheckCircle2, FileSpreadsheet, HandCoins, ListChecks,
  Lock, LockOpen, Receipt, Users,
} from 'lucide-react';

import { AppLayout } from '@/shared/layout/AppLayout';
import {
  Button, EmptyState, ExportButton, LoadingState, MetricCard, Modal, MonthPicker, NeonContainer,
  SelectMenu, StatusMessage, ToggleGroup,
} from '@/shared/ui';
import { useInformeComisiones } from '../hooks/useInformeComisiones';
import { exportarInforme } from '../lib/exportar';
import { CARGOS, CARGO_CORTO, formatoFecha, formatoMonto } from '../lib/formato';
import type { CargoVentas, ComisionesInformeProps, PagoComision } from '../types';
import { PagosTabla } from './PagosTabla';
import { PeriodoForm } from './PeriodoForm';
import { RevisionTabla } from './RevisionTabla';
import { VentasTabla } from './VentasTabla';

type Vista = CargoVentas | 'revision' | 'ventas';

/**
 * El informe de un periodo de comisiones.
 *
 * Un **borrador** se recalcula cada vez que se abre, con las suscripciones de
 * ese momento: se revisan las ventas por facturar, se escriben los
 * cumplimientos y, cuando no queda nada pendiente, se **cierra**. Cerrado, el
 * informe queda congelado y sus ventas válidas no vuelven a contar en otro.
 */
export function InformeView({
  periodo, periodos, informe, error, propuesta, cargos, puedeGestionar,
}: ComisionesInformeProps) {
  const c = useInformeComisiones(periodo, Boolean(informe));
  const [vista, setVista] = useState<Vista>('asesor');
  const [editandoPeriodo, setEditandoPeriodo] = useState(false);
  const [confirmando, setConfirmando] = useState<'cerrar' | 'reabrir' | null>(null);
  const [desglose, setDesglose] = useState<PagoComision | null>(null);
  const [exportando, setExportando] = useState(false);

  const editable = puedeGestionar && informe?.estado === 'borrador';
  const etiquetaCargo = (cargo: CargoVentas) => cargos.find((o) => o.value === cargo)?.label ?? cargo;
  const pagosDe = (cargo: CargoVentas) => informe?.pagos.filter((p) => p.cargo === cargo) ?? [];
  const totalDe = (cargo: CargoVentas) => pagosDe(cargo).reduce((t, p) => t + p.neto, 0);

  const irA = (mes: string) => router.get('/comisiones/', { periodo: mes }, { preserveScroll: true });

  const abrirVista = (key: Vista) => {
    setVista(key);
    if (key === 'ventas') void c.cargarVentas();
  };

  const verDesglose = (pago: PagoComision) => {
    setDesglose(pago);
    void c.cargarVentas();
  };

  const ventasDelDesglose = useMemo(() => {
    if (!desglose || !c.ventas) return [];
    const id = desglose.persona_id;
    return c.ventas.filter((v) => v.clasificacion === 'valida'
      && [v.medio_id, v.supervisor_id, v.coord_oficina_id, v.coord_un_id].includes(id));
  }, [desglose, c.ventas]);

  const exportar = async () => {
    if (!informe) return;
    setExportando(true);
    try {
      const ventas = c.ventas ?? (await c.cargarVentas()) ?? [];
      await exportarInforme(periodo, informe.pagos, ventas, etiquetaCargo);
    } catch {
      c.setError('No se pudo generar el Excel del informe.');
    } finally {
      setExportando(false);
    }
  };

  const opcionesPeriodo = periodos.map((p) => ({
    value: p.periodo,
    label: `${p.periodo} · ${p.estado === 'cerrado' ? 'cerrado' : 'borrador'}`,
  }));

  return (
    <AppLayout
      toolbar={
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-slate-800 bg-surface-secondary p-4 shadow-xl">
          <div className="flex flex-wrap items-center gap-3">
            {opcionesPeriodo.length > 0 && (
              <SelectMenu
                aria-label="Periodo"
                className="w-56"
                value={periodos.some((p) => p.periodo === periodo) ? periodo : ''}
                placeholder="Periodo"
                options={opcionesPeriodo}
                onChange={irA}
              />
            )}
            {puedeGestionar && (
              <MonthPicker className="w-40" value={periodo} onChange={irA} placeholder="Otro mes" />
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {informe && (
              <ExportButton
                onClick={() => void exportar()}
                estado={exportando ? 'busy' : 'idle'}
                label="Exportar"
                icon={<FileSpreadsheet className="h-4 w-4" />}
              />
            )}
            {editable && (
              <Button variant="outline" icon={<CalendarRange className="h-4 w-4" />} onClick={() => setEditandoPeriodo(true)}>
                Días promocionales
              </Button>
            )}
            {editable && (
              <Button icon={<Lock className="h-4 w-4" />} onClick={() => setConfirmando('cerrar')} disabled={informe.pendientes_cierre.length > 0}>
                Cerrar periodo
              </Button>
            )}
            {puedeGestionar && informe?.estado === 'cerrado' && (
              <Button variant="outline" icon={<LockOpen className="h-4 w-4" />} onClick={() => setConfirmando('reabrir')}>
                Reabrir
              </Button>
            )}
          </div>
        </div>
      }
    >
      <StatusMessage status={c.error ? { type: 'error', text: c.error } : null} className="mb-4" icon={<AlertTriangle />} />
      <StatusMessage status={error ? { type: 'error', text: error } : null} className="mb-4" icon={<AlertTriangle />} />

      {!informe && !error && (
        <NeonContainer title={`Periodo ${periodo}`} subtitle="Todavía no tiene periodo de comisiones" icon={<HandCoins className="h-5 w-5" />} theme="slate">
          <EmptyState
            title="Sin periodo"
            description={
              puedeGestionar
                ? 'Crea el periodo confirmando dónde empezaron los días promocionales: es lo que fija qué instalaciones cuentan.'
                : 'Nadie ha creado todavía el periodo de este mes.'
            }
            icon={<CalendarRange />}
            action={puedeGestionar ? (
              <Button icon={<CalendarRange className="h-4 w-4" />} onClick={() => setEditandoPeriodo(true)}>
                Crear periodo
              </Button>
            ) : undefined}
          />
        </NeonContainer>
      )}

      {informe && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-slate-400">
            <span>
              Instalaciones del <strong className="text-white">{formatoFecha(informe.inicio)}</strong> al{' '}
              <strong className="text-white">{formatoFecha(informe.fin)}</strong>
            </span>
            <span>Días promocionales desde el {formatoFecha(informe.inicio_promo)}</span>
            <span className={informe.estado === 'cerrado' ? 'text-emerald-400' : 'text-amber-400'}>
              {informe.estado === 'cerrado' ? 'Cerrado: congelado' : 'Borrador: se recalcula al abrirlo'}
            </span>
          </div>

          {informe.estado === 'borrador' && informe.antes_de_tiempo && (
            <StatusMessage
              status={{
                type: 'warning',
                text: `Todavía no es ${formatoFecha(informe.calculo_desde)}: algunas primeras facturas pueden no estar pagadas aún, y esas ventas salen como no pagadas.`,
              }}
              icon={<AlertTriangle />}
            />
          )}
          {informe.estado === 'borrador' && informe.pendientes_cierre.length > 0 && (
            <StatusMessage
              status={{ type: 'warning', text: `Para cerrar falta: ${informe.pendientes_cierre.join(' · ')}.` }}
              icon={<ListChecks />}
            />
          )}

          <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
            <MetricCard label="Candidatas" value={informe.resumen.candidatas} color="slate" icon={<Users className="h-4 w-4" />} caption="Instaladas en la ventana" />
            <MetricCard
              label="Válidas"
              value={informe.resumen.validas}
              color="green"
              icon={<CheckCircle2 className="h-4 w-4" />}
              subValue={`${informe.resumen.validas_pyme} PYME`}
              caption={informe.resumen.validas_sin_medio ? `${informe.resumen.validas_sin_medio} con medio sin registrar` : 'Facturadas y en progreso'}
            />
            <MetricCard label="No pagadas" value={informe.resumen.no_pagadas} color="red" icon={<Receipt className="h-4 w-4" />} caption="Facturadas y fuera de progreso" />
            <MetricCard label="En revisión" value={informe.resumen.revision} color="yellow" icon={<ListChecks className="h-4 w-4" />} caption="Por facturar y en progreso" onClick={() => abrirVista('revision')} />
            <MetricCard label="Total a pagar" value={formatoMonto(informe.resumen.total)} color="purple" icon={<HandCoins className="h-4 w-4" />} />
          </div>

          <ToggleGroup
            activeKey={vista}
            onChange={(key) => abrirVista(key as Vista)}
            options={[
              ...CARGOS.map((cargo) => ({
                key: cargo,
                label: `${CARGO_CORTO[cargo]} · ${formatoMonto(totalDe(cargo))}`,
              })),
              { key: 'revision', label: `Revisión (${informe.resumen.revision})`, icon: ListChecks },
              { key: 'ventas', label: 'Ventas', icon: Receipt },
            ]}
          />

          {CARGOS.includes(vista as CargoVentas) && (
            <NeonContainer
              title={etiquetaCargo(vista as CargoVentas)}
              subtitle="Pulsa una fila para ver las ventas por las que cobra"
              icon={<HandCoins className="h-5 w-5" />}
              theme="green"
              noPadding
            >
              <PagosTabla
                cargo={vista as CargoVentas}
                pagos={pagosDe(vista as CargoVentas)}
                editable={editable}
                onCumplimiento={(id, valor) => void c.guardarCumplimiento(id, valor)}
                onCrecimiento={(id, valor) => void c.guardarCrecimiento(id, valor)}
                onVerVentas={verDesglose}
              />
            </NeonContainer>
          )}

          {vista === 'revision' && (
            <NeonContainer
              title="Revisión"
              subtitle="Por facturar y en progreso: la campaña pudo exonerar un mes. Cuéntala aquí o difiérela a un periodo posterior"
              icon={<ListChecks className="h-5 w-5" />}
              theme="yellow"
              noPadding
            >
              <RevisionTabla
                ventas={informe.revision}
                editable={editable}
                guardando={c.guardando}
                onDecidir={(orden, decision) => void c.decidir(orden, decision)}
              />
            </NeonContainer>
          )}

          {vista === 'ventas' && (
            <NeonContainer title="Ventas del periodo" subtitle="Cada candidata con su clasificación y quién cobra por ella" icon={<Receipt className="h-5 w-5" />} theme="slate" noPadding>
              {c.ventas ? <VentasTabla ventas={c.ventas} /> : <LoadingState message="Cargando ventas..." />}
            </NeonContainer>
          )}
        </div>
      )}

      <Modal
        isOpen={editandoPeriodo}
        onClose={() => setEditandoPeriodo(false)}
        title={informe ? `Días promocionales de ${periodo}` : `Crear el periodo ${periodo}`}
        subtitle="Dónde se corta el periodo de comisiones"
        icon={<CalendarRange className="h-5 w-5 text-sky-400" />}
        theme="blue"
        size="md"
      >
        <PeriodoForm
          propuesta={propuesta}
          guardando={c.guardando}
          onGuardar={async (body) => { if (await c.guardarPeriodo(body)) setEditandoPeriodo(false); }}
          onCerrar={() => setEditandoPeriodo(false)}
        />
      </Modal>

      <Modal
        isOpen={Boolean(confirmando)}
        onClose={() => setConfirmando(null)}
        title={confirmando === 'cerrar' ? `Cerrar ${periodo}` : `Reabrir ${periodo}`}
        subtitle={confirmando === 'cerrar' ? 'El informe queda congelado tal y como se ve ahora' : 'Vuelve a borrador y se recalcula con los datos de hoy'}
        icon={confirmando === 'cerrar' ? <Lock className="h-5 w-5 text-emerald-400" /> : <LockOpen className="h-5 w-5 text-amber-400" />}
        theme={confirmando === 'cerrar' ? 'green' : 'yellow'}
        size="sm"
      >
        <div className="space-y-5">
          <p className="text-sm text-slate-300">
            {confirmando === 'cerrar'
              ? 'Se guardan las ventas, los pagos y las condiciones de hoy. Sus ventas válidas no volverán a contar en ningún otro periodo.'
              : 'Se borra lo congelado. Al abrirlo se calculará con las suscripciones de hoy, que pueden no ser las del cierre.'}
          </p>
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setConfirmando(null)}>Cancelar</Button>
            <Button
              isLoading={c.guardando}
              onClick={async () => {
                const ok = confirmando === 'cerrar' ? await c.cerrar() : await c.reabrir();
                if (ok) setConfirmando(null);
              }}
            >
              {confirmando === 'cerrar' ? 'Cerrar periodo' : 'Reabrir'}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={Boolean(desglose)}
        onClose={() => setDesglose(null)}
        title={desglose?.nombre ?? ''}
        subtitle={desglose ? `${etiquetaCargo(desglose.cargo)} · ${formatoMonto(desglose.neto)} a pagar` : ''}
        icon={<HandCoins className="h-5 w-5 text-emerald-400" />}
        theme="green"
      >
        {desglose && (
          <div className="space-y-4">
            {desglose.avisos.length > 0 && (
              <StatusMessage status={{ type: 'warning', text: desglose.avisos.join(' · ') }} icon={<AlertTriangle />} />
            )}
            {c.ventas ? <VentasTabla ventas={ventasDelDesglose} /> : <LoadingState message="Cargando ventas..." />}
          </div>
        )}
      </Modal>
    </AppLayout>
  );
}
