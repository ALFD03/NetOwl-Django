/** Comisiones › Informe: lo que cobra cada persona en un periodo. */

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { router } from '@inertiajs/react';
import {
  AlertTriangle, CalendarRange, Check, FileSpreadsheet, HandCoins, ListChecks, Lock, LockOpen, Percent, Receipt,
  ShieldAlert,
} from 'lucide-react';

import { AppLayout } from '@/shared/layout/AppLayout';
import {
  Button, EmptyState, ExportButton, LoadingState, Modal, MonthPicker, NeonContainer, SelectMenu, StatusMessage, TextField,
} from '@/shared/ui';
import { useInformeComisiones } from '../hooks/useInformeComisiones';
import { exportarInforme } from '../lib/exportar';
import {
  aBs, diaAnterior, formatoBs, formatoFecha, formatoMes, formatoMonto, formatoTasa, mesSiguiente, nombreMes, totalBs,
} from '../lib/formato';
import type { CargoVentas, ComisionesInformeProps, InformeComision, PagoComision, TramoVenta } from '../types';
import { CierresArchivados } from './CierresArchivados';
import { IndicadoresPanel } from './IndicadoresPanel';
import { ManualesPanel } from './ManualesPanel';
import { NominaView } from './NominaView';
import { PeriodoForm } from './PeriodoForm';
import { PromoAnteriorTabla } from './PromoAnteriorTabla';
import { PromoMesTabla } from './PromoMesTabla';
import { RevisionTabla } from './RevisionTabla';
import { VentasTabla } from './VentasTabla';

type Paso = 'revision' | 'indicadores' | 'nomina' | 'cierre';

/**
 * Lo que se mira en el paso de revisión: las ventas por decidir, los días
 * promocionales del mes anterior y los del mes, las agregadas a mano, o todas.
 */
type Vista = 'revision' | 'promo_anterior' | 'promo' | 'manuales' | 'todas';

