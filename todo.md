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
