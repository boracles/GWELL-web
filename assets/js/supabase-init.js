// Supabase UMD 스크립트가 이미 로드된 상태에서 실행된다고 가정

// TODO: 네 프로젝트 값으로 바꿔 넣기
const SUPABASE_URL = "https://YOUR-PROJECT.supabase.co";
const SUPABASE_ANON_KEY = "YOUR_ANON_KEY";

if (!window.supabase) {
  console.error("Supabase UMD가 로드되지 않았습니다.");
}

const { createClient } = window.supabase;

// 전역에서 재사용할 클라이언트
window.supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
