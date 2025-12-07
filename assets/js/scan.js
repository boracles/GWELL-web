// assets/js/scan.js

const db = window.supabaseClient;

const standbyScreenEl = document.getElementById("standbyScreen");
const scanHeaderEl = document.getElementById("scanHeader");
const scanRootEl = document.getElementById("scanRoot");

// Standby 파티클 캔버스
const standbyCanvas = document.getElementById("standbyParticles");
const standbyCtx = standbyCanvas ? standbyCanvas.getContext("2d") : null;

// 자세 안내 / 스캔 UI
const postureEl = document.getElementById("scanPosture");
const scanTopRowEl = document.getElementById("scanTopRow");
const scanMainMessageEl = document.getElementById("scanMainMessage");
const scanBottomEl = document.getElementById("scanBottom");
const standbyHintEl = document.getElementById("standbyHint");
const sensorSimEl = document.getElementById("sensorSim");

// 자세 안내 텍스트/프로그레스
const postureLine1El = document.getElementById("postureLine1");
const postureLine2El = document.getElementById("postureLine2");
const postureLine3El = document.getElementById("postureLine3");
const postureLine4El = document.getElementById("postureLine4");
const postureProgressInner = document.getElementById("postureProgressInner");
const postureStepEls = document.querySelectorAll(".posture-step[data-step]");

// 🔹 스캔 단계 시퀀스 (로딩바 밑 점 + 문장 1개)
// HTML 쪽에 이런 구조가 있다고 가정:
// <div id="scanSequence">
//   <div id="scanSequenceText"></div>
//   <div class="scan-sequence-steps">
//     <div class="scan-step" data-scan-step="0"><span class="scan-step-check">✔</span></div>
//     ...
//   </div>
// </div>
const scanSequenceEl = document.getElementById("scanSequence");
const scanSequenceTextEl = document.getElementById("scanSequenceText");
const scanStepEls = document.querySelectorAll(".scan-step[data-scan-step]");

// -----------------------------
// 상태 및 타이머 관리
// -----------------------------
let currentPhase = "A0-1"; // A0-1, A0-2, A1-1, POSTURE, A1-2, B1, B2, B3, C1, C2, ...
let pirOn = false;
let pressureOn = false;

let scanTimer = 0; // 현재 스캔 내에서 경과 시간(초)
let scanTotal = 30; // B 전체 길이 (대략)
let purity = 0; // 정제율 %
let loopInterval = null;

let scanOverallTimer = 0;
const SCAN_OVERALL_TOTAL = 40; // 전체 스캔 길이(초) – 적당히 잡아둔 값

let lastSitTime = null;
let lastPressureChangeTime = null;

let postureTimers = [];

// 결과에 쓸 분석값
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

// 윈도우 리사이즈 시 3D 씬 리사이즈
window.addEventListener("resize", () => {
  resizeMicrobes();
});

// -----------------------------
// 텍스트 마스크 (Standby 로고용)
// -----------------------------
function buildTextTargets(text) {
  const w = standbyCanvas.width;
  const h = standbyCanvas.height;

  textCanvas.width = w;
  textCanvas.height = h;

  textCtx.clearRect(0, 0, w, h);

  textCtx.fillStyle = "#ffffff";
  textCtx.textAlign = "center";
  textCtx.textBaseline = "middle";
  textCtx.font = "bold 64px 'Noto Sans KR', system-ui";

  textCtx.fillText(text, w / 2, h / 2);

  const imgData = textCtx.getImageData(0, 0, w, h).data;

  const points = [];
  const step = 6;

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
  if (!standbyCanvas || !standbyCtx) return;
  resizeStandbyCanvas();
  particles = [];
  const count = 30;
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
      targetX: null,
      targetY: null,
      morphT: 0,
      mode: "idle",
    });
  }
}

function resizeStandbyCanvas() {
  if (!standbyCanvas) return;
  standbyCanvas.width = window.innerWidth;
  standbyCanvas.height = window.innerHeight;
}

