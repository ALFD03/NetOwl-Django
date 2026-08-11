import React from 'react';
import { useForm } from '@inertiajs/react';
import { Button } from '@/components/UI/Button';
import { Lock, User, AlertCircle } from 'lucide-react';

interface Props {
  errorMessage?: string;
}

export default function ConfigLogin({ errorMessage }: Props) {
  const { data, setData, post, processing, errors } = useForm({
    username: '',
    password: '',
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    post('/auth/login/');
  };

  return (
    <div className="min-h-screen bg-surface-primary flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-surface-secondary border border-slate-800 rounded-2xl p-8 shadow-2xl">
        <div className="text-center mb-8">
          <img 
            src="/static/img/logo.png" 
            alt="NetOwl Logo" 
            className="h-16 w-auto mx-auto mb-4 object-contain transition-transform hover:scale-105" 
          />
          <h2 className="text-2xl font-bold text-white tracking-tight">NetOwl Portal</h2>
          <p className="text-xs text-slate-400 mt-1">Acceso seguro a analíticas corporativas</p>
        </div>

        {(errorMessage || errors.username || errors.password) && (
          <div className="mb-6 p-3 bg-rose-500/20 border border-rose-500/30 rounded-lg text-xs text-rose-400 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{errorMessage || errors.username || errors.password || 'Error al iniciar sesión'}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Nombre de Usuario
            </label>
            <div className="relative">
              <User className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={data.username}
                onChange={(e) => setData('username', e.target.value)}
                required
                placeholder="Escribe tu usuario"
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
                placeholder="••••••••"
                className="w-full bg-surface-tertiary border border-slate-700 rounded-lg pl-9 pr-4 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand"
              />
            </div>
          </div>

          <Button type="submit" isLoading={processing} className="w-full py-2.5 mt-2">
            Ingresar al Sistema
          </Button>
        </form>
      </div>
    </div>
  );
}