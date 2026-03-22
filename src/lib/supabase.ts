import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL ?? 'http://localhost:54321';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? '';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

/**
 * Get the current authenticated user's ID.
 * Returns null if not logged in.
 */
export async function getCurrentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

/**
 * Get the current user's team membership.
 */
export async function getCurrentTeam(): Promise<{ teamId: string; role: string } | null> {
  const userId = await getCurrentUserId();
  if (!userId) return null;

  const { data } = await supabase
    .from('team_members')
    .select('team_id, role')
    .eq('user_id', userId)
    .limit(1)
    .single();

  return data ? { teamId: data.team_id, role: data.role } : null;
}
