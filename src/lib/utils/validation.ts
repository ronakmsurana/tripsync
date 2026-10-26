// ============================================
// Zod Validation Schemas
// ============================================
// Runtime validation for all API inputs.
// Ensures data integrity before DB writes.
// ============================================

import { z } from "zod";

// ==========================================
// AUTH
// ==========================================
export const registerSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  email: z.string().email("Invalid email address"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(100),
  phone: z.string().max(20).optional(),
});

export const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

// ==========================================
// TRIP
// ==========================================
export const createTripSchema = z
  .object({
    tripName: z.string().min(1, "Trip name is required").max(200),
    description: z.string().optional(),
    startDate: z.string().refine((d) => !isNaN(Date.parse(d)), "Invalid start date"),
    endDate: z.string().refine((d) => !isNaN(Date.parse(d)), "Invalid end date"),
    currency: z.string().length(3).default("INR"),
  })
  .refine((data) => new Date(data.endDate) >= new Date(data.startDate), {
    message: "End date must be after start date",
    path: ["endDate"],
  });

export const updateTripSchema = z.object({
  tripName: z.string().min(1).max(200).optional(),
  description: z.string().optional(),
  startDate: z.string().refine((d) => !isNaN(Date.parse(d))).optional(),
  endDate: z.string().refine((d) => !isNaN(Date.parse(d))).optional(),
  currency: z.string().length(3).optional(),
  status: z
    .enum(["planning", "ongoing", "completed", "cancelled"])
    .optional(),
});

// ==========================================
// TRIP MEMBER
// ==========================================
export const addMemberSchema = z.object({
  email: z.string().email("Invalid email address"),
  memberRole: z.enum(["organizer", "member", "viewer"]).default("member"),
});

// ==========================================
// DESTINATION
// ==========================================
export const createDestinationSchema = z
  .object({
    name: z.string().min(1, "Destination name is required").max(200),
    location: z.string().min(1, "Location is required").max(300),
    arrivalDate: z.string().refine((d) => !isNaN(Date.parse(d)), "Invalid arrival date"),
    departureDate: z.string().refine((d) => !isNaN(Date.parse(d)), "Invalid departure date"),
    notes: z.string().optional(),
  })
  .refine(
    (data) => new Date(data.departureDate) >= new Date(data.arrivalDate),
    {
      message: "Departure date must be after arrival date",
      path: ["departureDate"],
    }
  );

// ==========================================
// TRANSPORT
// ==========================================
export const createTransportSchema = z
  .object({
    transportType: z
      .enum(["flight", "train", "bus", "car", "ferry", "other"])
      .default("flight"),
    provider: z.string().min(1, "Provider is required").max(200),
    departureDestinationId: z.number().int().positive(),
    arrivalDestinationId: z.number().int().positive(),
    departureTime: z.string().refine((d) => !isNaN(Date.parse(d)), "Invalid departure time"),
    arrivalTime: z.string().refine((d) => !isNaN(Date.parse(d)), "Invalid arrival time"),
    bookingReference: z.string().max(100).optional(),
    cost: z.number().min(0, "Cost must be non-negative").default(0),
    status: z
      .enum(["confirmed", "pending", "cancelled"])
      .default("confirmed"),
  })
  .refine(
    (data) => new Date(data.arrivalTime) > new Date(data.departureTime),
    {
      message: "Arrival time must be after departure time",
      path: ["arrivalTime"],
    }
  );

// ==========================================
// ACCOMMODATION
// ==========================================
export const createAccommodationSchema = z
  .object({
    destinationId: z.number().int().positive(),
    name: z.string().min(1, "Name is required").max(200),
    address: z.string().max(500).optional(),
    checkIn: z.string().refine((d) => !isNaN(Date.parse(d)), "Invalid check-in time"),
    checkOut: z.string().refine((d) => !isNaN(Date.parse(d)), "Invalid check-out time"),
    bookingReference: z.string().max(100).optional(),
    cost: z.number().min(0, "Cost must be non-negative").default(0),
    status: z
      .enum(["confirmed", "pending", "cancelled"])
      .default("confirmed"),
  })
  .refine((data) => new Date(data.checkOut) > new Date(data.checkIn), {
    message: "Check-out must be after check-in",
    path: ["checkOut"],
  });

