const SUPABASE_URL = "https://cawcndrseochyanolcce.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_gzJWw6NAyxQX0h7kvK6MZQ_qh6FnaQ_";

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
window.supabaseClient = supabase;
