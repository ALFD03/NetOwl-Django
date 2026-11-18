/** Comisiones › Informe: lo que cobra cada persona en un periodo. */

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useOnOpen } from '@/shared/hooks/useOnOpen';
import {
  AlertTriangle, CalendarRange, Check, FileSpreadsheet, HandCoins, ListChecks, Lock, LockOpen, Percent, Receipt,
  ShieldAlert, Trash2,
} from 'lucide-react';

import { AppLayout } from '@/shared/layout/AppLayout';
import {
  ActionMessage, Button, EmptyState, ExportButton, LoadingState, Modal, MonthPicker, NeonContainer, SelectMenu, StatusMessage, TextField,
} from '@/shared/ui';
import { useCommissionsReport } from '../hooks/useCommissionsReport';
import { exportReport } from '../lib/export';
import { bonusNotes, paymentSales } from '../lib/payroll';
import {
  aBs, previousDay, formatBs, formatDateValue, formatMonth, formatAmount, formatRate, nextMonth, monthName, totalBs,
} from '../lib/format';
import type { CommissionsReportProps, CommissionReport, CommissionPayment, SalesRole, SaleTier } from '../types';
import { ArchivedCloses } from './ArchivedCloses';
import { IndicatorsPanel } from './IndicatorsPanel';
import { ManualSalesPanel } from './ManualSalesPanel';
import { PayrollView } from './PayrollView';
import { PeriodForm } from './PeriodForm';
import { ROL_CHIP } from './pieces';
import { PreviousPromoTable } from './PreviousPromoTable';
import { MonthPromoTable } from './MonthPromoTable';
import { ReviewTable } from './ReviewTable';
import { SalesTable } from './SalesTable';
import { useVisit } from '@/shared/page/PageData';

type Paso = 'revision' | 'indicadores' | 'nomina' | 'cierre';

/**
 * Lo que se mira en el paso de revisión: las ventas por decidir, los días
 * promocionales del mes anterior y los del mes, las agregadas a mano, o todas.
 */
type View = 'revision' | 'promo_anterior' | 'promo' | 'manuales' | 'todas';

/** Las vistas que necesitan el detalle venta a venta, y de qué tramo. */
const TIER_OF: Partial<Record<View, SaleTier>> = { promo_anterior: 'promo_anterior', promo: 'promo' };

