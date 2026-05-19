import { supabase } from '../config/db.js';

export const requireAuth = async (req, res, next) => {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;

    if (!token) {
      return res.status(401).json({ success: false, message: 'Missing access token' });
    }

    const { data, error } = await supabase.auth.getUser(token);

    if (error || !data?.user) {
      return res.status(401).json({ success: false, message: 'Invalid or expired token' });
    }

    req.user = data.user;
    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Unauthorized', error: err.message });
  }
};
