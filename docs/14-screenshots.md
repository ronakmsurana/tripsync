# 14. Application screenshots

Captured automatically by the browser test (`npm run test:ui`, headless Firefox, 1366×900; the last one 390×844) on the seeded demo trip. Re-running the test regenerates them.

| | |
|---|---|
| **Landing** ![](screenshots/01-landing.png) | **Register** ![](screenshots/02-register.png) |
| **Empty dashboard** ![](screenshots/03-dashboard-empty.png) | **Create trip** ![](screenshots/04-create-trip-modal.png) |
| **Dashboard (seeded)** ![](screenshots/10-dashboard.png) | **Unified timeline + collision banner** ![](screenshots/11-trip-timeline.png) |
| **Transit & stays** ![](screenshots/12-logistics.png) | **Activity conflict with suggested slot** ![](screenshots/06-activity-conflict.png) |
| **Experiences & search** ![](screenshots/08-search.png) | **Experiences (seeded)** ![](screenshots/13-activities.png) |
| **Budget** ![](screenshots/07-budget.png) | **Balances & settlement** ![](screenshots/14-budget-balances.png) |
| **Schedule assistant** ![](screenshots/15-schedule-assistant.png) | **Travelers** ![](screenshots/16-travelers.png) |
| **Admin** ![](screenshots/17-admin.png) | **Architecture page** ![](screenshots/18-architecture.png) |
| **Access isolation** ![](screenshots/09-trip-not-found.png) | **Mobile (390 px)** ![](screenshots/19-mobile-trip.png) |

The semantic search screenshot (08) shows the *Keyword · full-text* badge and the "semantic search is currently unavailable" notice, because the embedding model could not be downloaded in the environment where the screenshots were taken. With the model available, the badge reads *Semantic · pgvector cosine*.
