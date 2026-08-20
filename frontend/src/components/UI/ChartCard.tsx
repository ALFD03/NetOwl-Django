import React from 'react';
import { NeonContainer, NeonTheme } from './NeonContainer';

interface ChartCardProps {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  headerAction?: React.ReactNode;
  children: React.ReactNode;
  theme?: NeonTheme;
  className?: string;
}

export const ChartCard: React.FC<ChartCardProps> = ({
  title,
  subtitle,
  icon,
  headerAction,
  children,
  theme = 'slate',
  className = '',
}) => {
  return (
    <NeonContainer
      title={title}
      subtitle={subtitle}
      icon={icon}
      headerAction={headerAction}
      theme={theme}
      className={className}
    >
      <div className="h-72 w-full">{children}</div>
    </NeonContainer>
  );
};