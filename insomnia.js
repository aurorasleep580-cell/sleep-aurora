// backend/scoring/insomnia.js
const { satisfactionScore, durationScore, tierFromScore } = require('./helpers');

function scoreInsomnia(a, sleepOpp, circadianScore) {
    let score = 0;
    let suppressed = false;

    if (a.insomniaGate !== 'Yes') {
        return { name: 'Insomnia', score: 0, tier: 'Low', suppressed: false, icon: '🌙' };
    }

    // Core insomnia symptoms
    score += 1;

    if (a.consumption?.includes('Caffeine')) score += 1;

    if (a.medical?.includes('Anxiety')) score += 1;
    if (a.medical?.includes('Stress')) score += 1;
    if (a.medical?.includes('Depression')) score += 1;

    if (a.sleepLatency === '30-60 mins') score += 1;
    if (a.sleepLatency === '>1 hour') score += 2;

    if (a.nightWaking === 'Yes') score += 1;
    if (a.difficultyBackSleep === 'Yes') score += 1;

    // Subjective impact
    score += satisfactionScore(a.sleepSatisfaction);
    score += satisfactionScore(a.daytimeSatisfaction);

    // Chronicity
    score += durationScore(a.duration);

    // Suppress if likely insufficient sleep opportunity
    if (sleepOpp < 7) {
        suppressed = true;
        score = Math.max(0, score - 3);
    }

    // Suppress if likely circadian-driven delayed sleep
    if (
        a.circadianGate === 'Yes' &&
        a.chronotype === 'sleeps late' &&
        circadianScore >= 4
    ) {
        score = Math.max(0, score - 2);
    }

    const tier = suppressed ? (score >= 4 ? 'Moderate' : 'Low') : tierFromScore(score, [0, 4, 7]);

    return { name: 'Insomnia', score, tier, suppressed, icon: '🌙' };
}

module.exports = scoreInsomnia;