/** Las vistas que necesitan el detalle venta a venta, y de qué tramo. */
const TRAMO_DE: Partial<Record<Vista, TramoVenta>> = { promo_anterior: 'promo_anterior', promo: 'promo' };

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
  periodo, periodos, informe, error, propuesta, condiciones, cargos, puedeGestionar, puedeReabrir, archivos,
}: ComisionesInformeProps) {
  const c = useInformeComisiones(periodo, Boolean(informe));
  const editable = puedeGestionar && informe?.estado === 'borrador';
  const pendientesIndicadores = informe ? indicadoresPendientes(informe) : 0;

  const porConfirmar = informe?.resumen.promo_por_confirmar ?? 0;
  const porRevisar = (informe?.resumen.revision ?? 0) + porConfirmar;

  // Quien gestiona un borrador empieza por lo que falta; los demás, por la nómina.
  const pasoInicial: Paso = !editable || !informe ? 'nomina'
    : porRevisar > 0 ? 'revision'
      : pendientesIndicadores > 0 ? 'indicadores' : 'nomina';
  const [paso, setPaso] = useState<Paso>(pasoInicial);
  const [vista, setVista] = useState<Vista>(
    informe && !informe.resumen.revision && porConfirmar ? 'promo_anterior' : 'revision',
  );
  const [editandoPeriodo, setEditandoPeriodo] = useState(false);
  const [confirmando, setConfirmando] = useState<'cerrar' | null>(null);
  // Reabrir pide motivo y el periodo escrito a mano (ver `api_periodo_reabrir`).
  const [reapertura, setReapertura] = useState<{ motivo: string; confirmacion: string } | null>(null);
  const [desglose, setDesglose] = useState<PagoComision | null>(null);
  const [exportando, setExportando] = useState(false);

  const etiquetaCargo = (cargo: CargoVentas) => cargos.find((o) => o.value === cargo)?.label ?? cargo;
  const irA = (mes: string) => router.get('/comisiones/', { periodo: mes }, { preserveScroll: true });

  const verDesglose = (pago: PagoComision) => {
    setDesglose(pago);
    void c.cargarVentas();
  };
  const verVista = (v: Vista) => {
    setVista(v);
    if (v !== 'revision' && v !== 'manuales') void c.cargarVentas();
  };
  const tramoVista = TRAMO_DE[vista];
  const ventasDelTramo = useMemo(
    () => (tramoVista && c.ventas ? c.ventas.filter((v) => v.tramo === tramoVista) : []),
    [tramoVista, c.ventas],
  );
  // Al entrar directamente en una vista con detalle (lo primero por confirmar), se pide.
  useEffect(() => {
    if (paso === 'revision' && tramoVista) void c.cargarVentas();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paso, tramoVista]);

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
      await exportarInforme(informe, ventas, condiciones, tasa, etiquetaCargo);
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
      detalle: porRevisar ? `${porRevisar} sin decidir` : 'Nada por decidir',
      hecho: porRevisar === 0,
      pendiente: porRevisar > 0,
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
                <strong className="text-slate-200">{formatoFecha(diaAnterior(informe.inicio_promo))}</strong>
                {informe.corte_adelantos && (
                  <>
                    {' '}· del {formatoFecha(informe.inicio_promo)} al {formatoFecha(informe.fin)}, solo si adelantaron el pago
                    hasta el <strong className="text-slate-200">{formatoFecha(informe.corte_adelantos)}</strong>
                  </>
                )}
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
                  {vista === 'revision' && 'Lo que la primera mensualidad no resuelve: todas sus mensualidades están canceladas (¿exoneración?), no tiene ninguna, o pasó a plan gratuito con la mensualidad pagada. Cuéntala o no la cuentes; si no se cuenta, no se paga.'}
                  {vista === 'todas' && 'Cada venta instalada en el periodo, con su clasificación y quién cobra por ella.'}
                  {vista === 'promo_anterior' && `Lo instalado en los días promocionales de ${nombreMes(informe.anterior?.periodo ?? '')}: si ya se cobró allí o toca aquí.`}
                  {vista === 'promo' && `Lo instalado en los días promocionales de ${nombreMes(periodo)}: quién adelantó el pago y cuenta ya aquí.`}
                  {vista === 'manuales' && 'Las ventas agregadas a mano: cuentan en este periodo aunque las reglas no las recojan.'}
                  {' '}
                  <span className="text-slate-500">
                    {informe.resumen.candidatas} en el periodo · {informe.resumen.validas} válidas · {informe.resumen.no_pagadas} no pagadas ·{' '}
                    {informe.resumen.excluidas} excluidas
                    {informe.resumen.diferidas ? <> · {informe.resumen.diferidas} pasan a {nombreMes(mesSiguiente(periodo))}</> : null}
                    {informe.facturas_importadas_el && <> · facturas importadas el {formatoFecha(informe.facturas_importadas_el)}</>}
                  </span>
                </p>
                <div className="inline-flex flex-wrap rounded-xl border border-slate-700/50 bg-surface-primary p-1 text-xs font-bold">
                  {([
                    ['revision', `Por decidir · ${informe.revision.length}`, informe.resumen.revision > 0],
                    ...(informe.resumen.promo_anterior !== undefined ? [[
                      'promo_anterior',
                      `Días promo. ${nombreMes(informe.anterior?.periodo ?? '')} · ${porConfirmar ? `${porConfirmar} por confirmar` : informe.resumen.promo_anterior_revisar ?? 0}`,
                      porConfirmar > 0,
                    ] as const] : []),
                    ...(informe.resumen.promo !== undefined ? [[
                      'promo', `Días promo. ${nombreMes(periodo)} · ${informe.resumen.adelantadas ?? 0} adelantadas`, false,
                    ] as const] : []),
                    ...(informe.manuales ? [['manuales', `A mano · ${informe.manuales.length}`, false] as const] : []),
                    ['todas', 'Todas las ventas', false],
                  ] as const).map(([key, etiqueta, falta]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => verVista(key)}
                      className={`rounded-lg px-3 py-1.5 transition ${
                        vista === key ? 'bg-sky-500/15 text-sky-300 ring-1 ring-sky-500/40'
                          : falta ? 'text-amber-300 hover:text-white' : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      {etiqueta}
                    </button>
                  ))}
                </div>
              </div>
              {vista === 'revision' && (
                <RevisionTabla
                  ventas={informe.revision}
                  editable={editable}
                  guardando={c.guardando}
                  onDecidir={c.decidir}
                />
              )}
              {vista === 'manuales' && (
                <ManualesPanel
                  manuales={informe.manuales ?? []}
                  editable={editable}
                  guardando={c.guardando}
                  onAgregar={c.agregarManual}
                  onQuitar={(orden) => void c.quitarManual(orden)}
                />
              )}
              {(vista === 'todas' || tramoVista) && !c.ventas && <LoadingState message="Cargando ventas..." />}
              {vista === 'todas' && c.ventas && <VentasTabla ventas={c.ventas} />}
              {vista === 'promo_anterior' && c.ventas && (
                <PromoAnteriorTabla
                  informe={informe}
                  ventas={ventasDelTramo}
                  editable={editable}
                  guardando={c.guardando}
                  onDecidir={c.decidir}
                />
              )}
              {vista === 'promo' && c.ventas && <PromoMesTabla informe={informe} ventas={ventasDelTramo} />}
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
                  {puedeReabrir && (
                    <Button
                      variant="outline"
                      icon={<LockOpen className="h-4 w-4" />}
                      onClick={() => setReapertura({ motivo: '', confirmacion: '' })}
                    >
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
                      ['revision', 'Ventas por revisar y confirmar', porRevisar ? `${porRevisar} sin decidir` : null],
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
                  {informe.pendientes_cierre.length > 0 && (
                    <StatusMessage
                      status={{ type: 'warning', text: `Falta para cerrar: ${informe.pendientes_cierre.join(' · ')}.` }}
                      icon={<AlertTriangle />}
                    />
                  )}
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
              <CierresArchivados archivos={archivos} etiquetaCargo={etiquetaCargo} />
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
        isOpen={confirmando === 'cerrar'}
        onClose={() => setConfirmando(null)}
        title={`Cerrar ${periodo}`}
        subtitle="El informe queda congelado tal y como se ve ahora"
        icon={<Lock className="h-5 w-5 text-emerald-400" />}
        theme="green"
        size="sm"
      >
        <div className="space-y-5">
          <p className="text-sm text-slate-300">
            {`Se pagan ${formatoMonto(totalUsd)}${tasa !== null ? ` (${formatoBs(totalBsPago)})` : ''} a ${cobran} personas. Se guardan las ventas, los pagos y las condiciones de hoy, y sus ventas válidas no volverán a contar en ningún otro periodo.`}
          </p>
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setConfirmando(null)}>Cancelar</Button>
            <Button
              isLoading={c.guardando}
              onClick={async () => {
                if (await c.cerrar()) setConfirmando(null);
              }}
            >
              Cerrar periodo
            </Button>
          </div>
        </div>
      </Modal>

      {/* Reabrir deshace una nómina cerrada: el cierre se archiva (ver
          `CierresArchivados`), pero se pide el motivo y el periodo escrito a
          mano, que el servidor vuelve a comprobar. */}
      <Modal
        isOpen={Boolean(reapertura)}
        onClose={() => setReapertura(null)}
        title={`Reabrir ${periodo}`}
        subtitle="Vuelve a borrador y se recalcula con los datos de hoy"
        icon={<LockOpen className="h-5 w-5 text-amber-400" />}
        theme="yellow"
        size="md"
      >
        {reapertura && (
          <form
            className="space-y-5"
            onSubmit={async (e) => {
              e.preventDefault();
              if (await c.reabrir(reapertura.motivo.trim(), reapertura.confirmacion.trim())) setReapertura(null);
            }}
          >
            <StatusMessage
              status={{
                type: 'warning',
                text: `Se deshace el cierre: ${formatoMonto(totalUsd)} a ${cobran} personas. Queda archivado como versión ${archivos.length + 1} y el periodo se recalculará con las suscripciones de hoy, que pueden no ser las del cierre.`,
              }}
              icon={<ShieldAlert />}
            />
            <TextField
              label="Motivo de la reapertura"
              required
              minLength={10}
              maxLength={500}
              placeholder="Qué hay que corregir y quién lo pidió"
              value={reapertura.motivo}
              onChange={(e) => setReapertura({ ...reapertura, motivo: e.target.value })}
            />
            <TextField
              label={`Escribe ${periodo} para confirmar`}
              required
              autoComplete="off"
              placeholder={periodo}
              value={reapertura.confirmacion}
              onChange={(e) => setReapertura({ ...reapertura, confirmacion: e.target.value })}
            />
            {c.error && <StatusMessage status={{ type: 'error', text: c.error }} icon={<AlertTriangle />} />}
            <div className="flex justify-end gap-3">
              <Button type="button" variant="outline" onClick={() => setReapertura(null)}>Cancelar</Button>
              <Button
                type="submit"
                variant="danger"
                isLoading={c.guardando}
                disabled={reapertura.motivo.trim().length < 10 || reapertura.confirmacion.trim() !== periodo}
              >
                Reabrir y archivar el cierre
              </Button>
            </div>
          </form>
        )}
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
