//backend\services\pdfGenerator.js

const PDFDocument = require('pdfkit');
const path = require('path');

const QUESTION_GROUPS = [
    {
        title: "Demographics & Physical Profile",
        fields: {
            age: "Age",
            gender: "Gender",
            menstrual: "Menstrual Cycle Status",
            height: "Height (cm)",
            weight: "Weight (kg)",
            neck_raw: "Neck Circumference (cm)",
            medical: "Known Medical Conditions",
            consumption: "Current Consumption"
        }
    },
    {
        title: "Sleep Schedule & Work",
        fields: {
            work: "Employment Type",
            schedule: "Work Schedule",
            sleep_start: "Target Bedtime",
            wake_time: "Target Wake Time",
            avg_sleep: "Average Sleep Duration"
        }
    },
    {
        title: "Subjective Sleep Quality",
        fields: {
            sleep_satisfaction: "Sleep Quality Satisfaction",
            daytime_satisfaction: "Daytime Alertness Satisfaction",
            daytime_sleepy: "Daytime Sleepiness",
            sleepy_freq: "Daytime Sleepiness Frequency",
            duration: "Duration of Symptoms"
        }
    },
    {
        title: "Sleep Apnea Symptoms (OSA)",
        fields: {
            snoring_gate: "Snoring (Gate)",
            witnessed_apnea: "Witnessed Apnea (Breathing Pauses)",
            loud_snoring: "Loud Snoring",
            night_awakenings: "Gasping/Choking Night Awakenings",
            morning_headache: "Morning Headaches",
            dry_mouth: "Dry Mouth Upon Waking"
        }
    },
    {
        title: "Insomnia Symptoms",
        fields: {
            insomnia_gate: "Insomnia Gate Flag",
            sleep_latency: "Sleep Latency (Time to Fall Asleep)",
            night_waking: "Frequent Night Awakenings",
            difficulty_back_sleep: "Difficulty Falling Back to Sleep"
        }
    },
    {
        title: "Hypersomnia Symptoms",
        fields: {
            hypersomnia_gate: "Hypersomnia Gate Flag",
            difficulty_waking: "Difficulty Waking Up",
            nap_freq: "Daytime Nap Frequency",
            nap_duration: "Average Nap Duration",
            nap_refreshed: "Feeling Refreshed After Naps"
        }
    },
    {
        title: "Circadian Rhythm Symptoms",
        fields: {
            circadian_gate: "Circadian Rhythm Gate Flag",
            chronotype: "Subjective Chronotype",
            brain_fog: "Morning Brain Fog",
            weekend_shift: "Weekend Sleep Schedule Shift"
        }
    }
];

function safeParse(val, fallback = []) {
    if (!val) return fallback;
    if (typeof val === 'object') return val;
    try {
        return JSON.parse(val);
    } catch (e) {
        return fallback;
    }
}

function primaryRisk(p) {
    const tiers = [p.osa_tier, p.insomnia_tier, p.hypersomnia_tier, p.circadian_tier].filter(Boolean);
    if (tiers.some(t => t === 'High')) return 'High';
    if (tiers.some(t => t === 'Moderate')) return 'Moderate';
    return 'Low';
}

function findingSubtext(risk) {
    if (risk === 'High') return 'Likely clinically significant based on reported symptoms and risk factors. Further clinical evaluation is recommended.';
    if (risk === 'Moderate') return 'Warrants clinical review and further assessment based on reported symptom profile.';
    return 'Low overall risk pattern detected based on current screening responses.';
}

function formatRecommendations(text) {
    if (!text) return [];
    return text
        .split("\n")
        .map(line => line.trim())
        .filter(line => line.length > 0)
        .map(line => {
            let clean = line.replace(/^[\*\-\u2022]\s*/, '').replace(/^\d+\.\s*/, '');
            clean = clean.replace(/\*\*/g, '');
            return clean.trim();
        })
        .filter(line => line.length > 0);
}

