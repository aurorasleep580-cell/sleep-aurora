// backend/scoring.js — Self-contained Scoring & Disorder Evaluation Engine

function calcBMI(a) {
    if (a.height <= 0 || a.weight <= 0) return 0;
    const hm = a.height / 100;
    return a.weight / (hm * hm);
}

function estimateNeck(bmi, gender) {
    if (!bmi || bmi <= 0) return gender === 'Male' ? 38 : 35;

    let est = gender === 'Male'
        ? 36 + (bmi - 25) * 0.4
        : 32 + (bmi - 25) * 0.35;

    if (gender === 'Male') est = Math.max(36, est);
    else est = Math.max(32, est);

    return est;
}

function calcSleepOpportunity(a) {
    if (a.schedule === 'Fixed' && a.sleepStart && a.wakeTime) {
        const [sh, sm] = a.sleepStart.split(':').map(Number);
        const [wh, wm] = a.wakeTime.split(':').map(Number);
        const startMins = sh * 60 + sm;
        const wakeMins = wh * 60 + wm;

        if (wakeMins >= startMins) {
            return (wakeMins - startMins) / 60;
        } else {
            return (1440 - startMins + wakeMins) / 60;
        }
    }

    if (a.avgSleepHours && a.avgSleepHours > 0) {
        return a.avgSleepHours;
    }

    if (a.sleepStart && a.wakeTime) {
        const [sh, sm] = a.sleepStart.split(':').map(Number);
        const [wh, wm] = a.wakeTime.split(':').map(Number);
        const startMins = sh * 60 + sm;
        const wakeMins = wh * 60 + wm;

        if (wakeMins >= startMins) {
            return (wakeMins - startMins) / 60;
        } else {
            return (1440 - startMins + wakeMins) / 60;
        }
    }

    return 8;
}

function sleepOnsetHour(a) {
    if (a.schedule === 'Fixed' && a.sleepStart) {
        const [h, m] = a.sleepStart.split(':').map(Number);
        return h + (m / 60);
    }
    return null;
}

function durationScore(dur) {
    switch (dur) {
        case '<2 weeks': return 0;
        case '2w-3m': return 1;
        case '3m-1y': return 2;
        case '>1 year': return 3;
        default: return 0;
    }
}

function satisfactionScore(val) {
    switch (val) {
        case 'Very satisfied': return 0;
        case 'Satisfied': return 0;
        case 'Somewhat': return 1;
        case 'Dissatisfied': return 2;
        case 'Very dissatisfied': return 3;
        default: return 0;
    }
}

function sleepyFreqScore(val) {
    switch (val) {
        case 'Rarely': return 1;
        case 'Sometimes': return 2;
        case 'Often': return 3;
        case 'Almost daily': return 4;
        default: return 0;
    }
}

function tierFromScore(score, thresholds) {
    if (score >= thresholds[2]) return 'High';
    if (score >= thresholds[1]) return 'Moderate';
    return 'Low';
}

function scoreOSA(a) {
    const bmi = calcBMI(a);
    const neck = a.neckRaw > 0 ? a.neckRaw : estimateNeck(bmi, a.gender);

    let symptomScore = 0;
    let riskScore = 0;

    if (a.snoringGate === 'Yes') symptomScore += 1;
    if (a.loudSnoring === 'Yes') symptomScore += 1;
    if (a.witnessedApnea === 'Yes') symptomScore += 2;
    if (a.nightAwakenings === 'Yes') symptomScore += 1;
    if (a.morningHeadache === 'Yes') symptomScore += 1;
    if (a.dryMouth === 'Yes') symptomScore += 1;

    if (a.medical?.includes('PCOS')) riskScore += 1;
    if (a.medical?.includes('Cardiac disease')) riskScore += 2;
    if (a.medical?.includes('Any stroke history')) riskScore += 2;

    if (a.daytimeSleepy === 'Yes') riskScore += 1;

    if (bmi >= 35) riskScore += 3;
    else if (bmi >= 30) riskScore += 2;
    else if (bmi >= 25) riskScore += 1;

    if (a.gender === 'Male') {
        if (neck >= 43) riskScore += 2;
        else if (neck >= 40) riskScore += 1;
    } else if (a.gender === 'Female') {
        if (neck >= 40) riskScore += 2;
        else if (neck >= 37) riskScore += 1;
    }

    if (a.age >= 60) riskScore += 2;
    else if (a.age >= 50) riskScore += 1;

    if (a.gender === 'Male') riskScore += 1;
    if (a.gender === 'Female' && a.menstrual === 'Post-menopause') riskScore += 2;
    if (a.gender === 'Female' && a.menstrual === 'Perimenopause') riskScore += 1;

    if (a.medical?.includes('Hypertension')) riskScore += 1;
    if (a.medical?.includes('Diabetes')) riskScore += 1;
    if (a.medical?.includes('Thyroid disorder')) riskScore += 1;
    if (a.consumption?.includes('Alcohol')) riskScore += 1;
    if (a.consumption?.includes('Smoking/Nicotine')) riskScore += 1;

    const totalScore = symptomScore + riskScore;
    let tier = 'Low';

    if (symptomScore === 0) {
        tier = totalScore >= 7 ? 'Moderate' : 'Low';
    } else if (symptomScore <= 2) {
        if (totalScore >= 9) tier = 'Moderate';
        else if (totalScore >= 5) tier = 'Moderate';
        else tier = 'Low';
    } else {
        if (totalScore >= 9) tier = 'High';
        else if (totalScore >= 5) tier = 'Moderate';
        else tier = 'Low';
    }

    return {
        name: 'Obstructive Sleep Apnea',
        score: totalScore,
        tier,
        icon: '😴',
        details: { symptomScore, riskScore, bmi, neck }
    };
}

