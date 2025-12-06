// market.js

const db2 = window.supabaseClient;

const tbody = document.getElementById("marketBody");
const issueText = document.getElementById("issueText");
const issueTag = document.getElementById("issueTag");
const tickInfo = document.getElementById("tickInfo");
const weightList = document.getElementById("weightList");

function norm(x, min, max) {
  return Math.min(1, Math.max(0, (x - min) / (max - min)));
}

function computeSocialMetrics(row) {
  const D = row.D ?? 2.5;
  const B = row.B ?? 0.5;
  const P = row.P ?? 0.2;
  const Bt = row.Bt ?? 30;
  const L = row.L ?? 0.5;
  const C = row.C ?? 50;
  const EEE = row.EEE ?? 0.6;
  const beta = row.beta ?? 0.5;

  const D_norm = norm(D, 1.5, 4.0);
  const NRS = 1 - D_norm;

  const CS = B * 0.7 + (1 - P) * 0.3;

  const Bt_norm = norm(Bt, 10, 50);
  const CI = Bt_norm;

  const L_norm = norm(L, 0.05, 1.0);
  const C_norm = norm(C, 0, 100);
  const CFI = L_norm * 0.6 + C_norm * 0.4;

  const PS = EEE;
  const NPI = 1 - beta;
  const SS = P;

  return { NRS, CS, CI, CFI, PS, NPI, SS };
}

const BASE_WEIGHTS = {
  NRS: 0.15,
  CS: 0.2,
  CI: 0.1,
  CFI: 0.2,
  PS: 0.1,
  NPI: 0.15,
  SS: 0.1,
};

let activeIssue = null;
let tick = 0;
let profiles = [];
let lastValues = {};

const THEMES = ["BODY", "DIVERSITY", "PRODUCTIVITY", "DATA", "HEALTH"];

function randomIssue() {
  const theme = THEMES[Math.floor(Math.random() * THEMES.length)];
  const dir = Math.random() < 0.5 ? "TIGHTEN" : "RELAX";
  const intensity = 0.4 + Math.random() * 0.6;
  const duration = 8 + Math.floor(Math.random() * 10);

  const params = {
    w_NRS: 0,
    w_CS: 0,
    w_CI: 0,
    w_CFI: 0,
    w_PS: 0,
    w_NPI: 0,
    w_SS: 0,
  };

  let title;

  if (theme === "BODY" && dir === "TIGHTEN") {
    title = "정부, '장내건강 점수'를 보험료에 반영하는 방안 추진";
    params.w_CS = +0.15;
    params.w_PS = +0.1;
    params.w_SS = +0.1;
    params.w_NRS = +0.1;
    params.w_NPI = +0.1;
    params.w_CFI = +0.05;
  } else if (theme === "BODY" && dir === "RELAX") {
    title = "비만·장질환에 대한 사회적 낙인을 완화하는 캠페인 확산";
    params.w_SS = -0.15;
    params.w_NPI = -0.1;
    params.w_NRS = -0.1;
    params.w_CI = +0.1;
  } else if (theme === "DIVERSITY" && dir === "TIGHTEN") {
    title = "표준화된 '건강한 장내 미생물 프로필' 국가 기준 발표";
    params.w_NRS = +0.2;
    params.w_NPI = +0.15;
    params.w_SS = +0.1;
  } else if (theme === "DIVERSITY" && dir === "RELAX") {
    title = "다양한 장내 미생물을 '개성'으로 인정하는 캠페인 시작";
    params.w_NRS = -0.2;
    params.w_NPI = -0.15;
    params.w_SS = -0.1;
    params.w_CI = +0.1;
  } else if (theme === "PRODUCTIVITY" && dir === "TIGHTEN") {
    title = "기업, '장내 효율 지수' 높은 인재 우대 채용 프로그램 도입";
    params.w_PS = +0.2;
    params.w_CS = +0.1;
    params.w_SS = +0.1;
  } else if (theme === "PRODUCTIVITY" && dir === "RELAX") {
    title = "과도한 '생산성 건강지수' 평가에 대한 비판 여론 확산";
    params.w_PS = -0.15;
    params.w_SS = -0.1;
    params.w_CFI = +0.05;
  } else if (theme === "DATA" && dir === "TIGHTEN") {
    title = "개인의 장내 데이터, 금융·보험 상품에 본격 연동";
    params.w_SS = +0.15;
    params.w_CFI = +0.1;
  } else if (theme === "DATA" && dir === "RELAX") {
    title = "장내 데이터의 상업적 활용을 제한하는 규제 강화";
    params.w_SS = -0.15;
    params.w_CFI = -0.1;
  } else if (theme === "HEALTH" && dir === "TIGHTEN") {
    title = "국가, '이상적인 장내 상태'에 맞춘 건강 지침 발표";
    params.w_CS = +0.15;
    params.w_NRS = +0.1;
    params.w_NPI = +0.1;
  } else if (theme === "HEALTH" && dir === "RELAX") {
    title = "개인의 몸을 '정상/비정상'으로 나누지 않는 건강 가이드 제시";
    params.w_NRS = -0.2;
    params.w_NPI = -0.15;
    params.w_SS = -0.1;
  } else {
    title = "장내 데이터와 관련된 사회적 논쟁이 확산되고 있다.";
  }

  return {
    theme,
    dir,
    intensity,
    duration,
    params,
    title,
  };
}

