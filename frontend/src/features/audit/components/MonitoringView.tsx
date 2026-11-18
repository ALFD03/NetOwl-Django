/**
 * El estado de los servidores y la actividad de la API.
 *
 * Arriba, la salud de cada servicio (se vuelve a comprobar cada 30 s); abajo,
 * lo que dice la bitácora de las últimas horas: peticiones por endpoint con su
 * latencia, uso por token y los últimos errores.
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Activity, AlertTriangle, CheckCircle2, RefreshCw, XCircle } from 'lucide-react';

import { AppLayout } from '@/shared/layout/AppLayout';
import { getApiErrorMessage, monitoringApi, type ServiceCheck } from '@/shared/lib/api';
import { cn } from '@/shared/lib/cn';
import { READONLY_TABLE, READONLY_TABLE_BODY, READONLY_TABLE_HEAD_STICKY } from '@/shared/ui/data/tableClasses';
import { Button, EmptyState, LoadingState, Panel, StatTile, StatusMessage, ToggleGroup } from '@/shared/ui';

const SERVICIOS: { clave: 'web' | 'postgres' | 'redis' | 'worker' | 'jobs'; nombre: string }[] = [
  { clave: 'web', nombre: 'Web (Django)' },
  { clave: 'postgres', nombre: 'PostgreSQL' },
  { clave: 'redis', nombre: 'Redis' },
  { clave: 'worker', nombre: 'Worker de Celery' },
  { clave: 'jobs', nombre: 'Análisis' },
];

const VENTANAS = [
  { key: '1', label: '1 h' },
  { key: '24', label: '24 h' },
  { key: '168', label: '7 días' },
];

const CANALES: Record<string, string> = { web: 'Navegador', api: 'API (token)' };
const RESULTS: Record<string, string> = {
  ok: 'Correctos',
  error: 'Errores',
  denegado: 'Denegados',
  limitado: 'Limitados',
};

/** Los datos que interesan de cada servicio, en una línea. */
function detalle(clave: string, check: ServiceCheck): string {
  if (!check.ok) return check.error ?? 'Sin respuesta';
  switch (clave) {
    case 'web':
      return `Esquema ${String(check.schema)}`;
    case 'postgres':
      return `${String(check.size_mb)} MB · ${String(check.connections)} conexiones`;
    case 'redis':
      return `${String(check.memory_mb)} MB · cola ${String(check.queue)}: ${String(check.queued)} en espera`;
    case 'worker':
      return (check.workers as string[]).join(', ');
    case 'jobs': {
      const count = (check.last_24h ?? {}) as Record<string, number>;
      const partes = Object.entries(count).map(([estado, n]) => `${n} ${estado}`);
      return partes.length ? `24 h: ${partes.join(' · ')}` : 'Sin análisis en 24 h';
    }
    default:
      return '';
  }
}

function Salud() {
  const salud = useQuery({ queryKey: ['audit', 'health'], queryFn: monitoringApi.health, refetchInterval: 30_000 });

  return (
    <Panel
      title="Servicios"
      description={salud.data ? `Comprobado ${new Date(salud.data.checked_at).toLocaleTimeString('es-VE')}` : undefined}
      actions={
        <Button
          size="sm"
          variant="secondary"
          icon={<RefreshCw className={cn('h-3.5 w-3.5', salud.isFetching && 'animate-spin')} />}
          onClick={() => void salud.refetch()}
        >
          Comprobar
        </Button>
      }
    >
      {salud.isPending ? (
        <LoadingState message="Comprobando servicios" />
      ) : salud.isError ? (
        <StatusMessage status={{ type: 'error', text: getApiErrorMessage(salud.error, 'No se pudo comprobar el estado.') }} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {SERVICIOS.map(({ clave, nombre }) => {
            const check = salud.data.services[clave];
            return (
              <div
                key={clave}
                className={cn(
                  'rounded-lg border p-3',
                  check.ok ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-rose-500/40 bg-rose-500/10',
                )}
              >
                <div className="flex items-center gap-2">
                  {check.ok ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                  ) : (
                    <XCircle className="h-4 w-4 text-rose-400" />
                  )}
                  <span className="text-sm font-semibold text-white">{nombre}</span>
                  <span className="ml-auto font-mono text-[10px] text-slate-500">{check.ms} ms</span>
                </div>
                <p className="mt-1.5 break-words text-xs text-slate-400">{detalle(clave, check)}</p>
              </div>
            );
          })}
        </div>
      )}
    </Panel>
  );
}

function ms(valor: number | null): string {
  return valor === null ? '—' : `${valor.toLocaleString('es-VE')} ms`;
}

