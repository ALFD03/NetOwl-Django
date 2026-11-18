/**
 * Comisiones › Condiciones: la ventana de pago (días promocionales, espera y corte) y los % PYME.
 *
 * Cuánto cobra cada rol de cada equipo no se configura aquí sino en Catálogos ›
 * Ventas. Se abre en lectura; «Editar» pasa al formulario, con los cambios
 * pendientes a la vista y los errores en el campo que los causa antes de mandar
 * nada al servidor.
 */

import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Pencil, Save, Undo2 } from 'lucide-react';

import { getApiErrorMessage } from '@/shared/lib/api/client';
import { commissionsApi } from '@/shared/lib/api/commissions';
import { AppLayout } from '@/shared/layout/AppLayout';
import { Button, Panel, StatusMessage } from '@/shared/ui';
import { pendingChanges, fieldErrors, type Change } from '../lib/conditions';
import type { ConditionsUpdate, CommissionsConditionsProps, CommissionConditions } from '../types';
import { PeriodCard } from './conditions/PeriodCard';
import { SmePlansCard } from './conditions/SmePlansCard';
import { useBlocker } from 'react-router-dom';

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function Validity({ last_update }: { last_update: ConditionsUpdate }) {
  const date = last_update.at ? new Date(last_update.at) : null;
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="text-sm font-semibold text-white">
        {date
          ? `Vigentes · modificadas el ${date.toLocaleDateString('es-VE')} a las ${date.toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' })}${last_update.by ? ` por ${last_update.by}` : ''}`
          : 'Vigentes · las de la política, sin cambios desde entonces'}
      </span>
      <span className="text-xs text-slate-400">
        Los cambios valen para lo que se calcule desde ahora; un periodo cerrado conserva las condiciones con que se cerró.
      </span>
    </div>
  );
}

function ChangeList({ changes }: { changes: Change[] }) {
  return (
    <Panel title="Cambios pendientes">
      <ul className="flex flex-col gap-2 text-sm">
        {changes.map((c) => (
          <li key={c.where} className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="h-2 w-2 shrink-0 rounded-full bg-amber-400" aria-hidden />
            <span className="text-slate-400">{c.where}</span>
            {c.before === null && <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold text-amber-400">nuevo</span>}
            {c.after === null && <span className="rounded-full bg-rose-500/15 px-2 py-0.5 text-[10px] font-bold text-rose-400">quitado</span>}
            {c.before !== null && <span className="font-mono tabular-nums text-slate-500 line-through">{c.before}</span>}
            {c.after !== null && <span className="font-mono font-bold tabular-nums text-white">{c.before !== null ? '→ ' : ''}{c.after}</span>}
          </li>
        ))}
      </ul>
    </Panel>
  );
}

/**
 * Las condiciones no se versionan: un periodo cerrado guarda una copia de las
 * que usó, así que cambiarlas solo afecta a lo que se calcule después (los
 * borradores incluidos, que se recalculan al abrirlos).
 */
export function ConditionsView({ conditions, last_update, smePlans, canEditPlans }: CommissionsConditionsProps) {
  const [draft, setDraft] = useState<CommissionConditions>(conditions);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [state, setState] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Tras guardar, la recarga trae las condiciones como las dejó el servidor (tramos ordenados):
  // el borrador se reinicia con ellas en el mismo render, sin un efecto de por medio.
  const [base, setBase] = useState(conditions);
  if (base !== conditions) {
    setBase(conditions);
    setDraft(conditions);
  }

  const changes = useMemo(() => pendingChanges(conditions, draft), [conditions, draft]);
  const errors = useMemo(() => fieldErrors(draft), [draft]);
  const errorCount = Object.keys(errors).length;
  const dirty = editing && changes.length > 0;

  // Salir con cambios sin guardar pregunta antes, cierre la pestaña o navegue por la app.
  useEffect(() => {
    if (!dirty) return undefined;
    const onCloseModal = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', onCloseModal);
    return () => window.removeEventListener('beforeunload', onCloseModal);
  }, [dirty]);
  const lock = useBlocker(({ currentLocation, nextLocation }) => dirty && currentLocation.pathname !== nextLocation.pathname);
  useEffect(() => {
    if (lock.state !== 'blocked') return;
    if (window.confirm('Hay cambios sin guardar en las condiciones. ¿Salir sin guardarlos?')) lock.proceed();
    else lock.reset();
  }, [lock]);

  const change = (patch: Partial<CommissionConditions>) => setDraft((d) => ({ ...d, ...patch }));

  const discard = () => {
    setDraft(conditions);
    setEditing(false);
    setState(null);
  };

  const save = async () => {
    setSaving(true);
    setState(null);
    try {
      const response = await commissionsApi.saveConditions({
        promo_day: draft.promo_day, wait_days: draft.wait_days, cutoff_day: draft.cutoff_day,
      });
      setEditing(false);
      setState({ type: 'success', text: response.message });
    } catch (err: unknown) {
      setState({ type: 'error', text: getApiErrorMessage(err, 'No se pudieron guardar las condiciones.') });
    } finally {
      setSaving(false);
    }
  };

  const toolbar = editing ? (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-amber-500/40 bg-amber-950/30 p-4 shadow-xl">
      <div className="flex min-w-0 items-center gap-3">
        <AlertTriangle className="h-5 w-5 shrink-0 text-amber-400" aria-hidden />
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="text-sm font-bold text-white">
            {changes.length ? `${plural(changes.length, 'cambio', 'cambios')} sin guardar` : 'Editando: todavía sin cambios'}
            {errorCount > 0 && <span className="text-rose-400"> · {plural(errorCount, 'error', 'errores')} por corregir</span>}
          </span>
          <span className="text-xs text-slate-400">
            Valdrán para lo que se calcule desde que guardes, borradores incluidos. Los periodos cerrados no cambian.
          </span>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" icon={<Undo2 className="h-4 w-4" />} onClick={discard} disabled={saving}>
          Descartar
        </Button>
        <Button
          icon={<Save className="h-4 w-4" />}
          isLoading={saving}
          disabled={!changes.length || errorCount > 0}
          title={errorCount > 0 ? 'Corrige los errores antes de guardar' : undefined}
          onClick={() => void save()}
        >
          Guardar condiciones
        </Button>
      </div>
    </div>
  ) : (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-slate-800 bg-surface-secondary p-4 shadow-xl">
      <Validity last_update={last_update} />
      <Button icon={<Pencil className="h-4 w-4" />} onClick={() => { setState(null); setEditing(true); }}>
        Editar condiciones
      </Button>
    </div>
  );

  return (
    <AppLayout toolbar={toolbar}>
      <StatusMessage status={state} className="mb-4" icon={<AlertTriangle />} />

      <div className="flex flex-col gap-6">
        {editing && changes.length > 0 && <ChangeList changes={changes} />}

        {editing ? (
          <>
            <PeriodCard draft={draft} saved={conditions} editing errors={errors} change={change} />
            <SmePlansCard plans={smePlans} canEditPlans={canEditPlans} compact />
          </>
        ) : (
          <>
            <SmePlansCard plans={smePlans} canEditPlans={canEditPlans} compact={false} />
            <PeriodCard draft={draft} saved={conditions} editing={false} errors={errors} change={change} />
          </>
        )}
      </div>
    </AppLayout>
  );
}
