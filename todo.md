# Travel Planner App - TODO

## Database Schema
- [x] trips table (id, name, destination, startDate, endDate, baseCurrency, coverImage, createdBy)
- [x] trip_members table (id, tripId, userId, role: owner/editor/viewer, inviteEmail, inviteName)
- [x] itinerary_days table (id, tripId, date, dayNumber)
- [x] activities table (id, dayId, tripId, time, title, location, notes, category, sortOrder)
- [x] expenses table (id, tripId, title, amount, currency, paidBy, date, category, splitAmong)
- [x] map_pins table (id, tripId, title, lat, lng, type, description)
- [x] flights table (id, tripId, airline, flightNumber, departureDate, arrivalDate, type, notes)
- [x] accommodations table (id, tripId, name, address, checkIn, checkOut, confirmationNumber, notes)
- [x] notifications table (id, userId, tripId, type, message, read, createdAt)

## Server Routers
- [x] trips router (list, get, create, update, delete, importDemo)
- [x] members router (list, add, updateRole, remove)
- [x] itinerary router (getDays, addActivity, updateActivity, deleteActivity)
- [x] expenses router (list, add, delete)
- [x] map router (getPins, addPin, deletePin)
- [x] flights router (list, add, delete)
- [x] hotels router (list, add, delete)
- [x] notifications router (list, unreadCount, markRead, markAllRead)
- [x] ai router (chat, suggestActivities)

## Client Pages & Components
- [x] Global styles (premium light theme, OKLCH color tokens, typography, animations)
- [x] App layout with mobile bottom nav + desktop sidebar
- [x] Auth guard (redirect to login if unauthenticated)
- [x] Login/landing page with sign-in CTA
- [x] Dashboard page (trip cards grid, create trip button)
- [x] Create/edit trip modal (name, destination, dates, currency, cover)
- [x] Trip layout (sidebar/bottom nav with sub-pages)
- [x] Itinerary page (day tabs, timeline cards, add/edit/AI suggestions)
- [x] Expenses page (log expense, pie chart, bar chart)
- [x] Map page (Google Maps with pins, add/delete pins)
- [x] Members page (list members, invite, change role, remove)
- [x] Flights & Accommodation page (tabbed: flights + hotels)
- [x] AI assistant panel (chat + suggest activities for destination)
- [x] Notifications panel/bell icon with unread badge
- [x] Egypt demo auto-import on first load for new users

## Real-time & Notifications
- [x] Polling for real-time updates (30s interval on notifications)
- [x] In-app notifications on expense/itinerary/member changes
- [x] Notification bell with unread count badge

## Polish & QA
- [x] Mobile-first responsive layout (bottom nav on mobile, sidebar on desktop)
- [x] Smooth animations and transitions (framer-motion)
- [x] Empty states for all pages
- [x] Loading spinners
- [x] Error handling and toasts (sonner)

## Tests
- [x] Auth tests (me, logout)
- [x] Protected procedure authorization tests (all routers)
- [x] 15/15 tests passing

## Bug Fixes
- [x] Fix OAuth callback failed on published domain (MySQL schema mismatch with postgres driver)

