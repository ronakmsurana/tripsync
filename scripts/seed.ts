// ============================================
// npm run db:seed — demo data (idempotent)
// ============================================
// Users are created with bcrypt hashes generated NOW from the passwords in your
// environment (SEED_DEMO_PASSWORD / SEED_ADMIN_PASSWORD). Nothing is hard-coded.
// Re-running is safe: existing rows are reused. Use `npm run db:seed -- --reset`
// to delete and recreate the demo trip.
// ============================================
import "dotenv/config";
import bcrypt from "bcryptjs";
import prisma from "../src/lib/db/postgres";
import { closeMongo, ensureMongoSetup } from "../src/lib/db/mongodb";
import { createActivity, purgeTripDocuments } from "../src/lib/services/activityService";
import { createExpense } from "../src/lib/services/expenseService";
import { parseDateOnly, parseLocalDateTime } from "../src/lib/utils/time";
import type { CreateActivityInput } from "../src/lib/utils/validation";

const TRIP_NAME = "Hampi Heritage Tour";

function need(name: string): string {
  const v = process.env[name];
  if (!v || v.length < 8) throw new Error(`${name} must be set (min 8 chars) in your environment/.env to seed demo accounts`);
  return v;
}

async function upsertUser(name: string, email: string, password: string, role: "user" | "admin", phone?: string) {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return existing;
  return prisma.user.create({ data: { name, email, role, phone, passwordHash: await bcrypt.hash(password, 12) } });
}

