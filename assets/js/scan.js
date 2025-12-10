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

// 상단 큰 문구 엘리먼트
const scanPhaseTextEl = document.getElementById("scanPhaseText");
// 상단 정제율 값
const phasePurityValueEl = document.getElementById("phasePurityValue");
const standbyShaderCanvas = document.getElementById("standbyShader");

const progressRowEl = document.getElementById("progressRow");
const purityRowEl = document.getElementById("purityRow");

const scanPhaseMetaEl = document.querySelector(".scan-phase-meta");

const gutFocusOverlayEl = document.getElementById("gutFocusOverlay");
const gutFocusTitleEl = document.getElementById("gutFocusTitle");
const gutFocusSubEl = document.getElementById("gutFocusSub");
const gutFocusBodyEl = document.getElementById("gutFocusBody");

const scanSequenceProgressInnerEl = document.getElementById(
  "scanSequenceProgressInner"
);

const warningPageEl = document.getElementById("warningPage");
const warningTextEl = document.getElementById("warningText");

let leaveStartTime = null;
let warnedOnce = false;

const ambientAudio = document.getElementById("ambientAudio");

const resultAudio = document.getElementById("resultAudio");

const standbyVoice = document.getElementById("standbyVoice");

const pushVoice = document.getElementById("pushVoice");

const warningAudio = document.getElementById("warningAudio");

const listingCompleteAudio = document.getElementById("listingCompleteAudio");

const scanLoopAudio = document.getElementById("scanLoopAudio");
const detectVoice = document.getElementById("detectVoice");
const pushDownVoice = document.getElementById("pushDownVoice");

// ==========================
// Web Serial + Web Audio (LED)
// ==========================
let ledSerialPort = null;
let ledSerialWriter = null;
const ledTextEncoder = new TextEncoder();

let audioCtx = null;
let audioAnalyser = null;
let audioDataArray = null;
let audioLedRunning = false;

// 한 번 만든 source 재사용하기 위한 캐시
const audioSourceMap = new Map();

// 🔥 시리얼 읽기용
let ledSerialReader = null;
const ledTextDecoder = new TextDecoder();
let serialReadBuffer = "";

// 압력 센서 두 개 상태
let pressureAOn = false;
let pressureBOn = false;

// 🔥 아두이노에서 온 한 줄 처리
function handleSerialLineFromArduino(line) {
  if (!line) return;

  // 콘솔에서 확인하고 싶으면 열어둠
  // console.log("ARDUINO:", line);

  if (line === "P1A") {
    pressureAOn = true;
  } else if (line === "P0A") {
    pressureAOn = false;
  } else if (line === "P1B") {
    pressureBOn = true;
  } else if (line === "P0B") {
    pressureBOn = false;
  } else {
    // LED 밝기용 "B123" 같은 건 아두이노 쪽에서 이미 처리하니까 여기서는 무시
    return;
  }

  // 두 센서 중 하나라도 눌려 있으면 착석으로 간주
  const seatNow = pressureAOn || pressureBOn;

  // JS 전역 pressureOn과 다를 때만 이벤트 발생
  if (seatNow !== pressureOn) {
    onPressureChange(seatNow);
  }
}

async function startSerialReadLoop() {
  if (!ledSerialPort || !ledSerialPort.readable) return;

  ledSerialReader = ledSerialPort.readable.getReader();
  try {
    while (true) {
      const { value, done } = await ledSerialReader.read();
      if (done) break;
      if (!value) continue;

      // value는 Uint8Array → 문자열로 디코드
      const chunk = ledTextDecoder.decode(value);
      serialReadBuffer += chunk;

      // 줄 단위(\n)로 끊어서 처리
      let idx;
      while ((idx = serialReadBuffer.indexOf("\n")) >= 0) {
        const line = serialReadBuffer.slice(0, idx).trim();
        serialReadBuffer = serialReadBuffer.slice(idx + 1);
        if (line) {
          handleSerialLineFromArduino(line);
        }
      }
    }
  } catch (err) {
    console.error("serial read error:", err);
  } finally {
    if (ledSerialReader) {
      ledSerialReader.releaseLock();
      ledSerialReader = null;
    }
  }
}

// 브라우저에서 아두이노 시리얼 연결
async function connectLedSerial() {
  if (!("serial" in navigator)) {
    alert(
      "이 브라우저는 Web Serial을 지원하지 않습니다. Chrome을 사용해 주세요."
    );
    return;
  }

  try {
    // 1) 포트 선택
    ledSerialPort = await navigator.serial.requestPort();
    await ledSerialPort.open({ baudRate: 115200 });

    const writable = ledSerialPort.writable;
    if (!writable) {
      console.error("시리얼 포트가 writable이 아닙니다.");
      return;
    }

    ledSerialWriter = writable.getWriter();
    console.log("✅ LED 시리얼 연결 완료");

    // 🔥 아두이노 → JS 시그널 읽기 시작 (압력 센서용)
    startSerialReadLoop();

    // 2) 오디오 분석 준비 + 루프 시작
    await setupAudioReactiveLed();
  } catch (err) {
    console.error("connectLedSerial error:", err);
  }
}

// 오디오 → 밝기 분석 세팅
async function setupAudioReactiveLed() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }

  if (!audioAnalyser) {
    audioAnalyser = audioCtx.createAnalyser();
    audioAnalyser.fftSize = 256;
    const bufferLength = audioAnalyser.frequencyBinCount;
    audioDataArray = new Uint8Array(bufferLength);
  }

  // ambient / scanLoop / result 오디오를 analyser에 연결
  const targets = [ambientAudio, scanLoopAudio, resultAudio];
  targets.forEach((el) => {
    if (!el) return;
    if (audioSourceMap.has(el)) return; // 이미 연결됐으면 패스

    const src = audioCtx.createMediaElementSource(el);
    src.connect(audioAnalyser);
    src.connect(audioCtx.destination); // 실제 스피커로도 나가게
    audioSourceMap.set(el, src);
  });

  if (!audioLedRunning) {
    audioLedRunning = true;
    audioLedLoop();
  }
}

// 밝기 값을 아두이노로 전송 ("B123\n" 형식)
function sendLedBrightness(brightness) {
  if (!ledSerialWriter) return;

  const clamped = Math.max(0, Math.min(255, Math.round(brightness)));
  const msg = `B${clamped}\n`;

  ledSerialWriter
    .write(ledTextEncoder.encode(msg))
    .catch((err) => console.error("serial write error:", err));
}

// 오디오 분석 루프 → 밝기 계산
function audioLedLoop() {
  if (!audioAnalyser || !audioDataArray || !audioLedRunning) return;

  audioAnalyser.getByteFrequencyData(audioDataArray);

  // 전체 주파수 대역의 평균값 사용
  let sum = 0;
  for (let i = 0; i < audioDataArray.length; i++) {
    sum += audioDataArray[i];
  }
  const avg = sum / audioDataArray.length; // 0~255 근처

  // 약하게 들릴 때도 좀 살아있게 커브 적용
  const normalized = Math.min(1, avg / 140); // 140 기준
  const curved = Math.pow(normalized, 1.5); // 감마 느낌

  const minBright = 10; // 완전 꺼지지 않게
  const maxBright = 255; // 최대 밝기
  const brightness = minBright + (maxBright - minBright) * curved;

  // 👉 스캔 페이즈에서만 강하게 반응, 그 외에는 은은하게
  if (
    currentPhase === "A1-2" ||
    currentPhase === "B1" ||
    currentPhase === "B2" ||
    currentPhase === "B3" ||
    currentPhase === "C1"
  ) {
    sendLedBrightness(brightness);
  } else {
    sendLedBrightness(40); // 대기/결과 화면은 고정 저밝기
  }

  requestAnimationFrame(audioLedLoop);
}

function playPushDownVoice() {
  if (!pushDownVoice) return;
  pushDownVoice.currentTime = 0;
  pushDownVoice.volume = 0.9; // 필요하면 0~1
  const p = pushDownVoice.play();
  if (p && p.catch) {
    p.catch((err) => console.log("pushDownVoice blocked:", err));
  }
}

function playDetectVoice() {
  if (!detectVoice) return;
  detectVoice.currentTime = 0;
  detectVoice.volume = 0.9; // 필요하면 0~1 사이로 조절
  const p = detectVoice.play();
  if (p && p.catch) {
    p.catch((err) => {
      console.log("detectVoice play blocked:", err);
    });
  }
}

function playScanLoop() {
  if (!scanLoopAudio) return;
  scanLoopAudio.loop = true;
  scanLoopAudio.volume = 0.6; // 필요하면 조절
  const p = scanLoopAudio.play();
  if (p && p.catch) {
    p.catch((err) => console.log("scanLoop play blocked:", err));
  }
}

function stopScanLoop() {
  if (!scanLoopAudio) return;
  scanLoopAudio.pause();
  scanLoopAudio.currentTime = 0;
}

function playWarningSound() {
  if (!warningAudio) return;
  warningAudio.currentTime = 0;
  warningAudio.volume = 0.9; // 필요하면 0~1에서 조절
  const p = warningAudio.play();
  if (p && p.catch) {
    p.catch((err) => {
      console.log("warning audio play blocked:", err);
    });
  }
}

