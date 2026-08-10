// backend/scoring/helpers.js

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
    // Priority 1: Fixed schedule with times
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

    // Priority 2: User provided average sleep hours
    if (a.avgSleepHours && a.avgSleepHours > 0) {
        return a.avgSleepHours;
    }

    // Priority 3: Any schedule with start/wake times (fallback)
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

    // Priority 4: Default fallback
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

module.exports = {
    calcBMI,
    estimateNeck,
    calcSleepOpportunity,
    sleepOnsetHour,
    durationScore,
    satisfactionScore,
    sleepyFreqScore,
    tierFromScore
};