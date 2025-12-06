// assets/js/scan.js

const db = window.supabaseClient;

const standbyScreenEl = document.getElementById("standbyScreen");
const scanHeaderEl = document.getElementById("scanHeader");
const scanRootEl = document.getElementById("scanRoot");

const standbyCanvas = document.getElementById("standbyParticles");
const standbyCtx = standbyCanvas.getContext("2d");

// -----------------------------
// 상태 및 타이머 관리
// -----------------------------
let currentPhase = "A0-1"; // A0-1, A0-2, A1-1, A1-2, B1, B2, B3, C1, C2, C3, C4, D1, D2 ...
let pirOn = false;
let pressureOn = false;

let scanTimer = 0; // 현재 스캔 내에서 경과 시간(초)
let scanTotal = 30; // B 전체 길이 (대략)
let purity = 0; // 정제율 %
let loopInterval = null;

let lastSitTime = null;
let lastPressureChangeTime = null;

// 결과에 쓸 가상의 분석값(장내 다양성 등)
let analysisResult = null;

// DOM 참조
const statusPirEl = document.getElementById("statusPir");
const statusPressureEl = document.getElementById("statusPressure");
const statusSystemEl = document.getElementById("statusSystem");
const statusPhaseEl = document.getElementById("statusPhase");
const statusTimerEl = document.getElementById("statusTimer");

const mainMessageEl = document.getElementById("mainMessage");
const subMessageEl = document.getElementById("subMessage");
const secondaryMessageEl = document.getElementById("secondaryMessage");
const warningMessageEl = document.getElementById("warningMessage");
const resultListEl = document.getElementById("resultList");

const progressLabelEl = document.getElementById("progressLabel");
const progressTimeEl = document.getElementById("progressTime");
const progressBarInnerEl = document.getElementById("progressBarInner");
const purityValueEl = document.getElementById("purityValue");
const remainingTimeEl = document.getElementById("remainingTime");

const decisionButtonsEl = document.getElementById("decisionButtons");
const btnYes = document.getElementById("btnYes");
const btnNo = document.getElementById("btnNo");

const scanBgEl = document.getElementById("scanBg");

// 디버그 & 센서 시뮬레이터
const debugStartBtn = document.getElementById("debugStartBtn");
const btnPirOn = document.getElementById("btnPirOn");
const btnPirOff = document.getElementById("btnPirOff");
const btnSit = document.getElementById("btnSit");
const btnStand = document.getElementById("btnStand");
const btnReset = document.getElementById("btnReset");

// 텍스트 마스크용 오프스크린 캔버스
const textCanvas = document.createElement("canvas");
const textCtx = textCanvas.getContext("2d");

function buildTextTargets(text) {
  const w = standbyCanvas.width;
  const h = standbyCanvas.height;

  textCanvas.width = w;
  textCanvas.height = h;

  textCtx.clearRect(0, 0, w, h);

  // 글자 스타일 (나중에 폰트 바꿔도 됨)
  textCtx.fillStyle = "#ffffff";
  textCtx.textAlign = "center";
  textCtx.textBaseline = "middle";
  textCtx.font = "bold 64px 'Noto Sans KR', system-ui";

  // 가운데에 큰 텍스트로 그리기
  textCtx.fillText(text, w / 2, h / 2);

  const imgData = textCtx.getImageData(0, 0, w, h).data;

  const points = [];
  const step = 6; // 샘플링 간격(숫자 줄이면 더 촘촘한 글자)

  for (let y = 0; y < h; y += step) {
    for (let x = 0; x < w; x += step) {
      const idx = (y * w + x) * 4;
      const alpha = imgData[idx + 3];
      if (alpha > 128) {
        points.push({ x, y });
      }
    }
  }

  return points;
}

// -----------------------------
// Standby 파티클 (꿀렁)
// -----------------------------
let particles = [];
let standbyAnimReq = null;

