-- Allow custom slot type names
ALTER TABLE "itinerary_slots" DROP CONSTRAINT IF EXISTS "ck_itinerary_slots_type";
ALTER TABLE "itinerary_slots" ADD CONSTRAINT "ck_itinerary_slots_type" CHECK (length("slot_type") > 0);

