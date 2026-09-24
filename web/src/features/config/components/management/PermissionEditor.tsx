/** El editor de la matriz de permisos de una cuenta o de un grupo. */

import { useMemo, useState } from 'react';
import { ChevronDown, Lock, SearchX, ShieldCheck } from 'lucide-react';

import { PERMISSION_GROUPS, PERMISSION_SECTIONS, TOTAL_PERMISSIONS } from '@/shared/constants/permissions';
import type { PermissionCategory } from '@/shared/constants/permissions';
import { EmptyState, SearchInput, Switch } from '@/shared/ui';
import { METRIC_BAR, METRIC_COMPACT, METRIC_TEXT } from '@/shared/ui/theme';
import { cn } from '@/shared/lib/cn';

interface Props {
  permissions: Record<string, boolean>;
  onChange: (permissions: Record<string, boolean>) => void;
  /** Los permisos se heredan de un grupo: se muestran, pero no se pueden editar. */
  disabled?: boolean;
}

/** Los permisos visibles de una tarjeta, partidos en bloques y en orden de riesgo. */
function porBloques(perms: PermissionCategory['perms']) {
  return PERMISSION_SECTIONS.map((section) => ({
    section,
    perms: perms.filter((permission) => permission.section === section),
  })).filter((bloque) => bloque.perms.length > 0);
}

/** Cuántos de los permisos de una categoría están concedidos. */
function contar(group: PermissionCategory, permissions: Record<string, boolean>) {
  return group.perms.filter((permission) => permissions[permission.key]).length;
}

