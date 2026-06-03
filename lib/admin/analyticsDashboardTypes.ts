export type AnalyticsDateRange = 'today' | '7d' | '30d' | 'all';

export type AnalyticsDashboardParams = {
  range: AnalyticsDateRange;
  airportCode?: string | null;
};

export type AnalyticsEventRow = {
  id: string;
  event_name: string;
  event_properties: Record<string, unknown>;
  session_id: string | null;
  user_id: string | null;
  anonymous_id: string | null;
  created_at: string;
};

export type DashboardKpis = {
  sessions: number;
  resultsViewed: number;
  quickGoSearches: number;
  tripFormsSubmitted: number;
  parkingClicks: number;
  savedTrips: number;
  savedDestinations: number;
  savedParkingLots: number;
  feedbackReports: number;
};

export type FunnelStep = {
  key: string;
  label: string;
  count: number;
  percentOfTop: number;
};

export type TopAirportRow = {
  airportCode: string;
  searches: number;
  resultsViews: number;
  parkingClicks: number;
  saves: number;
  total: number;
};

export type DestinationCategoryRow = {
  category: string;
  count: number;
};

export type ParkingProviderClickRow = {
  provider: string;
  clicks: number;
  airportCode: string;
  placement: string;
};

export type FeedbackSummary = {
  totalSubmitted: number;
  pending: number;
  approved: number;
  rejected: number;
  byType: Array<{ type: string; count: number }>;
};

export type ActivityFeedItem = {
  id: string;
  at: string;
  eventName: string;
  airportCode: string | null;
  destinationCategory: string | null;
  cityRegion: string | null;
  provider: string | null;
  lotName: string | null;
  actorLabel: 'user' | 'anonymous';
  detail: string | null;
};

export type DataSafetyPanel = {
  googlePlacesEnabled: boolean;
  googlePhotosEnabled: boolean;
  googleReviewsEnabled: boolean;
  openAiProviderMode: string;
  analyticsDbConfigured: boolean;
  lastEventAt: string | null;
};

export type AnalyticsDashboardData = {
  range: AnalyticsDateRange;
  rangeLabel: string;
  airportFilter: string | null;
  hasEvents: boolean;
  emptyMessage: string;
  kpis: DashboardKpis;
  funnel: FunnelStep[];
  topAirports: TopAirportRow[];
  destinationCategories: DestinationCategoryRow[];
  parkingProviderClicks: ParkingProviderClickRow[];
  feedback: FeedbackSummary;
  recentActivity: ActivityFeedItem[];
  safety: DataSafetyPanel;
};