function drawBadge(doc, x, y, width, label, tier) {
    let bgColor = '#E2E8F0';
    let textColor = '#475569';
    
    const t = (tier || '').toLowerCase();
    if (t === 'high') {
        bgColor = '#FEE2E2';
        textColor = '#991B1B';
    } else if (t === 'moderate') {
        bgColor = '#FFFBEB';
        textColor = '#92400E';
    } else if (t === 'low') {
        bgColor = '#DCFCE7';
        textColor = '#166534';
    }

    // Draw rounded background pill
    doc.fillColor(bgColor)
       .roundedRect(x, y, width, 14, 7)
       .fill();

    // Draw text inside the pill
    doc.fillColor(textColor)
       .font('Helvetica-Bold')
       .fontSize(7.5)
       .text(label.toUpperCase(), x, y + 3.5, { width: width, align: 'center' });
}

function drawHeader(doc, patientId) {
    // Beautiful gradient accent header bar
    const gradient = doc.linearGradient(0, 0, doc.page.width, 0);
    gradient.stop(0, '#143C8C'); // Aurora Navy
    gradient.stop(0.5, '#6A1B9A'); // Aurora Purple
    gradient.stop(1, '#B0127D'); // Aurora Rose
    doc.fillColor(gradient).rect(0, 0, doc.page.width, 14).fill();

    // Brand Logo Image
    const logoPath = path.join(__dirname, '../assets/logo.png');
    try {
        doc.image(logoPath, 72, 24, { width: 34 });
    } catch (e) {
        console.error("Failed to load logo image in PDF", e);
    }

    // Brand Logo Text
    doc.fillColor('#143C8C')
       .font('Helvetica-Bold')
       .fontSize(20)
       .text('Aurora', 110, 23);

    doc.fillColor('#6A1B9A')
       .font('Helvetica')
       .fontSize(9.5)
       .text('Sleep Disorder Screening', 110, 43);

    // Title / Subtitle block
    doc.fillColor('#0F172A')
       .font('Helvetica-Bold')
       .fontSize(14)
       .text('SLEEP SCREENING REPORT', doc.page.width - 320, 32, { align: 'right', width: 270 });

    const reportDate = new Date().toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
    
    doc.fillColor('#64748B')
       .font('Helvetica')
       .fontSize(8.5)
       .text(`ID: SM-${patientId || 'DRAFT'}  |  Date: ${reportDate}`, doc.page.width - 320, 52, { align: 'right', width: 270 });

    // Divider line
    doc.strokeColor('#E2E8F0')
       .lineWidth(1.2)
       .moveTo(50, 72)
       .lineTo(doc.page.width - 50, 72)
       .stroke();
}