function playListingCompleteSound() {
  if (!listingCompleteAudio) return;
  try {
    listingCompleteAudio.currentTime = 0;
    listingCompleteAudio.volume = 0.9; // 필요하면 조절
    listingCompleteAudio.play();
  } catch (err) {
    console.log("listingCompleteAudio error:", err);
  }
}

function playPushVoice() {
  if (!pushVoice) return;
  pushVoice.currentTime = 0;
  pushVoice.volume = 0.3;
  const p = pushVoice.play();
  if (p && p.catch) {
    p.catch((err) => {
      console.log("push voice play blocked:", err);
    });
  }
}

function playStandbyVoice() {
  if (!standbyVoice) return;
  standbyVoice.currentTime = 0;
  standbyVoice.volume = 0.4; // ← 여기서 음량 조절
  standbyVoice.play().catch((err) => console.log(err));
}

let standbyVoiceTimer = null;

function playResultSound() {
  if (!resultAudio) return;
  try {
    resultAudio.currentTime = 0; // 항상 처음부터
    resultAudio.volume = 0.5; // 필요하면 0~1 사이로 조절
    resultAudio.play();
  } catch (err) {
    console.log("resultAudio play error:", err);
  }
}

function startStandbyVoiceLoop() {
  if (standbyVoiceTimer) return;

  // 바로 한 번 재생
  playStandbyVoice();

  // 그 다음부터는 20초마다 한 번씩
  standbyVoiceTimer = setInterval(() => {
    if (currentPhase === "A0-1" || currentPhase === "A0-2") {
      playStandbyVoice();
    }
  }, 30000); // 20초마다 (원하면 10000으로 줄여도 됨)
}

function stopStandbyVoiceLoop() {
  if (standbyVoiceTimer) {
    clearInterval(standbyVoiceTimer);
    standbyVoiceTimer = null;
  }
}

// -----------------------------
// 앰비언트 사운드: 최초 터치 한 번 이후 계속 재생
// -----------------------------

// 🔊 스캔 페이지 앰비언트 사운드 (페이지 로드 시 자동 재생)
function playAmbient() {
  if (!ambientAudio) return;
  ambientAudio.loop = true; // 혹시 HTML에 안 넣었으면 여기서도 보장
  ambientAudio.volume = 0.4; // 필요하면 0.0~1.0에서 조절
  const p = ambientAudio.play();
  if (p && p.catch) {
    p.catch((err) => {
      console.log("ambient autoplay blocked:", err);
    });
  }
}

function stopAmbient() {
  if (!ambientAudio) return;
  ambientAudio.pause();
  ambientAudio.currentTime = 0;
}

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

let testTriggered = false;
let ledConnectTried = false;

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

    // 세로/가로로 겹치는 파동 (강도 ↑)
    float wave1 = sin(uv.y * 5.0 + u_time * 1.2) * 0.04;
    float wave2 = sin(uv.x * 7.0 - u_time * 1.0) * 0.03;
    float wave3 = sin((uv.x + uv.y) * 8.0 + u_time * 0.8) * 0.02;

    uv.x += wave1 + wave2 + wave3;

    vec4 color = texture2D(u_texture, uv);

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

function showWarningPage(msg) {
  playWarningSound();
  // 모든 UI 숨기기
  scanRootEl.style.display = "none";
  scanHeaderEl.style.display = "none";
  standbyScreenEl.style.display = "none";

  // 경고 페이지 표시
  warningTextEl.textContent = msg;
  warningPageEl.style.display = "flex";
}

function hideWarningPage() {
  warningPageEl.style.display = "none";
  scanRootEl.style.display = "flex";
  scanHeaderEl.style.display = "flex";
}

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

// 단계 점(1~4)을 로딩바 위에 위치만 잡아주는 함수
function positionScanSteps() {
  if (!scanStepEls || !scanStepEls.length) return;

  const DOT_COUNT = scanStepEls.length;

  scanStepEls.forEach((el, i) => {
    const ratio = i / (DOT_COUNT - 1); // 0, 0.25, 0.5, 0.75, 1.0
    el.style.left = `${ratio * 100}%`;
  });
}

