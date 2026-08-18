const express = require('express');
const router = express.Router();
const crypto = require('crypto');
let pool;
try { pool = require('../db'); } catch (e) { pool = require('./db'); }

// Helper to generate custom JWT token (now includes role + active status)
function createToken(user, secret) {
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({ 
        sub: user.id, 
        username: user.username,
        role: user.role,
        fullName: user.full_name || user.username,
        is_active: user.is_active,
        exp: Math.floor(Date.now() / 1000) + 3600 * 8 // 8 hours duration
    })).toString('base64url');
    const signature = crypto.createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64url');
    return `${header}.${payload}.${signature}`;
}

// Helper to hash password
function hashPassword(password) {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
    return `${salt}:${hash}`;
}

// Helper to verify PBKDF2 password hashes
function verifyPassword(password, storedValue) {
    if (!storedValue || !storedValue.includes(':')) return false;
    const [salt, originalHash] = storedValue.split(':');
    const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
    return hash === originalHash;
}

// POST /api/auth/login
router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) {
            return res.status(400).json({
                success: false,
                message: 'Username and password are required'
            });
        }

        const jwtSecret = process.env.JWT_SECRET;
        if (!jwtSecret) {
            console.error("JWT_SECRET environment variable is missing");
            return res.status(500).json({
                success: false,
                message: 'Authentication server configuration error'
            });
        }

        // Fetch user from DB
        const result = await pool.query('SELECT * FROM users WHERE username = $1', [username.trim()]);
        if (result.rows.length === 0) {
            return res.status(401).json({
                success: false,
                message: 'Invalid username or password'
            });
        }

        const user = result.rows[0];

        // Check if account is active
        if (!user.is_active) {
            return res.status(403).json({
                success: false,
                message: 'Your account has been deactivated. Please contact the administrator.'
            });
        }

        // Check password hash
        if (!verifyPassword(password, user.password_hash)) {
            return res.status(401).json({
                success: false,
                message: 'Invalid username or password'
            });
        }

        // Issue JWT token with role info
        const token = createToken(user, jwtSecret);

        // Set httpOnly cookie
        res.cookie('__session', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            path: '/',
            maxAge: 8 * 60 * 60 * 1000
        });

        return res.json({
            success: true,
            message: 'Logged in successfully',
            token: token,
            role: user.role,
            fullName: user.full_name || user.username
        });

    } catch (err) {
        console.error('Login error:', err.message);
        return res.status(500).json({
            success: false,
            message: 'Internal server error during login'
        });
    }
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
    res.clearCookie('__session', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/'
    });
    res.clearCookie('token', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/'
    });
    return res.json({
        success: true,
        message: 'Logged out successfully'
    });
});

// GET /api/auth/check
router.get('/check', (req, res) => {
    try {
        const secret = process.env.JWT_SECRET;
        let token = null;

        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            token = authHeader.substring(7).trim();
        } else if (req.headers.cookie) {
            const cookies = {};
            req.headers.cookie.split(';').forEach(c => {
                const eqIdx = c.indexOf('=');
                if (eqIdx !== -1) {
                    const name = c.substring(0, eqIdx).trim();
                    const value = c.substring(eqIdx + 1).trim();
                    cookies[name] = value;
                }
            });
            token = cookies.__session || cookies.token;
        }

        if (!secret || !token) {
            return res.json({ authenticated: false });
        }

        const parts = token.split('.');
        if (parts.length !== 3) {
            return res.json({ authenticated: false });
        }

        const [header, payload, signature] = parts;
        const expectedSig = crypto.createHmac('sha256', secret)
                                  .update(`${header}.${payload}`)
                                  .digest('base64url');

        if (signature !== expectedSig) {
            return res.json({ authenticated: false });
        }

        const decodedPayload = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
        if (decodedPayload.exp < Date.now() / 1000) {
            return res.json({ authenticated: false }); // expired
        }

        if (decodedPayload.is_active === false) {
            return res.json({ authenticated: false });
        }

        return res.json({
            authenticated: true,
            username: decodedPayload.username,
            role: decodedPayload.role,
            fullName: decodedPayload.fullName,
            userId: decodedPayload.sub
        });

    } catch (err) {
        return res.json({ authenticated: false });
    }
});

function getTokenFromReq(req) {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        return authHeader.substring(7).trim();
    }
    if (req.headers.cookie) {
        const cookies = {};
        req.headers.cookie.split(';').forEach(c => {
            const eqIdx = c.indexOf('=');
            if (eqIdx !== -1) {
                cookies[c.substring(0, eqIdx).trim()] = c.substring(eqIdx + 1).trim();
            }
        });
        return cookies.__session || cookies.token || null;
    }
    return null;
}