async function main() {
  const demoPw = need("SEED_DEMO_PASSWORD");
  const adminPw = need("SEED_ADMIN_PASSWORD");
  const adminEmail = (process.env.SEED_ADMIN_EMAIL || "admin@tripsync.local").toLowerCase();
  await ensureMongoSetup();

  await upsertUser("TripSync Admin", adminEmail, adminPw, "admin");
  const ronak = await upsertUser("Ronak", "ronak@example.com", demoPw, "user", "9876543210");
  const arjun = await upsertUser("Arjun", "arjun@example.com", demoPw, "user", "9876543211");
  const priya = await upsertUser("Priya", "priya@example.com", demoPw, "user", "9876543212");

  const existing = await prisma.trip.findFirst({ where: { tripName: TRIP_NAME, createdBy: ronak.userId } });
  if (existing && process.argv.includes("--reset")) {
    await prisma.trip.delete({ where: { tripId: existing.tripId } });
    await purgeTripDocuments(existing.tripId);
    console.log("• removed previous demo trip");
  } else if (existing) {
    console.log(`• demo trip already exists (trip #${existing.tripId}); nothing to do`);
    return;
  }

  const trip = await prisma.$transaction(async (tx) => {
    const t = await tx.trip.create({
      data: {
        tripName: TRIP_NAME, status: "planning", currency: "INR", createdBy: ronak.userId,
        description: "A 4-day exploration of the ancient Vijayanagara Empire ruins and surrounding temples.",
        startDate: parseDateOnly("2026-12-20"), endDate: parseDateOnly("2026-12-24"),
      },
    });
    await tx.tripMember.createMany({
      data: [
        { tripId: t.tripId, userId: ronak.userId, memberRole: "organizer" },
        { tripId: t.tripId, userId: arjun.userId, memberRole: "member" },
        { tripId: t.tripId, userId: priya.userId, memberRole: "viewer" },
      ],
    });
    return t;
  });
  const tripId = trip.tripId;

  const [blr, hampi, hospet] = await Promise.all(
    [
      ["Bangalore", "Bangalore, Karnataka", "2026-12-20", "2026-12-20", "Starting point — overnight bus"],
      ["Hampi", "Hampi, Vijayanagara, Karnataka", "2026-12-21", "2026-12-23", "Main destination — ruins, temples, riverside"],
      ["Hospet", "Hospet, Karnataka", "2026-12-23", "2026-12-24", "Nearest town — return journey"],
    ].map(([name, location, a, d, notes]) =>
      prisma.destination.create({ data: { tripId, name, location, arrivalDate: parseDateOnly(a), departureDate: parseDateOnly(d), notes } })
    )
  );

  await prisma.transport.createMany({
    data: [
      { tripId, transportType: "bus", provider: "KSRTC Airavat", departureDestinationId: blr.destinationId, arrivalDestinationId: hampi.destinationId,
        departureTime: parseLocalDateTime("2026-12-20T22:00"), arrivalTime: parseLocalDateTime("2026-12-21T05:30"), bookingReference: "KSRTC-HMP-1220", cost: "850.00" },
      { tripId, transportType: "bus", provider: "KSRTC Airavat", departureDestinationId: hospet.destinationId, arrivalDestinationId: blr.destinationId,
        departureTime: parseLocalDateTime("2026-12-23T22:00"), arrivalTime: parseLocalDateTime("2026-12-24T05:30"), bookingReference: "KSRTC-BLR-1223", cost: "850.00" },
    ],
  });
  await prisma.accommodation.create({
    data: { tripId, destinationId: hampi.destinationId, name: "Hampi Heritage Guest House", address: "Near Virupaksha Temple, Hampi Bazaar",
      checkIn: parseLocalDateTime("2026-12-21T06:00"), checkOut: parseLocalDateTime("2026-12-23T11:00"), bookingReference: "HMP-GH-2026", cost: "3200.00" },
  });

  await prisma.budget.createMany({
    data: [
      { tripId, category: "transport", plannedAmount: "2000.00", remarks: "Bus tickets both ways" },
      { tripId, category: "accommodation", plannedAmount: "4000.00", remarks: "Guest house, 2 nights" },
      { tripId, category: "food", plannedAmount: "3000.00", remarks: "Meals for 4 days" },
      { tripId, category: "activities", plannedAmount: "1500.00", remarks: "Entry tickets, guides" },
      { tripId, category: "shopping", plannedAmount: "1000.00", remarks: "Souvenirs" },
    ],
  });

  const members = [ronak.userId, arjun.userId];
  await createExpense(tripId, ronak.userId, "organizer", { category: "transport", amount: "1700.00", description: "Bus tickets for 2 (both ways)", expenseDate: "2026-12-15", splitWith: members });
  await createExpense(tripId, ronak.userId, "organizer", { category: "accommodation", amount: "3200.00", description: "Guest house booking", expenseDate: "2026-12-15", splitWith: members });
  await createExpense(tripId, arjun.userId, "member", { category: "food", amount: "451.00", description: "Dinner at Mango Tree restaurant", expenseDate: "2026-12-21", splitWith: members });

  const act = (a: Omit<CreateActivityInput, "force">) => createActivity(tripId, ronak.userId, { ...a, force: true });
  const base = { destinationId: hampi.destinationId };
  await act({ ...base, slotType: "sightseeing", title: "Sunrise at Matanga Hill", startTime: "2026-12-21T07:30", endTime: "2026-12-21T09:30",
    description: "Climb Matanga Hill for a golden sunrise over the boulder-strewn ruins and the Tungabhadra river.",
    tags: ["sunrise", "hiking", "photography", "scenic"], location: { name: "Matanga Hill, Hampi" }, estimatedCost: { amount: "0", currency: "INR" },
    notes: "Start the climb early and carry water and a torch.", customFields: { difficulty: "moderate" } });
  await act({ ...base, slotType: "sightseeing", title: "Virupaksha Temple Visit", startTime: "2026-12-21T10:00", endTime: "2026-12-21T11:30",
    description: "One of the oldest functioning temples in India, dedicated to Shiva, with towering Dravidian gopuram.",
    tags: ["temple", "heritage", "unesco", "architecture"], location: { name: "Virupaksha Temple, Hampi Bazaar" }, estimatedCost: { amount: "50", currency: "INR" },
    customFields: { dressCode: "covered shoulders and knees" } });
  await act({ ...base, slotType: "dining", title: "Lunch at Mango Tree", startTime: "2026-12-21T13:00", endTime: "2026-12-21T14:15",
    description: "Riverside restaurant serving South Indian thalis and banana pancakes.", tags: ["lunch", "riverside", "vegetarian"],
    location: { name: "Mango Tree, Hampi" }, estimatedCost: { amount: "450", currency: "INR" } });
  await act({ ...base, slotType: "adventure", title: "Coracle Ride on the Tungabhadra", startTime: "2026-12-22T08:00", endTime: "2026-12-22T10:00",
    description: "Spin and glide across the river in a traditional round basket boat past ancient ruins.", tags: ["river", "boat", "adventure", "water"],
    location: { name: "Virupapura Gadde" }, estimatedCost: { amount: "400", currency: "INR" } });
  await act({ ...base, slotType: "sightseeing", title: "Vittala Temple & Stone Chariot", startTime: "2026-12-22T10:30", endTime: "2026-12-22T12:30",
    description: "Famous musical pillars and the iconic stone chariot, the symbol of Hampi.", tags: ["temple", "heritage", "unesco", "musical pillars"],
    location: { name: "Vittala Temple Complex" }, estimatedCost: { amount: "600", currency: "INR" } });
  await act({ ...base, slotType: "leisure", title: "Sunset at Hemakuta Hill", startTime: "2026-12-22T17:30", endTime: "2026-12-22T19:00",
    description: "Quiet evening on the hilltop among small shrines, watching the sky turn orange.", tags: ["sunset", "peaceful", "scenic", "relaxing"],
    location: { name: "Hemakuta Hill" }, estimatedCost: { amount: "0", currency: "INR" } });
  // Intentional demo conflict: runs through the 11:00 hotel check-out.
  await act({ ...base, slotType: "sightseeing", title: "Lotus Mahal & Elephant Stables Walk", startTime: "2026-12-23T10:15", endTime: "2026-12-23T12:00",
    description: "Guided walk through the Zenana Enclosure: Lotus Mahal, elephant stables and the Queen's Bath.", tags: ["heritage", "royal", "architecture", "walk"],
    location: { name: "Zenana Enclosure" }, estimatedCost: { amount: "600", currency: "INR" } });

  console.log(`✓ Seeded "${TRIP_NAME}" (trip #${tripId}). Demo logins: ronak@example.com (organizer), arjun@example.com (member), priya@example.com (viewer), ${adminEmail} (admin).`);
}

main()
  .catch((e) => { console.error("✗ Seed failed:", e); process.exitCode = 1; })
  .finally(async () => { await prisma.$disconnect(); await closeMongo(); });
