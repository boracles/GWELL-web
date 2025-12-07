// assets/js/market.js

// ====== 기본 설정 ======
const TICK_INTERVAL_MS = 5000;
const ISSUE_CHANGE_EVERY = 12;

let tick = 0;
let currentIssue = null;

// 메인으로 보여줄 자산 (첫 번째 자산 기준)
const MAIN_ASSET_INDEX = 0;

// DOM (이슈/상태/티커 + 통계용)
let tickInfoEl, issueTagEl, issueTextEl, weightListEl;
let tickerIdEl, tickerPriceEl, tickerDeltaEl, tickerRateEl, tickerSubEl;
let tickerMetaEl;
let statOpenEl, statHighEl, statLowEl, stat52HighEl, stat52LowEl;
let stripIdEl, stripRefEl, marketTimeEl;
let metricPurityEl, metricEfficiencyEl, metricContributionEl, metricLevelEl;
let comparisonBodyEl;
let metricDiversityEl, metricBenefitEl, metricRiskEl;

// 캔들 차트 + 인디케이터 데이터
let priceChart;
let candleData = [];
const MAX_CANDLES = 120;

let lineData = [];

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
    if (chart.config.type !== "candlestick") return;

    const ds = chart.data.datasets[0];
    if (!ds || !ds.data || ds.data.length === 0) return;

    const last = ds.data[ds.data.length - 1];
    if (last == null || last.c == null) return;

    const yScale = chart.scales.y;
    const y = yScale.getPixelForValue(last.c);
    const xRight = chart.chartArea.right;

    const ctx = chart.ctx;
    const label = formatNumber(last.c); // 기존 formatNumber 사용

    ctx.save();
    ctx.font = "11px -apple-system, system-ui, sans-serif";
    const textWidth = ctx.measureText(label).width;
    const paddingX = 6;
    const paddingY = 3;
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

// ====== 자산 값 업데이트 ======
function updateAssetValues(issue) {
  assets.forEach((asset) => {
    asset.prevValue = asset.value;

    const themeWeight = issue.weightMap[asset.theme] ?? 0;
    const baseNoise = (Math.random() - 0.5) * 4; // -2 ~ +2
    const issueImpact = themeWeight * 5;

    const delta = baseNoise + issueImpact;
    asset.value = Math.max(1, asset.value + delta);
  });
}

// ====== 티커 렌더 ======
function computeChangeRate(asset) {
  const prev = asset.prevValue || asset.value;
  const delta = asset.value - prev;
  const rate = prev !== 0 ? (delta / prev) * 100 : 0;
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

  tickerSubEl.textContent = "장내 자산 실시간 상장 상태.";

  statOpenEl.textContent = firstOpen !== null ? formatNumber(firstOpen) : "-";
  statHighEl.textContent = globalHigh !== null ? formatNumber(globalHigh) : "-";
  statLowEl.textContent = globalLow !== null ? formatNumber(globalLow) : "-";
  stat52HighEl.textContent =
    globalHigh !== null ? formatNumber(globalHigh) : "-";
  stat52LowEl.textContent = globalLow !== null ? formatNumber(globalLow) : "-";
}

// ====== 스캔 파라미터(정제율/효율/기여도/등급) ======
function computeScanParams(asset) {
  // D, B, P 를 이용한 대략적인 매핑
  const purity = Math.round(
    (asset.D * 0.4 + asset.B * 0.3 + (1 - asset.P) * 0.3) * 100
  );

  const efficiency = (asset.value / 100).toFixed(2);

  let contributionScore = (asset.P * 0.6 + asset.D * 0.2 + asset.B * 0.2) * 100;
  let contribution;
  if (contributionScore > 85) contribution = "A+";
  else if (contributionScore > 75) contribution = "A";
  else if (contributionScore > 65) contribution = "B+";
  else if (contributionScore > 55) contribution = "B";
  else contribution = "C";

  let level;
  if (asset.value > 130) level = "Lv4";
  else if (asset.value > 110) level = "Lv3";
  else if (asset.value > 90) level = "Lv2";
  else level = "Lv1";

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

  // 거래 등급 (Lv4 최고, Lv1 최저)
  if (m.level === "Lv4" || m.level === "Lv3") {
    metricLevelEl.classList.add("metric-good");
  } else if (m.level === "Lv1") {
    metricLevelEl.classList.add("metric-bad");
  } else {
    metricLevelEl.classList.add("metric-warn");
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
      ` · 사회 기여도 ${m.contribution} · 거래 등급 ${m.level}`;
  }
}

