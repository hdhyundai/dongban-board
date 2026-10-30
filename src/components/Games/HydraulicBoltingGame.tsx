import React, { useEffect, useRef, useState } from "react";
import { Play, RotateCcw, Volume2, VolumeX, Wrench, Award, Zap, ShieldCheck, AlertCircle, AlertTriangle, CheckCircle2 } from "lucide-react";
import confetti from "canvas-confetti";
import { gameAudio } from "../../lib/gameSounds";
import { getGameCanvasFont } from "../../lib/gameFonts";

interface HydraulicBoltingGameProps {
  onFinish: (score: number) => void;
}

interface Bolt {
  id: number;
  x: number;
  y: number;
  angle: number;
  tightened: boolean;
  quality: "PERFECT" | "GOOD" | "OVER" | "UNDER" | "NONE";
  torqueValue: number; // in N·m
}

interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
}

interface FloatingScore {
  x: number;
  y: number;
  text: string;
  color: string;
  life: number;
  maxLife: number;
}

interface ToolState {
  x: number;
  y: number;
  angle: number;
  targetX: number;
  targetY: number;
  targetAngle: number;
  recoil: number;
  shake: number;
}

const STAGE_CONFIGS = [
  {
    stage: 1,
    name: "선박용 대형 디젤 엔진 실린더 헤드",
    spec: "M48 스터드 볼트 (목표 1,200 N·m)",
    targetTorque: 1200,
    tolerance: 90,
    boltCount: 8,
    gaugeSpeed: 1.35,
    timeLimit: 25,
  },
  {
    stage: 2,
    name: "초대형 프로펠러 중간축 커플링",
    spec: "M56 고장력 볼트 (목표 1,500 N·m)",
    targetTorque: 1500,
    tolerance: 80,
    boltCount: 10,
    gaugeSpeed: 1.65,
    timeLimit: 28,
  },
  {
    stage: 3,
    name: "LNG선 극저온 초고압 매니폴드",
    spec: "M64 인코넬 특수 볼트 (목표 1,800 N·m)",
    targetTorque: 1800,
    tolerance: 70,
    boltCount: 12,
    gaugeSpeed: 1.95,
    timeLimit: 30,
  },
];

