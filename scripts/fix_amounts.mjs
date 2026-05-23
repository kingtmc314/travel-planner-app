import { createConnection } from 'mysql2/promise';
import { readFileSync } from 'fs';

const url = process.env.DATABASE_URL;
const m = url.match(/mysql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/(.+)/);
const [, user, password, host, portStr, database] = m;

const conn = await createConnection({
  user, password, host,
  port: parseInt(portStr),
  database: database.split('?')[0],
  ssl: { rejectUnauthorized: false }
});

const sql = readFileSync('/tmp/fix_all_amounts.sql', 'utf8');
const stmts = sql.split('\n').filter(l => l.trim().startsWith('UPDATE'));
console.log('Total UPDATE statements:', stmts.length);

let updated = 0;
let skipped = 0;
for (const stmt of stmts) {
  try {
    const [result] = await conn.execute(stmt);
    if (result.affectedRows > 0) updated++;
    else skipped++;
  } catch (e) {
    console.error('Error on:', stmt.substring(0, 80), e.message);
  }
}
console.log(`Updated: ${updated}, Skipped (no match): ${skipped}`);

// Verify
const [rows] = await conn.execute(
  'SELECT tripId, COUNT(*) as cnt, SUM(amount) as total FROM expenses WHERE amount > 0 GROUP BY tripId'
);
console.log('Verification by trip:');
for (const r of rows) {
  console.log(`  Trip ${r.tripId}: ${r.cnt} expenses, total = ${parseFloat(r.total).toFixed(2)}`);
}

// Also check how many still have 0
const [zeros] = await conn.execute(
  'SELECT tripId, COUNT(*) as cnt FROM expenses WHERE amount = 0 GROUP BY tripId'
);
console.log('Still zero amounts:');
for (const r of zeros) {
  console.log(`  Trip ${r.tripId}: ${r.cnt} records with amount=0`);
}

await conn.end();
