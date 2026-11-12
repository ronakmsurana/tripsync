# 1. Problem statement, objectives, scope, functional requirements

## Problem statement
Planning a group trip means juggling bookings in e-mails, an itinerary in a document, costs in a spreadsheet and decisions in a chat.
Because these live apart, nothing notices that

* a sightseeing slot runs through the hotel check-out,
* a bus departs (and requires boarding 30 minutes earlier) while lunch is still planned,
* two activities overlap,
* the group has overspent a category, or nobody knows who owes whom after several people paid for different things.

Travellers also struggle to *find* things in a long itinerary by describing what they want rather than by exact words.

## Objectives
1. Keep destinations, bookings, activities, budget and expenses in one consistent, permission-controlled data store.
2. Detect schedule conflicts automatically — including travel buffers — and offer a one-click fix.
3. Keep money **exact** (no floating-point error) and make group settlement auditable.
4. Let people search the itinerary by meaning.
5. Use SQL, NoSQL and vector storage each where it is the best fit, with integrity enforced in the database itself.

## Scope
**In scope:** accounts, global and per-trip roles; trips; destinations; transport; accommodation; itinerary activities;
conflict detection and suggestions; budget, expenses, equal/explicit splits, settlement; member management;
dashboard statistics, search and filtering; semantic and keyword search; administration of the three data stores.

**Out of scope (see "future enhancements"):** payments with real money, e-mail invitations, real-time co-editing, maps/geo queries,
multi-currency conversion, mobile apps.

## Functional requirements
| ID | Requirement |
|---|---|
| FR-1 | A visitor can register and sign in; passwords are stored only as bcrypt hashes. |
| FR-2 | A signed-in user sees only their own trips and statistics (trips, upcoming activities, collisions, spend vs. budget). |
| FR-3 | A user can create, edit, delete a trip (organizer only for edit/delete) and search/filter/sort their trips. |
| FR-4 | An organizer can manage destinations, transport bookings and accommodation; everything must fall inside the trip dates. |
| FR-5 | Organizers and travelers can add activities; each is stored as a time slot (PostgreSQL) plus a rich document (MongoDB). |
| FR-6 | The system reports hard conflicts (activity vs. transport incl. boarding buffer, vs. hotel check-in/out; transport vs. transport) and soft conflicts (activity vs. activity), and proposes the nearest free slot. |
| FR-7 | An organizer sets category budgets; any traveler records expenses split between selected members; totals and balances are computed from stored rows. |
| FR-8 | A member can settle their outstanding shares; settlements are recorded as payments and change the balances. |
| FR-9 | An organizer invites members by e-mail, changes roles, removes members; a member can leave. A trip always keeps one organizer. |
| FR-10 | Viewers are read-only. Non-members cannot discover or access a trip. |
| FR-11 | Users can search activities semantically (vector similarity) or by keyword (full text); the UI states which engine answered. |
| FR-12 | An administrator can see system health, reconcile the data stores, and suspend/reactivate users. A suspended user loses access immediately. |
| FR-13 | Invalid data is rejected by the database (CHECK, FK, UNIQUE, triggers, MongoDB validator), not only by the application. |

## Non-functional requirements
Security (OWASP-style basics), data integrity, repeatable setup, test coverage of the database layer, an uncluttered UI.
