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
  /**
   * Permisos que quien edita no puede conceder: no los tiene y la matriz no
   * los traía. Se ven apagados y no se pueden encender; el servidor los
   * rechaza igual (ver `permisos_fuera_de_alcance`).
   */
  blocked?: ReadonlySet<string>;
}

/** Los permisos visibles de una tarjeta, partidos en bloques y en orden de riesgo. */
function byBlocks(perms: PermissionCategory['perms']) {
  return PERMISSION_SECTIONS.map((section) => ({
    section,
    perms: perms.filter((permission) => permission.section === section),
  })).filter((block) => block.perms.length > 0);
}

/** Cuántos de los permisos de una categoría están concedidos. */
function countItems(group: PermissionCategory, permissions: Record<string, boolean>) {
  return group.perms.filter((permission) => permissions[permission.key]).length;
}

export function PermissionEditor({ permissions, onChange, disabled = false, blocked }: Props) {
  const [query, setQuery] = useState('');
  // Colapsadas y no expandidas: la matriz entera abierta es lo que hace falta
  // ver al llegar; plegar es la excepción.
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const term = query.trim().toLowerCase();

  /** Las categorías que la búsqueda deja en pie, con sus permisos ya filtrados. */
  const visible = useMemo(() => {
    if (!term) return PERMISSION_GROUPS.map((group) => ({ group, perms: group.perms }));
    return PERMISSION_GROUPS.map((group) => ({
      group,
      perms: group.perms.filter(
        (permission) =>
          permission.label.toLowerCase().includes(term) ||
          group.category.toLowerCase().includes(term),
      ),
    })).filter((entry) => entry.perms.length > 0);
  }, [term]);

  const grantedCount = useMemo(
    () => PERMISSION_GROUPS.reduce((total, group) => total + countItems(group, permissions), 0),
    [permissions],
  );

  const write = (changes: Record<string, boolean>) => {
    if (disabled) return;
    const allowed = Object.fromEntries(
      Object.entries(changes).filter(([permKey, on]) => !(on && blocked?.has(permKey))),
    );
    onChange({ ...permissions, ...allowed });
  };

  const markAll = (on: boolean) => {
    write(
      Object.fromEntries(
        PERMISSION_GROUPS.flatMap((group) => group.perms.map((permission) => [permission.key, on])),
      ),
    );
  };

  const markCategory = (group: PermissionCategory, on: boolean) => {
    write(Object.fromEntries(group.perms.map((permission) => [permission.key, on])));
  };

  const percent = TOTAL_PERMISSIONS ? Math.round((grantedCount / TOTAL_PERMISSIONS) * 100) : 0;

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
                {grantedCount} <span className="font-medium text-slate-400">de {TOTAL_PERMISSIONS} concedidos</span>
              </p>
            </div>
          </div>

          {!disabled && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => markAll(true)}
                className="rounded-xl border border-emerald-500/30 bg-emerald-950/40 px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-emerald-400 transition-colors hover:bg-emerald-950/70"
              >
                Marcar todo
              </button>
              <button
                type="button"
                onClick={() => markAll(false)}
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
            style={{ width: `${percent}%` }}
          />
        </div>

        {!disabled && blocked && blocked.size > 0 && (
          <p className="flex items-start gap-2 text-[11px] text-slate-500">
            <Lock className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
            <span>Los permisos apagados con candado son los que tú no tienes: no puedes concederlos.</span>
          </p>
        )}

        <SearchInput
          value={query}
          placeholder="Buscar un permiso..."
          onChange={setQuery}
          className="w-full rounded-xl border bg-surface-deep"
        />
      </div>

      {/* Una categoría por módulo, en columna. El scroll es vertical: a dos
          columnas había que leer en zigzag para saber qué abarcaba un módulo. */}
      <div className="max-h-[55vh] space-y-3 overflow-y-auto pr-1 custom-scrollbar">
        {visible.map(({ group, perms }) => {
          const active = countItems(group, permissions);
          const isCollapsed = Boolean(collapsed[group.category]);
          const IconComponent = group.icon;

          return (
            <section
              key={group.category}
              className="rounded-2xl border border-slate-800 bg-surface-primary overflow-hidden"
            >
              <header className="flex items-start gap-3 border-b border-slate-800/70 bg-slate-900/40 px-4 py-3">
                <span className={cn('rounded-xl border p-2', METRIC_COMPACT[group.tone])}>
                  <IconComponent className="h-4 w-4" />
                </span>

                <button
                  type="button"
                  onClick={() => setCollapsed({ ...collapsed, [group.category]: !isCollapsed })}
                  className="min-w-0 flex-1 text-left"
                >
                  <span className="flex items-center gap-2">
                    <span className="truncate text-[11px] font-black uppercase tracking-wider text-white">
                      {group.category}
                    </span>
                    <span
                      className={cn(
                        'flex-shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold',
                        active ? METRIC_COMPACT[group.tone] : 'border-slate-700 text-slate-500',
                      )}
                    >
                      {active}/{group.perms.length}
                    </span>
                  </span>
                  <span className="mt-0.5 block text-[10px] text-slate-500">{group.hint}</span>
                </button>

                <div className="flex flex-shrink-0 items-center gap-1">
                  {!disabled && (
                    <button
                      type="button"
                      onClick={() => markCategory(group, active < group.perms.length)}
                      className={cn(
                        'rounded-lg border border-slate-700 px-2 py-1 text-[9px] font-black uppercase tracking-wider transition-colors hover:text-white',
                        active < group.perms.length ? METRIC_TEXT[group.tone] : 'text-slate-500',
                      )}
                      title={active < group.perms.length ? 'Conceder toda la categoría' : 'Quitar toda la categoría'}
                    >
                      {active < group.perms.length ? 'Todo' : 'Nada'}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setCollapsed({ ...collapsed, [group.category]: !isCollapsed })}
                    aria-label={isCollapsed ? 'Desplegar categoría' : 'Plegar categoría'}
                    className="rounded-lg p-1 text-slate-500 transition-colors hover:text-white"
                  >
                    <ChevronDown className={cn('h-4 w-4 transition-transform', isCollapsed && '-rotate-90')} />
                  </button>
                </div>
              </header>

              {/* Una regla del tono a lo ancho, proporcional a lo concedido: de un
                  vistazo se ve qué categorías están abiertas sin leer el contador. */}
              <div className="h-0.5 w-full bg-slate-800/60">
                <div
                  className={cn('h-full transition-all duration-300', METRIC_BAR[group.tone])}
                  style={{ width: `${(active / group.perms.length) * 100}%` }}
                />
              </div>

              {!isCollapsed && (
                <div className="space-y-3 p-3">
                  {byBlocks(perms).map((block) => (
                    <div key={block.section}>
                      <p className="mb-1.5 flex items-center gap-2 text-[9px] font-black uppercase tracking-wider text-slate-500">
                        <span>{block.section}</span>
                        <span className="h-px flex-1 bg-slate-800" />
                      </p>
                      <div className="grid grid-cols-1 gap-1.5 md:grid-cols-2">
                        {block.perms.map((permission) => (
                          <Switch
                            key={permission.key}
                            checked={Boolean(permissions[permission.key])}
                            onChange={(on) => write({ [permission.key]: on })}
                            label={permission.label}
                            tone={group.tone}
                            disabled={disabled || Boolean(blocked?.has(permission.key))}
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

        {visible.length === 0 && (
          <EmptyState
            icon={<SearchX />}
            title="Ningún permiso coincide"
            description={`Nada en la matriz se llama «${query.trim()}».`}
            size="md"
          />
        )}
      </div>
    </div>
  );
}
