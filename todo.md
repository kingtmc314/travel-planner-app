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
- [x] Backend: role guard helper — verify user is member of trip with required role (owner/editor/viewer)
- [x] Backend: apply role guards to all mutating procedures (activities, expenses, map pins, flights, hotels)
- [x] Backend: members.invite — include role selection (editor/viewer) in invite flow + invite link with role
- [x] Frontend: MembersPage — role badges, owner changes roles, invite link button with role selector
- [x] Frontend: TripLayout — userRole exposed via trips.get in each page
- [x] Frontend: hide edit/delete buttons when user is viewer role (canEdit guard in ItineraryPage)
- [x] Frontend: show "只讀模式" banner when user is viewer — implemented in ItineraryPage

## Bill-Split Calculator (ExpensesPage)
- [x] Backend: expenses.getSplitSummary — per-member paid/owed totals + minimal-transfer settlement list
- [x] Frontend: ExpensesPage — "分帳計算" tab/panel with member balance cards (paid vs owed)
- [x] Frontend: settlement list showing who pays whom and how much
- [x] Frontend: support base currency display (same as existing currency toggle)

## Inline-Editable Expense Table + CSV Import
- [x] Replace expense card list with inline-editable spreadsheet table (click cell to edit, Tab/Enter navigation)
- [x] Table columns: 日期 | 名稱 | 類別 | 貨幣 | 金額 | 付款人 | 操作
- [x] Inline cell editors: date picker, text input, select dropdowns for category/currency/payer
- [x] Add new row button at bottom of table (empty row ready to fill)
- [x] CSV/paste import: "貼上數據" button opens textarea, parse tab/comma separated, preview table, bulk-insert
- [x] CSV column mapping: auto-detect date/title/amount/currency/category columns

## Receipt Photo Upload (Per Expense)
- [x] DB: add receipt_url (text nullable) and receipt_key (text nullable) columns to expenses table
- [x] Backend: expenses.uploadReceipt tRPC mutation — accept base64/multipart, storagePut, return url+key
- [x] Backend: expenses.removeReceipt tRPC mutation — clear receipt_url/key on expense row
- [x] Backend: update expenses.update to accept and persist receipt_url/receipt_key
- [x] Frontend: receipt camera/upload icon button in each expense table row (owner/editor only)
- [x] Frontend: clicking icon opens file picker (image/*, max 10MB)
- [x] Frontend: after upload, show thumbnail in the row; click thumbnail to open full-size lightbox
- [x] Frontend: lightbox has "刪除收據" button to remove the receipt
- [x] Frontend: receipt count badge on expenses page header (e.g. "3 張收據")

## AI Receipt OCR (Auto-fill from Photo)
- [x] Backend: expenses.analyzeReceipt tRPC mutation — accept base64 image, call vision LLM with JSON schema, return { title, amount, currency, date, category }
- [x] Backend: LLM prompt instructs model to extract merchant name, total amount, currency, date, and best-fit category from receipt image
- [x] Frontend: after successful upload, automatically call analyzeReceipt with the same base64 data
- [x] Frontend: show AI result confirmation dialog with extracted fields (editable before applying)
- [x] Frontend: "套用" button applies extracted fields to the expense row via expenses.update
- [x] Frontend: show loading spinner on the row while AI analysis is running
- [x] Frontend: graceful fallback if OCR fails (show toast, skip dialog)

## Full Bilingual Support (ZH/EN)
- [x] Expand i18n translation dictionary with all missing keys for every page (460+ keys)
- [x] TripLayout.tsx: nav tabs (行程/費用/地圖/航班/成員), trip header, settings
- [x] Dashboard.tsx: trip cards, new trip dialog, date/destination fields, search, filters
- [x] ItineraryPage.tsx: all labels, buttons, dialogs, AI suggestions
- [x] ExpensesPage.tsx: all labels, buttons, dialogs, stats, CSV import, OCR dialog
- [x] FlightsPage.tsx: all labels, buttons, dialogs
- [x] MembersPage.tsx: all labels, role names, invite dialog
- [x] MapPage.tsx: all labels, buttons, search
- [x] JoinPage.tsx: join trip page
- [x] NotFound.tsx: 404 page
- [x] TravelHistory.tsx: all labels
- [x] FlightPassport.tsx: all labels
- [x] AppLayout.tsx: tagline, user fallback name
- [x] SyncPage.tsx, GuestMergeBanner.tsx, NotificationsPanel.tsx
- [x] SplitSummaryPanel, FlightRouteMap, SyncCard sub-components

## Bug Fix: Create Trip Failure
- [ ] Diagnose create trip failure (check trips.create procedure, schema validation, date handling)
- [ ] Fix the bug and verify trip creation works end-to-end

## Expense PDF Export
- [ ] Backend: expenses.exportPdf tRPC procedure — fetch all expenses + receipt URLs for a trip, return structured data
- [ ] Frontend: "匯出 PDF" button in ExpensesPage header
- [ ] Frontend: generate PDF client-side using jsPDF or html-to-canvas with itemized table + receipt thumbnails
- [ ] PDF includes: trip name, date range, expense table (date/title/category/amount/payer), receipt thumbnails, total summary

## Public Read-Only Trip Share Link
- [ ] DB: add share_token (varchar, unique, nullable) column to trips table
- [ ] Backend: trips.generateShareToken mutation — generate random token, save to trip, return share URL
- [ ] Backend: trips.getByShareToken public procedure — fetch trip + itinerary + expenses (read-only, no auth required)
- [ ] Frontend: "分享" button in TripLayout header → shows share link dialog with copy button
- [ ] Frontend: /share/:token route → SharedTripView page (read-only, no login required)
- [ ] SharedTripView shows: trip header, itinerary days/activities, expense summary (no amounts if private)

## Expense Chart Analytics
- [ ] Frontend: Add "圖表分析" tab/section in ExpensesPage (alongside existing table)
- [ ] Pie chart: expense breakdown by category (using recharts/chart.js already in project)
- [ ] Pie chart: expense breakdown by payer/member
- [ ] Bar chart: daily/weekly spending trend over trip dates
- [ ] Bar chart: per-member spending comparison
- [ ] Charts respect currency conversion toggle (show converted amounts if active)
- [ ] Charts are responsive and support both ZH/EN labels

## Itinerary Page Redesign (Timeline Style)
- [ ] Day card header: cover photo banner (trip coverImage), dark overlay, date + day-of-week, total daily cost
- [ ] Weather row: temperature range + condition (from existing weather data if available, else omit)
- [ ] Daily route row: origin → destination derived from first/last activity location
- [ ] Pass/ticket tag row: show pass-type tags from activity notes as colored pill badges
- [ ] Timeline activity list: left column = time, center = category icon circle, right = activity card
- [ ] Activity card: title (bold), subtitle/location, cost badge, tags (train number, pass type)
- [ ] Status label: "需劃位" (orange), "建議預約" (orange), "PASS" (green) detected from activity notes keywords
- [ ] Sticky day header when scrolling within a day
- [ ] Add/edit/drag-to-reorder preserved from current implementation
- [ ] Full i18n support for all new labels
