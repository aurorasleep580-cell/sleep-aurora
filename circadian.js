// backend/scoring/circadian.js
const { durationScore, tierFromScore } = require('./helpers');

function scoreCircadian(a, onset, sleepOpp) {
    let score = 0;
    let subtypes = [];

    const hasShiftWork = a.work === 'Night shift' || a.work === 'Rotating';

    if (a.circadianGate === 'Yes') {
        score += 2;
    } else if (hasShiftWork) {
        // shift work alone can raise suspicion, but keep lighter if no complaint
        score += 1;
        subtypes.push('Shift Work Sleep Disorder');
    } else {
        return { name: 'Circadian Rhythm Disorder', score: 0, tier: 'Low', subtypes: [], icon: '🕐' };
    }

    // Delayed sleep phase: more specific late timing
    if (onset !== null && onset >= 1.5) {
        score += 2;
        if (!subtypes.includes('Delayed Sleep Phase')) subtypes.push('Delayed Sleep Phase');
    }

    // Advanced sleep phase: distinctly early bedtime
    if (onset !== null && onset >= 17 && onset < 21) {
        score += 2;
        if (!subtypes.includes('Advanced Sleep Phase')) subtypes.push('Advanced Sleep Phase');
    }

    if (a.chronotype === 'sleeps late') {
        score += 1;
        if (!subtypes.includes('Delayed Sleep Phase')) subtypes.push('Delayed Sleep Phase');
    }

    if (a.chronotype === 'early riser') {
        score += 1;
        if (!subtypes.includes('Advanced Sleep Phase')) subtypes.push('Advanced Sleep Phase');
    }

    if (a.chronotype === 'irregular') {
        score += 2;
        if (!subtypes.includes('Irregular Sleep-Wake Rhythm')) subtypes.push('Irregular Sleep-Wake Rhythm');
    }

    if (a.weekendShift === 'Yes') score += 1;

    if (a.work === 'Night shift') {
        score += 2;
        if (!subtypes.includes('Shift Work Sleep Disorder')) subtypes.push('Shift Work Sleep Disorder');
    }

    if (a.work === 'Rotating') {
        score += 2;
        if (!subtypes.includes('Shift Work Sleep Disorder')) subtypes.push('Shift Work Sleep Disorder');
    }

    if (a.brainFog === 'Yes') score += 1;

    // Short sleep can support circadian strain, but lightly
    if (sleepOpp > 0 && sleepOpp < 6) score += 1;

    score += durationScore(a.duration);

    const tier = tierFromScore(score, [0, 4, 7]);
    subtypes = [...new Set(subtypes)];

    return { name: 'Circadian Rhythm Disorder', score, tier, subtypes, icon: '🕐' };
}

module.exports = scoreCircadian;