const express = require('express');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');
require('dotenv').config();

let evaluateAll, patientRoutes, authRoutes, pdfRoutes, adminRoutes;

try {
    evaluateAll = require('./scoring.js');
} catch (e) {
    try { evaluateAll = require('./scoring/index.js'); } catch (e2) { evaluateAll = require('./scoring'); }
}

try {
    patientRoutes = require('./routes/patients');
} catch (e) {
    patientRoutes = require('./patientRoutes');
}

try {
    authRoutes = require('./routes/auth');
} catch (e) {
    authRoutes = require('./authRoutes');
}

try {
    pdfRoutes = require('./routes/pdf');
} catch (e) {
    pdfRoutes = require('./pdfRoutes');
}

try {
    adminRoutes = require('./routes/admin');
} catch (e) {
    adminRoutes = require('./adminRoutes');
}

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

// Static frontend fallback
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

    const results = typeof evaluateAll === 'function' ? evaluateAll(answers) : evaluateAll.evaluateAll(answers);

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
        `);

        const adminCheck = await pool.query("SELECT COUNT(*) FROM users WHERE role = 'super_admin'");
        const adminCount = parseInt(adminCheck.rows[0].count);

        if (adminCount === 0) {
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