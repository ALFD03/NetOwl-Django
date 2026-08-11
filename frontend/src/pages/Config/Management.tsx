import React, { useState } from 'react';
import { AppLayout } from '@/components/Layout/AppLayout';
import { DataTable, Column } from '@/components/UI/DataTable';
import { Button } from '@/components/UI/Button';
import { Users, Shield, ShieldCheck, Key, Trash2 } from 'lucide-react';

interface UserData {
  id: number;
  username: string;
  role_display: string;
  group_name?: string;
  is_superuser: boolean;
}

interface Props {
  users: UserData[];
  groups: any[];
}

export default function ConfigManagement({ users = [] }: Props) {
  const columns: Column<UserData>[] = [
    {
      header: 'Usuario',
      accessor: (r) => (
        <div className="flex items-center gap-2">
          <span className="font-bold text-white">{r.username}</span>
          {r.is_superuser && (
            <span className="bg-brand/20 text-brand px-2 py-0.5 rounded-full text-[10px] font-bold">
              Superuser
            </span>
          )}
        </div>
      ),
    },
    { header: 'Rol', accessor: 'role_display' },
    {
      header: 'Grupo de Permisos',
      accessor: (r) =>
        r.group_name ? (
          <span className="text-brand font-medium">{r.group_name}</span>
        ) : (
          <span className="text-slate-500">Personalizado</span>
        ),
    },
  ];

  return (
    <AppLayout title="Configuración de Permisos y Usuarios">
      <div className="bg-surface-secondary border border-slate-800 rounded-xl p-4 mb-6 shadow-lg flex items-center justify-between">
        <div className="flex items-center gap-2 text-white font-bold text-lg">
          <ShieldCheck className="w-6 h-6 text-brand" />
          <span>Gestión de Seguridad</span>
        </div>
      </div>

      <DataTable
        columns={columns}
        data={users}
        searchable
        searchPlaceholder="Buscar usuario..."
      />
    </AppLayout>
  );
}