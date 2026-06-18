import mysql from 'mysql2/promise';

const conn = await mysql.createConnection({
  host: 'gateway06.us-east-1.prod.aws.tidbcloud.com',
  port: 4000,
  user: 'nuVjg5Bf5WmpxFy.fdbe15df8c32',
  password: 'TxTO672eHD0vtoQl2co9',
  database: 'K6aUzv7HWLBzER7cFGHAT5',
  ssl: { rejectUnauthorized: true },
});

const [rows] = await conn.query(`
  SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE, COLUMN_TYPE
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
  AND DATA_TYPE IN ('varchar', 'timestamp', 'date', 'datetime')
  ORDER BY TABLE_NAME, ORDINAL_POSITION
`);

console.log('TABLE_NAME | COLUMN_NAME | DATA_TYPE | COLUMN_TYPE');
console.log('---|---|---|---');
for (const row of rows) {
  console.log(`${row.TABLE_NAME} | ${row.COLUMN_NAME} | ${row.DATA_TYPE} | ${row.COLUMN_TYPE}`);
}

await conn.end();
