import React from 'react';
import { useForm } from '@inertiajs/react';
import { Button } from '@/components/UI/Button';
import { ShieldCheck, User, Lock, AlertCircle } from 'lucide-react';

interface Props {
  errorMessage?: string;
}

export default function ConfigSetup({ errorMessage }: Props) {
  const { data, setData, post, processing, errors } = useForm({
    username: '',
    password: '',
    password_confirm: '',
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (data.password !== data.password_confirm) {
      alert('Las contraseñas no coinciden');
      return;
    }
    post('/auth/setup/');
  };

  return (
    <div className="min-h-screen bg-surface-primary flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-surface-secondary border border-slate-800 rounded-2xl p-8 shadow-2xl">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-brand/10 border border-brand/20 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-brand/10">
            <ShieldCheck className="w-8 h-8 text-brand" />
          </div>
          <h2 className="text-2xl font-bold text-white tracking-tight">Instalador Inicial NetOwl</h2>
          <p className="text-xs text-slate-400 mt-1">Crea la cuenta del Administrador Principal (Superuser)</p>
        </div>

        {(errorMessage || errors.username || errors.password) && (
          <div className="mb-6 p-3 bg-rose-500/20 border border-rose-500/30 rounded-lg text-xs text-rose-400 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{errorMessage || errors.username || errors.password || 'Error en el registro'}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Nombre de Usuario Administrador
            </label>
            <div className="relative">
              <User className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={data.username}
                onChange={(e) => setData('username', e.target.value)}
                required
                placeholder="admin"
                className="w-full bg-surface-tertiary border border-slate-700 rounded-lg pl-9 pr-4 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Contraseña
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="password"
                value={data.password}
                onChange={(e) => setData('password', e.target.value)}
                required
                minLength={8}
                placeholder="Mínimo 8 caracteres"
                className="w-full bg-surface-tertiary border border-slate-700 rounded-lg pl-9 pr-4 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Confirmar Contraseña
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="password"
                value={data.password_confirm}
                onChange={(e) => setData('password_confirm', e.target.value)}
                required
                minLength={8}
                placeholder="Repite la contraseña"
                className="w-full bg-surface-tertiary border border-slate-700 rounded-lg pl-9 pr-4 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand"
              />
            </div>
          </div>

          <Button type="submit" isLoading={processing} className="w-full py-2.5 mt-2">
            Crear Administrador y Comenzar
          </Button>
        </form>
      </div>
    </div>
  );
}