/** Cuántos % faltan: lo mismo que el servidor exige para cerrar. */
function pendingIndicatorList(informe: CommissionReport): number {
  const pago = (f: { person_id: number; equipo: string }) =>
    informe.payments.find((p) => p.person_id === f.person_id && p.equipo === f.equipo);
  const withoutCompliance = informe.indicators.factors.filter((f) => f.value === null && (pago(f)?.gross ?? 0) > 0).length;
  const withoutGrowth = informe.indicators.growths.filter((c) => c.value === null && (pago(c)?.team_sales ?? 0) > 0).length;
  return withoutCompliance + withoutGrowth;
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
export function ReportView({
  period, periods, report, error, proposal, conditions, teams, canManage, canReopen, canDelete, archives,
}: CommissionsReportProps) {
  const visit = useVisit();
  const c = useCommissionsReport(period, Boolean(report));
  const editable = canManage && report?.status === 'borrador';
  const pendingIndicators = report ? pendingIndicatorList(report) : 0;

  const toConfirm = report?.summary.promo_to_confirm ?? 0;
  const toReview = (report?.summary.review ?? 0) + toConfirm;

  // Quien gestiona un borrador empieza por lo que falta; los demás, por la nómina.
  const initialStep: Paso = !editable || !report ? 'nomina'
    : toReview > 0 ? 'revision'
      : pendingIndicators > 0 ? 'indicadores' : 'nomina';
  const [paso, setPaso] = useState<Paso>(initialStep);
  const [vista, setVista] = useState<View>(
    report && !report.summary.review && toConfirm ? 'promo_anterior' : 'revision',
  );
  const [editingPeriod, setEditingPeriod] = useState(false);
  const [confirmando, setConfirmando] = useState<'cerrar' | null>(null);
  // Reabrir pide motivo y el periodo escrito a mano (ver `api_periodo_reabrir`).
  const [reapertura, setReapertura] = useState<{ reason: string; confirmation: string } | null>(null);
  // Borrar pide el periodo escrito a mano (ver `api_periodo_borrar`).
  const [borrado, setBorrado] = useState<{ confirmation: string } | null>(null);
  // Solo un borrador que nunca se cerró: un cierre archivado es historial de lo pagado.
  const existente = periods.find((p) => p.period === period);
  const borrable = existente?.status === 'borrador' && archives.length === 0;
  const [desglose, setDesglose] = useState<CommissionPayment | null>(null);
  // Abrir un formulario empieza de cero: el error que hubiera es de la acción anterior.
  const formOpen = editingPeriod || Boolean(confirmando || reapertura || borrado);
  useOnOpen(formOpen, () => c.setError(null));
  const [exportando, setExportando] = useState(false);

  const etiquetaCargo = (rol: SalesRole) => ROL_CHIP[rol].label;
  const irA = (mes: string) => visit({ period: mes }, { remount: true });

  const verDesglose = (pago: CommissionPayment) => {
    setDesglose(pago);
    void c.cargarVentas();
  };
  const showView = (v: View) => {
    setVista(v);
    if (v !== 'revision' && v !== 'manuales') void c.cargarVentas();
  };
  const viewedTier = TIER_OF[vista];
  const tierSales = useMemo(
    () => (viewedTier && c.ventas ? c.ventas.filter((v) => v.tier === viewedTier) : []),
    [viewedTier, c.ventas],
  );
  // Al entrar directamente en una vista con detalle (lo primero por confirmar), se pide.
  useEffect(() => {
    if (paso === 'revision' && viewedTier) void c.cargarVentas();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paso, viewedTier]);

  const breakdownSales = useMemo(() => {
    if (!desglose || !c.ventas) return [];
    return paymentSales(desglose, c.ventas, conditions);
  }, [desglose, c.ventas, conditions]);

  // La de pago es la de CONATEL del mes siguiente; la de hoy, solo una referencia.
  // `?.` por los periodos cerrados antes de que el informe llevara tasa.
  const tasa = report?.conatel_rate?.rate ?? null;

  const exportFile = async () => {
    if (!report) return;
    setExportando(true);
    try {
      const ventas = c.ventas ?? (await c.cargarVentas()) ?? [];
      await exportReport(report, ventas, conditions, tasa, etiquetaCargo, undefined, teams);
    } catch {
      c.setError('No se pudo generar el Excel del informe.');
    } finally {
      setExportando(false);
    }
  };

  const totalUsd = Math.round((report?.payments ?? []).reduce((t, p) => t + p.net, 0) * 100) / 100;
  const paymentTotalBs = totalBs((report?.payments ?? []).map((p) => p.net), tasa);
  const cobran = (report?.payments ?? []).filter((p) => p.net > 0).length;

  const periodOptions = periods.map((p) => ({
    value: p.period,
    label: `${p.period} · ${p.status === 'cerrado' ? 'cerrado' : 'borrador'}`,
  }));

  const pasos: { key: Paso; titulo: string; detail: string; hecho: boolean; pendiente: boolean; icono: ReactNode }[] = report ? [
    {
      key: 'revision',
      titulo: 'Revisar ventas',
      detail: toReview ? `${toReview} sin decidir` : 'Nada por decidir',
      hecho: toReview === 0,
      pendiente: toReview > 0,
      icono: <ListChecks className="h-4 w-4" />,
    },
    {
      key: 'indicadores',
      titulo: 'Indicadores',
      detail: pendingIndicators ? `${pendingIndicators} % sin definir` : 'Cumplimiento y crecimiento',
      hecho: pendingIndicators === 0,
      pendiente: pendingIndicators > 0,
      icono: <Percent className="h-4 w-4" />,
    },
    {
      key: 'nomina',
      titulo: 'Nómina',
      detail: `${formatAmount(totalUsd)} · ${cobran} ${cobran === 1 ? 'persona' : 'personas'}`,
      hecho: false,
      pendiente: false,
      icono: <HandCoins className="h-4 w-4" />,
    },
    {
      key: 'cierre',
      titulo: report.status === 'cerrado' ? 'Cerrado' : 'Cerrar',
      detail: report.status === 'cerrado' ? 'Congelado tal como se ve' : report.close_blockers.length ? 'Falta completar' : 'Listo para cerrar',
      hecho: report.status === 'cerrado',
      pendiente: false,
      icono: <Lock className="h-4 w-4" />,
    },
  ] : [];

  return (
    <AppLayout
      toolbar={
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-slate-800 bg-surface-secondary p-4 shadow-xl">
          <div className="flex flex-wrap items-center gap-3">
            {periodOptions.length > 0 && (
              <SelectMenu
                aria-label="Periodo"
                className="w-56"
                value={periods.some((p) => p.period === period) ? period : ''}
                placeholder="Periodo"
                options={periodOptions}
                onChange={irA}
              />
            )}
            {canManage && <MonthPicker className="w-40" value={period} onChange={irA} placeholder="Otro mes" />}
            {report && (
              <span className="text-xs text-slate-400">
                Instalaciones del <strong className="text-slate-200">{formatDateValue(report.start)}</strong> al{' '}
                <strong className="text-slate-200">{formatDateValue(previousDay(report.promo_start))}</strong>
                {report.advance_cutoff && (
                  <>
                    {' '}· del {formatDateValue(report.promo_start)} al {formatDateValue(report.end)}, solo si adelantaron el pago
                    · corte de pagos: <strong className="text-slate-200">{formatDateValue(report.advance_cutoff)}</strong>
                  </>
                )}
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {report && (
              <ExportButton
                onClick={() => void exportFile()}
                estado={exportando ? 'busy' : 'idle'}
                label="Exportar"
                icon={<FileSpreadsheet className="h-4 w-4" />}
              />
            )}
            {editable && (
              <Button variant="outline" icon={<CalendarRange className="h-4 w-4" />} onClick={() => setEditingPeriod(true)}>
                Días promocionales
              </Button>
            )}
            {canDelete && existente?.status === 'borrador' && (
              <Button
                variant="danger"
                icon={<Trash2 className="h-4 w-4" />}
                onClick={() => {
                  c.setError(null);
                  setBorrado({ confirmation: '' });
                }}
              >
                Borrar informe
              </Button>
            )}
          </div>
        </div>
      }
    >
      <ActionMessage status={c.error ? { type: 'error', text: c.error } : null} className="mb-4" icon={<AlertTriangle />} />
      <StatusMessage status={error ? { type: 'error', text: error } : null} className="mb-4" icon={<AlertTriangle />} />

      {!report && !error && (
        <NeonContainer title={`Periodo ${period}`} subtitle="Todavía no tiene periodo de comisiones" icon={<HandCoins className="h-5 w-5" />} theme="slate">
          <EmptyState
            title="Sin periodo"
            description={
              canManage
                ? 'Crea el periodo confirmando dónde empezaron los días promocionales: es lo que fija qué instalaciones cuentan.'
                : 'Nadie ha creado todavía el periodo de este mes.'
            }
            icon={<CalendarRange />}
            action={canManage ? (
              <Button icon={<CalendarRange className="h-4 w-4" />} onClick={() => setEditingPeriod(true)}>
                Crear periodo
              </Button>
            ) : undefined}
          />
        </NeonContainer>
      )}

      {report && (
        <div className="overflow-clip rounded-3xl border border-slate-800 bg-surface-secondary shadow-xl">
          {/* Lo que hay que pagar: lo primero que se lee. */}
          <div className="flex flex-wrap items-end justify-between gap-6 bg-gradient-to-br from-emerald-500/[0.07] via-transparent to-transparent px-6 py-5">
            <div>
              <p className="flex items-center gap-2 text-[11px] font-black uppercase tracking-wider text-emerald-300">
                <HandCoins className="h-4 w-4" />
                Total a pagar · comisiones de {formatMonth(period)}
                <span
                  className={`ml-2 rounded-full border px-2 py-0.5 text-[10px] ${
                    report.status === 'cerrado'
                      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                      : 'border-amber-500/30 bg-amber-500/10 text-amber-300'
                  }`}
                >
                  {report.status === 'cerrado' ? 'Cerrado' : 'Borrador'}
                </span>
              </p>
              <div className="mt-2 flex flex-wrap items-baseline gap-x-6 gap-y-1">
                <p className="font-mono text-4xl font-black tabular-nums text-white">{formatAmount(totalUsd)}</p>
                <p className="font-mono text-2xl font-black tabular-nums text-emerald-300">{tasa === null ? 'Bs —' : formatBs(paymentTotalBs)}</p>
              </div>
              <p className="mt-1.5 text-xs text-slate-400">
                <strong className="text-white">{cobran}</strong> {cobran === 1 ? 'persona cobra' : 'personas cobran'} ·{' '}
                <strong className="text-white">{report.summary.valid}</strong> ventas validadas
                {report.summary.valid_plan_change > 0 && <> · {report.summary.valid_plan_change} por cambio de plan</>}
              </p>
            </div>
            <div className="border-l border-slate-700/70 pl-5 text-right">
              <p className="text-[10px] font-black uppercase tracking-wider text-emerald-300">
                Tasa de pago · CONATEL {report.conatel_rate ? formatMonth(report.conatel_rate.month) : ''}
              </p>
              <p className="mt-0.5 font-mono text-xl font-black tabular-nums text-white">{formatRate(tasa)}</p>
              <p className="text-[11px] text-slate-500">
                {tasa !== null ? report.conatel_rate.source : report.conatel_rate?.warning || 'Sin tasa'}
              </p>
              <p className="mt-1 text-[11px] text-slate-500" title="Solo como referencia: no se usa para pagar">
                Hoy {c.tasaHoy ? formatRate(c.tasaHoy.rate) : '…'} · solo referencia
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
                    <span className={`block truncate text-xs ${p.pendiente ? 'text-amber-300' : 'text-slate-400'}`}>{p.detail}</span>
                  </span>
                </button>
              );
            })}
          </nav>

          {paso === 'revision' && (
            <div>
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 px-5 py-3">
                <p className="max-w-3xl text-xs text-slate-400">
                  {vista === 'revision' && 'Lo que la primera mensualidad no resuelve: pasó a plan gratuito con la mensualidad pagada, o todas sus mensualidades se cancelaron a menos de 20 días de emitidas. Cuéntala o no la cuentes; si no se cuenta, no se paga.'}
                  {vista === 'todas' && 'Cada venta instalada en el periodo, con su clasificación y quién cobra por ella.'}
                  {vista === 'promo_anterior' && `Lo instalado en los días promocionales de ${monthName(report.previous?.period ?? '')}: si ya se cobró allí o toca aquí.`}
                  {vista === 'promo' && `Lo instalado en los días promocionales de ${monthName(period)}: quién adelantó el pago y cuenta ya aquí.`}
                  {vista === 'manuales' && 'Las ventas agregadas a mano: cuentan en este periodo aunque las reglas no las recojan.'}
                  {' '}
                  <span className="text-slate-500">
                    {report.summary.candidates} en el periodo · {report.summary.valid} válidas · {report.summary.unpaid} no pagadas ·{' '}
                    {report.summary.excluded} excluidas
                    {report.summary.deferred ? <> · {report.summary.deferred} pasan a {monthName(nextMonth(period))}</> : null}
                    {report.invoices_imported_at && <> · facturas importadas el {formatDateValue(report.invoices_imported_at)}</>}
                  </span>
                </p>
                <div className="inline-flex flex-wrap rounded-xl border border-slate-700/50 bg-surface-primary p-1 text-xs font-bold">
                  {([
                    ['revision', `Por decidir · ${report.review.length}`, report.summary.review > 0],
                    ...(report.summary.previous_promo !== undefined ? [[
                      'promo_anterior',
                      `Días promo. ${monthName(report.previous?.period ?? '')} · ${toConfirm ? `${toConfirm} por confirmar` : report.summary.previous_promo_review ?? 0}`,
                      toConfirm > 0,
                    ] as const] : []),
                    ...(report.summary.promo !== undefined ? [[
                      'promo', `Días promo. ${monthName(period)} · ${report.summary.advanced ?? 0} adelantadas`, false,
                    ] as const] : []),
                    ...(report.manual_sales ? [['manuales', `A mano · ${report.manual_sales.length}`, false] as const] : []),
                    ['todas', 'Todas las ventas', false],
                  ] as const).map(([key, etiqueta, falta]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => showView(key)}
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
                <ReviewTable
                  sales={report.review}
                  editable={editable}
                  guardando={c.guardando}
                  onDecidir={c.decidir}
                />
              )}
              {vista === 'manuales' && (
                <ManualSalesPanel
                  manual_sales={report.manual_sales ?? []}
                  editable={editable}
                  guardando={c.guardando}
                  onAgregar={c.agregarManual}
                  onQuitar={(orden) => void c.quitarManual(orden)}
                />
              )}
              {(vista === 'todas' || viewedTier) && !c.ventas && <LoadingState message="Cargando ventas..." />}
              {vista === 'todas' && c.ventas && <SalesTable sales={c.ventas} />}
              {vista === 'promo_anterior' && c.ventas && (
                <PreviousPromoTable
                  report={report}
                  sales={tierSales}
                  editable={editable}
                  guardando={c.guardando}
                  onDecidir={c.decidir}
                />
              )}
              {vista === 'promo' && c.ventas && <MonthPromoTable report={report} sales={tierSales} />}
            </div>
          )}

          {paso === 'indicadores' && (
            <div className="p-5">
              <IndicatorsPanel
                report={report}
                editable={editable}
                onCompliance={(id, valor) => void c.guardarCumplimiento(id, valor)}
                onGrowth={(id, valor) => void c.guardarCrecimiento(id, valor)}
              />
            </div>
          )}

          {paso === 'nomina' && (
            <PayrollView
              report={report}
              teams={teams}
              conditions={conditions}
              rate={tasa}
              onViewPerson={verDesglose}
              onEditIndicators={editable ? () => setPaso('indicadores') : null}
            />
          )}

          {paso === 'cierre' && (
            <div className="space-y-4 p-5">
              {report.status === 'cerrado' ? (
                <>
                  <StatusMessage
                    status={{ type: 'success', text: 'Periodo cerrado: las ventas, los pagos y las condiciones quedaron congelados tal como se ven.' }}
                    icon={<Lock />}
                  />
                  {canReopen && (
                    <Button
                      variant="outline"
                      icon={<LockOpen className="h-4 w-4" />}
                      onClick={() => setReapertura({ reason: '', confirmation: '' })}
                    >
                      Reabrir
                    </Button>
                  )}
                </>
              ) : (
                <>
                  {report.too_early && (
                    <StatusMessage
                      status={{
                        type: 'warning',
                        text: `Todavía no es ${formatDateValue(report.compute_from)}: algunas primeras facturas pueden no estar pagadas aún, y esas ventas salen como no pagadas.`,
                      }}
                      icon={<AlertTriangle />}
                    />
                  )}
                  <div className="grid gap-3 md:grid-cols-2">
                    {([
                      ['revision', 'Ventas por revisar y confirmar', toReview ? `${toReview} sin decidir` : null],
                      ['indicadores', 'Cumplimientos y crecimientos', pendingIndicators ? `${pendingIndicators} sin definir` : null],
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
                  {report.close_blockers.length > 0 && (
                    <StatusMessage
                      status={{ type: 'warning', text: `Falta para cerrar: ${report.close_blockers.join(' · ')}.` }}
                      icon={<AlertTriangle />}
                    />
                  )}
                  <p className="max-w-3xl text-sm text-slate-300">
                    Cerrar guarda las ventas, los pagos y las condiciones de hoy. Sus ventas válidas no volverán a contar en ningún otro
                    periodo, y el informe deja de recalcularse.
                  </p>
                  {editable && (
                    <Button icon={<Lock className="h-4 w-4" />} onClick={() => setConfirmando('cerrar')} disabled={report.close_blockers.length > 0}>
                      Cerrar periodo
                    </Button>
                  )}
                </>
              )}
              <ArchivedCloses archives={archives} roleLabel={etiquetaCargo} />
            </div>
          )}
        </div>
      )}

      <Modal
        isOpen={editingPeriod}
        onClose={() => setEditingPeriod(false)}
        title={report ? `Días promocionales de ${period}` : `Crear el periodo ${period}`}
        subtitle="Dónde se corta el periodo de comisiones"
        icon={<CalendarRange className="h-5 w-5 text-sky-400" />}
        theme="blue"
        size="md"
      >
        <PeriodForm
          proposal={proposal}
          guardando={c.guardando}
          onSave={async (body) => { if (await c.guardarPeriodo(body)) setEditingPeriod(false); }}
          onClose={() => setEditingPeriod(false)}
        />
      </Modal>

      <Modal
        isOpen={confirmando === 'cerrar'}
        onClose={() => setConfirmando(null)}
        title={`Cerrar ${period}`}
        subtitle="El informe queda congelado tal y como se ve ahora"
        icon={<Lock className="h-5 w-5 text-emerald-400" />}
        theme="green"
        size="sm"
      >
        <div className="space-y-5">
          <p className="text-sm text-slate-300">
            {`Se pagan ${formatAmount(totalUsd)}${tasa !== null ? ` (${formatBs(paymentTotalBs)})` : ''} a ${cobran} personas. Se guardan las ventas, los pagos y las condiciones de hoy, y sus ventas válidas no volverán a contar en ningún otro periodo.`}
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
          `ArchivedCloses`), pero se pide el motivo y el periodo escrito a
          mano, que el servidor vuelve a comprobar. */}
      <Modal
        isOpen={Boolean(reapertura)}
        onClose={() => setReapertura(null)}
        title={`Reabrir ${period}`}
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
              if (await c.reabrir(reapertura.reason.trim(), reapertura.confirmation.trim())) setReapertura(null);
            }}
          >
            <StatusMessage
              status={{
                type: 'warning',
                text: `Se deshace el cierre: ${formatAmount(totalUsd)} a ${cobran} personas. Queda archivado como versión ${archives.length + 1} y el periodo se recalculará con las suscripciones de hoy, que pueden no ser las del cierre.`,
              }}
              icon={<ShieldAlert />}
            />
            <TextField
              label="Motivo de la reapertura"
              required
              minLength={10}
              maxLength={500}
              placeholder="Qué hay que corregir y quién lo pidió"
              value={reapertura.reason}
              onChange={(e) => setReapertura({ ...reapertura, reason: e.target.value })}
            />
            <TextField
              label={`Escribe ${period} para confirmar`}
              required
              autoComplete="off"
              placeholder={period}
              value={reapertura.confirmation}
              onChange={(e) => setReapertura({ ...reapertura, confirmation: e.target.value })}
            />
            <div className="flex justify-end gap-3">
              <Button type="button" variant="outline" onClick={() => setReapertura(null)}>Cancelar</Button>
              <Button
                type="submit"
                variant="danger"
                isLoading={c.guardando}
                disabled={reapertura.reason.trim().length < 10 || reapertura.confirmation.trim() !== period}
              >
                Reabrir y archivar el cierre
              </Button>
            </div>
          </form>
        )}
      </Modal>

      {/* Borrar no se deshace: se lleva lo decidido en el periodo. Se pide el
          periodo escrito a mano, que el servidor vuelve a comprobar. */}
      <Modal
        isOpen={Boolean(borrado)}
        onClose={() => setBorrado(null)}
        title={`Borrar el informe ${period}`}
        subtitle="Esta acción no se puede deshacer"
        icon={<Trash2 className="h-5 w-5 text-rose-400" />}
        theme="red"
        size="md"
      >
        {borrado && (
          <form
            className="space-y-5"
            onSubmit={async (e) => {
              e.preventDefault();
              if (await c.borrar(borrado.confirmation.trim())) setBorrado(null);
            }}
          >
            {borrable ? (
              <StatusMessage
                status={{
                  type: 'error',
                  text: `Se borra el periodo ${period} con todo lo decidido en él: las ventas revisadas, las confirmadas de los días promocionales, las agregadas a mano y los cumplimientos y crecimientos escritos. No queda copia: para volver a tenerlo habrá que crearlo y decidirlo todo de nuevo.`,
                }}
                icon={<ShieldAlert />}
              />
            ) : (
              <StatusMessage
                status={{
                  type: 'warning',
                  text: `El periodo ${period} se cerró antes y tiene cierres archivados: son el historial de lo que se pagó y no se pueden borrar.`,
                }}
                icon={<Lock />}
              />
            )}
            <TextField
              label={`Escribe ${period} para confirmar`}
              required
              autoComplete="off"
              placeholder={period}
              disabled={!borrable}
              value={borrado.confirmation}
              onChange={(e) => setBorrado({ confirmation: e.target.value })}
            />
            <div className="flex justify-end gap-3">
              <Button type="button" variant="outline" onClick={() => setBorrado(null)}>Cancelar</Button>
              <Button
                type="submit"
                variant="danger"
                icon={<Trash2 className="h-4 w-4" />}
                isLoading={c.guardando}
                disabled={!borrable || borrado.confirmation.trim() !== period}
              >
                Borrar definitivamente
              </Button>
            </div>
          </form>
        )}
      </Modal>

      <Modal
        isOpen={Boolean(desglose)}
        onClose={() => setDesglose(null)}
        title={desglose?.name ?? ''}
        subtitle={
          desglose
            ? `${etiquetaCargo(desglose.role)} · ${desglose.team_name} · ${desglose.own_sales + desglose.team_sales + desglose.sme_sales} ventas validadas · ${formatAmount(desglose.net)}${
              tasa !== null ? ` · ${formatBs(aBs(desglose.net, tasa))}` : ''
            } a pagar`
            : ''
        }
        icon={<Receipt className="h-5 w-5 text-emerald-400" />}
        theme="green"
      >
        {desglose && (
          <div className="space-y-4">
            {desglose.warnings.length > 0 && (
              <StatusMessage status={{ type: 'warning', text: desglose.warnings.join(' · ') }} icon={<AlertTriangle />} />
            )}
            {bonusNotes(desglose).length > 0 && (
              <p className="text-xs text-slate-400">
                Bonos: {bonusNotes(desglose).map((b) => <strong key={b} className="mr-3 text-amber-400">{b}</strong>)}
              </p>
            )}
            {c.ventas ? <SalesTable sales={breakdownSales} /> : <LoadingState message="Cargando ventas..." />}
          </div>
        )}
      </Modal>
    </AppLayout>
  );
}
