import { useState, type FormEvent } from 'react';
import { useForm } from '@inertiajs/react';
import { Lock, ShieldCheck, User } from 'lucide-react';

import { AuthCard, TextField } from '@/shared/ui';
import { AuthForm } from '@/features/config/components/AuthForm';

interface ConfigSetupProps {
  errorMessage?: string;
}

const MIN_PASSWORD_LENGTH = 8;

export default function ConfigSetup({ errorMessage }: ConfigSetupProps) {
  const { data, setData, post, processing, errors } = useForm({
    username: '',
    password: '',
    password_confirm: '',
  });
  const [mismatch, setMismatch] = useState<string | undefined>();

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (data.password !== data.password_confirm) {
      setMismatch('Las contraseñas no coinciden.');
      return;
    }
    setMismatch(undefined);
    post('/auth/setup/');
  };

  return (
    <AuthCard
      title="Instalador Inicial NetOwl"
      subtitle="Crea la cuenta del Administrador Principal (Superuser)"
      brand={
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-brand/20 bg-brand/10 shadow-lg shadow-brand/10">
          <ShieldCheck className="h-8 w-8 text-brand" />
        </div>
      }
    >
      <AuthForm
        error={mismatch || errorMessage || errors.username || errors.password}
        onSubmit={handleSubmit}
        isSubmitting={processing}
        submitLabel="Crear Administrador y Comenzar"
      >
        <TextField
          label="Nombre de Usuario Administrador"
          icon={<User />}
          value={data.username}
          onChange={(e) => setData('username', e.target.value)}
          placeholder="admin"
          autoComplete="username"
          required
        />
        <TextField
          label="Contraseña"
          type="password"
          icon={<Lock />}
          value={data.password}
          onChange={(e) => setData('password', e.target.value)}
          placeholder={`Mínimo ${MIN_PASSWORD_LENGTH} caracteres`}
          minLength={MIN_PASSWORD_LENGTH}
          autoComplete="new-password"
          required
        />
        <TextField
          label="Confirmar Contraseña"
          type="password"
          icon={<Lock />}
          value={data.password_confirm}
          onChange={(e) => setData('password_confirm', e.target.value)}
          placeholder="Repite la contraseña"
          minLength={MIN_PASSWORD_LENGTH}
          autoComplete="new-password"
          required
        />
      </AuthForm>
    </AuthCard>
  );
}
