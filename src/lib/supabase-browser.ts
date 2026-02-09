// Supabase client for browser-side operations (read-only, publishable key)
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY!;

export const supabaseBrowser = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false },
});
