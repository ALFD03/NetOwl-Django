import React from 'react';
import { Link } from '@inertiajs/react';
import { CloudDownload, Layers, Users, Headset, Clock } from 'lucide-react';

interface ImportsHeaderProps {
  activeTab: 'subscriptions' | 'crm' | 'support' | 'history';
}

export const ImportsHeader: React.FC<ImportsHeaderProps> = ({ activeTab }) => {
  const tabs = [
    { id: 'subscriptions', label: 'Subscriptions', href: '/imports/subscriptions/', icon: Layers },
    { id: 'crm', label: 'CRM Analytics', href: '/imports/crm/', icon: Users },
    { id: 'support', label: 'Technical Support', href: '/imports/support/', icon: Headset },
    { id: 'history', label: 'Historial de Acciones', href: '/imports/history/', icon: Clock },
  ];

  return (
    <div className="bg-surface-secondary border border-slate-800 rounded-xl p-4 mb-6 shadow-lg flex flex-wrap items-center justify-between gap-4">
      <div className="flex items-center gap-2 text-white font-bold text-lg">
        <CloudDownload className="w-6 h-6 text-brand" />
        <span>Módulo de Importaciones</span>
      </div>

      <nav className="flex flex-wrap items-center gap-1.5">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <Link
              key={tab.id}
              href={tab.href}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition-all ${
                isActive
                  ? 'bg-brand text-white shadow-md shadow-brand/20'
                  : 'text-slate-400 hover:text-white hover:bg-surface-hover'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{tab.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
};