// ============================================
// Shared TypeScript Types
// ============================================

// Timeline item — union of transport, accommodation, and activity
export interface TimelineItem {
  id: number | string;
  tripId: number;
  itemType: "transport" | "accommodation" | "activity";
  title: string;
  startTime: string;
  endTime: string;
  cost?: number | null;
  status?: string | null;
  isFixed: boolean;
  metadata?: Record<string, unknown>;
}

// Conflict detected by the engine
export interface Conflict {
  conflictSource: "transport" | "accommodation" | "activity";
  itemId: number;
  itemTitle: string;
  startTime: string;
  endTime: string;
  severity: "hard" | "soft";
  message: string;
}

// Budget vs. actual summary row
export interface BudgetSummary {
  category: string;
  planned: number;
  spent: number;
  remaining: number;
}

// MongoDB activity document
export interface ActivityDocument {
  _id?: string;
  tripId: number;
  slotType: string;
  title: string;
  description?: string;
  location?: {
    name?: string;
    coordinates?: { lat: number; lng: number };
  };
  tags?: string[];
  estimatedDurationMinutes?: number;
  estimatedCost?: { amount: number; currency: string };
  media?: Array<{ type: string; url: string; caption?: string }>;
  notes?: Array<{ userId: number; text: string; createdAt: string }>;
  weatherPreference?: string;
  accessibility?: string;
  customFields?: Record<string, unknown>;
  createdBy: number;
  createdAt: string;
  updatedAt: string;
}

// API response wrapper
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

// Search result
export interface SearchResult {
  mongoDocId: string;
  title: string;
  similarity: number;
  activity?: ActivityDocument;
}

// Trip with member info
export interface TripWithRole {
  tripId: number;
  tripName: string;
  description?: string;
  startDate: string;
  endDate: string;
  currency: string;
  status: string;
  memberRole: string;
  memberCount: number;
}
