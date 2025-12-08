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

const scanSequenceEl = document.getElementById("scanSequence");
const scanSequenceTextEl = document.getElementById("scanSequenceText");
const scanStepEls = document.querySelectorAll(".scan-step[data-scan-step]");

const standbyShaderCanvas = document.getElementById("standbyShader");

const scanSequenceProgressInnerEl = document.getElementById(
  "scanSequenceProgressInner"
);

// -----------------------------
// 상태 및 타이머 관리
// -----------------------------
let currentPhase = "A0-1";
let scanRunning = false;

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

// -----------------------------
// Standby 셰이더 배경 (flowmap 없이 꿀렁)
// -----------------------------
let standbyShaderRenderer = null;
let standbyShaderScene = null;
let standbyShaderCamera = null;
let standbyShaderMesh = null;
let standbyShaderClock = null;
let standbyShaderAnimId = null;
let standbyShaderReady = false;

const standbyVertexShader = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position, 1.0);
  }
`;

const standbyFragmentShader = `
  uniform float u_time;
  uniform sampler2D u_texture;
  varying vec2 vUv;

  void main() {
    vec2 uv = vUv;

    // 세로/가로로 겹치는 파동
    float wave1 = sin(uv.y * 5.0 + u_time * 1.2) * 0.015;
    float wave2 = sin(uv.x * 7.0 - u_time * 1.0) * 0.01;

    // 약간 더 유기적으로
    float wave3 = sin((uv.x + uv.y) * 8.0 + u_time * 0.8) * 0.008;

    uv.x += wave1 + wave2 + wave3;

    vec4 color = texture2D(u_texture, uv);

    // 살짝 어둡게/보라톤 살리기 (원하면 조절)
    color.rgb *= 1.05;

    gl_FragColor = color;
  }
