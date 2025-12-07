// assets/js/scan.js

const db = window.supabaseClient;

const standbyScreenEl = document.getElementById("standbyScreen");
const scanHeaderEl = document.getElementById("scanHeader");
const scanRootEl = document.getElementById("scanRoot");

// 🔹 이걸로 교체해
const standbyCanvas = document.getElementById("standbyParticles");
const standbyCtx = standbyCanvas ? standbyCanvas.getContext("2d") : null;

const postureEl = document.getElementById("scanPosture");
const scanTopRowEl = document.getElementById("scanTopRow");
const scanMainMessageEl = document.getElementById("scanMainMessage");
const scanBottomEl = document.getElementById("scanBottom");
const standbyHintEl = document.getElementById("standbyHint");

const sensorSimEl = document.getElementById("sensorSim");

const postureLine1El = document.getElementById("postureLine1");
const postureLine2El = document.getElementById("postureLine2");
const postureLine3El = document.getElementById("postureLine3");
const postureLine4El = document.getElementById("postureLine4");

const postureProgressInner = document.getElementById("postureProgressInner");
// start 점은 빼고, data-step 있는 1·2·3만 대상으로
// 🔹 시작점 없이, 실제 단계(1~4)만 선택
const postureStepEls = document.querySelectorAll(".posture-step[data-step]");

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

let postureTimers = [];

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

