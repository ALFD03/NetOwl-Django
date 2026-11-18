/**
 * Los tokens de API: quién los tiene, cuándo se usaron y su alta o revocación.
 *
 * Un token actúa con los permisos de su cuenta, que necesita `can_use_api`. El
 * valor se enseña una sola vez, al crearlo: después solo queda su prefijo.
 */

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ban, Copy, KeyRound, Plus } from 'lucide-react';

import { usePermissions } from '@/shared/hooks/usePermissions';
import { AppLayout } from '@/shared/layout/AppLayout';
import { apiClient, getApiErrorMessage, tokensApi, type ApiTokenRow } from '@/shared/lib/api';
import { READONLY_TABLE, READONLY_TABLE_BODY, READONLY_TABLE_HEAD_STICKY } from '@/shared/ui/data/tableClasses';
import { Button, EmptyState, LoadingState, Modal, Panel, SelectMenu, StatusMessage, TextField } from '@/shared/ui';
import type { StatusTone } from '@/shared/ui';

const TOKENS_KEY = ['auth', 'tokens'] as const;

const VALIDITIES = [
  { value: '', label: 'Sin caducidad' },
  { value: '30', label: '30 días' },
  { value: '90', label: '90 días' },
  { value: '365', label: '1 año' },
];

function formatDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString('es-VE', { dateStyle: 'short', timeStyle: 'short' }) : '—';
}

function tokenState(token: ApiTokenRow): { text: string; tone: string } {
  if (token.revoked_at) return { text: 'Revocado', tone: 'text-rose-400' };
  if (!token.active) return { text: 'Caducado', tone: 'text-amber-400' };
  return { text: 'Activo', tone: 'text-emerald-400' };
}

interface Account {
  id: number;
  username: string;
}

/** Las cuentas a las que se puede dar un token, si quien mira puede verlas. */
function useAccounts(isEnabled: boolean) {
  return useQuery({
    queryKey: ['auth', 'users', 'options'],
    enabled: isEnabled,
    queryFn: async () =>
      (await apiClient.get<{ users: (Account & { permissions: Record<string, boolean>; is_superuser: boolean })[] }>(
        '/api/auth/users/',
      )).data.users.filter((u) => u.is_superuser || u.permissions.can_use_api),
  });
}

