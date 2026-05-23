#!/usr/bin/env node
/**
 * Import Google Sheet data into WanderPlan database.
 * Run with: node scripts/import_data.mjs
 */
import mysql from 'mysql2/promise';
import { readFileSync } from 'fs';

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  console.error('DATABASE_URL not set');
  process.exit(1);
}

// Parse MySQL URL: mysql://user:pass@host:port/db
const url = new URL(dbUrl);
const connection = await mysql.createConnection({
  host: url.hostname,
  port: parseInt(url.port) || 3306,
  user: url.username,
  password: url.password,
  database: url.pathname.slice(1),
  ssl: { rejectUnauthorized: false },
  multipleStatements: false,
});

console.log('Connected to database');

// Read SQL file
const sqlContent = readFileSync('/tmp/import_data.sql', 'utf8');

// Parse into individual statements
const statements = [];
let current = [];
for (const line of sqlContent.split('\n')) {
  const stripped = line.trim();
  if (stripped.startsWith('--') || stripped === '') {
    if (current.length > 0) {
      const stmt = current.join('\n').trim();
      if (stmt) statements.push(stmt);
      current = [];
    }
  } else {
    current.push(line);
    if (stripped.endsWith(';')) {
      const stmt = current.join('\n').trim();
      if (stmt) statements.push(stmt);
      current = [];
    }
  }
}
if (current.length > 0) {
  const stmt = current.join('\n').trim();
  if (stmt) statements.push(stmt);
}

console.log(`Total statements to execute: ${statements.length}`);

// Track trip IDs
let jpTripId = null;
let twjpTripId = null;
let egyptTripId = null;

let successCount = 0;
let errorCount = 0;

for (let i = 0; i < statements.length; i++) {
  let stmt = statements[i];
  
  // Replace variables with actual IDs
  if (jpTripId) stmt = stmt.replace(/@jp_trip_id/g, jpTripId);
  if (twjpTripId) stmt = stmt.replace(/@twjp_trip_id/g, twjpTripId);
  if (egyptTripId) stmt = stmt.replace(/@egypt_trip_id/g, egyptTripId);
  
  // Skip SET statements (we handle IDs manually)
  if (stmt.startsWith('SET @')) {
    // After inserting a trip, get the last insert ID
    try {
      const [rows] = await connection.execute('SELECT LAST_INSERT_ID() as id');
      const lastId = rows[0].id;
      if (stmt.includes('@jp_trip_id')) jpTripId = lastId;
      else if (stmt.includes('@twjp_trip_id')) twjpTripId = lastId;
      else if (stmt.includes('@egypt_trip_id')) egyptTripId = lastId;
      console.log(`  Trip ID set: ${stmt.trim()} = ${lastId}`);
    } catch (e) {
      console.error(`  Error getting last ID: ${e.message}`);
    }
    continue;
  }
  
  try {
    const [result] = await connection.execute(stmt);
    successCount++;
    if (i % 50 === 0) {
      console.log(`Progress: ${i+1}/${statements.length} (${successCount} success, ${errorCount} errors)`);
    }
  } catch (e) {
    errorCount++;
    console.error(`Error at statement ${i+1}: ${e.message}`);
    console.error(`Statement: ${stmt.substring(0, 200)}`);
  }
}

console.log(`\nImport complete!`);
console.log(`Success: ${successCount}, Errors: ${errorCount}`);
console.log(`Trip IDs: JP=${jpTripId}, TW+JP=${twjpTripId}, Egypt=${egyptTripId}`);

await connection.end();
