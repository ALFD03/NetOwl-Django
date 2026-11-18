/** Los modales del informe de comisiones: cerrar, reabrir y borrar un periodo, y el desglose de un pago. */

import { AlertTriangle, Lock, LockOpen, Receipt, ShieldAlert, Trash2 } from 'lucide-react';

import { Button, LoadingState, Modal, StatusMessage, TextField } from '@/shared/ui';
import { bonusNotes } from '../lib/payroll';
import { aBs, formatAmount, formatBs } from '../lib/format';
import type { CommissionPayment, CommissionSale, SalesRole } from '../types';
import { SalesTable } from './SalesTable';

interface Totals {
  totalUsd: number;
  /** La tasa de pago, o `null` si el informe no la lleva. */
  rate: number | null;
  paymentTotalBs: number | null;
  paidCount: number;
}

export function ClosePeriodModal({
  open,
  period,
  totalUsd,
  rate,
  paymentTotalBs,
  paidCount,
  saving,
  onConfirm,
  onClose,
}: Totals & {
  open: boolean;
  period: string;
  saving: boolean;
  onConfirm: () => Promise<boolean>;
  onClose: () => void;
}) {
  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      title={`Cerrar ${period}`}
      subtitle="El informe queda congelado tal y como se ve ahora"
      icon={<Lock className="h-5 w-5 text-emerald-400" />}
      theme="green"
      size="sm"
    >
      <div className="space-y-5">
        <p className="text-sm text-slate-300">
          {`Se pagan ${formatAmount(totalUsd)}${rate !== null ? ` (${formatBs(paymentTotalBs)})` : ''} a ${paidCount} personas. Se guardan las ventas, los pagos y las condiciones de hoy, y sus ventas válidas no volverán a contar en ningún otro periodo.`}
        </p>
        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            isLoading={saving}
            onClick={async () => {
              if (await onConfirm()) onClose();
            }}
          >
            Cerrar periodo
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export interface ReopenDraft {
  reason: string;
  confirmation: string;
}

/**
 * Reabrir deshace una nómina cerrada: el cierre se archiva (ver
 * `ArchivedCloses`), pero se pide el motivo y el periodo escrito a mano, que el
 * servidor vuelve a comprobar.
 */
export function ReopenPeriodModal({
  value,
  period,
  totalUsd,
  paidCount,
  nextVersion,
  saving,
  onChange,
  onReopen,
  onClose,
}: Pick<Totals, 'totalUsd' | 'paidCount'> & {
  value: ReopenDraft | null;
  period: string;
  /** La versión con la que se archiva el cierre actual. */
  nextVersion: number;
  saving: boolean;
  onChange: (value: ReopenDraft) => void;
  onReopen: (reason: string, confirmation: string) => Promise<boolean>;
  onClose: () => void;
}) {
  return (
    <Modal
      isOpen={Boolean(value)}
      onClose={onClose}
      title={`Reabrir ${period}`}
      subtitle="Vuelve a borrador y se recalcula con los datos de hoy"
      icon={<LockOpen className="h-5 w-5 text-amber-400" />}
      theme="yellow"
      size="md"
    >
      {value && (
        <form
          className="space-y-5"
          onSubmit={async (e) => {
            e.preventDefault();
            if (await onReopen(value.reason.trim(), value.confirmation.trim())) onClose();
          }}
        >
          <StatusMessage
            status={{
              type: 'warning',
              text: `Se deshace el cierre: ${formatAmount(totalUsd)} a ${paidCount} personas. Queda archivado como versión ${nextVersion} y el periodo se recalculará con las suscripciones de hoy, que pueden no ser las del cierre.`,
            }}
            icon={<ShieldAlert />}
          />
          <TextField
            label="Motivo de la reapertura"
            required
            minLength={10}
            maxLength={500}
            placeholder="Qué hay que corregir y quién lo pidió"
            value={value.reason}
            onChange={(e) => onChange({ ...value, reason: e.target.value })}
          />
          <TextField
            label={`Escribe ${period} para confirmar`}
            required
            autoComplete="off"
            placeholder={period}
            value={value.confirmation}
            onChange={(e) => onChange({ ...value, confirmation: e.target.value })}
          />
          <div className="flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button
              type="submit"
              variant="danger"
              isLoading={saving}
              disabled={value.reason.trim().length < 10 || value.confirmation.trim() !== period}
            >
              Reabrir y archivar el cierre
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}

/**
 * Borrar no se deshace: se lleva lo decidido en el periodo. Se pide el periodo
 * escrito a mano, que el servidor vuelve a comprobar.
 */
export function DeleteDraftModal({
  value,
  period,
  deletable,
  saving,
  onChange,
  onDelete,
  onClose,
}: {
  value: { confirmation: string } | null;
  period: string;
  /** Solo un borrador que nunca se cerró. */
  deletable: boolean;
  saving: boolean;
  onChange: (value: { confirmation: string }) => void;
  onDelete: (confirmation: string) => Promise<boolean>;
  onClose: () => void;
}) {
  return (
    <Modal
      isOpen={Boolean(value)}
      onClose={onClose}
      title={`Borrar el informe ${period}`}
      subtitle="Esta acción no se puede deshacer"
      icon={<Trash2 className="h-5 w-5 text-rose-400" />}
      theme="red"
      size="md"
    >
      {value && (
        <form
          className="space-y-5"
          onSubmit={async (e) => {
            e.preventDefault();
            if (await onDelete(value.confirmation.trim())) onClose();
          }}
        >
          {deletable ? (
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
            disabled={!deletable}
            value={value.confirmation}
            onChange={(e) => onChange({ confirmation: e.target.value })}
          />
          <div className="flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button
              type="submit"
              variant="danger"
              icon={<Trash2 className="h-4 w-4" />}
              isLoading={saving}
              disabled={!deletable || value.confirmation.trim() !== period}
            >
              Borrar definitivamente
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}

/** Las ventas que cobra una persona y sus bonos. `sales` es `null` mientras se cargan. */
export function PaymentBreakdownModal({
  breakdown,
  titleLabel,
  rate,
  sales,
  onClose,
}: {
  breakdown: CommissionPayment | null;
  titleLabel: (role: SalesRole) => string;
  rate: number | null;
  sales: CommissionSale[] | null;
  onClose: () => void;
}) {
  return (
    <Modal
      isOpen={Boolean(breakdown)}
      onClose={onClose}
      title={breakdown?.name ?? ''}
      subtitle={
        breakdown
          ? `${titleLabel(breakdown.role)} · ${breakdown.team_name} · ${breakdown.own_sales + breakdown.team_sales + breakdown.sme_sales} ventas validadas · ${formatAmount(breakdown.net)}${
              rate !== null ? ` · ${formatBs(aBs(breakdown.net, rate))}` : ''
            } a pagar`
          : ''
      }
      icon={<Receipt className="h-5 w-5 text-emerald-400" />}
      theme="green"
    >
      {breakdown && (
        <div className="space-y-4">
          {breakdown.warnings.length > 0 && (
            <StatusMessage
              status={{ type: 'warning', text: breakdown.warnings.join(' · ') }}
              icon={<AlertTriangle />}
            />
          )}
          {bonusNotes(breakdown).length > 0 && (
            <p className="text-xs text-slate-400">
              Bonos:{' '}
              {bonusNotes(breakdown).map((b) => (
                <strong key={b} className="mr-3 text-amber-400">
                  {b}
                </strong>
              ))}
            </p>
          )}
          {sales ? <SalesTable sales={sales} /> : <LoadingState message="Cargando ventas..." />}
        </div>
      )}
    </Modal>
  );
}