// GET /api/auth/profile — Get current user's profile
router.get('/profile', async (req, res) => {
    try {
        const secret = process.env.JWT_SECRET;
        const token = getTokenFromReq(req);
        if (!secret || !token) {
            return res.status(401).json({ success: false, message: 'Not authenticated' });
        }

        const parts = token.split('.');
        if (parts.length !== 3) return res.status(401).json({ success: false });

        const [header, payload, signature] = parts;
        const expectedSig = crypto.createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64url');
        if (signature !== expectedSig) return res.status(401).json({ success: false });

        const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
        if (decoded.exp < Date.now() / 1000) return res.status(401).json({ success: false });

        const result = await pool.query(
            'SELECT id, username, role, full_name, email, phone, specialization, doctor_code, is_active, created_at FROM users WHERE id = $1',
            [decoded.sub]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        return res.json({ success: true, user: result.rows[0] });
    } catch (err) {
        console.error('Profile fetch error:', err.message);
        return res.status(500).json({ success: false, message: 'Failed to fetch profile' });
    }
});

// PATCH /api/auth/profile — Update own profile (doctors can edit their own info)
router.patch('/profile', async (req, res) => {
    try {
        const secret = process.env.JWT_SECRET;
        const token = getTokenFromReq(req);
        if (!secret || !token) {
            return res.status(401).json({ success: false, message: 'Not authenticated' });
        }

        const parts = token.split('.');
        if (parts.length !== 3) return res.status(401).json({ success: false });

        const [header, payload, signature] = parts;
        const expectedSig = crypto.createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64url');
        if (signature !== expectedSig) return res.status(401).json({ success: false });

        const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
        if (decoded.exp < Date.now() / 1000) return res.status(401).json({ success: false });

        const { full_name, email, phone, specialization } = req.body;

        const result = await pool.query(
            `UPDATE users SET full_name = $1, email = $2, phone = $3, specialization = $4, updated_at = CURRENT_TIMESTAMP
             WHERE id = $5 RETURNING id, username, role, full_name, email, phone, specialization, doctor_code, is_active`,
            [full_name || null, email || null, phone || null, specialization || null, decoded.sub]
        );

        return res.json({ success: true, user: result.rows[0] });
    } catch (err) {
        console.error('Profile update error:', err.message);
        return res.status(500).json({ success: false, message: 'Failed to update profile' });
    }
});

// ──────────────────────────────────────────────
// GET /api/auth/invite/:token — Validate invitation token
// ──────────────────────────────────────────────
router.get('/invite/:token', async (req, res) => {
    try {
        const { token } = req.params;
        if (!token) {
            return res.status(400).json({ success: false, message: 'Invitation token is required' });
        }

        const result = await pool.query(
            `SELECT id, full_name, email, phone, specialization, status, invite_expires_at 
             FROM users 
             WHERE invite_token = $1 AND role = 'doctor'`,
            [token]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Invalid or expired invitation link.' });
        }

        const doc = result.rows[0];

        // Check expiration
        if (doc.invite_expires_at && new Date(doc.invite_expires_at) < new Date()) {
            return res.status(410).json({ success: false, message: 'This invitation link has expired. Please contact the administrator for a new link.' });
        }

        if (doc.status === 'active') {
            return res.status(400).json({ success: false, message: 'This account has already been registered. Please log in.' });
        }

        return res.json({
            success: true,
            doctor: {
                full_name: doc.full_name,
                email: doc.email,
                phone: doc.phone,
                specialization: doc.specialization
            }
        });
    } catch (err) {
        console.error('Invite token lookup error:', err.message);
        return res.status(500).json({ success: false, message: 'Failed to validate invitation link' });
    }
});

// ──────────────────────────────────────────────
// POST /api/auth/register-doctor — Doctor sets Login ID & Password via invite link
// ──────────────────────────────────────────────
router.post('/register-doctor', async (req, res) => {
    try {
        const { token, username, password } = req.body;

        if (!token || !username || !password) {
            return res.status(400).json({
                success: false,
                message: 'Invitation token, Username, and Password are all required.'
            });
        }

        if (username.trim().length < 3) {
            return res.status(400).json({
                success: false,
                message: 'Username must be at least 3 characters long.'
            });
        }

        if (password.length < 6) {
            return res.status(400).json({
                success: false,
                message: 'Password must be at least 6 characters long.'
            });
        }

        // Validate invite token
        const inviteCheck = await pool.query(
            `SELECT id, role, full_name, email, invite_expires_at, status FROM users WHERE invite_token = $1 AND role = 'doctor'`,
            [token]
        );

        if (inviteCheck.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Invalid or expired invitation link.' });
        }

        const doc = inviteCheck.rows[0];

        if (doc.invite_expires_at && new Date(doc.invite_expires_at) < new Date()) {
            return res.status(410).json({ success: false, message: 'Invitation link has expired.' });
        }

        // Check if username is already taken
        const usernameCheck = await pool.query(
            `SELECT id FROM users WHERE LOWER(username) = LOWER($1)`,
            [username.trim()]
        );

        if (usernameCheck.rows.length > 0) {
            return res.status(409).json({
                success: false,
                message: `Username "${username.trim()}" is already taken. Please choose a different Username.`
            });
        }

        const password_hash = hashPassword(password);

        // Update user row: set username, password_hash, status='active', is_active=TRUE, clear invite_token
        const updateResult = await pool.query(
            `UPDATE users 
             SET username = $1,
                 password_hash = $2,
                 is_active = TRUE,
                 status = 'active',
                 invite_token = NULL,
                 invite_expires_at = NULL,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $3
             RETURNING id, username, role, full_name, is_active`,
            [username.trim(), password_hash, doc.id]
        );

        const activatedUser = updateResult.rows[0];

        // Issue JWT token with role info
        const jwtSecret = process.env.JWT_SECRET;
        const authToken = createToken(activatedUser, jwtSecret);

        // Set httpOnly cookie
        res.cookie('__session', authToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            path: '/',
            maxAge: 8 * 60 * 60 * 1000
        });

        return res.json({
            success: true,
            message: 'Doctor account registered and activated successfully!',
            role: activatedUser.role,
            fullName: activatedUser.full_name || activatedUser.username
        });

    } catch (err) {
        console.error('Doctor self-registration error:', err.message);
        return res.status(500).json({ success: false, message: 'Internal server error during doctor registration.' });
    }
});

