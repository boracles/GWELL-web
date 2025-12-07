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

// 캔들 차트 + 인디케이터 데이터
let priceChart;
let candleData = [];
const MAX_CANDLES = 120;

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
  // ... ISSUE-05 ~ ISSUE-29 생략 ...
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

// ====== 캔들 차트 ======
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
