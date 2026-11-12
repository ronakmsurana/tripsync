# 11. API reference

All endpoints are Next.js Route Handlers under `src/app/api` (generated from the actual route files: 47 endpoints).
Every private endpoint requires the session cookie; "role" is the minimum trip role or global role required.

**Envelope** — success: `{ "success": true, "data": …, "message"?: "…" }` · failure: `{ "success": false, "error": { "code": "…", "message": "…", "details"?: … } }`

**Status codes** — 400 validation (`details: [{field, message}]`) · 401 not signed in · 403 role too low / cross-site request · 404 not found **or not your trip** ·
409 conflict (duplicate, in use, schedule conflict, last organizer) · 422 rule violated (outside trip dates, bad split, …) · 429 rate limited · 503 MongoDB/embedding service unavailable · 500 unexpected (details only in the server log).

**Formats** — money: decimal **strings** `"1234.50"` · dates `YYYY-MM-DD` · schedule times `YYYY-MM-DDTHH:mm` (wall-clock, no timezone) · activity ids are MongoDB ObjectIds.

| Method | Path | Role | Purpose |
|---|---|---|---|
| GET | `/api/admin/overview` | admin | Counts, drift, embedding status, user list |
| POST | `/api/admin/reconcile` | admin | Repair PostgreSQL / MongoDB / vector-index drift; generate pending embeddings |
| PATCH | `/api/admin/users/:userId` | admin | Change role or status (not your own) |
| POST | `/api/auth/login` | public | Sign in; sets session cookie. Body `{email,password}` |
| POST | `/api/auth/logout` | public | Clear the session cookie |
| GET | `/api/auth/me` | signed-in user | Current user `{userId,name,email,role}` |
| POST | `/api/auth/register` | public | Create account; sets session cookie. Body `{name,email,password,phone?}` |
| GET | `/api/dashboard` | signed-in user | Statistics: trips, active, collisions, spend vs budget per currency, next activities |
| GET | `/api/health` | public | Liveness + PostgreSQL, pgvector, MongoDB, embedding status (no data, no secrets) |
| GET | `/api/trips` | signed-in user | My trips. Query `q` (name/description/destination), `status`, `sort` = start_asc, start_desc, name |
| POST | `/api/trips` | signed-in user | Create trip (creator becomes organizer; optional `primaryDestination`) |
| GET | `/api/trips/:tripId` | any member | Trip detail, my role, counts |
| PUT | `/api/trips/:tripId` | organizer | Update trip (DB trigger blocks shrinking around scheduled items) |
| DELETE | `/api/trips/:tripId` | organizer | Delete trip; cascades in PostgreSQL, purges MongoDB documents |
| GET | `/api/trips/:tripId/accommodation` | any member | List stays |
| POST | `/api/trips/:tripId/accommodation` | organizer | Add stay |
| PUT | `/api/trips/:tripId/accommodation/:accommodationId` | organizer | Edit stay |
| DELETE | `/api/trips/:tripId/accommodation/:accommodationId` | organizer | Remove stay |
| GET | `/api/trips/:tripId/activities` | any member | List activities (PostgreSQL slots + MongoDB details + index status) |
| POST | `/api/trips/:tripId/activities` | organizer, traveler | Create activity. **409 `SCHEDULE_CONFLICT`** with `{conflicts, suggestion}` unless `force:true` |
| GET | `/api/trips/:tripId/activities/:activityId` | any member | One activity (`activityId` = ObjectId) |
| PUT | `/api/trips/:tripId/activities/:activityId` | organizer, traveler | Edit (organizer: any; traveler: own). Same conflict handling |
| DELETE | `/api/trips/:tripId/activities/:activityId` | organizer, traveler | Delete from PostgreSQL, the index and MongoDB (organizer: any; traveler: own) |
| GET | `/api/trips/:tripId/budget` | any member | Planned vs spent per category (view), totals, estimated activity cost (MongoDB), member balances (view) |
| POST | `/api/trips/:tripId/budget` | organizer | Set/update a category budget (upsert) |
| DELETE | `/api/trips/:tripId/budget/:category` | organizer | Remove a category budget |
| GET | `/api/trips/:tripId/conflicts` | any member | All conflicts with suggested free slots and a summary |
| GET | `/api/trips/:tripId/destinations` | any member | List destinations |
| POST | `/api/trips/:tripId/destinations` | organizer | Add destination |
| PUT | `/api/trips/:tripId/destinations/:destinationId` | organizer | Edit destination |
| DELETE | `/api/trips/:tripId/destinations/:destinationId` | organizer | Remove (409 if used by transport/stays; activities are unlinked) |
| GET | `/api/trips/:tripId/expenses` | any member | List expenses with splits |
| POST | `/api/trips/:tripId/expenses` | organizer, traveler | Record expense; `splitWith:[ids]` equal split (exact paise) or `splits:[{userId,shareAmount}]` |
| PUT | `/api/trips/:tripId/expenses/:expenseId` | organizer, traveler | Replace expense + splits (409 once settlement payments exist) |
| DELETE | `/api/trips/:tripId/expenses/:expenseId` | organizer, traveler | Delete expense (409 once settlement payments exist) |
| GET | `/api/trips/:tripId/insights` | any member | MongoDB `$facet` aggregation: by type, top tags, totals |
| GET | `/api/trips/:tripId/members` | any member | List members |
| POST | `/api/trips/:tripId/members` | organizer | Add an existing user by e-mail with a role |
| PATCH | `/api/trips/:tripId/members/:userId` | organizer | Change role (DB trigger keeps at least one organizer) |
| DELETE | `/api/trips/:tripId/members/:userId` | any member | Remove member (organizer) or leave (self); 409 if part of expenses |
| POST | `/api/trips/:tripId/search` | any member | Body `{query, mode: auto/semantic/keyword, limit}`; response states `modeUsed` and any notice; 503 `EMBEDDINGS_UNAVAILABLE` for semantic-only when the model is down |
| POST | `/api/trips/:tripId/settlements` | organizer, traveler | Settle a member's outstanding shares via `fn_settle_member_dues`; body `{paymentMethod, userId?}` (others: organizer only) |
| GET | `/api/trips/:tripId/timeline` | any member | Unified chronological feed (SQL view + MongoDB details + conflict counts) |
| GET | `/api/trips/:tripId/transport` | any member | List transport bookings |
| POST | `/api/trips/:tripId/transport` | organizer | Add booking (destinations must belong to the trip) |
| PUT | `/api/trips/:tripId/transport/:transportId` | organizer | Edit booking |
| DELETE | `/api/trips/:tripId/transport/:transportId` | organizer | Remove booking |

`DELETE /members/:userId` is open to any member for *themselves* (leave); removing someone else needs the organizer role.

## Example
```bash
curl -c jar -X POST localhost:3000/api/auth/login -H 'content-type: application/json' \
     -d '{"email":"ronak@example.com","password":"<your SEED_DEMO_PASSWORD>"}'
curl -b jar localhost:3000/api/trips/1/conflicts
# -> {"success":true,"data":{"conflicts":[{"severity":"hard","kind":"activity_check_out", ...
#      "suggestion":{"startTime":"2026-12-23T11:00","endTime":"2026-12-23T12:45"}}],"summary":{"total":1,"hard":1,"soft":0}}}
```
