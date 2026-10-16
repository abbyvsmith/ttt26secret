import { createClient, type Session } from '@supabase/supabase-js';
import { ALLOWED_EMAIL_DOMAIN } from '../config';
import type { Backend, Completion, Me } from './types';

export function createSupabaseBackend(url: string, anonKey: string): Backend {
  const sb = createClient(url, anonKey);

  async function requireSession(): Promise<Session> {
    const { data } = await sb.auth.getSession();
    if (!data.session) throw new Error('You are signed out. Please sign in again.');
    return data.session;
  }

  async function loadMe(session: Session): Promise<Me> {
    const { data, error } = await sb
      .from('players')
      .select('person_id')
      .eq('user_id', session.user.id)
      .maybeSingle();
    if (error) throw error;
    return {
      userId: session.user.id,
      email: session.user.email ?? '',
      personId: data?.person_id ?? null,
    };
  }

  return {
    isDemo: false,

    onAuthChange(cb) {
      const { data } = sb.auth.onAuthStateChange((_event, session) => {
        // Supabase recommends not awaiting other calls inside this callback.
        setTimeout(() => {
          if (!session) return cb(null);
          loadMe(session).then(cb, (e) => {
            console.error(e);
            cb({ userId: session.user.id, email: session.user.email ?? '', personId: null });
          });
        }, 0);
      });
      return () => data.subscription.unsubscribe();
    },

    async signIn() {
      const { error } = await sb.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin,
          queryParams: { hd: ALLOWED_EMAIL_DOMAIN, prompt: 'select_account' },
        },
      });
      if (error) throw error;
    },

    async signOut() {
      await sb.auth.signOut();
    },

    async getPeople() {
      const { data, error } = await sb.from('people').select('id, name').order('sort');
      if (error) throw error;
      return data;
    },

    async getClaimedPersonIds() {
      const { data, error } = await sb.from('players').select('person_id');
      if (error) throw error;
      return data.map((r) => r.person_id as number);
    },

    async claimPerson(personId) {
      const session = await requireSession();
      const { error } = await sb.from('players').insert({
        user_id: session.user.id,
        person_id: personId,
        email: session.user.email,
      });
      if (error) {
        if (error.code === '23505') throw new Error('Someone already picked that name.');
        throw error;
      }
      return loadMe(session);
    },

    async getMyCompletions() {
      const session = await requireSession();
      const { data, error } = await sb
        .from('completions')
        .select('task_id, person_id, album_name, storage_path, completed_at')
        .eq('user_id', session.user.id);
      if (error) throw error;

      const paths = data.map((r) => r.storage_path).filter((p): p is string => !!p);
      const urls = new Map<string, string>();
      if (paths.length) {
        const { data: signed } = await sb.storage.from('photos').createSignedUrls(paths, 60 * 60);
        signed?.forEach((s) => s.path && s.signedUrl && urls.set(s.path, s.signedUrl));
      }

      return data.map(
        (r): Completion => ({
          taskId: r.task_id,
          personId: r.person_id,
          albumName: r.album_name,
          photoUrl: r.storage_path ? (urls.get(r.storage_path) ?? null) : null,
          completedAt: r.completed_at,
        }),
      );
    },

    async savePersonAnswer(taskId, personId) {
      const session = await requireSession();
      const { error } = await sb
        .from('completions')
        .upsert({ user_id: session.user.id, task_id: taskId, person_id: personId });
      if (error) throw error;
    },

    async submitPhoto(taskId, photo, albumName) {
      const session = await requireSession();
      const path = `${session.user.id}/${taskId}-${Date.now()}.jpg`;
      const { error } = await sb.storage
        .from('photos')
        .upload(path, photo, { contentType: 'image/jpeg' });
      if (error) throw error;

      const res = await fetch('/api/submit-photo', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ taskId, storagePath: path, albumName }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? `Upload failed (${res.status})`);
      }
    },

    async getLeaderboard() {
      const { data, error } = await sb.rpc('leaderboard');
      if (error) throw error;
      return (data as Record<string, unknown>[]).map((r) => ({
        userId: r.user_id as string,
        name: r.name as string,
        personDone: r.person_done as number,
        photoDone: r.photo_done as number,
        points: r.points as number,
        lastScoredAt: r.last_scored_at as string | null,
      }));
    },
  };
}