function NewToken({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const { can } = usePermissions();
  const accounts = useAccounts(can('can_view_users'));
  const [account, setAccount] = useState('');
  const [tokenName, setName] = useState('');
  const [validity, setValidity] = useState('90');
  const [created, setCreated] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const create = useMutation({
    mutationFn: () =>
      tokensApi.create({ user_id: Number(account), name: tokenName.trim(), expires_in_days: validity ? Number(validity) : null }),
    onSuccess: (token) => {
      setCreated(token.token);
      void queryClient.invalidateQueries({ queryKey: TOKENS_KEY });
    },
  });

  const copy = async () => {
    if (!created) return;
    await navigator.clipboard.writeText(created);
    setCopied(true);
  };

  return (
    <Modal isOpen onClose={onClose} title="Nuevo token de API" icon={<KeyRound className="h-5 w-5" />} size="md">
      {created ? (
        <div className="space-y-4">
          <StatusMessage
            status={{ type: 'warning', text: 'Cópialo ahora: no se vuelve a mostrar. Si se pierde, revócalo y crea otro.' }}
          />
          <code className="block break-all rounded-lg border border-slate-700 bg-surface-tertiary p-3 font-mono text-xs text-white">
            {created}
          </code>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" icon={<Copy className="h-4 w-4" />} onClick={() => void copy()}>
              {copied ? 'Copiado' : 'Copiar'}
            </Button>
            <Button onClick={onClose}>Listo</Button>
          </div>
        </div>
      ) : (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
        >
          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-slate-300">Cuenta</p>
            {accounts.isError || !can('can_view_users') ? (
              <TextField
                label="Id de la cuenta"
                type="number"
                min={1}
                value={account}
                onChange={(e) => setAccount(e.target.value)}
                required
              />
            ) : (
              <SelectMenu
                value={account}
                onChange={setAccount}
                placeholder={accounts.isPending ? 'Cargando…' : 'Elige la cuenta'}
                searchable
                options={(accounts.data ?? []).map((u) => ({ value: String(u.id), label: u.username }))}
              />
            )}
            <p className="text-[11px] text-slate-500">El token actúa con sus permisos. Solo aparecen las que tienen «Usar la API».</p>
          </div>
          <TextField
            label="Nombre"
            placeholder="Para qué aplicación es"
            maxLength={80}
            value={tokenName}
            onChange={(e) => setName(e.target.value)}
            required
          />
          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-slate-300">Caducidad</p>
            <SelectMenu value={validity} onChange={setValidity} options={VALIDITIES} />
          </div>
          {create.isError && (
            <StatusMessage status={{ type: 'error', text: getApiErrorMessage(create.error, 'No se pudo crear el token.') }} />
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" isLoading={create.isPending} disabled={!account || !tokenName.trim()}>
              Crear token
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}

export function TokensView() {
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [notice, setNotice] = useState<{ type: StatusTone; text: string } | null>(null);
  const tokens = useQuery({ queryKey: TOKENS_KEY, queryFn: tokensApi.list });

  const revokeToken = useMutation({
    mutationFn: tokensApi.revoke,
    onSuccess: (token) => {
      setNotice({ type: 'success', text: `Token «${token.name}» revocado.` });
      void queryClient.invalidateQueries({ queryKey: TOKENS_KEY });
    },
    onError: (error) => setNotice({ type: 'error', text: getApiErrorMessage(error, 'No se pudo revocar el token.') }),
  });

  return (
    <AppLayout title="Tokens de API">
      <div className="space-y-4">
        <StatusMessage status={notice} />
        <Panel
          title="Tokens"
          description="Otras aplicaciones usan la API con «Authorization: Bearer <token>». Todo lo que hacen queda en Auditoría."
          actions={
            <Button icon={<Plus className="h-4 w-4" />} onClick={() => setCreating(true)}>
              Nuevo token
            </Button>
          }
        >
          {tokens.isPending ? (
            <LoadingState message="Cargando tokens" />
          ) : tokens.isError ? (
            <StatusMessage status={{ type: 'error', text: getApiErrorMessage(tokens.error, 'No se pudieron cargar los tokens.') }} />
          ) : tokens.data.length === 0 ? (
            <EmptyState title="Todavía no hay tokens" icon={<KeyRound />} />
          ) : (
            <div className="overflow-x-auto">
              <table className={READONLY_TABLE}>
                <thead className={READONLY_TABLE_HEAD_STICKY}>
                  <tr>
                    {['Nombre', 'Prefijo', 'Cuenta', 'Estado', 'Creado', 'Caduca', 'Último uso', ''].map((h) => (
                      <th key={h} className="px-3 py-2">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className={READONLY_TABLE_BODY}>
                  {tokens.data.map((token) => {
                    const { text, tone } = tokenState(token);
                    return (
                      <tr key={token.id} className="text-slate-300">
                        <td className="px-3 py-2 font-semibold text-white">{token.name}</td>
                        <td className="px-3 py-2 font-mono">{token.prefix}…</td>
                        <td className="px-3 py-2">{token.user.username}</td>
                        <td className={`px-3 py-2 font-semibold ${tone}`}>{text}</td>
                        <td className="px-3 py-2">
                          {formatDate(token.created_at)}
                          {token.created_by && <span className="block text-[10px] text-slate-500">por {token.created_by}</span>}
                        </td>
                        <td className="px-3 py-2">{formatDate(token.expires_at)}</td>
                        <td className="px-3 py-2">
                          {formatDate(token.last_used_at)}
                          {token.last_used_ip && <span className="block text-[10px] text-slate-500">{token.last_used_ip}</span>}
                        </td>
                        <td className="px-3 py-2 text-right">
                          {!token.revoked_at && (
                            <Button
                              size="sm"
                              variant="outline"
                              icon={<Ban className="h-3.5 w-3.5" />}
                              isLoading={revokeToken.isPending && revokeToken.variables === token.id}
                              onClick={() => revokeToken.mutate(token.id)}
                            >
                              Revocar
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>
      {creating && <NewToken onClose={() => setCreating(false)} />}
    </AppLayout>
  );
}
