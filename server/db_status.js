const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function checkDb() {
    try {
        const tables = ['players', 'teams', 'orders', 'team_stats'];
        console.log('--- Database Status ---');
        for (const table of tables) {
            try {
                const res = await pool.query(`SELECT count(*) FROM ${table}`);
                console.log(`Table '${table}' has ${res.rows[0].count} rows.`);
                if (parseInt(res.rows[0].count) > 0) {
                    const latest = await pool.query(`SELECT * FROM ${table} ORDER BY created_at DESC LIMIT 1`);
                    console.log(`  Latest entry ID: ${latest.rows[0].id}`);
                }
            } catch (e) {
                console.log(`Table '${table}' error: ${e.message}`);
            }
        }
    } catch (err) {
        console.error('Connection error:', err);
    } finally {
        await pool.end();
    }
}
checkDb();
