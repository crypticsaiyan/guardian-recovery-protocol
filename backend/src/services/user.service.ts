import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { CLPublicKey } from 'casper-js-sdk';

// Supabase configuration - loaded lazily
// Use service role key for backend (bypasses RLS)
const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '';

// Lazy-loaded Supabase client
let supabaseClient: SupabaseClient | null = null;

function getSupabaseClient(): SupabaseClient | null {
    if (!supabaseUrl || !supabaseKey) {
        console.warn('⚠️ Supabase credentials not configured. Email features will not work.');
        return null;
    }

    if (!supabaseClient) {
        supabaseClient = createClient(supabaseUrl, supabaseKey);
    }

    return supabaseClient;
}

/**
 * Convert public key to account hash hex (lowercase for consistent matching)
 */
function publicKeyToAccountHash(publicKeyHex: string): string {
    try {
        const publicKey = CLPublicKey.fromHex(publicKeyHex);
        const accountHash = publicKey.toAccountHash();
        // Store as lowercase for consistent matching with contract data
        return Buffer.from(accountHash).toString('hex').toLowerCase();
    } catch (error) {
        console.error('Error converting public key to account hash:', error);
        return '';
    }
}

export interface UserRecord {
    public_key: string;
    account_hash?: string;
    email: string | null;
    created_at?: string;
}

/**
 * Check if a user has already submitted their email
 * @param publicKey - The user's public key
 * @returns Object with hasEmail boolean and email if exists
 */
export const checkUserEmail = async (publicKey: string): Promise<{
    hasEmail: boolean;
    email?: string;
}> => {
    try {
        const supabase = getSupabaseClient();
        if (!supabase) {
            return { hasEmail: false };
        }

        const { data, error } = await supabase
            .from('user')
            .select('email')
            .eq('public_key', publicKey)
            .single();

        if (error) {
            // PGRST116 means no rows found, which is expected for new users
            if (error.code === 'PGRST116') {
                return { hasEmail: false };
            }
            console.error('Error checking user email:', error);
            throw error;
        }

        return {
            hasEmail: !!data?.email,
            email: data?.email || undefined
        };
    } catch (error) {
        console.error('Error in checkUserEmail:', error);
        throw error;
    }
};

/**
 * Validate email format with comprehensive checks
 * @param email - Email to validate
 * @returns Object with isValid boolean and error message if invalid
 */
const validateEmail = (email: string): { isValid: boolean; error?: string } => {
    // Trim and normalize
    const trimmedEmail = email.trim().toLowerCase();

    // Check if empty
    if (!trimmedEmail) {
        return { isValid: false, error: 'Email is required' };
    }

    // Check length (RFC 5321 limits)
    if (trimmedEmail.length > 254) {
        return { isValid: false, error: 'Email is too long (max 254 characters)' };
    }

    // Comprehensive email regex
    // Validates: local-part@domain.tld
    const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

    if (!emailRegex.test(trimmedEmail)) {
        return { isValid: false, error: 'Invalid email format' };
    }

    // Check for valid parts
    const [localPart, domain] = trimmedEmail.split('@');

    // Local part checks
    if (!localPart || localPart.length > 64) {
        return { isValid: false, error: 'Invalid email: local part is too long' };
    }

    if (localPart.startsWith('.') || localPart.endsWith('.')) {
        return { isValid: false, error: 'Invalid email: cannot start or end with a dot' };
    }

    if (localPart.includes('..')) {
        return { isValid: false, error: 'Invalid email: cannot have consecutive dots' };
    }

    // Domain checks
    if (!domain || domain.length < 3) {
        return { isValid: false, error: 'Invalid email: domain is too short' };
    }

    // Must have at least one dot in domain (e.g., example.com)
    if (!domain.includes('.')) {
        return { isValid: false, error: 'Invalid email: domain must have a TLD' };
    }

    // Get TLD and validate
    const tld = domain.split('.').pop();
    if (!tld || tld.length < 2) {
        return { isValid: false, error: 'Invalid email: TLD is too short' };
    }

    // Check for common typos
    const commonTypos: { [key: string]: string } = {
        'gmial.com': 'gmail.com',
        'gmal.com': 'gmail.com',
        'gamil.com': 'gmail.com',
        'gnail.com': 'gmail.com',
        'hotmal.com': 'hotmail.com',
        'hotmial.com': 'hotmail.com',
        'outlok.com': 'outlook.com',
        'outloo.com': 'outlook.com',
        'yahooo.com': 'yahoo.com',
        'yaho.com': 'yahoo.com',
    };

    if (commonTypos[domain]) {
        return {
            isValid: false,
            error: `Did you mean ${localPart}@${commonTypos[domain]}?`
        };
    }

    return { isValid: true };
};

/**
 * Submit or update user email
 * @param publicKey - The user's public key
 * @param email - The email to associate with the public key
 * @returns Success status
 */
export const submitUserEmail = async (publicKey: string, email: string): Promise<{
    success: boolean;
    message: string;
}> => {
    try {
        // Validate email format
        const validation = validateEmail(email);
        if (!validation.isValid) {
            return { success: false, message: validation.error || 'Invalid email format' };
        }

        const supabase = getSupabaseClient();
        if (!supabase) {
            return { success: false, message: 'Email service not configured' };
        }

        // Calculate account hash from public key for lookup by guardians
        const accountHash = publicKeyToAccountHash(publicKey);

        // Use upsert to insert or update the user record
        const { error } = await supabase
            .from('user')
            .upsert(
                {
                    public_key: publicKey,
                    account_hash: accountHash,
                    email: email
                },
                {
                    onConflict: 'public_key'
                }
            );

        if (error) {
            console.error('Error submitting user email:', error);
            return { success: false, message: error.message };
        }

        return { success: true, message: 'Email submitted successfully' };
    } catch (error) {
        console.error('Error in submitUserEmail:', error);
        return {
            success: false,
            message: error instanceof Error ? error.message : 'Unknown error occurred'
        };
    }
};

/**
 * Get email by account hash (for looking up guardian emails)
 * @param accountHashHex - The account hash hex string
 * @returns email if found, null otherwise
 */
export const getEmailByAccountHash = async (accountHashHex: string): Promise<string | null> => {
    try {
        const supabase = getSupabaseClient();
        if (!supabase) {
            return null;
        }

        const { data, error } = await supabase
            .from('user')
            .select('email')
            .eq('account_hash', accountHashHex)
            .single();

        if (error || !data?.email) {
            return null;
        }

        return data.email;
    } catch (error) {
        console.error('Error getting email by account hash:', error);
        return null;
    }
};

export default {
    checkUserEmail,
    submitUserEmail
};
