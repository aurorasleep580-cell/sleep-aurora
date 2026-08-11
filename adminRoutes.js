// backend/routes/admin.js
const express = require('express');
const router = express.Router();
const crypto = require('crypto');

let pool, authenticateCookie, requireRole, sendDoctorInviteEmail;

try {
    pool = require('../db');
} catch (e) {
    pool = require('./db');
}

try {
    const authModule = require('../middleware/auth');
    authenticateCookie = authModule.authenticateCookie;
    requireRole = authModule.requireRole;
} catch (e) {
    const authModule = require('./authMiddleware');
    authenticateCookie = authModule.authenticateCookie;
    requireRole = authModule.requireRole;
}

try {
    const emailModule = require('../services/emailService');
    sendDoctorInviteEmail = emailModule.sendDoctorInviteEmail;
} catch (e) {
    const emailModule = require('./emailService');
    sendDoctorInviteEmail = emailModule.sendDoctorInviteEmail;
}

// All routes require super_admin role
router.use(authenticateCookie, requireRole('super_admin'));

function hashPassword(password) {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
    return `${salt}:${hash}`;
}

function generateDoctorCode(fullName) {
    const base = (fullName || 'doctor')
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, '')
        .trim()
        .replace(/\s+/g, '_');
    const suffix = crypto.randomBytes(3).toString('hex');
    return `${base}_${suffix}`;
}

// POST /api/admin/doctors — Create or Invite a doctor
router.post('/doctors', async (req, res) => {
    try {
        const { username, password, full_name, email, phone, specialization } = req.body;

        if (username && password) {
            const existing = await pool.query('SELECT id FROM users WHERE username = $1', [username.trim()]);
            if (existing.rows.length > 0) {
                return res.status(409).json({ success: false, message: 'Username already exists' });
            }

            const password_hash = hashPassword(password);
            const doctor_code = generateDoctorCode(full_name || username);

            const result = await pool.query(
                `INSERT INTO users (username, password_hash, role, full_name, email, phone, specialization, is_active, status, doctor_code)
                 VALUES ($1, $2, 'doctor', $3, $4, $5, $6, TRUE, 'active', $7)
                 RETURNING id, username, role, full_name, email, phone, specialization, is_active, status, doctor_code, created_at`,
                [username.trim(), password_hash, full_name ? full_name.trim() : null, email ? email.trim() : null, phone || null, specialization || null, doctor_code]
            );

            return res.status(201).json({ success: true, message: 'Doctor account created successfully', doctor: result.rows[0] });
        }

        const invite_token = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
        const doctor_code = generateDoctorCode(full_name || email || 'doctor');

        const result = await pool.query(
            `INSERT INTO users (role, full_name, email, phone, specialization, is_active, status, doctor_code, invite_token, invite_expires_at)
             VALUES ('doctor', $1, $2, $3, $4, FALSE, 'invited', $5, $6, $7)
             RETURNING id, role, full_name, email, phone, specialization, is_active, status, doctor_code, invite_token, invite_expires_at, created_at`,
            [full_name ? full_name.trim() : null, email ? email.trim() : null, phone || null, specialization || null, doctor_code, invite_token, expiresAt]
        );

        const createdDoctor = result.rows[0];

        let emailResult = { sent: false };
        if (createdDoctor.email) {
            const baseUrl = process.env.PUBLIC_APP_URL || (req.headers.origin && !req.headers.origin.includes('localhost') ? req.headers.origin : 'https://sleep-aurora.web.app');
            const inviteUrl = `${baseUrl}/register-doctor.html?token=${invite_token}`;
            
            try {
                const timeoutPromise = new Promise(resolve => setTimeout(() => resolve({ sent: false, error: 'Email dispatch queued' }), 4000));
                const emailPromise = sendDoctorInviteEmail({
                    toEmail: createdDoctor.email,
                    doctorName: createdDoctor.full_name,
                    inviteUrl
                });
                emailResult = await Promise.race([emailPromise, timeoutPromise]);
            } catch (e) {
                console.error('Email send notice:', e.message);
            }
        }

        return res.status(201).json({
            success: true,
            message: emailResult.sent 
                ? `Doctor invitation generated and email notification sent to ${createdDoctor.email}`
                : 'Doctor invitation link generated successfully',
            doctor: createdDoctor,
            emailSent: emailResult.sent,
            emailError: emailResult.error
        });

    } catch (err) {
        console.error('Create doctor error:', err.message);
        return res.status(500).json({ success: false, message: 'Failed to create doctor account' });
    }
});

