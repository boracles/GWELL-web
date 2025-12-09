// assets/js/market.js

// ====== 기본 설정 ======

const GRID_Y_TICKS_PRICE = 12; // 위 캔들 차트 가로 그리드 개수
const GRID_Y_TICKS_BOTTOM = 6;

const AXIS_FONT_FAMILY =
  "'futura-pt','Sweet',-apple-system,BlinkMacSystemFont,system-ui,sans-serif";

const AXIS_FONT = {
  size: 10, // ← 숫자 크기(축 숫자용). 9~11 사이에서 네 눈에 맞게 조절 가능
  family: AXIS_FONT_FAMILY,
};

const TICK_INTERVAL_MS = 5000;
const ISSUE_CHANGE_EVERY = 12;

const db = window.supabaseClient;

const RIGHT_AXIS_WIDTH = 52;

let tick = 0;
let currentIssue = null;

const COLOR_UP = "#0D7C64"; // 초록 (상승)
const COLOR_DOWN = "#80233B"; // 빨강 (하락)
const COLOR_UNCHANGED = "#FAF2E5";

// 메인으로 보여줄 자산 (첫 번째 자산 기준)
const MAIN_ASSET_INDEX = 0;

const GRID_X_STEP = 10; // 세로 그리드 간격 (x축 값 10단위마다)
const GRID_Y_TICKS = 6; // y축 가로 그리드 줄 개수

// DOM (이슈/상태/티커 + 통계용)
let tickInfoEl, issueTagEl, issueTextEl, weightListEl;
let tickerIdEl, tickerPriceEl, tickerDeltaEl, tickerRateEl, tickerSubEl;
let tickerMetaEl;
let statOpenEl, statHighEl, statLowEl, stat52HighEl, stat52LowEl;
let stripIdEl, stripRefEl, marketTimeEl;
let metricPurityEl, metricEfficiencyEl, metricContributionEl, metricLevelEl;
let comparisonBodyEl;
let metricDiversityEl, metricBenefitEl, metricRiskEl;
let volumeChart;

// 캔들 차트 + 인디케이터 데이터
let priceChart;
let candleData = [];
const MAX_CANDLES = 120;

let lineData = [];
let volumeData = [];

let indicatorChart;
let indicatorData = [];
const MAX_INDICATOR_POINTS = 120;

// 52주(실제로는 전체 기간) 통계
let globalHigh = null;
let globalLow = null;
let firstOpen = null;

// ====== 자산 & 이슈 데이터 ======
const THEMES = ["돌봄", "생산성", "순응/정상성", "저항"];

const assets = [
  {
    id: "GA-01",
    name: "장시간 노동에 시달리는 장",
    theme: "생산성",
    value: 100,
    prevValue: 100,
    D: 0.6,
    B: 0.4,
    P: 0.2,
  },
  {
    id: "GA-02",
    name: "돌봄 과부하 장",
    theme: "돌봄",
    value: 95,
    prevValue: 95,
    D: 0.5,
    B: 0.6,
    P: 0.7,
  },
  {
    id: "GA-03",
    name: "정상성에 적응한 장",
    theme: "순응/정상성",
    value: 110,
    prevValue: 110,
    D: 0.7,
    B: 0.5,
    P: 0.3,
  },
  {
    id: "GA-04",
    name: "저항하는 장",
    theme: "저항",
    value: 88,
    prevValue: 88,
    D: 0.4,
    B: 0.5,
    P: 0.8,
  },
  {
    id: "GA-05",
    name: "야근에 적응한 장",
    theme: "생산성",
    value: 102,
    prevValue: 102,
    D: 0.55,
    B: 0.45,
    P: 0.35,
  },
  {
    id: "GA-06",
    name: "돌봄을 나누는 장",
    theme: "돌봄",
    value: 97,
    prevValue: 97,
    D: 0.65,
    B: 0.55,
    P: 0.4,
  },
  {
    id: "GA-07",
    name: "정상성에서 벗어난 장",
    theme: "순응/정상성",
    value: 92,
    prevValue: 92,
    D: 0.5,
    B: 0.35,
    P: 0.6,
  },
  {
    id: "GA-08",
    name: "조용히 저항하는 장",
    theme: "저항",
    value: 90,
    prevValue: 90,
    D: 0.45,
    B: 0.5,
    P: 0.7,
  },
  {
    id: "GA-09",
    name: "성과에 최적화된 장",
    theme: "생산성",
    value: 115,
    prevValue: 115,
    D: 0.7,
    B: 0.5,
    P: 0.25,
  },
  {
    id: "GA-10",
    name: "돌봄을 포기한 장",
    theme: "돌봄",
    value: 85,
    prevValue: 85,
    D: 0.4,
    B: 0.45,
    P: 0.55,
  },
  {
    id: "GA-11",
    name: "완벽한 정상성을 추구하는 장",
    theme: "순응/정상성",
    value: 118,
    prevValue: 118,
    D: 0.6,
    B: 0.6,
    P: 0.2,
  },
  {
    id: "GA-12",
    name: "불안하지만 살아있는 장",
    theme: "저항",
    value: 93,
    prevValue: 93,
    D: 0.5,
    B: 0.4,
    P: 0.75,
  },
];

// ✅ Supabase에서 최신 프로필 1개 불러와서 assets[0]에 적용
async function syncMainAssetFromSupabase() {
  if (!db) return;

  const { data, error } = await db
    .from("profiles")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(1);

  if (error) {
    console.error("load latest profile error:", error);
    return;
  }
  if (!data || data.length === 0) return;

  const row = data[0];
  const main = assets[MAIN_ASSET_INDEX];

  // social_score(0~1)를 가격 대역으로 매핑
  const score = row.social_score ?? 0.5;
  const priceBase = 100;
  const priceSpan = 40;
  const price = priceBase + (score - 0.5) * priceSpan;

  const scanLabel = row.profile_label || main.id;

  main.id = scanLabel; // 티커에 찍힐 ID
  main.name = "장내 자산 상장 프로파일"; // 필요하면 다른 문구로 바꿔도 됨
  main.value = price;
  main.prevValue = price;

  // D/B/P 도 덮어쓰기
  main.D = row.diversity ?? main.D;
  main.B = row.benefit ?? main.B;
  main.P = row.pathology ?? main.P;

  // 🔹 스캔 결과의 효율, 사회 적응도도 같이 보관
  main.E = row.efficiency ?? main.E; // scan.js의 profile.EEE
  main.socialIndex = row.social_score ?? main.socialIndex; // scan.js의 sni
}

