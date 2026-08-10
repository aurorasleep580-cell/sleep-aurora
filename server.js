const express = require('express');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');
require('dotenv').config();

const evaluateAll = require('./scoring');
const patientRoutes = require('./routes/patients');
const authRoutes = require('./routes/auth');
const pdfRoutes = require('./routes/pdf');
const adminRoutes = require('./routes/admin');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors({
    origin: true,
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'Bypass-Tunnel-Remainder', 'bypass-tunnel-remainder']
}));
app.use(express.json());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/pdf', pdfRoutes);
app.use('/api/patients', patientRoutes);
app.use('/api/admin', adminRoutes);

app.use(express.static(path.join(__dirname, '..', 'frontend')));

// Test endpoint
app.get('/api/test', (req, res) => {
    res.json({ message: 'API is working!' });
});

app.get('/', (req, res) => {
    res.json({ message: 'Backend is running! 🚀' });
});

app.post('/api/submit', (req, res) => {
    const answers = req.body;
    console.log('Received answers:', answers);

    const results = evaluateAll(answers);

    res.json({
        success: true,
        results: results
    });
});

// Helper to hash password on seed
function hashPassword(password) {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
    return `${salt}:${hash}`;
}

// Startup database seed hook — creates super_admin account
async function seedSuperAdmin() {
    const pool = require('./db');
    try {
        // Ensure users table has the new columns
        await pool.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                username VARCHAR(50) UNIQUE,
                password_hash VARCHAR(255),
                role VARCHAR(20) NOT NULL DEFAULT 'doctor',
                full_name VARCHAR(150),
                email VARCHAR(150),
                phone VARCHAR(30),
                specialization VARCHAR(100),
                is_active BOOLEAN DEFAULT TRUE,
                status VARCHAR(20) DEFAULT 'active',
                doctor_code VARCHAR(50) UNIQUE,
                invite_token VARCHAR(100) UNIQUE,
                invite_expires_at TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            ALTER TABLE users ALTER COLUMN username DROP NOT NULL;
            ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;
            ALTER TABLE users ADD COLUMN IF NOT EXISTS invite_token VARCHAR(100) UNIQUE;
            ALTER TABLE users ADD COLUMN IF NOT EXISTS invite_expires_at TIMESTAMP;
            ALTER TABLE users ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'active';
        `);

        // Check if a super_admin exists
        const adminCheck = await pool.query("SELECT COUNT(*) FROM users WHERE role = 'super_admin'");
        const adminCount = parseInt(adminCheck.rows[0].count);

        if (adminCount === 0) {
            // Check if old 'clinician' user exists and upgrade it
            const clinicianCheck = await pool.query("SELECT id FROM users WHERE username = 'clinician'");
            
            if (clinicianCheck.rows.length > 0) {
                // Upgrade existing clinician to super_admin
                await pool.query(
                    "UPDATE users SET role = 'super_admin', full_name = 'Platform Admin' WHERE username = 'clinician'"
                );
                console.log('ℹ️ Upgraded existing "clinician" user to super_admin role');
            } else {
                // Create fresh super_admin
                const defaultUser = 'admin';
                const defaultPass = 'AuroraSleep2026!';
                const hash = hashPassword(defaultPass);
                await pool.query(
                    `INSERT INTO users (username, password_hash, role, full_name)
                     VALUES ($1, $2, 'super_admin', 'Platform Admin')
                     ON CONFLICT (username) DO NOTHING`,
                    [defaultUser, hash]
                );
                console.log(`ℹ️ Seeded super admin: "${defaultUser}" with password "${defaultPass}"`);
            }
        }
    } catch (err) {
        console.error('❌ Failed to seed super admin:', err.message);
    }
}

if (require.main === module) {
    app.listen(PORT, async () => {
        console.log(`✅ Server running on http://localhost:${PORT}`);
        await seedSuperAdmin();
    });
} else {
    seedSuperAdmin().catch(() => {});
}

module.exports = app;