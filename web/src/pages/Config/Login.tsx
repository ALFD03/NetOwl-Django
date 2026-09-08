import type { FormEvent } from 'react';
import { useForm } from '@inertiajs/react';
import { Lock, User } from 'lucide-react';

import { AuthCard, TextField } from '@/shared/ui';
import { AuthForm } from '@/features/config/components/AuthForm';

interface ConfigLoginProps {
  errorMessage?: string;
}

export default function ConfigLogin({ errorMessage }: ConfigLoginProps) {
  const { data, setData, post, processing, errors } = useForm({ username: '', password: '' });

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    post('/auth/login/');
  };

  return (
    <AuthCard
      title="NetOwl Portal"
      subtitle="Acceso seguro a analíticas corporativas"
      brand={
        <img
          src="/static/img/logo.png"
          alt="NetOwl"
          className="h-16 w-auto object-contain transition-transform hover:scale-105"
        />
      }
    >
      <AuthForm
        error={errorMessage || errors.username || errors.password}
        onSubmit={handleSubmit}
        isSubmitting={processing}
        submitLabel="Ingresar al Sistema"
      >
        <TextField
          label="Nombre de Usuario"
          icon={<User />}
          value={data.username}
          onChange={(e) => setData('username', e.target.value)}
          placeholder="Escribe tu usuario"
          autoComplete="username"
          required
        />
        <TextField
          label="Contraseña"
          type="password"
          icon={<Lock />}
          value={data.password}
          onChange={(e) => setData('password', e.target.value)}
          placeholder="••••••••"
          autoComplete="current-password"
          required
        />
      </AuthForm>
    </AuthCard>
  );
}
