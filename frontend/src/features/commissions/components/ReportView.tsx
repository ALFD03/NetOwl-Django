/** Comisiones › Informe: lo que cobra cada persona en un periodo. */

import { useEffect, useMemo, useState } from 'react';
import { useOnOpen } from '@/shared/hooks/useOnOpen';
import {
  AlertTriangle, CalendarRange, FileSpreadsheet, HandCoins, ListChecks, Lock, Percent, Trash2 } from 'lucide-react';

import { AppLayout } from '@/shared/layout/AppLayout';
import {
  ActionMessage, Button, EmptyState, ExportButton, LoadingState, Modal, MonthPicker, NeonContainer, SelectMenu, StatusMessage } from '@/shared/ui';
import { useCommissionsReport } from '../hooks/useCommissionsReport';
import { exportReport } from '../lib/export';
import { paymentSales } from '../lib/payroll';
import {
  previousDay, formatDateValue, formatAmount, nextMonth, monthName, totalBs } from '../lib/format';
import type { CommissionsReportProps, CommissionReport, CommissionPayment, SalesRole, SaleTier } from '../types';
import { IndicatorsPanel } from './IndicatorsPanel';
import { ManualSalesPanel } from './ManualSalesPanel';
import { PayrollView } from './PayrollView';
import { PeriodForm } from './PeriodForm';
import { CHIP_ROLE } from './pieces';
import { PreviousPromoTable } from './PreviousPromoTable';
import { MonthPromoTable } from './MonthPromoTable';
import { ReviewTable } from './ReviewTable';
import { SalesTable } from './SalesTable';
import { useVisit } from '@/shared/page/PageData';
import { ClosePeriodModal, DeleteDraftModal, PaymentBreakdownModal, ReopenPeriodModal } from './ReportModals';
import { PaymentTotal, ReportStepsNav, type ReportStep } from './ReportHeader';
import { CloseStep } from './CloseStep';

type Step = 'revision' | 'indicadores' | 'nomina' | 'cierre';

/**
 * Lo que se mira en el paso de revisión: las ventas por decidir, los días
 * promocionales del mes anterior y los del mes, las agregadas a mano, o todas.
 */
type View = 'revision' | 'promo_anterior' | 'promo' | 'manuales' | 'todas';

/** Las vistas que necesitan el detalle venta a venta, y de qué tramo. */
const TIER_OF: Partial<Record<View, SaleTier>> = { promo_anterior: 'promo_anterior', promo: 'promo' };