// GET /api/admin/doctors — List all doctors
router.get('/doctors', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT 
                u.id, u.username, u.full_name, u.email, u.phone, u.specialization,
                u.is_active, u.status, u.doctor_code, u.invite_token, u.invite_expires_at, u.created_at,
                COUNT(p.id) AS patient_count,
                COUNT(CASE WHEN p.status = 'completed' THEN 1 END) AS completed_count
            FROM users u
            LEFT JOIN patients p ON p.doctor_id = u.id
            WHERE u.role = 'doctor'
            GROUP BY u.id
            ORDER BY u.created_at DESC
        `);

        return res.json({ success: true, doctors: result.rows });
    } catch (err) {
        console.error('List doctors error:', err.message);
        return res.status(500).json({ success: false, message: 'Failed to fetch doctors' });
    }
});

// GET /api/admin/doctors/:id
router.get('/doctors/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const result = await pool.query(
            `SELECT id, username, role, full_name, email, phone, specialization, is_active, doctor_code, created_at, updated_at
             FROM users WHERE id = $1 AND role = 'doctor'`,
            [id]
        );
        if (result.rows.length === 0) return res.status(404).json({ success: false, message: 'Doctor not found' });
        return res.json({ success: true, doctor: result.rows[0] });
    } catch (err) {
        return res.status(500).json({ success: false, message: 'Failed to fetch doctor' });
    }
});

// PATCH /api/admin/doctors/:id
router.patch('/doctors/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { full_name, email, phone, specialization, username, password } = req.body;

        const updates = [];
        const values = [];
        let idx = 1;

        if (full_name !== undefined) { updates.push(`full_name = $${idx++}`); values.push(full_name ? full_name.trim() : null); }
        if (email !== undefined) { updates.push(`email = $${idx++}`); values.push(email ? email.trim() : null); }
        if (phone !== undefined) { updates.push(`phone = $${idx++}`); values.push(phone ? phone.trim() : null); }
        if (specialization !== undefined) { updates.push(`specialization = $${idx++}`); values.push(specialization ? specialization.trim() : null); }
        if (username !== undefined) { updates.push(`username = $${idx++}`); values.push(username ? username.trim() : null); }
        if (password) { updates.push(`password_hash = $${idx++}`); values.push(hashPassword(password)); }

        if (updates.length === 0) return res.status(400).json({ success: false, message: 'No fields to update' });

        updates.push(`updated_at = CURRENT_TIMESTAMP`);
        values.push(id);

        const result = await pool.query(
            `UPDATE users SET ${updates.join(', ')} WHERE id = $${idx} AND role = 'doctor'
             RETURNING id, username, role, full_name, email, phone, specialization, is_active, status, doctor_code, updated_at`,
            values
        );

        if (result.rows.length === 0) return res.status(404).json({ success: false, message: 'Doctor not found' });
        return res.json({ success: true, message: 'Doctor profile updated', doctor: result.rows[0] });
    } catch (err) {
        return res.status(500).json({ success: false, message: 'Failed to update doctor profile' });
    }
});

// PATCH /api/admin/doctors/:id/toggle
router.patch('/doctors/:id/toggle', async (req, res) => {
    try {
        const { id } = req.params;
        const result = await pool.query(
            `UPDATE users SET is_active = NOT is_active, updated_at = CURRENT_TIMESTAMP
             WHERE id = $1 AND role = 'doctor'
             RETURNING id, full_name, is_active`,
            [id]
        );
        if (result.rows.length === 0) return res.status(404).json({ success: false, message: 'Doctor not found' });
        return res.json({ success: true, message: `Doctor ${result.rows[0].is_active ? 'activated' : 'deactivated'}`, doctor: result.rows[0] });
    } catch (err) {
        return res.status(500).json({ success: false, message: 'Failed to toggle doctor status' });
    }
});

// DELETE /api/admin/doctors/:id
router.delete('/doctors/:id', async (req, res) => {
    try {
        const { id } = req.params;
        await pool.query('UPDATE patients SET doctor_id = NULL WHERE doctor_id = $1', [id]);
        const result = await pool.query(`DELETE FROM users WHERE id = $1 AND role = 'doctor' RETURNING id, full_name, username`, [id]);
        if (result.rows.length === 0) return res.status(404).json({ success: false, message: 'Doctor not found' });
        return res.json({ success: true, message: 'Doctor deleted successfully' });
    } catch (err) {
        return res.status(500).json({ success: false, message: 'Failed to delete doctor' });
    }
});

// GET /api/admin/analytics
router.get('/analytics', async (req, res) => {
    try {
        const [docStats, patStats, completedStats, unassignedStats, disorderStats] = await Promise.all([
            pool.query("SELECT COUNT(*) AS total, COUNT(CASE WHEN is_active = TRUE AND status = 'active' THEN 1 END) AS active FROM users WHERE role = 'doctor'"),
            pool.query('SELECT COUNT(*) AS total FROM patients'),
            pool.query("SELECT COUNT(*) AS total FROM patients WHERE status = 'completed'"),
            pool.query('SELECT COUNT(*) AS total FROM patients WHERE doctor_id IS NULL'),
            pool.query(`SELECT primary_finding_label, COUNT(*) AS count FROM screening_results WHERE primary_finding_label IS NOT NULL GROUP BY primary_finding_label`)
        ]);

        return res.json({
            success: true,
            analytics: {
                totalDoctors: parseInt(docStats.rows[0].total) || 0,
                activeDoctors: parseInt(docStats.rows[0].active) || 0,
                totalPatients: parseInt(patStats.rows[0].total) || 0,
                completedPatients: parseInt(completedStats.rows[0].total) || 0,
                unassignedPatients: parseInt(unassignedStats.rows[0].total) || 0,
                disorderDistribution: disorderStats.rows
            }
        });
    } catch (err) {
        return res.status(500).json({ success: false, message: 'Failed to load analytics' });
    }
});

// PATCH /api/admin/patients/:id/assign
router.patch('/patients/:id/assign', async (req, res) => {
    try {
        const { id } = req.params;
        const { doctor_id } = req.body;
        const result = await pool.query(
            `UPDATE patients SET doctor_id = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING id, full_name, doctor_id`,
            [doctor_id || null, id]
        );
        if (result.rows.length === 0) return res.status(404).json({ success: false, message: 'Patient not found' });
        return res.json({ success: true, message: 'Patient reassigned successfully', patient: result.rows[0] });
    } catch (err) {
        return res.status(500).json({ success: false, message: 'Failed to reassign patient' });
    }
});

module.exports = router;
