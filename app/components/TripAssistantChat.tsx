'use client';

import type {
  TripPlanningAssumption,
  TripPlanningQuickReply,
  TripPlanningTurn,
} from '../../lib/ai/tripPlanningConversation';

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
  onQuickReply?: (reply: TripPlanningQuickReply) => void;
};

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

function SummaryChips({
  summary,
}: {
  summary: TripPlanningTurn['summary'];
}) {
  if (!summary || summary.length === 0) return null;

  return (
    <div className="mt-2 grid gap-1.5 rounded-xl border border-border/70 bg-card/70 p-2 text-[11px] dark:bg-muted/20">
      {summary.map((item) => (
        <div key={item.id} className="flex items-baseline justify-between gap-2">
          <span className="font-medium text-muted-foreground">{item.label}</span>
          <span className="text-right text-foreground">{item.value}</span>
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
  if (replies.length === 0) return null;

  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {replies.map((reply) => (
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
  onQuickReply,
}: TripAssistantChatThreadProps) {
  const latestPlanningMessageId = [...messages]
    .reverse()
    .find((message) => message.turn)?.id;

  return (
    <div className="space-y-3">
      {messages.map((message) => (
        <div
          key={message.id}
          className={
            message.role === 'user'
              ? 'ml-8 rounded-2xl bg-gradient-to-r from-sky-600 to-blue-700 px-3 py-2 text-sm text-white shadow-sm dark:from-sky-500 dark:to-blue-600'
              : 'mr-2 rounded-2xl border border-border/70 bg-muted/50 px-3 py-2 text-sm text-foreground dark:bg-muted/30'
          }
        >
          {message.turn ? (
            <div className="space-y-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                {message.turn.headline}
              </p>
              <p>{message.turn.acknowledgment}</p>
              <SummaryChips summary={message.turn.summary} />
              {message.turn.question ? <p className="mt-1">{message.turn.question}</p> : null}
              <AssumptionChips assumptions={message.turn.assumptions} />
              {message.id === latestPlanningMessageId ? (
                <QuickReplyChips
                  replies={message.turn.quickReplies}
                  onQuickReply={onQuickReply}
                  disabled={loading}
                />
              ) : null}
            </div>
          ) : (
            <p>{message.text}</p>
          )}
        </div>
      ))}

      {loading ? (
        <div className="mr-2 rounded-2xl border border-border/70 bg-muted/50 px-3 py-2 text-sm text-muted-foreground dark:bg-muted/30">
          Working on that…
        </div>
      ) : null}
    </div>
  );
}