function initStandbyParticles() {
  resizeStandbyCanvas();
  particles = [];
  const count = 30; // 파티클 개수
  const w = standbyCanvas.width;
  const h = standbyCanvas.height;

  for (let i = 0; i < count; i++) {
    particles.push({
      x: Math.random() * w,
      y: Math.random() * h,
      baseX: Math.random() * w,
      baseY: Math.random() * h,
      r: 40 + Math.random() * 60,
      phase: Math.random() * Math.PI * 2,
      speed: 0.3 + Math.random() * 0.3,
      colorIndex: Math.random(),
      // morph용
      targetX: null,
      targetY: null,
      morphT: 0, // 0~1 사이 보간 값
      mode: "idle", // "idle" | "morph"
    });
  }
}

function resizeStandbyCanvas() {
  standbyCanvas.width = window.innerWidth;
  standbyCanvas.height = window.innerHeight;
}

function drawStandbyParticles(time) {
  const t = time * 0.001;
  const ctx = standbyCtx;
  const w = standbyCanvas.width;
  const h = standbyCanvas.height;

  ctx.clearRect(0, 0, w, h);

  particles.forEach((p) => {
    let x, y, r;

    if (p.mode === "idle") {
      // 대기 상태: 몽글몽글 떠다니기
      const wobble = Math.sin(t * p.speed + p.phase) * 18;
      const wobble2 = Math.cos(t * p.speed * 0.7 + p.phase) * 18;
      x = p.baseX + wobble;
      y = p.baseY + wobble2;
      r = p.r + Math.sin(t * p.speed + p.phase * 1.3) * 10;
    } else if (p.mode === "morph") {
      // 글자 형태로 응축되는 상태
      const wobble = Math.sin(t * p.speed + p.phase) * 3;
      const wobble2 = Math.cos(t * p.speed * 0.7 + p.phase) * 3;

      // 0 → 1 로 점점 증가
      p.morphT = Math.min(1, p.morphT + 0.02);
      const ease = p.morphT * p.morphT * (3 - 2 * p.morphT); // smoothstep

      const fromX = p.baseX;
      const fromY = p.baseY;
      const toX = p.targetX ?? p.baseX;
      const toY = p.targetY ?? p.baseY;

      x = fromX + (toX - fromX) * ease + wobble;
      y = fromY + (toY - fromY) * ease + wobble2;
      r = p.r * (1 - ease) + (24 + Math.sin(t * p.speed + p.phase) * 4) * ease;
    }

    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    // 보라-청록-주황 계열
    if (p.colorIndex < 0.33) {
      g.addColorStop(0, "rgba(244, 187, 146, 0.8)");
      g.addColorStop(1, "rgba(24, 6, 43, 0)");
    } else if (p.colorIndex < 0.66) {
      g.addColorStop(0, "rgba(129, 140, 248, 0.7)");
      g.addColorStop(1, "rgba(15, 23, 42, 0)");
    } else {
      g.addColorStop(0, "rgba(45, 212, 191, 0.6)");
      g.addColorStop(1, "rgba(15, 23, 42, 0)");
    }

    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  });

  standbyAnimReq = requestAnimationFrame(drawStandbyParticles);
}

window.addEventListener("resize", () => {
  resizeStandbyCanvas();
  initStandbyParticles();
});

