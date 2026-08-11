const { Pool } = require('pg');
require('dotenv').config();

let poolConfig = {};

if (process.env.DATABASE_URL) {
    poolConfig = {
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.DATABASE_URL.includes('localhost') ? false : {
            rejectUnauthorized: false
        }
    };
} else {
    poolConfig = {
        user: process.env.DB_USER || 'postgres',
        host: process.env.DB_HOST || 'localhost',
        database: process.env.DB_NAME || 'sleepmed_dev',
        password: process.env.DB_PASSWORD || 'AuroraSleep2026!',
        port: Number(process.env.DB_PORT) || 5432,
    };
}

const pool = new Pool(poolConfig);

pool.on('error', (err) => {
    console.error('⚠️ Database pool notice:', err.message);
});

module.exports = pool;