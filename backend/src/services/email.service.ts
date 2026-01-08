import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { CLPublicKey } from 'casper-js-sdk';
import nodemailer from 'nodemailer';

// Supabase configuration
const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '';

// Lazy-loaded Supabase client
let supabaseClient: SupabaseClient | null = null;

function getSupabaseClient(): SupabaseClient | null {
    if (!supabaseUrl || !supabaseKey) {
        return null;
    }
    if (!supabaseClient) {
        supabaseClient = createClient(supabaseUrl, supabaseKey);
    }
    return supabaseClient;
}

// Email configuration using Nodemailer
const SMTP_HOST = process.env.SMTP_HOST || 'smtp.gmail.com';
const SMTP_PORT = parseInt(process.env.SMTP_PORT || '587', 10);
const SMTP_SECURE = process.env.SMTP_SECURE === 'true'; // true for 465, false for other ports
const SMTP_USER = process.env.SMTP_USER || '';
const SMTP_PASS = process.env.SMTP_PASS || '';
const EMAIL_FROM = process.env.EMAIL_FROM || 'SentinelX <notifications@sentinelx.io>';
const APP_URL = process.env.APP_URL || 'http://localhost:3000';

// Create reusable transporter
let transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter | null {
    if (!SMTP_USER || !SMTP_PASS) {
        console.warn('⚠️ SMTP credentials not configured. Email notifications disabled.');
        return null;
    }

    if (!transporter) {
        transporter = nodemailer.createTransport({
            host: SMTP_HOST,
            port: SMTP_PORT,
            secure: SMTP_SECURE,
            auth: {
                user: SMTP_USER,
                pass: SMTP_PASS,
            },
        });
    }

    return transporter;
}

interface EmailNotification {
    to: string;
    subject: string;
    html: string;
    text: string;
}

/**
 * Send email using Nodemailer
 */
async function sendEmail(notification: EmailNotification): Promise<boolean> {
    const transport = getTransporter();
    if (!transport) {
        return false;
    }

    try {
        const info = await transport.sendMail({
            from: EMAIL_FROM,
            to: notification.to,
            subject: notification.subject,
            html: notification.html,
            text: notification.text,
        });

        console.log(`✉️ Email sent to ${notification.to} - Message ID: ${info.messageId}`);
        return true;
    } catch (error) {
        console.error('Error sending email:', error);
        return false;
    }
}

/**
 * Get email for a public key (guardian)
 */
export async function getEmailForPublicKey(publicKeyHex: string): Promise<string | null> {
    const supabase = getSupabaseClient();
    if (!supabase) {
        return null;
    }

    try {
        const { data, error } = await supabase
            .from('user')
            .select('email')
            .eq('public_key', publicKeyHex)
            .single();

        if (error || !data?.email) {
            return null;
        }

        return data.email;
    } catch (error) {
        console.error('Error getting email for public key:', error);
        return null;
    }
}

/**
 * Get email by account hash (for looking up guardian emails from contract data)
 * @param accountHashHex - The account hash hex string (without 'account-hash-' prefix)
 */
export async function getEmailByAccountHash(accountHashHex: string): Promise<string | null> {
    const supabase = getSupabaseClient();
    if (!supabase) {
        console.log('getEmailByAccountHash: Supabase client not available');
        return null;
    }

    try {
        // Remove 'account-hash-' prefix if present and normalize to lowercase
        const cleanHash = accountHashHex.replace('account-hash-', '').toLowerCase();

        console.log(`getEmailByAccountHash: Looking up account_hash = ${cleanHash}`);

        const { data, error } = await supabase
            .from('user')
            .select('email, account_hash')
            .eq('account_hash', cleanHash)
            .single();

        if (error) {
            console.log(`getEmailByAccountHash: Supabase error - ${error.message}`);
            return null;
        }

        if (!data?.email) {
            console.log(`getEmailByAccountHash: No email found for hash ${cleanHash}`);
            return null;
        }

        console.log(`getEmailByAccountHash: Found email ${data.email.substring(0, 3)}*** for hash ${cleanHash.substring(0, 16)}...`);
        return data.email;
    } catch (error) {
        console.error('Error getting email by account hash:', error);
        return null;
    }
}

/**
 * Convert account hash to a shortened display format
 */
function shortenHash(hash: string): string {
    if (hash.length <= 16) return hash;
    return `${hash.substring(0, 8)}...${hash.substring(hash.length - 8)}`;
}

/**
 * Build recovery notification email HTML
 */