window.addEventListener("resize", () => {
  resizeMicrobes();
});

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
      p.morphT = Math.min(1, p.morphT + 0.008);
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
      // 힌트 다시 보이게
      if (standbyHintEl) {
        standbyHintEl.style.display = "block";
      }
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
      showMicrobes(false);
      break;

    case "A0-2": // 접근 감지
      statusSystemEl.textContent = "READY";
      mainMessageEl.textContent = "착석 시 스캔 절차가 시작됩니다.";
      subMessageEl.textContent = "몇 초간 안정된 자세를 유지해 주세요.";
      secondaryMessageEl.textContent =
        "장내자산관리공단입니다. 착석하시면 장내 데이터 스캔이 시작됩니다.";
      scanBgEl.className = "scan-bg particles";
      scanBgEl.style.opacity = 0.45;
      showMicrobes(false);
      break;

    case "A1-1": // 착석 확인 = 자세 안내 화면
      statusSystemEl.textContent = ""; // 상태 텍스트 안 씀

      // 1) 시스템용 텍스트/상단/하단 UI 전부 숨기기
      if (scanTopRowEl) scanTopRowEl.style.display = "none";
      if (scanMainMessageEl) scanMainMessageEl.style.display = "none";
      if (scanBottomEl) scanBottomEl.style.display = "none";
      warningMessageEl.style.display = "none";
      resultListEl.style.display = "none";

      // 2) 자세 안내 전용 블록만 보이게
      if (postureEl) postureEl.style.display = "flex";

      // 3) 배경은 부드럽게
      scanBgEl.className = "scan-bg particles";
      scanBgEl.style.opacity = 0.5;
      break;

    case "POSTURE": {
      statusSystemEl.textContent = "";

      // 상단/UI 숨기기
      if (scanHeaderEl) scanHeaderEl.style.display = "none";
      if (scanTopRowEl) scanTopRowEl.style.display = "none";
      if (scanMainMessageEl) scanMainMessageEl.style.display = "none";
      if (scanBottomEl) scanBottomEl.style.display = "none";
      if (sensorSimEl) sensorSimEl.style.display = "none";
      warningMessageEl.style.display = "none";
      resultListEl.style.display = "none";

      // posture 화면만 보이게
      if (postureEl) postureEl.style.display = "flex";

      scanBgEl.className = "scan-bg particles";
      scanBgEl.style.opacity = 0.6;

      const seqText = document.getElementById("postureSequenceText");
      const postureGraphicEl = document.querySelector(".posture-graphic");
      const postureTitleEl = document.querySelector(".posture-message");
      const stepperEl = document.querySelector(".posture-stepper");

      // 🔹 4단계 문장
      const seq = [
        "등을 곧게 세우고 상체를 안정시켜 주세요.",
        "배에 힘을 주어 장 쪽으로 압력을 모아 주세요.",
        "조금만 더 힘을 유지해 주세요. 장 안에서 내용물이 이동하고 있습니다.",
        "이제 아래로 부드럽게 밀어내며 배출을 시작해 주세요.",
      ];

      let idx = 0;
      let currentProgress = 0;

      // 🔥 여기서 완전 리셋
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
      if (stepperEl) {
        stepperEl.style.opacity = 1;
      }
      // 그래픽·제목·부제 복구
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

      // SVG 강조 애니메이션 (단계마다 강도 점점 ↑)
      function pumpSVG(stepIndex) {
        const img = document.getElementById("postureImg");
        if (!img) return;
        const base = 1.05;
        const extra = stepIndex * 0.02; // 단계가 뒤로 갈수록 조금 더 세게
        const scale = base + extra;

        img.style.transition = "transform 0.35s ease";
        img.style.transform = `scale(${scale})`;
        setTimeout(() => (img.style.transform = "scale(1.0)"), 350);
      }

      // 부드러운 로딩바 애니메이션
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

      // 스캔씬으로 넘어가기
      function goToScanPhase() {
        setPhase("A1-2");
        scanTimer = 0;
        purity = 0;
        updateProgress();
      }

      function nextSentence() {
        if (!seqText) return;

        const lastIndex = seq.length - 1;

        if (idx > lastIndex) {
          // 이미 끝난 상태면 아무 것도 안 함
          return;
        }

        // 1) 같은 자리에서 문장 교체
        seqText.innerText = seq[idx];
        seqText.style.opacity = 1;

        // 2) 문장만 먼저 충분히 보이게 (1.4초)
        const t1 = setTimeout(() => {
          // 3) SVG 강하게 한 번 펌핑 (단계마다 강도 ↑)
          pumpSVG(idx);

          // 4) 펌핑 끝난 뒤 로딩바 부드럽게 채우기
          const t2 = setTimeout(() => {
            const target = ((idx + 1) / seq.length) * 100; // 25, 50, 75, 100

            animateProgressTo(target, () => {
              // 5) 로딩바가 해당 지점까지 다 채워진 뒤 → 그 지점에 체크
              if (postureStepEls && postureStepEls[idx]) {
                postureStepEls[idx].classList.add("completed");
                const check = postureStepEls[idx].querySelector(
                  ".posture-step-check"
                );
                if (check) check.style.opacity = "1";
              }

              if (idx === lastIndex) {
                // 🔚 마지막 단계: 여기까지 온 시점에서
                // → 바는 100%, 체크 4개 모두 켜진 상태

                // 5-1) 잠깐 여운 (0.8초)
                const afterFullTimer = setTimeout(() => {
                  // 5-2) 인포그래픽 / 제목 / 부제 / 스텝퍼 전부 사라짐
                  if (postureGraphicEl) postureGraphicEl.style.display = "none";
                  if (stepperEl) stepperEl.style.opacity = 0;
                  if (postureTitleEl) postureTitleEl.style.opacity = 0;
                  if (postureLine4El) postureLine4El.style.opacity = 0;

                  // 5-3) 문장 영역을 감지 문구로 교체
                  seqText.style.opacity = 0;
                  const showDetectTimer = setTimeout(() => {
                    seqText.innerText =
                      "장내 배출 데이터가 감지되었습니다. 장내 데이터 정렬을 시작합니다.";
                    seqText.style.opacity = 1;
                  }, 400);

                  postureTimers.push(showDetectTimer);

                  // 5-4) 감지 문장만 충분히 보여준 뒤(3초) 스캔씬으로 이동
                  const toScanTimer = setTimeout(() => {
                    goToScanPhase();
                  }, 3400); // 0.4 + 3.0

                  postureTimers.push(toScanTimer);
                }, 800);

                postureTimers.push(afterFullTimer);
              } else {
                // 🔁 중간 단계들: 문장 사라지고 다음 문장으로
                const tFadeOut = setTimeout(() => {
                  seqText.style.opacity = 0;

                  // 문장 사이 텀 조금 더 길게 (0.9초)
                  const tNext = setTimeout(() => {
                    idx++;
                    nextSentence();
                  }, 900);
                  postureTimers.push(tNext);
                }, 900);

                postureTimers.push(tFadeOut);
              }
            });
          }, 500); // 펌핑 이후 숨 고르기

          postureTimers.push(t2);
        }, 1400); // 문장만 먼저 보이는 시간

        postureTimers.push(t1);
      }

      // 기존 타이머 정리 후 시작
      postureTimers.forEach(clearTimeout);
      postureTimers = [];
      nextSentence();

      break;
    }

    case "A1-2":
      // 자세 안내 숨기기
      if (postureEl) postureEl.style.display = "none";

      // 상단/메인/하단 UI 다시 활성화
      if (scanTopRowEl) scanTopRowEl.style.display = "flex";
      if (scanMainMessageEl) scanMainMessageEl.style.display = "block";
      if (scanBottomEl) scanBottomEl.style.display = "flex";
      if (sensorSimEl) sensorSimEl.style.display = "flex"; // 스캔 씬에서만 필요하면 남기고, 아니라면 지워

      mainMessageEl.textContent = "초기 상태를 측정하고 있습니다.";
      subMessageEl.textContent = "몇 초간 안정된 자세를 유지해 주세요.";
      secondaryMessageEl.textContent = "";
      scanBgEl.className = "scan-bg particles";
      scanBgEl.style.opacity = 0.7;
      showMicrobes(false);
      break;

    case "B1": // 안정화
      statusSystemEl.textContent = "SCANNING";
      mainMessageEl.textContent = "신체 데이터를 정렬하고 있습니다.";
      subMessageEl.textContent = "천천히 호흡하며 자세를 유지해 주세요.";
      secondaryMessageEl.textContent = "";
      scanBgEl.className = "scan-bg particles";
      scanBgEl.style.opacity = 0.6;

      showMicrobes(true); // ✅ 여기 켜져 있어야 함
      break;

    case "B2": // 힘 주기
      statusSystemEl.textContent = "SCANNING";
      mainMessageEl.textContent = "이제 힘을 주세요.";
      subMessageEl.textContent = "숨을 들이 마시고, 천천히 힘을 모아 주세요.";
      secondaryMessageEl.textContent = "";
      scanBgEl.className = "scan-bg spiral";
      scanBgEl.style.opacity = 0.65;

      showMicrobes(true);
      break;

    case "B3": // 힘 풀고 안정
      statusSystemEl.textContent = "SCANNING";
      mainMessageEl.textContent = "이제 힘을 풀고, 그대로 유지해 주세요.";
      subMessageEl.textContent = "정제된 데이터가 내부에서 정리되고 있습니다.";
      secondaryMessageEl.textContent = "";
      scanBgEl.className = "scan-bg noise";
      scanBgEl.style.opacity = 0.6;

      showMicrobes(true);
      break;

    case "C1": // 응축 + 완료 알림
      statusSystemEl.textContent = "COMPLETING";
      mainMessageEl.textContent = "스캔이 완료되었습니다.";
      subMessageEl.textContent = "정제된 장내 데이터 분석을 진행합니다.";
      secondaryMessageEl.textContent = "";
      scanBgEl.className = "scan-bg spiral";
      scanBgEl.style.opacity = 0.8;

      showMicrobes(true);
      break;

    case "C2": // 결과 화면
      statusSystemEl.textContent = "RESULT";
      mainMessageEl.textContent = "장내 데이터 분석 결과입니다.";
      subMessageEl.textContent = "";
      secondaryMessageEl.textContent =
        "이 장내 데이터를 사회 자산으로 상장하시겠습니까?";
      decisionButtonsEl.style.display = "flex";
      renderAnalysisResult();

      showMicrobes(false);
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
      showMicrobes(false);
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

