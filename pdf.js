//backend\routes\pdf.js

const express = require('express');
const router = express.Router();
const pool = require('../db');
const generatePDF = require('../services/pdfGenerator');
const generateRules = require('../services/rules');

function buildRecommendationInput(patient) {
    const height = Number(patient.height || 0);
    const weight = Number(patient.weight || 0);

    return {
        age: patient.age,
        gender: patient.gender,
        menstrual: patient.menstrual,
        height,
        weight,
        neckRaw: Number(patient.neck_raw || 0),
        medical: patient.medical || [],
        consumption: patient.consumption || [],
        work: patient.work,
        schedule: patient.schedule,
        sleepStart: patient.sleep_start,
        wakeTime: patient.wake_time,
        avgSleep: Number(patient.avg_sleep || 0),
        sleepSatisfaction: patient.sleep_satisfaction,
        daytimeSatisfaction: patient.daytime_satisfaction,
        daytimeSleepy: patient.daytime_sleepy,
        sleepyFreq: patient.sleepy_freq,
        insomniaGate: patient.insomnia_gate,
        sleepLatency: patient.sleep_latency,
        nightWaking: patient.night_waking,
        difficultyBackSleep: patient.difficulty_back_sleep,
        hypersomniaGate: patient.hypersomnia_gate,
        difficultyWaking: patient.difficulty_waking,
        napFreq: patient.nap_freq,
        napDuration: patient.nap_duration,
        napRefreshed: patient.nap_refreshed,
        snoringGate: patient.snoring_gate,
        witnessedApnea: patient.witnessed_apnea,
        loudSnoring: patient.loud_snoring,
        nightAwakenings: patient.night_awakenings,
        morningHeadache: patient.morning_headache,
        dryMouth: patient.dry_mouth,
        circadianGate: patient.circadian_gate,
        chronotype: patient.chronotype,
        brainFog: patient.brain_fog,
        weekendShift: patient.weekend_shift,
        duration: patient.duration,
        osa: {
            name: 'Obstructive Sleep Apnea',
            score: patient.osa_score || 0,
            tier: patient.osa_tier || 'Low',
            details: {
                bmi: height && weight ? weight / ((height / 100) * (height / 100)) : null,
                neck: Number(patient.neck_raw || 0)
            }
        },
        insomnia: {
            name: 'Insomnia',
            score: patient.insomnia_score || 0,
            tier: patient.insomnia_tier || 'Low'
        },
        hypersomnia: {
            name: 'Hypersomnia',
            score: patient.hypersomnia_score || 0,
            tier: patient.hypersomnia_tier || 'Low'
        },
        circadian: {
            name: 'Circadian Rhythm Disorder',
            score: patient.circadian_score || 0,
            tier: patient.circadian_tier || 'Low',
            subtypes: patient.circadian_subtypes || []
        },
        comorbidities: patient.comorbidities || [],
        sleepOpp: Number(patient.sleep_opportunity || patient.avg_sleep || 0)
    };
}

router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const result = await pool.query(`
            SELECT 
                sa.*,
                sr.*,
                p.*
            FROM patients p
            LEFT JOIN screening_answers sa ON p.id = sa.patient_id
            LEFT JOIN screening_results sr ON p.id = sr.patient_id
            WHERE p.id = $1
        `, [id]);

        if (result.rows.length === 0) {
            return res.status(404).send('Patient not found');
        }

        const patient = result.rows[0];
        patient.ai_recommendations = generateRules(buildRecommendationInput(patient));

        generatePDF(res, patient);

    } catch (err) {
        console.error(err);
        res.status(500).send('PDF generation failed');
    }
});

module.exports = router;