function formatTime(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function setPhase(phase) {
  currentPhase = phase;
  statusPhaseEl.textContent = phase;
  warningMessageEl.style.display = "none";
  resultListEl.style.display = "none";
  decisionButtonsEl.style.display = "none";

  // ★ A0 단계에서는: standby만 보이고, 헤더/스캔 UI는 안 보이게
  const isStandby = phase === "A0-1" || phase === "A0-2";
  if (isStandby) {
    standbyScreenEl.style.display = "block";
    scanHeaderEl.style.display = "none";
    scanRootEl.style.display = "none";

    if (!standbyAnimReq) {
      initStandbyParticles();
      standbyAnimReq = requestAnimationFrame(drawStandbyParticles);
    }
  } else {
    standbyScreenEl.style.display = "none";
    scanHeaderEl.style.display = "flex";
    scanRootEl.style.display = "flex";

    if (standbyAnimReq) {
      cancelAnimationFrame(standbyAnimReq);
      standbyAnimReq = null;
    }
  }

  // 상태에 따라 배경 비주얼과 텍스트 세팅
  switch (phase) {
    case "A0-1": // 대기
      statusSystemEl.textContent = "IDLE";
      mainMessageEl.textContent = "장내자산관리공단입니다.";
      subMessageEl.textContent = "관람객 접근을 기다리고 있습니다.";
      secondaryMessageEl.textContent =
        "변기 근처에 다가오면 시스템이 깨어납니다.";
      scanBgEl.className = "scan-bg particles";
      scanBgEl.style.opacity = 0.25;
      progressLabelEl.textContent = "스캔 대기";
      purity = 0;
      updateProgress();
      break;

    case "A0-2": // 접근 감지
      statusSystemEl.textContent = "READY";
      mainMessageEl.textContent = "착석 시 스캔 절차가 시작됩니다.";
      subMessageEl.textContent = "몇 초간 안정된 자세를 유지해 주세요.";
      secondaryMessageEl.textContent =
        "장내자산관리공단입니다. 착석하시면 장내 데이터 스캔이 시작됩니다.";
      scanBgEl.className = "scan-bg particles";
      scanBgEl.style.opacity = 0.45;
      break;

    case "A1-1": // 착석 확인
      statusSystemEl.textContent = "SEAT_DETECTED";
      mainMessageEl.textContent = "착석이 확인되었습니다.";
      subMessageEl.textContent = "장내 데이터 스캔을 시작합니다.";
      secondaryMessageEl.textContent = "";
      scanBgEl.className = "scan-bg particles";
      scanBgEl.style.opacity = 0.6;
      break;

    case "A1-2": // 기준 압력 캘리브레이션
      statusSystemEl.textContent = "CALIBRATING";
      mainMessageEl.textContent = "초기 상태를 측정하고 있습니다.";
      subMessageEl.textContent = "몇 초간 안정된 자세를 유지해 주세요.";
      secondaryMessageEl.textContent =
        "초기 압력값을 기준으로 정제 기준을 설정합니다.";
      scanBgEl.className = "scan-bg particles";
      scanBgEl.style.opacity = 0.7;
      break;

    case "B1": // 안정화
      statusSystemEl.textContent = "SCANNING";
      mainMessageEl.textContent = "신체 데이터를 정렬하고 있습니다.";
      subMessageEl.textContent = "천천히 호흡하며 자세를 유지해 주세요.";
      secondaryMessageEl.textContent = "";
      scanBgEl.className = "scan-bg particles";
      scanBgEl.style.opacity = 0.6;
      break;

    case "B2": // 힘 주기
      statusSystemEl.textContent = "SCANNING";
      mainMessageEl.textContent = "이제 힘을 주세요.";
      subMessageEl.textContent = "숨을 들이 마시고, 천천히 힘을 모아 주세요.";
      secondaryMessageEl.textContent = "";
      scanBgEl.className = "scan-bg spiral";
      scanBgEl.style.opacity = 0.65;
      break;

    case "B3": // 힘 풀고 안정
      statusSystemEl.textContent = "SCANNING";
      mainMessageEl.textContent = "이제 힘을 풀고, 그대로 유지해 주세요.";
      subMessageEl.textContent = "정제된 데이터가 내부에서 정리되고 있습니다.";
      secondaryMessageEl.textContent = "";
      scanBgEl.className = "scan-bg noise";
      scanBgEl.style.opacity = 0.6;
      break;

    case "C1": // 응축 + 완료 알림
      statusSystemEl.textContent = "COMPLETING";
      mainMessageEl.textContent = "스캔이 완료되었습니다.";
      subMessageEl.textContent = "정제된 장내 데이터 분석을 진행합니다.";
      secondaryMessageEl.textContent = "";
      scanBgEl.className = "scan-bg spiral";
      scanBgEl.style.opacity = 0.8;
      break;

    case "C2": // 결과 화면
      statusSystemEl.textContent = "RESULT";
      mainMessageEl.textContent = "장내 데이터 분석 결과입니다.";
      subMessageEl.textContent = "";
      secondaryMessageEl.textContent =
        "이 장내 데이터를 사회 자산으로 상장하시겠습니까?";
      decisionButtonsEl.style.display = "flex";
      renderAnalysisResult();
      break;

    case "C3": // YES 상장 진행
      statusSystemEl.textContent = "LISTING";
      mainMessageEl.textContent = "상장 절차를 진행합니다.";
      subMessageEl.textContent =
        "정제된 장내 데이터가 공단 시스템으로 전송되고 있습니다. 뒤쪽 화면에서 상장 결과를 확인해 주세요.";
      secondaryMessageEl.textContent = "";
      scanBgEl.className = "scan-bg spiral";
      scanBgEl.style.opacity = 0.9;
      break;

    case "C4": // NO 상장 거부
      statusSystemEl.textContent = "DECLINED";
      mainMessageEl.textContent = "상장을 진행하지 않았습니다.";
      subMessageEl.textContent =
        "귀하의 장내 데이터 가치는 매우 우수했습니다. 사회에 기여할 수 있는 기회를 놓치셨습니다.";
      secondaryMessageEl.textContent = "다음 기회를 기약하겠습니다.";
      scanBgEl.className = "scan-bg particles";
      scanBgEl.style.opacity = 0.3;
      break;

    case "D1": // 중도 이탈
      statusSystemEl.textContent = "INTERRUPTED";
      mainMessageEl.textContent = "착석이 해제되었습니다.";
      subMessageEl.textContent =
        "다시 앉으시면 이어서 진행됩니다. 장 시간이 비워지는 중...";
      secondaryMessageEl.textContent = "";
      scanBgEl.className = "scan-bg noise";
      scanBgEl.style.opacity = 0.5;
      break;

    case "D2": // 압력 유지 실패 / 데이터 부족
      statusSystemEl.textContent = "INTERRUPTED";
      mainMessageEl.textContent = "충분한 데이터가 수집되지 않았습니다.";
      subMessageEl.textContent = "다시 앉아 안정된 자세로 진행해 주세요.";
      secondaryMessageEl.textContent =
        "시스템 점검이 필요하면 직원에게 말씀해 주세요.";
      scanBgEl.className = "scan-bg noise";
      scanBgEl.style.opacity = 0.5;
      break;

    default:
      break;
  }
}

function updateSensorStatus() {
  statusPirEl.textContent = pirOn ? "ON" : "OFF";
  statusPressureEl.textContent = pressureOn ? "ON" : "OFF";
}

function updateProgress() {
  // B 단계에서만 의미 있게 사용, 나머지는 0~100 중 일부
  const ratio = Math.min(1, Math.max(0, scanTimer / scanTotal));
  const width = ratio * 100;
  progressBarInnerEl.style.width = `${width}%`;
  progressTimeEl.textContent = `${formatTime(scanTimer)} / ${formatTime(
    scanTotal
  )}`;
  purityValueEl.textContent = `${Math.round(purity)}%`;

  const remaining = Math.max(0, scanTotal - scanTimer);
  remainingTimeEl.textContent = `남은 시간: ${formatTime(remaining)}`;
  statusTimerEl.textContent = formatTime(scanTimer);
}

// -----------------------------
// 분석 결과 & ID 카드 생성
// -----------------------------
function generateAnalysisFromGutProfile(profile) {
  // 이 부분은 나중에 너가 맘대로 바꿀 수 있음
  // 지금은 D/B/P 등에서 간단히 등급 뽑는 예시
  const { D, B, P, EEE } = profile;

  const diversityGrade = D > 3.2 ? "A-" : D > 2.5 ? "B+" : "C+";
  const emotionalStability = B > 0.6 && P < 0.2 ? "B+" : "B-";
  const socialAdaptation = (1 - P * 0.7).toFixed(2);
  const socialEfficiency = (EEE + (1 - P) * 0.3).toFixed(2);

  return {
    diversityGrade,
    emotionalStability,
    socialAdaptation,
    socialEfficiency,
  };
}

function renderAnalysisResult() {
  if (!analysisResult) return;
  resultListEl.style.display = "block";
  resultListEl.innerHTML = `
    <div>장내 다양성: <strong>${analysisResult.diversityGrade}</strong></div>
    <div>정서 안정도: <strong>${analysisResult.emotionalStability}</strong></div>
    <div>사회 적응도: <strong>${analysisResult.socialAdaptation}</strong></div>
    <div>사회 효율 환산가: <strong>${analysisResult.socialEfficiency}</strong></div>
  `;
}

// 랜덤 장내 프로필 생성 (앞에서 쓰던 구조 재사용)
function createRandomGutProfile() {
  return {
    D: 1.5 + Math.random() * 2.5,
    B: 0.3 + Math.random() * 0.5,
    P: Math.random() * 0.4,
    Bt: 20 + Math.random() * 30,
    L: 0.05 + Math.random() * 0.95,
    C: Math.random() * 100,
    EEE: 0.4 + Math.random() * 0.4,
    beta: Math.random(),
  };
}

async function listCardToSupabase() {
  // 1) 장내 프로필 생성
  const profile = createRandomGutProfile();
  // 2) 분석 결과 생성
  analysisResult = generateAnalysisFromGutProfile(profile);

  const label = "G-" + String(2000 + Math.floor(Math.random() * 9000)) + "-A";

  const value = parseFloat(analysisResult.socialEfficiency);

  const { error } = await db.from("profiles").insert({
    label,
    ...profile,
    value,
    listed: true,
  });

  if (error) {
    console.error(error);
    warningMessageEl.textContent =
      "시스템 전송 중 오류가 발생했습니다. 직원에게 알려 주세요.";
    warningMessageEl.style.display = "block";
  }
}

function startMorphToText() {
  const w = standbyCanvas.width;
  const h = standbyCanvas.height;

  const targets = buildTextTargets("장내자산관리공단");

  // 파티클 수와 타겟 포인트 수 맞춰 매핑
  particles.forEach((p, i) => {
    const t = targets[i % targets.length]; // 부족하면 반복해서 재사용
    p.targetX = t.x + (Math.random() - 0.5) * 8; // 약간 노이즈
    p.targetY = t.y + (Math.random() - 0.5) * 8;
    p.morphT = 0;
    p.mode = "morph";
  });
}

// -----------------------------
// 메인 루프 (1초 단위 업데이트)
// -----------------------------
function mainLoopTick() {
  // 센서 예외 처리 (중도 이탈)
  if (pressureOn === false && currentPhase.startsWith("B")) {
    // 2초 이상 이탈 같은 복잡한 로직은 실제 센서로 구현
    setPhase("D1");
    scanTimer = 0;
    purity = 0;
    updateProgress();
    return;
  }

  // 단계별 시간/정제율 변화
  switch (currentPhase) {
    case "A1-2": // 캘리브레이션 3~5초
      scanTimer++;
      if (scanTimer >= 4) {
        scanTimer = 0;
        purity = 10;
        updateProgress();
        setPhase("B1");
      } else {
        purity = 5 + scanTimer * 2;
        updateProgress();
      }
      break;

    case "B1":
      scanTimer++;
      scanTotal = 30;
      purity = 20 + scanTimer * 2;
      progressLabelEl.textContent = "스캔 중";
      updateProgress();
      if (scanTimer >= 5) {
        setPhase("B2");
      }
      break;

    case "B2":
      scanTimer++;
      purity = Math.min(85, purity + 3 + Math.random() * 3);
      updateProgress();
      if (scanTimer >= 15) {
        setPhase("B3");
      }
      break;

    case "B3":
      scanTimer++;
      purity = Math.min(98, purity + 1 + Math.random() * 2);
      updateProgress();
      if (scanTimer >= 25) {
        // 스캔 완료 → C1
        setPhase("C1");
        // C1은 2초 정도만 보여주고 C2로 넘김
        setTimeout(() => {
          // 여기에 장내 프로필 & 분석값 한번 생성해두고 C2에서 보여줌
          const profile = createRandomGutProfile();
          analysisResult = generateAnalysisFromGutProfile(profile);
          // 프로필은 따로 저장할 수도 있고,
          // 상장 YES 할 때 새로 뽑을 수도 있음. 지금은 YES때 새 insert지만,
          // 필요하면 이곳에서 전역 변수로 유지해도 됨.
          setPhase("C2");
        }, 1500);
      }
      break;

    default:
      // 나머지 단계는 별도의 타이머 진행 없음
      break;
  }
}

// -----------------------------
// 센서 이벤트 (실제 설치에서는 외부에서 이 함수만 호출해도 됨)
// -----------------------------
function onPirChange(on) {
  pirOn = on;
  updateSensorStatus();
  if (currentPhase === "A0-1" && pirOn) {
    setPhase("A0-2");
  }
  if (!pirOn && !pressureOn) {
    setPhase("A0-1");
  }
}

function onPressureChange(on) {
  pressureOn = on;
  updateSensorStatus();
  lastPressureChangeTime = Date.now();

  if (on) {
    // 착석: 먼저 파티클을 "장내자산관리공단" 글자로 응축시킴
    lastSitTime = Date.now();

    // 아직은 A0-2 상태(standby 화면)에서 파티클만 모이게
    startMorphToText();

    // 약 1.5초 동안 글자 모이는 연출을 보여준 뒤,
    // 스캔 UI(A1-1)로 전환
    setTimeout(() => {
      if (!pressureOn) return; // 중간에 일어나면 무시

      setPhase("A1-1");
      scanTimer = 0;
      purity = 0;
      updateProgress();

      // 기존처럼 A1-1 → A1-2 전환
      setTimeout(() => {
        if (pressureOn && currentPhase === "A1-1") {
          setPhase("A1-2");
          scanTimer = 0;
          purity = 0;
          updateProgress();
        }
      }, 800);
    }, 1500);
  } else {
    // 이탈
    if (currentPhase.startsWith("B") || currentPhase === "A1-2") {
      setPhase("D1");
      scanTimer = 0;
      purity = 0;
      updateProgress();
    } else {
      setPhase("A0-2"); // 접근은 되어 있고 착석만 해제된 상태 가정
    }
  }
}

// -----------------------------
// 버튼/이벤트 바인딩
// -----------------------------
debugStartBtn.addEventListener("click", () => {
  // 전체 리셋 후 대기
  pirOn = false;
  pressureOn = false;
  scanTimer = 0;
  purity = 0;
  updateSensorStatus();
  setPhase("A0-1");
});

btnPirOn.addEventListener("click", () => onPirChange(true));
btnPirOff.addEventListener("click", () => onPirChange(false));
btnSit.addEventListener("click", () => onPressureChange(true));
btnStand.addEventListener("click", () => onPressureChange(false));
btnReset.addEventListener("click", () => {
  pirOn = false;
  pressureOn = false;
  scanTimer = 0;
  purity = 0;
  updateSensorStatus();
  setPhase("A0-1");
});

btnYes.addEventListener("click", async () => {
  setPhase("C3");
  await listCardToSupabase(); // 여기서 실제 상장 (insert + listed=true)
  // 약간의 연출 후 A0-1로 리셋
  setTimeout(() => {
    // 체험 리셋
    pirOn = false;
    pressureOn = false;
    scanTimer = 0;
    purity = 0;
    updateSensorStatus();
    setPhase("A0-1");
  }, 3000);
});

btnNo.addEventListener("click", () => {
  setPhase("C4");
  // 잠시 보여주고 초기화
  setTimeout(() => {
    pirOn = false;
    pressureOn = false;
    scanTimer = 0;
    purity = 0;
    updateSensorStatus();
    setPhase("A0-1");
  }, 4000);
});

// -----------------------------
// 초기화 & 루프 시작
// -----------------------------
setPhase("A0-1");
updateSensorStatus();
updateProgress();

loopInterval = setInterval(mainLoopTick, 1000);