/** Cuántos % faltan: lo mismo que el servidor exige para cerrar. */
function pendingIndicatorList(report: CommissionReport): number {
  const payment = (f: { person_id: number; equipo: string }) =>
    report.payments.find((p) => p.person_id === f.person_id && p.equipo === f.equipo);
  const withoutCompliance = report.indicators.factors.filter((f) => f.value === null && (payment(f)?.gross ?? 0) > 0).length;
  const withoutGrowth = report.indicators.growths.filter((c) => c.value === null && (payment(c)?.team_sales ?? 0) > 0).length;
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
  const initialStep: Step = !editable || !report ? 'nomina'
    : toReview > 0 ? 'revision'
      : pendingIndicators > 0 ? 'indicadores' : 'nomina';
  const [step, setStep] = useState<Step>(initialStep);
  const [view, setView] = useState<View>(
    report && !report.summary.review && toConfirm ? 'promo_anterior' : 'revision',
  );
  const [editingPeriod, setEditingPeriod] = useState(false);
  const [confirming, setConfirming] = useState<'cerrar' | null>(null);
  // Reabrir pide motivo y el periodo escrito a mano (ver `api_periodo_reabrir`).
  const [reopening, setReopening] = useState<{ reason: string; confirmation: string } | null>(null);
  // Borrar pide el periodo escrito a mano (ver `api_periodo_borrar`).
  const [deleted, setDeleted] = useState<{ confirmation: string } | null>(null);
  // Solo un borrador que nunca se cerró: un cierre archivado es historial de lo pagado.
  const existing = periods.find((p) => p.period === period);
  const deletable = existing?.status === 'borrador' && archives.length === 0;
  const [breakdown, setBreakdown] = useState<CommissionPayment | null>(null);
  // Abrir un formulario empieza de cero: el error que hubiera es de la acción anterior.
  const formOpen = editingPeriod || Boolean(confirming || reopening || deleted);
  useOnOpen(formOpen, () => c.setError(null));
  const [exporting, setExporting] = useState(false);

  const titleLabel = (role: SalesRole) => CHIP_ROLE[role].label;
  const goToMonth = (month: string) => visit({ period: month }, { remount: true });

  const viewBreakdown = (payment: CommissionPayment) => {
    setBreakdown(payment);
    void c.loadSales();
  };
  const showView = (v: View) => {
    setView(v);
    if (v !== 'revision' && v !== 'manuales') void c.loadSales();
  };
  const viewedTier = TIER_OF[view];
  const tierSales = useMemo(
    () => (viewedTier && c.sales ? c.sales.filter((v) => v.tier === viewedTier) : []),
    [viewedTier, c.sales],
  );
  // Al entrar directamente en una vista con detalle (lo primero por confirmar), se pide.
  useEffect(() => {
    if (step === 'revision' && viewedTier) void c.loadSales();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al entrar en la vista: con `loadSales` en las dependencias, una carga fallida se reintentaría en bucle.
  }, [step, viewedTier]);

  const breakdownSales = useMemo(() => {
    if (!breakdown || !c.sales) return [];
    return paymentSales(breakdown, c.sales, conditions);
  }, [breakdown, c.sales, conditions]);

  // La de pago es la de CONATEL del mes siguiente; la de hoy, solo una referencia.
  // `?.` por los periodos cerrados antes de que el informe llevara tasa.
  const rate = report?.conatel_rate?.rate ?? null;

  const exportFile = async () => {
    if (!report) return;
    setExporting(true);
    try {
      const sales = c.sales ?? (await c.loadSales()) ?? [];
      await exportReport(report, sales, conditions, rate, titleLabel, undefined, teams);
    } catch {
      c.setError('No se pudo generar el Excel del informe.');
    } finally {
      setExporting(false);
    }
  };

  const totalUsd = Math.round((report?.payments ?? []).reduce((t, p) => t + p.net, 0) * 100) / 100;
  const paymentTotalBs = totalBs((report?.payments ?? []).map((p) => p.net), rate);
  const paidCount = (report?.payments ?? []).filter((p) => p.net > 0).length;

  const periodOptions = periods.map((p) => ({
    value: p.period,
    label: `${p.period} · ${p.status === 'cerrado' ? 'cerrado' : 'borrador'}`,
  }));

  const steps: ReportStep<Step>[] = report ? [
    {
      key: 'revision',
      title: 'Revisar ventas',
      detail: toReview ? `${toReview} sin decidir` : 'Nada por decidir',
      done: toReview === 0,
      pending: toReview > 0,
      icon: <ListChecks className="h-4 w-4" />,
    },
    {
      key: 'indicadores',
      title: 'Indicadores',
      detail: pendingIndicators ? `${pendingIndicators} % sin definir` : 'Cumplimiento y crecimiento',
      done: pendingIndicators === 0,
      pending: pendingIndicators > 0,
      icon: <Percent className="h-4 w-4" />,
    },
    {
      key: 'nomina',
      title: 'Nómina',
      detail: `${formatAmount(totalUsd)} · ${paidCount} ${paidCount === 1 ? 'persona' : 'personas'}`,
      done: false,
      pending: false,
      icon: <HandCoins className="h-4 w-4" />,
    },
    {
      key: 'cierre',
      title: report.status === 'cerrado' ? 'Cerrado' : 'Cerrar',
      detail: report.status === 'cerrado' ? 'Congelado tal como se ve' : report.close_blockers.length ? 'Falta completar' : 'Listo para cerrar',
      done: report.status === 'cerrado',
      pending: false,
      icon: <Lock className="h-4 w-4" />,
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
                onChange={goToMonth}
              />
            )}
            {canManage && <MonthPicker className="w-40" value={period} onChange={goToMonth} placeholder="Otro mes" />}
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
                state={exporting ? 'busy' : 'idle'}
                label="Exportar"
                icon={<FileSpreadsheet className="h-4 w-4" />}
              />
            )}
            {editable && (
              <Button variant="outline" icon={<CalendarRange className="h-4 w-4" />} onClick={() => setEditingPeriod(true)}>
                Días promocionales
              </Button>
            )}
            {canDelete && existing?.status === 'borrador' && (
              <Button
                variant="danger"
                icon={<Trash2 className="h-4 w-4" />}
                onClick={() => {
                  c.setError(null);
                  setDeleted({ confirmation: '' });
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
          <PaymentTotal
            report={report}
            period={period}
            totalUsd={totalUsd}
            rate={rate}
            paymentTotalBs={paymentTotalBs}
            paidCount={paidCount}
            todayRate={c.todayRate}
          />

          <ReportStepsNav steps={steps} current={step} onSelect={setStep} />

          {step === 'revision' && (
            <div>
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 px-5 py-3">
                <p className="max-w-3xl text-xs text-slate-400">
                  {view === 'revision' && 'Lo que la primera mensualidad no resuelve: pasó a plan gratuito con la mensualidad pagada, o todas sus mensualidades se cancelaron a menos de 20 días de emitidas. Cuéntala o no la cuentes; si no se cuenta, no se paga.'}
                  {view === 'todas' && 'Cada venta instalada en el periodo, con su clasificación y quién cobra por ella.'}
                  {view === 'promo_anterior' && `Lo instalado en los días promocionales de ${monthName(report.previous?.period ?? '')}: si ya se cobró allí o toca aquí.`}
                  {view === 'promo' && `Lo instalado en los días promocionales de ${monthName(period)}: quién adelantó el pago y cuenta ya aquí.`}
                  {view === 'manuales' && 'Las ventas agregadas a mano: cuentan en este periodo aunque las reglas no las recojan.'}
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
                  ] as const).map(([key, label, missing]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => showView(key)}
                      className={`rounded-lg px-3 py-1.5 transition ${
                        view === key ? 'bg-sky-500/15 text-sky-300 ring-1 ring-sky-500/40'
                          : missing ? 'text-amber-300 hover:text-white' : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              {view === 'revision' && (
                <ReviewTable
                  sales={report.review}
                  editable={editable}
                  saving={c.saving}
                  onDecide={c.decide}
                />
              )}
              {view === 'manuales' && (
                <ManualSalesPanel
                  manual_sales={report.manual_sales ?? []}
                  editable={editable}
                  saving={c.saving}
                  onAdd={c.addManual}
                  onRemove={(order) => void c.removeManual(order)}
                />
              )}
              {(view === 'todas' || viewedTier) && !c.sales && <LoadingState message="Cargando ventas..." />}
              {view === 'todas' && c.sales && <SalesTable sales={c.sales} />}
              {view === 'promo_anterior' && c.sales && (
                <PreviousPromoTable
                  report={report}
                  sales={tierSales}
                  editable={editable}
                  saving={c.saving}
                  onDecide={c.decide}
                />
              )}
              {view === 'promo' && c.sales && <MonthPromoTable report={report} sales={tierSales} />}
            </div>
          )}

          {step === 'indicadores' && (
            <div className="p-5">
              <IndicatorsPanel
                report={report}
                editable={editable}
                onCompliance={(id, value) => void c.saveCompliance(id, value)}
                onGrowth={(id, value) => void c.saveGrowth(id, value)}
              />
            </div>
          )}

          {step === 'nomina' && (
            <PayrollView
              report={report}
              teams={teams}
              conditions={conditions}
              rate={rate}
              onViewPerson={viewBreakdown}
              onEditIndicators={editable ? () => setStep('indicadores') : null}
            />
          )}

          {step === 'cierre' && (
            <CloseStep
              report={report}
              archives={archives}
              titleLabel={titleLabel}
              canReopen={canReopen}
              editable={editable}
              toReview={toReview}
              pendingIndicators={pendingIndicators}
              onGoTo={setStep}
              onReopen={() => setReopening({ reason: '', confirmation: '' })}
              onClose={() => setConfirming('cerrar')}
            />
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
          saving={c.saving}
          onSave={async (body) => { if (await c.savePeriod(body)) setEditingPeriod(false); }}
          onClose={() => setEditingPeriod(false)}
        />
      </Modal>

      <ClosePeriodModal
        open={confirming === 'cerrar'}
        period={period}
        totalUsd={totalUsd}
        rate={rate}
        paymentTotalBs={paymentTotalBs}
        paidCount={paidCount}
        saving={c.saving}
        onConfirm={c.closePeriod}
        onClose={() => setConfirming(null)}
      />

      <ReopenPeriodModal
        value={reopening}
        period={period}
        totalUsd={totalUsd}
        paidCount={paidCount}
        nextVersion={archives.length + 1}
        saving={c.saving}
        onChange={setReopening}
        onReopen={c.reopen}
        onClose={() => setReopening(null)}
      />

      <DeleteDraftModal
        value={deleted}
        period={period}
        deletable={deletable}
        saving={c.saving}
        onChange={setDeleted}
        onDelete={c.deleteDraft}
        onClose={() => setDeleted(null)}
      />

      <PaymentBreakdownModal
        breakdown={breakdown}
        titleLabel={titleLabel}
        rate={rate}
        sales={c.sales ? breakdownSales : null}
        onClose={() => setBreakdown(null)}
      />
    </AppLayout>
  );
}
