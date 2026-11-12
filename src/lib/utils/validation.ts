// ============================================
// Zod validation schemas (server-side input validation)
// ============================================
// Mirrors the database CHECK constraints so users get friendly field errors
// first; the database remains the last line of defence.
// ============================================
import { z } from "zod";
import { isValidDateOnly, isValidLocalDateTime, parseDateOnly, parseLocalDateTime } from "./time";
import { normalizeMoney } from "./money";

export const CATEGORIES = ["transport", "accommodation", "food", "activities", "shopping", "other"] as const;
export const SLOT_TYPES = ["sightseeing", "dining", "adventure", "leisure", "festival", "custom"] as const;
export const TRANSPORT_TYPES = ["flight", "train", "bus", "car", "ferry", "other"] as const;
export const BOOKING_STATUSES = ["confirmed", "pending", "cancelled"] as const;
export const TRIP_STATUSES = ["planning", "confirmed", "ongoing", "completed", "cancelled"] as const;
export const MEMBER_ROLES = ["organizer", "member", "viewer"] as const;
export const PAYMENT_METHODS = ["cash", "upi", "card", "bank_transfer", "other"] as const;

// ---- primitives -----------------------------------------------------
const text = (max: number, label: string) =>
  z.string().trim().min(1, `${label} is required`).max(max, `${label} must be at most ${max} characters`);
const optionalText = (max: number) =>
  z.string().trim().max(max).optional().transform((v) => (v ? v : undefined));

export const dateOnly = z.string().refine(isValidDateOnly, "Use a valid date (YYYY-MM-DD)");
export const localDateTime = z.string().refine(isValidLocalDateTime, "Use a valid date and time (YYYY-MM-DDTHH:mm)");

/** Accepts 12, "12.5", "12.50"; returns the normalized string "12.50". Max 2 decimals, never negative. */
export const money = z.union([z.number(), z.string()]).transform((v, ctx) => {
  try {
    return normalizeMoney(v);
  } catch (e) {
    ctx.addIssue({ code: "custom", message: (e as Error).message });
    return z.NEVER;
  }
});
const positiveMoney = money.refine((v) => Number(v) > 0, "Amount must be greater than zero");

const id = z.number().int().positive();

// ---- auth -----------------------------------------------------------
const phone = z
  .string()
  .trim()
  .regex(/^[+0-9][0-9 ()-]{5,19}$/, "Enter a valid phone number")
  .optional()
  .or(z.literal("").transform(() => undefined));

export const registerSchema = z.object({
  name: text(100, "Name"),
  email: z.string().trim().toLowerCase().max(255).pipe(z.email("Enter a valid email address")),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(72, "Password must be at most 72 characters")
    .refine((p) => /[A-Za-z]/.test(p) && /[0-9]/.test(p), "Password must contain a letter and a number"),
  phone,
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email("Enter a valid email address")),
  password: z.string().min(1, "Password is required").max(72),
});

// ---- trips ----------------------------------------------------------
const currency = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{3}$/, "Currency must be a 3-letter code");

export const createTripSchema = z
  .object({
    tripName: text(200, "Trip name"),
    description: optionalText(2000),
    startDate: dateOnly,
    endDate: dateOnly,
    currency: currency.default("INR"),
    primaryDestination: optionalText(200),
  })
  .refine((d) => d.endDate >= d.startDate, { message: "End date must be on or after the start date", path: ["endDate"] });

export const updateTripSchema = z
  .object({
    tripName: text(200, "Trip name").optional(),
    description: z.string().trim().max(2000).optional(),
    startDate: dateOnly.optional(),
    endDate: dateOnly.optional(),
    currency: currency.optional(),
    status: z.enum(TRIP_STATUSES).optional(),
  })
  .refine((d) => !(d.startDate && d.endDate) || d.endDate >= d.startDate, {
    message: "End date must be on or after the start date",
    path: ["endDate"],
  });

export const tripListQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  status: z.enum(TRIP_STATUSES).optional(),
  sort: z.enum(["start_desc", "start_asc", "name"]).default("start_asc"),
});

// ---- members --------------------------------------------------------
export const addMemberSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email("Enter a valid email address")),
  memberRole: z.enum(MEMBER_ROLES).default("member"),
});
export const updateMemberSchema = z.object({ memberRole: z.enum(MEMBER_ROLES) });

