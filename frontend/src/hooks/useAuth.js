import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';

const toAppUser = (supaUser) => {
  if (!supaUser) return null;
  return {
    id: supaUser.id,
    email: supaUser.email,
    name:
      supaUser.user_metadata?.name ||
      supaUser.user_metadata?.full_name ||
      supaUser.email?.split('@')[0] ||
      'User',
  };
};

export const useAuth = () => {
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session ?? null);
      setUser(toAppUser(data.session?.user ?? null));
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession ?? null);
      setUser(toAppUser(newSession?.user ?? null));
      setLoading(false);
    });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  const login = async ({ email, password }) => {
    try {
      setLoading(true);
      setError(null);
      const { data, error: sbError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (sbError) throw sbError;
      setSession(data.session);
      setUser(toAppUser(data.user));
      return { success: true };
    } catch (err) {
      const message = err.message || 'Login failed';
      setError(message);
      return { success: false, error: message };
    } finally {
      setLoading(false);
    }
  };

  const register = async ({ name, email, password }) => {
    try {
      setLoading(true);
      setError(null);
      const { data, error: sbError } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { name } },
      });
      if (sbError) throw sbError;
      // If email confirmation is on, session may be null — still success
      setSession(data.session ?? null);
      setUser(toAppUser(data.user ?? data.session?.user ?? null));
      return { success: true };
    } catch (err) {
      const message = err.message || 'Registration failed';
      setError(message);
      return { success: false, error: message };
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.error('Logout error:', err);
    } finally {
      setSession(null);
      setUser(null);
    }
  };

  return {
    user,
    session,
    loading,
    error,
    login,
    register,
    logout,
    isAuthenticated: !!session,
  };
};
