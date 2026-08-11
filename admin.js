// backend/routes/admin.js
// Super Admin-only endpoints for managing doctors and platform analytics

const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const pool = require('../db');
const { authenticateCookie, requireRole } = require('../middleware/auth');

const { sendDoctorInviteEmail } = require('../services/emailService');

// All routes require super_admin role
router.use(authenticateCookie, requireRole('super_admin'));

// Helper to hash password
function hashPassword(password) {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
    return `${salt}:${hash}`;
}

// Helper to generate a unique doctor code from full name
function generateDoctorCode(fullName) {
    const base = (fullName || 'doctor')
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, '')
        .trim()
        .replace(/\s+/g, '_');
    const suffix = crypto.randomBytes(3).toString('hex');
    return `${base}_${suffix}`;
}

// ──────────────────────────────────────────────
// POST /api/admin/doctors — Create or Invite a doctor
// ──────────────────────────────────────────────
router.post('/doctors', async (req, res) => {
    try {
        const { username, password, full_name, email, phone, specialization } = req.body;

        // If direct creation with username and password
        if (username && password) {
            const existing = await pool.query('SELECT id FROM users WHERE username = $1', [username.trim()]);
            if (existing.rows.length > 0) {
                return res.status(409).json({
                    success: false,
                    message: 'Username already exists'
                });
            }

            const password_hash = hashPassword(password);
            const doctor_code = generateDoctorCode(full_name || username);

            const result = await pool.query(
                `INSERT INTO users (username, password_hash, role, full_name, email, phone, specialization, is_active, status, doctor_code)
                 VALUES ($1, $2, 'doctor', $3, $4, $5, $6, TRUE, 'active', $7)
                 RETURNING id, username, role, full_name, email, phone, specialization, is_active, status, doctor_code, created_at`,
                [username.trim(), password_hash, full_name || null, email || null, phone || null, specialization || null, doctor_code]
            );

            return res.status(201).json({
                success: true,
                message: 'Doctor account created successfully',
                doctor: result.rows[0]
            });
        }

        // Invitation Flow (Super Admin enters doctor's basic info, doctor sets username & password later)
        if (!full_name && !email) {
            return res.status(400).json({
                success: false,
                message: 'Full Name or Email is required to invite a doctor'
            });
        }

        const invite_token = crypto.randomBytes(32).toString('hex');
        const doctor_code = generateDoctorCode(full_name || email || 'doctor');
        const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000); // 14 days valid

        const result = await pool.query(
            `INSERT INTO users (role, full_name, email, phone, specialization, is_active, status, doctor_code, invite_token, invite_expires_at)
             VALUES ('doctor', $1, $2, $3, $4, FALSE, 'invited', $5, $6, $7)
             RETURNING id, role, full_name, email, phone, specialization, is_active, status, doctor_code, invite_token, invite_expires_at, created_at`,
            [full_name ? full_name.trim() : null, email ? email.trim() : null, phone || null, specialization || null, doctor_code, invite_token, expiresAt]
        );

        const createdDoctor = result.rows[0];

        // Send email notification non-blockingly
        let emailResult = { sent: false };
        if (createdDoctor.email) {
            const baseUrl = process.env.PUBLIC_APP_URL || (req.headers.origin && !req.headers.origin.includes('localhost') ? req.headers.origin : 'https://sleep-aurora.web.app');
            const inviteUrl = `${baseUrl}/register-doctor.html?token=${invite_token}`;
            
            // Execute email sending with a quick 3-second race so frontend responds instantly
            try {
                const timeoutPromise = new Promise(resolve => setTimeout(() => resolve({ sent: false, error: 'Email dispatch queued in background' }), 3000));
                const emailPromise = sendDoctorInviteEmail({
                    toEmail: createdDoctor.email,
                    doctorName: createdDoctor.full_name,
                    inviteUrl
                });
                emailResult = await Promise.race([emailPromise, timeoutPromise]);
            } catch (e) {
                console.error('Email send warning:', e.message);
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
        return res.status(500).json({
            success: false,
            message: 'Failed to create doctor account'
        });
    }
});

// ──────────────────────────────────────────────
// POST /api/admin/doctors/:id/reinvite — Regenerate invite link
// ──────────────────────────────────────────────
router.post('/doctors/:id/reinvite', async (req, res) => {
    try {
        const { id } = req.params;
        const invite_token = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);

        const result = await pool.query(
            `UPDATE users 
             SET invite_token = $1, invite_expires_at = $2, status = 'invited', is_active = FALSE, updated_at = CURRENT_TIMESTAMP
             WHERE id = $3 AND role = 'doctor'
             RETURNING id, full_name, email, invite_token, invite_expires_at, status`,
            [invite_token, expiresAt, id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Doctor not found' });
        }

        const updatedDoctor = result.rows[0];
        let emailResult = { sent: false };
        if (updatedDoctor.email) {
            const baseUrl = process.env.PUBLIC_APP_URL || (req.headers.origin && !req.headers.origin.includes('localhost') ? req.headers.origin : 'https://sleep-aurora.web.app');
            const inviteUrl = `${baseUrl}/register-doctor.html?token=${invite_token}`;
            
            emailResult = await sendDoctorInviteEmail({
                toEmail: updatedDoctor.email,
                doctorName: updatedDoctor.full_name,
                inviteUrl
            });
        }

        return res.json({
            success: true,
            message: emailResult.sent
                ? `New invitation link generated and email sent to ${updatedDoctor.email}`
                : 'New invitation link generated successfully',
            doctor: updatedDoctor,
            emailSent: emailResult.sent,
            emailError: emailResult.error
        });
    } catch (err) {
        console.error('Reinvite error:', err.message);
        return res.status(500).json({ success: false, message: 'Failed to generate invitation link' });
    }
});

// ──────────────────────────────────────────────
// GET /api/admin/doctors — List all doctors
// ──────────────────────────────────────────────
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

        return res.json({
            success: true,
            doctors: result.rows
        });

    } catch (err) {
        console.error('List doctors error:', err.message);
        return res.status(500).json({
            success: false,
            message: 'Failed to fetch doctors'
        });
    }
});

