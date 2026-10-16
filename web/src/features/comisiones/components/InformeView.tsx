/** Comisiones › Informe: lo que cobra cada persona en un periodo. */

import { useMemo, useState, type ReactNode } from 'react';
import { router } from '@inertiajs/react';
import {
  AlertTriangle, CalendarRange, Check, FileSpreadsheet, HandCoins, ListChecks, Lock, LockOpen, Percent, Receipt,
} from 'lucide-react';

import { AppLayout } from '@/shared/layout/AppLayout';
import {
  Button, EmptyState, ExportButton, LoadingState, Modal, MonthPicker, NeonContainer, SelectMenu, StatusMessage,
} from '@/shared/ui';
import { useInformeComisiones } from '../hooks/useInformeComisiones';
import { exportarInforme } from '../lib/exportar';
import { aBs, formatoBs, formatoFecha, formatoMes, formatoMonto, formatoTasa, totalBs } from '../lib/formato';
import type { CargoVentas, ComisionesInformeProps, InformeComision, PagoComision } from '../types';
import { IndicadoresPanel } from './IndicadoresPanel';
import { NominaView } from './NominaView';
import { PeriodoForm } from './PeriodoForm';
import { RevisionTabla } from './RevisionTabla';
import { VentasTabla } from './VentasTabla';

type Paso = 'revision' | 'indicadores' | 'nomina' | 'cierre';

/** Cuántos % faltan: lo mismo que el servidor exige para cerrar. */
function indicadoresPendientes(informe: InformeComision): number {
  const sinCumplimiento = informe.pagos.filter(
    (p) => (p.cargo === 'supervisor' || p.cargo === 'coord_oficina') && p.cumplimiento_pct === null && p.bruto,
  ).length;
  const sinCrecimiento = informe.pagos.filter((p) => p.cargo === 'coord_un' && p.crecimiento_pct === null && p.ventas_equipo).length;
  return sinCumplimiento + sinCrecimiento;
}

/**
 * El informe de un periodo de comisiones, como el trabajo se hace:
 * **revisar** las ventas por facturar, escribir los **indicadores**, leer la
 * **nómina** y **cerrar**.
 *
 * Lo que se escribe (decisiones y %) queda en los dos primeros pasos y la
 * nómina es de solo lectura, para que leerla no pueda cambiar un pago. Un
 * **borrador** se recalcula cada vez que se abre; **cerrado**, queda congelado y
 * sus ventas válidas no vuelven a contar en otro.
 */
