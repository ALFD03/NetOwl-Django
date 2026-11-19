/** Encuestas › Instalados y Bajas: la lista del mes cerrado, el formulario y los resultados. */

import { useState } from 'react';
import { BarChart3, ClipboardList, ListChecks, RefreshCw, Settings2, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { AppLayout } from '@/shared/layout/AppLayout';
import { getApiErrorMessage, surveysApi } from '@/shared/lib/api';
import { useVisit } from '@/shared/page/PageData';
import {
  ActionBar,
  ActionMessage,
  Button,
  EmptyState,
  ExcelExportButton,
  LoadingState,
  SelectMenu,
  StatusMessage,
  ToggleGroup,
} from '@/shared/ui';
import type { StatusTone } from '@/shared/ui';

import { useRespondents } from '../hooks/useRespondents';
import { CARD_FIELDS, STATUS_LABEL, callMonth, formatMonth, pct } from '../lib/format';
import type { Respondent, SurveyPageProps } from '../types';
import { DeleteMonthModal } from './DeleteMonthModal';
import { RespondentsTable } from './RespondentsTable';
import { ResultsPanel } from './ResultsPanel';
import { SurveyForm } from './SurveyForm';

type Tab = 'list' | 'results';

const EXPORT_COLUMNS = [
  ...CARD_FIELDS.map(({ key, label }) => ({ header: label, value: (r: Respondent) => r[key] })),
  { header: 'Estado', value: (r: Respondent) => STATUS_LABEL[r.status] },
];

export function SurveyView({
  slug,
  name,
  period,
  periods,
  questions,
  max_text: maxText,
  can_answer: canAnswer,
  can_manage: canManage,
  can_delete: canDelete,
}: SurveyPageProps) {
  const visit = useVisit();
  const navigate = useNavigate();
  const progress = periods.find((p) => p.period === period);
  const isOpen = Boolean(progress?.open);

  const [tab, setTab] = useState<Tab>('list');
  const [opening, setOpening] = useState(false);
  const [message, setMessage] = useState<{ type: StatusTone; text: string } | null>(null);
  const [current, setCurrent] = useState<Respondent | null>(null);
  const [deleting, setDeleting] = useState(false);

  const list = useRespondents(slug, period, isOpen);
  const rows = list.data?.respondents ?? null;
  const results = list.data?.results ?? null;

  const goToMonth = (month: string) => visit({ period: month }, { remount: true });

  /** Abre la lista del mes, o la actualiza: copia de Suscripciones lo que falte. */
  const openList = async () => {
    setOpening(true);
    setMessage(null);
    try {
      const r = await surveysApi.openPeriod(slug, period);
      setMessage({ type: 'success', text: r.message });
    } catch (err: unknown) {
      setMessage({ type: 'error', text: getApiErrorMessage(err, 'No se pudo abrir la lista.') });
    } finally {
      setOpening(false);
    }
  };

  const periodOptions = periods.map((p) => ({
    value: p.period,
    label: `${formatMonth(p.period)}${p.open ? ` · ${p.completed}/${p.total}` : ''}`,
  }));

  const toolbar = (
    <ActionBar
      actions={
        <>
          {isOpen && (
            <ToggleGroup
              activeKey={tab}
              onChange={(k) => setTab(k as Tab)}
              options={[
                { key: 'list', label: 'Lista', icon: ListChecks },
                { key: 'results', label: 'Resultados', icon: BarChart3 },
              ]}
            />
          )}
          {isOpen && canAnswer && (
            <Button
              variant="outline"
              size="sm"
              icon={<RefreshCw className="h-3.5 w-3.5" />}
              isLoading={opening}
              onClick={() => void openList()}
              title="Suma a la lista los clientes que falten y actualiza a los pendientes"
            >
              Actualizar lista
            </Button>
          )}
          {isOpen && rows && (
            <ExcelExportButton
              rows={rows}
              columns={EXPORT_COLUMNS}
              fileName={`encuesta-${slug}-${period}`}
              sheetName={name.slice(0, 31)}
              label="Exportar"
            />
          )}
          {isOpen && canDelete && (
            <Button
              variant="outline"
              size="sm"
              icon={<Trash2 className="h-3.5 w-3.5" />}
              onClick={() => setDeleting(true)}
              title="Quita el mes de la encuesta con lo contestado en él"
            >
              Borrar mes
            </Button>
          )}
          {canManage && (
            <Button
              variant="outline"
              size="sm"
              icon={<Settings2 className="h-3.5 w-3.5" />}
              onClick={() => navigate('/encuestas/configuracion/')}
            >
              Preguntas
            </Button>
          )}
        </>
      }
    >
        <SelectMenu aria-label="Mes encuestado" className="w-64" value={period} options={periodOptions} onChange={goToMonth} />
        <span className="text-xs text-slate-400">
          Clientes de <strong className="text-slate-200">{formatMonth(period)}</strong>, para llamar en {callMonth(period)}
          {progress?.open && (
            <>
              {' '}
              · completadas <strong className="text-slate-200">{pct(progress.completed, progress.total)}</strong>
            </>
          )}
        </span>
    </ActionBar>
  );

  return (
    <AppLayout toolbar={toolbar}>
      <div className="space-y-4">
        <ActionMessage status={message} />
        <StatusMessage
          status={list.error ? { type: 'error', text: getApiErrorMessage(list.error, 'No se pudo cargar la lista.') } : null}
        />

        {!isOpen ? (
          <EmptyState
            icon={<ClipboardList className="h-10 w-10" />}
            title={`La ${name.toLowerCase()} de ${formatMonth(period)} aún no está abierta`}
            description={
              canAnswer
                ? 'Al abrirla se copia desde Suscripciones la lista de clientes de ese mes, con sus datos de contacto.'
                : 'Quien atiende las encuestas tiene que abrir primero la lista de este mes.'
            }
            action={
              canAnswer ? (
                <Button isLoading={opening} onClick={() => void openList()}>
                  Abrir la lista de {formatMonth(period)}
                </Button>
              ) : undefined
            }
            size="lg"
            bordered
          />
        ) : list.isPending ? (
          <LoadingState message="Cargando clientes" />
        ) : tab === 'results' && results ? (
          <ResultsPanel results={results} />
        ) : rows ? (
          <RespondentsTable rows={rows} onOpen={setCurrent} />
        ) : null}
      </div>

      <SurveyForm
        respondent={current}
        questions={questions}
        maxText={maxText}
        canAnswer={canAnswer}
        onClose={() => setCurrent(null)}
      />

      <DeleteMonthModal
        isOpen={deleting}
        slug={slug}
        name={name}
        progress={progress}
        onClose={() => setDeleting(false)}
        onDeleted={() => setMessage({ type: 'success', text: `Se borró ${formatMonth(period)}.` })}
      />
    </AppLayout>
  );
}
