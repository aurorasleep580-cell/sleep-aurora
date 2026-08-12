// backend/emailService.js
const nodemailer = require('nodemailer');

/**
 * Send Doctor Invitation Email with Registration Link
 * Supports:
 * 1. Google Apps Script Webhook (Direct Gmail sending over HTTPS, 0 blocks, 100% inbox delivery)
 * 2. Brevo HTTPS API (Port 443, free 300 emails/day to any recipient)
 * 3. Resend HTTPS API (Port 443)
 * 4. Gmail SMTP with IPv4
 */
async function sendDoctorInviteEmail({ toEmail, doctorName, inviteUrl }) {
    const doctorDisplayName = doctorName || 'Doctor';

    const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <style>
                body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #0d1117; color: #e6edf3; margin: 0; padding: 40px 20px; }
                .card { max-width: 580px; margin: 0 auto; background-color: #161b22; border: 1px solid #30363d; border-radius: 12px; padding: 36px; box-shadow: 0 10px 30px rgba(0,0,0,0.5); }
                .logo { text-align: center; margin-bottom: 24px; }
                .logo h2 { color: #a855f7; font-size: 24px; font-weight: 800; margin: 0; letter-spacing: -0.5px; }
                .title { font-size: 20px; font-weight: 700; color: #ffffff; margin-bottom: 12px; text-align: center; }
                .text { font-size: 15px; line-height: 1.6; color: #8b949e; margin-bottom: 24px; }
                .btn-container { text-align: center; margin: 32px 0; }
                .btn { display: inline-block; background: linear-gradient(135deg, #a855f7 0%, #7c3aed 100%); color: #ffffff !important; text-decoration: none; padding: 14px 32px; font-weight: 700; font-size: 15px; border-radius: 8px; box-shadow: 0 4px 14px rgba(168, 85, 247, 0.4); }
                .link-box { background: #0d1117; border: 1px solid #30363d; padding: 12px 16px; border-radius: 6px; font-family: monospace; font-size: 13px; color: #a855f7; word-break: break-all; margin-top: 16px; }
                .footer { border-top: 1px solid #21262d; margin-top: 32px; padding-top: 20px; font-size: 12px; color: #484f58; text-align: center; }
            </style>
        </head>
        <body>
            <div class="card">
                <div class="logo">
                    <h2>🌙 Aurora Sleep Disorder Screening</h2>
                </div>
                <div class="title">Clinician Account Invitation</div>
                <p class="text">
                    Hello <strong>${doctorDisplayName}</strong>,<br><br>
                    You have been invited to join the <strong>Aurora Sleep Disorder Screening Platform</strong> as a Clinician / Sleep Specialist.
                    <br><br>
                    To activate your account and set up your personal <strong>Login ID (Username)</strong> and <strong>Password</strong>, please click the button below:
                </p>
                <div class="btn-container">
                    <a href="${inviteUrl}" target="_blank" class="btn">Activate Account & Set Password</a>
                </div>
                <p class="text" style="font-size: 13px;">
                    If the button above does not work, copy and paste this link into your browser:
                </p>
                <div class="link-box">${inviteUrl}</div>
                <p class="text" style="font-size: 12px; margin-top: 24px; color: #6e7681;">
                    Note: This invitation link is valid for 14 days. If you did not request this invitation, please ignore this email.
                </p>
                <div class="footer">
                    &copy; 2026 Aurora Sleep Disorder Screening. All rights reserved.
                </div>
            </div>
        </body>
        </html>
    `;

    // 1. Google Apps Script Webhook (Direct Gmail sending over HTTPS — 0 blocks, 100% inbox delivery)
    const gmailWebhookUrl = process.env.GMAIL_WEBHOOK_URL;
    if (gmailWebhookUrl) {
        try {
            const res = await fetch(gmailWebhookUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    to: toEmail,
                    subject: '🌙 Account Invitation — Aurora Sleep Disorder Screening',
                    html: htmlContent,
                    doctorName: doctorDisplayName,
                    inviteUrl
                })
            });
            const data = await res.json();
            if (data.success) {
                console.log(`[EmailService-GoogleAppsScript] ✅ Email sent to ${toEmail}`);
                return { sent: true };
            }
        } catch (gasErr) {
            console.error(`[EmailService-GoogleAppsScript] ❌ Failed:`, gasErr.message);
        }
    }

    // 2. Brevo HTTPS API (Port 443 — free 300 emails/day to any recipient)
    const brevoApiKey = process.env.BREVO_API_KEY;
    if (brevoApiKey) {
        try {
            const res = await fetch('https://api.brevo.com/v3/smtp/email', {
                method: 'POST',
                headers: {
                    'api-key': brevoApiKey,
                    'Content-Type': 'application/json',
                    'accept': 'application/json'
                },
                body: JSON.stringify({
                    sender: { name: 'Aurora Sleep Screening', email: 'aurorasleep580@gmail.com' },
                    to: [{ email: toEmail, name: doctorDisplayName }],
                    subject: '🌙 Account Invitation — Aurora Sleep Disorder Screening',
                    htmlContent: htmlContent
                })
            });
            const data = await res.json();
            if (res.ok && (data.messageId || data.messageIds)) {
                console.log(`[EmailService-Brevo] ✅ Email sent to ${toEmail}. Message ID: ${data.messageId}`);
                return { sent: true, messageId: data.messageId };
            }
        } catch (brevoErr) {
            console.error(`[EmailService-Brevo] ❌ Failed:`, brevoErr.message);
        }
    }

    // 3. Resend HTTPS API (Port 443)
    if (process.env.RESEND_API_KEY) {
        try {
            const res = await fetch('https://api.resend.com/emails', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    from: process.env.SMTP_FROM || 'Aurora Sleep <onboarding@resend.dev>',
                    to: [toEmail],
                    subject: '🌙 Account Invitation — Aurora Sleep Disorder Screening',
                    html: htmlContent
                })
            });

            const data = await res.json();
            if (res.ok && data.id) {
                console.log(`[EmailService-Resend] ✅ Invitation email sent to ${toEmail}. ID: ${data.id}`);
                return { sent: true, messageId: data.id };
            }
        } catch (apiErr) {
            console.error(`[EmailService-Resend] ❌ HTTPS call failed:`, apiErr.message);
        }
    }

    // 4. Fallback to Gmail SMTP with IPv4
    try {
        const user = process.env.SMTP_USER || 'aurorasleep580@gmail.com';
        const pass = process.env.SMTP_PASS || 'jqwzodjepnjibgfd';

        const transporter = nodemailer.createTransport({
            host: 'smtp.gmail.com',
            port: 587,
            secure: false,
            auth: { user, pass },
            tls: { rejectUnauthorized: false },
            family: 4,
            connectionTimeout: 8000,
            greetingTimeout: 8000,
            socketTimeout: 8000
        });

        const fromAddress = process.env.SMTP_FROM || 'Aurora Sleep Screening <aurorasleep580@gmail.com>';
        const info = await transporter.sendMail({
            from: fromAddress,
            to: toEmail,
            subject: '🌙 Account Invitation — Aurora Sleep Disorder Screening',
            html: htmlContent
        });

        console.log(`[EmailService-SMTP] ✅ Invitation email sent to ${toEmail}. ID: ${info.messageId}`);
        return { sent: true, messageId: info.messageId };

    } catch (smtpErr) {
        console.error(`[EmailService-SMTP] ❌ SMTP delivery failed:`, smtpErr.message);
        return { sent: false, error: smtpErr.message };
    }
}

module.exports = {
    sendDoctorInviteEmail
};
