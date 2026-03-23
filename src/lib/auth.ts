import { create } from 'zustand';
import { supabase } from './supabase';
import type { User } from '@supabase/supabase-js';

interface AuthState {
  user: User | null;
  teamId: string | null;
  teamRole: string | null;
  loading: boolean;
  initialized: boolean;

  initialize: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<{ error?: string }>;
  signUp: (email: string, password: string, name: string) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
}

export const useAuth = create<AuthState>((set) => ({
  user: null,
  teamId: null,
  teamRole: null,
  loading: false,
  initialized: false,

  initialize: async () => {
    const { data: { session } } = await supabase.auth.getSession();

    if (session?.user) {
      set({ user: session.user });
      await loadTeam(session.user.id, set);
    }

    set({ initialized: true });

    // Listen for auth changes
    supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session?.user) {
        set({ user: session.user });
        await loadTeam(session.user.id, set);
      } else {
        set({ user: null, teamId: null, teamRole: null });
      }
    });
  },

  signIn: async (email, password) => {
    set({ loading: true });
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    set({ loading: false });
    if (error) return { error: error.message };
    return {};
  },

  signUp: async (email, password, name) => {
    set({ loading: true });

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { name } },
    });

    if (error) {
      set({ loading: false });
      return { error: error.message };
    }

    // Auto-create team + membership for new users
    if (data.user) {
      const { data: team, error: teamError } = await supabase
        .from('teams')
        .insert({ name: `${name}'s Team`, owner_id: data.user.id, plan: 'free' })
        .select('id')
        .single();

      if (team && !teamError) {
        await supabase.from('team_members').insert({
          team_id: team.id,
          user_id: data.user.id,
          role: 'admin',
        });
      }
    }

    set({ loading: false });
    return {};
  },

  signOut: async () => {
    await supabase.auth.signOut();
    set({ user: null, teamId: null, teamRole: null });
  },
}));

async function loadTeam(
  userId: string,
  set: (state: Partial<AuthState>) => void,
) {
  const { data } = await supabase
    .from('team_members')
    .select('team_id, role')
    .eq('user_id', userId)
    .limit(1)
    .single();

  if (data) {
    set({ teamId: data.team_id, teamRole: data.role });
  }
}