// 🔹 3D 미생물 씬 -----------------------------
const scanMicrobesCanvas = document.getElementById("scanMicrobes");

let microScene = null;
let microCamera = null;
let microRenderer = null;
let microGroup = null;
let microAnimReq = null;
let microIsActive = false;
let microStartTime = 0;
let microLoaded = false;

// ❗ 실제 파일 이름에 맞게 수정해줘
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
  microScene.fog = new THREE.FogExp2(0x050816, 0.008);

  microCamera = new THREE.PerspectiveCamera(40, width / height, 0.1, 100);
  microCamera.position.set(0, 0, 26);

  const amb = new THREE.AmbientLight(0xffffff, 0.6);
  const dir = new THREE.DirectionalLight(0xffffff, 0.9);
  dir.position.set(5, 10, 7);
  microScene.add(amb, dir);

  microGroup = new THREE.Group();
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
      const COUNT = 60; // 전체 미생물 개수

      for (let i = 0; i < COUNT; i++) {
        // 4개 glb를 번갈아 사용
        const baseScene = scenes[i % scenes.length].clone(true);

        const wrapper = new THREE.Group();
        wrapper.add(baseScene);

        // 화면 가운데를 중심으로 구(구체 껍질) 안에 랜덤 배치
        const radius = 7 + Math.random() * 4;
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);

        const x = radius * Math.sin(phi) * Math.cos(theta);
        const y = radius * Math.sin(phi) * Math.sin(theta);
        const z = radius * Math.cos(phi);

        wrapper.position.set(x, y, z);

        const baseScale = 0.4 + Math.random() * 0.8;
        wrapper.scale.set(baseScale, baseScale, baseScale);

        wrapper.userData = {
          basePos: wrapper.position.clone(),
          baseScale,
          offset: Math.random() * 1000,
          swirlDir: Math.random() > 0.5 ? 1 : -1,
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

  microGroup.children.forEach((wrapper) => {
    const d = wrapper.userData;
    const wobble = Math.sin(t * 1.2 + d.offset) * 0.4;
    const wobble2 = Math.cos(t * 0.9 + d.offset * 1.3) * 0.4;

    const r = d.basePos.length();
    const phase = t * 0.25 + d.offset * 0.1 * d.swirlDir;

    const x = r * Math.sin(phase) * Math.cos(d.offset);
    const y = r * Math.sin(phase) * Math.sin(d.offset);
    const z = r * Math.cos(phase);

    wrapper.position.set(
      x + wobble * 0.8,
      y + wobble2 * 0.8,
      z + Math.sin(t * 0.7 + d.offset) * 0.6
    );

    wrapper.rotation.x += 0.01 * d.swirlDir;
    wrapper.rotation.y += 0.013;

    const breath = 1 + Math.sin(t * 1.5 + d.offset) * 0.15;
    const s = d.baseScale * breath;
    wrapper.scale.set(s, s, s);
  });

  microGroup.rotation.y = Math.sin(t * 0.15) * 0.35;

  microRenderer.render(microScene, microCamera);
  microAnimReq = requestAnimationFrame(animateMicrobes);
}