function updateScanStepUI(stepIdx, completedCount) {
  if (!scanSequenceEl) return;

  if (stepIdx < 0) {
    // 스캔 안 할 때 → 숨기기 + 초기화
    scanSequenceEl.style.display = "none";
    if (scanSequenceTextEl) scanSequenceTextEl.textContent = "";

    // 🔹 상단 문구도 초기화
    if (scanPhaseTextEl) {
      scanPhaseTextEl.textContent = "";
      scanPhaseTextEl.style.opacity = 0;
    }

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

  // 현재 단계 문장 (하단 작은 텍스트)
  if (scanSequenceTextEl) {
    scanSequenceTextEl.textContent = scanStepTexts[idx];
  }

  // 🔹 상단 큰 텍스트도 동일하게 표시
  if (scanPhaseTextEl) {
    scanPhaseTextEl.textContent = scanStepTexts[idx];
    scanPhaseTextEl.style.opacity = 1;
  }

  // ✅ 도트 개수 기준으로 클램프 (문장은 4개지만 도트는 5개)
  const DOT_COUNT = scanStepEls ? scanStepEls.length : SCAN_STEP_COUNT + 1;

  const maxCompleted = Math.max(0, Math.min(DOT_COUNT, completedCount ?? 0));

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

  // 🔹 C5용 전체 화면 메시지 모드 초기화
  document.body.classList.remove("listing-complete");

  // 🔹 결과 화면(C2)일 때만 body에 result-mode 클래스 붙이기
  if (typeof document !== "undefined") {
    document.body.classList.toggle("result-mode", phase === "C2");
  }

  // 🔹 기본값: 중앙 문구는 숨겨둔다 (필요한 phase에서만 켜기)
  if (scanMainMessageEl) {
    scanMainMessageEl.style.display = "none";
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
  if (progressRowEl) {
    progressRowEl.style.display = isScanProgressPhase ? "flex" : "none";
  }
  if (purityRowEl) {
    purityRowEl.style.display = isScanProgressPhase ? "flex" : "none";
  }
  if (scanPhaseMetaEl) {
    scanPhaseMetaEl.style.display = isScanProgressPhase ? "flex" : "none";
  }

  if (isStandby) {
    if (standbyScreenEl) standbyScreenEl.style.display = "block";
    if (scanHeaderEl) scanHeaderEl.style.display = "none";
    if (scanRootEl) scanRootEl.style.display = "none";

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

      if (scanPhaseMetaEl) scanPhaseMetaEl.style.display = "none";

      if (phasePurityValueEl) {
        phasePurityValueEl.style.display = "none";
        phasePurityValueEl.textContent = "";
      }
      // 중앙 문구는 완전히 숨김
      if (scanMainMessageEl) scanMainMessageEl.style.display = "none";
      mainMessageEl.textContent = "";
      subMessageEl.textContent = "";
      secondaryMessageEl.textContent = "";

      scanBgEl.className = "scan-bg particles";
      scanBgEl.style.opacity = 0.25;
      progressLabelEl.textContent = "스캔 대기";
      purity = 0;
      updateProgress();
      showMicrobes(false);

      updateScanStepUI(-1, 0); // 스캔 단계/로딩바/문장 리셋
      startStandbyVoiceLoop();
      break;

    case "A0-2":
      if (statusSystemEl) statusSystemEl.textContent = "READY";

      if (scanPhaseMetaEl) scanPhaseMetaEl.style.display = "none";

      if (phasePurityValueEl) {
        phasePurityValueEl.style.display = "none";
        phasePurityValueEl.textContent = "";
      } // 여기서도 중앙 문구 숨김
      if (scanMainMessageEl) scanMainMessageEl.style.display = "none";
      mainMessageEl.textContent = "";
      subMessageEl.textContent = "";
      secondaryMessageEl.textContent = "";

      scanBgEl.className = "scan-bg particles";
      scanBgEl.style.opacity = 0.45;

      positionScanSteps();
      showMicrobes(false);
      startStandbyVoiceLoop();
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
      stopStandbyVoiceLoop();
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
        postureTitleEl.textContent = "올바른 자세로 앉아 주세요.";
        postureTitleEl.style.color = "#753A0C"; // 원하는 폰트 색
        postureTitleEl.style.display = "block";
        postureTitleEl.style.opacity = 1;
      }
      if (postureLine4El) {
        postureLine4El.style.display = "none"; // 숨기기
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

        // 🔹 문장 인덱스에 따라 Sit / Sit2 변경
        const img = document.getElementById("postureImg");
        if (img) {
          if (idx === 0 || idx === 1) {
            // 1, 2번째 문장
            img.src = "assets/img/Sit.png";
          } else {
            // 3, 4번째 문장
            img.src = "assets/img/Sit2.png";
          }
        }

        seqText.innerText = seq[idx];
        seqText.style.opacity = 1;

        if (idx === 1) {
          playPushVoice();
        }
        if (idx === 3) {
          playPushDownVoice();
        }

        const t1 = setTimeout(() => {
          pumpSVG(idx);

          const t2 = setTimeout(() => {
            const target = ((idx + 1) / seq.length) * 100;

            // 🔹 1번 스텝(맨 왼쪽)은 "도트 + 숫자 → 바" 순서
            if (idx === 0 && postureStepEls && postureStepEls[0]) {
              const firstStep = postureStepEls[0];
              firstStep.classList.add("completed");
              const firstCheck = firstStep.querySelector(".posture-step-check");
              if (firstCheck) firstCheck.style.opacity = "1";
            }

            animateProgressTo(target, () => {
              // 🔹 2,3,4번 스텝은 "바 → 도트 + 숫자" 순서
              if (idx > 0 && postureStepEls && postureStepEls[idx]) {
                const stepEl = postureStepEls[idx];
                stepEl.classList.add("completed");
                const check = stepEl.querySelector(".posture-step-check");
                if (check) check.style.opacity = "1";
              }

              if (idx === lastIndex) {
                const afterFullTimer = setTimeout(() => {
                  // 인포그래픽/스텝퍼/제목 서서히 숨기기
                  if (postureGraphicEl) postureGraphicEl.style.display = "none";
                  if (stepperEl) stepperEl.style.opacity = 0;
                  if (postureTitleEl) postureTitleEl.style.opacity = 0;
                  if (postureLine4El) postureLine4El.style.opacity = 0;

                  // ✅ 바로 이전 문장은 완전히 지워버리고, 감지 문장만 세팅
                  if (seqText) {
                    seqText.style.transition = "none"; // 트랜지션 잠시 꺼두고
                    seqText.style.opacity = 0;
                    seqText.innerText =
                      "장내 배출 데이터가 감지되었습니다. 장내 데이터 정렬을 시작합니다.";
                    // 🔊 감지 문장 나올 때 효과음 한 번 재생
                    playDetectVoice();
                  }

                  // ✅ 이 타이밍에 3D 미생물 켜기
                  showMicrobes(true);
                  if (scanMicrobesCanvas) {
                    scanMicrobesCanvas.style.transition = "opacity 1s ease";
                    scanMicrobesCanvas.style.opacity = 0.45; // 필요하면 0.3~0.6 사이로 조절
                  }

                  // 감지 문장만 부드럽게 페이드 인
                  if (seqText) {
                    requestAnimationFrame(() => {
                      seqText.style.transition = "opacity 0.5s ease";
                      seqText.style.opacity = 1;
                    });
                  }

                  // 잠시 감지 문장 보여 준 뒤 스캔 Phase로 진입
                  const toScanTimer = setTimeout(() => {
                    setPhase("A1-2");
                    scanTimer = 0;
                    purity = 0;
                    updateProgress();
                  }, 3400); // 3.4초 정도 감지 문장 유지 (원래 네가 쓰던 값)

                  postureTimers.push(toScanTimer);
                }, 800);

                postureTimers.push(afterFullTimer);
              } else {
                // 👇 나머지 단계(0,1,2)는 기존 로직 그대로 유지
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
      if (scanMainMessageEl) scanMainMessageEl.style.display = "block"; // 🔹 이 줄 추가
      if (sensorSimEl) sensorSimEl.style.display = "flex";

      mainMessageEl.textContent = "";
      subMessageEl.textContent = "";
      secondaryMessageEl.textContent = "";
      scanBgEl.className = "scan-bg particles";
      scanBgEl.style.opacity = 0.7;

      scanOverallTimer = 0;
      scanTimer = 0;
      scanTotal = 30;
      purity = 0;
      updateProgress();

      positionScanSteps();

      microProgress = 0.25;
      showMicrobes(true);
      playScanLoop();
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
      stopScanLoop();
      playResultSound();

      if (statusSystemEl) statusSystemEl.textContent = "RESULT";
      mainMessageEl.textContent = "장내 데이터 분석 결과입니다.";
      subMessageEl.textContent = "";
      secondaryMessageEl.textContent =
        "이 장내 데이터를 사회 자산으로 상장하시겠습니까?";

      // 🔥 결과 화면에서는 상단 스캔 안내 문구 완전 제거
      if (scanPhaseTextEl) {
        scanPhaseTextEl.textContent = "";
        scanPhaseTextEl.style.opacity = 0;
      }

      // 🔥 여기 추가: 스캔용 보라/주황 그라데이션 전부 끄기
      if (scanBgEl) {
        scanBgEl.className = "scan-bg"; // particles / spiral / noise 제거
        scanBgEl.style.opacity = 0; // 완전 투명 오버레이
      }

      if (scanResultLayoutEl) scanResultLayoutEl.style.display = "grid";
      if (gutVisualEl) gutVisualEl.style.display = "flex";

      if (decisionButtonsEl) {
        decisionButtonsEl.style.display = "flex";
      }
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

    case "C5":
      playListingCompleteSound();
      if (statusSystemEl) statusSystemEl.textContent = "LISTED";

      // 🔹 중앙 전체 화면 텍스트 모드 켜기
      document.body.classList.add("listing-complete");

      if (scanMainMessageEl) scanMainMessageEl.style.display = "block";

      if (mainMessageEl) {
        mainMessageEl.textContent = "상장이 완료되었습니다.";
      }

      if (subMessageEl) {
        subMessageEl.textContent =
          "감사합니다.\n뒤를 돌아 스크린을 확인해 주세요.";
      }

      if (secondaryMessageEl) {
        secondaryMessageEl.textContent = "";
      }

      if (scanResultLayoutEl) scanResultLayoutEl.style.display = "none";
      if (decisionButtonsEl) decisionButtonsEl.style.display = "none";

      if (scanHeaderEl) scanHeaderEl.style.display = "flex";

      if (scanBgEl) {
        scanBgEl.className = "scan-bg";
        scanBgEl.style.opacity = 0.2;
      }

      setTimeout(() => {
        pirOn = false;
        pressureOn = false;
        scanTimer = 0;
        purity = 0;
        microProgress = 0;
        scanResultStarted = false;
        scanRunning = false;
        testTriggered = false; // 🔥 이 줄 추가

        updateSensorStatus();
        setPhase("A0-1");
      }, 4500);
      break;

    case "D1":
      stopScanLoop();
      if (statusSystemEl) statusSystemEl.textContent = "INTERRUPTED";
      mainMessageEl.textContent = "착석이 해제되었습니다.";
      subMessageEl.textContent =
        "다시 앉으시면 이어서 진행됩니다. 장 시간이 비워지는 중...";
      secondaryMessageEl.textContent = "";
      scanBgEl.className = "scan-bg noise";
      scanBgEl.style.opacity = 0.5;
      break;

    case "D2":
      stopScanLoop();
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
// -----------------------------
// 진행바 업데이트 + 스캔 단계 연동
// -----------------------------
function updateProgress() {
  // 하단 정제율 숫자
  if (purityValueEl) {
    purityValueEl.textContent = `${Math.round(purity)}%`;
  }

  const isScanPhase =
    currentPhase === "A1-2" ||
    currentPhase === "B1" ||
    currentPhase === "B2" ||
    currentPhase === "B3" ||
    currentPhase === "C1";

  // 상단 정제율 표시 제어
  if (phasePurityValueEl) {
    if (isScanPhase) {
      phasePurityValueEl.style.display = "inline";
      phasePurityValueEl.textContent = `${Math.round(purity)}%`;
    } else {
      phasePurityValueEl.style.display = "none";
      phasePurityValueEl.textContent = "";
    }
  }

  if (!progressTimeEl || !remainingTimeEl || !statusTimerEl) {
    return;
  }

  if (isScanPhase) {
    // 🔹 전체 스캔 시간 비율(0~1) – 로딩바/단계용 (절대 후퇴 안 함)
    const timeRatio = Math.min(
      1,
      Math.max(0, scanOverallTimer / SCAN_OVERALL_TOTAL)
    );

    // ⏱ 시간 텍스트는 scanOverallTimer 기준
    const elapsed = scanOverallTimer;
    const total = SCAN_OVERALL_TOTAL;
    progressTimeEl.textContent = `${formatTime(elapsed)} / ${formatTime(
      total
    )}`;
    const remaining = Math.max(0, total - elapsed);
    remainingTimeEl.textContent = `남은 시간: ${formatTime(remaining)}`;
    statusTimerEl.textContent = formatTime(elapsed);

    // ✅ 로딩바는 시간 기준으로만 부드럽게 증가 (절대 줄어들지 않음)
    if (scanSequenceProgressInnerEl) {
      scanSequenceProgressInnerEl.style.width = `${timeRatio * 100}%`;
    }

    // =============================
    // ✅ 도트/문장 단계 계산 부분만 정확히 다시 잡기
    // =============================

    // 도트가 켜지는 지점 (로딩바 기준)
    const THRESHOLDS = [0.0, 0.25, 0.5, 0.75, 1.0];

    // 기본값: 스캔 시작하면 1번 도트는 항상 ON
    let completedCount = 1;

    // timeRatio가 각 임계값을 넘을 때마다 도트 하나씩 추가로 켜짐
    for (let i = 1; i < THRESHOLDS.length; i++) {
      if (timeRatio >= THRESHOLDS[i]) {
        completedCount = i + 1; // 도트 번호는 1부터 시작
      }
    }

    // 문장 인덱스(0~3) = 켜진 도트 개수 - 1
    let stepIdx = completedCount - 1;
    if (stepIdx < 0) stepIdx = 0;
    if (stepIdx >= SCAN_STEP_COUNT) stepIdx = SCAN_STEP_COUNT - 1;

    updateScanStepUI(stepIdx, completedCount);
  } else {
    // 스캔 단계 아닐 때는 로딩바/단계 표시 리셋
    updateScanStepUI(-1, 0);
  }
}

// -----------------------------
// 3D 미생물 씬
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

  const width = window.innerWidth;
  const height = window.innerHeight;
  const THREE = window.THREE;

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

  // 조명
  const amb = new THREE.AmbientLight(0xffffff, 0.35);
  const dir = new THREE.DirectionalLight(0xffffff, 0.7);
  dir.position.set(5, 10, 7);
  microScene.add(amb, dir);

  microGroup = new THREE.Group();
  microGroup.position.set(0, -1.5, -6);
  microScene.add(microGroup);

  const loader = new window.GLTFLoader();
  const texLoader = new THREE.TextureLoader();

  // -----------------------------
  // 텍스처 로드 (COLOR / EMISSION)
  // -----------------------------
  const colorMaps = [
    texLoader.load("assets/img/1_A.png"),
    texLoader.load("assets/img/2_A.png"),
    texLoader.load("assets/img/3_A.png"),
    texLoader.load("assets/img/4_A.png"),
  ];

  const emissiveMaps = [
    texLoader.load("assets/img/1_E.png"),
    texLoader.load("assets/img/2_E.png"),
    texLoader.load("assets/img/3_E.png"),
    texLoader.load("assets/img/4_E.png"),
  ];

  // 3번 확장 쉘용 텍스처 (Ext)
  const extColorMap = texLoader.load("assets/img/3Ext_A.png");
  const extEmissiveMap = texLoader.load("assets/img/3Ext_E.png");

  const allTex = [...colorMaps, ...emissiveMaps, extColorMap, extEmissiveMap];
  allTex.forEach((tex) => {
    if (!tex) return;
    if ("colorSpace" in tex) tex.colorSpace = THREE.SRGBColorSpace;
    tex.flipY = false;
  });

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
        const sceneIndex = i % scenes.length;
        const baseScene = scenes[sceneIndex].clone(true);
        const wrapper = new THREE.Group();
        wrapper.add(baseScene);

        // 각 개체의 배치/스케일
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
          typeIndex: sceneIndex,
        };

        // 🔥 여기서 메쉬 인덱스 제대로 세기 (wrapper 하나당 카운터 0→1→2…)
        let meshCounter = 0;

        wrapper.traverse((obj) => {
          if (!obj.isMesh) return;

          // 기본 COLOR / EMISSION 맵
          let map = colorMaps[sceneIndex] || null;
          let emissiveMap = emissiveMaps[sceneIndex] || null;

          // 💡 Microbiome_3.glb (sceneIndex === 2)의
          //     "두 번째 메쉬"에만 3Ext_A / 3Ext_E 적용
          if (sceneIndex === 2) {
            if (meshCounter === 1) {
              map = extColorMap;
              emissiveMap = extEmissiveMap;
            }
            meshCounter++;
          }

          // 💡 에미션 색 설정
          // 기본은 꺼둠
          let emissiveColor = 0x000000;

          if (emissiveMap) {
            if (sceneIndex === 0) {
              // 1번
              emissiveColor = 0x5e47c8; // (94,71,200)
            } else if (sceneIndex === 1) {
              // 2번
              emissiveColor = 0x5e47c8; // (94,71,200)
            } else if (sceneIndex === 2 && map === extColorMap) {
              // 3번 Ext 쉘
              emissiveColor = 0x341dbf; // (52,29,191)
            } else if (sceneIndex === 3) {
              // 4번
              emissiveColor = 0xbf9481; // (191,148,129)
            }
          }

          obj.material = new THREE.MeshStandardMaterial({
            map,
            emissiveMap,
            emissive: new THREE.Color(emissiveColor),
            emissiveIntensity: emissiveMap ? 1.4 : 0.0,

            metalness: 0.0,
            roughness: 1.0,

            transparent: true,
            side: THREE.DoubleSide,
          });
        });

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

  const width = window.innerWidth;
  const height = window.innerHeight;

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

  if (currentPhase === "POSTURE") {
    targetProgress = 0.2;
  } else if (currentPhase === "A1-2") {
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

  let activeTypeCount = 0;
  if (currentPhase === "POSTURE" || currentPhase === "A1-2") {
    activeTypeCount = 1;
  } else if (currentPhase === "B1") {
    activeTypeCount = 2;
  } else if (currentPhase === "B2") {
    activeTypeCount = 3;
  } else if (
    currentPhase === "B3" ||
    currentPhase === "C1" ||
    currentPhase === "C2" ||
    currentPhase === "C3" ||
    currentPhase === "C4"
  ) {
    activeTypeCount = 4;
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

    if (typeof d.typeIndex === "number" && d.typeIndex >= activeTypeCount) {
      wrapper.visible = false;
      return;
    }

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

  // 1) 진행 바 / 남은 시간 먼저 '완전히 끝난 상태'로 스냅
  scanOverallTimer = SCAN_OVERALL_TOTAL;
  purity = 98; // 필요하면 100으로 바꿔도 됨
  updateProgress();

  // 2) C1 단계 화면으로 전환 (스캔 완료 안내 문구)
  setPhase("C1");

  const scanMainEl = document.querySelector(".scan-main");

  // 3) C1 상태를 잠깐 유지했다가(예: 1초) 그 다음에 페이드 아웃 시작
  const HOLD_MS = 1000; // 여기 숫자로 유지 시간 조절 (800~1500ms 정도)

  setTimeout(() => {
    // 페이드 아웃 시작
    if (scanMainEl) {
      scanMainEl.classList.add("scan-fade-out");
    }

    // 4) 페이드 아웃이 끝난 뒤 결과 화면(C2)로 전환
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
    }, 800); // 페이드 아웃 시간(기존 값 유지)
  }, HOLD_MS);
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

// 🔹 결과 패널 + 레이더 카드 1 + 지표 카드 5
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

  const gradeColorMap = {
    A: "#22c55e",
    B: "#eab308",
    C: "#ef4444",
  };

  // 장 이미지
  if (gutImageEl) {
    let imgPath = "assets/img/gut-neutral.png";
    if (overallGrade === "A") imgPath = "assets/img/gut-good.png";
    else if (overallGrade === "C") imgPath = "assets/img/gut-bad.png";
    gutImageEl.src = imgPath;
  }

  const gradeColor = gradeColorMap[overallGrade];
  document.documentElement.style.setProperty("--gut-score-color", gradeColor);

  // 등급별 문장
  let actionLine;
  if (overallGrade === "A") {
    actionLine =
      "귀하는 공단이 장기간 확보하기를 희망하는 생태 조건을 보유하고 있습니다. 본 자산을 사회 순환망에 상장하고, 지속 기여 프로그램에 참여해 주시기 바랍니다.";
  } else if (overallGrade === "B") {
    actionLine =
      "귀하는 공단의 기준에 근접한 생태 조건을 보유하고 있습니다. 본 자산의 사회 순환 기여도를 증폭하기 위해 공단이 제공하는 정밀 장내 보정 프로그램을 단계적으로 이용하시기 바랍니다.";
  } else {
    actionLine =
      "귀하는 현재 공단의 사회 순환망 편입 기준에 미달하는 생태 조건을 보유하고 있습니다. 자산 손실을 최소화하기 위해 공단의 전면 장내 재구성 및 집중 관리 프로그램을 우선적으로 이용하시기 바랍니다.";
  }

  // === 5개 지표 (0~1) ===
  const pct = (x) => `${Math.round(x * 100)}%`;

  const diversityScore = 1 - (sm.NRS ?? 0.5);
  const conformityScore = sm.CS ?? 0.5;
  const cohesionScore = sm.CI ?? 0.5;
  const conflictScore = sm.CFI ?? 0.5;
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

  // 🔥 등급에 따라 아이콘 파일 선택 (Gut_1_A.svg / Gut_1_B.svg / Gut_1_C.svg ...)
  const diversityIcon = `Gut_1_${diversityGrade}`;
  const conformityIcon = `Gut_2_${conformityGrade}`;
  const cohesionIcon = `Gut_3_${cohesionGrade}`;
  const conflictIcon = `Gut_4_${conflictGrade}`;
  const productivityIcon = `Gut_5_${productivityGrade}`;

  // === 5개 지표 설명 + 등급별 상태 문장 ===

  // 1) 정상성 스펙트럼 (Diversity)
  const diversityBaseText =
    "장내 미생물 다양성은 외부 자극에 대한 회복탄력성을 반영합니다.";
  let diversityGradeText;
  switch ((diversityGrade || "").charAt(0)) {
    case "A":
      diversityGradeText =
        "현재 지표는 A 등급으로, 미생물 군집이 폭넓게 분포하면서도 과잉 증식된 단일 균 군집이 적어, 사회·환경적 변화에도 비교적 유연하게 적응할 수 있는 고안정성 프로파일로 분류됩니다.";
      break;
    case "C":
      diversityGradeText =
        "현재 지표는 C 등급으로, 특정 균 군집에 편중된 단순화된 구조를 보여 작은 환경 변화에도 전체 시스템이 급격히 쏠리거나 붕괴될 위험이 높습니다.";
      break;
    default:
      diversityGradeText =
        "현재 지표는 B 등급으로, 기본적인 다양성은 유지되지만 일부 균 군집이 우세하여 상황에 따라 특정 성향이 과장되게 드러날 수 있는 상태입니다.";
      break;
  }
  const diversityText = `${diversityBaseText} ${diversityGradeText}`;

  // 2) 규범 순응도 (Conformity)
  const conformityBaseText =
    "유익균과 잠재적 염증 유도균의 균형은 신체가 규범·환경 변화에 얼마나 안정적으로 반응하는지를 보여줍니다.";
  let conformityGradeText;
  switch ((conformityGrade || "").charAt(0)) {
    case "A":
      conformityGradeText =
        "현재 지표는 A 등급으로, 기본 규범과 생활 리듬에 대한 순응도가 높으면서도 과도한 경직이나 방어 반응은 적은 상태입니다.";
      break;
    case "C":
      conformityGradeText =
        "현재 지표는 C 등급으로, 잠재적 유해균과 염증 관련 인자의 영향력이 커 규범적 요구에 대해 과민하거나 급격한 거부 반응이 나타날 수 있는 상태입니다.";
      break;
    default:
      conformityGradeText =
        "현재 지표는 B 등급으로, 상황에 따라 규범을 잘 따르기도 하지만 피로도와 스트레스가 누적되면 예측하기 어려운 이탈이나 저항 반응이 증가할 수 있습니다.";
      break;
  }
  const conformityText = `${conformityBaseText} ${conformityGradeText}`;

  // 3) 공동체 유지 에너지 (Cohesion / SCFA)
  const cohesionBaseText =
    "SCFA 생산량은 장내 대사·면역 조절의 핵심으로, 내부 시스템의 지지력과 결속 에너지를 나타냅니다.";
  let cohesionGradeText;
  switch ((cohesionGrade || "").charAt(0)) {
    case "A":
      cohesionGradeText =
        "현재 지표는 A 등급으로, 장점막 보호와 항염 작용에 필요한 에너지가 충분히 생산·순환되고 있습니다.";
      break;
    case "C":
      cohesionGradeText =
        "현재 지표는 C 등급으로, SCFA 생산이 부족해 기본적인 회복과 재생 과정에서 에너지 결손이 발생할 수 있는 상태입니다.";
      break;
    default:
      cohesionGradeText =
        "현재 지표는 B 등급으로, 일상적인 회복과 관계 유지에는 충분하지만, 장기적인 과부하나 반복된 갈등 상황에서는 쉽게 약해질 수 있는 상태입니다.";
      break;
  }
  const cohesionText = `${cohesionBaseText} ${cohesionGradeText}`;

  // 4) 사회 염증 지수 (Conflict / LPS & Cytokine)
  const conflictBaseText =
    "LPS·염증성 사이토카인의 증가는 위협에 대한 경계·갈등 반응성을 나타내며, 민감도가 높을수록 반응이 과장될 수 있습니다.";
  let conflictGradeText;
  switch ((conflictGrade || "").charAt(0)) {
    case "A":
      conflictGradeText =
        "현재 지표는 A 등급으로, 필요 시에는 방어 반응을 가동하되, 자극이 사라지면 비교적 빠르게 염증을 해소할 수 있는 안정적인 패턴입니다.";
      break;
    case "C":
      conflictGradeText =
        "현재 지표는 C 등급으로, 작은 자극에도 염증 반응이 길게 이어질 수 있는 고경계·고피로 상태입니다.";
      break;
    default:
      conflictGradeText =
        "현재 지표는 B 등급으로, 평상시에는 안정적이지만 스트레스가 누적될 경우 방어 반응이 급격히 상승했다가 가라앉는 패턴을 보일 수 있습니다.";
      break;
  }
  const conflictText = `${conflictBaseText} ${conflictGradeText}`;

  // 5) 사회 대사 효율 (Productivity / Energy Utilization)
  const productivityBaseText =
    "에너지 대사 효율은 자원을 얼마나 손실 없이 기능·회복에 배분하는가를 나타내는 핵심 지표입니다";
  let productivityGradeText;
  switch ((productivityGrade || "").charAt(0)) {
    case "A":
      productivityGradeText =
        "현재 지표는 A 등급으로, 상대적으로 적은 자원으로도 높은 기능 수준을 유지할 수 있는 상태입니다. 사회적으로는 ‘고효율 인력’으로 분류됩니다.";
      break;
    case "C":
      productivityGradeText =
        "현재 지표는 C 등급으로, 에너지를 확보하고 활용하는 과정에서 손실이 많이 발생해 일상 활동만으로도 피로가 쉽게 누적될 수 있는 상태입니다.";
      break;
    default:
      productivityGradeText =
        "현재 지표는 B 등급으로, 기본적인 기능 수행에는 문제가 없지만 장시간 고부하 환경에서는 효율이 빠르게 떨어질 수 있는 중간 영역에 해당합니다.";
      break;
  }
  const productivityText = `${productivityBaseText} ${productivityGradeText}`;

  // === 포커스용 점수 묶음 ===
  const scores = {
    diversity: diversityScore,
    conformity: conformityScore,
    cohesion: cohesionScore,
    conflict: conflictScore,
    productivity: productivityScore,
  };

  const textsForFocus = {
    diversity: diversityText,
    conformity: conformityText,
    cohesion: cohesionText,
    conflict: conflictText,
    productivity: productivityText,
  };

  const metricList = [
    { key: "conflict", grade: conflictGrade, score: conflictScore },
    { key: "diversity", grade: diversityGrade, score: diversityScore },
    { key: "productivity", grade: productivityGrade, score: productivityScore },
    { key: "cohesion", grade: cohesionGrade, score: cohesionScore },
    { key: "conformity", grade: conformityGrade, score: conformityScore },
  ];

  let focusMetric =
    metricList.find((m) => m.grade === "C") ||
    metricList
      .filter((m) => m.grade === "B")
      .sort((a, b) => a.score - b.score)[0] ||
    metricList[0];

  updateGutFocusOverlay(
    focusMetric.key,
    profile,
    scores,
    textsForFocus,
    focusMetric.grade
  );

  // === 상단 메타 ===
  const statusText =
    overallGrade === "A" ? "안정" : overallGrade === "B" ? "경계" : "주의";

  const idText =
    "G-" + String(2000 + Math.floor(Math.random() * 9000)) + "-" + overallGrade;

  window.lastGutProfileLabel = idText; // ✅ Supabase insert 때 같이 쓰려고 저장

  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const dateText = `${yyyy}년 ${mm}월 ${dd}일`;

  if (metaStatusEl) metaStatusEl.textContent = statusText;
  if (metaLevelEl) metaLevelEl.textContent = overallGrade;
  if (metaIdEl) metaIdEl.textContent = idText;
  if (metaDateEl) metaDateEl.textContent = dateText;

  if (metaStatusEl) {
    metaStatusEl.classList.remove("status-good", "status-warn", "status-bad");
  }
  if (metaLevelEl) {
    metaLevelEl.classList.remove("status-good", "status-warn", "status-bad");
  }

  let statusClass = "status-warn";
  if (overallGrade === "A") statusClass = "status-good";
  else if (overallGrade === "C") statusClass = "status-bad";

  if (metaStatusEl) metaStatusEl.classList.add(statusClass);
  if (metaLevelEl) metaLevelEl.classList.add(statusClass);

  if (mainMessageEl) {
    mainMessageEl.textContent = `귀하의 장내 생태는 사회 적응도 ${overallScoreText}로 판정되었습니다.`;
  }
  if (subMessageEl) {
    subMessageEl.textContent = actionLine;
  }

  const gutSummaryEl = document.getElementById("gutSummaryText");
  if (gutSummaryEl) {
    gutSummaryEl.innerHTML = `
      <div class="gut-summary-main">
        귀하의 장내 생태는 사회 적응도
        <span class="gut-summary-score">${overallScoreText}</span>
        로 판정되었습니다.
      </div>
      <div class="gut-summary-sub">
        ${actionLine}
      </div>
    `;
  }

  resultListEl.style.display = "block";
  resultListEl.innerHTML = `
<div class="gut-layout-right-inner"
     style="display:flex; flex-direction:column; gap:24px; padding-top:20px; height:100%;">
  
  <!-- 상단 섹션 타이틀 -->
  <div style="
    align-self:flex-start;
    font-size:17px;
    letter-spacing:0.18em;
    text-transform:uppercase;
    color:#FAF2E5;
    font-weight:800;
    display:flex;
    align-items:center;
    gap:8px;
  ">
    <span style="color:${gradeColor};">●</span>
    <span>장내 생태 기반 사회 적응도 분석 보고서</span>
  </div>

  <div style="
    flex:1;
    display:grid;
    grid-template-columns:repeat(2,minmax(0,1fr));
    grid-auto-rows:minmax(0,1fr);
    row-gap:8px;
    column-gap:12px;
    min-height:0;
  ">

    <!-- 0. 레이더 카드 -->
    <div class="gut-radar-card">
      <div class="gut-radar-header">
        <div class="gut-radar-title">장내 사회 지표 레이더</div>
        <div class="gut-radar-legend"></div>
      </div>
      <div class="gut-radar-canvas-wrap">
        <canvas id="gutRadar"></canvas>
      </div>
    </div>

    ${(() => {
      const cardBase = `
  background:#FAF2E5;
  opacity:0.78;
  border-radius:16px;
  padding:14px 18px 16px 18px;
  box-shadow:0 8px 20px rgba(15,23,42,0.06);
  display:flex;
  flex-direction:column;
  gap:8px;
`;

      // 등급 한 글자(A/B/C) 미리 뽑기
      const divGrade = (diversityGrade || "").charAt(0);
      const confGrade = (conformityGrade || "").charAt(0);
      const cohGrade = (cohesionGrade || "").charAt(0);
      const inflamGrade = (conflictGrade || "").charAt(0);
      const prodGrade = (productivityGrade || "").charAt(0);

      const titleRow = (label, shortGrade, icon) => `
    <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:12px;">
      <div style="display:flex; align-items:center; gap:10px;">
        <img src="assets/img/${icon}.svg" style="width:32px;height:32px;" />
        <span style="font-size:15px; font-weight:800; color:#111827;">
          ${label}
        </span>
      </div>
      <span class="gut-card-grade gut-card-grade-${shortGrade}">
        ${shortGrade}
      </span>
    </div>
  `;

      return `
      <!-- 1. 정상성 스펙트럼 -->
      <div style="${cardBase}">
        ${titleRow("정상성 스펙트럼", divGrade, diversityIcon)}
        <div class="gut-card-metric gut-card-metric-${divGrade}">
          다양성 = ${profile.D.toFixed(2)} · ${pct(diversityScore)}
        </div>

        <div class="gut-metric-bar">
          <canvas id="gutMetric_diversity"></canvas>
        </div>

        <p style="font-size:13px; color:#4b5563; margin:0; line-height:1.4;">
          ${diversityText}
        </p>
      </div>

      <!-- 2. 규범 순응도 -->
      <div style="${cardBase}">
        ${titleRow("규범 순응도", confGrade, conformityIcon)}
        <div class="gut-card-metric gut-card-metric-${confGrade}">
          B = ${profile.B.toFixed(2)}, P = ${profile.P.toFixed(2)} · ${pct(
        conformityScore
      )}
        </div>
        <div class="gut-metric-bar">
          <canvas id="gutMetric_conformity"></canvas>
        </div>

        <p style="font-size:13px; color:#4b5563; margin:0; line-height:1.4;">
          ${conformityText}
        </p>
      </div>

      <!-- 3. 공동체 유지 에너지 -->
      <div style="${cardBase}">
        ${titleRow("공동체 유지 에너지", cohGrade, cohesionIcon)}
        <div class="gut-card-metric gut-card-metric-${cohGrade}">
          SCFA = ${profile.Bt.toFixed(1)} · ${pct(cohesionScore)}
        </div>

        <div class="gut-metric-bar">
          <canvas id="gutMetric_cohesion"></canvas>
        </div>

        <p style="font-size:13px; color:#4b5563; margin:0; line-height:1.4;">
          ${cohesionText}
        </p>
      </div>

      <!-- 4. 사회 염증 지수 -->
      <div style="${cardBase}">
        ${titleRow("사회 염증 지수", inflamGrade, conflictIcon)}
        <div class="gut-card-metric gut-card-metric-${inflamGrade}">
          L = ${profile.L.toFixed(2)}, C = ${profile.C.toFixed(1)} · ${pct(
        conflictScore
      )}
        </div>

        <div class="gut-metric-bar">
          <canvas id="gutMetric_conflict"></canvas>
        </div>

        <p style="font-size:13px; color:#4b5563; margin:0; line-height:1.4;">
          ${conflictText}
        </p>
      </div>

      <!-- 5. 사회 대사 효율 -->
      <div style="${cardBase}">
        ${titleRow("사회 대사 효율", prodGrade, productivityIcon)}
        <div class="gut-card-metric gut-card-metric-${prodGrade}">
          EEE = ${profile.EEE.toFixed(2)} · ${pct(productivityScore)}
        </div>

        <div class="gut-metric-bar">
          <canvas id="gutMetric_productivity"></canvas>
        </div>

        <p style="font-size:13px; color:#4b5563; margin:0; line-height:1.4;">
          ${productivityText}
        </p>
      </div>`;
    })()}

  </div>
</div>
`;

  setTimeout(() => {
    drawGutRadar({
      labels: [
        "정상성 스펙트럼",
        "규범 순응도",
        "공동체 유지",
        "사회 염증",
        "대사 효율",
      ],
      values: [
        diversityScore,
        conformityScore,
        cohesionScore,
        conflictScore,
        productivityScore,
      ],
      grades: [
        diversityGrade,
        conformityGrade,
        cohesionGrade,
        conflictGrade,
        productivityGrade,
      ],
    });

    // 🔹 각 카드 안 미니 바 차트
    drawGutMiniBar("gutMetric_diversity", diversityScore, diversityGrade);
    drawGutMiniBar("gutMetric_conformity", conformityScore, conformityGrade);
    drawGutMiniBar("gutMetric_cohesion", cohesionScore, cohesionGrade);
    drawGutMiniBar("gutMetric_conflict", conflictScore, conflictGrade);
    drawGutMiniBar(
      "gutMetric_productivity",
      productivityScore,
      productivityGrade
    );
  }, 0);
}

// 🔍 결과 페이지: 장 위 포커스 카드 (간결 버전)
function updateGutFocusOverlay(focusKey, profile, scores, _texts, rawGrade) {
  if (!gutFocusOverlayEl) return;

  const configMap = {
    diversity: {
      label: "정상성 스펙트럼",
      dotX: "15%",
      dotY: "48%",
      cardX: "8%",
      cardTop: "66%",
    },
    conformity: {
      label: "규범 순응도",
      dotX: "75%",
      dotY: "73%",
      cardX: "56%",
      cardTop: "78%",
    },
    cohesion: {
      label: "공동체 유지 에너지",
      dotX: "90%",
      dotY: "48%",
      cardX: "56%",
      cardTop: "60%",
    },
    conflict: {
      label: "사회 염증 지수",
      dotX: "58%",
      dotY: "34%",
      cardX: "54%",
      cardTop: "66%",
    },
    productivity: {
      label: "사회 대사 효율",
      dotX: "51%",
      dotY: "76%",
      cardX: "40%",
      cardTop: "82%",
    },
  };

  const cfg = configMap[focusKey];
  if (!cfg) {
    gutFocusOverlayEl.style.display = "none";
    return;
  }

  gutFocusOverlayEl.style.display = "block";

  // 위치
  const rootStyle = gutFocusOverlayEl.style;
  rootStyle.setProperty("--gut-focus-dot-x", cfg.dotX);
  rootStyle.setProperty("--gut-focus-dot-y", cfg.dotY);
  rootStyle.setProperty("--gut-focus-card-x", cfg.cardX);
  rootStyle.setProperty("--gut-focus-card-top", cfg.cardTop);

  // 수치 한 줄
  let sub = "";
  switch (focusKey) {
    case "diversity":
      sub = `D = ${profile.D.toFixed(2)} · ${Math.round(
        scores.diversity * 100
      )}%`;
      break;
    case "conformity":
      sub = `B = ${profile.B.toFixed(2)}, P = ${profile.P.toFixed(
        2
      )} · ${Math.round(scores.conformity * 100)}%`;
      break;
    case "cohesion":
      sub = `SCFA = ${profile.Bt.toFixed(1)} · ${Math.round(
        scores.cohesion * 100
      )}%`;
      break;
    case "conflict":
      sub = `L = ${profile.L.toFixed(2)}, C = ${profile.C.toFixed(
        1
      )} · ${Math.round(scores.conflict * 100)}%`;
      break;
    case "productivity":
      sub = `EEE = ${profile.EEE.toFixed(2)} · ${Math.round(
        scores.productivity * 100
      )}%`;
      break;
  }

  if (gutFocusTitleEl) gutFocusTitleEl.textContent = cfg.label;

  if (gutFocusSubEl) {
    gutFocusSubEl.textContent = sub;

    const g = (rawGrade || "").charAt(0) || "B";
    gutFocusSubEl.classList.remove(
      "gut-focus-sub-A",
      "gut-focus-sub-B",
      "gut-focus-sub-C"
    );
    if (g === "A") gutFocusSubEl.classList.add("gut-focus-sub-A");
    else if (g === "C") gutFocusSubEl.classList.add("gut-focus-sub-C");
    else gutFocusSubEl.classList.add("gut-focus-sub-B");
  }

  // 👉 본문은 등급 요약 한 문장만
  if (gutFocusBodyEl) {
    const g = (rawGrade || "").charAt(0) || "B";
    let oneLine = "";

    switch (g) {
      case "A":
        oneLine = "공단 기준 A 등급으로, 가장 안정적인 상태입니다.";
        break;
      case "C":
        oneLine = "공단 기준 C 등급으로, 집중 관리가 필요한 상태입니다.";
        break;
      default:
        oneLine = "공단 기준 B 등급으로, 평균 범위에 해당합니다.";
        break;
    }

    gutFocusBodyEl.textContent = oneLine;
  }
}

function drawGutRadar(data) {
  const canvas = document.getElementById("gutRadar");
  if (!canvas || !canvas.getContext) return;

  const ctx = canvas.getContext("2d");

  const width = canvas.clientWidth || 260;
  const height = canvas.clientHeight || 220;
  canvas.width = width;
  canvas.height = height;

  const cx = width / 2;
  const cy = height / 2 + 4; // 살짝 아래로
  const radius = Math.min(width, height) * 0.33; // 살짝만 줄여서 여백 확보

  const labels = data.labels;
  const values = data.values.map((v) => Math.max(0, Math.min(1, v)));
  const grades = (data.grades || []).map((g) => (g || "B")[0]); // "A-/B+" -> "A/B"
  const count = labels.length;

  ctx.clearRect(0, 0, width, height);
  ctx.save();
  ctx.translate(0.5, 0.5); // 비트맵 경계 보정

  // --------------------------
  // 등급 → 색 정의 (브랜드 색)
  // --------------------------
  const gradeHex = (g) => {
    const gg = (g || "B")[0];
    if (gg === "A") return "#0D7C64"; // 안정 (초록)
    if (gg === "C") return "#80233B"; // 주의 (와인)
    return "#FFAA2B"; // 경계 (노랑)
  };

  const hexToRgb = (hex) => {
    const h = hex.replace("#", "");
    return {
      r: parseInt(h.substring(0, 2), 16),
      g: parseInt(h.substring(2, 4), 16),
      b: parseInt(h.substring(4, 6), 16),
    };
  };

  // --------------------------
  // 1) 그리드 폴리곤 (축/가이드)
  // --------------------------
  const levels = 4;
  ctx.strokeStyle = "rgba(0, 0, 0, 0.6)";
  ctx.lineWidth = 1;

  for (let l = 1; l <= levels; l++) {
    const r = (radius * l) / levels;
    ctx.beginPath();
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count - Math.PI / 2;
      const x = cx + Math.cos(angle) * r;
      const y = cy + Math.sin(angle) * r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.stroke();
  }

  // --------------------------
  // 2) 축 라인 + 라벨
  // --------------------------
  ctx.font = "14px Sweet, system-ui";
  ctx.fillStyle = "rgba(0, 0, 0, 0.95)";

  for (let i = 0; i < count; i++) {
    const angle = (Math.PI * 2 * i) / count - Math.PI / 2;
    const x = cx + Math.cos(angle) * radius;
    const y = cy + Math.sin(angle) * radius;

    // 축
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(x, y);
    ctx.stroke();

    // 라벨 위치
    const labelRadius = radius + 16;
    const lx = cx + Math.cos(angle) * labelRadius;
    const ly = cy + Math.sin(angle) * labelRadius;

    ctx.textAlign =
      Math.cos(angle) > 0.2
        ? "left"
        : Math.cos(angle) < -0.2
        ? "right"
        : "center";
    ctx.textBaseline =
      Math.sin(angle) > 0.2
        ? "top"
        : Math.sin(angle) < -0.2
        ? "bottom"
        : "middle";

    ctx.fillText(labels[i], lx, ly);
  }

  // --------------------------
  // 3) 꼭짓점 좌표 + 색 준비
  // --------------------------
  const points = [];
  for (let i = 0; i < count; i++) {
    const angle = (Math.PI * 2 * i) / count - Math.PI / 2;
    const r = radius * values[i];
    const x = cx + Math.cos(angle) * r;
    const y = cy + Math.sin(angle) * r;

    const hex = gradeHex(grades[i]);
    const rgb = hexToRgb(hex);

    points.push({ x, y, hex, rgb });
  }

  // --------------------------
  // 4) 면(폴리곤) 그라데이션
  //    - 중심(cx,cy)과 인접 두 꼭짓점으로 삼각형 만들어서
  //      edge 방향으로 A→B 그라데이션
  // --------------------------
  ctx.globalAlpha = 0.7; // 면은 살짝 투명
  for (let i = 0; i < count; i++) {
    const p1 = points[i];
    const p2 = points[(i + 1) % count];

    // 이 변 방향으로 선형 그라데이션
    const grad = ctx.createLinearGradient(p1.x, p1.y, p2.x, p2.y);
    grad.addColorStop(0, `rgba(${p1.rgb.r},${p1.rgb.g},${p1.rgb.b},0.35)`);
    grad.addColorStop(1, `rgba(${p2.rgb.r},${p2.rgb.g},${p2.rgb.b},0.35)`);

    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();
  }
  ctx.globalAlpha = 1.0;

  // --------------------------
  // 5) 선(폴리곤 테두리) 그라데이션
  //    - 각 변마다 A색 → B색 그라데이션
  // --------------------------
  ctx.lineWidth = 2;
  for (let i = 0; i < count; i++) {
    const p1 = points[i];
    const p2 = points[(i + 1) % count];

    const gradLine = ctx.createLinearGradient(p1.x, p1.y, p2.x, p2.y);
    gradLine.addColorStop(0, `rgba(${p1.rgb.r},${p1.rgb.g},${p1.rgb.b},0.95)`);
    gradLine.addColorStop(1, `rgba(${p2.rgb.r},${p2.rgb.g},${p2.rgb.b},0.95)`);

    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.strokeStyle = gradLine;
    ctx.stroke();
  }

  // --------------------------
  // 6) 꼭짓점 점 (등급 색) - 보더 없음
  // --------------------------
  for (let i = 0; i < count; i++) {
    const p = points[i];

    ctx.beginPath();
    ctx.arc(p.x, p.y, 3.2, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(${p.rgb.r},${p.rgb.g},${p.rgb.b},1)`;
    ctx.fill();
    // ⚠️ stroke() 호출 안 함 → 보더 없음
  }

  ctx.restore();
}

function drawGutMiniBar(canvasId, value, grade) {
  const canvas = document.getElementById(canvasId);
  if (!canvas || !canvas.getContext) return;

  const ctx = canvas.getContext("2d");

  const width = canvas.clientWidth || 180;
  const height = canvas.clientHeight || 16;
  canvas.width = width;
  canvas.height = height;

  ctx.clearRect(0, 0, width, height);

  // 0~1로 클램프
  const v = Math.max(0, Math.min(1, value || 0));
  const avg = 0.5; // 🔹 공단 평균선 (중앙 고정)

  // 등급별 색 (브랜드 팔레트)
  let pointColor = "#FFAA2B"; // B 기본
  const g = (grade || "").charAt(0);
  if (g === "A") pointColor = "#0D7C64";
  else if (g === "C") pointColor = "#80233B";

  const trackY = height / 2;
  const marginX = 6;
  const trackStartX = marginX;
  const trackEndX = width - marginX;
  const trackW = trackEndX - trackStartX;

  // 1) 전체 트랙 (얇은 선)
  ctx.strokeStyle = "rgba(0,0,0,0.18)";
  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(trackStartX, trackY);
  ctx.lineTo(trackEndX, trackY);
  ctx.stroke();

  // 2) 평균선 (공단 평균 기준선) - 회색 세로선
  const avgX = trackStartX + trackW * avg;
  ctx.strokeStyle = "rgba(0,0,0,0.35)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(avgX, trackY - 6);
  ctx.lineTo(avgX, trackY + 6);
  ctx.stroke();

  // 3) 내 점 위치
  const valX = trackStartX + trackW * v;

  // 평균과 내 점 사이를 옅게 연결 (살짝만)
  ctx.strokeStyle = pointColor + "55"; // 살짝 투명
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(avgX, trackY);
  ctx.lineTo(valX, trackY);
  ctx.stroke();

  // 4) 내 점 ●
  const rOuter = 5;
  const rInner = 2.8;

  // 바깥 테두리 (밝은 아이보리 테두리)
  ctx.fillStyle = "#FAF2E5";
  ctx.beginPath();
  ctx.arc(valX, trackY, rOuter, 0, Math.PI * 2);
  ctx.fill();

  // 안쪽 컬러 점
  ctx.fillStyle = pointColor;
  ctx.beginPath();
  ctx.arc(valX, trackY, rInner, 0, Math.PI * 2);
  ctx.fill();
}

// 공용 둥근 사각형 유틸
function roundRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, h / 2, w / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
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

// 🔥 스캔 결과를 Supabase profiles 테이블에 저장
async function saveScanProfileToSupabase(profile) {
  if (!db || !profile) return;

  // profile 안에 있는 값 이름은 네 구조에 맞게 가져오면 됨
  // 아래는 예시: D/B/P + socialIndex + 효율값
  const row = {
    profile_label: profile.label || profile.id || "GA-01", // 티커에 쓸 이름
    social_score: profile.socialIndex ?? profile.sni ?? 0.5, // 0~1
    diversity: profile.D ?? 0.6,
    benefit: profile.B ?? 0.5,
    pathology: profile.P ?? 0.5,
    efficiency: profile.EEE ?? profile.E ?? 1.0, // 네가 쓰는 효율값
  };

  const { error } = await db.from("profiles").insert(row);
  if (error) {
    console.error("❌ saveScanProfileToSupabase error:", error);
  } else {
    console.log("✅ profile saved to Supabase:", row);
  }
}

// ✅ 수정된 버전 (profiles 테이블 구조에 맞춤)
async function listCardToSupabase() {
  // 이미 C2 화면에서 analysisResult를 만든 상태니까
  // 혹시라도 null이면 한 번 만들어 주는 정도만.
  if (!analysisResult) {
    const profile = createRandomGutProfile();
    analysisResult = generateAnalysisFromGutProfile(profile);
  }

  const profile = analysisResult.profile; // { D, B, P, Bt, L, C, EEE, beta }
  const sm = analysisResult.socialMetrics || {}; // { NRS, CS, ... sni }
  const sniRaw = analysisResult.sni ?? 0.5;

  // 0~1 → 점수
  const socialScore = Math.max(0, Math.min(1, sniRaw));

  // A/B/C 등급
  let grade;
  if (socialScore >= 0.7) grade = "A";
  else if (socialScore >= 0.4) grade = "B";
  else grade = "C";

  // 프로필 라벨은 C2에서 썼던 ID 형식 재사용 (없으면 기본값)
  const profileLabel =
    (window.lastGutProfileLabel && String(window.lastGutProfileLabel)) ||
    "장내 자산 프로파일";

  const { error } = await db.from("profiles").insert({
    diversity: profile.D, // 다양성
    benefit: profile.B, // 유익도
    pathology: profile.P, // 위험도/병리
    scfa: profile.Bt, // SCFA
    inflammation: profile.L, // 염증 (필요하면 L+C로 다시 설계해도 됨)
    efficiency: profile.EEE, // 에너지 효율
    social_score: socialScore, // 0~1 사회 적응도 지수
    grade,
    profile_label: profileLabel,
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
  // --- 좌석 이탈 예외 처리 ---
  if (!pressureOn && leaveStartTime) {
    const elapsed = (Date.now() - leaveStartTime) / 1000;

    // 1차 경고
    if (elapsed >= 2 && !warnedOnce) {
      warnedOnce = true;
      showWarningPage(
        "착석이 해제되었습니다.\n다시 앉으시면 이어서 진행됩니다."
      );
    }

    // 2차 경고
    // 2차 경고
    if (elapsed >= 10) {
      showWarningPage("스캔이 중단되었습니다.\n처음부터 다시 진행해 주세요.");
      setTimeout(() => {
        warnedOnce = false;
        leaveStartTime = null;

        // 🔥 터치 다시 먹게 플래그 리셋
        testTriggered = false;
        scanRunning = false;
        scanTimer = 0;
        purity = 0;

        setPhase("A0-1");
        hideWarningPage();
      }, 2500);
    }

    return; // 스캔 진행 멈춤
  }

  // 착석 복귀 시
  if (pressureOn && leaveStartTime) {
    leaveStartTime = null;
    warnedOnce = false;
    hideWarningPage();
  }

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

// ✅ C2(리절트 화면)에서 상장 확정할 때 공통으로 쓰는 함수
async function commitListingFromScan() {
  // 상장 절차 진행 화면
  setPhase("C3");

  // Supabase profiles 테이블에 현재 analysisResult 저장
  await listCardToSupabase();

  // C3 문구를 잠깐 보여준 뒤 → 상장 완료 안내(C5)
  setTimeout(() => {
    setPhase("C5"); // C5 안에서 3.5초 후 A0-1으로 리셋됨
  }, 800);
}

function onPressureChange(on) {
  pressureOn = on;
  updateSensorStatus();

  if (on) {
    // ✅ 스캔 중에 잠깐 일어났다가 "다시 앉은" 상황이면
    //    (경고 화면에서 복귀) → 리셋하지 말고 그대로 이어서 진행
    if (leaveStartTime) {
      leaveStartTime = null;
      warnedOnce = false;

      if (warningPageEl && warningPageEl.style.display === "flex") {
        hideWarningPage();
      }

      // currentPhase, scanTimer, purity 그대로 유지
      return;
    }

    // ✅ 결과 페이지에서 다시 앉으면 아무 일도 안 함
    if (
      currentPhase === "C2" ||
      currentPhase === "C3" ||
      currentPhase === "C4" ||
      currentPhase === "C5"
    ) {
      return;
    }

    // ✅ 그 외(처음 착석 등)는 기존처럼 스캔 시작
    lastSitTime = Date.now();
    setPhase("A1-2");
    scanTimer = 0;
    purity = 0;
    updateProgress();
    return;
  }

  // 🔻 여기부터는 착석 해제(on === false)

  // 🔻 C2(리절트 화면)에서 일어나면 = 상장 OK
  if (currentPhase === "C2") {
    commitListingFromScan(); // Supabase insert + C3 → C5
    return;
  }

  // 🔻 그 밖의 Phase에서 일어나면 = 상장 X, 그냥 이탈 타이머만
  const isScanPhase =
    currentPhase === "A1-2" ||
    currentPhase === "B1" ||
    currentPhase === "B2" ||
    currentPhase === "B3" ||
    currentPhase === "C1";

  if (isScanPhase && !leaveStartTime) {
    leaveStartTime = Date.now();
  }
}

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

    testTriggered = false;

    // 🔥 경고 상태도 초기화
    leaveStartTime = null;
    warnedOnce = false;
    hideWarningPage();

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

    testTriggered = false;

    // 🔥 여기도 같이 리셋
    leaveStartTime = null;
    warnedOnce = false;
    hideWarningPage();

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

// 🔊 페이지 로드 시 바로 앰비언트 재생 시도
playAmbient();

loopInterval = setInterval(mainLoopTick, 1000);

// -----------------------------
// 터치 테스트: standby → POSTURE
// -----------------------------

function handleStandbyTap() {
  // 이미 한 번 넘어갔으면 무시
  if (testTriggered) return;

  // 진짜 대기 상태일 때만 동작
  if (currentPhase === "A0-1" || currentPhase === "A0-2") {
    testTriggered = true;

    // 🔥 여기서 한 번만 Web Serial 연결 시도 (유저 탭 이벤트 안에서)
    if (!ledConnectTried && "serial" in navigator) {
      ledConnectTried = true;
      connectLedSerial().catch((err) => {
        console.error("LED connect error:", err);
      });
    }

    setPhase("POSTURE");
    scanTimer = 0;
    purity = 0;
    updateProgress();
  }
}

// 1) standbyScreen 자체에 한 번
if (standbyScreenEl) {
  standbyScreenEl.addEventListener("click", (e) => {
    // 혹시라도 위에서 막는 거 있으면 대비해서 stopPropagation 안 씀
    handleStandbyTap();
  });
}

// 2) 혹시 standby 위에 다른 레이어가 있어도
//    "대기 상태(A0-1 / A0-2)" 에서는 화면 아무 데나 탭하면 강제로 넘기기
document.body.addEventListener(
  "click",
  (e) => {
    if (currentPhase === "A0-1" || currentPhase === "A0-2") {
      handleStandbyTap();
    }
  },
  true // 🔥 capture 단계에서 먼저 가로챔
);

// -----------------------------
// POSTURE 화면 터치 → 바로 스캔 시작(A1-2)
// -----------------------------
if (postureEl) {
  postureEl.addEventListener("click", (event) => {
    // 다른 phase에서는 무시
    if (currentPhase !== "POSTURE") return;

    // 🔥 여기서 버블링 막기 (scanRoot 클릭 핸들러로 안 올라가게)
    event.stopPropagation();

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

// -----------------------------
// 스캔 화면 / 결과 화면 터치 처리
// -----------------------------
if (scanRootEl) {
  scanRootEl.addEventListener("click", () => {
    // 1) 이미 결과 화면(C2)이면 → 상장 완료 플로우 강제 실행 (테스트용)
    if (currentPhase === "C2") {
      commitListingFromScan(); // ✅ Supabase insert + C3 → C5
      return;
    }

    // 2) 그 외에는 기존처럼 "스캔 중일 때만" 결과로 점프 (테스트용)
    const isScanFastJumpPhase =
      currentPhase === "A1-2" ||
      currentPhase === "B1" ||
      currentPhase === "B2" ||
      currentPhase === "B3" ||
      currentPhase === "C1";

    if (!isScanFastJumpPhase) return;
    if (scanResultStarted) return; // 이미 한번 넘어간 상태면 무시

    const profile = createRandomGutProfile();
    analysisResult = generateAnalysisFromGutProfile(profile);

    scanOverallTimer = SCAN_OVERALL_TOTAL;
    updateProgress();

    setPhase("C2");
    renderAnalysisResult();
    showMicrobes(false);
  });
}

// ----------------------------------------------------
// 🔥 여기가 warningPageEl 터치 이벤트를 넣는 정확한 자리
// ----------------------------------------------------
if (warningPageEl) {
  warningPageEl.addEventListener("click", () => {
    // 경고 페이지가 떠있을 때만 동작
    if (warningPageEl.style.display !== "flex") return;

    // 다시 앉은 것으로 취급 → 이어서 진행
    onPressureChange(true);
  });
}

// -----------------------------
// 키보드 테스트 (Q/W로 예외 상황 시뮬레이션)
// -----------------------------
window.addEventListener("keydown", (e) => {
  // Q: "지금 일어났다"를 강제로 시뮬레이션 + 1차 경고 즉시 노출
  if (e.key === "q" || e.key === "Q") {
    // 센서 상태를 "스캔 중 → 갑자기 일어남"으로 강제
    pressureOn = false;
    leaveStartTime = Date.now(); // 🔥 여기서 타이머 시작
    warnedOnce = true; // 1차 경고는 직접 띄웠으니까 mainLoop에서 또 안 띄움

    showWarningPage("착석이 해제되었습니다.\n다시 앉으시면 이어서 진행됩니다.");
  }

  // W: 2차 경고 즉시 + 2.5초 후 완전 리셋
  else if (e.key === "w" || e.key === "W") {
    showWarningPage("스캔이 중단되었습니다.\n처음부터 다시 진행해 주세요.");

    setTimeout(() => {
      warnedOnce = false;
      leaveStartTime = null;
      testTriggered = false;
      scanRunning = false;
      scanTimer = 0;
      purity = 0;

      setPhase("A0-1");
      hideWarningPage();
    }, 2500);
  }
});