function renderComparisonTable() {
  if (!comparisonBodyEl) return;

  comparisonBodyEl.innerHTML = "";

  // 1) 현재 자산 배열을 복사해서
  const rows = assets
    .map((asset) => {
      const m = computeScanParams(asset);
      const delta = asset.value - asset.prevValue;
      const deltaLabel = (delta >= 0 ? "+" : "") + formatNumber(delta);

      let deltaClass = "neutral";
      if (delta > 0.05) deltaClass = "up";
      else if (delta < -0.05) deltaClass = "down";

      return {
        asset,
        m,
        delta,
        deltaLabel,
        deltaClass,
      };
    })
    // 2) Value 기준으로 내림차순 정렬 (가치 높은 순)
    .sort((a, b) => b.asset.value - a.asset.value)
    // 3) 화면에 보여줄 최대 줄 수만 남기기 (예: 8줄)
    .slice(0, 8); // ← 여기 숫자 조절하면 화면에 보이는 줄 수 조정 가능

  rows.forEach((row) => {
    const { asset, m, deltaLabel, deltaClass } = row;
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${asset.id}</td>
      <td>${asset.name}</td>
      <td class="val">${formatNumber(asset.value)}</td>
      <td class="val ${deltaClass}">${deltaLabel}</td>
      <td>${asset.theme}</td>
      <td>${m.contribution}</td>
      <td>${m.level}</td>
    `;
    comparisonBodyEl.appendChild(tr);
  });
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

function renderIssue(issue) {
  if (!issueTagEl || !issueTextEl) return;
  issueTagEl.textContent = issue.tag;
  issueTextEl.textContent = issue.text;
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

  // 🔹 첫 번째 캔들 + 첫 번째 라인 포인트
  candleData = [
    {
      x: tick,
      o: v,
      h: v,
      l: v,
      c: v,
    },
  ];
  lineData = [
    {
      x: tick,
      y: v, // 종가 라인
    },
  ];

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
            up: "#4ade80",
            down: "#f97373",
            unchanged: "#e5e7eb",
          },
          borderColor: "#e5e7eb",
        },
        {
          type: "line", // 🔹 위에 그려질 라인
          label: "Close",
          data: lineData,
          borderColor: "#facc15", // 노란 라인 (원하면 바꿔도 됨)
          borderWidth: 1.5,
          pointRadius: 0,
          tension: 0, // 0 = 직선, 0.3 정도 주면 살짝 곡선
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: false,
        },
      },
      scales: {
        x: {
          type: "linear",
          ticks: { display: false },
          grid: { display: false },
        },
        y: {
          ticks: {
            color: "#e5e7eb",
          },
          grid: {
            color: "rgba(148,163,184,0.3)",
          },
        },
      },
    },
  });
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

  // 캔들 데이터
  candleData.push({
    x: tick,
    o: open,
    h: high,
    l: low,
    c: close,
  });
  if (candleData.length > MAX_CANDLES) {
    candleData.shift();
  }

  // 🔹 라인 데이터 (close 기준)
  lineData.push({
    x: tick,
    y: close,
  });
  if (lineData.length > MAX_CANDLES) {
    lineData.shift();
  }
}

function updatePriceChart() {
  if (!priceChart) return;
  priceChart.data.datasets[0].data = candleData; // 캔들
  priceChart.data.datasets[1].data = lineData; // 🔹 라인
  priceChart.update("none");
}

// ====== 인디케이터 차트 (정상성 지수) ======
function computeNormalityIndex(asset) {
  // D(다양성), B(유익), P(유해)를 조합한 0~100 지수
  const normB = asset.B;
  const normP = 1 - asset.P;
  const idealD = 0.6;
  const normD = 1 - Math.min(Math.abs(asset.D - idealD) / idealD, 1); // 0~1

  let idx = (normB * 0.4 + normP * 0.4 + normD * 0.2) * 100;
  if (idx < 0) idx = 0;
  if (idx > 100) idx = 100;
  return idx;
}

function initIndicatorChart() {
  const canvas = document.getElementById("indicatorChart");
  if (!canvas) return;

  const asset = getMainAsset();
  const firstIdx = computeNormalityIndex(asset);

  indicatorData = [{ x: tick, y: firstIdx }];

  const ctx = canvas.getContext("2d");

  indicatorChart = new Chart(ctx, {
    type: "line",
    data: {
      datasets: [
        {
          data: indicatorData,
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
      plugins: {
        legend: { display: false },
      },
      scales: {
        x: {
          type: "linear",
          ticks: { display: false },
          grid: { display: false },
        },
        y: {
          min: 0,
          max: 100,
          ticks: {
            color: "#e5e7eb",
            font: { size: 9 },
          },
          grid: {
            color: "rgba(148,163,184,0.25)",
          },
        },
      },
    },
  });
}

function appendIndicatorPoint() {
  const asset = getMainAsset();
  const idx = computeNormalityIndex(asset);
  indicatorData.push({ x: tick, y: idx });
  if (indicatorData.length > MAX_INDICATOR_POINTS) {
    indicatorData.shift();
  }
}

function updateIndicatorChart() {
  if (!indicatorChart) return;
  indicatorChart.data.datasets[0].data = indicatorData;
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
  updateIndicatorChart();
}

// ====== 초기화 ======
function init() {
  tickInfoEl = document.getElementById("tickInfo"); // 없어도 무방
  issueTagEl = document.getElementById("issueTag");
  issueTextEl = document.getElementById("issueText");
  weightListEl = document.getElementById("weightList"); // 없으면 생략

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

  metricDiversityEl = document.getElementById("metricDiversity"); // 🔹 추가
  metricBenefitEl = document.getElementById("metricBenefit"); // 🔹 추가
  metricRiskEl = document.getElementById("metricRisk");

  comparisonBodyEl = document.getElementById("comparisonBody"); // ✅ 추가

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

  // 초기 이슈/티커/파라미터/차트 세팅
  currentIssue = pickNewIssue(null);
  renderIssue(currentIssue);
  renderWeights(currentIssue);
  renderTicker();
  renderScanParams();
  renderComparisonTable();
  initPriceChart();
  initIndicatorChart();

  setInterval(step, TICK_INTERVAL_MS);
}

document.addEventListener("DOMContentLoaded", init);
