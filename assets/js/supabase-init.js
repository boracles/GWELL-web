const SUPABASE_URL = "https://cawcndrseochyanolcce.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_gzJWw6NAyxQX0h7kvK6MZQ_qh6FnaQ_";

if (!window.supabase) {
  console.error(
    '❌ Supabase UMD가 로드되지 않았습니다. HTML의 <script src="...supabase.js"> 순서를 확인하세요.'
  );
}

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

window.supabaseClient = supabase;
console.log("✅ Supabase client 초기화 완료", supabase);
