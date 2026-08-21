import React from 'react';
import { Link, usePage } from '@inertiajs/react';
import type { AppPageProps } from '@/types/inertia';
import { motion } from 'framer-motion';
import { 
  Layers, 
  Users, 
  Headset, 
  CloudDownload, 
  ShieldCheck, 
  LogOut, 
  Moon, 
  Sun 
} from 'lucide-react';
import { useTheme } from '@/context/ThemeContext';

interface Props {
  children: React.ReactNode;
  title?: string;
}

export const AppLayout: React.FC<Props> = ({ children, title }) => {
  const { url, props } = usePage<AppPageProps>();

  const { theme, toggleTheme } = useTheme();
  const { user } = props.auth;
  const { profile } = user;

  const navigation = [
    { name: 'Subscriptions', href: '/subscriptions/dashboard/', icon: Layers, active: url.startsWith('/subscriptions'), perm: profile.can_view_subscriptions},
    { name: 'CRM Analytics', href: '/crm/dashboard/', icon: Users, active: url.startsWith('/crm'), perm: profile.can_view_crm },
    { name: 'Technical Support', href: '/support/dashboard/', icon: Headset, active: url.startsWith('/support'), perm: profile.can_view_support },
    { name: 'Imports', href: '/imports/subscriptions/', icon: CloudDownload, active: url.startsWith('/imports'), perm: profile.can_view_imports },
  ];

  const canManageUsers = profile.can_manage_users || user.is_superuser

  return (
    <div className="flex min-h-screen bg-surface-primary text-slate-100">
      {/* Sidebar Fija */}
      <aside className="w-64 bg-surface-secondary border-r border-slate-800 flex flex-col justify-between p-4 sticky top-0 h-screen z-30">
        <div>
          {/* Logo Brand */}
          <div className="flex items-center justify-center px-2 py-3 mb-6 border-b border-slate-800">
            <Link href="/" className="flex items-center justify-center">
              <img 
                src="/static/img/logo.png" 
                alt="NetOwl Logo" 
                className="h-12 w-auto object-contain transition-transform hover:scale-105" 
              />
            </Link>
          </div>


          {/* Menú de Navegación */}
          <nav className="space-y-1">
            {navigation.filter(item => item.perm).map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={`relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    item.active 
                      ? 'text-white bg-brand shadow-md shadow-brand/20' 
                      : 'text-slate-400 hover:text-white hover:bg-surface-hover'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  <span>{item.name}</span>
                  {item.active && (
                    <motion.div
                      layoutId="sidebar-active"
                      className="absolute left-0 w-1 h-6 bg-white rounded-r-full"
                      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                    />
                  )}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Footer Sidebar */}
        <div className="space-y-2 pt-4 border-t border-slate-800">
          {/* Botón Configuración de Usuarios */}
          {canManageUsers && (
            <Link
              href="/auth/users/"
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-semibold border transition-colors ${
                url.startsWith('/auth/users')
                  ? 'bg-brand text-white border-brand'
                  : 'border-slate-700 text-slate-300 hover:bg-surface-hover hover:text-white'
              }`}
            >
              <ShieldCheck className="w-4 h-4 text-brand" />
              <span>Configuración</span>
            </Link>
          )}

          {user && (
            <div className="flex items-center justify-between p-2 rounded-lg bg-surface-tertiary text-xs">
              <div className="truncate">
                <p className="text-slate-400">Sesión:</p>
                <p className="font-semibold text-white truncate">{user.username}</p>
              </div>
              <a href="/auth/logout/" className="p-1.5 hover:bg-red-500/20 text-red-400 rounded-md transition-colors" title="Cerrar Sesión">
                <LogOut className="w-4 h-4" />
              </a>
            </div>
          )}

          {/* <button
            onClick={toggleTheme}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-slate-700 text-xs font-medium text-slate-300 hover:bg-surface-hover transition-colors"
          >
            {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-slate-400" />}
            <span>{theme === 'dark' ? 'Modo Claro' : 'Modo Oscuro'}</span>
          </button> */}
        </div>
      </aside>

      {/* Área de Contenido Principal */}
      <main className="flex-1 p-8 overflow-y-auto">
        {title && (
          <header className="mb-8">
            <h2 className="text-2xl font-bold text-white tracking-tight">{title}</h2>
          </header>
        )}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
        >
          {children}
        </motion.div>
      </main>
    </div>
  );
};