export function PermissionEditor({ permissions, onChange, disabled = false }: Props) {
  const [busqueda, setBusqueda] = useState('');
  // Colapsadas y no expandidas: la matriz entera abierta es lo que hace falta
  // ver al llegar; plegar es la excepción.
  const [plegadas, setPlegadas] = useState<Record<string, boolean>>({});

  const termino = busqueda.trim().toLowerCase();

  /** Las categorías que la búsqueda deja en pie, con sus permisos ya filtrados. */
  const visibles = useMemo(() => {
    if (!termino) return PERMISSION_GROUPS.map((group) => ({ group, perms: group.perms }));
    return PERMISSION_GROUPS.map((group) => ({
      group,
      perms: group.perms.filter(
        (permission) =>
          permission.label.toLowerCase().includes(termino) ||
          group.category.toLowerCase().includes(termino),
      ),
    })).filter((entrada) => entrada.perms.length > 0);
  }, [termino]);

  const concedidos = useMemo(
    () => PERMISSION_GROUPS.reduce((total, group) => total + contar(group, permissions), 0),
    [permissions],
  );

  const escribir = (cambios: Record<string, boolean>) => {
    if (disabled) return;
    onChange({ ...permissions, ...cambios });
  };

  const marcarTodos = (valor: boolean) => {
    escribir(
      Object.fromEntries(
        PERMISSION_GROUPS.flatMap((group) => group.perms.map((permission) => [permission.key, valor])),
      ),
    );
  };

  const marcarCategoria = (group: PermissionCategory, valor: boolean) => {
    escribir(Object.fromEntries(group.perms.map((permission) => [permission.key, valor])));
  };

  const porcentaje = TOTAL_PERMISSIONS ? Math.round((concedidos / TOTAL_PERMISSIONS) * 100) : 0;

  return (
    <div className="space-y-4">
      {/* Resumen: cuánto está concedido, la búsqueda y las dos acciones masivas. */}
      <div className="rounded-2xl border border-slate-800 bg-surface-primary/80 p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="rounded-xl border border-slate-800 bg-surface-secondary p-2">
              {disabled ? (
                <Lock className="h-4 w-4 text-amber-400" />
              ) : (
                <ShieldCheck className="h-4 w-4 text-emerald-400" />
              )}
            </span>
            <div>
              <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                Matriz de permisos
              </p>
              <p className="text-sm font-bold text-white">
                {concedidos} <span className="font-medium text-slate-400">de {TOTAL_PERMISSIONS} concedidos</span>
              </p>
            </div>
          </div>

          {!disabled && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => marcarTodos(true)}
                className="rounded-xl border border-emerald-500/30 bg-emerald-950/40 px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-emerald-400 transition-colors hover:bg-emerald-950/70"
              >
                Marcar todo
              </button>
              <button
                type="button"
                onClick={() => marcarTodos(false)}
                className="rounded-xl border border-slate-700 px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-slate-400 transition-colors hover:text-white"
              >
                Limpiar
              </button>
            </div>
          )}
        </div>

        <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
          <div
            className="h-full rounded-full bg-gradient-to-r from-sky-500 to-emerald-500 transition-all duration-300"
            style={{ width: `${porcentaje}%` }}
          />
        </div>

        <SearchInput
          value={busqueda}
          placeholder="Buscar un permiso..."
          onChange={setBusqueda}
          className="w-full rounded-xl border bg-surface-deep"
        />
      </div>

      {/* Una categoría por módulo, en columna. El scroll es vertical: a dos
          columnas había que leer en zigzag para saber qué abarcaba un módulo. */}
      <div className="max-h-[55vh] space-y-3 overflow-y-auto pr-1 custom-scrollbar">
        {visibles.map(({ group, perms }) => {
          const activos = contar(group, permissions);
          const plegada = Boolean(plegadas[group.category]);
          const Icono = group.icon;

          return (
            <section
              key={group.category}
              className="rounded-2xl border border-slate-800 bg-surface-primary overflow-hidden"
            >
              <header className="flex items-start gap-3 border-b border-slate-800/70 bg-slate-900/40 px-4 py-3">
                <span className={cn('rounded-xl border p-2', METRIC_COMPACT[group.tone])}>
                  <Icono className="h-4 w-4" />
                </span>

                <button
                  type="button"
                  onClick={() => setPlegadas({ ...plegadas, [group.category]: !plegada })}
                  className="min-w-0 flex-1 text-left"
                >
                  <span className="flex items-center gap-2">
                    <span className="truncate text-[11px] font-black uppercase tracking-wider text-white">
                      {group.category}
                    </span>
                    <span
                      className={cn(
                        'flex-shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold',
                        activos ? METRIC_COMPACT[group.tone] : 'border-slate-700 text-slate-500',
                      )}
                    >
                      {activos}/{group.perms.length}
                    </span>
                  </span>
                  <span className="mt-0.5 block text-[10px] text-slate-500">{group.hint}</span>
                </button>

                <div className="flex flex-shrink-0 items-center gap-1">
                  {!disabled && (
                    <button
                      type="button"
                      onClick={() => marcarCategoria(group, activos < group.perms.length)}
                      className={cn(
                        'rounded-lg border border-slate-700 px-2 py-1 text-[9px] font-black uppercase tracking-wider transition-colors hover:text-white',
                        activos < group.perms.length ? METRIC_TEXT[group.tone] : 'text-slate-500',
                      )}
                      title={activos < group.perms.length ? 'Conceder toda la categoría' : 'Quitar toda la categoría'}
                    >
                      {activos < group.perms.length ? 'Todo' : 'Nada'}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setPlegadas({ ...plegadas, [group.category]: !plegada })}
                    aria-label={plegada ? 'Desplegar categoría' : 'Plegar categoría'}
                    className="rounded-lg p-1 text-slate-500 transition-colors hover:text-white"
                  >
                    <ChevronDown className={cn('h-4 w-4 transition-transform', plegada && '-rotate-90')} />
                  </button>
                </div>
              </header>

              {/* Una regla del tono a lo ancho, proporcional a lo concedido: de un
                  vistazo se ve qué categorías están abiertas sin leer el contador. */}
              <div className="h-0.5 w-full bg-slate-800/60">
                <div
                  className={cn('h-full transition-all duration-300', METRIC_BAR[group.tone])}
                  style={{ width: `${(activos / group.perms.length) * 100}%` }}
                />
              </div>

              {!plegada && (
                <div className="space-y-3 p-3">
                  {porBloques(perms).map((bloque) => (
                    <div key={bloque.section}>
                      <p className="mb-1.5 flex items-center gap-2 text-[9px] font-black uppercase tracking-wider text-slate-500">
                        <span>{bloque.section}</span>
                        <span className="h-px flex-1 bg-slate-800" />
                      </p>
                      <div className="grid grid-cols-1 gap-1.5 md:grid-cols-2">
                        {bloque.perms.map((permission) => (
                          <Switch
                            key={permission.key}
                            checked={Boolean(permissions[permission.key])}
                            onChange={(valor) => escribir({ [permission.key]: valor })}
                            label={permission.label}
                            tone={group.tone}
                            disabled={disabled}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          );
        })}

        {visibles.length === 0 && (
          <EmptyState
            icon={<SearchX />}
            title="Ningún permiso coincide"
            description={`Nada en la matriz se llama «${busqueda.trim()}».`}
            size="md"
          />
        )}
      </div>
    </div>
  );
}
