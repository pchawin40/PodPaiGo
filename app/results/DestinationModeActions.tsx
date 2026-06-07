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
}: DestinationModeActionsProps) {
  const visible = actions.filter(Boolean).slice(0, 3);
  const buttonClass =
    'flex w-full items-center justify-center rounded-2xl px-4 text-center text-sm font-semibold leading-tight whitespace-normal';

  const primaryClass =
    buttonClass +
    ' min-h-12 bg-blue-600 text-white shadow-sm shadow-blue-600/20 hover:bg-blue-700';
  const secondaryClass =
    buttonClass +
    ' min-h-12 border border-slate-200 bg-white text-slate-900 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800';
  const tertiaryClass =
    buttonClass +
    ' min-h-10 border border-slate-200 bg-white text-slate-900 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800';

  return (
    <div className="flex w-full flex-col items-center gap-2">
      {visible.map((action, index) => {
        const className =
          index === 0 ? primaryClass : index === 2 ? tertiaryClass : secondaryClass;

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