function generatePDF(res, patient) {
    // Use bufferPages: true for exact dynamic total page calculation
    const doc = new PDFDocument({ margin: 50, size: 'A4', bufferPages: true });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
        'Content-Disposition',
        `inline; filename=Sleep_Report_${patient.id}.pdf`
    );

    doc.pipe(res);

    // ────────────────────────────────────────────────────────
    // PAGE 1 — COVER SUMMARY, PATIENT DEMOGRAPHICS, SEVERITY
    // ────────────────────────────────────────────────────────
    drawHeader(doc, patient.id);

    // 1. Cover-Card style summary at the top
    const coverY = 85;
    const coverH = 62;
    const primaryTitle = patient.primary_finding_label || 'No Significant Clinical Concerns Detected';
    const primaryTier = primaryRisk(patient);

    doc.fillColor('#F8FAFC')
       .roundedRect(50, coverY, doc.page.width - 100, coverH, 12)
       .fill();

    doc.strokeColor('#143C8C')
       .lineWidth(1.5)
       .roundedRect(50, coverY, doc.page.width - 100, coverH, 12)
       .stroke();

    // Left half: Primary Clinical Finding
    doc.fillColor('#64748B').font('Helvetica-Bold').fontSize(7.5).text('PRIMARY CLINICAL FINDING', 68, coverY + 12);
    
    let circadianSubtypes = [];
    try {
        circadianSubtypes = typeof patient.circadian_subtypes === 'string' ? JSON.parse(patient.circadian_subtypes) : (patient.circadian_subtypes || []);
    } catch(e) {}

    // Only show subtype under Primary Clinical Finding when primary IS Circadian Rhythm Disorder
    const isPrimaryCircadian = (primaryTitle || '').toLowerCase().includes('circadian');
    if (isPrimaryCircadian && circadianSubtypes.length > 0) {
        doc.fillColor('#0F172A').font('Helvetica-Bold').fontSize(11).text(primaryTitle, 68, coverY + 22, { width: doc.page.width / 2 - 80 });
        doc.fillColor('#6A1B9A').font('Helvetica-Bold').fontSize(7.5).text(`Subtype: ${circadianSubtypes.join(', ')}`, 68, coverY + 36, { width: doc.page.width / 2 - 80 });
    } else {
        doc.fillColor('#0F172A').font('Helvetica-Bold').fontSize(12).text(primaryTitle, 68, coverY + 25, { width: doc.page.width / 2 - 80 });
    }

    // Vertical divider line
    doc.strokeColor('#E2E8F0')
       .lineWidth(1)
       .moveTo(doc.page.width / 2 + 10, coverY + 12)
       .lineTo(doc.page.width / 2 + 10, coverY + coverH - 12)
       .stroke();

    // Right half: Overall Screening Risk
    const riskX = doc.page.width / 2 + 30;
    doc.fillColor('#64748B').font('Helvetica-Bold').fontSize(7.5).text('OVERALL SCREENING RISK', riskX, coverY + 12);
    drawBadge(doc, riskX, coverY + 24, 100, `${primaryTier} RISK`, primaryTier);


    // 2. Patient Info rounded card panel
    const patY = 158;
    const patH = 66;
    doc.fillColor('#F8FAFC')
       .roundedRect(50, patY, doc.page.width - 100, patH, 12)
       .fill();

    doc.strokeColor('#E2E8F0')
       .lineWidth(1)
       .roundedRect(50, patY, doc.page.width - 100, patH, 12)
       .stroke();

    // Column 1
    doc.fillColor('#64748B').font('Helvetica-Bold').fontSize(7.2).text('PATIENT NAME', 68, patY + 10);
    doc.fillColor('#0F172A').font('Helvetica-Bold').fontSize(10).text(patient.full_name || 'Anonymous Patient', 68, patY + 20);

    doc.fillColor('#64748B').font('Helvetica-Bold').fontSize(7.2).text('CONTACT DETAILS', 68, patY + 36);
    const emailStr = patient.email || '—';
    const phoneStr = patient.phone || '—';
    doc.fillColor('#334155').font('Helvetica').fontSize(9).text(`${emailStr}   •   ${phoneStr}`, 68, patY + 46);

    // Column 2
    const midX = 50 + (doc.page.width - 100) / 2 + 10;
    doc.fillColor('#64748B').font('Helvetica-Bold').fontSize(7.2).text('AGE / GENDER', midX, patY + 10);
    const ageGender = `${patient.age || '—'} yrs  /  ${patient.gender || '—'}`;
    doc.fillColor('#0F172A').font('Helvetica-Bold').fontSize(10).text(ageGender, midX, patY + 20);

    doc.fillColor('#64748B').font('Helvetica-Bold').fontSize(7.2).text('SCREENING STATUS', midX, patY + 36);
    drawBadge(doc, midX, patY + 45, 75, 'COMPLETED', 'low');


    // 3. Diagnostic Severity Matrix Table
    doc.fillColor('#143C8C').font('Helvetica-Bold').fontSize(12).text('1. Diagnostic Severity Matrix', 50, 240);

    const tableY = 256;
    doc.fillColor('#E2E8F0').rect(50, tableY, doc.page.width - 100, 22).fill();
    
    doc.fillColor('#475569').font('Helvetica-Bold').fontSize(8.5).text('SLEEP DISORDER SUITE', 68, tableY + 7);
    doc.text('RISK LEVEL', doc.page.width - 250, tableY + 7, { width: 100, align: 'center' });
    doc.text('RAW SCORE', doc.page.width - 130, tableY + 7, { width: 80, align: 'right' });

    const disorders = [
        { name: 'Obstructive Sleep Apnea (OSA)', tier: patient.osa_tier || 'Low', score: patient.osa_score || 0 },
        { name: 'Insomnia', tier: patient.insomnia_tier || 'Low', score: patient.insomnia_score || 0 },
        { name: 'Hypersomnia', tier: patient.hypersomnia_tier || 'Low', score: patient.hypersomnia_score || 0 },
        { name: 'Circadian Rhythm Disorder', tier: patient.circadian_tier || 'Low', score: patient.circadian_score || 0 }
    ];

    let rowY = tableY + 22;
    disorders.forEach((d, idx) => {
        let rowH = 25;
        let isCircadianWithSubtypes = d.name.includes('Circadian') && circadianSubtypes.length > 0;
        if (isCircadianWithSubtypes) {
            rowH = 36;
        }

        if (idx % 2 === 1) {
            doc.fillColor('#F8FAFC').rect(50, rowY, doc.page.width - 100, rowH).fill();
        }

        doc.strokeColor('#E2E8F0').lineWidth(0.5).moveTo(50, rowY + rowH).lineTo(doc.page.width - 50, rowY + rowH).stroke();

        if (isCircadianWithSubtypes) {
            doc.fillColor('#0F172A').font('Helvetica').fontSize(9.5).text(d.name, 68, rowY + 6);
            doc.fillColor('#6A1B9A').font('Helvetica-Bold').fontSize(7.5).text(`Subtype: ${circadianSubtypes.join(', ')}`, 68, rowY + 20);
            
            drawBadge(doc, doc.page.width - 230, rowY + 10, 60, d.tier, d.tier);
            doc.fillColor('#64748B').font('Helvetica').fontSize(9.5).text(String(d.score), doc.page.width - 130, rowY + 13, { width: 80, align: 'right' });
        } else {
            doc.fillColor('#0F172A').font('Helvetica').fontSize(9.5).text(d.name, 68, rowY + 8);
            drawBadge(doc, doc.page.width - 230, rowY + 5, 60, d.tier, d.tier);
            doc.fillColor('#64748B').font('Helvetica').fontSize(9.5).text(String(d.score), doc.page.width - 130, rowY + 8, { width: 80, align: 'right' });
        }

        rowY += rowH;
    });


    // 4. Physical & Clinical Indicators (Rounded Card Grid)
    doc.fillColor('#143C8C').font('Helvetica-Bold').fontSize(12).text('2. Key Clinical Indicators', 50, rowY + 20);

    const indY = rowY + 36;
    const gridW = (doc.page.width - 100) / 3;

    doc.strokeColor('#E2E8F0').lineWidth(1).roundedRect(50, indY, doc.page.width - 100, 84, 8).stroke();
    
    doc.strokeColor('#E2E8F0').lineWidth(0.5)
       .moveTo(50 + gridW, indY).lineTo(50 + gridW, indY + 84)
       .moveTo(50 + gridW * 2, indY).lineTo(50 + gridW * 2, indY + 84)
       .moveTo(50, indY + 42).lineTo(doc.page.width - 50, indY + 42)
       .stroke();

    const drawCell = (col, row, label, value) => {
        const x = 50 + col * gridW + 14;
        const y = indY + row * 42 + 9;
        doc.fillColor('#64748B').font('Helvetica-Bold').fontSize(7).text(label, x, y);
        doc.fillColor('#0F172A').font('Helvetica').fontSize(9.5).text(value || '—', x, y + 13);
    };

    let bmiVal = '—';
    if (patient.height && patient.weight) {
        const heightM = patient.height / 100;
        const computedBmi = patient.weight / (heightM * heightM);
        bmiVal = computedBmi.toFixed(1);
    }

    drawCell(0, 0, 'AVERAGE SLEEP HOURS', `${patient.avg_sleep || '—'} hrs`);
    drawCell(1, 0, 'BODY MASS INDEX (BMI)', bmiVal);
    drawCell(2, 0, 'SNORING SYMPTOM', patient.snoring_gate || 'No');

    drawCell(0, 1, 'DAYTIME SLEEPY/FATIGUED', patient.daytime_sleepy || 'No');
    drawCell(1, 1, 'SLEEP SATISFACTION', patient.sleep_satisfaction || '—');
    drawCell(2, 1, 'HEIGHT & WEIGHT', `${patient.height || '—'} cm / ${patient.weight || '—'} kg`);


    // ────────────────────────────────────────────────────────
    // PAGE 2 — PERSONALIZED RECOMMENDATIONS & DISCLAIMERS
    // ────────────────────────────────────────────────────────
    doc.addPage();
    drawHeader(doc, patient.id);

    let currentY = 92;

    // Section 3: Overlapping & Comorbid Conditions
    doc.fillColor('#143C8C').font('Helvetica-Bold').fontSize(12).text('3. Overlapping & Comorbid Conditions', 50, currentY);
    currentY += 22;

    const comorbs = safeParse(patient.comorbidities, []);
    if (comorbs.length > 0) {
        comorbs.forEach(c => {
            doc.fillColor('#D97706').circle(62, currentY + 5.5, 3).fill();
            
            const labelDesc = `${c.label} — ${c.description}`;
            doc.fillColor('#334155')
               .font('Helvetica')
               .fontSize(9.5)
               .text(labelDesc, 74, currentY, { width: doc.page.width - 124, lineGap: 3.5 });
               
            const textHeight = doc.heightOfString(labelDesc, { width: doc.page.width - 124 }) + 9;
            currentY += Math.max(textHeight, 18);
        });
    } else {
        doc.fillColor('#64748B').font('Helvetica').fontSize(9.5).text('No overlapping or comorbid sleep conditions detected.', 50, currentY);
        currentY += 20;
    }

    currentY += 14;

    // Section 4: Personalized Clinical Recommendations
    doc.fillColor('#143C8C').font('Helvetica-Bold').fontSize(12).text('4. Personalized Clinical Recommendations', 50, currentY);
    currentY += 22;

    if (patient.ai_recommendations) {
        const recList = formatRecommendations(patient.ai_recommendations);
        if (recList.length > 0) {
            recList.forEach(rec => {
                doc.fillColor('#143C8C').circle(62, currentY + 5.5, 3).fill();
                
                doc.fillColor('#334155')
                   .font('Helvetica')
                   .fontSize(9.5)
                   .text(rec, 74, currentY, { width: doc.page.width - 124, lineGap: 3.5 });
                   
                const textHeight = doc.heightOfString(rec, { width: doc.page.width - 124 }) + 9;
                currentY += Math.max(textHeight, 18);
            });
        } else {
            doc.fillColor('#64748B').font('Helvetica').fontSize(9.5).text('No structured recommendations available.', 50, currentY);
            currentY += 20;
        }
    } else {
        doc.fillColor('#64748B').font('Helvetica').fontSize(9.5).text('No structured recommendations available.', 50, currentY);
        currentY += 20;
    }

    currentY += 14;

    // Section 5: Medical Disclaimer rounded card panel (no emoji symbol)
    const disclaimerY = Math.max(currentY + 16, doc.page.height - 142);
    
    doc.fillColor('#F8FAFC')
       .roundedRect(50, disclaimerY, doc.page.width - 100, 62, 10)
       .fill();

    doc.strokeColor('#E2E8F0')
       .lineWidth(1)
       .roundedRect(50, disclaimerY, doc.page.width - 100, 62, 10)
       .stroke();

    doc.fillColor('#0F172A').font('Helvetica-Bold').fontSize(8.5).text('CLINICAL DISCLAIMER & REGULATORY NOTICE', 66, disclaimerY + 10);
    doc.fillColor('#64748B')
       .font('Helvetica-Oblique')
       .fontSize(7.5)
       .text(
           'This screening report is compiled from user self-reported answers and is intended solely for clinical screening, educational context, and referral guidance. It is not a formal medical diagnosis, diagnostic sleep study, or therapeutic recommendation. Please consult a board-certified sleep physician or specialist for diagnostic polysomnography and therapy options.',
           66,
           disclaimerY + 21,
           { width: doc.page.width - 132, lineGap: 2.2 }
       );


    // ────────────────────────────────────────────────────────
    // PAGE 3 — DETAILED QUESTIONNAIRE RESPONSES
    // ────────────────────────────────────────────────────────
    doc.addPage();
    drawHeader(doc, patient.id);

    doc.fillColor('#143C8C').font('Helvetica-Bold').fontSize(12).text('5. Detailed Questionnaire Responses', 50, 92);
    let qY = 112;

    QUESTION_GROUPS.forEach(group => {
        const rows = [];
        for (const [key, label] of Object.entries(group.fields)) {
            let val = patient[key];
            if (val !== null && val !== undefined && val !== '') {
                if (Array.isArray(val)) {
                    if (val.length > 0) {
                        rows.push({ label, value: val.map(v => v === 'none_above' ? 'None of the above' : v).join(', ') });
                    }
                } else {
                    rows.push({ label, value: val === 'none_above' ? 'None of the above' : String(val) });
                }
            }
        }

        if (rows.length === 0) return;

        const neededHeight = 22 + (rows.length * 16) + 15;
        if (qY + neededHeight > doc.page.height - 60) {
            doc.addPage();
            drawHeader(doc, patient.id);
            qY = 92;
        }

        // Draw Group Header rounded bar
        doc.fillColor('#F1F5F9').roundedRect(50, qY, doc.page.width - 100, 18, 4).fill();
        doc.fillColor('#334155').font('Helvetica-Bold').fontSize(8.5).text(group.title.toUpperCase(), 62, qY + 5);
        qY += 18;

        rows.forEach((row, rIdx) => {
            if (rIdx % 2 === 1) {
                doc.fillColor('#F8FAFC').rect(50, qY, doc.page.width - 100, 16).fill();
            }

            doc.strokeColor('#F1F5F9').lineWidth(0.5).moveTo(50, qY + 16).lineTo(doc.page.width - 50, qY + 16).stroke();

            // Question Label
            doc.fillColor('#64748B').font('Helvetica').fontSize(8.5).text(row.label, 62, qY + 4, { width: 220 });
            
            // Value - Red highlighting for critical positive findings (matches dashboard highlights)
            let valColor = '#0F172A';
            const lowerV = row.value.toLowerCase();
            if (lowerV === 'yes' || lowerV === 'high' || lowerV.includes('dissatisfied') || lowerV.includes('>1 hour') || lowerV.includes('3 or more')) {
                valColor = '#DC2626'; // Soft red highlight
                doc.font('Helvetica-Bold');
            } else {
                doc.font('Helvetica');
            }
            
            doc.fillColor(valColor).fontSize(8.5).text(row.value, 300, qY + 4, { width: doc.page.width - 350 });
            qY += 16;
        });

        qY += 10;
    });


    // ────────────────────────────────────────────────────────
    // GLOBAL DYNAMIC FOOTER PAGE NUMBERING (PAGE RANGE SWAP)
    // ────────────────────────────────────────────────────────
    const range = doc.bufferedPageRange();
    for (let i = 0; i < range.count; i++) {
        doc.switchToPage(i);
        
        // Temporarily clear bottom margin to avoid triggering page breaks
        const oldMargins = doc.page.margins;
        doc.page.margins = { ...oldMargins, bottom: 0 };

        doc.save();
        doc.fillColor('#94A3B8')
           .font('Helvetica')
           .fontSize(8);

        doc.text(
            `Page ${i + 1} of ${range.count}   •   Aurora Sleep Disorder Screening`,
            50,
            doc.page.height - 35,
            {
                width: doc.page.width - 100,
                align: 'center',
                lineBreak: false
            }
        );
        doc.restore();

        // Restore original margins
        doc.page.margins = oldMargins;
    }

    doc.end();
}

module.exports = generatePDF;
