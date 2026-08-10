// backend/scoring/index.js
const scoreOSA = require('./osa');
const scoreInsomnia = require('./insomnia');
const scoreHypersomnia = require('./hypersomnia');
const scoreCircadian = require('./circadian');
const { calcSleepOpportunity, sleepOnsetHour } = require('./helpers');

function evaluateAll(a) {
    const sleepOpp = calcSleepOpportunity(a);
    const onset = sleepOnsetHour(a);

    const osa = scoreOSA(a);
    const circadian = scoreCircadian(a, onset, sleepOpp);
    const insomnia = scoreInsomnia(a, sleepOpp, circadian.score);
    const hypersomnia = scoreHypersomnia(a, sleepOpp, osa.score, circadian.score);

    const comorbidities = detectComorbidities(a, insomnia, osa, hypersomnia, circadian);

    return { osa, insomnia, hypersomnia, circadian, comorbidities, sleepOpp };
}

function detectComorbidities(a, insomnia, osa, hypersomnia, circadian) {
    const comorbidities = [];

    if (insomnia.tier !== 'Low' && osa.tier !== 'Low') {
        comorbidities.push({
            code: 'COMISA',
            label: 'Comorbid Insomnia and Sleep Apnea (COMISA)',
            description: 'Both insomnia and obstructive sleep apnea indicators are present. This combination is clinically significant and may require integrated treatment.'
        });
    }

    if (osa.tier !== 'Low' && hypersomnia.tier !== 'Low') {
        comorbidities.push({
            code: 'OSA-Hypersomnia',
            label: 'OSA-related Hypersomnia',
            description: 'Daytime sleepiness may be caused or worsened by obstructive sleep apnea.'
        });
    }

    if (circadian.tier !== 'Low' && insomnia.tier !== 'Low') {
        comorbidities.push({
            code: 'Circadian-Insomnia',
            label: 'Circadian-driven Insomnia',
            description: 'Insomnia symptoms may be driven by circadian rhythm misalignment rather than primary insomnia.'
        });
    }

    if (circadian.tier !== 'Low' && (a.work === 'Night shift' || a.work === 'Rotating')) {
        comorbidities.push({
            code: 'SWSD',
            label: 'Shift Work Sleep Disorder',
            description: 'Work schedule misalignment with the natural circadian rhythm is a significant contributor to sleep disruption.'
        });
    }

    return comorbidities;
}

module.exports = evaluateAll;