function getGlobalWeights(issue) {
  const g = { ...BASE_WEIGHTS };
  if (!issue) return g;
  const p = issue.params;
  for (const k of Object.keys(g)) {
    const delta = p["w_" + k] || 0;
    g[k] += delta * issue.intensity;
  }
  return g;
}

async function fetchProfilesMarket() {
  const { data, error } = await db2.from("profiles").select("*");
  if (error) {
    console.error(error);
    return [];
  }
  return data || [];
}

function renderWeights(globalWeights) {
  weightList.innerHTML = "";
  Object.entries(globalWeights).forEach(([key, val]) => {
    const div = document.createElement("div");
    div.className = "weight-item";
    div.innerHTML = `
      <span>${key}</span>
      <span>${val.toFixed(2)}</span>
    `;
    weightList.appendChild(div);
  });
}

function renderTable(globalWeights) {
  tbody.innerHTML = "";
  profiles.forEach((row) => {
    const sm = computeSocialMetrics(row);
    let SNI =
      sm.NRS * globalWeights.NRS +
      sm.CS * globalWeights.CS +
      sm.CI * globalWeights.CI +
      sm.CFI * globalWeights.CFI +
      sm.PS * globalWeights.PS +
      sm.NPI * globalWeights.NPI +
      sm.SS * globalWeights.SS;

    const noise = (Math.random() - 0.5) * 0.1;
    SNI += noise;

    const prev = lastValues[row.id] ?? row.value ?? 0;
    const diff = SNI - prev;

    lastValues[row.id] = SNI;
    row.value = SNI;

    const dirClass = diff > 0.01 ? "up" : diff < -0.01 ? "down" : "neutral";
    const diffStr = diff >= 0 ? "+" + diff.toFixed(2) : diff.toFixed(2);

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${row.label || "ID"}</td>
      <td class="val ${dirClass}">${SNI.toFixed(2)}</td>
      <td class="val ${dirClass}">${diffStr}</td>
      <td class="val">${(row.D ?? 0).toFixed(2)}</td>
      <td class="val">${(row.B ?? 0).toFixed(2)}</td>
      <td class="val">${(row.P ?? 0).toFixed(2)}</td>
      <td>${activeIssue ? activeIssue.theme : "-"}</td>
    `;
    tbody.appendChild(tr);
  });
}

async function pushValuesToDB() {
  if (profiles.length === 0) return;
  const updates = profiles.map((p) => ({
    id: p.id,
    value: p.value,
  }));
  const { error } = await db2.from("profiles").upsert(updates);
  if (error) console.error(error);
}

async function loop() {
  tick++;

  if (!activeIssue || activeIssue.duration <= 0) {
    activeIssue = randomIssue();
  } else {
    activeIssue.duration--;
  }

  const globalWeights = getGlobalWeights(activeIssue);

  issueTag.textContent = `${activeIssue.theme} · ${activeIssue.dir}`;
  issueText.textContent = activeIssue.title;
  tickInfo.textContent = `Tick: ${tick}`;

  profiles = await fetchProfilesMarket();
  renderWeights(globalWeights);
  renderTable(globalWeights);
  await pushValuesToDB();
}

// 시작
(async () => {
  profiles = await fetchProfilesMarket();
  loop();
  setInterval(loop, 3000); // 3초마다 업데이트
})();
