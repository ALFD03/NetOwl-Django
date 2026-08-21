import React from 'react';
import { Link, usePage } from '@inertiajs/react';
import type { AppPageProps } from '@/types/inertia';
import { Headset, Gauge, BarChart3, Table } from 'lucide-react';

interface SupportHeaderProps {
  activeTab: 'dashboard' | 'analytics' | 'results';
}

export const SupportHeader: React.FC<SupportHeaderProps> = ({ activeTab }) => {
  const { props } = usePage<AppPageProps>();

  const { user } = props.auth;
  const { profile } = user;

  const tabs = [
    { id: 'dashboard', label: 'Dashboard', href: '/support/dashboard/', icon: Gauge, perm: true },
    { id: 'analytics', label: 'Analytics', href: '/support/analytics/', icon: BarChart3, perm: profile.can_view_support_analytics },
    { id: 'results', label: 'Results', href: '/support/results/', icon: Table, perm: profile.can_view_support_results },
  ];

  return (
    <div className="bg-surface-secondary border border-slate-800 rounded-xl p-4 mb-6 shadow-lg flex flex-wrap items-center justify-between gap-4">
      <div className="flex items-center gap-2 text-white font-bold text-lg">
        <Headset className="w-6 h-6 text-brand" />
        <span>Technical Support</span>
      </div>

      <nav className="flex flex-wrap items-center gap-1.5">
        {tabs.filter(t => t.perm || user.is_superuser).map((tab) => {
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