import React from 'react';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'outline' | 'forest' | 'lime' | 'muted';
  size?: 'sm' | 'md';
  children: React.ReactNode;
}

export const Badge: React.FC<BadgeProps> = ({
  variant = 'default',
  size = 'md',
  className = '',
  children,
  ...props
}) => {
  const sizeStyles = {
    sm: 'px-2 py-0.5 text-xs gap-1',
    md: 'px-2.5 py-1 text-xs gap-1.5',
  };

  const variantStyles = {
    default: 'bg-theme-surface border border-theme-border text-theme-text',
    outline: 'border border-theme-border text-theme-text-muted bg-transparent',
    forest: 'bg-forest text-cream dark:bg-forest/80',
    lime: 'bg-lime text-forest font-medium',
    muted: 'bg-theme-border/50 text-theme-text-muted',
  };

  return (
    <span
      className={`inline-flex items-center font-medium rounded-full ${sizeStyles[size]} ${variantStyles[variant]} ${className}`}
      {...props}
    >
      {children}
    </span>
  );
};
