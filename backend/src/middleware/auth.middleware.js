import { supabase } from '../config/db.js';
import { authFailureGuard } from './rate-limit.middleware.js';

/**
 * Sends a 401 unless this IP has exhausted its failed-authentication budget,
 * in which case the guard has already sent a 429 with retry information.
 */
const rejectAuth = async (req, res, message) => {
  try {
    const allowed = await authFailureGuard(req, res);
    if (!allowed) return;
  } catch (error) {
    console.error('[auth] failure guard error:', error?.message || error);
  }
  return res.status(401).json({ success: false, message });
};

export const requireAuth = async (req, res, next) => {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;

    if (!token) {
      return rejectAuth(req, res, 'Missing access token');
    }

    const { data, error } = await supabase.auth.getUser(token);

    if (error || !data?.user) {
      return rejectAuth(req, res, 'Invalid or expired token');
    }

    // Identity always comes from the verified token, never from the request
    // body/query/headers. Downstream code must only use req.user.id.
    req.user = data.user;
    return next();
  } catch (err) {
    return rejectAuth(req, res, 'Unauthorized');
  }
};
