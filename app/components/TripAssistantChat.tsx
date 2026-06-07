'use client';

import { useEffect, useMemo, useState } from 'react';
import type { ParsedTripAssistantResult } from '../../lib/ai/tripParseTypes';
import {
  buildTripPlanningSummary,
  type TripPlanningAssumption,
  type TripPlanningContext,
  type TripPlanningQuickReply,
  type TripPlanningSummaryItem,
  type TripPlanningTurn,
} from '../../lib/ai/tripPlanningConversation';
import { getRecentOrigins } from '../../lib/trip/quickGo';

export type TripPlanningEditingField = TripPlanningSummaryItem['field'];

export type TripAssistantChatMessage = {
  id: string;
  role: 'assistant' | 'user';
  text: string;
  turn?: TripPlanningTurn;
};

export function createTripChatMessage(
  role: TripAssistantChatMessage['role'],
  text: string,
  turn?: TripPlanningTurn,
): TripAssistantChatMessage {
  return {
    id: `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    role,
    text,
    turn,
  };
}

type TripAssistantChatThreadProps = {
  messages: TripAssistantChatMessage[];
  loading?: boolean;
  parsed?: ParsedTripAssistantResult | null;
  context?: TripPlanningContext;
  onQuickReply?: (reply: TripPlanningQuickReply) => void;
  onFieldPatch?: (patch: Partial<ParsedTripAssistantResult>) => void;
  onPlanTrip?: () => void;
  onEditingFieldChange?: (field: TripPlanningEditingField | null) => void;
};

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

function formatDateFromDate(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function AssumptionChips({ assumptions }: { assumptions: TripPlanningAssumption[] }) {
  if (assumptions.length === 0) return null;

  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {assumptions.map((assumption) => (
        <span
          key={assumption.id}
          className="rounded-full border border-border/80 bg-card/80 px-2 py-0.5 text-[11px] text-muted-foreground dark:bg-muted/40"
        >
          {assumption.label}
        </span>
      ))}
    </div>
  );
}

function FieldChip({
  label,
  onClick,
  active,
}: {
  label: string;
  onClick: () => void;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        'rounded-full border px-2.5 py-1 text-[11px] font-medium transition ' +
        (active
          ? 'border-primary/40 bg-primary/15 text-foreground'
          : 'border-primary/20 bg-primary/5 text-foreground hover:border-primary/35 hover:bg-primary/10 dark:border-travel-sky/25 dark:bg-travel-sky/10')
      }
    >
      {label}
    </button>
  );
}

function InlineFieldEditor({
  field,
  parsed,
  context,
  draft,
  onDraftChange,
  onSave,
  onCancel,
}: {
  field: TripPlanningEditingField;
  parsed: ParsedTripAssistantResult;
  context: TripPlanningContext;
  draft: ParsedTripAssistantResult;
  onDraftChange: (next: ParsedTripAssistantResult) => void;
  onSave: (patch: Partial<ParsedTripAssistantResult>) => void;
  onCancel: () => void;
}) {
  const recentOrigins = useMemo(() => getRecentOrigins(), [field]);

  const saveAndClose = (patch: Partial<ParsedTripAssistantResult>) => {
    onSave(patch);
    onCancel();
  };

  switch (field) {
    case 'originText':
      return (
        <div className="mt-2 space-y-2 rounded-lg border border-border/60 bg-card/60 p-2 dark:bg-muted/30">
          <input
            type="text"
            aria-label="From address"
            value={draft.originText || ''}
            placeholder="Starting address"
            onChange={(event) =>
              onDraftChange({
                ...draft,
                originText: event.target.value || null,
                originSource: 'manual',
              })
            }
            className="w-full rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs text-foreground dark:bg-muted/50"
          />
          <div className="flex flex-wrap gap-1.5">
            {context.geolocationAvailable && !context.geolocationDenied ? (
              <FieldChip
                label="Use current location"
                onClick={() =>
                  saveAndClose({ originSource: 'current_location', originText: null })
                }
              />
            ) : null}
            {recentOrigins.map((origin) => (
              <FieldChip
                key={origin}
                label={origin}
                onClick={() =>
                  saveAndClose({ originText: origin, originSource: 'manual' })
                }
              />
            ))}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() =>
                saveAndClose({
                  originText: draft.originText,
                  originSource: draft.originSource,
                })
              }
              className="rounded-full bg-primary px-2.5 py-1 text-[11px] font-semibold text-primary-foreground"
            >
              Save
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="text-[11px] font-medium text-muted-foreground"
            >
              Cancel
            </button>
          </div>
        </div>
      );
    case 'destinationText':
      return (
        <div className="mt-2 space-y-2 rounded-lg border border-border/60 bg-card/60 p-2 dark:bg-muted/30">
          <input
            type="text"
            aria-label="To destination"
            value={draft.destinationText || ''}
            placeholder="New destination"
            onChange={(event) =>
              onDraftChange({
                ...draft,
                destinationText: event.target.value || null,
              })
            }
            className="w-full rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs text-foreground dark:bg-muted/50"
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => saveAndClose({ destinationText: draft.destinationText })}
              className="rounded-full bg-primary px-2.5 py-1 text-[11px] font-semibold text-primary-foreground"
            >
              Save
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="text-[11px] font-medium text-muted-foreground"
            >
              Cancel
            </button>
          </div>
        </div>
      );
    case 'targetTime': {
      const now = new Date();
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);

      return (
        <div className="mt-2 space-y-2 rounded-lg border border-border/60 bg-card/60 p-2 dark:bg-muted/30">
          <div className="flex flex-wrap gap-1.5">
            <FieldChip
              label="Leaving now"
              onClick={() =>
                saveAndClose({
                  timeAnchor: 'now',
                  departureDate: formatDateFromDate(now),
                  departureTime: `${pad2(now.getHours())}:${pad2(now.getMinutes())}`,
                })
              }
            />
            <FieldChip
              label="Tomorrow"
              onClick={() =>
                saveAndClose({
                  timeAnchor: 'arrive_by',
                  departureDate: formatDateFromDate(tomorrow),
                  departureTime: '09:00',
                })
              }
            />
          </div>
          <div className="grid gap-1.5 sm:grid-cols-2">
            <input
              type="date"
              value={draft.departureDate || ''}
              onChange={(event) =>
                onDraftChange({
                  ...draft,
                  departureDate: event.target.value || null,
                  timeAnchor: draft.timeAnchor === 'now' ? 'arrive_by' : draft.timeAnchor,
                })
              }
              className="w-full rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs text-foreground dark:bg-muted/50"
            />
            <input
              type="time"
              value={draft.departureTime || ''}
              onChange={(event) =>
                onDraftChange({
                  ...draft,
                  departureTime: event.target.value || null,
                  timeAnchor: draft.timeAnchor === 'now' ? 'arrive_by' : draft.timeAnchor,
                })
              }
              className="w-full rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs text-foreground dark:bg-muted/50"
            />
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() =>
                saveAndClose({
                  departureDate: draft.departureDate,
                  departureTime: draft.departureTime,
                  timeAnchor: draft.timeAnchor === 'now' ? 'arrive_by' : draft.timeAnchor,
                })
              }
              className="rounded-full bg-primary px-2.5 py-1 text-[11px] font-semibold text-primary-foreground"
            >
              Save
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="text-[11px] font-medium text-muted-foreground"
            >
              Cancel
            </button>
          </div>
        </div>
      );
    }
    case 'transportAvailability':
      return (
        <div className="mt-2 space-y-2 rounded-lg border border-border/60 bg-card/60 p-2 dark:bg-muted/30">
          <div className="flex flex-wrap gap-1.5">
            {(
              [
                { label: 'Compare all', value: 'all' as const },
                { label: 'Drive / park', value: 'car' as const },
                { label: 'Rideshare', value: 'rideshare' as const },
                { label: 'Transit', value: 'transit' as const },
              ] as const
            ).map((option) => (
              <FieldChip
                key={option.value}
                label={option.label}
                active={parsed.transportAvailability === option.value}
                onClick={() => saveAndClose({ transportAvailability: option.value })}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="text-[11px] font-medium text-muted-foreground"
          >
            Cancel
          </button>
        </div>
      );
    case 'parkingPreference':
      return (
        <div className="mt-2 space-y-2 rounded-lg border border-border/60 bg-card/60 p-2 dark:bg-muted/30">
          <div className="flex flex-wrap gap-1.5">
            {(
              [
                { label: 'At destination', value: 'destination' as const },
                { label: 'Nearby', value: 'nearby' as const },
                { label: 'No parking', value: 'none' as const },
                { label: 'Street parking', value: 'nearby' as const },
              ] as const
            ).map((option) => (
              <FieldChip
                key={option.label}
                label={option.label}
                active={parsed.parkingPreference === option.value}
                onClick={() =>
                  saveAndClose({
                    parkingPreference: option.value,
                    needsParking: option.value !== 'none',
                  })
                }
              />
            ))}
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="text-[11px] font-medium text-muted-foreground"
          >
            Cancel
          </button>
        </div>
      );
    default:
      return null;
  }
}

function EditableSummaryRows({
  summary,
  parsed,
  context,
  editingField,
  onEditingFieldChange,
  onFieldPatch,
}: {
  summary: TripPlanningSummaryItem[];
  parsed: ParsedTripAssistantResult;
  context: TripPlanningContext;
  editingField: TripPlanningEditingField | null;
  onEditingFieldChange: (field: TripPlanningEditingField | null) => void;
  onFieldPatch: (patch: Partial<ParsedTripAssistantResult>) => void;
}) {
  const [draft, setDraft] = useState(parsed);

  useEffect(() => {
    if (editingField) {
      setDraft(parsed);
    }
  }, [editingField, parsed]);

  return (
    <div className="mt-2 space-y-1.5 rounded-xl border border-border/70 bg-slate-900/5 p-2 text-[11px] dark:border-slate-600/70 dark:bg-slate-950/40">
      {summary.map((item) => (
        <div
          key={item.id}
          className="rounded-lg border border-border/50 bg-card/80 px-2.5 py-1.5 dark:border-slate-700/60 dark:bg-slate-900/50"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="font-semibold uppercase tracking-wide text-muted-foreground">
                {item.label}
              </div>
              <div className="truncate text-sm text-foreground">{item.value}</div>
            </div>
            <button
              type="button"
              onClick={() =>
                onEditingFieldChange(editingField === item.field ? null : item.field)
              }
              className="shrink-0 rounded-full border border-primary/25 px-2 py-0.5 text-[10px] font-medium text-primary"
            >
              Change
            </button>
          </div>
          {editingField === item.field ? (
            <InlineFieldEditor
              field={item.field}
              parsed={parsed}
              context={context}
              draft={draft}
              onDraftChange={setDraft}
              onSave={onFieldPatch}
              onCancel={() => onEditingFieldChange(null)}
            />
          ) : null}
        </div>
      ))}
    </div>
  );
}

function QuickReplyChips({
  replies,
  onQuickReply,
  disabled,
}: {
  replies: TripPlanningQuickReply[];
  onQuickReply?: (reply: TripPlanningQuickReply) => void;
  disabled?: boolean;
}) {
  const visibleReplies = replies.filter((reply) => reply.action !== 'edit_details');
  if (visibleReplies.length === 0) return null;

  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {visibleReplies.map((reply) => (
        <button
          key={reply.id}
          type="button"
          disabled={disabled}
          onClick={() => onQuickReply?.(reply)}
          className="rounded-full border border-primary/20 bg-primary/5 px-3 py-1.5 text-xs font-medium text-foreground transition hover:border-primary/35 hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-50 dark:border-travel-sky/25 dark:bg-travel-sky/10 dark:hover:bg-travel-sky/15"
        >
          {reply.label}
        </button>
      ))}
    </div>
  );
}

export default function TripAssistantChatThread({
  messages,
  loading = false,
  parsed = null,
  context,
  onQuickReply,
  onFieldPatch,
  onPlanTrip,
  onEditingFieldChange,
}: TripAssistantChatThreadProps) {
  const [editingField, setEditingField] = useState<TripPlanningEditingField | null>(null);

  useEffect(() => {
    onEditingFieldChange?.(editingField);
  }, [editingField, onEditingFieldChange]);

  const latestPlanningMessageId = [...messages]
    .reverse()
    .find((message) => message.turn)?.id;

  const liveSummary =
    parsed && context && parsed.status === 'ready_for_review'
      ? buildTripPlanningSummary(parsed, context)
      : null;

  const handleEditingFieldChange = (field: TripPlanningEditingField | null) => {
    setEditingField(field);
  };

  const handleFieldPatch = (patch: Partial<ParsedTripAssistantResult>) => {
    onFieldPatch?.(patch);
    setEditingField(null);
  };

  return (
    <div className="space-y-3">
      {messages.map((message) => {
        const isLatestReady =
          message.id === latestPlanningMessageId &&
          message.turn?.phase === 'ready_to_plan' &&
          parsed?.status === 'ready_for_review';

        return (
          <div
            key={message.id}
            className={
              message.role === 'user'
                ? 'ml-8 rounded-2xl bg-gradient-to-r from-sky-600 to-blue-700 px-3 py-2 text-sm text-white shadow-sm dark:from-sky-500 dark:to-blue-600'
                : 'mr-2 rounded-2xl border border-border/70 bg-muted/50 px-3 py-2 text-sm text-foreground dark:border-slate-700/70 dark:bg-slate-900/60'
            }
          >
            {message.turn ? (
              <div className="space-y-1">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  {message.turn.headline}
                </p>
                <p>{message.turn.acknowledgment}</p>
                {isLatestReady && liveSummary && parsed && context && onFieldPatch ? (
                  <EditableSummaryRows
                    summary={liveSummary}
                    parsed={parsed}
                    context={context}
                    editingField={editingField}
                    onEditingFieldChange={handleEditingFieldChange}
                    onFieldPatch={handleFieldPatch}
                  />
                ) : message.turn.summary.length > 0 ? (
                  <div className="mt-2 grid gap-1.5 rounded-xl border border-border/70 bg-card/70 p-2 text-[11px] dark:bg-muted/20">
                    {message.turn.summary.map((item) => (
                      <div key={item.id} className="flex items-baseline justify-between gap-2">
                        <span className="font-medium text-muted-foreground">{item.label}</span>
                        <span className="text-right text-foreground">{item.value}</span>
                      </div>
                    ))}
                  </div>
                ) : null}
                {message.turn.question ? <p className="mt-1">{message.turn.question}</p> : null}
                <AssumptionChips assumptions={message.turn.assumptions} />
                {message.id === latestPlanningMessageId ? (
                  <>
                    {isLatestReady && onPlanTrip ? (
                      <div className="mt-2">
                        <button
                          type="button"
                          disabled={loading}
                          onClick={onPlanTrip}
                          className="inline-flex items-center justify-center rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-sky-600 dark:hover:bg-sky-500"
                        >
                          Plan trip
                        </button>
                      </div>
                    ) : (
                      <QuickReplyChips
                        replies={message.turn.quickReplies}
                        onQuickReply={onQuickReply}
                        disabled={loading}
                      />
                    )}
                  </>
                ) : null}
              </div>
            ) : (
              <p>{message.text}</p>
            )}
          </div>
        );
      })}

      {loading ? (
        <div className="mr-2 rounded-2xl border border-border/70 bg-muted/50 px-3 py-2 text-sm text-muted-foreground dark:bg-muted/30">
          Working on that…
        </div>
      ) : null}
    </div>
  );
}
