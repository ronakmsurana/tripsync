// ============================================
// MongoDB client singleton + collection setup
// ============================================
// MongoDB stores the *rich, schema-flexible* part of an itinerary activity
// (description, tags, notes, per-type custom fields). The time skeleton and
// everything relational lives in PostgreSQL.
// ============================================

import { MongoClient, Db, Collection, Document } from "mongodb";
import { env } from "@/lib/env";

const globalForMongo = globalThis as unknown as {
  __mongoClient?: Promise<MongoClient>;
  __mongoReady?: Promise<void>;
};

function getClientPromise(): Promise<MongoClient> {
  if (!globalForMongo.__mongoClient) {
    const client = new MongoClient(env().MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 5000,
    });
    globalForMongo.__mongoClient = client.connect().catch((err) => {
      // Allow a later retry instead of caching a rejected promise forever.
      globalForMongo.__mongoClient = undefined;
      throw err;
    });
  }
  return globalForMongo.__mongoClient;
}

export async function getMongoDb(): Promise<Db> {
  const client = await getClientPromise();
  return client.db(env().MONGODB_DB);
}

export const ACTIVITIES = "activities";

/** Document validator: the NoSQL "schema" enforced by the database itself. */
export const activityValidator = {
  $jsonSchema: {
    bsonType: "object",
    required: ["tripId", "slotType", "title", "createdBy", "createdAt", "updatedAt"],
    properties: {
      tripId: { bsonType: ["int", "long"], minimum: 1 },
      slotType: { bsonType: "string", minLength: 1, maxLength: 30 },
      title: { bsonType: "string", minLength: 1, maxLength: 200 },
      description: { bsonType: "string", maxLength: 5000 },
      tags: { bsonType: "array", maxItems: 20, items: { bsonType: "string", maxLength: 40 } },
      estimatedDurationMinutes: { bsonType: ["int", "long", "double"], minimum: 0 },
      estimatedCost: {
        bsonType: "object",
        required: ["amount", "currency"],
        properties: {
          amount: { bsonType: ["int", "long", "double", "decimal"], minimum: 0 },
          currency: { bsonType: "string", minLength: 3, maxLength: 3 },
        },
      },
      notes: {
        bsonType: "array",
        items: {
          bsonType: "object",
          required: ["userId", "text", "createdAt"],
          properties: {
            userId: { bsonType: ["int", "long"] },
            text: { bsonType: "string", maxLength: 2000 },
            createdAt: { bsonType: "date" },
          },
        },
      },
      customFields: { bsonType: "object" },
      createdBy: { bsonType: ["int", "long"] },
      createdAt: { bsonType: "date" },
      updatedAt: { bsonType: "date" },
    },
  },
};

/** Idempotent: creates the collection with its validator and indexes if missing. */
export async function ensureMongoSetup(db?: Db): Promise<void> {
  const database = db ?? (await getMongoDb());
  const existing = await database.listCollections({ name: ACTIVITIES }).toArray();
  if (existing.length === 0) {
    await database.createCollection(ACTIVITIES, {
      validator: activityValidator,
      validationLevel: "strict",
      validationAction: "error",
    });
  } else {
    await database.command({
      collMod: ACTIVITIES,
      validator: activityValidator,
      validationLevel: "strict",
      validationAction: "error",
    });
  }
  const col = database.collection(ACTIVITIES);
  await col.createIndex({ tripId: 1, slotType: 1 }, { name: "idx_trip_slottype" });
  await col.createIndex({ tags: 1 }, { name: "idx_tags_multikey" });
  await col.createIndex({ tripId: 1, createdAt: -1 }, { name: "idx_trip_created" });
}

/** Lazily runs setup once per process so a fresh database works out of the box. */
export async function getActivitiesCollection<T extends Document = Document>(): Promise<Collection<T>> {
  const db = await getMongoDb();
  if (!globalForMongo.__mongoReady) {
    globalForMongo.__mongoReady = ensureMongoSetup(db).catch((err) => {
      globalForMongo.__mongoReady = undefined;
      throw err;
    });
  }
  await globalForMongo.__mongoReady;
  return db.collection<T>(ACTIVITIES);
}

export async function closeMongo(): Promise<void> {
  if (globalForMongo.__mongoClient) {
    const client = await globalForMongo.__mongoClient;
    await client.close();
    globalForMongo.__mongoClient = undefined;
    globalForMongo.__mongoReady = undefined;
  }
}
