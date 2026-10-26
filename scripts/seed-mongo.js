// ============================================
// MongoDB Seed Script
// ============================================
// Run with: node scripts/seed-mongo.js
// ============================================
// Creates the activities collection with indexes
// and inserts sample activity documents.
// ============================================

const { MongoClient } = require("mongodb");

const MONGODB_URI =
  process.env.MONGODB_URI || "mongodb://localhost:27017/tripsync";

async function seed() {
  const client = new MongoClient(MONGODB_URI);

  try {
    await client.connect();
    console.log("Connected to MongoDB");

    const db = client.db("tripsync");
    const activities = db.collection("activities");

    // ==========================================
    // CREATE INDEXES
    // ==========================================
    console.log("Creating indexes...");

    await activities.createIndex({ tripId: 1, slotType: 1 });
    await activities.createIndex({ tags: 1 }); // Multikey index
    await activities.createIndex({ "location.coordinates": "2dsphere" }); // Geospatial
    await activities.createIndex({ createdBy: 1 });
    await activities.createIndex({ createdAt: -1 });

    console.log("Indexes created successfully");

    // ==========================================
    // SAMPLE ACTIVITY DOCUMENTS
    // ==========================================
    console.log("Inserting sample activities...");

    const sampleActivities = [
      {
        tripId: 1,
        slotType: "sightseeing",
        title: "Sunrise at Hampi Ruins",
        description:
          "Watch the breathtaking sunrise over the ancient Vijayanagara ruins from Matanga Hill. The golden light illuminates the boulder-strewn landscape and centuries-old temples below.",
        location: {
          name: "Matanga Hill, Hampi",
          coordinates: { lat: 15.335, lng: 76.46 },
        },
        tags: [
          "heritage",
          "sunrise",
          "photography",
          "ruins",
          "hiking",
          "scenic",
        ],
        estimatedDurationMinutes: 120,
        estimatedCost: { amount: 0, currency: "INR" },
        media: [],
        notes: [
          {
            userId: 1,
            text: "Start the climb at 5:30 AM. Bring a torch for the rocky path. The view is absolutely worth the early wake-up.",
            createdAt: new Date().toISOString(),
          },
        ],
        weatherPreference: "clear",
        accessibility: "moderate - rocky terrain, steep climb",
        customFields: {
          difficulty: "moderate",
          bestTime: "5:30 AM - 7:00 AM",
          waterRequired: true,
        },
        createdBy: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        tripId: 1,
        slotType: "sightseeing",
        title: "Virupaksha Temple Visit",
        description:
          "Explore the iconic Virupaksha Temple, one of the oldest functioning temples in India. Dedicated to Lord Shiva, this UNESCO World Heritage site features intricate Dravidian architecture and a sacred temple elephant.",
        location: {
          name: "Virupaksha Temple, Hampi Bazaar",
          coordinates: { lat: 15.335, lng: 76.46 },
        },
        tags: [
          "temple",
          "heritage",
          "UNESCO",
          "architecture",
          "spiritual",
          "Dravidian",
        ],
        estimatedDurationMinutes: 90,
        estimatedCost: { amount: 25, currency: "INR" },
        media: [],
        notes: [
          {
            userId: 1,
            text: "Entry is free for Indian nationals. The temple elephant Lakshmi blesses visitors in the morning.",
            createdAt: new Date().toISOString(),
          },
        ],
        weatherPreference: "any",
        accessibility: "easy - flat ground, wheelchair accessible main areas",
        customFields: {
          dressCode: "covered shoulders and knees",
          photographyAllowed: true,
          guidesAvailable: true,
          entryFee: "₹25 for foreigners, free for Indians",
        },
        createdBy: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        tripId: 1,
        slotType: "meal",
        title: "Breakfast at Mango Tree",
        description:
          "Enjoy traditional South Indian breakfast with a stunning riverside view at the famous Mango Tree restaurant. Known for their banana pancakes, fresh fruit bowls, and filter coffee.",
        location: {
          name: "Mango Tree Restaurant, Hampi",
          coordinates: { lat: 15.337, lng: 76.461 },
        },
        tags: ["food", "riverside", "breakfast", "local cuisine", "relaxing"],
        estimatedDurationMinutes: 60,
        estimatedCost: { amount: 300, currency: "INR" },
        media: [],
        notes: [
          {
            userId: 2,
            text: "Try the banana pancakes — best in Hampi! Gets crowded after 9 AM.",
            createdAt: new Date().toISOString(),
          },
        ],
        weatherPreference: "any",
        accessibility: "moderate - walk through narrow lanes",
        customFields: {
          cuisine: "South Indian, Continental",
          vegetarian: true,
          averageCostPerPerson: 150,
          reservationRequired: false,
        },
        createdBy: 2,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        tripId: 1,
        slotType: "leisure",
        title: "Coracle Ride on Tungabhadra",
        description:
          "Take a relaxing coracle (circular boat) ride on the Tungabhadra River. The unique round boats are traditional to this region and offer a peaceful way to see the riverside ruins and boulder formations.",
        location: {
          name: "Tungabhadra River, near Kodandarama Temple",
          coordinates: { lat: 15.34, lng: 76.465 },
        },
        tags: [
          "river",
          "coracle",
          "relaxing",
          "unique experience",
          "water activity",
        ],
        estimatedDurationMinutes: 45,
        estimatedCost: { amount: 200, currency: "INR" },
        media: [],
        notes: [
          {
            userId: 1,
            text: "₹100 per person for a shared coracle, ₹200 for a private one. Best in the afternoon.",
            createdAt: new Date().toISOString(),
          },
        ],
        weatherPreference: "clear",
        accessibility: "moderate - need to climb down to river bank",
        customFields: {
          duration: "30-45 minutes",
          safetyJackets: true,
          bestSeason: "October to March",
        },
        createdBy: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        tripId: 1,
        slotType: "sightseeing",
        title: "Vittala Temple & Stone Chariot",
        description:
          "Visit the crown jewel of Hampi — the Vittala Temple complex. Home to the iconic Stone Chariot and the famous musical pillars that produce musical notes when tapped. The most photographed monument in Hampi.",
        location: {
          name: "Vittala Temple Complex, Hampi",
          coordinates: { lat: 15.342, lng: 76.472 },
        },
        tags: [
          "heritage",
          "UNESCO",
          "architecture",
          "Stone Chariot",
          "musical pillars",
          "iconic",
        ],
        estimatedDurationMinutes: 150,
        estimatedCost: { amount: 40, currency: "INR" },
        media: [],
        notes: [
          {
            userId: 1,
            text: "Visit early morning to avoid crowds and heat. The musical pillars area may be roped off.",
            createdAt: new Date().toISOString(),
          },
        ],
        weatherPreference: "any",
        accessibility: "moderate - extensive walking on uneven terrain",
        customFields: {
          entryFee: "₹40 Indian, ₹600 foreign",
          audioGuide: true,
          photographyAllowed: true,
          mustSee: ["Stone Chariot", "Musical Pillars", "Kalyana Mantapa"],
        },
        createdBy: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        tripId: 1,
        slotType: "custom",
        title: "Bicycle Tour of Royal Enclosure",
        description:
          "Rent bicycles and explore the Royal Enclosure area, including the Queen's Bath, Lotus Mahal, Elephant Stables, and the Underground Shiva Temple. Cycling is the best way to cover the spread-out ruins.",
        location: {
          name: "Royal Enclosure, Hampi",
          coordinates: { lat: 15.324, lng: 76.46 },
        },
        tags: [
          "cycling",
          "exploration",
          "ruins",
          "royal",
          "adventure",
          "self-guided",
        ],
        estimatedDurationMinutes: 180,
        estimatedCost: { amount: 150, currency: "INR" },
        media: [],
        notes: [
          {
            userId: 2,
            text: "Bicycle rental is ₹100-150 for the day. Start from Hampi Bazaar. Carry water and sunscreen!",
            createdAt: new Date().toISOString(),
          },
        ],
        weatherPreference: "clear",
        accessibility: "easy on bicycle, some walking for temple interiors",
        customFields: {
          bikeRentalCost: 150,
          distance: "~10 km round trip",
          keyStops: [
            "Queen's Bath",
            "Lotus Mahal",
            "Elephant Stables",
            "Underground Temple",
            "Mahanavami Dibba",
          ],
        },
        createdBy: 2,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];

    // Clear existing data
    await activities.deleteMany({ tripId: 1 });

    // Insert sample activities
    const result = await activities.insertMany(sampleActivities);
    console.log(`Inserted ${result.insertedCount} sample activities`);

    // ==========================================
    // AGGREGATION PIPELINE DEMO
    // ==========================================
    console.log("\n--- Aggregation Pipeline Demo ---\n");

    // 1. Total estimated cost per activity type
    const costByType = await activities
      .aggregate([
        { $match: { tripId: 1 } },
        {
          $group: {
            _id: "$slotType",
            totalEstimated: { $sum: "$estimatedCost.amount" },
            count: { $sum: 1 },
            avgDuration: { $avg: "$estimatedDurationMinutes" },
          },
        },
        { $sort: { totalEstimated: -1 } },
      ])
      .toArray();

    console.log("Cost by activity type:");
    console.table(costByType);

    // 2. Most popular tags
    const topTags = await activities
      .aggregate([
        { $match: { tripId: 1 } },
        { $unwind: "$tags" },
        { $group: { _id: "$tags", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 },
      ])
      .toArray();

    console.log("\nTop tags:");
    console.table(topTags);

    // 3. Activities by creator
    const byCreator = await activities
      .aggregate([
        { $match: { tripId: 1 } },
        {
          $group: {
            _id: "$createdBy",
            activitiesCreated: { $sum: 1 },
            totalEstimatedCost: { $sum: "$estimatedCost.amount" },
          },
        },
      ])
      .toArray();

    console.log("\nActivities by creator:");
    console.table(byCreator);

    console.log("\n✅ MongoDB seed completed successfully!");
  } catch (error) {
    console.error("Seed error:", error);
    process.exit(1);
  } finally {
    await client.close();
  }
}

seed();
