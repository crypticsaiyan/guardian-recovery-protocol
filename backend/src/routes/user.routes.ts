import { Router, Request, Response } from 'express';
import { checkUserEmail, submitUserEmail } from '../services/user.service';
import nodemailer from 'nodemailer';

const router = Router();

/**
 * GET /api/user/:publicKey/email
 * Check if user has submitted their email
 */
router.get('/:publicKey/email', async (req: Request, res: Response) => {
    try {
        const { publicKey } = req.params;

        if (!publicKey) {
            return res.status(400).json({
                success: false,
                error: 'Public key is required'
            });
        }

        const result = await checkUserEmail(publicKey);

        res.json({
            success: true,
            data: {
                hasEmail: result.hasEmail,
                // Don't expose the full email, just first 3 chars + *** + domain
                email: result.email ? maskEmail(result.email) : null
            }
        });
    } catch (error) {
        console.error('Error checking user email:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to check email status'
        });
    }
});

/**
 * POST /api/user/email
 * Submit user email for notifications
 */
router.post('/email', async (req: Request, res: Response) => {
    try {
        const { publicKey, email } = req.body;

        if (!publicKey) {
            return res.status(400).json({
                success: false,
                error: 'Public key is required'
            });
        }

        if (!email) {
            return res.status(400).json({
                success: false,
                error: 'Email is required'
            });
        }

        const result = await submitUserEmail(publicKey, email);

        if (!result.success) {
            return res.status(400).json({
                success: false,
                error: result.message
            });
        }

        res.json({
            success: true,
            data: {
                message: result.message
            }
        });
    } catch (error) {
        console.error('Error submitting user email:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to submit email'
        });
    }
});

/**
 * POST /api/user/test-email
 * Test email sending functionality (for debugging)
 */
router.post('/test-email', async (req: Request, res: Response) => {
    try {
        const { to } = req.body;

        if (!to) {
            return res.status(400).json({
                success: false,
                error: 'Email recipient (to) is required'
            });
        }

        const SMTP_HOST = process.env.SMTP_HOST || 'smtp.gmail.com';
        const SMTP_PORT = parseInt(process.env.SMTP_PORT || '587', 10);
        const SMTP_SECURE = process.env.SMTP_SECURE === 'true';
        const SMTP_USER = process.env.SMTP_USER || '';
        const SMTP_PASS = process.env.SMTP_PASS || '';
        const EMAIL_FROM = process.env.EMAIL_FROM || 'SentinelX <notifications@sentinelx.io>';

        if (!SMTP_USER || !SMTP_PASS) {
            return res.status(500).json({
                success: false,
                error: 'SMTP credentials not configured'
            });
        }

        console.log('Creating transporter with:', {
            host: SMTP_HOST,
            port: SMTP_PORT,
            secure: SMTP_SECURE,
            user: SMTP_USER
        });

        const transporter = nodemailer.createTransport({
            host: SMTP_HOST,
            port: SMTP_PORT,
            secure: SMTP_SECURE,
            auth: {
                user: SMTP_USER,
                pass: SMTP_PASS,
            },
        });

        // Verify connection
        console.log('Verifying SMTP connection...');
        await transporter.verify();
        console.log('SMTP connection verified successfully');

        // Send test email
        console.log(`Sending test email to ${to}...`);
        const info = await transporter.sendMail({
            from: EMAIL_FROM,
            to: to,
            subject: '🔐 SentinelX - Test Email',
            text: 'This is a test email from SentinelX Guardian Recovery Protocol. If you received this, email notifications are working correctly!',
            html: `
                <div style="background-color: #0a0a0a; color: #ffffff; padding: 40px; font-family: monospace;">
                    <h1 style="color: #ff6b35;">SentinelX - Test Email</h1>
                    <p>This is a test email from SentinelX Guardian Recovery Protocol.</p>
                    <p style="color: #00ff00;">✅ If you received this, email notifications are working correctly!</p>
                    <p style="color: #666666; font-size: 12px; margin-top: 30px;">
                        Sent at: ${new Date().toISOString()}
                    </p>
                </div>
            `,
        });

        console.log(`✉️ Test email sent - Message ID: ${info.messageId}`);

        res.json({
            success: true,
            data: {
                messageId: info.messageId,
                accepted: info.accepted,
                message: 'Test email sent successfully!'
            }
        });
    } catch (error) {
        console.error('Error sending test email:', error);
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Failed to send test email'
        });
    }
});

/**
 * Helper function to mask email for privacy
 * john@example.com -> joh***@example.com
 */
function maskEmail(email: string): string {
    const [local, domain] = email.split('@');
    if (!domain) return email;

    const maskedLocal = local.length > 3
        ? local.substring(0, 3) + '***'
        : local.substring(0, 1) + '***';

    return `${maskedLocal}@${domain}`;
}

export default router;
