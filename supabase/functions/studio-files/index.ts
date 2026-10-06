import { createClient } from 'npm:@supabase/supabase-js@2.116.0';
import { createFileHandler } from './handler.ts';
const secretKeys = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}');
const key = secretKeys.default || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
if (!key) throw new Error('Server storage key unavailable');
const admin = createClient(Deno.env.get('SUPABASE_URL')!,key,{auth:{persistSession:false,autoRefreshToken:false}});
Deno.serve(createFileHandler(admin));