function showMicrobes(active) {
  microIsActive = active;
  if (!scanMicrobesCanvas) return;

  if (active) {
    initMicrobeScene();
    resizeMicrobes();

    // 로딩 끝나기 전에는 투명, 다 로드되면 0.9로
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
  const USE_PRESSURE_GUARD = false; // 👉 나중에 센서 붙이면 true로 바꿔

  if (USE_PRESSURE_GUARD && !pressureOn && currentPhase.startsWith("B")) {
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
    // 터치/착석 시: 대기 화면 힌트 숨기고 바로 스캔 화면으로
    lastSitTime = Date.now();

    if (standbyHintEl) {
      standbyHintEl.style.display = "none";
    }

    // ✅ 로고 모핑, 지연 전부 빼고 바로 스캔 초기화 단계로 진입
    setPhase("A1-2");
    scanTimer = 0;
    purity = 0;
    updateProgress();
  } else {
    // 이탈 처리 (그대로 둔다)
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

// -----------------------------
// 터치로 테스트: Standby 화면을 터치하면
// 착석(압력센서 ON)과 동일하게 동작
// -----------------------------
let testTriggered = false;

standbyScreenEl.addEventListener("click", () => {
  // 대기 상태일 때만 작동하게
  if (testTriggered) return;
  if (currentPhase === "A0-1" || currentPhase === "A0-2") {
    testTriggered = true;

    // ✅ 센서 대신, 바로 자세 유도 씬으로 전환
    setPhase("POSTURE");
    scanTimer = 0;
    purity = 0;
    updateProgress();
  }
});

// -----------------------------
// POSTURE 화면을 터치하면 스캔(A1-2)로 넘어가기
// -----------------------------
if (postureEl) {
  postureEl.addEventListener("click", () => {
    if (currentPhase !== "POSTURE") return;

    // 나중에 압력센서 체크 들어갈 자리.
    // 지금은 터치하면 곧바로 캘리브레이션 단계로 이동.
    setPhase("A1-2");
    scanTimer = 0;
    purity = 0;
    updateProgress();
  });
}
