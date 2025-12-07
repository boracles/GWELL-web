// assets/js/market.js

// ====== 기본 설정 ======
const TICK_INTERVAL_MS = 5000; // 5초마다 한 틱
const ISSUE_CHANGE_EVERY = 3; // 3틱마다 새로운 이슈

let tick = 0;
let currentIssue = null;

// DOM 참조
let tickInfoEl, issueTagEl, issueTextEl, marketBodyEl, weightListEl;

// ====== 자산 & 이슈 데이터 ======
// 테마: 예시로 잡아놓은 것들 (네 프로젝트에 맞게 이름 바꿔도 됨)
const THEMES = [
  "돌봄", // Care
  "생산성", // Productivity
  "순응/정상성", // Normativity
  "저항", // Resistance
];

// 장내 자산 (예시 데이터 – 자유롭게 수정 가능)
const assets = [
  {
    id: "GA-01",
    name: "장시간 노동에 시달리는 장",
    theme: "생산성",
    value: 100,
    prevValue: 100,
    D: 0.6, // Digestion
    B: 0.4, // Body
    P: 0.2, // Psyche
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

// 사회 이슈 세트
// weightMap: 각 테마에 얼마만큼 가중치가 걸리는지 (−1.0 ~ +1.0 정도 느낌)
const issues = [
  {
    id: "ISSUE-01",
    tag: "돌봄 위기",
    text: "장시간 돌봄 부담과 가족 내 돌봄 불균형이 사회적 의제로 부상했습니다.",
    weightMap: {
      돌봄: +0.9,
      생산성: -0.2,
      "순응/정상성": -0.3,
      저항: +0.2,
    },
  },
  {
    id: "ISSUE-02",
    tag: "성과 중심 평가 강화",
    text: "성과 중심 인사제도와 과도한 경쟁이 다시 강화되고 있습니다.",
    weightMap: {
      생산성: +0.8,
      돌봄: -0.4,
      "순응/정상성": +0.3,
      저항: -0.2,
    },
  },
  {
    id: "ISSUE-03",
    tag: "정상가족 담론 논쟁",
    text: "정상가족 규범과 다양한 가족 형태에 대한 사회적 논쟁이 심화되고 있습니다.",
    weightMap: {
      "순응/정상성": +0.6,
      저항: +0.5,
      돌봄: +0.2,
    },
  },
  {
    id: "ISSUE-04",
    tag: "연대와 파업",
    text: "노동·젠더·환경 이슈를 둘러싼 연대와 파업이 이어지고 있습니다.",
    weightMap: {
      저항: +0.9,
      생산성: -0.5,
      "순응/정상성": -0.4,
    },
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

// 노이즈 포함 자산 값 업데이트
function updateAssetValues(issue) {
  assets.forEach((asset) => {
    asset.prevValue = asset.value;

    const themeWeight = issue.weightMap[asset.theme] ?? 0;
    // 기본 변동폭 (예: 0~3 사이 랜덤) + 테마 가중치 영향
    const baseNoise = (Math.random() - 0.5) * 4; // -2 ~ +2 정도
    const issueImpact = themeWeight * 5; // 이 값으로 이슈 영향 강도 조정

    const delta = baseNoise + issueImpact;
    asset.value = Math.max(1, asset.value + delta); // 1 아래로는 안떨어지게
  });
}

// 숫자 포맷
function formatNumber(num) {
  return num.toFixed(1);
}

// ====== DOM 업데이트 ======
function renderMarketTable() {
  if (!marketBodyEl) return;
  marketBodyEl.innerHTML = "";

  assets.forEach((asset) => {
    const tr = document.createElement("tr");

    const delta = asset.value - asset.prevValue;
    const deltaStr = (delta >= 0 ? "+" : "") + formatNumber(delta);

    // Δ 색상 클래스
    let deltaClass = "delta--flat";
    if (delta > 0.3) deltaClass = "delta--up";
    else if (delta < -0.3) deltaClass = "delta--down";

    tr.innerHTML = `
      <td>${asset.name}</td>
      <td>${formatNumber(asset.value)}</td>
      <td class="${deltaClass}">${deltaStr}</td>
      <td>${formatNumber(asset.D)}</td>
      <td>${formatNumber(asset.B)}</td>
      <td>${formatNumber(asset.P)}</td>
      <td>${asset.theme}</td>
    `;

    marketBodyEl.appendChild(tr);
  });
}

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

  // 렌더
  renderTick();
  renderMarketTable();
}

// ====== 초기화 ======
function init() {
  tickInfoEl = document.getElementById("tickInfo");
  issueTagEl = document.getElementById("issueTag");
  issueTextEl = document.getElementById("issueText");
  marketBodyEl = document.getElementById("marketBody");
  weightListEl = document.getElementById("weightList");

  // 초기 이슈 & 렌더
  currentIssue = pickNewIssue(null);
  renderIssue(currentIssue);
  renderWeights(currentIssue);
  renderMarketTable();
  renderTick();

  // 루프 시작
  setInterval(step, TICK_INTERVAL_MS);
}

document.addEventListener("DOMContentLoaded", init);
