# Schema Audit: DB vs schema.ts Mismatches

## Key Findings

### trips table
| Column | DB Type | schema.ts Type | MISMATCH? |
|--------|---------|---------------|-----------|
| startDate | varchar(20) | timestamp | **YES** |
| endDate | varchar(20) | timestamp | **YES** |
| shareToken | varchar(64) | varchar(64) | OK |

### expenses table
| Column | DB Type | schema.ts Type | MISMATCH? |
|--------|---------|---------------|-----------|
| date | varchar(20) | timestamp | **YES** |

### itinerary_days table
| Column | DB Type | schema.ts Type | MISMATCH? |
|--------|---------|---------------|-----------|
| date | varchar(20) | varchar(20) | OK (already fixed) |

### past_flights table
| Column | DB Type | schema.ts Type | MISMATCH? |
|--------|---------|---------------|-----------|
| flightDate | timestamp | timestamp | OK |

### visited_countries table
| Column | DB Type | schema.ts Type | MISMATCH? |
|--------|---------|---------------|-----------|
| visitedAt | timestamp | timestamp | OK |

### flights table (trip flights)
| Column | DB Type | schema.ts Type | MISMATCH? |
|--------|---------|---------------|-----------|
| date | varchar(20) | varchar(30) | Minor (30 vs 20, no issue) |
| departTime | varchar(10) | varchar(30) | Minor (30 vs 10) |
| arriveTime | varchar(10) | varchar(30) | Minor (30 vs 10) |
| duration | varchar(20) | varchar(30) | Minor (30 vs 20) |
| layoverDuration | varchar(20) | varchar(30) | Minor (30 vs 20) |
| departure_date | date | NOT IN SCHEMA | **MISSING** |
| arrival_date | date | NOT IN SCHEMA | **MISSING** |
| type | varchar(20) | NOT IN SCHEMA | **MISSING** |

### accommodations table
| Column | DB Type | schema.ts Type | MISMATCH? |
|--------|---------|---------------|-----------|
| checkIn | varchar(20) | varchar(30) | Minor (30 vs 20) |
| checkOut | varchar(20) | varchar(30) | Minor (30 vs 20) |

### itinerary_items table
| Column | DB Type | schema.ts Type | MISMATCH? |
|--------|---------|---------------|-----------|
| endTime | varchar(10) | varchar(10) | OK |
| cost | varchar(50) | varchar(50) | OK |
| currency | varchar(10) | varchar(10) | OK |

## Critical Mismatches to Fix (cause runtime errors):
1. **trips.startDate**: DB=varchar(20), schema.ts=timestamp → MUST change to varchar(20)
2. **trips.endDate**: DB=varchar(20), schema.ts=timestamp → MUST change to varchar(20)
3. **expenses.date**: DB=varchar(20), schema.ts=timestamp → MUST change to varchar(20)

## Missing columns in schema.ts (exist in DB but not in schema):
4. **flights.departure_date**: DB=date → add to schema
5. **flights.arrival_date**: DB=date → add to schema
6. **flights.type**: DB=varchar(20) → add to schema
