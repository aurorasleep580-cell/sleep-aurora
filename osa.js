const { calcBMI, estimateNeck } = require('./helpers');

function scoreOSA(a) {
    const bmi = calcBMI(a);
    const neck = a.neckRaw > 0 ? a.neckRaw : estimateNeck(bmi, a.gender);

    let symptomScore = 0;
    let riskScore = 0;

    // Core symptom indicators
    if (a.snoringGate === 'Yes') symptomScore += 1;
    if (a.loudSnoring === 'Yes') symptomScore += 1;
    if (a.witnessedApnea === 'Yes') symptomScore += 2;
    if (a.nightAwakenings === 'Yes') symptomScore += 1;
    if (a.morningHeadache === 'Yes') symptomScore += 1;
    if (a.dryMouth === 'Yes') symptomScore += 1;

    if (a.medical?.includes('PCOS')) riskScore += 1;
    if (a.medical?.includes('Cardiac disease')) riskScore += 2;
    if (a.medical?.includes('Any stroke history')) riskScore += 2;

    // Daytime sleepiness is supportive, not core
    if (a.daytimeSleepy === 'Yes') riskScore += 1;

    // Anthropometric factors
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

    // Age / sex / menopause
    if (a.age >= 60) riskScore += 2;
    else if (a.age >= 50) riskScore += 1;

    if (a.gender === 'Male') riskScore += 1;
    if (a.gender === 'Female' && a.menstrual === 'Post-menopause') riskScore += 2;
    if (a.gender === 'Female' && a.menstrual === 'Perimenopause') riskScore += 1;

    // Medical / lifestyle factors
    if (a.medical?.includes('Hypertension')) riskScore += 1;
    if (a.medical?.includes('Diabetes')) riskScore += 1;
    if (a.medical?.includes('Thyroid disorder')) riskScore += 1;
    if (a.consumption?.includes('Alcohol')) riskScore += 1;
    if (a.consumption?.includes('Smoking/Nicotine')) riskScore += 1;

    const totalScore = symptomScore + riskScore;

    let tier = 'Low';

    // No direct OSA symptoms -> keep conservative
    if (symptomScore === 0) {
        tier = totalScore >= 7 ? 'Moderate' : 'Low';
    }
    // Weak symptom pattern -> allow moderate but not high easily
    else if (symptomScore <= 2) {
        if (totalScore >= 9) tier = 'Moderate';
        else if (totalScore >= 5) tier = 'Moderate';
        else tier = 'Low';
    }
    // Clear symptom pattern
    else {
        if (totalScore >= 9) tier = 'High';
        else if (totalScore >= 5) tier = 'Moderate';
        else tier = 'Low';
    }

    return {
        name: 'Obstructive Sleep Apnea',
        score: totalScore,
        tier,
        icon: '😴',
        details: {
            symptomScore,
            riskScore,
            bmi,
            neck
        }
    };
}

module.exports = scoreOSA;