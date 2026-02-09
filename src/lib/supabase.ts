// Supabase client for server-side operations
import { createClient, SupabaseClient } from '@supabase/supabase-js';

if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL environment variable');
}
if (!process.env.SUPABASE_SECRET_KEY) {
    throw new Error('Missing SUPABASE_SECRET_KEY environment variable');
}

// Secret-key client — full access, bypasses RLS, server-side only
export function createServiceClient(): SupabaseClient {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SECRET_KEY!,
        {
            auth: { persistSession: false },
        },
    );
}

// Singleton for reuse within the same request
let _serviceClient: SupabaseClient | null = null;

export function getServiceClient(): SupabaseClient {
    if (!_serviceClient) {
        _serviceClient = createServiceClient();
    }
    return _serviceClient;
}

export type { SupabaseClient };
