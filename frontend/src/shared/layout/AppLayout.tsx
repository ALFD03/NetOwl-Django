import React from 'react';
import { motion } from 'framer-motion';
import { usePage } from '@inertiajs/react';

import type { AuthenticatedPageProps } from '@/shared/types/inertia';
import { Sidebar } from './Sidebar';

interface Props {
  children: React.ReactNode;
  title?: string;
}

export function AppLayout({ children, title }: Props) {
  const { url, props } = usePage<AuthenticatedPageProps>();
  const username = props.auth.user.username;

  return (
    <div className="flex min-h-screen bg-surface-primary text-slate-100">
      <Sidebar url={url} username={username} />

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
}
