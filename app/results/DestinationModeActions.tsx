'use client';

import {
  buildPointAbModeActions,
  type DestinationModeAction,
} from '../../lib/parking/pointAbModeActions';

export { buildPointAbModeActions };
export type { DestinationModeAction };

type DestinationModeActionsProps = {
  actions: DestinationModeAction[];
  compact?: boolean;
};

export default function DestinationModeActions({
  actions,
  compact = false,
}: DestinationModeActionsProps) {
  const visible = actions.filter(Boolean).slice(0, 3);
  const buttonClass = compact
    ? 'inline-flex w-full items-center justify-center rounded-2xl px-4 py-2.5 text-sm font-semibold'
    : 'inline-flex w-full items-center justify-center rounded-2xl px-4 py-2.5 text-sm font-semibold';

  const primaryClass =
    buttonClass + ' bg-blue-600 text-white shadow-sm shadow-blue-600/20 hover:bg-blue-700';
  const secondaryClass =
    buttonClass +
    ' border border-slate-200 bg-white text-slate-900 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800';

  return (
    <div className="mt-3 flex w-full flex-col gap-2">
      {visible.map((action, index) => {
        const className = index === 0 ? primaryClass : secondaryClass;

        if (action.href) {
          return (
            <a
              key={action.label}
              href={action.href}
              target="_blank"
              rel="noopener noreferrer"
              className={className}
            >
              {action.label}
            </a>
          );
        }

        return (
          <button
            key={action.label}
            type="button"
            onClick={action.onClick}
            disabled={action.disabled}
            aria-expanded={
              action.ariaControls != null ? action.ariaExpanded ?? false : undefined
            }
            aria-controls={action.ariaControls}
            className={
              action.disabled
                ? className + ' cursor-not-allowed opacity-60'
                : className
            }
          >
            {action.label}
          </button>
        );
      })}
    </div>
  );
}
