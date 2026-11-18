/** El paso de cierre del informe: lo que falta para cerrar, el botón de cerrar o reabrir y los cierres archivados. */

import { AlertTriangle, Lock, LockOpen } from 'lucide-react';

import { Button, StatusMessage } from '@/shared/ui';
import { formatDateValue } from '../lib/format';
import type { ArchivedClose, CommissionReport, SalesRole } from '../types';
import { ArchivedCloses } from './ArchivedCloses';

export function CloseStep({
  report,
  archives,
  titleLabel,
  canReopen,
  editable,
  toReview,
  pendingIndicators,
  onGoTo,
  onReopen,
  onClose,
}: {
  report: CommissionReport;
  archives: ArchivedClose[];
  titleLabel: (role: SalesRole) => string;
  canReopen: boolean;
  editable: boolean;
  /** Ventas por revisar o confirmar. */
  toReview: number;
  /** Cumplimientos y crecimientos sin escribir. */
  pendingIndicators: number;
  onGoTo: (step: 'revision' | 'indicadores') => void;
  onReopen: () => void;
  onClose: () => void;
}) {
  return (
    <div className="space-y-4 p-5">
      {report.status === 'cerrado' ? (
        <>
          <StatusMessage
            status={{
              type: 'success',
              text: 'Periodo cerrado: las ventas, los pagos y las condiciones quedaron congelados tal como se ven.',
            }}
            icon={<Lock />}
          />
          {canReopen && (
            <Button variant="outline" icon={<LockOpen className="h-4 w-4" />} onClick={onReopen}>
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
            {(
              [
                [
                  'revision',
                  'Ventas por revisar y confirmar',
                  toReview ? `${toReview} sin decidir` : null,
                ],
                [
                  'indicadores',
                  'Cumplimientos y crecimientos',
                  pendingIndicators ? `${pendingIndicators} sin definir` : null,
                ],
              ] as const
            ).map(([key, title, missing]) => (
              <button
                key={key}
                type="button"
                onClick={() => onGoTo(key)}
                className={`flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-left transition hover:bg-surface-tertiary/40 ${
                  missing ? 'border-amber-500/40' : 'border-slate-800'
                }`}
              >
                <span className="text-sm font-semibold text-white">{title}</span>
                <span
                  className={`text-xs font-bold ${missing ? 'text-amber-300' : 'text-emerald-300'}`}
                >
                  {missing ?? 'Completo'}
                </span>
              </button>
            ))}
          </div>
          {report.close_blockers.length > 0 && (
            <StatusMessage
              status={{
                type: 'warning',
                text: `Falta para cerrar: ${report.close_blockers.join(' · ')}.`,
              }}
              icon={<AlertTriangle />}
            />
          )}
          <p className="max-w-3xl text-sm text-slate-300">
            Cerrar guarda las ventas, los pagos y las condiciones de hoy. Sus ventas válidas no
            volverán a contar en ningún otro periodo, y el informe deja de recalcularse.
          </p>
          {editable && (
            <Button
              icon={<Lock className="h-4 w-4" />}
              onClick={onClose}
              disabled={report.close_blockers.length > 0}
            >
              Cerrar periodo
            </Button>
          )}
        </>
      )}
      <ArchivedCloses archives={archives} roleLabel={titleLabel} />
    </div>
  );
}