// ---- destinations ---------------------------------------------------
export const destinationSchema = z
  .object({
    name: text(200, "Destination name"),
    location: text(300, "Location"),
    arrivalDate: dateOnly,
    departureDate: dateOnly,
    notes: optionalText(2000),
  })
  .refine((d) => d.departureDate >= d.arrivalDate, { message: "Departure must be on or after arrival", path: ["departureDate"] });

// ---- transport / accommodation ---------------------------------------
export const transportSchema = z
  .object({
    transportType: z.enum(TRANSPORT_TYPES).default("flight"),
    provider: text(200, "Provider"),
    departureDestinationId: id,
    arrivalDestinationId: id,
    departureTime: localDateTime,
    arrivalTime: localDateTime,
    bookingReference: optionalText(100),
    cost: money.default("0.00"),
    status: z.enum(BOOKING_STATUSES).default("confirmed"),
  })
  .refine((d) => d.arrivalTime > d.departureTime, { message: "Arrival must be after departure", path: ["arrivalTime"] })
  .refine((d) => d.departureDestinationId !== d.arrivalDestinationId, {
    message: "Departure and arrival destinations must differ",
    path: ["arrivalDestinationId"],
  });

export const accommodationSchema = z
  .object({
    destinationId: id,
    name: text(200, "Name"),
    address: optionalText(500),
    checkIn: localDateTime,
    checkOut: localDateTime,
    bookingReference: optionalText(100),
    cost: money.default("0.00"),
    status: z.enum(BOOKING_STATUSES).default("confirmed"),
  })
  .refine((d) => d.checkOut > d.checkIn, { message: "Check-out must be after check-in", path: ["checkOut"] });

// ---- budget / expenses -----------------------------------------------
export const budgetSchema = z.object({
  category: z.enum(CATEGORIES),
  plannedAmount: money,
  remarks: optionalText(500),
});

export const expenseSchema = z.object({
  category: z.enum(CATEGORIES).default("other"),
  amount: positiveMoney,
  description: optionalText(500),
  expenseDate: dateOnly,
  /** Defaults to the logged-in user. Recording for someone else needs the organizer role. */
  paidBy: id.optional(),
  /** Equal split between these members (default: every active member). */
  splitWith: z.array(id).min(1).max(50).optional(),
  /** Or explicit shares; must add up exactly to the amount. */
  splits: z.array(z.object({ userId: id, shareAmount: money })).min(1).max(50).optional(),
}).refine((d) => !(d.splitWith && d.splits), { message: "Use either splitWith or splits, not both", path: ["splits"] });

export const settleSchema = z.object({
  paymentMethod: z.enum(PAYMENT_METHODS).default("cash"),
  /** Only an organizer may settle on behalf of another member. */
  userId: id.optional(),
});

// ---- activities (MongoDB document + PostgreSQL slot) -------------------
const tag = z.string().trim().toLowerCase().min(1).max(40);

const activityBase = z.object({
  slotType: z.string().trim().min(1, "Activity type is required").max(30, "Activity type must be at most 30 characters").default("sightseeing"),
  title: text(200, "Title"),
  description: z.string().trim().max(5000).optional(),
  destinationId: id.nullable().optional(),
  startTime: localDateTime,
  endTime: localDateTime,
  location: z
    .object({
      name: z.string().trim().max(200).optional(),
      coordinates: z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) }).optional(),
    })
    .optional(),
  tags: z.array(tag).max(20).optional(),
  estimatedCost: z.object({ amount: money, currency: currency.default("INR") }).optional(),
  notes: z.string().trim().max(2000).optional(),
  customFields: z
    .record(z.string().max(60), z.unknown())
    .refine((o) => JSON.stringify(o).length <= 10_000, "customFields is too large")
    .optional(),
  /** Save even if the schedule assistant found conflicts. */
  force: z.boolean().default(false),
});

export const createActivitySchema = activityBase.refine((d) => d.endTime > d.startTime, {
  message: "End time must be after start time",
  path: ["endTime"],
});

export const updateActivitySchema = activityBase
  .partial()
  .refine((d) => !(d.startTime && d.endTime) || d.endTime > d.startTime, {
    message: "End time must be after start time",
    path: ["endTime"],
  });

// ---- search ----------------------------------------------------------
export const searchSchema = z.object({
  query: text(500, "Search query"),
  tripId: id,
  mode: z.enum(["auto", "semantic", "keyword"]).default("auto"),
  limit: z.number().int().min(1).max(20).default(8),
});

export { parseDateOnly, parseLocalDateTime };
export type CreateActivityInput = z.infer<typeof createActivitySchema>;
export type UpdateActivityInput = z.infer<typeof updateActivitySchema>;
