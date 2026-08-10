// backend/scoring/hypersomnia.js
const { sleepyFreqScore, durationScore, tierFromScore } = require('./helpers');

function scoreHypersomnia(a, sleepOpp, osaScore, circadianScore) {
    let score = 0;

    if (a.hypersomniaGate !== 'Yes') {
        return { name: 'Hypersomnia', score: 0, tier: 'Low', icon: '💤' };
    }

    if (sleepOpp < 7) {
        return { name: 'Hypersomnia', score: 0, tier: 'Low', icon: '💤' };
    }

    // Core hypersomnia complaint
    score += 2;

    if (a.daytimeSleepy === 'Yes') score += 1;
    if (a.medical?.includes('Depression')) score += 1;
    score += sleepyFreqScore(a.sleepyFreq);

    if (a.difficultyWaking === 'Yes') score += 2;

    if (a.napFreq === '1-2 times' || a.napFreq === '1–2 time') score += 1;
    if (a.napFreq === '3 or more' || a.napFreq === '3 or more times') score += 2;

    if (a.napDuration === '30-60 minutes' || a.napDuration === '30–60 minutes') score += 1;
    if (a.napDuration === '>1 hour' || a.napDuration === 'more than 1 hour') score += 2;

    if (a.napRefreshed === 'No') score += 1;

    score += durationScore(a.duration);

    // Competing explanations
    if (osaScore >= 8) score -= 3;
    else if (osaScore >= 5) score -= 2;

    if (circadianScore >= 8) score -= 3;
    else if (circadianScore >= 5) score -= 2;

    score = Math.max(0, score);

    const tier = tierFromScore(score, [0, 4, 8]);
    return { name: 'Hypersomnia', score, tier, icon: '💤' };
}

module.exports = scoreHypersomnia;