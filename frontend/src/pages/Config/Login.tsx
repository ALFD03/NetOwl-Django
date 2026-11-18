/** `/auth/login/` (SPA). */

import { useTheme } from '@/shared/hooks/useTheme';
import { AuthCard } from '@/shared/ui';
import { LoginForm } from '@/features/config/components/LoginForm';

export default function Login() {
  const { theme } = useTheme();
  return (
    <AuthCard
      title="NetOwl Portal"
      subtitle="Acceso seguro a analíticas corporativas"
      brand={
        <img
          src={theme === 'light' ? '/static/img/logo_light.png' : '/static/img/logo_dark.png'}
          alt="NetOwl"
          className="h-16 w-auto object-contain transition-transform hover:scale-105"
        />
      }
    >
      <LoginForm />
    </AuthCard>
  );
}
