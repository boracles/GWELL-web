// assets/js/market.js

// ====== 기본 설정 ======
const TICK_INTERVAL_MS = 5000;
const ISSUE_CHANGE_EVERY = 3;

let tick = 0;
let currentIssue = null;

// 메인으로 보여줄 자산 (첫 번째 자산 기준)
const MAIN_ASSET_INDEX = 0;

// DOM (이슈/상태/티커 + 통계용)
let tickInfoEl, issueTagEl, issueTextEl, weightListEl;
let tickerIdEl, tickerPriceEl, tickerDeltaEl, tickerRateEl, tickerSubEl;
let statOpenEl, statHighEl, statLowEl, stat52HighEl, stat52LowEl;
let stripIdEl, stripRefEl, marketTimeEl;

// 캔들 차트 데이터
let priceChart;
let candleData = [];
const MAX_CANDLES = 120;

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
];

// ====== 이슈(뉴스) 데이터 ======
const issues = [
  {
    id: "ISSUE-01",
    tag: "돌봄 위기 심화",
    text: "장시간 돌봄 부담과 가족 내 돌봄 불균형이 사회적 의제로 부상했습니다.",
    weightMap: { 돌봄: 0.9, 생산성: -0.3, "순응/정상성": -0.4, 저항: 0.4 },
  },
  {
    id: "ISSUE-02",
    tag: "성과 중심 평가 강화",
    text: "성과 중심 인사제도와 과도한 경쟁이 다시 강화되고 있습니다.",
    weightMap: { 생산성: 0.8, 돌봄: -0.4, "순응/정상성": 0.3, 저항: -0.3 },
  },
  {
    id: "ISSUE-03",
    tag: "정상가족 담론 논쟁",
    text: "정상가족 규범과 다양한 가족 형태에 대한 사회적 논쟁이 심화되고 있습니다.",
    weightMap: { "순응/정상성": 0.7, 저항: 0.6, 돌봄: 0.2 },
  },
  {
    id: "ISSUE-04",
    tag: "연대와 파업",
    text: "노동·젠더·환경 이슈를 둘러싼 연대와 파업이 이어지고 있습니다.",
    weightMap: { 저항: 0.9, 생산성: -0.5, "순응/정상성": -0.4 },
  },
  // ... 나머지 ISSUE-05 ~ ISSUE-30 그대로 유지 ...
  {
    id: "ISSUE-30",
    tag: "정상성에서 밀려난 장",
    text: "병원 수치상으로는 ‘정상’이지만 일상적 불편과 고통을 호소하는 사람들이 늘고 있습니다.",
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

// 숫자 포맷
function formatNumber(num) {
  return num.toFixed(2);
}

function getMainAsset() {
  return assets[MAIN_ASSET_INDEX];
}

// 노이즈 포함 자산 값 업데이트
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

  tickerIdEl.textContent = `ID ${asset.id}`;
  if (stripIdEl) stripIdEl.textContent = `ID ${asset.id}`;

  tickerPriceEl.textContent = formatNumber(asset.value);

  const { delta, rate } = computeChangeRate(asset);
  const deltaStr = (delta >= 0 ? "+" : "") + formatNumber(delta);
  const rateStr = (rate >= 0 ? "+" : "") + rate.toFixed(2) + "%";

  tickerDeltaEl.textContent = deltaStr;
  tickerRateEl.textContent = rateStr;

  tickerDeltaEl.classList.remove("up", "down");
  if (delta > 0.05) tickerDeltaEl.classList.add("up");
  else if (delta < -0.05) tickerDeltaEl.classList.add("down");

  tickerSubEl.textContent = "장내 자산 실시간 상장 상태.";

  statOpenEl.textContent = firstOpen !== null ? formatNumber(firstOpen) : "-";
  statHighEl.textContent = globalHigh !== null ? formatNumber(globalHigh) : "-";
  statLowEl.textContent = globalLow !== null ? formatNumber(globalLow) : "-";
  stat52HighEl.textContent =
    globalHigh !== null ? formatNumber(globalHigh) : "-";
  stat52LowEl.textContent = globalLow !== null ? formatNumber(globalLow) : "-";
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

  candleData = [
    {
      x: tick,
      o: v,
      h: v,
      l: v,
      c: v,
    },
  ];

  const ctx = canvas.getContext("2d");

  priceChart = new Chart(ctx, {
    type: "candlestick",
    data: {
      datasets: [
        {
          label: asset.id,
          data: candleData,
          color: {
            up: "#4ade80",
            down: "#f97373",
            unchanged: "#e5e7eb",
          },
          borderColor: "#e5e7eb",
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
          type: "linear", // 🔑 여기!
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

// 매 틱마다 새 캔들 추가
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
}

function updatePriceChart() {
  if (!priceChart) return;
  priceChart.data.datasets[0].data = candleData;
  priceChart.update("none");
}

// ====== 메인 루프 ======
function step() {
  tick++;

  // 이슈 변경
  if (tick === 1 || tick % ISSUE_CHANGE_EVERY === 0) {
    currentIssue = pickNewIssue(currentIssue);
    renderIssue(currentIssue);
    renderWeights(currentIssue);
  }

  // 자산 값 업데이트
  if (currentIssue) {
    updateAssetValues(currentIssue);
  }

  // 메인 자산 기준으로 캔들 추가
  appendCandle();

  // 렌더
  renderTick();
  renderTicker();
  updatePriceChart();
}

// ====== 초기화 ======
function init() {
  tickInfoEl = document.getElementById("tickInfo");
  issueTagEl = document.getElementById("issueTag");
  issueTextEl = document.getElementById("issueText");
  weightListEl = document.getElementById("weightList"); // 없어도 됨

  tickerIdEl = document.getElementById("tickerId");
  tickerPriceEl = document.getElementById("tickerPrice");
  tickerDeltaEl = document.getElementById("tickerDelta");
  tickerRateEl = document.getElementById("tickerRate");
  tickerSubEl = document.getElementById("tickerSub");

  statOpenEl = document.getElementById("statOpen");
  statHighEl = document.getElementById("statHigh");
  statLowEl = document.getElementById("statLow");
  stat52HighEl = document.getElementById("stat52High");
  stat52LowEl = document.getElementById("stat52Low");

  stripIdEl = document.getElementById("stripId");
  stripRefEl = document.getElementById("stripRef");
  marketTimeEl = document.getElementById("marketTime");

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

  // 초기 이슈/티커/차트 세팅
  currentIssue = pickNewIssue(null);
  renderIssue(currentIssue);
  renderWeights(currentIssue);
  renderTicker();
  initPriceChart();

  setInterval(step, TICK_INTERVAL_MS);
}

document.addEventListener("DOMContentLoaded", init);