// ==========================================
// EXPENSE
// ==========================================
export const createExpenseSchema = z.object({
  category: z
    .enum([
      "transport",
      "accommodation",
      "food",
      "activities",
      "shopping",
      "other",
    ])
    .default("other"),
  amount: z.number().min(0, "Amount must be non-negative"),
  description: z.string().optional(),
  expenseDate: z.string().refine((d) => !isNaN(Date.parse(d)), "Invalid expense date"),
  splits: z
    .array(
      z.object({
        userId: z.number().int().positive(),
        shareAmount: z.number().min(0),
      })
    )
    .optional(),
});

// ==========================================
// PAYMENT
// ==========================================
export const createPaymentSchema = z.object({
  expenseId: z.number().int().positive(),
  amount: z.number().positive("Amount must be positive"),
  paymentMethod: z
    .enum(["cash", "upi", "card", "bank_transfer", "other"])
    .default("cash"),
  transactionId: z.string().max(100).optional(),
});

// ==========================================
// BUDGET
// ==========================================
export const createBudgetSchema = z.object({
  category: z
    .enum([
      "transport",
      "accommodation",
      "food",
      "activities",
      "shopping",
      "other",
    ])
    .default("other"),
  plannedAmount: z.number().min(0, "Amount must be non-negative"),
  remarks: z.string().optional(),
});

// ==========================================
// ACTIVITY (MongoDB)
// ==========================================
export const createActivitySchema = z
  .object({
    slotType: z
      .enum(["sightseeing", "meal", "festival", "leisure", "custom"])
      .default("sightseeing"),
    title: z.string().min(1, "Title is required").max(200),
    description: z.string().optional(),
    destinationId: z.number().int().positive().optional(),
    startTime: z.string().refine((d) => !isNaN(Date.parse(d)), "Invalid start time"),
    endTime: z.string().refine((d) => !isNaN(Date.parse(d)), "Invalid end time"),
    location: z
      .object({
        name: z.string().optional(),
        coordinates: z
          .object({
            lat: z.number(),
            lng: z.number(),
          })
          .optional(),
      })
      .optional(),
    tags: z.array(z.string()).optional(),
    estimatedCost: z
      .object({
        amount: z.number().min(0),
        currency: z.string().length(3).default("INR"),
      })
      .optional(),
    notes: z.string().optional(),
    customFields: z.record(z.string(), z.unknown()).optional(),
  })
  .refine((data) => new Date(data.endTime) > new Date(data.startTime), {
    message: "End time must be after start time",
    path: ["endTime"],
  });

// ==========================================
// SEMANTIC SEARCH
// ==========================================
export const searchSchema = z.object({
  query: z.string().min(1, "Search query is required").max(500),
  tripId: z.number().int().positive().optional(),
  limit: z.number().int().min(1).max(20).default(5),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type CreateTripInput = z.infer<typeof createTripSchema>;
export type UpdateTripInput = z.infer<typeof updateTripSchema>;
export type AddMemberInput = z.infer<typeof addMemberSchema>;
export type CreateDestinationInput = z.infer<typeof createDestinationSchema>;
export type CreateTransportInput = z.infer<typeof createTransportSchema>;
export type CreateAccommodationInput = z.infer<typeof createAccommodationSchema>;
export type CreateExpenseInput = z.infer<typeof createExpenseSchema>;
export type CreatePaymentInput = z.infer<typeof createPaymentSchema>;
export type CreateBudgetInput = z.infer<typeof createBudgetSchema>;
export type CreateActivityInput = z.infer<typeof createActivitySchema>;
export type SearchInput = z.infer<typeof searchSchema>;
