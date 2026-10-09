import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();

export const PROJECT_IMAGES_BUCKET = 'project-images';

const isValidSupabaseUrl = (() => {
  if (!supabaseUrl) return false;
  try {
    const parsedUrl = new URL(supabaseUrl);
    return parsedUrl.protocol === 'https:' || ['localhost', '127.0.0.1', '[::1]'].includes(parsedUrl.hostname);
  } catch {
    return false;
  }
})();

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey && isValidSupabaseUrl);

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl!, supabaseAnonKey!, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
      },
    })
  : null;

export const getProjectImageUrl = (image?: string) => {
  if (!image) return undefined;
  if (image.startsWith('data:') || /^https?:\/\//i.test(image)) return image;
  if (!supabase) return undefined;

  return supabase.storage.from(PROJECT_IMAGES_BUCKET).getPublicUrl(image).data.publicUrl;
};

/** Upload legacy/local data URLs to object storage before saving the project row. */
export const saveProjectImage = async (image: string | undefined, userId: string) => {
  if (!image?.startsWith('data:image/')) return image;
  if (!supabase) throw new Error('Supabase is not configured.');

  const response = await fetch(image);
  const file = await response.blob();
  const path = `${userId}/${crypto.randomUUID()}.jpg`;
  const { error } = await supabase.storage
    .from(PROJECT_IMAGES_BUCKET)
    .upload(path, file, { contentType: 'image/jpeg', upsert: false });

  if (error) throw error;
  return path;
};
