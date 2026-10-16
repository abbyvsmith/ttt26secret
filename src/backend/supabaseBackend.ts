import { createClient, type Session } from '@supabase/supabase-js';
import { ALLOWED_EMAIL_DOMAIN } from '../config';
import type { Backend, Completion, Me, SubmittedPhoto } from './types';

const thumbPathFor = (path: string) => path.replace(/\.jpg$/, '.thumb.jpg');

export function createSupabaseBackend(url: string, anonKey: string): Backend {
  const sb = createClient(url, anonKey);

  async function requireSession(): Promise<Session> {
    const { data } = await sb.auth.getSession();
    if (!data.session) throw new Error('You are signed out. Please sign in again.');
    return data.session;
  }

  async function loadMe(session: Session): Promise<Me> {
    const [player, organizer] = await Promise.all([
      sb.from('players').select('person_id').eq('user_id', session.user.id).maybeSingle(),
      sb.rpc('is_organizer'),
    ]);
    if (player.error) throw player.error;
    return {
      userId: session.user.id,
      email: session.user.email ?? '',
      personId: player.data?.person_id ?? null,
      isOrganizer: organizer.data === true,
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
            cb({
              userId: session.user.id,
              email: session.user.email ?? '',
              personId: null,
              isOrganizer: false,
            });
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

    async submitPhoto(taskId, photo, thumb, albumName) {
      const session = await requireSession();
      const userId = session.user.id;
      const path = `${userId}/${taskId}-${Date.now()}.jpg`;
      const photos = sb.storage.from('photos');

      const { data: previous } = await sb
        .from('completions')
        .select('storage_path')
        .eq('user_id', userId)
        .eq('task_id', taskId)
        .maybeSingle();

      for (const [p, blob] of [
        [path, photo],
        [thumbPathFor(path), thumb],
      ] as const) {
        const { error } = await photos.upload(p, blob, { contentType: 'image/jpeg' });
        if (error) throw error;
      }

      const { error } = await sb.from('completions').upsert({
        user_id: userId,
        task_id: taskId,
        person_id: null,
        album_name: albumName,
        storage_path: path,
      });
      if (error) throw error;

      // A re-upload replaces the old photo.
      const old = previous?.storage_path;
      if (old && old !== path) await photos.remove([old, thumbPathFor(old)]);
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

    async getAllPhotos() {
      const { data, error } = await sb
        .from('completions')
        .select('task_id, user_id, album_name, storage_path, completed_at, players(people(name))')
        .not('storage_path', 'is', null)
        .order('completed_at');
      if (error) throw error;

      const paths = data.flatMap((r) => [r.storage_path!, thumbPathFor(r.storage_path!)]);
      const urls = new Map<string, string>();
      for (let i = 0; i < paths.length; i += 100) {
        const { data: signed, error: signError } = await sb.storage
          .from('photos')
          .createSignedUrls(paths.slice(i, i + 100), 60 * 60);
        if (signError) throw signError;
        signed.forEach((s) => s.path && s.signedUrl && urls.set(s.path, s.signedUrl));
      }

      return data.map((r): SubmittedPhoto => {
        const player = r.players as unknown as { people: { name: string } | null } | null;
        const full = urls.get(r.storage_path!) ?? '';
        return {
          taskId: r.task_id,
          userId: r.user_id,
          playerName: player?.people?.name ?? 'unknown',
          albumName: r.album_name,
          completedAt: r.completed_at,
          fullUrl: full,
          // Fall back to the full photo if a preview is missing.
          thumbUrl: urls.get(thumbPathFor(r.storage_path!)) || full,
        };
      });
    },
  };
}
