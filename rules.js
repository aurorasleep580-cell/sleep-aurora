
//backend\services\rules.js

function generateRules(data) {
    const recs = [];

    const {
        osa,
        insomnia,
        hypersomnia,
        circadian,
        comorbidities = [],
        sleepOpp
    } = data;

    // ─────────────────────────────────────
    // 🔴 1. PRIMARY CONDITION PRIORITY
    // ─────────────────────────────────────
    const disorders = [osa, insomnia, hypersomnia, circadian].filter(Boolean);

    const primary = disorders.sort((a, b) => (b.score || 0) - (a.score || 0))[0];

    if (primary && primary.tier === "High") {
        recs.unshift(`Primary condition (${primary.name}) at high severity → requires priority clinical attention`);
    }

    // ─────────────────────────────────────
    // 🟥 2. OSA RULES
    // ─────────────────────────────────────
    if (osa?.tier !== "Low") {

        if (osa.tier === "High") {
            recs.unshift("High-risk OSA pattern identified → prompt sleep physician evaluation and polysomnography are advised");
        }

        if (osa.details?.bmi >= 30) {
            recs.push("Obesity contributing to airway obstruction → initiate structured weight reduction");
        }

        if (osa.details?.neck >= 40) {
            recs.push("Increased neck circumference → elevated upper airway collapse risk → ENT evaluation advised");
        }

        if (data.snoringGate === "Yes" && data.witnessedApnea === "Yes") {
            recs.push("Witnessed apnea episodes → high likelihood of obstructive events → confirm with sleep study");
        }

        if (data.consumption?.includes("Alcohol")) {
            recs.push("Alcohol use worsening airway collapse → avoid alcohol before sleep");
        }

        if (data.consumption?.includes("Smoking/Nicotine")) {
            recs.push("Smoking contributing to airway inflammation → initiate cessation strategies");
        }
    }

    // ─────────────────────────────────────
    // 🟨 3. INSOMNIA RULES
    // ─────────────────────────────────────
    if (insomnia?.tier !== "Low") {

        if (insomnia.suppressed || sleepOpp < 7) {
            recs.push("Reduced sleep opportunity contributing to insomnia symptoms → increase time in bed to ≥7 hours");
        } else {

            if (data.sleepLatency === ">1 hour") {
                recs.push("Prolonged sleep latency → initiate stimulus control and reduce pre-sleep cognitive stimulation");
            }

            if (data.nightWaking === "Yes" && data.difficultyBackSleep === "Yes") {
                recs.push("Sleep maintenance difficulty → consider structured behavioral therapy (CBT-I principles)");
            }

            if (data.consumption?.includes("Caffeine")) {
                recs.push("Caffeine-induced hyperarousal → eliminate intake after afternoon");
            }

            if (data.sleepSatisfaction === "Dissatisfied" || data.sleepSatisfaction === "Very dissatisfied") {
                recs.push("Poor subjective sleep quality → reinforce sleep hygiene and behavioral restructuring");
            }
        }
    }

    // ─────────────────────────────────────
    // 🟦 4. HYPERSOMNIA RULES
    // ─────────────────────────────────────
    if (hypersomnia?.tier !== "Low") {

        if (osa?.score >= 8) {
            recs.push("Daytime sleepiness likely secondary to OSA → prioritize treatment of airway obstruction");
        } else if (circadian?.score >= 8) {
            recs.push("Daytime sleepiness likely due to circadian misalignment → correct sleep timing before further evaluation");
        } else {

            if (data.avgSleep < 7) {
                recs.push("Insufficient total sleep contributing to hypersomnia → increase sleep duration to 7–9 hours");
            }

            if (data.napFreq === "3 or more times" || data.napFreq === "3 or more") {
                recs.push("Frequent daytime naps → restrict naps to <30 minutes to improve alertness regulation");
            }

            if (data.napRefreshed === "No") {
                recs.push("Non-restorative naps → evaluate underlying sleep fragmentation causes");
            }
        }
    }

    // ─────────────────────────────────────
    // 🟪 5. CIRCADIAN RULES
    // ─────────────────────────────────────
    if (circadian?.tier !== "Low") {

        if (circadian.subtypes?.includes("Delayed Sleep Phase")) {
            recs.push("Delayed sleep phase → gradually advance sleep timing with morning light exposure");
        }

        if (circadian.subtypes?.includes("Advanced Sleep Phase")) {
            recs.push("Advanced sleep phase → delay sleep timing and increase evening light exposure");
        }

        if (circadian.subtypes?.includes("Irregular Sleep-Wake Rhythm")) {
            recs.push("Irregular sleep pattern → enforce consistent sleep-wake schedule daily");
        }

        if (data.work === "Night shift" || data.work === "Rotating") {
            recs.push("Shift work circadian disruption → implement controlled light exposure and fixed sleep windows");
        }

        if (data.weekendShift === "Yes") {
            recs.push("Weekend schedule variability → maintain consistent sleep timing across week");
        }

        // Actigraphy recommendation
        recs.push("Consider actigraphy or sleep diary monitoring to objectively assess sleep timing and variability");
    }

    // ─────────────────────────────────────
    // 🟫 6. COMORBIDITY RULES (HIGH VALUE)
    // ─────────────────────────────────────
    comorbidities.forEach(c => {

        if (c.code === "COMISA") {
            recs.unshift("Comorbid insomnia and OSA (COMISA) → treat OSA first, then initiate CBT-I");
        }

        if (c.code === "OSA-Hypersomnia") {
            recs.push("Excessive daytime sleepiness linked to OSA → airway treatment priority");
        }

        if (c.code === "Circadian-Insomnia") {
            recs.push("Insomnia driven by circadian misalignment → correct sleep timing before insomnia-specific therapy");
        }

        if (c.code === "SWSD") {
            recs.push("Shift Work Sleep Disorder → align sleep schedule with work demands using circadian strategies");
        }
    });

    // ─────────────────────────────────────
    // 🧠 7. MENTAL HEALTH RECOMMENDATIONS
    // ─────────────────────────────────────
    if (data.medical?.includes("Anxiety")) {
        recs.push("Reported symptoms of anxiety may contribute to difficulty initiating sleep and sleep fragmentation → consider stress management strategies and mental health support");
    }

    if (data.medical?.includes("Stress")) {
        recs.push("Reported symptoms of stress-related hyperarousal may negatively affect sleep quality → consider relaxation techniques and workload management");
    }

    if (data.medical?.includes("Depression")) {
        recs.push("Reported symptoms of depression may contribute to insomnia, fatigue, or excessive daytime sleepiness → consider psychological assessment if symptoms persist");
    }

    // ─────────────────────────────────────
    // 🏥 8. REFERRAL RECOMMENDATIONS
    // ─────────────────────────────────────
    // (High OSA referral already covered in §2 OSA Rules above)

    if (insomnia?.tier !== "Low") {
        recs.push("Referral: Behavioral sleep medicine specialist or CBT-I provider may be beneficial");
    }

    if (circadian?.tier !== "Low") {
        recs.push("Referral: Sleep specialist evaluation recommended for circadian rhythm assessment");
    }

    if (hypersomnia?.tier !== "Low") {
        recs.push("Referral: Sleep physician evaluation recommended to investigate causes of excessive daytime sleepiness");
    }

    // ─────────────────────────────────────
    // 🛏️ 9. SLEEP HYGIENE SECTION
    // ─────────────────────────────────────
    if (insomnia?.tier !== "Low" || circadian?.tier !== "Low") {
        recs.push("Practice good sleep hygiene: maintain a consistent sleep schedule, avoid screens before bedtime, ensure a comfortable sleep environment, and avoid caffeine late in the day");
    }

    // ─────────────────────────────────────
    // ⚫ 10. FALLBACK (NO RISK)
    // ─────────────────────────────────────
    if (recs.length === 0) {
        recs.push("No clinically significant abnormalities detected → maintain consistent sleep schedule and healthy sleep habits");
    }

    // ─────────────────────────────────────
    // 🔚 FINAL OUTPUT — Personalized Recommendations
    // ─────────────────────────────────────
    return recs
        .slice(0, 10)
        .map(r => `* ${r}`)
        .join("\n");
}

module.exports = generateRules;