`;

function initStandbyShader() {
  if (!standbyShaderCanvas || standbyShaderRenderer) return;
  if (!window.THREE) return;

  const THREE = window.THREE;

  standbyShaderRenderer = new THREE.WebGLRenderer({
    canvas: standbyShaderCanvas,
    alpha: true,
    antialias: true,
  });
  standbyShaderRenderer.setPixelRatio(window.devicePixelRatio || 1);
  standbyShaderRenderer.setSize(window.innerWidth, window.innerHeight);

  standbyShaderScene = new THREE.Scene();

  // -1~+1 전체 화면을 덮는 정사각형
  standbyShaderCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  standbyShaderScene.add(standbyShaderCamera);

  const geometry = new THREE.PlaneGeometry(2, 2);

  const textureLoader = new THREE.TextureLoader();
  const texture = textureLoader.load("assets/img/Standby.jpg", () => {
    standbyShaderReady = true;
  });

  texture.wrapS = texture.wrapT = THREE.MirroredRepeatWrapping;

  const material = new THREE.ShaderMaterial({
    uniforms: {
      u_time: { value: 0 },
      u_texture: { value: texture },
    },
    vertexShader: standbyVertexShader,
    fragmentShader: standbyFragmentShader,
  });

  standbyShaderMesh = new THREE.Mesh(geometry, material);
  standbyShaderScene.add(standbyShaderMesh);

  standbyShaderClock = new THREE.Clock();
}

function animateStandbyShader() {
  if (!standbyShaderRenderer || !standbyShaderScene || !standbyShaderCamera) {
    return;
  }

  const dt = standbyShaderClock.getDelta();
  const elapsed = standbyShaderClock.getElapsedTime();

  if (standbyShaderMesh && standbyShaderMesh.material && standbyShaderReady) {
    standbyShaderMesh.material.uniforms.u_time.value = elapsed;
  }

  standbyShaderRenderer.render(standbyShaderScene, standbyShaderCamera);

  standbyShaderAnimId = requestAnimationFrame(animateStandbyShader);
}

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

const scanResultLayoutEl = document.getElementById("scanResultLayout");
const gutVisualEl = document.getElementById("gutVisual");
const gutImageEl = document.getElementById("gutImage");

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

const metaContainerEl = document.querySelector(".global-logo-meta");
const metaStatusEl = document.getElementById("metaStatus");
const metaLevelEl = document.getElementById("metaLevel");
const metaIdEl = document.getElementById("metaId");
const metaDateEl = document.getElementById("metaDate");

// 윈도우 리사이즈 시 3D 씬 리사이즈
window.addEventListener("resize", () => {
  resizeMicrobes();

  if (standbyShaderRenderer) {
    standbyShaderRenderer.setSize(window.innerWidth, window.innerHeight);
  }
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

const SCAN_STEP_COUNT = scanStepTexts.length;
let currentScanStep = -1;

function positionScanSteps() {
  scanStepEls.forEach((el, i) => {
    const ratio = (i + 1) / SCAN_STEP_COUNT; // 25%, 50%, 75%, 100%
    el.style.left = `${ratio * 100}%`;
  });
}

function updateScanStepUI(stepIdx, completedCount) {
  if (!scanSequenceEl) return;

  if (stepIdx < 0) {
    // 스캔 안 할 때 → 숨기기 + 초기화
    scanSequenceEl.style.display = "none";
    if (scanSequenceTextEl) scanSequenceTextEl.textContent = "";

    scanStepEls.forEach((el) => {
      el.classList.remove("completed");
      const check = el.querySelector(".scan-step-check");
      if (check) check.style.opacity = "0";
    });

    if (scanSequenceProgressInnerEl) {
      scanSequenceProgressInnerEl.style.width = "0%";
    }

    currentScanStep = -1;
    return;
  }

  const idx = Math.max(0, Math.min(SCAN_STEP_COUNT - 1, stepIdx));
  scanSequenceEl.style.display = "block";

  // 현재 단계 문장
  if (scanSequenceTextEl) {
    scanSequenceTextEl.textContent = scanStepTexts[idx];
  }

  // ✅ 완료된 칸 개수(0~4)로 클램프
  const maxCompleted = Math.max(
    0,
    Math.min(SCAN_STEP_COUNT, completedCount ?? 0)
  );

  // ✅ 체크: 완전히 끝난 칸까지만 체크
  //   - maxCompleted = 0 → 체크 0개 (시작)
  //   - maxCompleted = 1 → 첫 칸만 체크
  //   - ...
  scanStepEls.forEach((el, i) => {
    const check = el.querySelector(".scan-step-check");
    const completed = i < maxCompleted; // i < 1 → 첫 칸만, i < 2 → 첫/두 번째 ...
    el.classList.toggle("completed", completed);
    if (check) check.style.opacity = completed ? "1" : "0";
  });

  currentScanStep = idx;
}

// -----------------------------
// Phase 전환
// -----------------------------
function setPhase(phase) {
  if (currentPhase === phase) return;
  currentPhase = phase;

  if (metaContainerEl) {
    metaContainerEl.style.display = phase === "C2" ? "flex" : "none";
  }

  if (statusPhaseEl) statusPhaseEl.textContent = phase;
  if (warningMessageEl) warningMessageEl.style.display = "none";
  if (resultListEl) resultListEl.style.display = "none";
  if (decisionButtonsEl) decisionButtonsEl.style.display = "none";

  if (scanResultLayoutEl) scanResultLayoutEl.style.display = "none";
  if (gutVisualEl) gutVisualEl.style.display = "none";

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

    // 🔹 셰이더 배경 초기화 + 애니메이션 시작
    initStandbyShader();
    if (!standbyShaderAnimId) {
      standbyShaderAnimId = requestAnimationFrame(animateStandbyShader);
    }
  } else {
    if (standbyScreenEl) standbyScreenEl.style.display = "none";
    if (scanHeaderEl) scanHeaderEl.style.display = "flex";
    if (scanRootEl) scanRootEl.style.display = "flex";

    if (standbyAnimReq) {
      cancelAnimationFrame(standbyAnimReq);
      standbyAnimReq = null;
    }

    // 필요하면 스캔 중에는 셰이더 멈추고 싶을 때:
    // if (standbyShaderAnimId) {
    //   cancelAnimationFrame(standbyShaderAnimId);
    //   standbyShaderAnimId = null;
    // }
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

      resetScanSteps();

      break;

    case "A0-2":
      if (statusSystemEl) statusSystemEl.textContent = "READY";
      mainMessageEl.textContent = "착석 시 스캔 절차가 시작됩니다.";
      subMessageEl.textContent = "몇 초간 안정된 자세를 유지해 주세요.";
      secondaryMessageEl.textContent =
        "장내자산관리공단입니다. 착석하시면 장내 데이터 스캔이 시작됩니다.";
      scanBgEl.className = "scan-bg particles";
      scanBgEl.style.opacity = 0.45;

      positionScanSteps();
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
      if (scanRunning) return;
      scanRunning = true;

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

      break;

    case "B1":
      if (statusSystemEl) statusSystemEl.textContent = "SCANNING";
      mainMessageEl.textContent = "신체 데이터를 정렬하고 있습니다.";
      subMessageEl.textContent = "천천히 호흡하며 자세를 유지해 주세요.";
      secondaryMessageEl.textContent = "";
      scanBgEl.className = "scan-bg particles";
      scanBgEl.style.opacity = 0.6;
      showMicrobes(true);

      break;

    case "B2":
      if (statusSystemEl) statusSystemEl.textContent = "SCANNING";
      mainMessageEl.textContent = "이제 힘을 주세요.";
      subMessageEl.textContent = "숨을 들이 마시고, 천천히 힘을 모아 주세요.";
      secondaryMessageEl.textContent = "";
      scanBgEl.className = "scan-bg spiral";
      scanBgEl.style.opacity = 0.65;
      showMicrobes(true);

      break;

    case "B3":
      if (statusSystemEl) statusSystemEl.textContent = "SCANNING";
      mainMessageEl.textContent = "이제 힘을 풀고, 그대로 유지해 주세요.";
      subMessageEl.textContent = "정제된 데이터가 내부에서 정리되고 있습니다.";
      secondaryMessageEl.textContent = "";
      scanBgEl.className = "scan-bg noise";
      scanBgEl.style.opacity = 0.6;
      showMicrobes(true);

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

      if (scanResultLayoutEl) scanResultLayoutEl.style.display = "grid";
      if (gutVisualEl) gutVisualEl.style.display = "flex";

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
      scanRunning = false;
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
  // 정제율 텍스트
  if (purityValueEl) {
    purityValueEl.textContent = `${Math.round(purity)}%`;
  }

  const isScanPhase =
    currentPhase === "A1-2" ||
    currentPhase === "B1" ||
    currentPhase === "B2" ||
    currentPhase === "B3" ||
    currentPhase === "C1";

  if (!progressTimeEl || !remainingTimeEl || !statusTimerEl) {
    return;
  }

  if (isScanPhase) {
    // 🔹 0~1 구간: 정제율 기준
    const ratio = Math.min(1, Math.max(0, purity / 100));

    // ⏱ 시간 텍스트는 기존처럼 scanOverallTimer 기준
    const elapsed = scanOverallTimer;
    const total = SCAN_OVERALL_TOTAL;
    progressTimeEl.textContent = `${formatTime(elapsed)} / ${formatTime(
      total
    )}`;
    const remaining = Math.max(0, total - elapsed);
    remainingTimeEl.textContent = `남은 시간: ${formatTime(remaining)}`;
    statusTimerEl.textContent = formatTime(elapsed);

    // ✅ 로딩바는 항상 부드럽게 채우기
    if (scanSequenceProgressInnerEl) {
      scanSequenceProgressInnerEl.style.width = `${ratio * 100}%`;
    }

    // 🔹 0~1 구간: 전체 스캔 시간 비율
    const timeRatio = Math.min(
      1,
      Math.max(0, scanOverallTimer / SCAN_OVERALL_TOTAL)
    );

    // 🔹 문장(stepIdx) — 총 4문장 (0~3)
    let stepIdx = 0;
    if (timeRatio >= 0.25) stepIdx = 1;
    if (timeRatio >= 0.5) stepIdx = 2;
    if (timeRatio >= 0.75) stepIdx = 3;

    // 🔹 체크(completedCount)
    //   0~24% → 0개
    //   25~49% → 1개
    //   50~74% → 2개
    //   75~99% → 3개
    //   100% → 4개
    let completedCount = 0;
    if (timeRatio >= 0.25) completedCount = 1;
    if (timeRatio >= 0.5) completedCount = 2;
    if (timeRatio >= 0.75) completedCount = 3;
    if (timeRatio >= 0.999) completedCount = 4;

    updateScanStepUI(stepIdx, completedCount);
  } else {
    updateScanStepUI(-1, 0);
  }
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

// 🔹 이 함수만 교체
function renderAnalysisResult() {
  if (!analysisResult || !resultListEl) return;

  const profile = analysisResult.profile;
  const sm = analysisResult.socialMetrics || {};
  const sniRaw = analysisResult.sni ?? 0.5;

  // === 전체 점수 / 등급 계산 ===
  const overallScore = Math.max(0, Math.min(1, sniRaw));
  const overallScoreText = overallScore.toFixed(2);

  // A/B/C 등급
  let overallGrade;
  if (overallScore >= 0.7) overallGrade = "A";
  else if (overallScore >= 0.4) overallGrade = "B";
  else overallGrade = "C";

  // 등급별 색상 (주식창처럼)
  const gradeColorMap = {
    A: "#22c55e", // 초록
    B: "#eab308", // 노랑
    C: "#ef4444", // 빨강
  };

  // 등급별 장 이미지 선택
  if (gutImageEl) {
    let imgPath = "assets/img/gut-neutral.png";
    if (overallGrade === "A") imgPath = "assets/img/gut-good.png";
    else if (overallGrade === "C") imgPath = "assets/img/gut-bad.png";
    gutImageEl.src = imgPath;
  }

  const gradeColor = gradeColorMap[overallGrade];

  // 등급별 한줄 상태 문장
  let actionLine;
  if (overallGrade === "A") {
    actionLine =
      "공단은 현재 장내 생태를 사회 순환 구조 유지에 적극 활용할 것을 권고합니다.";
  } else if (overallGrade === "B") {
    actionLine =
      "공단은 추가 개입 없이 경과 관찰을 권고합니다. 필요 시 부분적인 조정이 요구될 수 있습니다.";
  } else {
    actionLine = "공단은 사회 순환 효율 복원을 위한 조치 이행을 권고합니다.";
  }

  // === 5개 범주 점수 ===
  const pct = (x) => `${Math.round(x * 100)}%`;

  const diversityScore = 1 - (sm.NRS ?? 0.5); // 정상성 폭 (넓을수록 좋음)
  const conformityScore = sm.CS ?? 0.5;
  const cohesionScore = sm.CI ?? 0.5;
  const conflictScore = sm.CFI ?? 0.5; // 높을수록 갈등↑
  const productivityScore = sm.PS ?? 0.5;

  const gradeFromScore = (score, invert = false) => {
    let v = Math.max(0, Math.min(1, score));
    if (invert) v = 1 - v;
    if (v >= 0.7) return "A";
    if (v >= 0.4) return "B";
    return "C";
  };

  const diversityGrade = gradeFromScore(diversityScore);
  const conformityGrade = gradeFromScore(conformityScore);
  const cohesionGrade = gradeFromScore(cohesionScore);
  const conflictGrade = gradeFromScore(conflictScore, true);
  const productivityGrade = gradeFromScore(productivityScore);

  // 간단 설명들
  const diversityText =
    diversityScore >= 0.7
      ? "다양한 미생물이 공존하고 있습니다. 여러 정체성이 공존하는 포용적 사회에 가깝습니다."
      : diversityScore >= 0.4
      ? "다양성은 유지되지만 일부 종이 과도하게 우세합니다. 특정 정상성이 강하게 작동하는 상태입니다."
      : "장내 다양성이 낮아 획일화된 생태계에 가깝습니다. 한 가지 기준만 강요되는 상태로 읽힙니다.";

  const conformityText =
    conformityScore >= 0.7
      ? "유익균 비율이 높고 병원성 미생물은 낮은 편입니다. 규범을 잘 따르는 순응형 시민에 가까운 프로파일입니다."
      : conformityScore >= 0.4
      ? "유익균과 잠재적 병원균이 섞여 있습니다. 대체로 규범에 맞지만 때때로 경계 대상이 되는 존재입니다."
      : "병원성·잠재적 유해균 비율이 높습니다. 사회가 쉽게 '문제적'으로 낙인찍을 수 있는 몸의 상태입니다.";

  const cohesionText =
    cohesionScore >= 0.7
      ? "SCFA(특히 Butyrate) 생산이 활발해 공동체 결속 에너지가 높은 상태입니다."
      : cohesionScore >= 0.4
      ? "기초 에너지는 유지되지만 결속력이 흔들릴 수 있는 수준입니다."
      : "SCFA 생산이 떨어져 서로를 지탱할 힘이 부족한 상태에 가깝습니다.";

  const conflictText =
    conflictScore >= 0.7
      ? "LPS와 염증성 사이토카인이 높아 만성 염증 상태입니다. 혐오·갈등이 일상화된 분열 상태로 볼 수 있습니다."
      : conflictScore >= 0.4
      ? "염증 지표가 다소 상승한 상태입니다. 갈등 이슈가 반복적으로 나타나는 국면입니다."
      : "염증 지표가 낮아 비교적 안정적인 상태입니다. 갈등이 생겨도 빠르게 봉합되는 편입니다.";

  const productivityText =
    productivityScore >= 0.7
      ? "대사 효율이 높아 에너지를 잉여까지 확보하는 상태입니다. 고효율·고생산성을 강하게 요구받는 위치로 읽힙니다."
      : productivityScore >= 0.4
      ? "필수 기능을 수행할 만큼의 대사 효율을 유지하고 있습니다. 평균적인 생산성을 가진 시민에 가깝습니다."
      : "대사 효율이 낮아 에너지 확보가 버겁습니다. '비효율적'이라는 낙인이 쉽게 찍힐 수 있는 조건입니다.";

  // === 상단 로고 바 메타 정보 업데이트 ===
  const statusText =
    overallGrade === "A" ? "안정" : overallGrade === "B" ? "경계" : "주의";

  const levelText = `LV-${overallGrade}`;

  // 간단히 결과지용 ID 생성 (예: G-2345-A)
  const idText =
    "G-" + String(2000 + Math.floor(Math.random() * 9000)) + "-" + overallGrade;

  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const dateText = `${yyyy}년 ${mm}월 ${dd}일`;

  if (metaStatusEl) metaStatusEl.textContent = statusText;
  if (metaLevelEl) metaLevelEl.textContent = levelText;
  if (metaIdEl) metaIdEl.textContent = idText;
  if (metaDateEl) metaDateEl.textContent = dateText;

  // === 헤더 텍스트(중앙 메인 문구도 여기서 맞춰줌) ===
  if (mainMessageEl) {
    mainMessageEl.textContent = `귀하의 장내 생태는 사회 적응도 ${overallScoreText}로 판정되었습니다.`;
  }
  if (subMessageEl) {
    subMessageEl.textContent = actionLine;
  }

  // === 오른쪽 결과 패널(장 이미지는 이미 왼쪽 캔버스에 따로 있음) ===
  resultListEl.style.display = "block";
  resultListEl.innerHTML = `
    <div class="gut-layout-right-inner" style="display:flex; flex-direction:column; gap:16px;">
      <!-- 한눈에 보는 결과 헤더 -->
      <div style="
        border-radius:16px;
        padding:16px 18px;
        background:rgba(248,250,252,0.95);
        box-shadow:0 8px 20px rgba(15,23,42,0.06);
        display:flex;
        justify-content:space-between;
        align-items:center;
      ">
        <div>
          <div style="font-size:13px; color:#4b5563; margin-bottom:4px;">
            귀하의 장내 생태는
          </div>
          <div style="font-size:16px; font-weight:600; color:#111827; line-height:1.4;">
            사회 적응도 <span style="color:${gradeColor};">${overallScoreText}</span>로 판정되었습니다.<br/>
            <span style="font-size:13px; color:#4b5563;">${actionLine}</span>
          </div>
        </div>
        <div style="
          min-width:72px;
          text-align:center;
          padding:8px 10px;
          border-radius:14px;
          background:${gradeColor}1A;
          border:1px solid ${gradeColor};
        ">
          <div style="font-size:11px; color:#4b5563; margin-bottom:2px;">등급</div>
          <div style="font-size:22px; font-weight:700; color:${gradeColor};">
            ${overallGrade}
          </div>
        </div>
      </div>

      <!-- 세부 범주 5개 -->
      <div style="
        display:grid;
        grid-template-columns:repeat(2,minmax(0,1fr));
        gap:14px;
      ">
        <div style="
          background:#ffffff;
          border-radius:14px;
          padding:12px 14px;
          box-shadow:0 6px 16px rgba(15,23,42,0.05);
        ">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
            <span style="font-size:12px; font-weight:600; color:#111827;">
              장내 다양성 & 정상성의 폭
            </span>
            <span style="
              font-size:11px;
              font-weight:700;
              padding:2px 8px;
              border-radius:999px;
              background:#eef2ff;
              color:#4f46e5;
            ">${diversityGrade}</span>
          </div>
          <div style="font-size:11px; color:#6b7280; margin-bottom:4px;">
            D = ${profile.D.toFixed(2)} · ${pct(diversityScore)}
          </div>
          <p style="font-size:11px; color:#4b5563; margin:0;">
            ${diversityText}
          </p>
        </div>

        <div style="
          background:#ffffff;
          border-radius:14px;
          padding:12px 14px;
          box-shadow:0 6px 16px rgba(15,23,42,0.05);
        ">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
            <span style="font-size:12px; font-weight:600; color:#111827;">
              규범 적합도 (순응 점수)
            </span>
            <span style="
              font-size:11px;
              font-weight:700;
              padding:2px 8px;
              border-radius:999px;
              background:#eef2ff;
              color:#4f46e5;
            ">${conformityGrade}</span>
          </div>
          <div style="font-size:11px; color:#6b7280; margin-bottom:4px;">
            B = ${profile.B.toFixed(2)}, P = ${profile.P.toFixed(2)} · ${pct(
    conformityScore
  )}
          </div>
          <p style="font-size:11px; color:#4b5563; margin:0;">
            ${conformityText}
          </p>
        </div>

        <div style="
          background:#ffffff;
          border-radius:14px;
          padding:12px 14px;
          box-shadow:0 6px 16px rgba(15,23,42,0.05);
        ">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
            <span style="font-size:12px; font-weight:600; color:#111827;">
              공동체 결속 에너지 (SCFA)
            </span>
            <span style="
              font-size:11px;
              font-weight:700;
              padding:2px 8px;
              border-radius:999px;
              background:#eef2ff;
              color:#4f46e5;
            ">${cohesionGrade}</span>
          </div>
          <div style="font-size:11px; color:#6b7280; margin-bottom:4px;">
            Bt = ${profile.Bt.toFixed(1)} · ${pct(cohesionScore)}
          </div>
          <p style="font-size:11px; color:#4b5563; margin:0;">
            ${cohesionText}
          </p>
        </div>

        <div style="
          background:#ffffff;
          border-radius:14px;
          padding:12px 14px;
          box-shadow:0 6px 16px rgba(15,23,42,0.05);
        ">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
            <span style="font-size:12px; font-weight:600; color:#111827;">
              갈등·혐오 지수 (염증 로드)
            </span>
            <span style="
              font-size:11px;
              font-weight:700;
              padding:2px 8px;
              border-radius:999px;
              background:#eef2ff;
              color:#4f46e5;
            ">${conflictGrade}</span>
          </div>
          <div style="font-size:11px; color:#6b7280; margin-bottom:4px;">
            L = ${profile.L.toFixed(2)}, C = ${profile.C.toFixed(1)} · ${pct(
    conflictScore
  )}
          </div>
          <p style="font-size:11px; color:#4b5563; margin:0;">
            ${conflictText}
          </p>
        </div>

        <div style="
          background:#ffffff;
          border-radius:14px;
          padding:12px 14px;
          box-shadow:0 6px 16px rgba(15,23,42,0.05);
        ">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
            <span style="font-size:12px; font-weight:600; color:#111827;">
              사회적 생산성 / 효율성
            </span>
            <span style="
              font-size:11px;
              font-weight:700;
              padding:2px 8px;
              border-radius:999px;
              background:#eef2ff;
              color:#4f46e5;
            ">${productivityGrade}</span>
          </div>
          <div style="font-size:11px; color:#6b7280; margin-bottom:4px;">
            EEE = ${profile.EEE.toFixed(2)} · ${pct(productivityScore)}
          </div>
          <p style="font-size:11px; color:#4b5563; margin:0;">
            ${productivityText}
          </p>
        </div>
      </div>
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
    scanRunning = false;

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
    scanRunning = false;

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
      scanRunning = false;

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
      scanRunning = false;

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
// POSTURE 화면 터치 → 바로 스캔 시작(A1-2)
// -----------------------------
if (postureEl) {
  postureEl.addEventListener("click", () => {
    // 다른 phase에서는 무시
    if (currentPhase !== "POSTURE") return;

    // POSTURE용 타이머/애니메이션 정리
    postureTimers.forEach(clearTimeout);
    postureTimers = [];
    if (postureProgressInner) {
      postureProgressInner.style.width = "0%";
    }

    // 스캔 타이머/정제율 초기화
    scanTimer = 0;
    scanOverallTimer = 0;
    purity = 0;

    // 바로 스캔 phase로 점프
    setPhase("A1-2");
    updateProgress();
  });
}