export default function HydraulicBoltingGame({ onFinish }: HydraulicBoltingGameProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [gameState, setGameState] = useState<"READY" | "PLAYING" | "STAGE_CLEAR" | "GAMEOVER" | "VICTORY">("READY");
  const [stage, setStage] = useState(1);
  const [score, setScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(25);
  const [combo, setCombo] = useState(0);
  const [selectedBoltId, setSelectedBoltId] = useState<number | null>(0);
  const [lastTorque, setLastTorque] = useState<number | null>(null);
  const [lastRating, setLastRating] = useState<string | null>(null);
  const [noticeMessage, setNoticeMessage] = useState<{ text: string; type: "perfect" | "good" | "under" | "over" | "info" } | null>(null);
  const [isMuted, setIsMuted] = useState(gameAudio.getMuted());

  const stateRef = useRef({
    isPlaying: false,
    score: 0,
    stage: 1,
    timeLeft: 25,
    combo: 0,
    selectedBoltId: 0 as number | null,
    hoveredBoltId: null as number | null,
    bolts: [] as Bolt[],
    needleAngle: 0, // 0 to 1 back and forth
    needleDir: 1,
    toolState: {
      x: 0,
      y: 0,
      angle: 0,
      targetX: 0,
      targetY: 0,
      targetAngle: 0,
      recoil: 0,
      shake: 0,
    } as ToolState,
    sparks: [] as Spark[],
    floatingScores: [] as FloatingScore[],
    screenW: 600,
    screenH: 450,
    lastTime: performance.now(),
  });

  const toggleSound = (e: React.MouseEvent) => {
    e.stopPropagation();
    const muted = gameAudio.toggleMute();
    setIsMuted(muted);
  };

  const showToast = (text: string, type: "perfect" | "good" | "under" | "over" | "info") => {
    setNoticeMessage({ text, type });
  };

  const initStageBolts = (stgNum: number, w: number, h: number) => {
    const config = STAGE_CONFIGS[stgNum - 1];
    const centerX = w / 2;
    const centerY = h / 2 + 10;
    const radius = Math.min(w, h) * 0.32;
    const count = config.boltCount;

    // Cross / Star bolt tightening sequence pattern
    const orderIndices: number[] = [];
    const half = Math.floor(count / 2);
    for (let i = 0; i < half; i++) {
      orderIndices.push(i);
      orderIndices.push((i + half) % count);
    }

    const bolts: Bolt[] = [];
    for (let i = 0; i < count; i++) {
      const idx = orderIndices[i] !== undefined ? orderIndices[i] : i;
      const angle = (idx / count) * Math.PI * 2 - Math.PI / 2;
      const bx = centerX + Math.cos(angle) * radius;
      const by = centerY + Math.sin(angle) * radius;

      bolts.push({
        id: i,
        x: bx,
        y: by,
        angle,
        tightened: false,
        quality: "NONE",
        torqueValue: 0,
      });
    }

    stateRef.current.bolts = bolts;
    // Start with bolt 0 selected
    stateRef.current.selectedBoltId = 0;
    setSelectedBoltId(0);

    const firstBolt = bolts[0];
    if (firstBolt) {
      const radialAngle = Math.atan2(firstBolt.y - centerY, firstBolt.x - centerX);
      stateRef.current.toolState.x = firstBolt.x;
      stateRef.current.toolState.y = firstBolt.y;
      stateRef.current.toolState.angle = radialAngle;
      stateRef.current.toolState.targetX = firstBolt.x;
      stateRef.current.toolState.targetY = firstBolt.y;
      stateRef.current.toolState.targetAngle = radialAngle;
    }
  };

  const startStage = (stgNum: number) => {
    const config = STAGE_CONFIGS[stgNum - 1];
    stateRef.current.stage = stgNum;
    stateRef.current.timeLeft = config.timeLimit;
    stateRef.current.needleAngle = 0;
    stateRef.current.needleDir = 1;
    stateRef.current.lastTime = performance.now();
    stateRef.current.sparks = [];
    stateRef.current.floatingScores = [];

    initStageBolts(stgNum, stateRef.current.screenW, stateRef.current.screenH);

    setStage(stgNum);
    setTimeLeft(config.timeLimit);
    setLastTorque(null);
    setLastRating(null);
    setNoticeMessage({ text: "볼트를 클릭하여 전동 공구를 장착하고, 녹색 토크 존에서 체결하세요!", type: "info" });
    setGameState("PLAYING");
    stateRef.current.isPlaying = true;
  };

  const startGame = () => {
    stateRef.current.score = 0;
    stateRef.current.combo = 0;
    setScore(0);
    setCombo(0);
    gameAudio.playStart();
    startStage(1);
  };

  // Select a specific bolt directly
  const selectBolt = (boltId: number) => {
    const bolt = stateRef.current.bolts.find((b) => b.id === boltId);
    if (!bolt) return;

    stateRef.current.selectedBoltId = boltId;
    setSelectedBoltId(boltId);
    gameAudio.playClick();

    const centerX = stateRef.current.screenW / 2;
    const centerY = stateRef.current.screenH / 2 + 10;
    const radialAngle = Math.atan2(bolt.y - centerY, bolt.x - centerX);

    stateRef.current.toolState.targetX = bolt.x;
    stateRef.current.toolState.targetY = bolt.y;
    stateRef.current.toolState.targetAngle = radialAngle;

    if (bolt.tightened && (bolt.quality === "PERFECT" || bolt.quality === "GOOD")) {
      showToast(`볼트 #${boltId + 1}: 이미 규정 토크로 정상 체결 완료되었습니다.`, "info");
    } else if (bolt.quality === "UNDER") {
      showToast(`볼트 #${boltId + 1}: 토크 부족 상태! 게이지 녹색 존에 맞춰 재체결하세요.`, "under");
    } else if (bolt.quality === "OVER") {
      showToast(`볼트 #${boltId + 1}: 과토크 체결로 나사선 손상됨 (체결 불가)`, "over");
    } else {
      showToast(`볼트 #${boltId + 1} 공구 장착 완료! [Space] 또는 [토크 체결]을 누르세요.`, "info");
    }
  };

  // Find next un-tightened bolt in sequence
  const findNextUncompletedBoltId = (): number | null => {
    const uncompleted = stateRef.current.bolts.filter(
      (b) => !b.tightened || b.quality === "UNDER" || b.quality === "NONE"
    );
    if (uncompleted.length === 0) return null;

    // Try finding next in index order after current
    const curId = stateRef.current.selectedBoltId ?? -1;
    const nextInLine = uncompleted.find((b) => b.id > curId);
    return nextInLine ? nextInLine.id : uncompleted[0].id;
  };

  // User Action: Tighten the currently selected Bolt
  const handleTighten = () => {
    if (!stateRef.current.isPlaying) return;

    let targetBoltId = stateRef.current.selectedBoltId;
    if (targetBoltId === null) {
      // Auto select first uncompleted if none selected
      const nextId = findNextUncompletedBoltId();
      if (nextId !== null) {
        selectBolt(nextId);
        showToast("체결할 볼트에 전동 공구를 먼저 장착했습니다! 다시 [토크 체결]을 누르세요.", "info");
        return;
      }
      showToast("체결할 볼트를 직접 클릭해 선택하세요!", "info");
      return;
    }

    const bolt = stateRef.current.bolts.find((b) => b.id === targetBoltId);
    if (!bolt) return;

    // If already properly tightened, don't allow re-tightening unless it was UNDER
    if (bolt.tightened && (bolt.quality === "PERFECT" || bolt.quality === "GOOD")) {
      const nextId = findNextUncompletedBoltId();
      if (nextId !== null) {
        selectBolt(nextId);
        showToast(`다음 미체결 볼트 #${nextId + 1}로 공구를 이동했습니다!`, "info");
      } else {
        showToast("모든 볼트가 이미 체결 완료되었습니다!", "info");
      }
      return;
    }

    if (bolt.tightened && bolt.quality === "OVER") {
      const nextId = findNextUncompletedBoltId();
      if (nextId !== null) {
        selectBolt(nextId);
        showToast(`볼트 #${targetBoltId + 1}은 과토크 손상되어 수정 불가합니다. 다음 볼트로 이동!`, "over");
      }
      return;
    }

    const config = STAGE_CONFIGS[stateRef.current.stage - 1];

    // Calculate applied torque based on needle position (0.0 to 1.0)
    // 0.5 is exactly the target torque
    const pos = stateRef.current.needleAngle;
    const appliedTorque = Math.round(config.targetTorque * (0.65 + pos * 0.7)); // range: 0.65 to 1.35
    const diff = Math.abs(appliedTorque - config.targetTorque);

    let rating: "PERFECT" | "GOOD" | "OVER" | "UNDER" = "GOOD";
    let ptsChange = 0;

    // Tool recoil kick and shake
    stateRef.current.toolState.recoil = 8;
    stateRef.current.toolState.shake = 12;

    if (diff <= config.tolerance) {
      // ★ PERFECT
      rating = "PERFECT";
      stateRef.current.combo++;
      ptsChange = 450 + stateRef.current.combo * 50;
      gameAudio.playCombo(stateRef.current.combo);

      bolt.tightened = true;
      bolt.quality = "PERFECT";
      bolt.torqueValue = appliedTorque;

      // Golden Sparks
      for (let i = 0; i < 22; i++) {
        const ang = Math.random() * Math.PI * 2;
        const spd = 70 + Math.random() * 150;
        stateRef.current.sparks.push({
          x: bolt.x,
          y: bolt.y,
          vx: Math.cos(ang) * spd,
          vy: Math.sin(ang) * spd,
          life: 0.45 + Math.random() * 0.25,
          maxLife: 0.7,
          color: "#facc15",
          size: 3,
        });
      }

      stateRef.current.floatingScores.push({
        x: bolt.x,
        y: bolt.y - 15,
        text: `+${ptsChange}`,
        color: "#22c55e",
        life: 1.0,
        maxLife: 1.0,
      });

      showToast(`★ PERFECT! 규정 토크 정밀 체결 (${appliedTorque} N·m, +${ptsChange}점)`, "perfect");
    } else if (diff <= config.tolerance * 1.85) {
      // ✓ GOOD
      rating = "GOOD";
      stateRef.current.combo++;
      ptsChange = 220 + stateRef.current.combo * 20;
      gameAudio.playWhack(false);

      bolt.tightened = true;
      bolt.quality = "GOOD";
      bolt.torqueValue = appliedTorque;

      for (let i = 0; i < 12; i++) {
        const ang = Math.random() * Math.PI * 2;
        const spd = 50 + Math.random() * 100;
        stateRef.current.sparks.push({
          x: bolt.x,
          y: bolt.y,
          vx: Math.cos(ang) * spd,
          vy: Math.sin(ang) * spd,
          life: 0.35,
          maxLife: 0.35,
          color: "#38bdf8",
          size: 2.5,
        });
      }

      stateRef.current.floatingScores.push({
        x: bolt.x,
        y: bolt.y - 15,
        text: `+${ptsChange}`,
        color: "#38bdf8",
        life: 1.0,
        maxLife: 1.0,
      });

      showToast(`GOOD! 규정 공차 내 체결 완료 (${appliedTorque} N·m, +${ptsChange}점)`, "good");
    } else if (appliedTorque > config.targetTorque) {
      // 🚨 OVER TORQUE (Severe penalty: -250 points!)
      rating = "OVER";
      stateRef.current.combo = 0;
      ptsChange = -250;
      gameAudio.playError();

      bolt.tightened = true;
      bolt.quality = "OVER";
      bolt.torqueValue = appliedTorque;

      // Red/Orange Sparks & Smoke
      for (let i = 0; i < 18; i++) {
        const ang = Math.random() * Math.PI * 2;
        const spd = 60 + Math.random() * 120;
        stateRef.current.sparks.push({
          x: bolt.x,
          y: bolt.y,
          vx: Math.cos(ang) * spd,
          vy: Math.sin(ang) * spd,
          life: 0.5,
          maxLife: 0.5,
          color: "#ef4444",
          size: 3.5,
        });
      }

      stateRef.current.floatingScores.push({
        x: bolt.x,
        y: bolt.y - 15,
        text: "-250점 감점!",
        color: "#ef4444",
        life: 1.2,
        maxLife: 1.2,
      });

      showToast(`🚨 과토크 체결! 볼트 나사선 파손 경고 (-250점 감점)`, "over");
    } else {
      // ⚠️ UNDER TORQUE (Deduction: -150 points! Bolt remains loose/uncompleted)
      rating = "UNDER";
      stateRef.current.combo = 0;
      ptsChange = -150;
      gameAudio.playError();

      bolt.tightened = false; // Remains loose! Must re-tighten
      bolt.quality = "UNDER";
      bolt.torqueValue = appliedTorque;

      for (let i = 0; i < 8; i++) {
        const ang = Math.random() * Math.PI * 2;
        const spd = 30 + Math.random() * 60;
        stateRef.current.sparks.push({
          x: bolt.x,
          y: bolt.y,
          vx: Math.cos(ang) * spd,
          vy: Math.sin(ang) * spd,
          life: 0.3,
          maxLife: 0.3,
          color: "#f97316",
          size: 2.5,
        });
      }

      stateRef.current.floatingScores.push({
        x: bolt.x,
        y: bolt.y - 15,
        text: "-150점 감점!",
        color: "#f97316",
        life: 1.2,
        maxLife: 1.2,
      });

      showToast(`⚠️ 토크 미달! 규정 압력 부족으로 풀림 위험 (-150점 감점 / 재체결 필요)`, "under");
    }

    stateRef.current.score = Math.max(0, stateRef.current.score + ptsChange);
    setScore(stateRef.current.score);
    setCombo(stateRef.current.combo);
    setLastTorque(appliedTorque);
    setLastRating(rating);

    // If successfully tightened or over-tightened, advance to next uncompleted bolt
    if (rating === "PERFECT" || rating === "GOOD" || rating === "OVER") {
      const nextId = findNextUncompletedBoltId();
      if (nextId !== null) {
        selectBolt(nextId);
      }
    }

    // Check Stage Victory Condition: all bolts must be tightened
    const remainingUncompleted = stateRef.current.bolts.filter((b) => !b.tightened);
    if (remainingUncompleted.length === 0) {
      // Stage Cleared!
      const timeBonus = Math.floor(stateRef.current.timeLeft * 40);
      stateRef.current.score += timeBonus;
      setScore(stateRef.current.score);

      if (stateRef.current.stage < 3) {
        stateRef.current.isPlaying = false;
        setGameState("STAGE_CLEAR");
        gameAudio.playVictory();
      } else {
        // Complete Victory!
        stateRef.current.isPlaying = false;
        setGameState("VICTORY");
        gameAudio.playVictory();
        confetti({ particleCount: 120, spread: 85, origin: { y: 0.6 } });
        onFinish(stateRef.current.score);
      }
    }
  };

  // Keyboard shortcut: Spacebar or Enter
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Space" || e.code === "Enter") {
        e.preventDefault();
        handleTighten();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // Canvas Mouse Click & Hover Interaction
  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!stateRef.current.isPlaying) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    const w = stateRef.current.screenW;
    const h = stateRef.current.screenH;
    const boltRadius = Math.max(13, Math.min(w, h) * 0.04);
    const hitRadius = boltRadius * 2.2;

    // Check if user clicked on any bolt
    const clickedBolt = stateRef.current.bolts.find((b) => {
      const dist = Math.hypot(clickX - b.x, clickY - b.y);
      return dist <= hitRadius;
    });

    if (clickedBolt) {
      if (clickedBolt.id === stateRef.current.selectedBoltId) {
        // Clicked the currently selected bolt -> execute torque tightening!
        handleTighten();
      } else {
        // Clicked a different bolt -> select it!
        selectBolt(clickedBolt.id);
      }
    } else {
      // Clicked outside any bolt -> show guidance, DO NOT trigger tighten!
      showToast("체결할 볼트를 직접 클릭하여 전동 공구를 장착하세요!", "info");
    }
  };

  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!stateRef.current.isPlaying) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const w = stateRef.current.screenW;
    const h = stateRef.current.screenH;
    const boltRadius = Math.max(13, Math.min(w, h) * 0.04);
    const hitRadius = boltRadius * 2.2;

    const hoveredBolt = stateRef.current.bolts.find((b) => {
      const dist = Math.hypot(mouseX - b.x, mouseY - b.y);
      return dist <= hitRadius;
    });

    stateRef.current.hoveredBoltId = hoveredBolt ? hoveredBolt.id : null;
  };

  // Main 2D Loop & Resize
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = mountRef.current;
    if (!canvas || !container) return;

    let animId = 0;

    const resize = () => {
      const rect = container.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.max(300, Math.floor(rect.width));
      const h = Math.max(260, Math.floor(rect.height));

      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;

      stateRef.current.screenW = w;
      stateRef.current.screenH = h;
      initStageBolts(stateRef.current.stage, w, h);
    };

    const ro = new ResizeObserver(() => resize());
    ro.observe(container);
    resize();

    const render = (time: number) => {
      const dt = Math.min((time - stateRef.current.lastTime) / 1000, 0.1);
      stateRef.current.lastTime = time;

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      ctx.save();
      ctx.scale(dpr, dpr);

      const w = stateRef.current.screenW;
      const h = stateRef.current.screenH;
      const config = STAGE_CONFIGS[stateRef.current.stage - 1];

      // Update simulation if PLAYING
      if (stateRef.current.isPlaying) {
        stateRef.current.timeLeft -= dt;
        if (stateRef.current.timeLeft <= 0) {
          stateRef.current.isPlaying = false;
          setGameState("GAMEOVER");
          gameAudio.playFailure();
          onFinish(stateRef.current.score);
        }
        setTimeLeft(Math.max(0, Math.ceil(stateRef.current.timeLeft)));

        // Oscillate torque gauge needle
        stateRef.current.needleAngle += stateRef.current.needleDir * config.gaugeSpeed * dt;
        if (stateRef.current.needleAngle >= 1) {
          stateRef.current.needleAngle = 1;
          stateRef.current.needleDir = -1;
        } else if (stateRef.current.needleAngle <= 0) {
          stateRef.current.needleAngle = 0;
          stateRef.current.needleDir = 1;
        }

        // Interpolate Tool Position & Orientation towards target bolt
        const tState = stateRef.current.toolState;
        const lerpFactor = Math.min(1, dt * 14);
        tState.x += (tState.targetX - tState.x) * lerpFactor;
        tState.y += (tState.targetY - tState.y) * lerpFactor;

        let diffAngle = tState.targetAngle - tState.angle;
        while (diffAngle < -Math.PI) diffAngle += Math.PI * 2;
        while (diffAngle > Math.PI) diffAngle -= Math.PI * 2;
        tState.angle += diffAngle * lerpFactor;

        // Dampen recoil & shake
        tState.recoil = Math.max(0, tState.recoil - dt * 25);
        tState.shake = Math.max(0, tState.shake - dt * 30);
      }

      // --- RENDERING ---
      // 1. Dark Steel Blueprint Mechanical Background
      const bgGrad = ctx.createRadialGradient(w / 2, h / 2, 40, w / 2, h / 2, Math.max(w, h) * 0.7);
      bgGrad.addColorStop(0, "#0f172a");
      bgGrad.addColorStop(1, "#020617");
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, w, h);

      // Blueprint grid lines
      ctx.strokeStyle = "rgba(56, 189, 248, 0.07)";
      ctx.lineWidth = 1;
      const gridStep = 32;
      for (let x = 0; x < w; x += gridStep) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
      }
      for (let y = 0; y < h; y += gridStep) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }

      // 2. Heavy Engine Flange / Cylinder Head Rim
      const centerX = w / 2;
      const centerY = h / 2 + 10;
      const flangeRadius = Math.min(w, h) * 0.38;

      // Outer Flange Plate (Steel bevel)
      const flangeGrad = ctx.createRadialGradient(centerX, centerY, flangeRadius * 0.4, centerX, centerY, flangeRadius);
      flangeGrad.addColorStop(0, "#1e293b");
      flangeGrad.addColorStop(0.85, "#334155");
      flangeGrad.addColorStop(1, "#1e293b");
      ctx.fillStyle = flangeGrad;
      ctx.beginPath();
      ctx.arc(centerX, centerY, flangeRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#475569";
      ctx.lineWidth = 4;
      ctx.stroke();

      // Flange Inner Bore
      ctx.fillStyle = "#090d16";
      ctx.beginPath();
      ctx.arc(centerX, centerY, flangeRadius * 0.58, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#64748b";
      ctx.lineWidth = 2.5;
      ctx.stroke();

      // Pitch Circle Diameter (PCD) Guide Line
      ctx.strokeStyle = "rgba(56, 189, 248, 0.3)";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 6]);
      ctx.beginPath();
      ctx.arc(centerX, centerY, Math.min(w, h) * 0.32, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);

      // 3. Render Stud Bolts
      const selectedBoltId = stateRef.current.selectedBoltId;
      const hoveredBoltId = stateRef.current.hoveredBoltId;
      const boltRadius = Math.max(13, Math.min(w, h) * 0.038);

      for (let i = 0; i < stateRef.current.bolts.length; i++) {
        const b = stateRef.current.bolts[i];
        const isSelected = i === selectedBoltId && stateRef.current.isPlaying;
        const isHovered = i === hoveredBoltId && stateRef.current.isPlaying;

        ctx.save();
        ctx.translate(b.x, b.y);

        // Hover Reticle
        if (isHovered && !isSelected) {
          ctx.beginPath();
          ctx.arc(0, 0, boltRadius + 6, 0, Math.PI * 2);
          ctx.strokeStyle = "rgba(56, 189, 248, 0.8)";
          ctx.lineWidth = 2;
          ctx.setLineDash([3, 3]);
          ctx.stroke();
          ctx.setLineDash([]);
        }

        // Selected Bolt Glow & Targeting Pulse
        if (isSelected) {
          const pulse = Math.sin(time * 0.012) * 4;
          ctx.beginPath();
          ctx.arc(0, 0, boltRadius + 9 + pulse, 0, Math.PI * 2);
          ctx.fillStyle = "rgba(250, 204, 21, 0.22)";
          ctx.fill();
          ctx.strokeStyle = "#facc15";
          ctx.lineWidth = 2.5;
          ctx.stroke();

          // Reticle corner ticks
          ctx.strokeStyle = "#fde047";
          ctx.lineWidth = 2;
          const tickR = boltRadius + 14;
          for (let rot = 0; rot < 4; rot++) {
            const rotAng = (rot * Math.PI) / 2 + (time * 0.002);
            ctx.beginPath();
            ctx.arc(0, 0, tickR, rotAng - 0.2, rotAng + 0.2);
            ctx.stroke();
          }
        }

        // Bolt Nut Hexagon
        let nutColor = "#64748b"; // default un-tightened
        if (b.tightened) {
          if (b.quality === "PERFECT") nutColor = "#22c55e";
          else if (b.quality === "GOOD") nutColor = "#38bdf8";
          else if (b.quality === "OVER") nutColor = "#ef4444";
        } else if (b.quality === "UNDER") {
          nutColor = "#f97316"; // under-torqued warning
        } else if (isSelected) {
          nutColor = "#eab308";
        } else if (isHovered) {
          nutColor = "#94a3b8";
        }

        ctx.fillStyle = nutColor;
        ctx.beginPath();
        for (let side = 0; side < 6; side++) {
          const angle = (side / 6) * Math.PI * 2;
          const hx = Math.cos(angle) * boltRadius;
          const hy = Math.sin(angle) * boltRadius;
          if (side === 0) ctx.moveTo(hx, hy);
          else ctx.lineTo(hx, hy);
        }
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = "#0f172a";
        ctx.lineWidth = 2.5;
        ctx.stroke();

        // Inner Stud Thread Hole
        ctx.beginPath();
        ctx.arc(0, 0, boltRadius * 0.42, 0, Math.PI * 2);
        ctx.fillStyle = "#0f172a";
        ctx.fill();

        // Status Badge / Number
        ctx.fillStyle = "#ffffff";
        ctx.font = getGameCanvasFont(10, "black");
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        if (b.tightened) {
          if (b.quality === "PERFECT") {
            ctx.fillText("★", 0, 0);
          } else if (b.quality === "GOOD") {
            ctx.fillText("✓", 0, 0);
          } else if (b.quality === "OVER") {
            ctx.fillText("✕", 0, 0);
          }
        } else if (b.quality === "UNDER") {
          ctx.fillText("!", 0, 0);
        } else {
          ctx.fillText(`${i + 1}`, 0, 0);
        }

        ctx.restore();
      }

      // 4. Center Live Hydraulic Torque Dial Gauge
      const gaugeRadius = Math.min(w, h) * 0.16;
      ctx.save();
      ctx.translate(centerX, centerY);

      // Gauge faceplate
      ctx.fillStyle = "#020617";
      ctx.beginPath();
      ctx.arc(0, 0, gaugeRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#38bdf8";
      ctx.lineWidth = 2.5;
      ctx.stroke();

      // Golden Target Torque Arc (Center sweet spot)
      const arcStart = -Math.PI * 0.75;
      const arcTotal = Math.PI * 1.5;

      // Arc background
      ctx.strokeStyle = "#334155";
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.arc(0, 0, gaugeRadius - 10, arcStart, arcStart + arcTotal);
      ctx.stroke();

      // Green Golden Target Zone (Around 50% position)
      const sweetStart = arcStart + arcTotal * 0.44;
      const sweetEnd = arcStart + arcTotal * 0.56;
      ctx.strokeStyle = "#22c55e";
      ctx.lineWidth = 9;
      ctx.beginPath();
      ctx.arc(0, 0, gaugeRadius - 10, sweetStart, sweetEnd);
      ctx.stroke();

      // Needle position
      const needlePosAngle = arcStart + arcTotal * stateRef.current.needleAngle;
      ctx.strokeStyle = "#facc15";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(needlePosAngle) * (gaugeRadius - 8), Math.sin(needlePosAngle) * (gaugeRadius - 8));
      ctx.stroke();

      // Center pivot
      ctx.fillStyle = "#facc15";
      ctx.beginPath();
      ctx.arc(0, 0, 4, 0, Math.PI * 2);
      ctx.fill();

      // Digital Torque Readout in Center
      const liveEstimatedTorque = Math.round(config.targetTorque * (0.65 + stateRef.current.needleAngle * 0.7));
      const inSweetZone = Math.abs(liveEstimatedTorque - config.targetTorque) <= config.tolerance;

      ctx.fillStyle = inSweetZone ? "#22c55e" : "#38bdf8";
      ctx.font = getGameCanvasFont(11, "bold", true);
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(`${liveEstimatedTorque} N·m`, 0, gaugeRadius * 0.45);

      ctx.restore();

      // 5. RENDER THE INDUSTRIAL ELECTRIC/HYDRAULIC TORQUE TOOL (전동 너트러너 & 반력암)
      const t = stateRef.current.toolState;
      if (stateRef.current.selectedBoltId !== null) {
        ctx.save();
        ctx.translate(t.x, t.y);
        ctx.rotate(t.angle);

        // Apply dynamic tool shake and recoil
        const shakeX = (Math.random() - 0.5) * t.shake * 0.5;
        const shakeY = (Math.random() - 0.5) * t.shake * 0.5;
        ctx.translate(-t.recoil + shakeX, shakeY);

        // A. REACTION ARM (반력암 - Shipyard heavy forged reaction bar resting on flange)
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(0, 10);
        ctx.lineTo(-24, 46);
        ctx.lineTo(-12, 48);
        ctx.lineTo(8, 12);
        ctx.closePath();
        ctx.fillStyle = "#1e293b";
        ctx.fill();
        ctx.strokeStyle = "#334155";
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Reaction arm hazard stripes (black & safety yellow)
        ctx.save();
        ctx.clip();
        for (let stripe = -30; stripe < 50; stripe += 8) {
          ctx.fillStyle = "#eab308";
          ctx.beginPath();
          ctx.moveTo(stripe, 0);
          ctx.lineTo(stripe + 5, 0);
          ctx.lineTo(stripe - 15, 60);
          ctx.lineTo(stripe - 20, 60);
          ctx.closePath();
          ctx.fill();
        }
        ctx.restore();

        // Reaction pad foot resting against flange
        ctx.fillStyle = "#0f172a";
        ctx.fillRect(-26, 44, 18, 8);
        ctx.strokeStyle = "#64748b";
        ctx.lineWidth = 1;
        ctx.strokeRect(-26, 44, 18, 8);
        ctx.restore();

        // B. DRIVE SOCKET (강화 임팩트 소켓 - fits squarely over hex nut)
        const socketGrad = ctx.createLinearGradient(0, -14, 0, 14);
        socketGrad.addColorStop(0, "#94a3b8");
        socketGrad.addColorStop(0.3, "#cbd5e1");
        socketGrad.addColorStop(0.7, "#475569");
        socketGrad.addColorStop(1, "#1e293b");

        ctx.fillStyle = socketGrad;
        ctx.beginPath();
        ctx.roundRect(-14, -14, 28, 28, 4);
        ctx.fill();
        ctx.strokeStyle = "#0f172a";
        ctx.lineWidth = 2;
        ctx.stroke();

        // Socket Knurled grip pattern
        ctx.strokeStyle = "rgba(15, 23, 42, 0.4)";
        ctx.lineWidth = 1;
        for (let kx = -10; kx <= 10; kx += 4) {
          ctx.beginPath();
          ctx.moveTo(kx, -12);
          ctx.lineTo(kx, 12);
          ctx.stroke();
        }

        // Inner Hex broach socket depth
        ctx.fillStyle = "#020617";
        ctx.beginPath();
        for (let side = 0; side < 6; side++) {
          const angle = (side / 6) * Math.PI * 2;
          const hx = Math.cos(angle) * (boltRadius * 0.7);
          const hy = Math.sin(angle) * (boltRadius * 0.7);
          if (side === 0) ctx.moveTo(hx, hy);
          else ctx.lineTo(hx, hy);
        }
        ctx.closePath();
        ctx.fill();

        // C. RIGHT-ANGLE PLANETARY GEARBOX HEAD (고강도 감속기)
        ctx.fillStyle = "#1e293b";
        ctx.beginPath();
        ctx.roundRect(-42, -13, 30, 26, [6, 0, 0, 6]);
        ctx.fill();
        ctx.strokeStyle = "#475569";
        ctx.lineWidth = 2;
        ctx.stroke();

        // Gearbox bevel highlight
        ctx.fillStyle = "#334155";
        ctx.fillRect(-38, -10, 8, 20);

        // D. MAIN MOTOR BODY (전동 모터 하우징 - HD Hyundai Marine Navy/Cyan)
        const motorGrad = ctx.createLinearGradient(0, -15, 0, 15);
        motorGrad.addColorStop(0, "#0284c7");
        motorGrad.addColorStop(0.3, "#0369a1");
        motorGrad.addColorStop(0.7, "#0c4a6e");
        motorGrad.addColorStop(1, "#082f49");

        ctx.fillStyle = motorGrad;
        ctx.beginPath();
        ctx.roundRect(-102, -15, 62, 30, [8, 4, 4, 8]);
        ctx.fill();
        ctx.strokeStyle = "#0284c7";
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Motor cooling fins / vents
        ctx.strokeStyle = "#082f49";
        ctx.lineWidth = 1.5;
        for (let fx = -98; fx <= -78; fx += 4) {
          ctx.beginPath();
          ctx.moveTo(fx, -11);
          ctx.lineTo(fx, 11);
          ctx.stroke();
        }

        // Digital OLED Tool Display
        ctx.fillStyle = "#020617";
        ctx.fillRect(-72, -10, 28, 20);
        ctx.strokeStyle = inSweetZone ? "#22c55e" : "#0284c7";
        ctx.lineWidth = 1;
        ctx.strokeRect(-72, -10, 28, 20);

        ctx.fillStyle = inSweetZone ? "#22c55e" : "#38bdf8";
        ctx.font = getGameCanvasFont(6, "bold", true);
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(`TGT:${config.targetTorque}`, -58, -4);
        ctx.fillText(`${liveEstimatedTorque}`, -58, 4);

        // Tool Status LED indicator
        ctx.beginPath();
        ctx.arc(-42, 0, 3, 0, Math.PI * 2);
        ctx.fillStyle = inSweetZone ? "#22c55e" : "#facc15";
        ctx.fill();

        // E. PISTOL GRIP HANDLE & SAFETY TRIGGER (인체공학 손잡이 및 방아쇠)
        ctx.fillStyle = "#0f172a";
        ctx.beginPath();
        ctx.moveTo(-92, 14);
        ctx.lineTo(-118, 46);
        ctx.lineTo(-104, 52);
        ctx.lineTo(-80, 15);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = "#334155";
        ctx.lineWidth = 2;
        ctx.stroke();

        // Rubber textured grip bands
        ctx.strokeStyle = "#1e293b";
        ctx.lineWidth = 2;
        for (let gy = 24; gy <= 44; gy += 6) {
          ctx.beginPath();
          ctx.moveTo(-102 + (gy - 20) * 0.4, gy);
          ctx.lineTo(-92 + (gy - 20) * 0.4, gy);
          ctx.stroke();
        }

        // Safety trigger switch (Safety Orange)
        ctx.fillStyle = "#ea580c";
        ctx.beginPath();
        ctx.roundRect(-89, 18, 6, 10, 2);
        ctx.fill();

        // F. HEAVY UMBILICAL POWER / HYDRAULIC CORD (고압 유압 호스 / 전원선)
        ctx.strokeStyle = "#1e293b";
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.moveTo(-111, 49);
        ctx.bezierCurveTo(-125, 65, -115, 85, -95, 95);
        ctx.stroke();

        ctx.strokeStyle = "#eab308";
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 6]);
        ctx.beginPath();
        ctx.moveTo(-111, 49);
        ctx.bezierCurveTo(-125, 65, -115, 85, -95, 95);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.restore();
      }

      // 6. Sparks particles
      const nextSparks: Spark[] = [];
      for (const sp of stateRef.current.sparks) {
        sp.x += sp.vx * dt;
        sp.y += sp.vy * dt;
        sp.life -= dt;
        if (sp.life > 0) {
          ctx.beginPath();
          ctx.arc(sp.x, sp.y, sp.size, 0, Math.PI * 2);
          ctx.fillStyle = sp.color;
          ctx.globalAlpha = Math.max(0, sp.life / sp.maxLife);
          ctx.fill();
          ctx.globalAlpha = 1;
          nextSparks.push(sp);
        }
      }
      stateRef.current.sparks = nextSparks;

      // 7. Floating Score Deltas
      const nextFloaters: FloatingScore[] = [];
      for (const fs of stateRef.current.floatingScores) {
        fs.y -= 35 * dt;
        fs.life -= dt;
        if (fs.life > 0) {
          ctx.save();
          ctx.fillStyle = fs.color;
          ctx.font = getGameCanvasFont(14, "black", true);
          ctx.textAlign = "center";
          ctx.globalAlpha = Math.min(1, fs.life / 0.3);
          ctx.shadowColor = "#000000";
          ctx.shadowBlur = 6;
          ctx.fillText(fs.text, fs.x, fs.y);
          ctx.restore();
          nextFloaters.push(fs);
        }
      }
      stateRef.current.floatingScores = nextFloaters;

      ctx.restore(); // Restore DPR

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animId);
      ro.disconnect();
    };
  }, []);

  const config = STAGE_CONFIGS[stage - 1];
  const tightenedCount = stateRef.current.bolts.filter((b) => b.tightened).length;

  return (
    <div className="relative w-full h-full flex flex-col bg-slate-950 font-hd select-none overflow-hidden text-white">
      {/* Top Header HUD */}
      <div className="flex items-center justify-between px-3 py-2 bg-slate-900/95 border-b border-slate-800 shrink-0 z-10 backdrop-blur-md">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-sky-500/20 text-sky-400 rounded-lg border border-sky-500/30">
            <Wrench className="w-4 h-4" />
          </div>
          <div>
            <div className="text-xs font-black text-slate-100 flex items-center gap-1.5">
              엔진·축계 유압 볼팅 마스터
              <span className="text-[10px] px-1.5 py-0.2 bg-sky-500/20 text-sky-300 rounded font-bold">
                STAGE {stage}/3
              </span>
            </div>
            <div className="text-[10px] text-slate-400 hidden sm:block">
              {config.name} · {config.spec}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-4">
          {/* Selected Bolt Badge */}
          <div className="hidden sm:flex items-center gap-1 bg-slate-800/80 px-2 py-1 rounded-md border border-slate-700">
            <span className="text-[10px] text-slate-400 font-bold">선택:</span>
            <span className="text-xs font-black text-amber-400 font-mono">
              {selectedBoltId !== null ? `볼트 #${selectedBoltId + 1}` : "미선택"}
            </span>
          </div>

          {/* Bolting Progress */}
          <div className="flex items-center gap-1 bg-slate-800/80 px-2 py-1 rounded-md border border-slate-700">
            <span className="text-[10px] text-slate-400 font-bold">진행:</span>
            <span className="text-xs font-black text-cyan-300 font-mono">
              {tightenedCount}/{config.boltCount}
            </span>
          </div>

          {/* Time Left */}
          <div className="flex items-center gap-1 bg-slate-800/80 px-2 py-1 rounded-md border border-slate-700">
            <span className="text-[10px] text-slate-400 font-bold">제한:</span>
            <span className={`text-xs font-black tabular-nums ${timeLeft <= 5 ? "text-rose-400 animate-pulse" : "text-emerald-300"}`}>
              {timeLeft}s
            </span>
          </div>

          {/* Combo */}
          {combo > 1 && (
            <div className="hidden sm:flex items-center gap-1 bg-amber-500/20 px-2 py-1 rounded-md border border-amber-500/30 text-amber-300 text-xs font-black animate-pulse">
              <Zap className="w-3 h-3 fill-amber-300" />
              {combo} COMBO
            </div>
          )}

          {/* Score */}
          <div className="flex items-center gap-1.5 bg-sky-950/80 px-2.5 py-1 rounded-md border border-sky-700">
            <Award className="w-3.5 h-3.5 text-amber-400" />
            <span className="text-xs sm:text-sm font-black text-amber-300 tabular-nums">
              {score.toLocaleString()}점
            </span>
          </div>

          {/* Mute */}
          <button
            onClick={toggleSound}
            className="p-1 text-slate-400 hover:text-white transition-colors"
          >
            {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Main Canvas Viewport with direct bolt click targeting */}
      <div
        ref={mountRef}
        className="relative flex-1 w-full min-h-0 overflow-hidden bg-slate-900 cursor-default"
      >
        <canvas
          ref={canvasRef}
          onClick={handleCanvasClick}
          onMouseMove={handleCanvasMouseMove}
          className="absolute inset-0 block w-full h-full cursor-crosshair"
        />

        {/* Real-time Dynamic Status/Notice Banner */}
        {noticeMessage && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 pointer-events-none z-20 animate-in zoom-in-75 fade-in duration-150">
            <div
              className={`px-3 py-1 rounded-full text-xs font-black shadow-xl border backdrop-blur-md flex items-center gap-1.5 ${
                noticeMessage.type === "perfect"
                  ? "bg-emerald-500/30 text-emerald-300 border-emerald-400"
                  : noticeMessage.type === "good"
                  ? "bg-sky-500/30 text-sky-300 border-sky-400"
                  : noticeMessage.type === "under"
                  ? "bg-amber-500/30 text-amber-300 border-amber-400"
                  : noticeMessage.type === "over"
                  ? "bg-rose-500/30 text-rose-300 border-rose-400"
                  : "bg-slate-800/80 text-slate-200 border-slate-700"
              }`}
            >
              {noticeMessage.type === "perfect" ? (
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              ) : noticeMessage.type === "under" || noticeMessage.type === "over" ? (
                <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
              ) : (
                <Wrench className="w-3.5 h-3.5 text-sky-400" />
              )}
              {noticeMessage.text}
            </div>
          </div>
        )}

        {/* READY Overlay */}
        {gameState === "READY" && (
          <div
            onClick={(e) => e.stopPropagation()}
            className="absolute inset-0 bg-slate-950/85 backdrop-blur-sm flex flex-col items-center justify-center p-4 text-center z-20"
          >
            <div className="w-14 h-14 rounded-2xl bg-sky-500/20 border border-sky-500/30 flex items-center justify-center mb-3 text-sky-400 shadow-lg">
              <Wrench className="w-8 h-8" />
            </div>
            <h3 className="text-lg sm:text-xl font-black text-white mb-2">
              초대형 엔진 & 축계 유압 볼팅 마스터
            </h3>
            <p className="text-xs sm:text-sm text-slate-300 max-w-md mb-4 leading-relaxed">
              선박 메인 엔진과 추진축 플랜지의 거대 볼트를 전동 너트러너로 정밀 체결하세요!
              <br />
              <strong>1. 체결할 볼트를 직접 클릭하여 전동 공구를 장착합니다.</strong>
              <br />
              <strong>2. 게이지 바늘이 녹색 골든 토크 존에 올 때 체결하세요!</strong>
              <br />
              <span className="text-amber-400 font-bold">⚠️ 주의: 토크 미달(-150점) 및 과토크(-250점) 시 감점됩니다!</span>
            </p>

            <div className="flex flex-wrap items-center justify-center gap-3 text-xs text-slate-400 mb-6 bg-slate-900/90 px-4 py-2.5 rounded-xl border border-slate-800">
              <div className="flex items-center gap-1.5">
                <span className="px-2 py-0.5 bg-slate-800 rounded font-mono font-bold text-sky-300">
                  볼트 직접 클릭
                </span>
                <span>공구 장착</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="px-2 py-0.5 bg-slate-800 rounded font-mono font-bold text-emerald-300">
                  녹색 구간 [Space / 체결]
                </span>
                <span>정밀 체결 (+450)</span>
              </div>
            </div>

            <button
              onClick={startGame}
              className="px-6 py-2.5 bg-sky-600 hover:bg-sky-500 active:scale-95 text-white font-black text-sm rounded-xl shadow-lg shadow-sky-600/30 transition-all flex items-center gap-2 cursor-pointer"
            >
              <Play className="w-4 h-4 fill-white" />
              유압 렌치 시운전 시작
            </button>
          </div>
        )}

        {/* STAGE CLEAR Overlay */}
        {gameState === "STAGE_CLEAR" && (
          <div
            onClick={(e) => e.stopPropagation()}
            className="absolute inset-0 bg-slate-950/85 backdrop-blur-md flex flex-col items-center justify-center p-4 text-center z-20 animate-in fade-in zoom-in-95"
          >
            <div className="w-12 h-12 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center mb-2 text-emerald-400">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <span className="text-[10px] font-bold text-emerald-400 tracking-widest uppercase mb-1">STAGE PASSED</span>
            <h3 className="text-base sm:text-lg font-black text-white mb-1">
              STAGE {stage} 체결 공정 합격!
            </h3>
            <p className="text-xs text-slate-300 mb-4">
              누적 점수: <span className="font-bold text-amber-300">{score.toLocaleString()}점</span> |
              다음 고장력 볼팅 파트로 넘어갑니다.
            </p>

            <button
              onClick={() => startStage(stage + 1)}
              className="px-6 py-2 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-slate-950 font-black text-xs sm:text-sm rounded-xl shadow-md active:scale-95 transition-all cursor-pointer"
            >
              다음 스테이지 ({stage + 1}/3) 진행 →
            </button>
          </div>
        )}

        {/* VICTORY Overlay */}
        {gameState === "VICTORY" && (
          <div
            onClick={(e) => e.stopPropagation()}
            className="absolute inset-0 bg-slate-950/90 backdrop-blur-md flex flex-col items-center justify-center p-4 text-center z-20 animate-in fade-in zoom-in-95"
          >
            <div className="w-14 h-14 rounded-2xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center mb-2 text-amber-400">
              <Award className="w-8 h-8" />
            </div>
            <h3 className="text-lg sm:text-xl font-black text-white mb-1">
              선박 엔진·축계 볼팅 전 공정 완수!
            </h3>
            <div className="text-2xl sm:text-3xl font-black text-amber-300 mb-2">
              최종 점수: {score.toLocaleString()}점
            </div>
            <p className="text-xs text-slate-300 max-w-sm mb-5">
              선급협회(KR/DNV) 규정 토크 100% 충족 완료! 월간 명예의 전당에 최고 기록이 등록되었습니다.
            </p>

            <button
              onClick={startGame}
              className="px-6 py-2.5 bg-sky-600 hover:bg-sky-500 active:scale-95 text-white font-black text-sm rounded-xl shadow-lg shadow-sky-600/30 transition-all flex items-center gap-2 cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
              다시 도전하기
            </button>
          </div>
        )}

        {/* GAMEOVER Overlay */}
        {gameState === "GAMEOVER" && (
          <div
            onClick={(e) => e.stopPropagation()}
            className="absolute inset-0 bg-slate-950/90 backdrop-blur-md flex flex-col items-center justify-center p-4 text-center z-20 animate-in fade-in zoom-in-95"
          >
            <div className="w-12 h-12 rounded-xl bg-rose-500/20 border border-rose-500/30 flex items-center justify-center mb-2 text-rose-400">
              <AlertCircle className="w-6 h-6" />
            </div>
            <h3 className="text-base sm:text-lg font-black text-white mb-1">
              공정 제한시간 초과
            </h3>
            <div className="text-xl sm:text-2xl font-black text-amber-300 mb-2">
              기록 점수: {score.toLocaleString()}점
            </div>
            <p className="text-xs text-slate-300 max-w-sm mb-4">
              규정 시간 내에 모든 볼트를 체결하지 못했습니다. 중앙 게이지 바늘이 녹색 존에 왔을 때 신중하게 체결하세요!
            </p>

            <button
              onClick={startGame}
              className="px-6 py-2.5 bg-sky-600 hover:bg-sky-500 active:scale-95 text-white font-black text-sm rounded-xl shadow-lg shadow-sky-600/30 transition-all flex items-center gap-2 cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
              재도전하기
            </button>
          </div>
        )}
      </div>

      {/* Action Footer: Guide and Torque Trigger */}
      <div className="flex items-center justify-between px-3 py-2 bg-slate-900 border-t border-slate-800 shrink-0 z-10 gap-2">
        <div className="text-[11px] text-slate-400 hidden sm:flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
          <span>
            {selectedBoltId !== null
              ? `볼트 #${selectedBoltId + 1} 장착됨 · 게이지 바늘이 녹색 존에 올 때 체결하세요! (미달/초과 시 감점)`
              : `원하는 볼트를 직접 클릭하여 전동 공구를 장착하세요.`}
          </span>
        </div>

        <button
          onClick={handleTighten}
          disabled={!stateRef.current.isPlaying}
          className="w-full sm:w-auto px-6 h-10 bg-sky-600 hover:bg-sky-500 active:bg-sky-700 disabled:opacity-40 disabled:pointer-events-none text-white font-black text-xs rounded-lg flex items-center justify-center gap-2 shadow-md active:scale-95 transition-transform ml-auto cursor-pointer"
        >
          <Wrench className="w-4 h-4" />
          <span>
            {selectedBoltId !== null
              ? `볼트 #${selectedBoltId + 1} 토크 체결 [Space]`
              : "전동 토크 체결 [Space]"}
          </span>
        </button>
      </div>
    </div>
  );
}
