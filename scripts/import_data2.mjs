#!/usr/bin/env node
/**
 * Import Google Sheet data into WanderPlan database.
 * Uses correct column names:
 * - expenses: paidByUserId (not paidBy)
 * - accommodations: hotelName (not name)
 * 
 * Trips already created: JP=2, TW+JP=3, Egypt=4
 */
import mysql from 'mysql2/promise';
import { createReadStream } from 'fs';

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  console.error('DATABASE_URL not set');
  process.exit(1);
}

const url = new URL(dbUrl);
const connection = await mysql.createConnection({
  host: url.hostname,
  port: parseInt(url.port) || 3306,
  user: url.username,
  password: url.password,
  database: url.pathname.slice(1),
  ssl: { rejectUnauthorized: false },
});

console.log('Connected to database');

// Trip IDs from previous run
const JP_TRIP_ID = 2;
const TWJP_TRIP_ID = 3;
const EGYPT_TRIP_ID = 4;

const NOW = '2026-05-23 07:28:35';

function esc(s) {
  if (s === null || s === undefined) return 'NULL';
  return "'" + String(s).replace(/'/g, "''").replace(/\\/g, '\\\\') + "'";
}

const statements = [];

// ============================================================
// TRIP 1: Japan Feb 2026 - Expenses
// ============================================================
// Read from the generated SQL file but fix column names
import { readFileSync } from 'fs';
const sqlContent = readFileSync('/tmp/import_data.sql', 'utf8');

// Replace paidBy with paidByUserId in all expense inserts
const fixedSql = sqlContent
  .replace(/INSERT INTO expenses \(tripId, title, amount, currency, category, paidBy, paidByName, date, createdAt\)/g,
           'INSERT INTO expenses (tripId, title, amount, currency, category, paidByUserId, paidByName, date, createdAt)')
  .replace(/INSERT INTO accommodations \(tripId, name, city, nights, checkIn, checkOut, orderIndex, createdAt\)/g,
           'INSERT INTO accommodations (tripId, hotelName, city, nights, checkIn, checkOut, orderIndex, createdAt)');

// Write fixed SQL
import { writeFileSync } from 'fs';
writeFileSync('/tmp/import_data_fixed.sql', fixedSql);
console.log('Fixed SQL written to /tmp/import_data_fixed.sql');

// Parse into individual statements
const stmts = [];
let current = [];
for (const line of fixedSql.split('\n')) {
  const stripped = line.trim();
  if (stripped.startsWith('--') || stripped === '') {
    if (current.length > 0) {
      const stmt = current.join('\n').trim();
      if (stmt) stmts.push(stmt);
      current = [];
    }
  } else {
    current.push(line);
    if (stripped.endsWith(';')) {
      const stmt = current.join('\n').trim();
      if (stmt) stmts.push(stmt);
      current = [];
    }
  }
}

console.log(`Total statements: ${stmts.length}`);

// Track trip IDs
let jpTripId = JP_TRIP_ID;
let twjpTripId = TWJP_TRIP_ID;
let egyptTripId = EGYPT_TRIP_ID;

let successCount = 0;
let errorCount = 0;

for (let i = 0; i < stmts.length; i++) {
  let stmt = stmts[i];
  
  // Replace variables with actual IDs
  stmt = stmt.replace(/@jp_trip_id/g, jpTripId);
  stmt = stmt.replace(/@twjp_trip_id/g, twjpTripId);
  stmt = stmt.replace(/@egypt_trip_id/g, egyptTripId);
  
  // Skip SET statements and trip INSERT statements (trips already created)
  if (stmt.startsWith('SET @')) continue;
  if (stmt.startsWith('INSERT INTO trips')) continue;
  
  try {
    const [result] = await connection.execute(stmt);
    successCount++;
    if (i % 50 === 0) {
      process.stdout.write(`\rProgress: ${i+1}/${stmts.length} (${successCount} success, ${errorCount} errors)`);
    }
  } catch (e) {
    errorCount++;
    if (errorCount <= 5) {
      console.error(`\nError at statement ${i+1}: ${e.message}`);
      console.error(`Statement: ${stmt.substring(0, 150)}`);
    }
  }
}

console.log(`\n\nImport complete!`);
console.log(`Success: ${successCount}, Errors: ${errorCount}`);

// Verify counts
const [expRows] = await connection.execute('SELECT tripId, COUNT(*) as cnt FROM expenses GROUP BY tripId');
console.log('\nExpense counts by trip:');
expRows.forEach(r => console.log(`  Trip ${r.tripId}: ${r.cnt} expenses`));

const [flightRows] = await connection.execute('SELECT tripId, COUNT(*) as cnt FROM flights GROUP BY tripId');
console.log('\nFlight counts by trip:');
flightRows.forEach(r => console.log(`  Trip ${r.tripId}: ${r.cnt} flights`));

const [accRows] = await connection.execute('SELECT tripId, COUNT(*) as cnt FROM accommodations GROUP BY tripId');
console.log('\nAccommodation counts by trip:');
accRows.forEach(r => console.log(`  Trip ${r.tripId}: ${r.cnt} accommodations`));

const [vcRows] = await connection.execute('SELECT countryCode, countryName, status FROM visited_countries WHERE userId=1');
console.log('\nVisited countries:');
vcRows.forEach(r => console.log(`  ${r.countryCode}: ${r.countryName} (${r.status})`));

await connection.end();