// ──────────────────────────────────────────────
// GET /api/admin/doctors/:id — Get single doctor
// ──────────────────────────────────────────────
router.get('/doctors/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const result = await pool.query(
            `SELECT id, username, role, full_name, email, phone, specialization, is_active, doctor_code, created_at, updated_at
             FROM users WHERE id = $1 AND role = 'doctor'`,
            [id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Doctor not found' });
        }

        return res.json({ success: true, doctor: result.rows[0] });

    } catch (err) {
        console.error('Get doctor error:', err.message);
        return res.status(500).json({ success: false, message: 'Failed to fetch doctor' });
    }
});

// ──────────────────────────────────────────────
// PATCH /api/admin/doctors/:id — Update doctor profile
// ──────────────────────────────────────────────
router.patch('/doctors/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { full_name, email, phone, specialization, password } = req.body;

        let query, values;

        if (password) {
            // Also update password
            const password_hash = hashPassword(password);
            query = `UPDATE users SET full_name = $1, email = $2, phone = $3, specialization = $4, password_hash = $5, updated_at = CURRENT_TIMESTAMP
                     WHERE id = $6 AND role = 'doctor'
                     RETURNING id, username, role, full_name, email, phone, specialization, is_active, doctor_code`;
            values = [full_name || null, email || null, phone || null, specialization || null, password_hash, id];
        } else {
            query = `UPDATE users SET full_name = $1, email = $2, phone = $3, specialization = $4, updated_at = CURRENT_TIMESTAMP
                     WHERE id = $5 AND role = 'doctor'
                     RETURNING id, username, role, full_name, email, phone, specialization, is_active, doctor_code`;
            values = [full_name || null, email || null, phone || null, specialization || null, id];
        }

        const result = await pool.query(query, values);

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Doctor not found' });
        }

        return res.json({ success: true, doctor: result.rows[0] });

    } catch (err) {
        console.error('Update doctor error:', err.message);
        return res.status(500).json({ success: false, message: 'Failed to update doctor' });
    }
});