// POST /api/auth/forgot-password
router.post('/forgot-password', async (req, res) => {
    try {
        const { identifier } = req.body;
        if (!identifier || !identifier.trim()) {
            return res.status(400).json({ success: false, message: 'Please enter your registered email or username.' });
        }

        const clean = identifier.trim().toLowerCase();
        const userQuery = await pool.query(
            `SELECT id, username, email, full_name FROM users WHERE (LOWER(email) = $1 OR LOWER(username) = $1) ORDER BY id DESC`,
            [clean]
        );

        if (userQuery.rows.length === 0) {
            return res.json({
                success: true,
                message: 'If an account exists with that email/username, a password reset link has been dispatched to the registered email.'
            });
        }

        const user = userQuery.rows[0];
        if (!user.email) {
            return res.status(400).json({
                success: false,
                message: 'No registered email found for this account. Please contact the administrator.'
            });
        }

        const resetToken = crypto.randomBytes(32).toString('hex');
        const resetExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

        // Update all matching accounts with the token
        await pool.query(
            `UPDATE users SET reset_token = $1, reset_expires_at = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3`,
            [resetToken, resetExpires, user.id]
        );

        const baseUrl = process.env.PUBLIC_APP_URL || (req.headers.origin && !req.headers.origin.includes('localhost') ? req.headers.origin : 'https://sleep-aurora.web.app');
        const resetUrl = `${baseUrl}/reset-password.html?token=${resetToken}`;

        try {
            let emailService;
            try { emailService = require('./emailService'); } catch(e) { emailService = require('../services/emailService'); }
            if (emailService && emailService.sendPasswordResetEmail) {
                await emailService.sendPasswordResetEmail({
                    toEmail: user.email,
                    userName: user.full_name || user.username,
                    resetUrl
                });
            }
        } catch (mailErr) {
            console.error('Email dispatch warning:', mailErr.message);
        }

        return res.json({
            success: true,
            message: `A password reset link has been dispatched to ${user.email}! Please check your inbox.`
        });

    } catch (err) {
        console.error('Forgot password error:', err.message);
        return res.status(500).json({ success: false, message: 'Failed to process password reset request: ' + err.message });
    }
});

// GET /api/auth/verify-reset-token
router.get('/verify-reset-token', async (req, res) => {
    try {
        const { token } = req.query;
        if (!token) return res.status(400).json({ success: false, message: 'Reset token is required.' });

        const result = await pool.query(
            `SELECT id, username, full_name, email FROM users WHERE reset_token = $1 AND reset_expires_at > CURRENT_TIMESTAMP`,
            [token]
        );

        if (result.rows.length === 0) {
            return res.status(400).json({ success: false, message: 'This password reset link is invalid or has expired.' });
        }

        const user = result.rows[0];
        return res.json({
            success: true,
            username: user.username,
            fullName: user.full_name || user.username
        });
    } catch (err) {
        return res.status(500).json({ success: false, message: 'Server error verifying reset token.' });
    }
});

// POST /api/auth/reset-password
router.post('/reset-password', async (req, res) => {
    try {
        const { token, new_password } = req.body;
        if (!token || !new_password) {
            return res.status(400).json({ success: false, message: 'Token and new password are required.' });
        }

        if (new_password.length < 6) {
            return res.status(400).json({ success: false, message: 'Password must be at least 6 characters.' });
        }

        const result = await pool.query(
            `SELECT id, username, full_name FROM users WHERE reset_token = $1 AND reset_expires_at > CURRENT_TIMESTAMP`,
            [token]
        );

        if (result.rows.length === 0) {
            return res.status(400).json({ success: false, message: 'This password reset link is invalid or has expired. Please request a new link.' });
        }

        const user = result.rows[0];
        const newHash = hashPassword(new_password);

        await pool.query(
            `UPDATE users 
             SET password_hash = $1, reset_token = NULL, reset_expires_at = NULL, updated_at = CURRENT_TIMESTAMP 
             WHERE id = $2`,
            [newHash, user.id]
        );

        return res.json({
            success: true,
            message: 'Your password has been reset successfully! You can now log in.'
        });
    } catch (err) {
        console.error('Reset password error:', err.message);
        return res.status(500).json({ success: false, message: 'Failed to reset password.' });
    }
});

module.exports = router;
