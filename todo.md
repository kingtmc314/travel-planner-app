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
- [ ] Fix OAuth callback failed on published domain (MySQL schema mismatch with postgres driver)

## New Features
- [ ] Travel History page: world SVG map with visited/planned/wishlist countries (Mark O'Travel style)
- [ ] Travel History: country count stats (e.g. 42/203 visited), coloured map regions
- [ ] Travel History: add/remove countries with status (visited/planned/wishlist)
- [ ] Flight Passport page: personal stats (total flights, distance km, flight time, airports, airlines)
- [ ] Flight Passport: year-by-year breakdown tabs (All-Time, 2026, 2025, 2024...)
- [ ] Flight Passport: flight route lines on map/globe
- [ ] Wire both new pages into sidebar/bottom navigation
- [ ] Add DB tables: visited_countries, past_flights