## New Features
- [x] Travel History page: world SVG map with visited/planned/wishlist countries (Mark O'Travel style)
- [x] Travel History: country count stats (e.g. 42/203 visited), coloured map regions
- [x] Travel History: add/remove countries with status (visited/planned/wishlist)
- [x] Flight Passport page: personal stats (total flights, distance km, flight time, airports, airlines)
- [x] Flight Passport: year-by-year breakdown tabs (All-Time, 2026, 2025, 2024...)
- [x] Flight Passport: flight route lines on map/globe
- [x] Wire both new pages into sidebar/bottom navigation
- [x] Add DB tables: visited_countries, past_flights

## Bug Fixes Round 2
- [x] Fix: No procedure found on path "travelHistory.getCountries" (router not registered or wrong path)
- [x] Fix: db.getUnreadNotificationCount is not a function (wrong function name called)
- [x] Fix: value.toISOString is not a function (date handling in demo import mutation)

## Auto-import Trip Destinations to Travel History
- [x] When a trip is created with a destination, auto-detect country and upsert to visited_countries as "visited"
- [x] Add country detection helper (map destination/location string to ISO country code + country name)
- [x] Fix: TravelHistory and FlightPassport pages have no navigation bar (bottom nav on mobile, sidebar on desktop)

## Flight History Seed
- [x] Add seedMyFlights mutation to passport router with all 44 historical flights from Flighty
- [x] Add "Import Historical Flights" button to FlightPassport page (shown when no flights exist)
- [x] Create shared AppLayout component for consistent navigation across all pages

## Edit/Modify Buttons - All Sections
- [x] Trip details: Add edit button to TripLayout header (name, destination, dates, cover image, description)
- [x] Itinerary: Activity edit already existed; day title/date edit added via TripLayout
- [x] Expenses: Add edit button to each expense row + update mutation in router
- [x] Trip Flights: Add edit button to each flight + update mutation in router
- [x] Accommodations: Add edit button to each accommodation + update mutation in router
- [x] Past Flights (Passport): Add edit button to each past flight + updateFlight mutation
- [x] Visited Countries (Travel History): Add edit button to each country card + upsert mutation
- [x] Add updateExpense, updateFlight, updateAccommodation, updatePastFlight, updateMapPin db helpers
- [x] Add expenses.update, flights.update, hotels.update, passport.updateFlight, map.updatePin tRPC procedures

## Interactive World Map on Travel History Page
- [x] Install d3-geo and topojson-client for SVG world map projection
- [x] Download world TopoJSON data and upload to static storage
- [x] Create WorldMap component with country highlighting by status
- [x] Add tooltips showing country name and status on hover
- [x] Add zoom/pan interaction (scroll wheel + drag + +/- buttons)
- [x] Integrate WorldMap into TravelHistory page replacing old placeholder map
- [x] Add color legend (visited=green, planned=blue, wishlist=amber)
- [x] Click unvisited country on map to open add-country dialog pre-filled

## Flight Import → Auto-sync Visited Countries
- [x] Expand FLIGHT_COUNTRY_TO_ISO map covering all 44 seeded flights (Japan, Taiwan, Thailand, Egypt, UAE, UK, HK, etc.)
- [x] After seedMyFlights, auto-upsert visited countries for each unique destination country
- [x] Return countriesSynced count in seedMyFlights mutation response
- [x] Show post-import summary dialog: "X flights imported, Y new countries added to map"
- [x] Add "Sync Map" button for users who already imported flights (syncCountriesFromFlights mutation)

## Remove Egypt Demo Auto-import & Add Map to Flight Passport
- [x] Remove auto-import of Egypt demo trip on Dashboard (useEffect + importDemo mutation)
- [x] Replace "正在準備示範行程" empty state with a clean "新增第一個行程" CTA
- [x] Remove Egypt demo mention from Home.tsx landing page text
- [x] Add WorldMap component to FlightPassport page (same as TravelHistory)
- [x] Highlight visited countries on passport map based on past flights' countries
- [x] Draw flight route arcs on the map between departure and arrival airports (quadratic bezier, deduplicated)

## 6 Improvements (Round 3)
- [x] #1 Auto-link: addFlight/updateFlight/deleteFlight mutations now auto-upsert/re-sync visited_countries
- [x] #1 Auto-link: seedMyFlights already syncs on import; add/edit/delete mutations also trigger sync
- [x] #2 Per-country detail map: click a country in TravelHistory to open a detail sheet with Google Map zoomed to that country
- [x] #2 Place search in country detail: bilingual search (Chinese + English) using Google Places Autocomplete
- [x] #3 Visited country percentage: show "X / 195 countries (Y%)" in TravelHistory stats header
- [x] #5 Year filter real-time update: flightRoutes and mapCountries now derived from stats.filtered (year-filtered subset)
- [x] #6 Bilingual place search: Google Places Autocomplete supports both Chinese and English natively
- [x] #4 Mobile UX: Dashboard refactored to use AppLayout (removes duplicate sidebar/bottom nav)
- [x] #4 Mobile UX: FlightPassport header buttons icon-only on mobile to prevent overflow
- [x] #4 Mobile UX: WorldMap component has touch pinch-zoom and drag support for mobile

## SYNC Page - All Functions Sync
- [x] Create /sync route and SyncPage component
- [x] Add "同步中心" nav item to AppLayout sidebar and mobile bottom nav
- [x] Backend: sync router with syncAll, syncCountriesFromFlights, syncCountriesFromTrips, syncDataIntegrity, getSummary procedures
- [x] SyncPage: "一鍵全部同步" button that triggers all sync operations in sequence
- [x] SyncPage: per-category sync cards (飛行護照→旅遊足跡, 行程目的地→旅遊足跡, 資料完整性檢查)
- [x] Each card shows: record count, status badge (synced/pending/error), individual sync button
- [x] Show real-time progress and log during sync
- [x] Sync: visited_countries ← auto-derive from trips destinations + past_flights airports
- [x] Sync: trip member counts, expense totals, flight counts recalculated (via getSummary)
- [x] Sync: past_flights → visited_countries (exposed as sync action in syncRouter)
- [x] Sync: orphaned records cleanup (via syncDataIntegrity)
- [x] Add sync status summary at top: total records (data overview grid)

## Currency Conversion Feature
- [x] Backend: currency_router.ts with frankfurter.dev v2 API (free, no key, 55 central banks)
- [x] Backend: getHistoricalRate() — fetches HKD-based rate for a specific date; API auto-returns last trading day for weekends/holidays
- [x] Backend: getLatestRates() — latest rates for summary display
- [x] Backend: convertExpenses tRPC procedure — per-expense historical rate conversion, deduplicates API calls, parallel fetch
- [x] Backend: fallback to hardcoded approximate rates if API unavailable
- [x] Frontend: "換算" toggle button in ExpensesPage header
- [x] Frontend: currency picker dropdown (原始貨幣 + 17 currencies)
- [x] Frontend: per-expense converted amount with original amount shown as secondary text
- [x] Frontend: rate date annotation per expense row (e.g. "2025-01-15 匯率")
- [x] Frontend: fallback indicator (amber warning) vs normal (blue info) notice banner
- [x] Frontend: charts (pie + bar) recalculate totals using converted amounts
- [x] Frontend: summary card "總費用" updates to converted total
- [x] Fixed TypeScript conflict: removed inline currencyRouter from routers.ts (was duplicating the import)
- [x] 15/15 tests passing, 0 TypeScript errors

## AI Auto-Categorisation in Sync Center
- [x] Backend: expenses.autoClassify tRPC procedure — fetch all "other" expenses, batch-call invokeLLM with structured JSON output, return preview list of (id, title, suggestedCategory)
- [x] Backend: expenses.applyClassification mutation — accept array of {id, category} and bulk-update
- [x] Frontend: SyncPage — new "AI 自動分類" card with uncategorised count badge
- [x] Frontend: "開始分類" button triggers autoClassify query, shows per-expense preview table
- [x] Frontend: user can review/override each suggestion before confirming
- [x] Frontend: "確認套用" button calls applyClassification mutation, shows success count
- [x] Frontend: progress indicator during LLM call (can take a few seconds for large batches)

## Map Pin Auto-Geocode + Itinerary Fix
- [x] Map pin dialog: type place name → Google Places Geocoder auto-fills lat/lng/address
- [x] Itinerary page: fix "0 天行程" empty state — show proper empty state with "新增第一天" button
- [x] Itinerary page: add "從地圖標記匯入" option when adding activity to a day

## Drag-and-Drop Activity Reorder
- [x] Install @dnd-kit/core, @dnd-kit/sortable, @dnd-kit/utilities
- [x] Backend: itinerary.reorderActivities tRPC procedure (accepts dayId + ordered array of activity IDs, bulk-updates sortOrder)
- [x] Frontend: wrap each day's activity list in DndContext + SortableContext
- [x] Frontend: each activity card becomes a SortableItem with drag handle icon
- [x] Frontend: optimistic update on drag end, persist via reorderActivities mutation
- [x] Frontend: touch-sensor support for mobile drag

## Three New Features (Round 4)
- [x] ExpensesPage: date-range filter (start/end date pickers in header, client-side filter on expense list + charts)
- [x] ItineraryPage: move-to-another-day — backend moveActivity procedure + day picker dialog in activity action menu
- [x] ItineraryPage: export as PDF — "匯出行程" button generates printable HTML page and triggers browser print

## Major Overhaul Round 5
- [x] Rebrand: new app name VoyageAI · 旅跡, SVG globe+route logo, updated AppLayout/Home/Dashboard/AIAssistant
- [x] i18n: zh/en translation system with useI18n hook and language toggle in AppLayout header
- [x] Guest mode: useGuestTrips hook (localStorage), GuestDashboard, GuestMergeBanner (sync on login)
- [x] Privacy: confirmed trips.list/get use tripMembers JOIN; mergeGuestTrips procedure added

## Guest Mode Notes (Known Limitations)
- [x] Guest mode merges trip-level metadata only (name/destination/dates) — activities/expenses not merged (by design: guest mode is lightweight)
- [x] Merge is manual-prompt (not auto-on-login) — user sees GuestMergeBanner and clicks to confirm
- [x] Guest trips are read-only in terms of activities/expenses in guest mode (full editing requires login)

## Collaborative Trip Editing (Role-Based)
- [ ] Backend: role guard helper — verify user is member of trip with required role (owner/editor/viewer)
- [ ] Backend: apply role guards to all mutating procedures (activities, expenses, map pins, flights, hotels)
- [ ] Backend: members.invite — include role selection (editor/viewer) in invite flow
- [ ] Frontend: MembersPage — show role badge per member, owner can change roles inline
- [ ] Frontend: TripLayout — expose current user's role via context
- [ ] Frontend: hide edit/delete buttons when user is viewer role
- [ ] Frontend: show "只讀模式" banner when user is viewer
