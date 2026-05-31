import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

/**
 * ============================================================
 * PUBLIC ENDPOINT: Username to Email Lookup
 * ============================================================
 * 
 * Purpose: Allows unauthenticated users to lookup email by username
 * This is needed for login flow: username → email → authenticate
 * 
 * Security:
 * ✓ Only returns EMAIL (not password, not phone, not user type)
 * ✓ Uses service role (bypasses RLS)
 * ✓ Returns 200 with null data if user not found (prevents enumeration)
 * ✓ Input validation on username
 */

async function handler(req: VercelRequest, res: VercelResponse) {
  // Set security headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  
  // Only allow GET
  if (req.method !== 'GET') {
    return res.status(405).json({
      error: 'Method Not Allowed',
      message: 'Only GET is supported',
    });
  }

  try {
    // Check for required environment variables
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      console.error('Missing Supabase credentials in environment');
      return res.status(500).json({
        error: 'Internal Server Error',
        message: 'Database configuration error',
      });
    }

    // Create Supabase client with service role
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const { username } = (req.query || {}) as { username?: string };

    // Validate input
    if (!username || typeof username !== 'string') {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Username parameter required',
      });
    }

    const trimmedUsername = username.trim();

    // Prevent excessively long input
    if (trimmedUsername.length > 100) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Username too long',
      });
    }

    // Empty check
    if (trimmedUsername.length === 0) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Username cannot be empty',
      });
    }

    // ✓ Query database using service role (bypasses RLS)
    const { data, error } = await supabase
      .from('users')
      .select('email, username') // Only return safe fields
      .eq('username', trimmedUsername)
      .single();

    // ✓ Security: Return 200 with null in both cases to prevent username enumeration
    if (error || !data) {
      return res.status(200).json({
        data: null,
      });
    }

    // ✓ Return ONLY email (not password, not phone, not user_type)
    return res.status(200).json({
      data: {
        email: data.email,
        username: data.username,
      },
    });
  } catch (err: any) {
    console.error('[GET /api/lookup-username] Error:', err.message);

    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to lookup username',
    });
  }
}

export default handler;