function drawStandbyParticles(time) {
  if (!standbyCtx || !standbyCanvas) return;
  const t = time * 0.001;
  const ctx = standbyCtx;
  const w = standbyCanvas.width;
  const h = standbyCanvas.height;

  ctx.clearRect(0, 0, w, h);

  particles.forEach((p) => {
    let x, y, r;

    if (p.mode === "idle") {
      const wobble = Math.sin(t * p.speed + p.phase) * 18;
      const wobble2 = Math.cos(t * p.speed * 0.7 + p.phase) * 18;
      x = p.baseX + wobble;
      y = p.baseY + wobble2;
      r = p.r + Math.sin(t * p.speed + p.phase * 1.3) * 10;
    } else if (p.mode === "morph") {
      const wobble = Math.sin(t * p.speed + p.phase) * 3;
      const wobble2 = Math.cos(t * p.speed * 0.7 + p.phase) * 3;

      p.morphT = Math.min(1, p.morphT + 0.008);
      const ease = p.morphT * p.morphT * (3 - 2 * p.morphT);

      const fromX = p.baseX;
      const fromY = p.baseY;
      const toX = p.targetX ?? p.baseX;
      const toY = p.targetY ?? p.baseY;

      x = fromX + (toX - fromX) * ease + wobble;
      y = fromY + (toY - fromY) * ease + wobble2;
      r = p.r * (1 - ease) + (24 + Math.sin(t * p.speed + p.phase) * 4) * ease;
    }

    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
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

// -----------------------------
// 스캔 단계용 문장 & 체크 (로딩바 연동)
// -----------------------------
const scanStepTexts = [
  "장내 환경 전체 상태를 초기화하고 기준값을 측정하고 있습니다.",
  "장내 미생물의 형태와 위치를 스캔하고 있습니다.",
  "유익균·유해균 비율과 염증, 대사 지표를 분석하는 중입니다.",
  "측정값을 사회적 정상성·효율성 지표로 환산하는 중입니다.",
];

let currentScanStep = -1;

let scanCurrentRatio = 0; // 0~1 (로딩바 전체 비율)
let scanStepIndex = -1; // 현재 단계 index
let scanProgressInterval = null; // setInterval 핸들

function clearScanProgressInterval() {
  if (scanProgressInterval) {
    clearInterval(scanProgressInterval);
    scanProgressInterval = null;
  }
}

// 스캔 단계 UI 전체 리셋
function resetScanProgressUI() {
  clearScanProgressInterval();
  scanCurrentRatio = 0;
  scanStepIndex = -1;

  if (progressBarInnerEl) {
    progressBarInnerEl.style.width = "0%";
  }
  if (progressTimeEl) {
    progressTimeEl.textContent = "";
  }
  if (remainingTimeEl) {
    remainingTimeEl.textContent = "";
  }
  if (statusTimerEl) {
    statusTimerEl.textContent = "";
  }
  if (scanSequenceTextEl) {
    scanSequenceTextEl.textContent = "";
  }

  scanStepEls.forEach((el) => {
    el.classList.remove("completed");
    const check = el.querySelector(".scan-step-check");
    if (check) check.style.opacity = "0";
  });
}

// 👉 좌석 안내 progress처럼, 특정 단계까지 "한 번" 채우는 함수
function goToScanStep(stepIndex) {
  if (!scanSequenceEl || !scanStepEls.length) return;

  // 하단 단계 UI 보이기
  scanSequenceEl.style.display = "block";

  // 현재 단계 문장
  if (scanSequenceTextEl) {
    scanSequenceTextEl.textContent = scanStepTexts[stepIndex];
  }

  clearScanProgressInterval();

  const stepCount = scanStepTexts.length;
  const targetRatio = (stepIndex + 1) / stepCount; // 0.25, 0.5, 0.75, 1.0

  const duration = 1100; // 좌석 안내랑 맞춘 1.1초
  const interval = 50;
  const steps = Math.floor(duration / interval);
  const start = scanCurrentRatio;
  const delta = (targetRatio - start) / steps;

  let count = 0;
  scanProgressInterval = setInterval(() => {
    count++;
    scanCurrentRatio = start + delta * count;
    if (scanCurrentRatio < 0) scanCurrentRatio = 0;
    if (scanCurrentRatio > 1) scanCurrentRatio = 1;

    // 🔹 로딩바 채우기
    const width = scanCurrentRatio * 100;
    if (progressBarInnerEl) {
      progressBarInnerEl.style.width = `${width}%`;
    }

    // 🔹 시간/남은 시간은 대략 비율 기준으로 계산
    const elapsed = Math.round(scanCurrentRatio * SCAN_OVERALL_TOTAL);
    const total = SCAN_OVERALL_TOTAL;
    if (progressTimeEl) {
      progressTimeEl.textContent = `${formatTime(elapsed)} / ${formatTime(
        total
      )}`;
    }
    if (remainingTimeEl) {
      const remaining = Math.max(0, total - elapsed);
      remainingTimeEl.textContent = `남은 시간: ${formatTime(remaining)}`;
    }
    if (statusTimerEl) {
      statusTimerEl.textContent = formatTime(elapsed);
    }

    // 애니메이션 끝
    if (count >= steps) {
      clearScanProgressInterval();
      scanProgressInterval = null;

      // 🔹 이 단계까지 완료 → 체크 업데이트
      scanStepEls.forEach((el, idx) => {
        const check = el.querySelector(".scan-step-check");
        const completed = idx <= stepIndex; // 이 index까지 ✔
        el.classList.toggle("completed", completed);
        if (check) check.style.opacity = completed ? "1" : "0";
      });

      scanStepIndex = stepIndex;
    }
  }, interval);
}

function updateScanSequence(ratio) {
  // 더 이상 사용 안 함 (로딩바/체크는 goToScanStep에서 처리)
}

// -----------------------------
// Phase 전환
// -----------------------------
function setPhase(phase) {
  currentPhase = phase;
  if (statusPhaseEl) statusPhaseEl.textContent = phase;
  if (warningMessageEl) warningMessageEl.style.display = "none";
  if (resultListEl) resultListEl.style.display = "none";
  if (decisionButtonsEl) decisionButtonsEl.style.display = "none";

  const isStandby = phase === "A0-1" || phase === "A0-2";

  // ✅ 결과 페이지(C2 이후)에서 하단 로딩바/단계 UI 숨기기
  const isScanProgressPhase =
    phase === "A1-2" ||
    phase === "B1" ||
    phase === "B2" ||
    phase === "B3" ||
    phase === "C1";

  if (scanBottomEl) {
    scanBottomEl.style.display = isScanProgressPhase ? "flex" : "none";
  }
  if (scanSequenceEl) {
    scanSequenceEl.style.display = isScanProgressPhase ? "block" : "none";
  }

  if (isStandby) {
    if (standbyScreenEl) standbyScreenEl.style.display = "block";
    if (scanHeaderEl) scanHeaderEl.style.display = "none";
    if (scanRootEl) scanRootEl.style.display = "none";

    if (!standbyAnimReq) {
      initStandbyParticles();
      standbyAnimReq = requestAnimationFrame(drawStandbyParticles);
    }
  } else {
    if (standbyScreenEl) standbyScreenEl.style.display = "none";
    if (scanHeaderEl) scanHeaderEl.style.display = "flex";
    if (scanRootEl) scanRootEl.style.display = "flex";

    if (standbyAnimReq) {
      cancelAnimationFrame(standbyAnimReq);
      standbyAnimReq = null;
    }
  }

  switch (phase) {
    case "A0-1":
      if (standbyHintEl) standbyHintEl.style.display = "block";
      if (statusSystemEl) statusSystemEl.textContent = "IDLE";
      mainMessageEl.textContent = "장내자산관리공단입니다.";
      subMessageEl.textContent = "관람객 접근을 기다리고 있습니다.";
      secondaryMessageEl.textContent =
        "변기 근처에 다가오면 시스템이 깨어납니다.";
      scanBgEl.className = "scan-bg particles";
      scanBgEl.style.opacity = 0.25;
      progressLabelEl.textContent = "스캔 대기";
      purity = 0;
      updateProgress();
      showMicrobes(false);
      resetScanProgressUI();
      break;

    case "A0-2":
      if (statusSystemEl) statusSystemEl.textContent = "READY";
      mainMessageEl.textContent = "착석 시 스캔 절차가 시작됩니다.";
      subMessageEl.textContent = "몇 초간 안정된 자세를 유지해 주세요.";
      secondaryMessageEl.textContent =
        "장내자산관리공단입니다. 착석하시면 장내 데이터 스캔이 시작됩니다.";
      scanBgEl.className = "scan-bg particles";
      scanBgEl.style.opacity = 0.45;
      showMicrobes(false);
      break;

    case "A1-1":
      if (statusSystemEl) statusSystemEl.textContent = "";
      if (scanTopRowEl) scanTopRowEl.style.display = "none";
      if (scanMainMessageEl) scanMainMessageEl.style.display = "none";
      if (scanBottomEl) scanBottomEl.style.display = "none";
      if (warningMessageEl) warningMessageEl.style.display = "none";
      if (resultListEl) resultListEl.style.display = "none";
      if (postureEl) postureEl.style.display = "flex";
      scanBgEl.className = "scan-bg particles";
      scanBgEl.style.opacity = 0.5;
      break;

    case "POSTURE": {
      if (statusSystemEl) statusSystemEl.textContent = "";
      if (scanHeaderEl) scanHeaderEl.style.display = "none";
      if (scanTopRowEl) scanTopRowEl.style.display = "none";
      if (scanMainMessageEl) scanMainMessageEl.style.display = "none";
      if (scanBottomEl) scanBottomEl.style.display = "none";
      if (sensorSimEl) sensorSimEl.style.display = "none";
      if (warningMessageEl) warningMessageEl.style.display = "none";
      if (resultListEl) resultListEl.style.display = "none";
      if (postureEl) postureEl.style.display = "flex";

      scanBgEl.className = "scan-bg particles";
      scanBgEl.style.opacity = 0.6;

      const seqText = document.getElementById("postureSequenceText");
      const postureGraphicEl = document.querySelector(".posture-graphic");
      const postureTitleEl = document.querySelector(".posture-message");
      const stepperEl = document.querySelector(".posture-stepper");

      const seq = [
        "등을 곧게 세우고 상체를 안정시켜 주세요.",
        "배에 힘을 주어 장 쪽으로 압력을 모아 주세요.",
        "조금만 더 힘을 유지해 주세요. 장 안에서 내용물이 이동하고 있습니다.",
        "이제 아래로 부드럽게 밀어내며 배출을 시작해 주세요.",
      ];

      let idx = 0;
      let currentProgress = 0;

      if (seqText) {
        seqText.style.opacity = 0;
        seqText.innerText = "";
      }
      if (postureProgressInner) {
        postureProgressInner.style.width = "0%";
      }
      postureStepEls.forEach((el) => {
        el.classList.remove("completed");
        const check = el.querySelector(".posture-step-check");
        if (check) check.style.opacity = "0";
      });
      if (stepperEl) stepperEl.style.opacity = 1;
      if (postureGraphicEl) {
        postureGraphicEl.style.display = "block";
        postureGraphicEl.style.opacity = 1;
      }
      if (postureTitleEl) {
        postureTitleEl.style.display = "block";
        postureTitleEl.style.opacity = 1;
      }
      if (postureLine4El) {
        postureLine4El.style.display = "block";
        postureLine4El.style.opacity = 1;
        postureLine4El.textContent =
          "잠시 동안 이 자세를 유지하면 스캔이 자동으로 시작됩니다.";
      }

      function pumpSVG(stepIndex) {
        const img = document.getElementById("postureImg");
        if (!img) return;
        const base = 1.05;
        const extra = stepIndex * 0.02;
        const scale = base + extra;

        img.style.transition = "transform 0.35s ease";
        img.style.transform = `scale(${scale})`;
        setTimeout(() => (img.style.transform = "scale(1.0)"), 350);
      }

      function animateProgressTo(targetPercent, onDone) {
        const duration = 1100;
        const interval = 50;
        const steps = Math.floor(duration / interval);
        const start = currentProgress;
        const delta = (targetPercent - start) / steps;

        let count = 0;
        const id = setInterval(() => {
          count++;
          currentProgress = start + delta * count;

          if (postureProgressInner) {
            postureProgressInner.style.width = currentProgress + "%";
          }

          if (count >= steps) {
            clearInterval(id);
            currentProgress = targetPercent;
            if (postureProgressInner) {
              postureProgressInner.style.width = targetPercent + "%";
            }
            if (typeof onDone === "function") onDone();
          }
        }, interval);

        postureTimers.push(id);
      }

      function goToScanPhase() {
        setPhase("A1-2");
        scanTimer = 0;
        purity = 0;
        updateProgress();
      }

      function nextSentence() {
        if (!seqText) return;

        const lastIndex = seq.length - 1;
        if (idx > lastIndex) return;

        seqText.innerText = seq[idx];
        seqText.style.opacity = 1;

        const t1 = setTimeout(() => {
          pumpSVG(idx);

          const t2 = setTimeout(() => {
            const target = ((idx + 1) / seq.length) * 100;

            animateProgressTo(target, () => {
              if (postureStepEls && postureStepEls[idx]) {
                postureStepEls[idx].classList.add("completed");
                const check = postureStepEls[idx].querySelector(
                  ".posture-step-check"
                );
                if (check) check.style.opacity = "1";
              }

              if (idx === lastIndex) {
                const afterFullTimer = setTimeout(() => {
                  if (postureGraphicEl) postureGraphicEl.style.display = "none";
                  if (stepperEl) stepperEl.style.opacity = 0;
                  if (postureTitleEl) postureTitleEl.style.opacity = 0;
                  if (postureLine4El) postureLine4El.style.opacity = 0;

                  seqText.style.opacity = 0;
                  const showDetectTimer = setTimeout(() => {
                    seqText.innerText =
                      "장내 배출 데이터가 감지되었습니다. 장내 데이터 정렬을 시작합니다.";
                    seqText.style.opacity = 1;
                  }, 400);
                  postureTimers.push(showDetectTimer);

                  const toScanTimer = setTimeout(() => {
                    goToScanPhase();
                  }, 3400);
                  postureTimers.push(toScanTimer);
                }, 800);

                postureTimers.push(afterFullTimer);
              } else {
                const tFadeOut = setTimeout(() => {
                  seqText.style.opacity = 0;
                  const tNext = setTimeout(() => {
                    idx++;
                    nextSentence();
                  }, 900);
                  postureTimers.push(tNext);
                }, 900);

                postureTimers.push(tFadeOut);
              }
            });
          }, 500);

          postureTimers.push(t2);
        }, 1400);

        postureTimers.push(t1);
      }

      postureTimers.forEach(clearTimeout);
      postureTimers = [];
      nextSentence();

      break;
    }

    case "A1-2":
      if (postureEl) postureEl.style.display = "none";
      if (scanTopRowEl) scanTopRowEl.style.display = "flex";
      if (scanMainMessageEl) scanMainMessageEl.style.display = "block";
      if (sensorSimEl) sensorSimEl.style.display = "flex";

      mainMessageEl.textContent = "초기 상태를 측정하고 있습니다.";
      subMessageEl.textContent = "몇 초간 안정된 자세를 유지해 주세요.";
      secondaryMessageEl.textContent = "";
      scanBgEl.className = "scan-bg particles";
      scanBgEl.style.opacity = 0.7;

      scanOverallTimer = 0;
      scanTimer = 0;
      scanTotal = 30;
      purity = 0;
      updateProgress();

      microProgress = 0.25;
      showMicrobes(true);
      goToScanStep(0);
      break;

    case "B1":
      if (statusSystemEl) statusSystemEl.textContent = "SCANNING";
      mainMessageEl.textContent = "신체 데이터를 정렬하고 있습니다.";
      subMessageEl.textContent = "천천히 호흡하며 자세를 유지해 주세요.";
      secondaryMessageEl.textContent = "";
      scanBgEl.className = "scan-bg particles";
      scanBgEl.style.opacity = 0.6;
      showMicrobes(true);

      goToScanStep(1);
      break;

    case "B2":
      if (statusSystemEl) statusSystemEl.textContent = "SCANNING";
      mainMessageEl.textContent = "이제 힘을 주세요.";
      subMessageEl.textContent = "숨을 들이 마시고, 천천히 힘을 모아 주세요.";
      secondaryMessageEl.textContent = "";
      scanBgEl.className = "scan-bg spiral";
      scanBgEl.style.opacity = 0.65;
      showMicrobes(true);

      goToScanStep(2);
      break;

    case "B3":
      if (statusSystemEl) statusSystemEl.textContent = "SCANNING";
      mainMessageEl.textContent = "이제 힘을 풀고, 그대로 유지해 주세요.";
      subMessageEl.textContent = "정제된 데이터가 내부에서 정리되고 있습니다.";
      secondaryMessageEl.textContent = "";
      scanBgEl.className = "scan-bg noise";
      scanBgEl.style.opacity = 0.6;
      showMicrobes(true);

      goToScanStep(3);
      break;

    case "C1":
      if (statusSystemEl) statusSystemEl.textContent = "COMPLETING";
      mainMessageEl.textContent = "스캔이 완료되었습니다.";
      subMessageEl.textContent = "정제된 장내 데이터 분석을 진행합니다.";
      secondaryMessageEl.textContent = "";
      scanBgEl.className = "scan-bg spiral";
      scanBgEl.style.opacity = 0.8;
      showMicrobes(true);
      break;

    case "C2":
      if (statusSystemEl) statusSystemEl.textContent = "RESULT";
      mainMessageEl.textContent = "장내 데이터 분석 결과입니다.";
      subMessageEl.textContent = "";
      secondaryMessageEl.textContent =
        "이 장내 데이터를 사회 자산으로 상장하시겠습니까?";
      decisionButtonsEl.style.display = "flex";
      renderAnalysisResult();
      showMicrobes(false);
      break;

    case "C3":
      if (statusSystemEl) statusSystemEl.textContent = "LISTING";
      mainMessageEl.textContent = "상장 절차를 진행합니다.";
      subMessageEl.textContent =
        "정제된 장내 데이터가 공단 시스템으로 전송되고 있습니다. 뒤쪽 화면에서 상장 결과를 확인해 주세요.";
      secondaryMessageEl.textContent = "";
      scanBgEl.className = "scan-bg spiral";
      scanBgEl.style.opacity = 0.9;
      break;

    case "C4":
      if (statusSystemEl) statusSystemEl.textContent = "DECLINED";
      mainMessageEl.textContent = "상장을 진행하지 않았습니다.";
      subMessageEl.textContent =
        "귀하의 장내 데이터 가치는 매우 우수했습니다. 사회에 기여할 수 있는 기회를 놓치셨습니다.";
      secondaryMessageEl.textContent = "다음 기회를 기약하겠습니다.";
      scanBgEl.className = "scan-bg particles";
      scanBgEl.style.opacity = 0.3;
      break;

    case "D1":
      if (statusSystemEl) statusSystemEl.textContent = "INTERRUPTED";
      mainMessageEl.textContent = "착석이 해제되었습니다.";
      subMessageEl.textContent =
        "다시 앉으시면 이어서 진행됩니다. 장 시간이 비워지는 중...";
      secondaryMessageEl.textContent = "";
      scanBgEl.className = "scan-bg noise";
      scanBgEl.style.opacity = 0.5;
      break;

    case "D2":
      if (statusSystemEl) statusSystemEl.textContent = "INTERRUPTED";
      mainMessageEl.textContent = "충분한 데이터가 수집되지 않았습니다.";
      subMessageEl.textContent = "다시 앉아 안정된 자세로 진행해 주세요.";
      secondaryMessageEl.textContent =
        "시스템 점검이 필요하면 직원에게 말씀해 주세요.";
      scanBgEl.className = "scan-bg noise";
      scanBgEl.style.opacity = 0.5;
      showMicrobes(false);
      break;

    default:
      break;
  }
}

// -----------------------------
// 센서 표시
// -----------------------------
function updateSensorStatus() {
  if (statusPirEl) statusPirEl.textContent = pirOn ? "ON" : "OFF";
  if (statusPressureEl)
    statusPressureEl.textContent = pressureOn ? "ON" : "OFF";
}

// -----------------------------
// 진행바 업데이트 + 스캔 단계 연동
// -----------------------------
function updateProgress() {
  purityValueEl.textContent = `${Math.round(purity)}%`;
}

// -----------------------------
// 3D 미생물 씬 (그대로)
// -----------------------------
const scanMicrobesCanvas = document.getElementById("scanMicrobes");

let microScene = null;
let microCamera = null;
let microRenderer = null;
let microGroup = null;
let microAnimReq = null;
let microIsActive = false;
let microStartTime = 0;
let microLoaded = false;

let microProgress = 0;

const MICRO_MODEL_PATHS = [
  "assets/models/Microbiome_1.glb",
  "assets/models/Microbiome_2.glb",
  "assets/models/Microbiome_3.glb",
  "assets/models/Microbiome_4.glb",
];

function initMicrobeScene() {
  if (!scanMicrobesCanvas || microScene) return;

  const width = scanMicrobesCanvas.clientWidth || window.innerWidth;
  const height = scanMicrobesCanvas.clientHeight || window.innerHeight;

  microRenderer = new THREE.WebGLRenderer({
    canvas: scanMicrobesCanvas,
    alpha: true,
    antialias: true,
  });
  microRenderer.setPixelRatio(window.devicePixelRatio || 1);
  microRenderer.setSize(width, height);

  microScene = new THREE.Scene();
  microScene.fog = new THREE.FogExp2(0x050816, 0.015);

  microCamera = new THREE.PerspectiveCamera(35, width / height, 0.1, 200);
  microCamera.position.set(0, 0, 55);

  const amb = new THREE.AmbientLight(0xffffff, 0.7);
  const dir = new THREE.DirectionalLight(0xffffff, 0.9);
  dir.position.set(5, 10, 7);
  microScene.add(amb, dir);

  microGroup = new THREE.Group();
  microGroup.position.z = -6;
  microScene.add(microGroup);

  const loader = new window.GLTFLoader();

  const loadPromises = MICRO_MODEL_PATHS.map(
    (path) =>
      new Promise((resolve, reject) => {
        loader.load(
          path,
          (gltf) => resolve(gltf.scene),
          undefined,
          (err) => reject(err)
        );
      })
  );

  Promise.all(loadPromises)
    .then((scenes) => {
      const COUNT = 70;

      for (let i = 0; i < COUNT; i++) {
        const baseScene = scenes[i % scenes.length].clone(true);
        const wrapper = new THREE.Group();
        wrapper.add(baseScene);

        const baseRadius = 2 + Math.random() * 10;
        const baseAngle = Math.random() * Math.PI * 2;
        const baseHeight = (Math.random() - 0.5) * 4;

        wrapper.position.set(
          Math.cos(baseAngle) * 0.5,
          Math.sin(baseAngle) * 0.5,
          baseHeight * 0.1
        );

        const baseScale = 0.16 + Math.random() * 0.12;
        wrapper.scale.set(baseScale, baseScale, baseScale);

        wrapper.userData = {
          baseRadius,
          baseAngle,
          baseHeight,
          baseScale,
          offset: Math.random() * 1000,
          swirlDir: Math.random() > 0.5 ? 1 : -1,
          spawnOffset: Math.random(),
        };

        microGroup.add(wrapper);
      }

      microLoaded = true;
      if (microIsActive) {
        scanMicrobesCanvas.style.opacity = 0.9;
      }
    })
    .catch((err) => {
      console.error("microbe glb load error:", err);
    });

  microStartTime = performance.now();
}

function resizeMicrobes() {
  if (!microRenderer || !microCamera) return;
  const width = scanMicrobesCanvas.clientWidth || window.innerWidth;
  const height = scanMicrobesCanvas.clientHeight || window.innerHeight;
  microRenderer.setSize(width, height);
  microCamera.aspect = width / height;
  microCamera.updateProjectionMatrix();
}

window.addEventListener("resize", resizeMicrobes);

function animateMicrobes() {
  if (!microScene || !microCamera || !microRenderer || !microGroup) return;

  const now = performance.now();
  const t = (now - microStartTime) * 0.001;

  let targetProgress = 0;
  if (currentPhase === "A1-2") {
    targetProgress = 0.25;
  } else if (currentPhase === "B1") {
    targetProgress = 0.45;
  } else if (currentPhase === "B2") {
    targetProgress = 0.75;
  } else if (currentPhase === "B3" || currentPhase === "C1") {
    targetProgress = 1.0;
  } else {
    targetProgress = 0;
  }

  microProgress += (targetProgress - microProgress) * 0.05;

  const camStartZ = 55;
  const camEndZ = 28;
  const camZ = camStartZ - (camStartZ - camEndZ) * microProgress;
  microCamera.position.z = camZ;
  microCamera.lookAt(0, 0, 0);
  microCamera.updateProjectionMatrix();

  microGroup.rotation.y = Math.sin(t * 0.12) * 0.25;
  microGroup.rotation.x = Math.sin(t * 0.07) * 0.08;

  microGroup.children.forEach((wrapper) => {
    const d = wrapper.userData;

    let appear = (microProgress * 1.2 - d.spawnOffset) / 0.5;
    if (appear < 0) appear = 0;
    if (appear > 1) appear = 1;

    if (appear <= 0) {
      wrapper.visible = false;
      return;
    }
    wrapper.visible = true;

    const r = d.baseRadius * (0.2 + 0.8 * appear);

    const swimPhase = t * 0.9 + d.offset;
    const wobbleSmall = Math.sin(swimPhase * 1.3) * 0.4;
    const wobbleSmall2 = Math.cos(swimPhase * 1.1) * 0.4;

    const angle =
      d.baseAngle + Math.sin(t * 0.25 + d.offset * 0.2) * 0.4 * d.swirlDir;

    const x = Math.cos(angle) * r + wobbleSmall;
    const y =
      Math.sin(angle) * r + wobbleSmall2 + Math.sin(t * 0.5 + d.offset) * 0.3;
    const z =
      d.baseHeight * (0.3 + 0.5 * appear) +
      Math.sin(t * 0.7 + d.offset * 0.5) * 0.6;

    wrapper.position.set(x, y, z);

    wrapper.rotation.x += 0.015 * d.swirlDir;
    wrapper.rotation.y += 0.02;
    wrapper.rotation.z += Math.sin(t * 0.8 + d.offset) * 0.004;

    const breath = 1 + Math.sin(t * 1.6 + d.offset) * 0.15;
    const s = d.baseScale * (0.4 + 0.8 * appear) * breath;
    wrapper.scale.set(s, s, s);
  });

  microRenderer.render(microScene, microCamera);
  microAnimReq = requestAnimationFrame(animateMicrobes);
}

function showMicrobes(active) {
  microIsActive = active;
  if (!scanMicrobesCanvas) return;

  if (active) {
    initMicrobeScene();
    resizeMicrobes();

    scanMicrobesCanvas.style.opacity = microLoaded ? 0.9 : 0.0;

    if (!microAnimReq) {
      microStartTime = performance.now();
      microAnimReq = requestAnimationFrame(animateMicrobes);
    }
  } else {
    scanMicrobesCanvas.style.opacity = 0;
    if (microAnimReq) {
      cancelAnimationFrame(microAnimReq);
      microAnimReq = null;
    }
  }
}

// -----------------------------
// 분석 결과 & ID 카드 생성 (이하 동일)
// -----------------------------

let scanResultStarted = false;

function startScanResultTransition() {
  if (scanResultStarted) return;
  scanResultStarted = true;

  scanOverallTimer = SCAN_OVERALL_TOTAL;
  updateProgress();

  setPhase("C1");

  const scanMainEl = document.querySelector(".scan-main");

  if (scanMainEl) {
    scanMainEl.classList.add("scan-fade-out");
  }

  setTimeout(() => {
    const profile = createRandomGutProfile();
    analysisResult = generateAnalysisFromGutProfile(profile);

    setPhase("C2");

    if (scanMainEl) {
      scanMainEl.classList.remove("scan-fade-out");
      scanMainEl.classList.add("scan-fade-in");
      setTimeout(() => {
        scanMainEl.classList.remove("scan-fade-in");
      }, 600);
    }
  }, 800);
}

function normalize(x, min, max) {
  return Math.min(1, Math.max(0, (x - min) / (max - min)));
}

function mapGutToSocial(profile) {
  const D_norm = normalize(profile.D, 1.5, 4.0);
  const NRS = 1 - D_norm;

  const CS = profile.B * 0.7 + (1 - profile.P) * 0.3;

  const Bt_norm = normalize(profile.Bt, 10, 50);
  const CI = Bt_norm;

  const L_norm = normalize(profile.L, 0.05, 1.0);
  const C_norm = normalize(profile.C, 0, 100);
  const CFI = L_norm * 0.6 + C_norm * 0.4;

  const PS = profile.EEE;

  const NPI = 1 - profile.beta;

  const SS = profile.P;

  const weights = {
    NRS: 0.15,
    CS: 0.2,
    CI: 0.1,
    CFI: 0.2,
    PS: 0.1,
    NPI: 0.15,
    SS: 0.1,
  };

  const sni =
    NRS * weights.NRS +
    CS * weights.CS +
    CI * weights.CI +
    CFI * weights.CFI +
    PS * weights.PS +
    NPI * weights.NPI +
    SS * weights.SS;

  return { NRS, CS, CI, CFI, PS, NPI, SS, sni };
}

function generateAnalysisFromGutProfile(profile) {
  const { D, B, P, Bt, L, C, EEE, beta } = profile;

  const diversityGrade = D > 3.2 ? "A-" : D > 2.5 ? "B+" : "C+";
  const emotionalStability = B > 0.6 && P < 0.2 ? "B+" : "B-";
  const socialAdaptation = (1 - P * 0.7).toFixed(2);
  const socialEfficiency = (EEE + (1 - P) * 0.3).toFixed(2);

  const socialMetrics = mapGutToSocial(profile);

  return {
    diversityGrade,
    emotionalStability,
    socialAdaptation,
    socialEfficiency,
    profile,
    socialMetrics,
    sni: socialMetrics.sni,
  };
}

function renderAnalysisResult() {
  if (!analysisResult || !resultListEl) return;

  const gutVisualEl = document.getElementById("gutVisual");
  const gutImageEl = document.getElementById("gutImage");

  const profile = analysisResult.profile;
  const sm = analysisResult.socialMetrics || {};
  const sni = analysisResult.sni ?? 0.5;

  // ---- 전체 점수 / 퍼센트 ----
  const overallScore = Math.max(0, Math.min(1, sni));
  const overallScoreText = overallScore.toFixed(2);
  const overallPercentText = Math.round(overallScore * 100);

  // 점수 → 등급 (A~D)
  const gradeFromScore = (score, invert = false) => {
    let v = Math.max(0, Math.min(1, score));
    if (invert) v = 1 - v; // 높을수록 나쁜 지표(CFI 등)는 뒤집어서 등급 계산
    if (v >= 0.8) return "A";
    if (v >= 0.6) return "B";
    if (v >= 0.4) return "C";
    return "D";
  };

  const pct = (x) => `${Math.round(x * 100)}%`;

  // 각 카테고리용 값
  const diversityScore = 1 - (sm.NRS ?? 0.5); // NRS 높음 = 정상 범위 좁음 → 뒤집어서 "다양성" 점수
  const conformityScore = sm.CS ?? 0.5;
  const cohesionScore = sm.CI ?? 0.5;
  const conflictScore = sm.CFI ?? 0.5; // 높을수록 갈등↑
  const productivityScore = sm.PS ?? 0.5;

  const diversityGrade = gradeFromScore(diversityScore);
  const conformityGrade = gradeFromScore(conformityScore);
  const cohesionGrade = gradeFromScore(cohesionScore);
  const conflictGrade = gradeFromScore(conflictScore, true); // 갈등은 낮을수록 좋음
  const productivityGrade = gradeFromScore(productivityScore);

  // 설명 문구 간단 로직
  const diversityText =
    diversityScore >= 0.7
      ? "다양한 미생물이 공존하고 있습니다. 사회적으로는 여러 정체성이 공존하는 포용적 상태에 가깝습니다."
      : diversityScore >= 0.4
      ? "다양성은 유지되고 있으나 일부 종이 과도하게 우세해지고 있습니다. 사회적으로는 특정 정상성이 강하게 작동하는 상태입니다."
      : "장내 다양성이 낮아 획일화된 생태계에 가깝습니다. 사회적으로는 한 가지 기준만 강요되는 비포용적 상태로 읽힙니다.";

  const conformityText =
    conformityScore >= 0.7
      ? "유익균 비율이 높고 병원성 미생물은 낮은 편입니다. 규범을 잘 따르는 순응형 시민에 가까운 프로파일입니다."
      : conformityScore >= 0.4
      ? "유익균과 잠재적 병원균이 섞여 있습니다. 사회 규범에 대체로 맞지만 때때로 경계 대상이 되는 존재로 읽힙니다."
      : "병원성·잠재적 유해균의 비율이 높습니다. 사회가 쉽게 '문제적'으로 낙인찍을 수 있는 몸의 상태로 해석됩니다.";

  const cohesionText =
    cohesionScore >= 0.7
      ? "SCFA(특히 Butyrate) 생산이 활발해 공동체 결속 에너지가 높은 상태입니다. 서로를 지탱하는 힘이 충분합니다."
      : cohesionScore >= 0.4
      ? "기초 에너지는 유지되지만 결속력이 흔들릴 수 있는 수준입니다. 사회적으로는 관계망이 느슨해지는 과도기입니다."
      : "SCFA 생산이 떨어져 에너지 부족 상태에 가깝습니다. 사회적으로는 서로를 지탱할 힘이 부족한, 해체 직전의 공동체에 비유할 수 있습니다.";

  const conflictText =
    conflictScore >= 0.7
      ? "LPS와 염증성 사이토카인이 높아 만성 염증 상태에 가깝습니다. 사회적으로는 혐오·갈등이 일상화된 고강도 분열 상태입니다."
      : conflictScore >= 0.4
      ? "염증 지표가 다소 상승한 상태입니다. 사회적으로는 갈등 이슈가 반복적으로 나타나며 긴장이 계속 유지되는 국면입니다."
      : "염증 지표가 낮아 비교적 안정적인 상태입니다. 사회적으로는 갈등이 국소적으로 발생하더라도 빠르게 봉합되는 편입니다.";

  const productivityText =
    productivityScore >= 0.7
      ? "장 내 대사 효율이 높아 에너지를 잉여까지 확보하는 상태입니다. 사회적으로는 고효율·고생산성을 강하게 요구받는 위치에 있습니다."
      : productivityScore >= 0.4
      ? "필수 기능을 수행할 만큼의 대사 효율을 유지하고 있습니다. 사회적으로는 평균적인 생산성을 가진 시민으로 평가됩니다."
      : "대사 효율이 낮아 에너지 확보가 버겁습니다. 사회적으로는 '비효율적'이라는 낙인이 쉽게 찍힐 수 있는 조건입니다.";

  // 장 그림
  if (gutVisualEl) gutVisualEl.style.display = "block";
  if (gutImageEl) {
    if (overallScore >= 0.7) {
      gutImageEl.src = "assets/img/gut-good.png";
    } else if (overallScore >= 0.4) {
      gutImageEl.src = "assets/img/gut-neutral.png";
    } else {
      gutImageEl.src = "assets/img/gut-bad.png";
    }
  }

  // 실제 DOM 출력
  resultListEl.style.display = "block";
  resultListEl.innerHTML = `
    <div class="gut-report">
      <!-- 좌측: 전체 점수 + 장내 이미지 -->
      <section class="gut-report-main">
        <div class="gut-report-overall">
          <div class="gut-report-overall-label">사회 적응도</div>
          <div class="gut-report-overall-score">${overallScoreText}</div>
          <p class="gut-report-overall-sub">
            귀하의 장내 생태는 <strong>사회 적응도 ${overallScoreText}</strong>로 환산되었습니다.
          </p>
          <p class="gut-report-overall-desc">
            이 점수는 장내 다양성, 규범 적합도, 공동체 결속, 갈등·염증 지표, 대사 효율을 통합하여 계산한
            <strong>사회 정상성 지수</strong>입니다. 점수가 높을수록 현재 사회가 요구하는 기준에 잘 맞는
            몸의 상태로 평가되며, 낮을수록 다른 형태의 가능성을 품은 상태로 읽을 수 있습니다.
          </p>
        </div>

        <div class="gut-report-visual">
          <div class="gut-report-gut-image">
            ${gutImageEl ? gutImageEl.outerHTML : ""}
          </div>
          <div class="gut-report-gut-caption">
            장내 생태를 사회 인프라로 번역한 시각화입니다.
          </div>
        </div>
      </section>

      <!-- 우측: 다섯 가지 범주 카드 -->
      <section class="gut-report-cards">
        <article class="gut-card gut-card--diversity">
          <header class="gut-card-header">
            <h3 class="gut-card-title">장내 다양성 &amp; 정상성의 폭</h3>
            <div class="gut-card-grade">
              <span class="gut-card-grade-letter">${diversityGrade}</span>
              <span class="gut-card-grade-score">${pct(diversityScore)}</span>
            </div>
          </header>
          <p class="gut-card-metric">
            Shannon 다양성 지수 D: <strong>${profile.D.toFixed(2)}</strong>
          </p>
          <p class="gut-card-text">
            ${diversityText}
          </p>
        </article>

        <article class="gut-card gut-card--conformity">
          <header class="gut-card-header">
            <h3 class="gut-card-title">규범 적합도 (순응 점수)</h3>
            <div class="gut-card-grade">
              <span class="gut-card-grade-letter">${conformityGrade}</span>
              <span class="gut-card-grade-score">${pct(conformityScore)}</span>
            </div>
          </header>
          <p class="gut-card-metric">
            유익균 비율 B: <strong>${profile.B.toFixed(2)}</strong>,
            병원성 비율 P: <strong>${profile.P.toFixed(2)}</strong>
          </p>
          <p class="gut-card-text">
            ${conformityText}
          </p>
        </article>

        <article class="gut-card gut-card--cohesion">
          <header class="gut-card-header">
            <h3 class="gut-card-title">공동체 결속 에너지 (SCFA)</h3>
            <div class="gut-card-grade">
              <span class="gut-card-grade-letter">${cohesionGrade}</span>
              <span class="gut-card-grade-score">${pct(cohesionScore)}</span>
            </div>
          </header>
          <p class="gut-card-metric">
            Butyrate 생산량 Bt: <strong>${profile.Bt.toFixed(1)}</strong>
          </p>
          <p class="gut-card-text">
            ${cohesionText}
          </p>
        </article>

        <article class="gut-card gut-card--conflict">
          <header class="gut-card-header">
            <h3 class="gut-card-title">갈등·혐오 지수 (염증 로드)</h3>
            <div class="gut-card-grade">
              <span class="gut-card-grade-letter">${conflictGrade}</span>
              <span class="gut-card-grade-score">${pct(conflictScore)}</span>
            </div>
          </header>
          <p class="gut-card-metric">
            LPS L: <strong>${profile.L.toFixed(2)}</strong>,
            Cytokine C: <strong>${profile.C.toFixed(1)}</strong>
          </p>
          <p class="gut-card-text">
            ${conflictText}
          </p>
        </article>

        <article class="gut-card gut-card--productivity">
          <header class="gut-card-header">
            <h3 class="gut-card-title">사회적 생산성/효율성</h3>
            <div class="gut-card-grade">
              <span class="gut-card-grade-letter">${productivityGrade}</span>
              <span class="gut-card-grade-score">${pct(
                productivityScore
              )}</span>
            </div>
          </header>
          <p class="gut-card-metric">
            대사 효율 EEE: <strong>${profile.EEE.toFixed(2)}</strong>
          </p>
          <p class="gut-card-text">
            ${productivityText}
          </p>
        </article>
      </section>
    </div>
  `;
}

// -----------------------------
// 랜덤 장내 프로필 생성
// -----------------------------
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

// Supabase 상장
async function listCardToSupabase() {
  const profile = createRandomGutProfile();
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

// -----------------------------
// 메인 루프 (1초 단위)
// -----------------------------
function mainLoopTick() {
  const USE_PRESSURE_GUARD = false;

  const isScanPhase =
    currentPhase === "A1-2" ||
    currentPhase === "B1" ||
    currentPhase === "B2" ||
    currentPhase === "B3" ||
    currentPhase === "C1";

  // 🔹 스캔 중일 때만 전역 타이머 증가
  if (isScanPhase && scanOverallTimer < SCAN_OVERALL_TOTAL) {
    scanOverallTimer++;
  }

  if (USE_PRESSURE_GUARD && !pressureOn && currentPhase.startsWith("B")) {
    setPhase("D1");
    scanTimer = 0;
    purity = 0;
    updateProgress();
    return;
  }

  switch (currentPhase) {
    case "A1-2":
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

      if (scanTimer >= scanTotal) {
        startScanResultTransition();
      }
      break;

    default:
      break;
  }
}

// -----------------------------
// 센서 이벤트
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
    lastSitTime = Date.now();
    if (standbyHintEl) standbyHintEl.style.display = "none";

    setPhase("A1-2");
    scanTimer = 0;
    purity = 0;
    updateProgress();
  } else {
    if (currentPhase.startsWith("B") || currentPhase === "A1-2") {
      setPhase("D1");
      scanTimer = 0;
      purity = 0;
      updateProgress();
    } else {
      setPhase("A0-2");
    }
  }
}

// -----------------------------
// 버튼 바인딩
// -----------------------------
if (debugStartBtn) {
  debugStartBtn.addEventListener("click", () => {
    pirOn = false;
    pressureOn = false;
    scanTimer = 0;
    purity = 0;
    microProgress = 0;
    scanResultStarted = false;
    scanOverallTimer = 0;

    resetScanProgressUI();

    updateSensorStatus();
    setPhase("A0-1");
  });
}

if (btnPirOn) {
  btnPirOn.addEventListener("click", () => onPirChange(true));
}
if (btnPirOff) {
  btnPirOff.addEventListener("click", () => onPirChange(false));
}
if (btnSit) {
  btnSit.addEventListener("click", () => onPressureChange(true));
}
if (btnStand) {
  btnStand.addEventListener("click", () => onPressureChange(false));
}
if (btnReset) {
  btnReset.addEventListener("click", () => {
    pirOn = false;
    pressureOn = false;
    scanTimer = 0;
    purity = 0;
    microProgress = 0;
    scanResultStarted = false;

    resetScanProgressUI();

    updateSensorStatus();
    setPhase("A0-1");
  });
}

if (btnYes) {
  btnYes.addEventListener("click", async () => {
    setPhase("C3");
    await listCardToSupabase();
    setTimeout(() => {
      pirOn = false;
      pressureOn = false;
      scanTimer = 0;
      purity = 0;
      microProgress = 0;
      scanResultStarted = false;

      resetScanProgressUI();

      updateSensorStatus();
      setPhase("A0-1");
    }, 3000);
  });
}

if (btnNo) {
  btnNo.addEventListener("click", () => {
    setPhase("C4");
    setTimeout(() => {
      pirOn = false;
      pressureOn = false;
      scanTimer = 0;
      purity = 0;
      microProgress = 0;
      scanResultStarted = false;
      updateSensorStatus();
      setPhase("A0-1");
    }, 4000);
  });
}

// -----------------------------
// 초기화 & 루프 시작
// -----------------------------
setPhase("A0-1");
updateSensorStatus();
updateProgress();

loopInterval = setInterval(mainLoopTick, 1000);

// -----------------------------
// 터치 테스트: standby → POSTURE
// -----------------------------
let testTriggered = false;

standbyScreenEl.addEventListener("click", () => {
  if (testTriggered) return;
  if (currentPhase === "A0-1" || currentPhase === "A0-2") {
    testTriggered = true;
    setPhase("POSTURE");
    scanTimer = 0;
    purity = 0;
    updateProgress();
  }
});

// -----------------------------
// POSTURE 화면 터치 → A1-2
// -----------------------------
if (postureEl) {
  postureEl.addEventListener("click", () => {
    if (currentPhase !== "POSTURE") return;
    setPhase("A1-2");
    scanTimer = 0;
    purity = 0;
    updateProgress();
  });
}