// ──────────────────────────────────────────────
// PATCH /api/admin/doctors/:id/toggle — Activate/deactivate
// ──────────────────────────────────────────────
router.patch('/doctors/:id/toggle', async (req, res) => {
    try {
        const { id } = req.params;

        const result = await pool.query(
            `UPDATE users SET is_active = NOT is_active, updated_at = CURRENT_TIMESTAMP
             WHERE id = $1 AND role = 'doctor'
             RETURNING id, username, full_name, is_active`,
            [id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Doctor not found' });
        }

        const doctor = result.rows[0];
        return res.json({
            success: true,
            message: `Doctor "${doctor.full_name || doctor.username}" is now ${doctor.is_active ? 'active' : 'deactivated'}`,
            doctor
        });

    } catch (err) {
        console.error('Toggle doctor error:', err.message);
        return res.status(500).json({ success: false, message: 'Failed to toggle doctor status' });
    }
});

// ──────────────────────────────────────────────
// DELETE /api/admin/doctors/:id — Delete a doctor
// ──────────────────────────────────────────────
router.delete('/doctors/:id', async (req, res) => {
    try {
        const { id } = req.params;

        // Unassign all patients from this doctor first (don't delete patients)
        await pool.query('UPDATE patients SET doctor_id = NULL WHERE doctor_id = $1', [id]);

        const result = await pool.query(
            'DELETE FROM users WHERE id = $1 AND role = $2 RETURNING id, username',
            [id, 'doctor']
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Doctor not found' });
        }

        return res.json({
            success: true,
            message: 'Doctor account deleted. Their patients have been unassigned.'
        });

    } catch (err) {
        console.error('Delete doctor error:', err.message);
        return res.status(500).json({ success: false, message: 'Failed to delete doctor' });
    }
});

// ──────────────────────────────────────────────
// PATCH /api/admin/patients/:id/assign — Reassign patient
// ──────────────────────────────────────────────
router.patch('/patients/:id/assign', async (req, res) => {
    try {
        const { id } = req.params;
        const { doctor_id } = req.body;

        // doctor_id can be null (unassign)
        if (doctor_id !== null && doctor_id !== undefined) {
            const doctorCheck = await pool.query('SELECT id FROM users WHERE id = $1 AND role = $2', [doctor_id, 'doctor']);
            if (doctorCheck.rows.length === 0) {
                return res.status(404).json({ success: false, message: 'Target doctor not found' });
            }
        }

        const result = await pool.query(
            'UPDATE patients SET doctor_id = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING id, full_name, doctor_id',
            [doctor_id || null, id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Patient not found' });
        }

        return res.json({
            success: true,
            message: 'Patient reassigned successfully',
            patient: result.rows[0]
        });

    } catch (err) {
        console.error('Reassign patient error:', err.message);
        return res.status(500).json({ success: false, message: 'Failed to reassign patient' });
    }
});

// ──────────────────────────────────────────────
// GET /api/admin/analytics — Platform-wide analytics
// ──────────────────────────────────────────────
router.get('/analytics', async (req, res) => {
    try {
        // Total counts
        const totalDoctors = await pool.query("SELECT COUNT(*) FROM users WHERE role = 'doctor'");
        const activeDoctors = await pool.query("SELECT COUNT(*) FROM users WHERE role = 'doctor' AND is_active = TRUE");
        const totalPatients = await pool.query("SELECT COUNT(*) FROM patients");
        const completedPatients = await pool.query("SELECT COUNT(*) FROM patients WHERE status = 'completed'");

        // Per-doctor stats
        const perDoctor = await pool.query(`
            SELECT 
                u.id, u.username, u.full_name, u.is_active,
                COUNT(p.id) AS patient_count,
                COUNT(CASE WHEN p.status = 'completed' THEN 1 END) AS completed_count
            FROM users u
            LEFT JOIN patients p ON p.doctor_id = u.id
            WHERE u.role = 'doctor'
            GROUP BY u.id
            ORDER BY patient_count DESC
        `);

        // Unassigned patients
        const unassigned = await pool.query("SELECT COUNT(*) FROM patients WHERE doctor_id IS NULL");

        return res.json({
            success: true,
            analytics: {
                totalDoctors: parseInt(totalDoctors.rows[0].count),
                activeDoctors: parseInt(activeDoctors.rows[0].count),
                totalPatients: parseInt(totalPatients.rows[0].count),
                completedPatients: parseInt(completedPatients.rows[0].count),
                unassignedPatients: parseInt(unassigned.rows[0].count),
                perDoctor: perDoctor.rows
            }
        });

    } catch (err) {
        console.error('Analytics error:', err.message);
        return res.status(500).json({ success: false, message: 'Failed to fetch analytics' });
    }
});

module.exports = router;
