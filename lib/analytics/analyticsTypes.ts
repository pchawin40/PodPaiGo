export const ANALYTICS_EVENT_NAMES = [
  'home_viewed',
  'quick_go_started',
  'quick_go_submitted',
  'ai_assistant_started',
  'ai_assistant_submitted',
  'trip_planner_started',
  'trip_form_submitted',
  'trip_type_selected',
  'transport_preference_selected',
  'bag_plan_selected',
  'security_option_selected',
  'results_viewed',
  'recommendation_recalculated',
  'sort_changed',
  'parking_card_viewed',
  'parking_cta_clicked',
  'directions_clicked',
  'map_tab_clicked',
  'airport_tab_clicked',
  'save_trip_clicked',
  'save_trip_completed',
  'save_destination_clicked',
  'save_parking_lot_clicked',
  'parking_report_started',
  'parking_report_submitted',
  'parking_report_type_selected',
  'account_viewed',
  'profile_updated',
  'saved_trip_opened',
  'saved_trip_deleted',
] as const;

export type AnalyticsEventName = (typeof ANALYTICS_EVENT_NAMES)[number];

export type AnalyticsEventProperties = Record<string, unknown>;

export type AnalyticsTrackPayload = {
  eventName: AnalyticsEventName;
  eventProperties?: AnalyticsEventProperties;
  anonymousId?: string | null;
  sessionId?: string | null;
  pagePath?: string | null;
  referrer?: string | null;
};

export type AnalyticsInsertRow = {
  user_id: string | null;
  anonymous_id: string | null;
  session_id: string | null;
  event_name: string;
  event_properties: Record<string, unknown>;
  page_path: string | null;
  referrer: string | null;
  user_agent: string | null;
};
