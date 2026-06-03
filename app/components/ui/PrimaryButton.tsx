import Link from 'next/link';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

type PrimaryButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  href?: string;
  variant?: 'primary' | 'secondary' | 'ghost';
  children: ReactNode;
  onClick?: () => void;
};

const variantClass = {
  primary:
    'border border-primary/20 bg-gradient-to-r from-sky-600 to-blue-700 text-white shadow-md shadow-sky-900/10 hover:from-sky-500 hover:to-blue-600 focus-visible:outline-ring dark:from-sky-500 dark:to-blue-600 dark:hover:from-sky-400 dark:hover:to-blue-500',
  secondary:
    'border border-border bg-card text-foreground shadow-sm hover:border-primary/25 hover:bg-muted hover:shadow-md focus-visible:outline-ring',
  ghost:
    'border border-transparent bg-transparent text-muted-foreground hover:border-border hover:bg-muted hover:text-foreground focus-visible:outline-ring',
};

export default function PrimaryButton({
  href,
  variant = 'primary',
  className = '',
  children,
  onClick,
  type = 'button',
  ...props
}: PrimaryButtonProps) {
  const classes =
    'inline-flex items-center justify-center rounded-full px-5 py-2.5 text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-60 ' +
    variantClass[variant] +
    ` ${className}`;

  if (href) {
    const isExternal = /^https?:\/\//.test(href);

    if (isExternal) {
      return (
        <a
          href={href}
          className={classes}
          onClick={onClick}
          target="_blank"
          rel="noopener noreferrer"
        >
          {children}
        </a>
      );
    }

    return (
      <Link href={href} className={classes} onClick={onClick}>
        {children}
      </Link>
    );
  }

  return (
    <button type={type} className={classes} onClick={onClick} {...props}>
      {children}
    </button>
  );
}