// ====== 이슈(뉴스) 데이터 ======
const issues = [
  {
    id: "ISSUE-01",
    tag: "돌봄 위기 심화",
    text: "치매 부모와 초등 자녀를 동시에 돌보는 이른바 ‘샌드위치 케어’ 가구가 늘어나며, 돌봄 부담을 이유로 퇴사하거나 근무시간을 줄이는 보호자 비율이 대도시를 중심으로 빠르게 증가하고 있습니다.",
    weightMap: { 돌봄: 0.9, 생산성: -0.4, "순응/정상성": -0.3, 저항: 0.3 },
  },
  {
    id: "ISSUE-02",
    tag: "성과 중심 평가 강화",
    text: "대형 IT·금융사를 중심으로 매출·성과 지표를 연봉과 인사고과에 직접 연동하는 제도가 확대되면서, 실적 압박과 야근 증가를 호소하는 익명 게시글과 내부 상담 요청이 급증하고 있습니다.",
    weightMap: { 생산성: 0.8, 돌봄: -0.5, "순응/정상성": 0.3, 저항: -0.3 },
  },
  {
    id: "ISSUE-03",
    tag: "정상가족 담론 논쟁",
    text: "학교 생활기록부·보험 약관·공공기관 신청서에서 여전히 ‘부모 2인 정상가족’만 기본값으로 표기되자, 한부모·비혼·재구성 가족 당사자들이 표현 개선과 기준 개정을 요구하는 집단 민원을 잇따라 제기하고 있습니다.",
    weightMap: { "순응/정상성": 0.7, 저항: 0.6, 돌봄: 0.2 },
  },
  {
    id: "ISSUE-04",
    tag: "연대와 파업",
    text: "간호·돌봄·물류·교육 등 필수 노동 영역에서 임금·휴식·안전 문제를 둘러싼 동시다발 파업과 공동 기자회견이 이어지며, 장시간 노동 구조 전반에 대한 재조정 요구가 전국으로 확산되고 있습니다.",
    weightMap: { 저항: 0.9, 생산성: -0.5, "순응/정상성": -0.4 },
  },
  {
    id: "ISSUE-05",
    tag: "야간 돌봄 공백",
    text: "야간 어린이집과 24시간 돌봄센터 수가 수요를 따라가지 못하면서 밤 근무를 하는 보호자들이 친척·이웃 돌봄에 의존하거나 아이를 집에 혼자 두는 사례가 급증해 안전 우려가 커지고 있습니다.",
    weightMap: { 돌봄: 0.8, 생산성: -0.3, "순응/정상성": -0.2, 저항: 0.2 },
  },
  {
    id: "ISSUE-06",
    tag: "재택근무 회수 논란",
    text: "코로나19 이후 정착됐던 재택·유연근무제를 일괄 회수하는 기업들이 늘어나면서, 돌봄·통근시간 부담이 다시 커졌다는 직원들의 반발과 단체 행동 움직임이 일부 업종에서 감지되고 있습니다.",
    weightMap: { 생산성: 0.5, 돌봄: -0.4, "순응/정상성": 0.4, 저항: 0.3 },
  },
  {
    id: "ISSUE-07",
    tag: "플랫폼 노동 불안정",
    text: "배달·대리운전·콘텐츠 제작 등 플랫폼 노동자들이 산재·보험·최저보장 없이 알고리즘에 의해 배정과 평가를 통제받고 있다며, 최소 수입 보장과 휴식 권리를 요구하는 집단 행동에 나섰습니다.",
    weightMap: { 생산성: 0.6, 저항: 0.7, "순응/정상성": -0.4 },
  },
  {
    id: "ISSUE-08",
    tag: "노키즈존 논쟁 재점화",
    text: "카페·식당·펜션 등에서 아동 출입을 제한하는 이른바 ‘노키즈존’ 표시가 다시 확산되자, 보호자와 아동 인권 단체가 차별적 영업 관행이라며 대응 가이드라인 제정을 촉구하고 있습니다.",
    weightMap: { 돌봄: 0.6, "순응/정상성": 0.3, 저항: 0.5 },
  },
  {
    id: "ISSUE-09",
    tag: "실적 압박에 건강 이상",
    text: "분기 목표 달성을 위해 야근과 주말 근무를 반복하던 일부 영업·영업지원 조직에서 위장 질환·수면 장애 진단을 받는 직원이 늘어나며, 회사 차원의 건강 관리 대책 요구가 제기되고 있습니다.",
    weightMap: { 생산성: 0.7, 돌봄: 0.3, "순응/정상성": 0.2 },
  },
  {
    id: "ISSUE-10",
    tag: "청년 주거 불안",
    text: "전·월세 가격 상승과 대출 규제로 인해 원룸·고시원·쉐어하우스 등 열악한 주거 환경에 머무는 청년이 늘어나면서, 과밀 거주와 불규칙한 식사·수면 패턴으로 인한 건강 악화 우려가 커지고 있습니다.",
    weightMap: { 저항: 0.4, "순응/정상성": -0.2, 돌봄: 0.3 },
  },
  {
    id: "ISSUE-11",
    tag: "장애인 활동지원 축소 논란",
    text: "지자체 예산 조정으로 장애인 활동지원 시간이 일부 축소되자, 혼자서는 기본적인 생활이 어려운 당사자들이 일상과 노동 현장 모두에서 즉각적인 돌봄 공백을 호소하고 있습니다.",
    weightMap: { 돌봄: 0.9, 저항: 0.5, "순응/정상성": -0.5 },
  },
  {
    id: "ISSUE-12",
    tag: "감정노동 보호 미비",
    text: "콜센터·병원·공항·민원 창구 등 대면·전화 응대업에서 욕설·폭언을 경험했다는 감정노동자들이 여전히 많지만, 인력 충원과 휴식 제도는 제자리 걸음을 이어가고 있다는 지적이 나옵니다.",
    weightMap: { 생산성: 0.4, 돌봄: 0.4, 저항: 0.6 },
  },
  {
    id: "ISSUE-13",
    tag: "육아휴직 사용 격차",
    text: "법적으로는 남녀 모두 육아휴직이 가능하지만, 중소기업·비정규직 노동자 사이에서는 눈치·대체 인력 부재 등의 이유로 휴직 사용률이 여전히 낮아 제도가 사실상 유명무실하다는 비판이 제기됩니다.",
    weightMap: { 돌봄: 0.8, "순응/정상성": 0.3, 저항: 0.4 },
  },
  {
    id: "ISSUE-14",
    tag: "24시간 편의점 알바 과로",
    text: "인력 감축으로 야간 편의점 한 명 근무가 일상화되면서 취객 대응·물류 정리·청소를 혼자 처리해야 하는 상황이 이어져, 과로와 안전사고 위험에 대한 문제 제기가 계속되고 있습니다.",
    weightMap: { 생산성: 0.6, 저항: 0.5, 돌봄: 0.2 },
  },
  {
    id: "ISSUE-15",
    tag: "학교 밖 청소년 증가",
    text: "입시 중심 학교 생활에 적응하지 못하는 학생들이 자퇴 또는 장기 결석을 선택하는 사례가 늘어나면서, 대안 교육과 지역 돌봄 체계가 이를 따라가지 못하고 있다는 지적이 나오고 있습니다.",
    weightMap: { 저항: 0.5, "순응/정상성": -0.5, 돌봄: 0.4 },
  },
  {
    id: "ISSUE-16",
    tag: "노인 단독가구 고립",
    text: "도시·농촌을 불문하고 홀로 사는 노인 단독가구 비율이 상승하면서, 병원·마트·약국 외에 정기적으로 사람을 만날 수 있는 장소가 거의 없다는 ‘고립 보고’가 복지센터를 통해 다수 접수되고 있습니다.",
    weightMap: { 돌봄: 0.9, "순응/정상성": -0.3 },
  },
  {
    id: "ISSUE-17",
    tag: "성과급 차등 지급 갈등",
    text: "동일 부서 내부에서도 성과급이 크게 차등 지급되자 평가 기준의 불투명성을 지적하는 구성원들의 반발이 거세지고, 일부 조직에서는 인사제도 개선 태스크포스를 요구하는 움직임이 나타나고 있습니다.",
    weightMap: { 생산성: 0.7, 저항: 0.6, "순응/정상성": -0.4 },
  },
  {
    id: "ISSUE-18",
    tag: "감시 기술 도입 확대",
    text: "근무 시간·화면 사용·대화 내용 등을 자동 모니터링하는 이른바 ‘근태·행동 분석 시스템’이 도입되면서, 직원들은 업무 효율화라는 명목 아래 사생활 침해와 상시 감시에 대한 불안을 호소하고 있습니다.",
    weightMap: { 생산성: 0.8, "순응/정상성": 0.5, 저항: 0.5 },
  },
  {
    id: "ISSUE-19",
    tag: "사교육 의존 심화",
    text: "내신·수능·비교과 준비를 위해 초등 시기부터 사교육에 의존하는 가정이 늘어나며, 학부모의 경제·정신적 부담과 아동의 수면·놀이 시간 부족 문제가 중첩되고 있다는 분석이 나옵니다.",
    weightMap: { "순응/정상성": 0.6, 생산성: 0.4, 돌봄: 0.3 },
  },
  {
    id: "ISSUE-20",
    tag: "기후위기와 노동 강도",
    text: "연이은 폭염·폭우 속에서도 실외 건설·물류·배달업에서는 작업 중단 기준이 제대로 지켜지지 않아, 열사병·탈진·호흡기 질환 등 건강 피해가 현장에서 반복되고 있다는 지적이 제기되고 있습니다.",
    weightMap: { 생산성: 0.5, 저항: 0.6, 돌봄: 0.4 },
  },
  {
    id: "ISSUE-21",
    tag: "정규직·비정규직 격차 고착",
    text: "같은 공간에서 같은 일을 하면서도 정규직과 비정규직 사이 임금·복지·승진 기회 차이가 유지되자, 당사자들은 ‘같은 팀 내 이중 구조’라며 차별 해소를 위한 제도 개선을 요구하고 있습니다.",
    weightMap: { 저항: 0.7, "순응/정상성": -0.5 },
  },
  {
    id: "ISSUE-22",
    tag: "돌봄 노동의 가족 내 전가",
    text: "가정 내 돌봄·집안일의 상당 부분이 여전히 특정 가족 구성원에게 집중되면서, ‘집안의 일도 노동’이라는 인식과 돌봄 비용의 사회적 분담 필요성이 다시 논의되고 있습니다.",
    weightMap: { 돌봄: 0.8, 저항: 0.4, "순응/정상성": -0.3 },
  },
  {
    id: "ISSUE-23",
    tag: "야간 응급실 대기 장기화",
    text: "야간·주말 시간대 응급실 인력 부족과 병상 부족으로, 환자와 보호자들이 복도와 대기실에 장시간 머무르는 상황이 반복되며 돌봄 피로와 의료 불신이 동시에 커지고 있습니다.",
    weightMap: { 돌봄: 0.7, 생산성: -0.2, 저항: 0.3 },
  },
  {
    id: "ISSUE-24",
    tag: "청소년 정신건강 악화",
    text: "입시·관계·미래 불안 등 복합 요인으로 청소년 우울·불안 진료 건수가 증가하는 가운데, 학교·지역사회 상담 인력과 안전한 쉼터는 수요를 따라가지 못하고 있다는 지적이 이어집니다.",
    weightMap: { 돌봄: 0.8, 저항: 0.4, "순응/정상성": -0.3 },
  },
  {
    id: "ISSUE-25",
    tag: "비자발적 1인 가구 증가",
    text: "이혼·실직·가족 갈등 등으로 인해 원하지 않는 1인 가구 상태에 놓인 이들이 늘어나면서, 식생활·수면 패턴·사회적 관계가 모두 불안정해지는 ‘복합 불안정층’이 형성되고 있다는 분석이 나옵니다.",
    weightMap: { 저항: 0.5, "순응/정상성": -0.4, 돌봄: 0.4 },
  },
  {
    id: "ISSUE-26",
    tag: "AI 평가 시스템 실험",
    text: "일부 기업에서 채용·성과·승진 심사에 AI 분석 도구를 시범 도입하자, 직원들 사이에서는 편의성 강화 기대와 함께 ‘기계가 사람을 걸러낸다’는 불안과 불신이 동시에 제기되고 있습니다.",
    weightMap: { 생산성: 0.7, "순응/정상성": 0.4, 저항: 0.6 },
  },
  {
    id: "ISSUE-27",
    tag: "지역 돌봄센터 격차",
    text: "같은 도시 안에서도 동네에 따라 돌봄센터·복지관·공공놀이터 유무가 크게 갈리면서, 돌봄과 여가 접근성이 거주지에 의해 결정되는 ‘돌봄 인프라 양극화’가 나타나고 있습니다.",
    weightMap: { 돌봄: 0.9, "순응/정상성": -0.3 },
  },
  {
    id: "ISSUE-28",
    tag: "주 4일제 시범 도입",
    text: "일부 기업과 지방자치단체가 선택적 주 4일제를 시범 도입한 결과, 업무 집중도와 만족도는 상승했지만 장시간 노동 문화가 강한 업종에서는 ‘낮은 평가’ 우려로 참여를 망설이는 분위기도 감지되고 있습니다.",
    weightMap: { 생산성: 0.5, 돌봄: 0.5, "순응/정상성": 0.2, 저항: 0.3 },
  },
  {
    id: "ISSUE-29",
    tag: "공장 자동화 전환 가속",
    text: "제조업 현장에서 인건비 절감과 효율성을 이유로 자동화 설비 도입이 가속화되면서, 반복 작업에서 해방되는 긍정적 평가와 함께 일자리를 잃을 수 있다는 불안이 동시에 확산되고 있습니다.",
    weightMap: { 생산성: 0.9, 저항: 0.5, "순응/정상성": 0.3 },
  },
  {
    id: "ISSUE-30",
    tag: "정상성에서 밀려난 장",
    text: "정밀 건강검진에서는 ‘정상’ 판정을 받았지만 만성 피로·복부 불편·수면장애를 호소하는 시민들이 온라인 커뮤니티와 병원 외래에 몰리며, 수치로 설명되지 않는 장기 이상 사례가 잇따르고 있습니다.",
    weightMap: { "순응/정상성": 0.2, 저항: 0.7, 돌봄: 0.5 },
  },
];