function scoreInsomnia(a, sleepOpp, circadianScore) {
    let score = 0;
    let suppressed = false;

    if (a.insomniaGate !== 'Yes') {
        return { name: 'Insomnia', score: 0, tier: 'Low', suppressed: false, icon: '🌙' };
    }

    score += 1;
    if (a.consumption?.includes('Caffeine')) score += 1;
    if (a.medical?.includes('Anxiety')) score += 1;
    if (a.medical?.includes('Stress')) score += 1;
    if (a.medical?.includes('Depression')) score += 1;

    if (a.sleepLatency === '30-60 mins') score += 1;
    if (a.sleepLatency === '>1 hour') score += 2;

    if (a.nightWaking === 'Yes') score += 1;
    if (a.difficultyBackSleep === 'Yes') score += 1;

    score += satisfactionScore(a.sleepSatisfaction);
    score += satisfactionScore(a.daytimeSatisfaction);
    score += durationScore(a.duration);

    if (sleepOpp < 7) {
        suppressed = true;
        score = Math.max(0, score - 3);
    }

    if (a.circadianGate === 'Yes' && a.chronotype === 'sleeps late' && circadianScore >= 4) {
        score = Math.max(0, score - 2);
    }

    const tier = suppressed ? (score >= 4 ? 'Moderate' : 'Low') : tierFromScore(score, [0, 4, 7]);
    return { name: 'Insomnia', score, tier, suppressed, icon: '🌙' };
}

function scoreHypersomnia(a, sleepOpp, osaScore, circadianScore) {
    let score = 0;

    if (a.hypersomniaGate !== 'Yes' || sleepOpp < 7) {
        return { name: 'Hypersomnia', score: 0, tier: 'Low', icon: '💤' };
    }

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

    if (osaScore >= 8) score -= 3;
    else if (osaScore >= 5) score -= 2;

    if (circadianScore >= 8) score -= 3;
    else if (circadianScore >= 5) score -= 2;

    score = Math.max(0, score);
    const tier = tierFromScore(score, [0, 4, 8]);
    return { name: 'Hypersomnia', score, tier, icon: '💤' };
}

function scoreCircadian(a, onset, sleepOpp) {
    let score = 0;
    let subtypes = [];

    const hasShiftWork = a.work === 'Night shift' || a.work === 'Rotating';

    if (a.circadianGate === 'Yes') {
        score += 2;
    } else if (hasShiftWork) {
        score += 1;
        subtypes.push('Shift Work Sleep Disorder');
    } else {
        return { name: 'Circadian Rhythm Disorder', score: 0, tier: 'Low', subtypes: [], icon: '🕐' };
    }

    if (onset !== null && onset >= 1.5) {
        score += 2;
        if (!subtypes.includes('Delayed Sleep Phase')) subtypes.push('Delayed Sleep Phase');
    }

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
    if (sleepOpp > 0 && sleepOpp < 6) score += 1;
    score += durationScore(a.duration);

    const tier = tierFromScore(score, [0, 4, 7]);
    subtypes = [...new Set(subtypes)];

    return { name: 'Circadian Rhythm Disorder', score, tier, subtypes, icon: '🕐' };
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

    if (insomnia.tier !== 'Low' && circadian.tier !== 'Low') {
        comorbidities.push({
            code: 'Circadian-Insomnia',
            label: 'Circadian-related Insomnia',
            description: 'Difficulty sleeping may be driven by circadian misalignment.'
        });
    }

    return comorbidities;
}

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

module.exports = evaluateAll;
module.exports.evaluateAll = evaluateAll;
module.exports.scoreOSA = scoreOSA;
module.exports.scoreInsomnia = scoreInsomnia;
module.exports.scoreHypersomnia = scoreHypersomnia;
module.exports.scoreCircadian = scoreCircadian;
module.exports.calcBMI = calcBMI;
module.exports.estimateNeck = estimateNeck;
module.exports.calcSleepOpportunity = calcSleepOpportunity;
module.exports.sleepOnsetHour = sleepOnsetHour;
module.exports.durationScore = durationScore;
module.exports.satisfactionScore = satisfactionScore;
module.exports.sleepyFreqScore = sleepyFreqScore;
module.exports.tierFromScore = tierFromScore;
module.exports.detectComorbidities = detectComorbidities;
