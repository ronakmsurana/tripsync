// ============================================
// Shared TypeScript types (API <-> UI contract)
// ============================================
// Money is always a decimal STRING ("1700.00"); schedule times are wall-clock
// strings "YYYY-MM-DDTHH:mm"; dates are "YYYY-MM-DD".

export type TripRole = "organizer" | "member" | "viewer";

export interface ApiOk<T> { success: true; data: T; message?: string }
export interface ApiFail { success: false; error: { code: string; message: string; details?: unknown } }

export interface UserDTO { userId: number; name: string; email: string; role: "user" | "admin" }

export interface TripSummary {
  tripId: number;
  tripName: string;
  description: string | null;
  startDate: string;
  endDate: string;
  currency: string;
  status: string;
  memberRole: TripRole;
  memberCount: number;
  creatorName: string;
  primaryDestination: string | null;
  conflictCount: number;
  totalPlanned: string;
  totalSpent: string;
}

export interface DestinationDTO {
  destinationId: number; tripId: number; name: string; location: string;
  arrivalDate: string; departureDate: string; notes: string | null;
}

export interface TransportDTO {
  transportId: number; tripId: number; transportType: string; provider: string;
  departureDestinationId: number; arrivalDestinationId: number;
  departureDestination?: { name: string; location: string };
  arrivalDestination?: { name: string; location: string };
  departureTime: string; arrivalTime: string; bookingReference: string | null; cost: string; status: string;
}

export interface AccommodationDTO {
  accommodationId: number; tripId: number; destinationId: number; name: string; address: string | null;
  destination?: { name: string; location: string };
  checkIn: string; checkOut: string; bookingReference: string | null; cost: string; status: string;
}

export interface ExpenseDTO {
  expenseId: number; tripId: number; paidBy: number; category: string; amount: string;
  description: string | null; expenseDate: string; payer: { userId: number; name: string };
  splits: { userId: number; name: string; shareAmount: string; isSettled: boolean }[];
}

export interface MemberDTO {
  userId: number; name: string; email: string; memberRole: TripRole; joinedAt: string;
}

export interface ActivityDTO {
  id: string; slotId: number; tripId: number; destinationId: number | null;
  slotType: string; title: string; description: string; startTime: string; endTime: string;
  location?: { name?: string; coordinates?: { lat: number; lng: number } };
  tags: string[]; estimatedCost: { amount: string; currency: string };
  notes: { userId: number; text: string; createdAt: string }[];
  customFields: Record<string, unknown>; createdBy: number;
  /** true once the vector embedding has been generated */
  indexed: boolean;
  /** true when the MongoDB document is missing (repairable via admin reconcile) */
  documentMissing: boolean;
}

export interface TimelineItem {
  itemType: "transport" | "accommodation" | "activity";
  itemId: number;
  title: string;
  startTime: string;
  endTime: string;
  cost: string | null;
  status: string | null;
  bookingReference: string | null;
  isFixed: boolean;
  slotType?: string;
  description?: string;
  tags?: string[];
  activityId?: string;
  conflictCount: number;
}

export interface Conflict {
  key: string;
  severity: "hard" | "soft";
  kind: "activity_transport" | "activity_check_in" | "activity_check_out" | "activity_activity" | "transport_transport";
  subject: { type: "activity" | "transport"; id: number; mongoDocId?: string; title: string; startTime: string; endTime: string };
  other: { type: "transport" | "accommodation" | "activity"; id: number; title: string; startTime: string; endTime: string };
  message: string;
  suggestion?: { startTime: string; endTime: string };
}

export interface BudgetRow {
  category: string; planned: string; spent: string; remaining: string; utilizationPct: number | null;
}

export interface BalanceRow {
  userId: number; name: string; memberRole: string;
  totalPaid: string; totalShare: string; settlementsMade: string; settlementsReceived: string; netBalance: string; duesOutstanding: string;
}

export interface BudgetOverview {
  rows: BudgetRow[];
  totals: { planned: string; spent: string; remaining: string; utilizationPct: number | null };
  estimatedActivityCosts: { category: string; totalEstimated: string; count: number }[];
  estimatedActivitiesTotal: string;
  balances: BalanceRow[];
}

export interface SearchHit {
  id: string; title: string; score: number; scoreLabel: string;
  slotType?: string; description?: string; tags?: string[]; startTime?: string; endTime?: string;
}
export interface SearchResponse {
  query: string; modeUsed: "semantic" | "keyword"; notice?: string; results: SearchHit[];
}

export interface TripDetail {
  tripId: number; tripName: string; description: string | null; startDate: string; endDate: string;
  currency: string; status: string; creator: { userId: number; name: string }; memberRole: TripRole;
  counts: { transports: number; accommodations: number; itinerarySlots: number; expenses: number; destinations: number };
}
export interface InsightsDTO {
  byType: { slotType: string; count: number; totalMinutes: number; estimated: string }[];
  topTags: { tag: string; count: number }[];
  totals: { activities: number; minutes: number; estimated: string };
}