// ====== 유틸 ======
function randomChoice(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function pickNewIssue(prevIssue) {
  if (!prevIssue) return randomChoice(issues);
  let candidate;
  do {
    candidate = randomChoice(issues);
  } while (candidate.id === prevIssue.id && issues.length > 1);
  return candidate;
}

function formatNumber(num) {
  return num.toFixed(2);
}

// ====== 오른쪽 끝 현재가 라벨 플러그인 ======
const lastValueLabelPlugin = {
  id: "lastValueLabel",
  afterDraw(chart, args, pluginOptions) {
    // candlestick 차트만 처리
    if (chart.config.type !== "candlestick") return;

    const ds = chart.data.datasets[0];
    if (!ds || !ds.data || ds.data.length === 0) return;

    const last = ds.data[ds.data.length - 1];
    if (!last || last.c == null) return;

    // 🔹 y 축 이름이 yPrice 이거나 y 일 수 있으니 안전하게 찾기
    const yScale =
      chart.scales["yPrice"] ||
      chart.scales["y"] ||
      Object.values(chart.scales)[0];

    if (!yScale) return; // 축 못 찾으면 그냥 스킵

    const y = yScale.getPixelForValue(last.c);
    const xRight = chart.chartArea.right;

    const ctx = chart.ctx;
    const label = formatNumber(last.c);

    ctx.save();
    ctx.font = `10px ${AXIS_FONT_FAMILY}`;
    const textWidth = ctx.measureText(label).width;
    const paddingX = 6;
    const boxWidth = textWidth + paddingX * 2;
    const boxHeight = 18;
    const boxX = xRight + 4;
    const boxY = y - boxHeight / 2;

    // 보라 박스
    ctx.fillStyle = "#4c1d95";
    ctx.strokeStyle = "#a855f7";
    ctx.lineWidth = 1;

    if (ctx.roundRect) {
      ctx.beginPath();
      ctx.roundRect(boxX, boxY, boxWidth, boxHeight, 6);
      ctx.fill();
      ctx.stroke();
    } else {
      ctx.fillRect(boxX, boxY, boxWidth, boxHeight);
      ctx.strokeRect(boxX, boxY, boxWidth, boxHeight);
    }

    // 텍스트
    ctx.fillStyle = "#e5e7eb";
    ctx.textBaseline = "middle";
    ctx.fillText(label, boxX + paddingX, y);

    ctx.restore();
  },
};

// Chart.js에 플러그인 등록
if (typeof Chart !== "undefined") {
  Chart.register(lastValueLabelPlugin);
}

function getMainAsset() {
  return assets[MAIN_ASSET_INDEX];
}

function clamp01(x) {
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}

// ✅ 뉴스에 따라 가격 + 정상성 지수 둘 다 움직이는 버전 (이거 하나만 남기기)
function updateAssetValues(issue) {
  assets.forEach((asset) => {
    asset.prevValue = asset.value;

    const themeWeight = issue.weightMap[asset.theme] ?? 0;

    // === 1) 가격 흔들림 ===
    const baseNoise = (Math.random() - 0.5) * 4;
    const issueImpact = themeWeight * 5;
    const delta = baseNoise + issueImpact;
    asset.value = Math.max(1, asset.value + delta);

    // === 2) 정상성 지수 drift ===
    if (typeof asset.socialIndex !== "number") {
      asset.socialIndex = asset.baseIndex ?? 0.5;
    }

    // 뉴스가 바뀔 때 강하게 튀게 만드는 스파이크
    const issueSpike = themeWeight * 0.15; // 15% 정도

    // tick마다 천천히 움직임
    const slowDrift = themeWeight * 0.02; // 기본 드리프트
    const noise = (Math.random() - 0.5) * 0.03; // 랜덤

    // Supabase에서 받은 기본 상태로 되돌리는 힘
    const base = asset.baseIndex ?? asset.socialIndex;
    const pullBack = (base - asset.socialIndex) * 0.01;

    let next = asset.socialIndex + issueSpike + slowDrift + noise + pullBack;

    asset.socialIndex = clamp01(next);
  });
}

// ✅ 정상성 지수를 0~100으로 만들어 주는 함수 (여기 반드시 있어야 함)
function computeNormalityIndex(asset) {
  // 스캔에서 계산한 socialIndex가 있으면 그걸 0~100으로 바로 사용
  if (typeof asset.socialIndex === "number") {
    let idx = asset.socialIndex * 100;
    if (idx < 0) idx = 0;
    if (idx > 100) idx = 100;
    return idx;
  }

  // fallback: Supabase 없이 돌아갈 때만 예전 로직 사용
  const normB = asset.B;
  const normP = 1 - asset.P;
  const idealD = 0.6;
  const normD = 1 - Math.min(Math.abs(asset.D - idealD) / idealD, 1); // 0~1

  let idx = (normB * 0.4 + normP * 0.4 + normD * 0.2) * 100;
  if (idx < 0) idx = 0;
  if (idx > 100) idx = 100;
  return idx;
}

// ====== 자산 값 변화율 계산 ======
function computeChangeRate(asset) {
  const prev = asset.prevValue || asset.value; // 이전 값 (없으면 현재 값)
  const delta = asset.value - prev; // 절대 변화량
  const rate = prev !== 0 ? (delta / prev) * 100 : 0; // 변화율 %

  return { delta, rate };
}

function renderTicker() {
  const asset = getMainAsset();
  if (!asset || !tickerIdEl) return;

  tickerIdEl.textContent = asset.id;
  if (stripIdEl) stripIdEl.textContent = `ID ${asset.id}`;

  tickerPriceEl.textContent = formatNumber(asset.value);

  const { delta, rate } = computeChangeRate(asset);
  const deltaStr = (delta >= 0 ? "+" : "") + formatNumber(delta);
  const rateStr = (rate >= 0 ? "+" : "") + rate.toFixed(2) + "%";

  tickerDeltaEl.textContent = deltaStr;
  tickerRateEl.textContent = rateStr;

  // 등락에 따라 up/down 클래스 적용 (가격/퍼센트까지 같이)
  tickerDeltaEl.classList.remove("up", "down");
  tickerPriceEl.classList.remove("up", "down");
  tickerRateEl.classList.remove("up", "down");

  if (delta > 0.05) {
    tickerDeltaEl.classList.add("up");
    tickerPriceEl.classList.add("up");
    tickerRateEl.classList.add("up");
  } else if (delta < -0.05) {
    tickerDeltaEl.classList.add("down");
    tickerPriceEl.classList.add("down");
    tickerRateEl.classList.add("down");
  }
  tickerSubEl.textContent = "스캔 결과와 연동된 장내 자산 시세입니다.";

  statOpenEl.textContent = firstOpen !== null ? formatNumber(firstOpen) : "-";
  statHighEl.textContent = globalHigh !== null ? formatNumber(globalHigh) : "-";
  statLowEl.textContent = globalLow !== null ? formatNumber(globalLow) : "-";
  stat52HighEl.textContent =
    globalHigh !== null ? formatNumber(globalHigh) : "-";
  stat52LowEl.textContent = globalLow !== null ? formatNumber(globalLow) : "-";
}

// ====== 스캔 파라미터(정제율/효율/기여도/등급) ======
function computeScanParams(asset) {
  const p = asset.P ?? 0.5;
  const purity = Math.round((1 - p) * 100);

  const effRaw = typeof asset.E === "number" ? asset.E : asset.value / 100;
  const efficiency = effRaw.toFixed(2);

  const sni = typeof asset.socialIndex === "number" ? asset.socialIndex : 0.5;
  const score100 = Math.max(0, Math.min(1, sni)) * 100;

  // 🔹 “스캔 시점 등급” (고정용)
  let contribution;
  if (score100 >= 85) contribution = "A+";
  else if (score100 >= 70) contribution = "A";
  else if (score100 >= 55) contribution = "B+";
  else if (score100 >= 40) contribution = "B";
  else contribution = "C";

  // 🔥 레벨 = 사회 적응도 점수 (0~100) 숫자
  const level = Math.round(score100);

  return { purity, efficiency, contribution, level };
}

function renderScanParams() {
  const asset = getMainAsset();
  if (!asset || !metricPurityEl) return;

  const m = computeScanParams(asset);
  metricPurityEl.textContent = `${m.purity}%`;
  metricEfficiencyEl.textContent = m.efficiency;
  metricContributionEl.textContent = m.contribution;
  metricLevelEl.textContent = m.level;

  // 색 초기화
  [
    metricPurityEl,
    metricEfficiencyEl,
    metricContributionEl,
    metricLevelEl,
  ].forEach((el) => {
    el.classList.remove("metric-good", "metric-bad", "metric-warn");
  });

  // 정제율 기준 색
  if (m.purity >= 70) metricPurityEl.classList.add("metric-good");
  else if (m.purity < 40) metricPurityEl.classList.add("metric-bad");
  else metricPurityEl.classList.add("metric-warn");

  // 효율 (1.0 기준)
  const effVal = parseFloat(m.efficiency);
  if (effVal >= 1.1) metricEfficiencyEl.classList.add("metric-good");
  else if (effVal <= 0.9) metricEfficiencyEl.classList.add("metric-bad");
  else metricEfficiencyEl.classList.add("metric-warn");

  // 기여도 등급 (A+ > A > B+ > B > C)
  if (m.contribution === "A+" || m.contribution === "A") {
    metricContributionEl.classList.add("metric-good");
  } else if (m.contribution === "C") {
    metricContributionEl.classList.add("metric-bad");
  } else {
    metricContributionEl.classList.add("metric-warn");
  }

  // 🔥 사회 적응도 레벨(0~100) 숫자 기준 색
  const lvl = m.level; // 0~100

  if (lvl >= 70) {
    metricLevelEl.classList.add("metric-good"); // 안정 (초록)
  } else if (lvl < 40) {
    metricLevelEl.classList.add("metric-bad"); // 주의 (빨강)
  } else {
    metricLevelEl.classList.add("metric-warn"); // 경계 (노랑)
  }

  // --- 장내 원천 지표 D/B/P 표시 ---
  if (metricDiversityEl && metricBenefitEl && metricRiskEl) {
    const d = Math.round(asset.D * 100);
    const b = Math.round(asset.B * 100);
    const p = Math.round(asset.P * 100);

    metricDiversityEl.textContent = d + "%";
    metricBenefitEl.textContent = b + "%";
    metricRiskEl.textContent = p + "%";

    [metricDiversityEl, metricBenefitEl, metricRiskEl].forEach((el) => {
      el.classList.remove("metric-good", "metric-bad", "metric-warn");
    });

    // 다양성: 너무 낮거나 너무 높으면 불안정, 중간범위가 좋음
    if (d >= 50 && d <= 80) metricDiversityEl.classList.add("metric-good");
    else if (d < 30 || d > 90) metricDiversityEl.classList.add("metric-bad");
    else metricDiversityEl.classList.add("metric-warn");

    // 유익도: 높을수록 좋음
    if (b >= 70) metricBenefitEl.classList.add("metric-good");
    else if (b < 40) metricBenefitEl.classList.add("metric-bad");
    else metricBenefitEl.classList.add("metric-warn");

    // 위험도(P): 낮을수록 좋음
    if (p <= 20) metricRiskEl.classList.add("metric-good");
    else if (p >= 60) metricRiskEl.classList.add("metric-bad");
    else metricRiskEl.classList.add("metric-warn");
  }

  if (tickerMetaEl) {
    tickerMetaEl.textContent =
      `정제율 ${m.purity}% · 사회 효율 환산가 ${m.efficiency}` +
      ` · 사회 기여도 ${m.contribution} · 사회 적응도 지수 ${m.level}`;
  }
}

// 🔥 장내 5가지 사회 지표 중 "가장 높은 강점"을 계산하는 도우미들

// 5개 지표 점수 계산 (0~1로 환산)
function computeStrengthMetrics(asset) {
  const D = asset.D ?? 0.6;
  const B = asset.B ?? 0.5;
  const P = asset.P ?? 0.5;
  const E = typeof asset.E === "number" ? asset.E : (asset.value ?? 100) / 120; // 대사 효율 대충 value에서 환산

  // 🔹 정상성 스펙트럼: scan.js에서 쓰던 socialIndex 기준 비슷하게
  const normality = computeNormalityIndex(asset) / 100; // 0~1

  // 🔹 규범 순응도: 유익도(B)↑ + 위험도(P)↓
  const conformity = B * 0.7 + (1 - P) * 0.3;

  // 🔹 공동체 유지 에너지: 다양성이 너무 치우치지 않을 때 ↑
  const idealD = 0.6;
  const cohesion = 1 - Math.min(Math.abs(D - idealD) / idealD, 1); // 0~1

  // 🔹 사회 염증 지수: 염증이 낮을수록 강점이므로 (1 - P)
  const lowInflamm = 1 - P;

  // 🔹 사회 대사 효율: 에너지 효율(E)을 0~1로 클램프
  const metabolism = Math.max(0, Math.min(1, E));

  return { normality, conformity, cohesion, lowInflamm, metabolism };
}

// 이 자산의 "강점 지표 이름 + 퍼센트" 문자열 생성
// 이 자산의 "강점 지표 이름 + 퍼센트"를 분리해서 반환
function getStrongestMetric(asset) {
  const m = computeStrengthMetrics(asset);

  const defs = [
    { key: "normality", label: "정상성 스펙트럼" },
    { key: "conformity", label: "규범 순응도" },
    { key: "cohesion", label: "공동체 유지 에너지" },
    { key: "lowInflamm", label: "사회 염증 지수" },
    { key: "metabolism", label: "사회 대사 효율" },
  ];

  let best = defs[0];
  defs.forEach((d) => {
    if ((m[d.key] ?? 0) > (m[best.key] ?? 0)) best = d;
  });

  // 🔥 내부 점수(0~1)를 화면용 30~90%로 압축
  const raw = Math.max(0, Math.min(1, m[best.key] ?? 0)); // 0~1
  const score = Math.round(30 + raw * 60); // 30~90

  return {
    label: best.label, // 지표 이름
    score, // 숫자만 (정수)
  };
}

function renderComparisonTable() {
  if (!comparisonBodyEl) return;

  comparisonBodyEl.innerHTML = "";

  const mainAsset = getMainAsset();
  const mainId = mainAsset ? mainAsset.id : null;

  // 1) value 기준 정렬
  const sorted = assets
    .map((asset) => {
      const scan = computeScanParams(asset);
      const { delta } = computeChangeRate(asset);
      const deltaLabel = (delta >= 0 ? "+" : "") + formatNumber(delta);

      let deltaClass = "neutral";
      if (delta > 0.05) deltaClass = "up";
      else if (delta < -0.05) deltaClass = "down";

      return { asset, scan, deltaLabel, deltaClass };
    })
    .sort((a, b) => b.asset.value - a.asset.value);

  if (sorted.length === 0) return;

  // 🔥 현재 분포에서 상대 레벨(0~100) 계산용
  const maxVal = sorted[0].asset.value;
  const minVal = sorted[sorted.length - 1].asset.value;
  const span = Math.max(maxVal - minVal, 1);

  function getRelativeLevel(v) {
    return ((v - minVal) / span) * 100; // 0~100
  }

  // 2) 메인 ID 위치 찾기
  const mainIndex = mainId
    ? sorted.findIndex((row) => row.asset.id === mainId)
    : -1;

  const WINDOW_ROWS = 6;
  const HALF = Math.floor(WINDOW_ROWS / 2);

  let windowRows;
  if (mainIndex === -1) {
    windowRows = sorted.slice(0, WINDOW_ROWS);
  } else {
    let start = mainIndex - HALF;
    let end = mainIndex + HALF + 1;

    if (start < 0) {
      start = 0;
      end = Math.min(WINDOW_ROWS, sorted.length);
    } else if (end > sorted.length) {
      end = sorted.length;
      start = Math.max(0, end - WINDOW_ROWS);
    }

    windowRows = sorted.slice(start, end);
  }

  // 3) 테이블 렌더
  windowRows.forEach(({ asset, scan, deltaLabel, deltaClass }) => {
    const tr = document.createElement("tr");

    const isMain = asset.id === mainId;
    if (isMain) tr.classList.add("is-main-asset");

    // 🔹 강점 지표 (이름 + 숫자 분리)
    const strongest = getStrongestMetric(asset); // { label, score }

    // 🔹 스캔 시점 등급 (A+/A/B+/B/C 유지)
    const grade = asset.initialGrade || scan.contribution;

    // 🔹 상대 레벨 (현재 value 기준)
    const relLevel = getRelativeLevel(asset.value);

    // 🔹 레벨 색: 3등분 (0~33 / 33~66 / 66~100)
    let levelClass = "";
    if (relLevel >= 66) levelClass = "level-high";
    else if (relLevel >= 33) levelClass = "level-mid";
    else levelClass = "level-low";

    tr.innerHTML = `
      <td>${asset.id}</td>
      <td class="metric-cell">
        <span class="metric-label">${strongest.label}</span>
        <span class="metric-score">${strongest.score}%</span>
      </td>
      <td class="val val-price">${formatNumber(asset.value)}</td>
      <td class="val ${deltaClass}">${deltaLabel}</td>
      <td>${grade}</td>
      <td class="val ${levelClass}">${relLevel.toFixed(1)}</td>
    `;

    comparisonBodyEl.appendChild(tr);
  });
}

function buildIssueImpactSummary(issue) {
  if (!issue) return "";

  const up = [];
  const down = [];

  THEMES.forEach((theme) => {
    const w = issue.weightMap[theme] ?? 0;
    if (w > 0.1) up.push(theme); // 가치 상승
    else if (w < -0.1) down.push(theme); // 가치 하락
  });

  if (up.length === 0 && down.length === 0) return "";

  const parts = [];

  if (up.length > 0) {
    parts.push(
      `<span class="issue-impact-up" style="color:${COLOR_UP};">가치 상승: ${up.join(
        ", "
      )}</span>`
    );
  }
  if (down.length > 0) {
    parts.push(
      `<span class="issue-impact-down" style="color:${COLOR_DOWN};">가치 하락: ${down.join(
        ", "
      )}</span>`
    );
  }

  return parts.join(" · ");
}

function renderIssue(issue) {
  if (!issueTagEl || !issueTextEl) return;
  if (!issue) {
    issueTagEl.textContent = "";
    issueTextEl.textContent = "";
    return;
  }

  issueTagEl.textContent = issue.tag;

  const impactSummary = buildIssueImpactSummary(issue);

  // 🔥 뉴스 원문 + 영향 요약을 같이 표시 (요약은 색깔 span)
  if (impactSummary) {
    issueTextEl.innerHTML = `
      <span class="issue-main-text">${issue.text}</span>
      <span class="issue-impact-sep"> / </span>
      <span class="issue-impact">${impactSummary}</span>
    `;
  } else {
    // 영향 요약 없으면 기존처럼 텍스트만
    issueTextEl.textContent = issue.text;
  }
}

// ====== 이슈 / 상태 ======
function renderWeights(issue) {
  if (!weightListEl || !issue) return;
  weightListEl.innerHTML = "";

  THEMES.forEach((theme) => {
    const w = issue.weightMap[theme] ?? 0;
    const item = document.createElement("div");
    item.className = "weight-item";

    let labelClass = "weight--neutral";
    if (w > 0.1) labelClass = "weight--plus";
    else if (w < -0.1) labelClass = "weight--minus";

    item.innerHTML = `
      <div class="weight-theme">${theme}</div>
      <div class="weight-bar">
        <div class="weight-bar-fill ${labelClass}" style="--weight:${w};"></div>
      </div>
      <div class="weight-value">${w.toFixed(1)}</div>
    `;

    weightListEl.appendChild(item);
  });
}

function renderTick() {
  if (!tickInfoEl) return;
  tickInfoEl.textContent = `Tick: ${tick}`;
}

function initPriceChart() {
  const canvas = document.getElementById("priceChart");
  if (!canvas) return;

  const asset = getMainAsset();
  const v = asset.value;

  firstOpen = v;
  globalHigh = v;
  globalLow = v;

  // 초기 배열 비우기
  candleData = [];
  lineData = [];
  volumeData = [];

  const ctx = canvas.getContext("2d");

  priceChart = new Chart(ctx, {
    type: "candlestick",
    data: {
      datasets: [
        {
          type: "candlestick",
          label: asset.id,
          data: candleData,
          color: {
            up: COLOR_UP,
            down: COLOR_DOWN,
            unchanged: COLOR_UNCHANGED,
          },
          borderColor: "#e5e7eb",
          yAxisID: "yPrice",
        },
        {
          type: "line",
          label: "Close",
          data: lineData,
          borderColor: "#facc15",
          borderWidth: 2,
          pointRadius: 0,
          tension: 0.35,
          yAxisID: "yPrice",
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      layout: { padding: 0 },
      animation: {
        duration: 600,
        easing: "easeOutQuad",
      },
      plugins: {
        legend: { display: false },
      },
      scales: {
        x: {
          type: "linear",
          ticks: {
            display: false,
            stepSize: GRID_X_STEP, // ✅ 세로 그리드 위치 고정 (0,10,20,...)
          },
          grid: {
            color: "rgba(148,163,184,0.28)",
            drawOnChartArea: true,
          },
          offset: false,
          min: 0,
          max: 60,
        },
        yPrice: {
          position: "right",
          ticks: {
            color: "#FAF2E5",
            font: AXIS_FONT,
            count: GRID_Y_TICKS_PRICE, // ★ 12줄
          },
          grid: { color: "rgba(148,163,184,0.3)" },
          afterFit(scale) {
            scale.width = RIGHT_AXIS_WIDTH;
          },
        },
      },
    },
  });

  // 첫 캔들 하나 넣어서 바로 보이게
  appendCandle();
  updatePriceChart();
}

function appendCandle() {
  const asset = getMainAsset();
  const open = asset.prevValue;
  const close = asset.value;
  const baseHigh = Math.max(open, close);
  const baseLow = Math.min(open, close);
  const wiggle = Math.random() * 1.5;

  const high = baseHigh + wiggle;
  const low = baseLow - wiggle;

  globalHigh = globalHigh === null ? high : Math.max(globalHigh, high);
  globalLow = globalLow === null ? low : Math.min(globalLow, low);

  // 🔹 변화량 기준 의사 거래량 + 방향
  const { delta } = computeChangeRate(asset);
  const vol = Math.abs(delta) + 1;
  const dir = delta >= 0 ? "up" : "down";

  candleData.push({ x: tick, o: open, h: high, l: low, c: close });
  lineData.push({ x: tick, y: close });
  volumeData.push({ x: tick, y: vol, dir });

  if (candleData.length > MAX_CANDLES) candleData.shift();
  if (lineData.length > MAX_CANDLES) lineData.shift();
  if (volumeData.length > MAX_CANDLES) volumeData.shift();
}

function updatePriceChart() {
  if (!priceChart) return;

  priceChart.data.datasets[0].data = candleData; // 캔들
  priceChart.data.datasets[1].data = lineData; // 종가 라인

  if (candleData.length > 0) {
    const lastX = candleData[candleData.length - 1].x;
    const WINDOW = 60;

    const xScale = priceChart.options.scales.x;

    // 🔥 항상 0에서 시작, 오른쪽으로만 확장
    xScale.min = 0;
    xScale.max = Math.max(WINDOW, lastX + 1);
  }

  priceChart.update();
}

function initVolumeChart() {
  const canvas = document.getElementById("volumeChart");
  if (!canvas) return;

  const ctx = canvas.getContext("2d");

  volumeChart = new Chart(ctx, {
    type: "bar",
    data: {
      datasets: [
        {
          type: "bar",
          label: "Δ Volume",
          data: volumeData,
          yAxisID: "yVol",
          borderWidth: 0,
          barPercentage: 1.0,
          categoryPercentage: 1.0,
          backgroundColor: (ctx) => {
            const v = ctx.raw;
            if (!v) return "rgba(148,163,184,0.4)";
            return v.dir === "up" ? COLOR_UP : COLOR_DOWN;
          },
        },
        {
          type: "line",
          label: "Δ Line",
          data: volumeData,
          yAxisID: "yVol",
          borderColor: "#facc15",
          borderWidth: 1.5,
          pointRadius: 0,
          tension: 0.35,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      layout: { padding: 0 },
      plugins: {
        legend: { display: false },
      },
      scales: {
        x: {
          type: "linear",
          ticks: {
            display: false,
            stepSize: GRID_X_STEP, // ✅ 동일
          },
          grid: {
            color: "rgba(148,163,184,0.28)",
            drawOnChartArea: true,
          },
        },
        yVol: {
          position: "right",
          ticks: {
            display: true,
            color: "#FAF2E5",
            font: AXIS_FONT,
            count: GRID_Y_TICKS_BOTTOM, // ★ 6줄
          },
          grid: {
            color: "rgba(148,163,184,0.28)",
            drawOnChartArea: true, // ★ 가로 그리드 보이게
          },
          afterFit(scale) {
            scale.width = RIGHT_AXIS_WIDTH;
          },
        },
      },
    },
  });
}

function updateVolumeChart() {
  if (!volumeChart) return;

  volumeChart.data.datasets[0].data = volumeData; // 막대
  volumeChart.data.datasets[1].data = volumeData; // Δ 라인

  if (volumeData.length > 0) {
    const lastX = volumeData[volumeData.length - 1].x;
    const WINDOW = 60;
    const xScale = volumeChart.options.scales.x;

    // 🔥 위 그래프랑 동일하게: 0에서 시작, 오른쪽으로만 확장
    xScale.min = 0;
    xScale.max = Math.max(WINDOW, lastX + 1);
  }

  volumeChart.update("none");
}

function initIndicatorChart() {
  const canvas = document.getElementById("indicatorChart");
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  indicatorData = [];

  indicatorChart = new Chart(ctx, {
    type: "line",
    data: {
      datasets: [
        {
          data: indicatorData,
          yAxisID: "yIdx",
          borderWidth: 1.5,
          tension: 0.3,
          pointRadius: 0,
          fill: true,
          borderColor: "#8b5cf6",
          backgroundColor: "rgba(139, 92, 246, 0.18)",
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      layout: { padding: 0 },
      plugins: {
        legend: { display: false },
      },
      scales: {
        // ✅ 세로 그리드 x 위치를 위/아래랑 완전히 동일하게
        x: {
          type: "linear",
          ticks: {
            display: false,
            stepSize: GRID_X_STEP, // ★ 추가
          },
          grid: {
            color: "rgba(148,163,184,0.28)",
            drawOnChartArea: true,
          },
          // price / volume 처럼 업데이트에서 min/max를 건드리니까
          // 여기서 min/max는 안 줘도 됨
        },
        yIdx: {
          position: "right",
          min: 0,
          max: 100,
          ticks: {
            color: "#FAF2E5",
            font: AXIS_FONT,
            count: GRID_Y_TICKS_BOTTOM, // ★ 6줄
          },
          grid: {
            color: "rgba(148,163,184,0.25)",
          },
          afterFit(scale) {
            scale.width = RIGHT_AXIS_WIDTH;
          },
        },
      },
    },
  });
}

function appendIndicatorPoint() {
  const asset = getMainAsset();
  const idx = computeNormalityIndex(asset); // 0~100 지수

  indicatorData.push({
    x: tick,
    y: idx,
  });

  if (indicatorData.length > MAX_INDICATOR_POINTS) {
    indicatorData.shift();
  }
}

function updateIndicatorChart() {
  if (!indicatorChart) return;

  indicatorChart.data.datasets[0].data = indicatorData;

  if (indicatorData.length > 0) {
    const lastX = indicatorData[indicatorData.length - 1].x;
    const WINDOW = 60;
    const xScale = indicatorChart.options.scales.x;

    // 🔥 나머지 인디케이터도 동일한 타임라인
    xScale.min = 0;
    xScale.max = Math.max(WINDOW, lastX + 1);
  }

  indicatorChart.update("none");
}

// ====== 메인 루프 ======
function step() {
  tick++;

  // 이슈 변경
  if (tick % ISSUE_CHANGE_EVERY === 0) {
    currentIssue = pickNewIssue(currentIssue);
    renderIssue(currentIssue);
    renderWeights(currentIssue);
  }

  // 자산 값 업데이트
  if (currentIssue) {
    updateAssetValues(currentIssue);
  }

  // 캔들 & 인디케이터 데이터 추가
  appendCandle();
  appendIndicatorPoint();

  // 렌더
  renderTick();
  renderTicker();
  renderScanParams();
  renderComparisonTable();
  updatePriceChart();
  updateVolumeChart();
  updateIndicatorChart();
}

// ====== 초기화 ======
async function init() {
  tickInfoEl = document.getElementById("tickInfo"); // 없어도 무방
  issueTagEl = document.getElementById("issueTag");
  issueTextEl = document.getElementById("issueText");
  weightListEl = document.getElementById("weightList");

  tickerIdEl = document.getElementById("tickerId");
  tickerPriceEl = document.getElementById("tickerPrice");
  tickerDeltaEl = document.getElementById("tickerDelta");
  tickerRateEl = document.getElementById("tickerRate");
  tickerSubEl = document.getElementById("tickerSub");
  tickerMetaEl = document.getElementById("tickerMeta");

  statOpenEl = document.getElementById("statOpen");
  statHighEl = document.getElementById("statHigh");
  statLowEl = document.getElementById("statLow");
  stat52HighEl = document.getElementById("stat52High");
  stat52LowEl = document.getElementById("stat52Low");

  stripIdEl = document.getElementById("stripId");
  stripRefEl = document.getElementById("stripRef");
  marketTimeEl = document.getElementById("marketTime");

  metricPurityEl = document.getElementById("metricPurity");
  metricEfficiencyEl = document.getElementById("metricEfficiency");
  metricContributionEl = document.getElementById("metricContribution");
  metricLevelEl = document.getElementById("metricLevel");

  metricDiversityEl = document.getElementById("metricDiversity");
  metricBenefitEl = document.getElementById("metricBenefit");
  metricRiskEl = document.getElementById("metricRisk");

  comparisonBodyEl = document.getElementById("comparisonBody");

  // 상단 시간 표시
  if (marketTimeEl) {
    const updateTime = () => {
      const now = new Date();
      const t =
        now.getFullYear() +
        "." +
        String(now.getMonth() + 1).padStart(2, "0") +
        "." +
        String(now.getDate()).padStart(2, "0") +
        " " +
        String(now.getHours()).padStart(2, "0") +
        ":" +
        String(now.getMinutes()).padStart(2, "0");
      marketTimeEl.textContent = t;
    };
    updateTime();
    setInterval(updateTime, 1000);
  }

  // ✅ 먼저 Supabase에서 최신 스캔 결과로 assets[0] 덮어쓰기
  await syncMainAssetFromSupabase();

  // 🔥 스캔 시점 등급을 한번만 저장
  assets.forEach((asset) => {
    if (asset.initialGrade == null) {
      const m = computeScanParams(asset);
      asset.initialGrade = m.contribution; // A+/A/B+/B/C 고정
    }
  });

  // 그 다음 이슈/티커/파라미터/차트 세팅
  currentIssue = pickNewIssue(null);
  renderIssue(currentIssue);
  renderWeights(currentIssue);
  renderTicker();
  renderScanParams();
  renderComparisonTable();

  initPriceChart();
  initVolumeChart();
  initIndicatorChart();

  setInterval(step, TICK_INTERVAL_MS);
}

document.addEventListener("DOMContentLoaded", () => {
  init();
});
