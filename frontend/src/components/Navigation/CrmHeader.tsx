import React from 'react';
import { Link, usePage } from '@inertiajs/react';
import { Users, Gauge, BarChart3, Table } from 'lucide-react';

interface CrmHeaderProps {
  activeTab: 'dashboard' | 'analytics' | 'results';
}

export const CrmHeader: React.FC<CrmHeaderProps> = ({ activeTab }) => {
  const { props } = usePage();
  const user = (props as any).auth?.user;
  const profile = user?.profile || {};

  const tabs = [
    { id: 'dashboard', label: 'Dashboard', href: '/crm/dashboard/', icon: Gauge, perm: true },
    { id: 'analytics', label: 'Analytics', href: '/crm/analytics/', icon: BarChart3, perm: profile.can_view_crm_analytics ?? true },
    { id: 'results', label: 'Results', href: '/crm/results/', icon: Table, perm: profile.can_view_crm_results ?? true },
  ];

  return (
    <div className="bg-surface-secondary border border-slate-800 rounded-xl p-4 mb-6 shadow-lg flex flex-wrap items-center justify-between gap-4">
      <div className="flex items-center gap-2 text-white font-bold text-lg">
        <Users className="w-6 h-6 text-brand" />
        <span>CRM Analytics</span>
      </div>

      <nav className="flex flex-wrap items-center gap-1.5">
        {tabs.filter(t => t.perm || user?.is_superuser).map((tab) => {
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