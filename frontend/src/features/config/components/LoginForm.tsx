/** Formulario de entrada: abre la sesión con `/api/auth/login/` y va a la primera página permitida. */

import { useState } from 'react';
import type { FormEvent } from 'react';
import { Lock, User } from 'lucide-react';

import { useAuth } from '@/shared/auth/AuthContext';
import { getApiErrorMessage } from '@/shared/lib/api';
import { TextField } from '@/shared/ui';

import { AuthForm } from './AuthForm';

/** `?next=` solo si es una ruta propia (`/x`), nunca `//host`, `/\host` ni una URL externa. */
function safeNext(): string | null {
  const next = new URLSearchParams(window.location.search).get('next');
  // `/\host` lo trata el navegador como `//host`.
  return next && /^\/(?![/\\])/.test(next) ? next : null;
}

export function LoginForm() {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const user = await login(username.trim(), password);
      // Las páginas siguen en Inertia: recarga completa.
      window.location.assign(safeNext() ?? user.landing ?? '/');
    } catch (err) {
      setError(getApiErrorMessage(err, 'No se pudo iniciar sesión.'));
      setSubmitting(false);
    }
  };

  return (
    <AuthForm error={error} onSubmit={handleSubmit} isSubmitting={submitting} submitLabel="Ingresar al Sistema">
      <TextField
        label="Nombre de Usuario"
        icon={<User />}
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        placeholder="Escribe tu usuario"
        autoComplete="username"
        required
      />
      <TextField
        label="Contraseña"
        type="password"
        icon={<Lock />}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="••••••••"
        autoComplete="current-password"
        required
      />
    </AuthForm>
  );
}
