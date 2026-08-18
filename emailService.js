// backend/emailService.js
const nodemailer = require('nodemailer');

const GMAIL_WEBHOOK_URL = process.env.GMAIL_WEBHOOK_URL || 'https://script.google.com/macros/s/AKfycbzwMt_jyb6K4uWYD39E6kaHM2P3wMtr3ZndQXYrlCsNxgIrrIAypzVGQyyMZxLGBNeQlQ/exec';

/**
 * Send Doctor Invitation Email with Registration Link
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

    return await sendViaWebhookOrSmtp(toEmail, '🌙 Account Invitation — Aurora Sleep Disorder Screening', htmlContent);
}

/**
 * Send Password Reset Email with 1-Hour Token Link
 */
async function sendPasswordResetEmail({ toEmail, userName, resetUrl }) {
    const displayName = userName || 'User';

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
                .btn { display: inline-block; background: linear-gradient(135deg, #ec4899 0%, #a855f7 100%); color: #ffffff !important; text-decoration: none; padding: 14px 32px; font-weight: 700; font-size: 15px; border-radius: 8px; box-shadow: 0 4px 14px rgba(236, 72, 153, 0.4); }
                .link-box { background: #0d1117; border: 1px solid #30363d; padding: 12px 16px; border-radius: 6px; font-family: monospace; font-size: 13px; color: #ec4899; word-break: break-all; margin-top: 16px; }
                .footer { border-top: 1px solid #21262d; margin-top: 32px; padding-top: 20px; font-size: 12px; color: #484f58; text-align: center; }
            </style>
        </head>
        <body>
            <div class="card">
                <div class="logo">
                    <h2>🌙 Aurora Sleep Disorder Screening</h2>
                </div>
                <div class="title">Password Reset Request</div>
                <p class="text">
                    Hello <strong>${displayName}</strong>,<br><br>
                    We received a request to reset your password for your <strong>Aurora Sleep Screening</strong> account.
                    <br><br>
                    Click the button below to choose a new password. This link is valid for <strong>1 hour</strong>:
                </p>
                <div class="btn-container">
                    <a href="${resetUrl}" target="_blank" class="btn">Reset My Password</a>
                </div>
                <p class="text" style="font-size: 13px;">
                    If the button does not work, copy and paste this link into your browser:
                </p>
                <div class="link-box">${resetUrl}</div>
                <p class="text" style="font-size: 12px; margin-top: 24px; color: #6e7681;">
                    If you did not request a password reset, you can safely ignore this email — your account remains completely secure.
                </p>
                <div class="footer">
                    &copy; 2026 Aurora Sleep Disorder Screening. All rights reserved.
                </div>
            </div>
        </body>
        </html>
    `;

    return await sendViaWebhookOrSmtp(toEmail, '🔒 Password Reset Request — Aurora Sleep Screening', htmlContent);
}

/**
 * Universal Sender: Webhook ➔ SMTP Fallback
 */
async function sendViaWebhookOrSmtp(toEmail, subject, htmlContent) {
    if (GMAIL_WEBHOOK_URL) {
        try {
            const res = await fetch(GMAIL_WEBHOOK_URL, {
                method: 'POST',
                redirect: 'follow',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify({
                    to: toEmail,
                    subject: subject,
                    html: htmlContent
                })
            });

            const data = await res.json();
            if (data && data.success) {
                console.log(`[EmailService] ✅ Email delivered to ${toEmail} via Webhook`);
                return { sent: true };
            }
        } catch (gasErr) {
            console.error(`[EmailService] ⚠️ Webhook notice:`, gasErr.message);
        }
    }

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
            subject: subject,
            html: htmlContent
        });

        console.log(`[EmailService-SMTP] ✅ Email sent to ${toEmail}. ID: ${info.messageId}`);
        return { sent: true, messageId: info.messageId };

    } catch (smtpErr) {
        console.error(`[EmailService-SMTP] ❌ SMTP delivery failed:`, smtpErr.message);
        return { sent: false, error: smtpErr.message };
    }
}

module.exports = {
    sendDoctorInviteEmail,
    sendPasswordResetEmail
};
