const express = require('express');
const router = express.Router();

let pool, generateRules, authenticateCookie, requireRole;

try { pool = require('./db'); } catch (e) { pool = require('../db'); }
try { generateRules = require('./rules'); } catch (e) { generateRules = require('../services/rules'); }
try {
    const authModule = require('./authMiddleware');
    authenticateCookie = authModule.authenticateCookie;
    requireRole = authModule.requireRole;
} catch (e) {
    const authModule = require('../middleware/auth');
    authenticateCookie = authModule.authenticateCookie;
    requireRole = authModule.requireRole;
}

async function verifyRecaptchaToken(recaptchaToken) {
    return { success: true };
}

// ──────────────────────────────────────────────
// Create patient draft (PUBLIC — no auth required)
// Accepts ?doc=DOCTOR_CODE to auto-assign to a doctor
// ──────────────────────────────────────────────
router.post('/', async (req, res) => {
    try {
        const { full_name, phone, email, consent_given, recaptchaToken } = req.body;

        const verifyJson = await verifyRecaptchaToken(recaptchaToken);
        if (!verifyJson.success) {
            return res.status(400).json({
                success: false,
                message: 'reCAPTCHA verification failed',
                error_codes: verifyJson['error-codes']
            });
        }

        // Look up doctor by doctor_code if provided
        let doctor_id = null;
        const docCode = req.query.doc || req.body.doctor_code;
        if (docCode) {
            const docResult = await pool.query(
                'SELECT id FROM users WHERE doctor_code = $1 AND role = $2 AND is_active = TRUE',
                [docCode, 'doctor']
            );
            if (docResult.rows.length > 0) {
                doctor_id = docResult.rows[0].id;
            }
        }

        const result = await pool.query(
            `INSERT INTO patients (full_name, phone, email, consent_given, status, doctor_id)
             VALUES ($1, $2, $3, $4, 'draft', $5)
             RETURNING *;`,
            [full_name || null, phone || null, email || null, consent_given ?? false, doctor_id]
        );

        res.status(201).json({
            success: true,
            message: 'Patient draft created successfully',
            patient: result.rows[0],
        });
    } catch (error) {
        console.error('Create patient error:', error.message);
        res.status(500).json({
            success: false,
            message: 'Failed to create patient draft',
            error: error.message,
        });
    }
});

