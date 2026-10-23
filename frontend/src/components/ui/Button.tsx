import React from 'react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline';
  size?: 'sm' | 'md' | 'lg';
  children: React.ReactNode;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'primary',
      size = 'md',
      className = '',
      disabled,
      children,
      ...props
    },
    ref
  ) => {
    const baseStyles =
      'inline-flex items-center justify-center font-medium rounded-lg transition-colors duration-150 motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-forest dark:focus-visible:ring-lime disabled:opacity-50 disabled:cursor-not-allowed';

    const sizeStyles = {
      sm: 'px-3 py-1.5 text-xs gap-1.5',
      md: 'px-4 py-2 text-sm gap-2',
      lg: 'px-5 py-2.5 text-base gap-2.5',
    };

    const variantStyles = {
      primary:
        'bg-forest text-cream dark:bg-lime dark:text-forest hover:bg-forest/90 dark:hover:bg-lime/90 shadow-sm',
      secondary:
        'bg-theme-surface text-theme-text border border-theme-border hover:bg-cream dark:hover:bg-slate-green/20 shadow-sm',
      ghost:
        'bg-transparent text-theme-text hover:bg-cream dark:hover:bg-slate-green/20',
      danger:
        'bg-severity-critical text-cream hover:bg-severity-critical/90 shadow-sm',
      outline:
        'bg-transparent border border-theme-border text-theme-text hover:bg-cream dark:hover:bg-slate-green/20',
    };

    return (
      <button
        ref={ref}
        disabled={disabled}
        className={`${baseStyles} ${sizeStyles[size]} ${variantStyles[variant]} ${className}`}
        {...props}
      >
        {children}
      </button>
    );
  }
);

Button.displayName = 'Button';
