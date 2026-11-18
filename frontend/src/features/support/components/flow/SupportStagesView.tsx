/**
 * El catálogo de etapas: de qué equipo es cada etapa y qué se hace en ella.
 *
 * Los logs solo dicen «de A pasó a B». Repartir el tiempo de un ticket entre ATC
 * y Soporte —y dentro de cada uno entre cola, pausa y gestión— necesita saber
 * qué es cada etapa, y el nombre no basta. La primera pestaña es la diferencia:
 * etapas que ya aparecen en los logs y que nadie ha clasificado.
 */

import { useState, type FormEvent } from 'react';
import { useOnOpen } from '@/shared/hooks/useOnOpen';
import {
  AlertTriangle,
  Edit3,
  GitBranch,
  Info,
  ListChecks,
  Plus,
  Save,
  Trash2,
} from 'lucide-react';

import { AppLayout } from '@/shared/layout/AppLayout';
import { getApiErrorMessage } from '@/shared/lib/api/client';
import { supportApi } from '@/shared/lib/api/support';
import {
  ActionMessage,
  Button,
  DataTable,
  EmptyState,
  Modal,
  NeonContainer,
  SelectMenu,
  TextField,
  ToggleGroup,
  type Column,
} from '@/shared/ui';
import { formatInteger } from '@/shared/utils/formatters';
import { TEAM_LABEL, KIND_LABEL } from '../../lib/flowFormat';
import type { PendingStage, SupportStage, SupportStagesProps } from '../../types';

type View = 'pendientes' | 'catalogo';
type Borrador = { id?: number; name: string; team: string; type: string };

