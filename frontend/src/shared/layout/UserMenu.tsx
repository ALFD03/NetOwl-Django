import { LogOut, ShieldCheck } from 'lucide-react';
import { Link } from '@inertiajs/react';

interface UserMenuProps {
  username: string;
  canManageUsers: boolean;
  isUsersPageActive: boolean;
}

export function UserMenu({
  username,
  canManageUsers,
  isUsersPageActive,
}: UserMenuProps) {
  return (
  <div className="space-y-2 pt-4 border-t border-slate-800">
    {canManageUsers && (
      <Link
        href="/auth/users/"
        className={`flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-semibold border transition-colors ${
          isUsersPageActive
            ? 'bg-brand text-white border-brand'
            : 'border-slate-700 text-slate-300 hover:bg-surface-hover hover:text-white'
        }`}
      >
        <ShieldCheck className="w-4 h-4 text-brand" />
        <span>Configuración</span>
      </Link>
    )}

    <div className="flex items-center justify-between p-2 rounded-lg bg-surface-tertiary text-xs">
      <div className="truncate">
        <p className="text-slate-400">Sesión:</p>
        <p className="font-semibold text-white truncate">{username}</p>
      </div>

      <a
        href="/auth/logout/"
        className="p-1.5 hover:bg-red-500/20 text-red-400 rounded-md transition-colors"
        title="Cerrar Sesión"
        aria-label="Cerrar Sesión"
      >
        <LogOut className="w-4 h-4" />
      </a>
    </div>
  </div>
);
}
