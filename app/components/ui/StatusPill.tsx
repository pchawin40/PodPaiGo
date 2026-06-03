type StatusPillProps = {
  children: React.ReactNode;
  tone?: 'default' | 'primary' | 'accent' | 'warning' | 'success' | 'danger' | 'muted';
  className?: string;
};

const toneClass: Record<NonNullable<StatusPillProps['tone']>, string> = {
  default: 'border-border bg-card text-foreground',
  primary: 'border-primary/20 bg-primary/10 text-primary dark:bg-travel-sky/10 dark:text-travel-sky',
  accent: 'border-accent/20 bg-accent/10 text-accent',
  warning: 'border-warning/25 bg-warning/10 text-warning',
  success: 'border-success/25 bg-success/10 text-success',
  danger: 'border-danger/25 bg-danger/10 text-danger',
  muted: 'border-border bg-muted text-muted-foreground',
};

export default function StatusPill({ children, tone = 'default', className = '' }: StatusPillProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold tracking-wide ${toneClass[tone]} ${className}`}
    >
      {children}
    </span>
  );
}
