'use client';

import { useId, useState, type ReactNode } from 'react';

type ExpandableSectionProps = {
  /** Short, scannable heading for the collapsed control. */
  title: string;
  /** Optional one-line summary shown next to the title while collapsed. */
  summary?: string;
  /** Whether the section starts expanded (uncontrolled usage). */
  defaultOpen?: boolean;
  /**
   * Controlled open state. When provided, the component does not manage its own
   * state — use together with {@link onOpenChange}. Useful for auto-opening a
   * section that hides a validation error.
   */
  open?: boolean;
  /** Called with the next open state on user toggle (controlled or uncontrolled). */
  onOpenChange?: (next: boolean) => void;
  children: ReactNode;
  className?: string;
  /** Extra classes for the expanded body wrapper. */
  contentClassName?: string;
};

/**
 * Accessible, dependency-free expand/collapse panel that matches the PodPaiGo
 * travel-card / ppg-section-panel visual language. The body stays mounted while
 * collapsed (via the `hidden` attribute) so form fields keep their values and
 * still participate in submission/validation when hidden.
 */
export default function ExpandableSection({
  title,
  summary,
  defaultOpen = false,
  open: controlledOpen,
  onOpenChange,
  children,
  className = '',
  contentClassName = '',
}: ExpandableSectionProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : uncontrolledOpen;
  const contentId = useId();

  const toggle = () => {
    const next = !open;
    if (!isControlled) setUncontrolledOpen(next);
    onOpenChange?.(next);
  };

  return (
    <div className={'ppg-section-panel overflow-hidden rounded-2xl ' + className}>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-controls={contentId}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-muted/40"
      >
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-foreground">{title}</span>
          {summary ? (
            <span className="mt-0.5 block truncate text-xs text-muted-foreground">{summary}</span>
          ) : null}
        </span>
        <span
          aria-hidden
          className={
            'shrink-0 text-sm text-muted-foreground transition-transform duration-200 ' +
            (open ? 'rotate-180' : '')
          }
        >
          ▾
        </span>
      </button>
      <div
        id={contentId}
        hidden={!open}
        className={'border-t border-border px-4 py-3 ' + contentClassName}
      >
        {children}
      </div>
    </div>
  );
}