// ──────────────────────────────────────────────
// Save or update screening answers (PUBLIC — patient fills form)
// ──────────────────────────────────────────────
router.patch('/:id/answers', async (req, res) => {
    try {
        const patientId = req.params.id;
        const a = req.body;

        const query = `
      INSERT INTO screening_answers (
        patient_id, age, gender, menstrual, height, weight, neck_raw,
        medical, consumption, work, schedule, sleep_start, wake_time, avg_sleep,
        sleep_satisfaction, daytime_satisfaction, daytime_sleepy, sleepy_freq,
        insomnia_gate, sleep_latency, night_waking, difficulty_back_sleep,
        hypersomnia_gate, difficulty_waking, nap_freq, nap_duration, nap_refreshed,
        snoring_gate, witnessed_apnea, loud_snoring, night_awakenings, morning_headache, dry_mouth,
        circadian_gate, chronotype, brain_fog, weekend_shift, duration,
        completion_percent, last_completed_step, updated_at
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7,
        $8, $9, $10, $11, $12, $13, $14,
        $15, $16, $17, $18,
        $19, $20, $21, $22,
        $23, $24, $25, $26, $27,
        $28, $29, $30, $31, $32, $33,
        $34, $35, $36, $37, $38,
        $39, $40, CURRENT_TIMESTAMP
      )
      ON CONFLICT (patient_id)
      DO UPDATE SET
        age = EXCLUDED.age,
        gender = EXCLUDED.gender,
        menstrual = EXCLUDED.menstrual,
        height = EXCLUDED.height,
        weight = EXCLUDED.weight,
        neck_raw = EXCLUDED.neck_raw,
        medical = EXCLUDED.medical,
        consumption = EXCLUDED.consumption,
        work = EXCLUDED.work,
        schedule = EXCLUDED.schedule,
        sleep_start = EXCLUDED.sleep_start,
        wake_time = EXCLUDED.wake_time,
        avg_sleep = EXCLUDED.avg_sleep,
        sleep_satisfaction = EXCLUDED.sleep_satisfaction,
        daytime_satisfaction = EXCLUDED.daytime_satisfaction,
        daytime_sleepy = EXCLUDED.daytime_sleepy,
        sleepy_freq = EXCLUDED.sleepy_freq,
        insomnia_gate = EXCLUDED.insomnia_gate,
        sleep_latency = EXCLUDED.sleep_latency,
        night_waking = EXCLUDED.night_waking,
        difficulty_back_sleep = EXCLUDED.difficulty_back_sleep,
        hypersomnia_gate = EXCLUDED.hypersomnia_gate,
        difficulty_waking = EXCLUDED.difficulty_waking,
        nap_freq = EXCLUDED.nap_freq,
        nap_duration = EXCLUDED.nap_duration,
        nap_refreshed = EXCLUDED.nap_refreshed,
        snoring_gate = EXCLUDED.snoring_gate,
        witnessed_apnea = EXCLUDED.witnessed_apnea,
        loud_snoring = EXCLUDED.loud_snoring,
        night_awakenings = EXCLUDED.night_awakenings,
        morning_headache = EXCLUDED.morning_headache,
        dry_mouth = EXCLUDED.dry_mouth,
        circadian_gate = EXCLUDED.circadian_gate,
        chronotype = EXCLUDED.chronotype,
        brain_fog = EXCLUDED.brain_fog,
        weekend_shift = EXCLUDED.weekend_shift,
        duration = EXCLUDED.duration,
        completion_percent = EXCLUDED.completion_percent,
        last_completed_step = EXCLUDED.last_completed_step,
        updated_at = CURRENT_TIMESTAMP
      RETURNING *;
    `;

        const values = [
            patientId,
            a.age || null, a.gender || null, a.menstrual || null,
            a.height || null, a.weight || null, a.neck_raw || null,
            JSON.stringify(a.medical || []), JSON.stringify(a.consumption || []),
            a.work || null, a.schedule || null, a.sleep_start || null, a.wake_time || null, a.avg_sleep || null,
            a.sleep_satisfaction || null, a.daytime_satisfaction || null, a.daytime_sleepy || null, a.sleepy_freq || null,
            a.insomnia_gate || null, a.sleep_latency || null, a.night_waking || null, a.difficulty_back_sleep || null,
            a.hypersomnia_gate || null, a.difficulty_waking || null, a.nap_freq || null, a.nap_duration || null, a.nap_refreshed || null,
            a.snoring_gate || null, a.witnessed_apnea || null, a.loud_snoring || null,
            a.night_awakenings || null, a.morning_headache || null, a.dry_mouth || null,
            a.circadian_gate || null, a.chronotype || null, a.brain_fog || null, a.weekend_shift || null, a.duration || null,
            a.completion_percent || 0, a.last_completed_step || 0
        ];

        const result = await pool.query(query, values);

        await pool.query(
            `UPDATE patients SET status = 'incomplete', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
            [patientId]
        );

        res.json({
            success: true,
            message: 'Screening answers saved successfully',
            answers: result.rows[0]
        });
    } catch (error) {
        console.error('Save answers error:', error.message);
        res.status(500).json({
            success: false,
            message: 'Failed to save screening answers',
            error: error.message
        });
    }
});

// ──────────────────────────────────────────────
// Submit final screening (PUBLIC — patient submits)
// ──────────────────────────────────────────────
router.post('/:id/submit', async (req, res) => {
    try {
        const patientId = req.params.id;

        const answerResult = await pool.query(
            `SELECT * FROM screening_answers WHERE patient_id = $1`,
            [patientId]
        );

        if (answerResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'No screening answers found for this patient'
            });
        }

        const row = answerResult.rows[0];

        const answers = {
            age: row.age, gender: row.gender, menstrual: row.menstrual,
            height: Number(row.height), weight: Number(row.weight), neckRaw: Number(row.neck_raw || 0),
            medical: row.medical || [], consumption: row.consumption || [],
            work: row.work, schedule: row.schedule, sleepStart: row.sleep_start,
            wakeTime: row.wake_time, avgSleep: Number(row.avg_sleep || 0),
            sleepSatisfaction: row.sleep_satisfaction, daytimeSatisfaction: row.daytime_satisfaction,
            daytimeSleepy: row.daytime_sleepy, sleepyFreq: row.sleepy_freq,
            insomniaGate: row.insomnia_gate, sleepLatency: row.sleep_latency,
            nightWaking: row.night_waking, difficultyBackSleep: row.difficulty_back_sleep,
            hypersomniaGate: row.hypersomnia_gate, difficultyWaking: row.difficulty_waking,
            napFreq: row.nap_freq, napDuration: row.nap_duration, napRefreshed: row.nap_refreshed,
            snoringGate: row.snoring_gate, witnessedApnea: row.witnessed_apnea,
            loudSnoring: row.loud_snoring, nightAwakenings: row.night_awakenings,
            morningHeadache: row.morning_headache, dryMouth: row.dry_mouth,
            circadianGate: row.circadian_gate, chronotype: row.chronotype,
            brainFog: row.brain_fog, weekendShift: row.weekend_shift,
            duration: row.duration
        };

        let evaluateAll;
        try { evaluateAll = require('./scoring'); } catch(e) {
            try { evaluateAll = require('./scoring.js'); } catch(e2) {
                try { evaluateAll = require('../scoring'); } catch(e3) {
                    evaluateAll = require('../scoring/index.js');
                }
            }
        }

        const results = evaluateAll(answers);

        const recommendationData = {
            ...answers,
            osa: results.osa, insomnia: results.insomnia,
            hypersomnia: results.hypersomnia, circadian: results.circadian,
            comorbidities: results.comorbidities, sleepOpp: results.sleepOpp,
            bmi: answers.height && answers.weight ?
                  answers.weight / ((answers.height/100) * (answers.height/100)) : null
        };

        if (!generateRules) {
            try { generateRules = require('./rules'); } catch(e) {
                try { generateRules = require('./rules.js'); } catch(e2) {
                    generateRules = require('../services/rules');
                }
            }
        }

        const recommendations = generateRules(recommendationData);

        const disorderList = [
            { code: 'osa', data: results.osa },
            { code: 'insomnia', data: results.insomnia },
            { code: 'hypersomnia', data: results.hypersomnia },
            { code: 'circadian', data: results.circadian }
        ];

        const tierRank = { Low: 0, Moderate: 1, High: 2 };
        disorderList.sort((a, b) => {
            if (tierRank[b.data.tier] !== tierRank[a.data.tier]) {
                return tierRank[b.data.tier] - tierRank[a.data.tier];
            }
            return (b.data.score || 0) - (a.data.score || 0);
        });

        const primary = disorderList.find(d => d.data.tier !== 'Low') || disorderList[0];

        const saveQuery = `
      INSERT INTO screening_results (
        patient_id, sleep_opportunity,
        osa_score, osa_tier, insomnia_score, insomnia_tier,
        hypersomnia_score, hypersomnia_tier,
        circadian_score, circadian_tier, circadian_subtypes,
        primary_finding_code, primary_finding_label,
        comorbidities, submitted_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, CURRENT_TIMESTAMP)
      ON CONFLICT (patient_id)
      DO UPDATE SET
        sleep_opportunity = EXCLUDED.sleep_opportunity,
        osa_score = EXCLUDED.osa_score, osa_tier = EXCLUDED.osa_tier,
        insomnia_score = EXCLUDED.insomnia_score, insomnia_tier = EXCLUDED.insomnia_tier,
        hypersomnia_score = EXCLUDED.hypersomnia_score, hypersomnia_tier = EXCLUDED.hypersomnia_tier,
        circadian_score = EXCLUDED.circadian_score, circadian_tier = EXCLUDED.circadian_tier,
        circadian_subtypes = EXCLUDED.circadian_subtypes,
        primary_finding_code = EXCLUDED.primary_finding_code, primary_finding_label = EXCLUDED.primary_finding_label,
        comorbidities = EXCLUDED.comorbidities,
        submitted_at = CURRENT_TIMESTAMP
      RETURNING *;
    `;

        const saveValues = [
            patientId, results.sleepOpp || 0,
            results.osa.score, results.osa.tier,
            results.insomnia.score, results.insomnia.tier,
            results.hypersomnia.score, results.hypersomnia.tier,
            results.circadian.score, results.circadian.tier,
            JSON.stringify(results.circadian.subtypes || []),
            primary.code, primary.data.name,
            JSON.stringify(results.comorbidities || [])
        ];

        const savedResult = await pool.query(saveQuery, saveValues);

        const { referral_source } = req.body || {};

        await pool.query(
            `UPDATE patients SET 
                status = 'completed', 
                referral_source = COALESCE(NULLIF($2, ''), referral_source),
                updated_at = CURRENT_TIMESTAMP 
             WHERE id = $1`,
            [patientId, referral_source || null]
        );

        res.json({
            success: true,
            message: 'Final screening submitted successfully',
            results,
            recommendations,
            saved_result: savedResult.rows[0]
        });
    } catch (error) {
        console.error('Submit screening error:', error.message);
        res.status(500).json({
            success: false,
            message: 'Failed to submit screening',
            error: error.message
        });
    }
});

// ──────────────────────────────────────────────
// Update patient info (PUBLIC — patient updates their own info during form)
// ──────────────────────────────────────────────
router.patch('/:id', async (req, res) => {
    try {
        const patientId = req.params.id;
        const { full_name, phone, email, referral_source } = req.body;

        const result = await pool.query(
            `UPDATE patients SET 
                full_name = COALESCE(NULLIF($1, ''), full_name),
                phone = COALESCE(NULLIF($2, ''), phone),
                email = COALESCE(NULLIF($3, ''), email),
                referral_source = COALESCE(NULLIF($4, ''), referral_source),
                updated_at = CURRENT_TIMESTAMP
             WHERE id = $5 RETURNING *;`,
            [full_name || null, phone || null, email || null, referral_source || null, patientId]
        );

        res.json({ success: true, patient: result.rows[0] });
    } catch (error) {
        console.error('Update patient error:', error.message);
        res.status(500).json({ success: false, message: 'Failed to update patient info' });
    }
});

// ──────────────────────────────────────────────
// Export patients to CSV / Excel (AUTH REQUIRED)
// Super Admin gets all patients, Doctor gets their own
// ──────────────────────────────────────────────
router.get('/export/csv', authenticateCookie, async (req, res) => {
    try {
        let query = `
            SELECT 
                p.id AS patient_id,
                p.full_name,
                p.phone,
                p.email,
                p.status,
                p.created_at,
                p.referral_source,
                u.full_name AS doctor_name,
                sa.age,
                sa.gender,
                sa.menstrual,
                sa.height,
                sa.weight,
                sa.neck_raw,
                sa.medical,
                sa.consumption,
                sa.work,
                sa.schedule,
                sa.sleep_start,
                sa.wake_time,
                sa.avg_sleep,
                sa.sleep_satisfaction,
                sa.daytime_satisfaction,
                sa.daytime_sleepy,
                sa.sleepy_freq,
                sa.insomnia_gate,
                sa.sleep_latency,
                sa.night_waking,
                sa.difficulty_back_sleep,
                sa.hypersomnia_gate,
                sa.difficulty_waking,
                sa.nap_freq,
                sa.nap_duration,
                sa.nap_refreshed,
                sa.snoring_gate,
                sa.witnessed_apnea,
                sa.loud_snoring,
                sa.night_awakenings,
                sa.morning_headache,
                sa.dry_mouth,
                sa.circadian_gate,
                sa.chronotype,
                sa.brain_fog,
                sa.weekend_shift,
                sa.duration,
                sr.sleep_opportunity,
                sr.osa_score,
                sr.osa_tier,
                sr.insomnia_score,
                sr.insomnia_tier,
                sr.hypersomnia_score,
                sr.hypersomnia_tier,
                sr.circadian_score,
                sr.circadian_tier,
                sr.circadian_subtypes,
                sr.primary_finding_label,
                sr.comorbidities,
                sr.submitted_at
            FROM patients p
            LEFT JOIN users u ON p.doctor_id = u.id
            LEFT JOIN screening_answers sa ON p.id = sa.patient_id
            LEFT JOIN screening_results sr ON p.id = sr.patient_id
        `;
        const values = [];

        if (req.user.role === 'doctor') {
            query += ` WHERE p.doctor_id = $1`;
            values.push(req.user.sub);
        }

        query += ` ORDER BY p.id DESC`;

        const result = await pool.query(query, values);

        const headers = [
            'Patient ID', 'Submission Date', 'Full Name', 'Phone', 'Email', 'Status', 'Doctor Assigned', 'Referral Source',
            'Age', 'Gender', 'Menopause Status', 'Height (cm)', 'Weight (kg)', 'Calculated BMI', 'Neck Circumference (cm)',
            'Medical Conditions', 'Substances Consumed', 'Work Type', 'Schedule Type', 'Sleep Start Time', 'Wake Time',
            'Calculated Sleep Opportunity (hrs)', 'Avg Sleep (hrs)', 'Sleep Satisfaction', 'Daytime Functioning',
            'Daytime Sleepy', 'Sleepiness Frequency', 'Insomnia Gate', 'Sleep Latency (SOL)', 'Night Waking (WASO)',
            'Difficulty Returning to Sleep', 'Hypersomnia Gate', 'Difficulty Waking (Sleep Inertia)', 'Nap Frequency',
            'Nap Duration', 'Naps Refreshed', 'Snoring Gate', 'Witnessed Apnea / Choking', 'Loud Snoring',
            'Night Awakenings (>3)', 'Morning Headache', 'Dry Mouth', 'Circadian Gate', 'Chronotype', 'Morning Brain Fog',
            'Weekend Sleep Shift', 'Symptom Duration', 'OSA Score', 'OSA Tier', 'Insomnia Score', 'Insomnia Tier',
            'Hypersomnia Score', 'Hypersomnia Tier', 'Circadian Score', 'Circadian Tier', 'Circadian Subtypes',
            'Primary Finding', 'Comorbidities Detected'
        ];

        function escapeCSV(val) {
            if (val === null || val === undefined) return '""';
            if (Array.isArray(val)) {
                val = val.join('; ');
            } else if (typeof val === 'object') {
                val = JSON.stringify(val);
            }
            const str = String(val).replace(/"/g, '""');
            return `"${str}"`;
        }

        const rows = [headers.map(escapeCSV).join(',')];

        for (const r of result.rows) {
            let bmi = '';
            if (r.height && r.weight) {
                const hM = Number(r.height) / 100;
                bmi = (Number(r.weight) / (hM * hM)).toFixed(1);
            }

            const formattedDate = r.submitted_at ? new Date(r.submitted_at).toISOString().split('T')[0] : (r.created_at ? new Date(r.created_at).toISOString().split('T')[0] : '');

            const rowData = [
                r.patient_id,
                formattedDate,
                r.full_name || '',
                r.phone || '',
                r.email || '',
                r.status || '',
                r.doctor_name || 'Unassigned',
                r.referral_source || '',
                r.age || '',
                r.gender || '',
                r.menstrual || '',
                r.height || '',
                r.weight || '',
                bmi,
                r.neck_raw || '',
                r.medical || [],
                r.consumption || [],
                r.work || '',
                r.schedule || '',
                r.sleep_start || '',
                r.wake_time || '',
                r.sleep_opportunity || '',
                r.avg_sleep || '',
                r.sleep_satisfaction || '',
                r.daytime_satisfaction || '',
                r.daytime_sleepy || '',
                r.sleepy_freq || '',
                r.insomnia_gate || '',
                r.sleep_latency || '',
                r.night_waking || '',
                r.difficulty_back_sleep || '',
                r.hypersomnia_gate || '',
                r.difficulty_waking || '',
                r.nap_freq || '',
                r.nap_duration || '',
                r.nap_refreshed || '',
                r.snoring_gate || '',
                r.witnessed_apnea || '',
                r.loud_snoring || '',
                r.night_awakenings || '',
                r.morning_headache || '',
                r.dry_mouth || '',
                r.circadian_gate || '',
                r.chronotype || '',
                r.brain_fog || '',
                r.weekend_shift || '',
                r.duration || '',
                r.osa_score ?? '',
                r.osa_tier || '',
                r.insomnia_score ?? '',
                r.insomnia_tier || '',
                r.hypersomnia_score ?? '',
                r.hypersomnia_tier || '',
                r.circadian_score ?? '',
                r.circadian_tier || '',
                r.circadian_subtypes || [],
                r.primary_finding_label || '',
                r.comorbidities || []
            ];

            rows.push(rowData.map(escapeCSV).join(','));
        }

        const csvContent = '\uFEFF' + rows.join('\r\n'); // Include UTF-8 BOM for Excel
        const filename = `Aurora_Sleep_Screening_Export_${new Date().toISOString().split('T')[0]}.csv`;

        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        return res.send(csvContent);

    } catch (err) {
        console.error('Export CSV error:', err.message);
        return res.status(500).json({ success: false, message: 'Failed to export screening records.' });
    }
});

// ──────────────────────────────────────────────
// Get single patient with answers + results (AUTH REQUIRED)
// Doctors can only see their own patients
// ──────────────────────────────────────────────
router.get('/:id', authenticateCookie, async (req, res) => {
    const { id } = req.params;

    try {
        let query = `
            SELECT sa.*, sr.*, p.*
            FROM patients p
            LEFT JOIN screening_answers sa ON p.id = sa.patient_id
            LEFT JOIN screening_results sr ON p.id = sr.patient_id
            WHERE p.id = $1
        `;
        const values = [id];

        // Doctors can only see their own patients
        if (req.user.role === 'doctor') {
            query += ' AND p.doctor_id = $2';
            values.push(req.user.sub);
        }

        const result = await pool.query(query, values);

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Patient not found'
            });
        }

        res.json({ success: true, data: result.rows[0] });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Error fetching patient' });
    }
});

// ──────────────────────────────────────────────
// Get all patients with summary (AUTH REQUIRED)
// Super Admin sees all, Doctor sees only their own
// ──────────────────────────────────────────────
router.get('/', authenticateCookie, async (req, res) => {
    try {
        let query = `
            SELECT 
                p.id, p.full_name, p.phone, p.email, p.referral_source, p.status, p.created_at, p.doctor_id,
                sr.primary_finding_label, sr.primary_finding_code,
                sr.osa_tier, sr.insomnia_tier, sr.hypersomnia_tier, sr.circadian_tier,
                sr.circadian_subtypes, sr.comorbidities,
                u.full_name AS doctor_name, u.username AS doctor_username
            FROM patients p
            LEFT JOIN screening_results sr ON p.id = sr.patient_id
            LEFT JOIN users u ON p.doctor_id = u.id
        `;

        const values = [];

        // Doctors can only see their own patients
        if (req.user.role === 'doctor') {
            query += ' WHERE p.doctor_id = $1';
            values.push(req.user.sub);
        }

        query += ' ORDER BY p.created_at DESC';

        const result = await pool.query(query, values);

        res.json({
            success: true,
            patients: result.rows
        });
    } catch (error) {
        console.error('Fetch patients error:', error.message);
        res.status(500).json({ success: false, message: 'Failed to fetch patients' });
    }
});

// ──────────────────────────────────────────────
// Delete a patient (AUTH REQUIRED)
// Doctors can only delete their own patients
// ──────────────────────────────────────────────
router.delete('/:id', authenticateCookie, async (req, res) => {
    try {
        const patientId = req.params.id;

        // Verify ownership if logged in as doctor
        if (req.user.role === 'doctor') {
            const check = await pool.query('SELECT doctor_id FROM patients WHERE id = $1', [patientId]);
            if (check.rows.length === 0) {
                return res.status(404).json({ success: false, message: 'Patient not found' });
            }
            if (check.rows[0].doctor_id !== req.user.sub) {
                return res.status(403).json({ success: false, message: 'Unauthorized to delete this patient' });
            }
        }

        // 1. Delete associated screening answers & results first to prevent foreign key constraint violations
        await pool.query('DELETE FROM screening_answers WHERE patient_id = $1', [patientId]);
        await pool.query('DELETE FROM screening_results WHERE patient_id = $1', [patientId]);

        // 2. Delete main patient record
        const result = await pool.query('DELETE FROM patients WHERE id = $1 RETURNING *', [patientId]);

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Patient not found' });
        }

        res.json({ success: true, message: 'Patient record deleted successfully' });
    } catch (error) {
        console.error('Delete patient error:', error.message);
        res.status(500).json({ success: false, message: 'Failed to delete patient: ' + error.message });
    }
});

module.exports = router;