function Actividad() {
  const [horas, setHours] = useState('24');
  const stats = useQuery({
    queryKey: ['audit', 'stats', horas],
    queryFn: () => monitoringApi.stats(Number(horas)),
    refetchInterval: 60_000,
  });

  const ventana = <ToggleGroup activeKey={horas} onChange={setHours} options={VENTANAS} />;

  if (stats.isPending) return <Panel title="Actividad" actions={ventana}><LoadingState message="Leyendo la bitácora" /></Panel>;
  if (stats.isError) {
    return (
      <Panel title="Actividad" actions={ventana}>
        <StatusMessage status={{ type: 'error', text: getApiErrorMessage(stats.error, 'No se pudo leer la actividad.') }} />
      </Panel>
    );
  }
  const { by_channel, by_outcome, endpoints, tokens, recent_errors } = stats.data;
  const total = Object.values(by_outcome).reduce((a, b) => a + b, 0);

  return (
    <>
      <Panel title="Actividad" description="Peticiones anotadas en la bitácora." actions={ventana}>
        <div className="flex flex-wrap gap-6">
          <StatTile label="Peticiones" value={total.toLocaleString('es-VE')} mono />
          {Object.entries(by_channel).map(([canal, n]) => (
            <StatTile key={canal} label={CANALES[canal] ?? canal} value={n.toLocaleString('es-VE')} mono tone="blue" />
          ))}
          {Object.entries(by_outcome).map(([resultado, n]) => (
            <StatTile
              key={resultado}
              label={RESULTS[resultado] ?? resultado}
              value={n.toLocaleString('es-VE')}
              mono
              tone={resultado === 'ok' ? 'green' : resultado === 'error' ? 'red' : 'yellow'}
            />
          ))}
        </div>
      </Panel>

      <Panel title="Por endpoint" description="Las 100 acciones con más peticiones, con su latencia.">
        {endpoints.length === 0 ? (
          <EmptyState title="Sin peticiones en la ventana" icon={<Activity />} size="sm" />
        ) : (
          <div className="max-h-[480px] overflow-auto">
            <table className={READONLY_TABLE}>
              <thead className={READONLY_TABLE_HEAD_STICKY}>
                <tr>
                  {['Módulo', 'Acción', 'Total', 'Errores', 'Denegadas', 'Media', 'p95', 'Máx.', 'Última'].map((h) => (
                    <th key={h} className="px-3 py-2">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className={READONLY_TABLE_BODY}>
                {endpoints.map((e) => (
                  <tr key={`${e.module}:${e.action}`} className="text-slate-300">
                    <td className="px-3 py-1.5">{e.module}</td>
                    <td className="px-3 py-1.5 font-mono">{e.action}</td>
                    <td className="px-3 py-1.5 font-mono">{e.total}</td>
                    <td className={cn('px-3 py-1.5 font-mono', e.errors > 0 && 'font-bold text-rose-400')}>{e.errors}</td>
                    <td className={cn('px-3 py-1.5 font-mono', e.denied > 0 && 'text-amber-400')}>{e.denied}</td>
                    <td className="px-3 py-1.5 font-mono">{ms(e.avg_ms)}</td>
                    <td className="px-3 py-1.5 font-mono">{ms(e.p95_ms)}</td>
                    <td className="px-3 py-1.5 font-mono">{ms(e.max_ms)}</td>
                    <td className="px-3 py-1.5">{new Date(e.last).toLocaleString('es-VE', { dateStyle: 'short', timeStyle: 'short' })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Uso por token">
          {tokens.length === 0 ? (
            <EmptyState title="Ninguna petición con token" size="sm" />
          ) : (
            <table className={READONLY_TABLE}>
              <thead className={READONLY_TABLE_HEAD_STICKY}>
                <tr>
                  {['Token', 'Cuenta', 'Peticiones', 'Fallidas', 'Última'].map((h) => (
                    <th key={h} className="px-3 py-2">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className={READONLY_TABLE_BODY}>
                {tokens.map((t) => (
                  <tr key={t.token__prefix} className="text-slate-300">
                    <td className="px-3 py-1.5">
                      <span className="font-semibold text-white">{t.token__name}</span>{' '}
                      <span className="font-mono text-slate-500">{t.token__prefix}…</span>
                    </td>
                    <td className="px-3 py-1.5">{t.username}</td>
                    <td className="px-3 py-1.5 font-mono">{t.total}</td>
                    <td className={cn('px-3 py-1.5 font-mono', t.errors > 0 && 'text-amber-400')}>{t.errors}</td>
                    <td className="px-3 py-1.5">{new Date(t.last).toLocaleString('es-VE', { dateStyle: 'short', timeStyle: 'short' })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>

        <Panel title="Últimos errores">
          {recent_errors.length === 0 ? (
            <EmptyState title="Sin errores en la ventana" size="sm" />
          ) : (
            <ul className="max-h-[360px] space-y-2 overflow-auto">
              {recent_errors.map((r) => (
                <li key={r.id} className="rounded-lg border border-rose-500/20 bg-rose-500/5 p-2.5 text-xs">
                  <div className="flex flex-wrap items-center gap-2 text-slate-400">
                    <AlertTriangle className="h-3.5 w-3.5 text-rose-400" />
                    <span className="font-mono">{r.fecha}</span>
                    <span className="font-semibold text-slate-200">{r.modulo} · {r.accion}</span>
                    {r.estado_http && <span className="font-mono text-rose-400">{r.estado_http}</span>}
                    <span className="ml-auto">{r.username}</span>
                  </div>
                  {r.descripcion && <p className="mt-1 text-slate-300">{r.descripcion}</p>}
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </>
  );
}

export function MonitoreoView() {
  return (
    <AppLayout>
      <div className="space-y-4">
        <Salud />
        <Actividad />
      </div>
    </AppLayout>
  );
}