export function SupportStagesView({
  stages,
  pending,
  teams,
  types,
  escalationStage,
  closeStages,
  newStage,
}: SupportStagesProps) {
  const vacio = (name = ''): Borrador => ({
    name,
    team: teams[0]?.value ?? 'atc',
    type: types[0]?.value ?? 'cola',
  });

  const [vista, setVista] = useState<View>(() =>
    pending.length && !newStage ? 'pendientes' : 'catalogo',
  );
  // `?new_stage=` abre el alta con el literal copiado: tiene que coincidir con el de Odoo.
  const [borrador, setBorrador] = useState<Borrador | null>(() =>
    newStage ? vacio(newStage) : null,
  );
  const [borrando, setBorrando] = useState<SupportStage | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setNotice] = useState<string | null>(null);
  // Abrir un formulario empieza de cero: el error que hubiera es de la acción anterior.
  const formOpen = Boolean(borrador || borrando);
  useOnOpen(formOpen, () => setError(null));

  const run = async (accion: () => Promise<{ message?: string }>, fallo: string) => {
    setGuardando(true);
    setError(null);
    try {
      const r = await accion();
      setBorrador(null);
      setBorrando(null);
      setNotice(r.message ?? null);
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, fallo));
    } finally {
      setGuardando(false);
    }
  };

  const guardar = (event: FormEvent) => {
    event.preventDefault();
    if (borrador) run(() => supportApi.saveEtapa(borrador), 'No se pudo guardar la etapa.');
  };

  const pendingColumns: Column<PendingStage>[] = [
    { header: 'Etapa en los logs', accessor: 'stage', sortKey: 'stage' },
    { header: 'Logs', accessor: (r) => formatInteger(r.logs), align: 'right', sortKey: 'logs' },
    {
      header: 'Tickets',
      accessor: (r) => formatInteger(r.tickets),
      align: 'right',
      sortKey: 'tickets',
    },
    { header: 'Último', accessor: (r) => r.last ?? '—', align: 'right', sortKey: 'last' },
    {
      header: 'Acciones',
      align: 'right',
      accessor: (r) => (
        <div className="flex justify-end">
          <Button
            size="sm"
            icon={<Plus className="h-4 w-4" />}
            onClick={() => setBorrador(vacio(r.stage))}
          >
            Clasificar
          </Button>
        </div>
      ),
    },
  ];

  const catalogColumns: Column<SupportStage>[] = [
    {
      header: 'Etapa',
      accessor: (r) => (
        <span>
          {r.name}
          {r.is_escalation && (
            <span className="ml-2 rounded-full bg-violet-500/15 px-2 py-0.5 text-[10px] font-bold text-violet-300">
              escalamiento
            </span>
          )}
        </span>
      ),
      sortKey: 'name',
    },
    {
      header: 'Equipo',
      accessor: (r) => TEAM_LABEL[r.team],
      sortKey: 'team',
      filterable: true,
      filterValue: (r) => TEAM_LABEL[r.team],
    },
    {
      header: 'Tipo',
      accessor: (r) => KIND_LABEL[r.type],
      sortKey: 'type',
      filterable: true,
      filterValue: (r) => KIND_LABEL[r.type],
    },
    { header: 'Logs', accessor: (r) => formatInteger(r.logs), align: 'right', sortKey: 'logs' },
    {
      header: 'Acciones',
      align: 'right',
      accessor: (r) => (
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() =>
              setBorrador({ id: r.id, name: r.name, team: r.team, type: r.type })
            }
            className="rounded-lg border border-sky-500/30 p-2 text-sky-400 hover:bg-sky-500/10"
            title="Editar"
          >
            <Edit3 className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setBorrando(r)}
            className="rounded-lg border border-rose-500/30 p-2 text-rose-400 hover:bg-rose-500/10"
            title="Eliminar"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ),
    },
  ];

  return (
    <AppLayout
      toolbar={
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-slate-800 bg-surface-secondary p-4 shadow-xl">
          <ToggleGroup
            activeKey={vista}
            onChange={(key) => setVista(key as View)}
            options={[
              {
                key: 'pendientes',
                label: `Por clasificar (${pending.length})`,
                icon: AlertTriangle,
              },
              { key: 'catalogo', label: `Etapas (${stages.length})`, icon: ListChecks },
            ]}
          />
          <Button icon={<Plus className="h-4 w-4" />} onClick={() => setBorrador(vacio())}>
            Nueva etapa
          </Button>
        </div>
      }
    >
      <ActionMessage
        status={error ? { type: 'error', text: error } : null}
        className="mb-4"
        icon={<AlertTriangle />}
      />
      <ActionMessage status={aviso ? { type: 'success', text: aviso } : null} className="mb-4" />

      <NeonContainer
        title="Reglas fijas"
        subtitle="Lo que no depende del catálogo"
        icon={<Info className="h-5 w-5" />}
        theme="slate"
        className="mb-6"
      >
        <ul className="space-y-2 text-xs text-slate-300">
          <li>
            <strong className="text-white">Escalamiento:</strong> entrar en «{escalationStage}»
            viniendo de una etapa que no es de Soporte. Un ticket que nace en ella no está escalado.
          </li>
          <li>
            <strong className="text-white">Cierre:</strong> {closeStages.join(' y ')}. Son fijas,
            como en el resto del módulo, y cuentan para el equipo que tenía el ticket.
          </li>
          <li>
            <strong className="text-white">Compartida:</strong> la etapa es de ATC antes del
            escalamiento y de Soporte después; si el ticket nunca escaló, del equipo en que nació.
            Una etapa sin clasificar se trata igual y su tiempo va a «sin clasificar».
          </li>
          <li>
            <strong className="text-white">Cola</strong>: nadie lo ha tomado.{' '}
            <strong className="text-white">Pausa</strong>: espera algo de fuera (el cliente, un
            pago, una falla masiva). <strong className="text-white">Gestión</strong>: alguien
            trabaja en él.
          </li>
          <li>
            Los cambios se aplican al volver a ejecutar el análisis de soporte, en todos los meses.
          </li>
        </ul>
      </NeonContainer>

      {vista === 'pendientes' && (
        <NeonContainer
          title="Etapas por clasificar"
          subtitle="Aparecen en los logs cargados y el catálogo no dice de qué equipo son"
          icon={<AlertTriangle className="h-5 w-5" />}
          theme="yellow"
          noPadding
        >
          {pending.length === 0 ? (
            <EmptyState
              title="Todas las etapas están clasificadas"
              description="Ninguna etapa de los logs cargados falta en el catálogo."
              icon={<ListChecks />}
            />
          ) : (
            <DataTable
              columns={pendingColumns}
              data={pending}
              searchable
              searchPlaceholder="Buscar etapa..."
            />
          )}
        </NeonContainer>
      )}

      {vista === 'catalogo' && (
        <NeonContainer
          title="Etapas"
          subtitle="Equipo y tipo de cada etapa de los tickets"
          icon={<GitBranch className="h-5 w-5" />}
          theme="blue"
          noPadding
        >
          {stages.length === 0 ? (
            <EmptyState
              title="El catálogo está vacío"
              description="Clasifica las etapas desde la pestaña de pendientes."
              icon={<GitBranch />}
            />
          ) : (
            <DataTable
              columns={catalogColumns}
              data={stages}
              searchable
              searchPlaceholder="Buscar etapa..."
            />
          )}
        </NeonContainer>
      )}

      <Modal
        isOpen={Boolean(borrador)}
        onClose={() => setBorrador(null)}
        title={borrador?.id ? 'Editar etapa' : 'Nueva etapa'}
        subtitle="El nombre exacto con que la etapa aparece en Odoo"
        icon={<GitBranch className="h-5 w-5 text-sky-400" />}
        theme="blue"
        size="md"
      >
        {borrador && (
          <form onSubmit={guardar} className="space-y-6">
            <TextField
              label="Etapa"
              icon={<GitBranch />}
              value={borrador.name}
              onChange={(e) => setBorrador({ ...borrador, name: e.target.value })}
              placeholder="En Progreso - Soporte Técnico"
              autoFocus
            />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase text-slate-400">Equipo</label>
                <SelectMenu
                  value={borrador.team}
                  options={teams}
                  onChange={(team) => setBorrador({ ...borrador, team })}
                  aria-label="Equipo"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase text-slate-400">Tipo</label>
                <SelectMenu
                  value={borrador.type}
                  options={types}
                  onChange={(type) => setBorrador({ ...borrador, type })}
                  aria-label="Tipo"
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 border-t border-slate-800 pt-4">
              <Button type="button" variant="outline" onClick={() => setBorrador(null)}>
                Cancelar
              </Button>
              <Button type="submit" isLoading={guardando} icon={<Save className="h-4 w-4" />}>
                {borrador.id ? 'Guardar cambios' : 'Crear etapa'}
              </Button>
            </div>
          </form>
        )}
      </Modal>

      <Modal
        isOpen={Boolean(borrando)}
        onClose={() => setBorrando(null)}
        title="Confirmar eliminación"
        subtitle="Sus tramos pasarán a «sin clasificar» en el siguiente análisis"
        icon={<Trash2 className="h-5 w-5 text-rose-400" />}
        theme="red"
        size="sm"
      >
        <div className="space-y-5">
          <p className="text-sm text-slate-300">
            ¿Eliminar <strong className="text-white">{borrando?.name}</strong> del catálogo?
          </p>
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setBorrando(null)}>
              Cancelar
            </Button>
            <Button
              variant="danger"
              isLoading={guardando}
              onClick={() =>
                borrando &&
                run(() => supportApi.deleteEtapa(borrando.id), 'No se pudo eliminar la etapa.')
              }
            >
              Eliminar
            </Button>
          </div>
        </div>
      </Modal>
    </AppLayout>
  );
}