function buildRecoveryNotificationEmail(params: {
    targetAccount: string;
    newPublicKey?: string;
    recoveryId?: string;
    initiatorKey?: string;
}): { html: string; text: string } {
    const { targetAccount, newPublicKey, recoveryId } = params;

    const html = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Recovery Request Notification</title>
</head>
<body style="margin: 0; padding: 0; background-color: #0a0a0a; font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Fira Mono', 'Droid Sans Mono', monospace;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #0a0a0a;">
        <tr>
            <td align="center" style="padding: 40px 20px;">
                <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="background-color: #111111; border: 1px solid #333333;">
                    <!-- Header -->
                    <tr>
                        <td style="padding: 30px 40px; border-bottom: 1px solid #333333;">
                            <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                                <tr>
                                    <td>
                                        <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 600; letter-spacing: 2px;">
                                            SENTINELX
                                        </h1>
                                    </td>
                                    <td align="right">
                                        <span style="background-color: #ff6b35; color: #000000; padding: 6px 12px; font-size: 10px; font-weight: 600; letter-spacing: 1px; text-transform: uppercase;">
                                            ACTION REQUIRED
                                        </span>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                    
                    <!-- Main Content -->
                    <tr>
                        <td style="padding: 40px;">
                            <h2 style="margin: 0 0 20px 0; color: #ffffff; font-size: 18px; font-weight: 500;">
                                🔐 Recovery Request Initiated
                            </h2>
                            
                            <p style="margin: 0 0 25px 0; color: #888888; font-size: 14px; line-height: 1.6;">
                                A recovery request has been initiated for an account you are protecting as a guardian. Your approval is required.
                            </p>
                            
                            <!-- Details Box -->
                            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #1a1a1a; border: 1px solid #333333; margin-bottom: 30px;">
                                <tr>
                                    <td style="padding: 20px;">
                                        ${recoveryId ? `
                                        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom: 15px;">
                                            <tr>
                                                <td style="color: #666666; font-size: 10px; text-transform: uppercase; letter-spacing: 1px; padding-bottom: 5px;">
                                                    Recovery ID
                                                </td>
                                            </tr>
                                            <tr>
                                                <td style="color: #ff6b35; font-size: 14px; font-weight: 500;">
                                                    ${recoveryId}
                                                </td>
                                            </tr>
                                        </table>
                                        ` : ''}
                                        
                                        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom: 15px;">
                                            <tr>
                                                <td style="color: #666666; font-size: 10px; text-transform: uppercase; letter-spacing: 1px; padding-bottom: 5px;">
                                                    Target Account
                                                </td>
                                            </tr>
                                            <tr>
                                                <td style="color: #ffffff; font-size: 12px; word-break: break-all;">
                                                    ${targetAccount}
                                                </td>
                                            </tr>
                                        </table>
                                        
                                        <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                                            <tr>
                                                <td style="color: #666666; font-size: 10px; text-transform: uppercase; letter-spacing: 1px; padding-bottom: 5px;">
                                                    New Recovery Key
                                                </td>
                                            </tr>
                                            <tr>
                                                <td style="color: #ffffff; font-size: 12px; word-break: break-all;">
                                                    ${newPublicKey ? shortenHash(newPublicKey) : '<span style="color: #666666; font-style: italic;">Not specified</span>'}
                                                </td>
                                            </tr>
                                        </table>
                                    </td>
                                </tr>
                            </table>
                            
                            <!-- CTA Button -->
                            <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                                <tr>
                                    <td align="center">
                                        <a href="${APP_URL}/dashboard" 
                                           style="display: inline-block; background-color: #ff6b35; color: #000000; padding: 14px 32px; font-size: 12px; font-weight: 600; text-decoration: none; text-transform: uppercase; letter-spacing: 1px;">
                                            Review &amp; Approve →
                                        </a>
                                    </td>
                                </tr>
                            </table>
                            
                            <!-- Warning -->
                            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top: 30px; border: 1px solid #ff6b35; background-color: rgba(255, 107, 53, 0.1);">
                                <tr>
                                    <td style="padding: 15px;">
                                        <p style="margin: 0; color: #ff6b35; font-size: 12px; line-height: 1.5;">
                                            ⚠️ <strong>Security Notice:</strong> Only approve this recovery if you recognize the request. If you didn't expect this, please verify with the account owner before approving.
                                        </p>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                    
                    <!-- Footer -->
                    <tr>
                        <td style="padding: 30px 40px; border-top: 1px solid #333333; background-color: #0d0d0d;">
                            <p style="margin: 0; color: #666666; font-size: 11px; line-height: 1.5;">
                                This is an automated notification from SentinelX Guardian Recovery Protocol. 
                                You received this email because you are registered as a guardian for this account.
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
    `.trim();

    const text = `
SENTINELX - RECOVERY REQUEST NOTIFICATION
=========================================

🔐 A recovery request has been initiated for an account you are protecting as a guardian.

${recoveryId ? `Recovery ID: ${recoveryId}` : ''}
Target Account: ${targetAccount}
New Recovery Key: ${newPublicKey ? shortenHash(newPublicKey) : 'Not specified'}

Your approval is required. Please visit ${APP_URL}/dashboard to review and approve this request.

⚠️ SECURITY NOTICE: Only approve this recovery if you recognize the request. If you didn't expect this, please verify with the account owner before approving.

---
SentinelX Guardian Recovery Protocol
    `.trim();

    return { html, text };
}

/**
 * Send recovery notification emails to all guardians
 * @param targetAccountHex - The account being recovered (public key hex)
 * @param newPublicKeyHex - The new public key for recovery
 * @param guardianAccountHashes - List of guardian account hashes (from contract)
 * @param initiatorAccountHash - The guardian who initiated (optional, to exclude from notification)
 * @param recoveryId - The recovery ID (optional)
 */
export async function notifyGuardiansOfRecovery(params: {
    targetAccountHex: string;
    newPublicKeyHex?: string;
    guardianAccountHashes: string[];
    initiatorAccountHash?: string;
    recoveryId?: string;
}): Promise<{ sent: number; failed: number; skipped: number }> {
    const { targetAccountHex, newPublicKeyHex, guardianAccountHashes, initiatorAccountHash, recoveryId } = params;

    console.log('\n=== Sending Recovery Notification Emails ===');
    console.log('Target Account:', targetAccountHex);
    console.log('Guardian Account Hashes Count:', guardianAccountHashes.length);
    console.log('Initiator Account Hash (excluded):', initiatorAccountHash || 'N/A');

    const sentEmails = new Set<string>();
    let sent = 0;
    let failed = 0;
    let skipped = 0;

    // Process all guardians in parallel
    await Promise.all(guardianAccountHashes.map(async (guardianHash) => {
        try {
            // Skip the initiator (they already know about the recovery)
            if (initiatorAccountHash && guardianHash.toLowerCase() === initiatorAccountHash.toLowerCase()) {
                console.log(`Skipping initiator: ${shortenHash(guardianHash)}`);
                skipped++;
                return;
            }

            // Look up guardian's email by account hash
            const email = await getEmailByAccountHash(guardianHash);
            if (!email) {
                console.log(`No email for guardian account hash: ${shortenHash(guardianHash)}`);
                skipped++;
                return;
            }

            // Deduplicate emails
            if (sentEmails.has(email)) {
                console.log(`Skipping duplicate email for ${shortenHash(guardianHash)}: ${email}`);
                skipped++;
                return;
            }
            sentEmails.add(email);

            console.log(`Found email for guardian ${shortenHash(guardianHash)}: ${email.substring(0, 3)}***`);

            // Build and send email
            const { html, text } = buildRecoveryNotificationEmail({
                targetAccount: targetAccountHex,
                newPublicKey: newPublicKeyHex,
                recoveryId,
            });

            const success = await sendEmail({
                to: email,
                subject: `🔐 Recovery Request - Action Required`,
                html,
                text,
            });

            if (success) {
                sent++;
            } else {
                failed++;
            }
        } catch (error) {
            console.error(`Error processing guardian ${shortenHash(guardianHash)}:`, error);
            failed++;
        }
    }));

    console.log(`Email results: sent=${sent}, failed=${failed}, skipped=${skipped}`);
    console.log('============================================\n');

    return { sent, failed, skipped };
}

/**
 * Get guardian public keys for an account from the contract
 */
export async function getGuardianPublicKeysForAccount(
    contractHash: string,
    targetAccountHex: string,
    casperService: any
): Promise<string[]> {
    try {
        const targetPubKey = CLPublicKey.fromHex(targetAccountHex);
        const targetAccountHash = targetPubKey.toAccountHash();
        const targetAccountHashHex = Buffer.from(targetAccountHash).toString('hex');
        const debugFormat = `AccountHash(${targetAccountHashHex})`;

        // Query guardians from contract dictionary
        const guardiansResult = await casperService.queryContractDictionary(
            contractHash, 'd', `g${debugFormat}`
        );

        const guardiansData = guardiansResult?.stored_value?.CLValue?.data;
        if (!guardiansData || !Array.isArray(guardiansData)) {
            return [];
        }

        // Guardians are stored as AccountHash bytes
        return guardiansData.map((g: any) => {
            if (typeof g === 'string') return g;
            if (Array.isArray(g)) return Buffer.from(g).toString('hex');
            if (g?.data) return Buffer.from(g.data).toString('hex');
            return Buffer.from(g).toString('hex');
        });
    } catch (error) {
        console.error('Error getting guardian public keys:', error);
        return [];
    }
}

/**
 * Verify SMTP connection
 */
export async function verifyEmailConnection(): Promise<boolean> {
    const transport = getTransporter();
    if (!transport) {
        return false;
    }

    try {
        await transport.verify();
        console.log('✓ SMTP connection verified');
        return true;
    } catch (error) {
        console.error('SMTP connection failed:', error);
        return false;
    }
}

export default {
    getEmailForPublicKey,
    notifyGuardiansOfRecovery,
    getGuardianPublicKeysForAccount,
    verifyEmailConnection,
};
