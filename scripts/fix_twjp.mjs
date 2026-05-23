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

// Get all Trip 3 expenses ordered by id (insertion order)
const [dbRows] = await conn.execute(
  'SELECT id, title, date, amount FROM expenses WHERE tripId=3 ORDER BY id ASC'
);
console.log(`DB has ${dbRows.length} expenses for Trip 3`);
console.log('First 5 DB rows:');
dbRows.slice(0, 5).forEach(r => console.log(`  id=${r.id} title="${r.title}" date="${r.date}" amount=${r.amount}`));

// Load the Excel data (already parsed to JSON)
const excelData = JSON.parse(readFileSync('/tmp/twjp_expenses.json', 'utf8'));
console.log(`\nExcel has ${excelData.length} expenses`);
console.log('First 5 Excel rows:');
excelData.slice(0, 5).forEach(r => console.log(`  no=${r.no} title="${r.title}" date="${r.date}" amount=${r.amount}`));

// Match by row order (both should be in the same insertion order)
if (dbRows.length !== excelData.length) {
  console.log(`\nWARNING: Row count mismatch! DB=${dbRows.length}, Excel=${excelData.length}`);
}

// Update by id using row order matching
let updated = 0;
const minLen = Math.min(dbRows.length, excelData.length);
for (let i = 0; i < minLen; i++) {
  const dbRow = dbRows[i];
  const excelRow = excelData[i];
  
  if (excelRow.amount > 0 || excelRow.currency !== 'HKD') {
    await conn.execute(
      'UPDATE expenses SET amount=?, currency=? WHERE id=?',
      [excelRow.amount, excelRow.currency, dbRow.id]
    );
    updated++;
  }
}
console.log(`\nUpdated ${updated} rows`);

// Verify
const [verify] = await conn.execute(
  'SELECT COUNT(*) as cnt, SUM(amount) as total, COUNT(CASE WHEN amount > 0 THEN 1 END) as nonzero FROM expenses WHERE tripId=3'
);
console.log(`Trip 3 after fix: ${verify[0].cnt} total, ${verify[0].nonzero} non-zero, total amount = ${parseFloat(verify[0].total || 0).toFixed(2)}`);

// Show sample
const [sample] = await conn.execute(
  'SELECT title, date, amount, currency FROM expenses WHERE tripId=3 AND amount > 0 ORDER BY id LIMIT 10'
);
console.log('\nSample fixed records:');
sample.forEach(r => console.log(`  "${r.title}" ${r.date} ${r.currency} ${r.amount}`));

await conn.end();