export function InformeView({
  periodo, periodos, informe, error, propuesta, condiciones, cargos, puedeGestionar,
}: ComisionesInformeProps) {
  const c = useInformeComisiones(periodo, Boolean(informe));
  const editable = puedeGestionar && informe?.estado === 'borrador';
  const pendientesIndicadores = informe ? indicadoresPendientes(informe) : 0;

  // Quien gestiona un borrador empieza por lo que falta; los demás, por la nómina.
  const pasoInicial: Paso = !editable || !informe ? 'nomina'
    : informe.resumen.revision > 0 ? 'revision'
      : pendientesIndicadores > 0 ? 'indicadores' : 'nomina';
  const [paso, setPaso] = useState<Paso>(pasoInicial);
  const [verTodas, setVerTodas] = useState(false);
  const [editandoPeriodo, setEditandoPeriodo] = useState(false);
  const [confirmando, setConfirmando] = useState<'cerrar' | 'reabrir' | null>(null);
  const [desglose, setDesglose] = useState<PagoComision | null>(null);
  const [exportando, setExportando] = useState(false);

  const etiquetaCargo = (cargo: CargoVentas) => cargos.find((o) => o.value === cargo)?.label ?? cargo;
  const irA = (mes: string) => router.get('/comisiones/', { periodo: mes }, { preserveScroll: true });

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

  // La de pago es la de CONATEL del mes siguiente; la de hoy, solo una referencia.
  // `?.` por los periodos cerrados antes de que el informe llevara tasa.
  const tasa = informe?.tasa_conatel?.tasa ?? null;

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

  const totalUsd = Math.round((informe?.pagos ?? []).reduce((t, p) => t + p.neto, 0) * 100) / 100;
  const totalBsPago = totalBs((informe?.pagos ?? []).map((p) => p.neto), tasa);
  const cobran = (informe?.pagos ?? []).filter((p) => p.neto > 0).length;

  const opcionesPeriodo = periodos.map((p) => ({
    value: p.periodo,
    label: `${p.periodo} · ${p.estado === 'cerrado' ? 'cerrado' : 'borrador'}`,
  }));

  const pasos: { key: Paso; titulo: string; detalle: string; hecho: boolean; pendiente: boolean; icono: ReactNode }[] = informe ? [
    {
      key: 'revision',
      titulo: 'Revisar ventas',
      detalle: informe.resumen.revision ? `${informe.resumen.revision} por facturar sin decidir` : 'Nada por decidir',
      hecho: informe.resumen.revision === 0,
      pendiente: informe.resumen.revision > 0,
      icono: <ListChecks className="h-4 w-4" />,
    },
    {
      key: 'indicadores',
      titulo: 'Indicadores',
      detalle: pendientesIndicadores ? `${pendientesIndicadores} % sin definir` : 'Cumplimiento y crecimiento',
      hecho: pendientesIndicadores === 0,
      pendiente: pendientesIndicadores > 0,
      icono: <Percent className="h-4 w-4" />,
    },
    {
      key: 'nomina',
      titulo: 'Nómina',
      detalle: `${formatoMonto(totalUsd)} · ${cobran} ${cobran === 1 ? 'persona' : 'personas'}`,
      hecho: false,
      pendiente: false,
      icono: <HandCoins className="h-4 w-4" />,
    },
    {
      key: 'cierre',
      titulo: informe.estado === 'cerrado' ? 'Cerrado' : 'Cerrar',
      detalle: informe.estado === 'cerrado' ? 'Congelado tal como se ve' : informe.pendientes_cierre.length ? 'Falta completar' : 'Listo para cerrar',
      hecho: informe.estado === 'cerrado',
      pendiente: false,
      icono: <Lock className="h-4 w-4" />,
    },
  ] : [];

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
            {puedeGestionar && <MonthPicker className="w-40" value={periodo} onChange={irA} placeholder="Otro mes" />}
            {informe && (
              <span className="text-xs text-slate-400">
                Instalaciones del <strong className="text-slate-200">{formatoFecha(informe.inicio)}</strong> al{' '}
                <strong className="text-slate-200">{formatoFecha(informe.fin)}</strong>
              </span>
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
        <div className="overflow-clip rounded-3xl border border-slate-800 bg-surface-secondary shadow-xl">
          {/* Lo que hay que pagar: lo primero que se lee. */}
          <div className="flex flex-wrap items-end justify-between gap-6 bg-gradient-to-br from-emerald-500/[0.07] via-transparent to-transparent px-6 py-5">
            <div>
              <p className="flex items-center gap-2 text-[11px] font-black uppercase tracking-wider text-emerald-300">
                <HandCoins className="h-4 w-4" />
                Total a pagar · comisiones de {formatoMes(periodo)}
                <span
                  className={`ml-2 rounded-full border px-2 py-0.5 text-[10px] ${
                    informe.estado === 'cerrado'
                      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                      : 'border-amber-500/30 bg-amber-500/10 text-amber-300'
                  }`}
                >
                  {informe.estado === 'cerrado' ? 'Cerrado' : 'Borrador'}
                </span>
              </p>
              <div className="mt-2 flex flex-wrap items-baseline gap-x-6 gap-y-1">
                <p className="font-mono text-4xl font-black tabular-nums text-white">{formatoMonto(totalUsd)}</p>
                <p className="font-mono text-2xl font-black tabular-nums text-emerald-300">{tasa === null ? 'Bs —' : formatoBs(totalBsPago)}</p>
              </div>
              <p className="mt-1.5 text-xs text-slate-400">
                <strong className="text-white">{cobran}</strong> {cobran === 1 ? 'persona cobra' : 'personas cobran'} ·{' '}
                <strong className="text-white">{informe.resumen.validas}</strong> ventas validadas
                {informe.resumen.validas_cambio_plan > 0 && <> · {informe.resumen.validas_cambio_plan} por cambio de plan</>}
              </p>
            </div>
            <div className="border-l border-slate-700/70 pl-5 text-right">
              <p className="text-[10px] font-black uppercase tracking-wider text-emerald-300">
                Tasa de pago · CONATEL {informe.tasa_conatel ? formatoMes(informe.tasa_conatel.mes) : ''}
              </p>
              <p className="mt-0.5 font-mono text-xl font-black tabular-nums text-white">{formatoTasa(tasa)}</p>
              <p className="text-[11px] text-slate-500">
                {tasa !== null ? informe.tasa_conatel.fuente : informe.tasa_conatel?.aviso || 'Sin tasa'}
              </p>
              <p className="mt-1 text-[11px] text-slate-500" title="Solo como referencia: no se usa para pagar">
                Hoy {c.tasaHoy ? formatoTasa(c.tasaHoy.tasa) : '…'} · solo referencia
              </p>
            </div>
          </div>

          <nav className="grid grid-cols-2 border-y border-slate-800 md:grid-cols-4" aria-label="Pasos del informe">
            {pasos.map((p, i) => {
              const activo = paso === p.key;
              return (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => setPaso(p.key)}
                  aria-current={activo ? 'step' : undefined}
                  className={`flex items-start gap-3 border-b-2 px-5 py-3.5 text-left transition md:border-r md:border-r-slate-800 md:last:border-r-0 ${
                    activo ? 'border-b-sky-500 bg-sky-500/[0.06]' : 'border-b-transparent hover:bg-surface-tertiary/40'
                  }`}
                >
                  <span
                    className={`grid h-7 w-7 shrink-0 place-items-center rounded-full border font-mono text-xs font-bold ${
                      p.hecho ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-300'
                        : p.pendiente ? 'border-amber-500/50 bg-amber-500/10 text-amber-300'
                          : activo ? 'border-sky-500 text-sky-300' : 'border-slate-700 text-slate-400'
                    }`}
                  >
                    {p.hecho ? <Check className="h-3.5 w-3.5" /> : i + 1}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-bold text-white">{p.titulo}</span>
                    <span className={`block truncate text-xs ${p.pendiente ? 'text-amber-300' : 'text-slate-400'}`}>{p.detalle}</span>
                  </span>
                </button>
              );
            })}
          </nav>

          {paso === 'revision' && (
            <div>
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 px-5 py-3">
                <p className="max-w-3xl text-xs text-slate-400">
                  {verTodas
                    ? 'Cada venta instalada en el periodo, con su clasificación y quién cobra por ella.'
                    : 'Por facturar y en progreso: la campaña pudo exonerar un mes. Cuéntala o no la cuentes; si no se cuenta, no se paga.'}
                  {' '}
                  <span className="text-slate-500">
                    {informe.resumen.candidatas} instaladas · {informe.resumen.validas} válidas · {informe.resumen.no_pagadas} no pagadas ·{' '}
                    {informe.resumen.excluidas} excluidas
                  </span>
                </p>
                <div className="inline-flex rounded-xl border border-slate-700/50 bg-surface-primary p-1 text-xs font-bold">
                  {([[false, `Por decidir · ${informe.revision.length}`], [true, 'Todas las ventas']] as const).map(([todas, etiqueta]) => (
                    <button
                      key={String(todas)}
                      type="button"
                      onClick={() => {
                        setVerTodas(todas);
                        if (todas) void c.cargarVentas();
                      }}
                      className={`rounded-lg px-3 py-1.5 transition ${verTodas === todas ? 'bg-sky-500/15 text-sky-300 ring-1 ring-sky-500/40' : 'text-slate-400 hover:text-white'}`}
                    >
                      {etiqueta}
                    </button>
                  ))}
                </div>
              </div>
              {verTodas
                ? (c.ventas ? <VentasTabla ventas={c.ventas} /> : <LoadingState message="Cargando ventas..." />)
                : (
                  <RevisionTabla
                    ventas={informe.revision}
                    editable={editable}
                    guardando={c.guardando}
                    onDecidir={(ordenes, decision) => void c.decidir(ordenes, decision)}
                  />
                )}
            </div>
          )}

          {paso === 'indicadores' && (
            <div className="p-5">
              <IndicadoresPanel
                informe={informe}
                editable={editable}
                onGeneral={(valor) => void c.guardarCumplimientoGeneral(valor)}
                onCumplimiento={(id, valor) => void c.guardarCumplimiento(id, valor)}
                onCrecimiento={(id, valor) => void c.guardarCrecimiento(id, valor)}
              />
            </div>
          )}

          {paso === 'nomina' && (
            <NominaView
              informe={informe}
              condiciones={condiciones}
              tasa={tasa}
              onVerPersona={verDesglose}
              onEditarIndicadores={editable ? () => setPaso('indicadores') : null}
            />
          )}

          {paso === 'cierre' && (
            <div className="space-y-4 p-5">
              {informe.estado === 'cerrado' ? (
                <>
                  <StatusMessage
                    status={{ type: 'success', text: 'Periodo cerrado: las ventas, los pagos y las condiciones quedaron congelados tal como se ven.' }}
                    icon={<Lock />}
                  />
                  {puedeGestionar && (
                    <Button variant="outline" icon={<LockOpen className="h-4 w-4" />} onClick={() => setConfirmando('reabrir')}>
                      Reabrir
                    </Button>
                  )}
                </>
              ) : (
                <>
                  {informe.antes_de_tiempo && (
                    <StatusMessage
                      status={{
                        type: 'warning',
                        text: `Todavía no es ${formatoFecha(informe.calculo_desde)}: algunas primeras facturas pueden no estar pagadas aún, y esas ventas salen como no pagadas.`,
                      }}
                      icon={<AlertTriangle />}
                    />
                  )}
                  <div className="grid gap-3 md:grid-cols-2">
                    {([
                      ['revision', 'Ventas en revisión', informe.resumen.revision ? `${informe.resumen.revision} sin decidir` : null],
                      ['indicadores', 'Cumplimientos y crecimientos', pendientesIndicadores ? `${pendientesIndicadores} sin definir` : null],
                    ] as const).map(([key, titulo, falta]) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setPaso(key)}
                        className={`flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-left transition hover:bg-surface-tertiary/40 ${
                          falta ? 'border-amber-500/40' : 'border-slate-800'
                        }`}
                      >
                        <span className="text-sm font-semibold text-white">{titulo}</span>
                        <span className={`text-xs font-bold ${falta ? 'text-amber-300' : 'text-emerald-300'}`}>{falta ?? 'Completo'}</span>
                      </button>
                    ))}
                  </div>
                  <p className="max-w-3xl text-sm text-slate-300">
                    Cerrar guarda las ventas, los pagos y las condiciones de hoy. Sus ventas válidas no volverán a contar en ningún otro
                    periodo, y el informe deja de recalcularse.
                  </p>
                  {editable && (
                    <Button icon={<Lock className="h-4 w-4" />} onClick={() => setConfirmando('cerrar')} disabled={informe.pendientes_cierre.length > 0}>
                      Cerrar periodo
                    </Button>
                  )}
                </>
              )}
            </div>
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
              ? `Se pagan ${formatoMonto(totalUsd)}${tasa !== null ? ` (${formatoBs(totalBsPago)})` : ''} a ${cobran} personas. Se guardan las ventas, los pagos y las condiciones de hoy, y sus ventas válidas no volverán a contar en ningún otro periodo.`
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
        subtitle={
          desglose
            ? `${etiquetaCargo(desglose.cargo)} · ${desglose.ventas_propias + desglose.ventas_equipo + desglose.ventas_pyme} ventas validadas · ${formatoMonto(desglose.neto)}${
              tasa !== null ? ` · ${formatoBs(aBs(desglose.neto, tasa))}` : ''
            } a pagar`
            : ''
        }
        icon={<Receipt className="h-5 w-5 text-emerald-400" />}
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
