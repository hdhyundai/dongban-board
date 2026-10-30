import React, { useEffect, useRef, useState } from "react";
import { Play, RotateCcw, Volume2, VolumeX, Wrench, Award, Zap, ShieldCheck, AlertCircle } from "lucide-react";
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
  color: string;
}

const STAGE_CONFIGS = [
  {
    stage: 1,
    name: "선박용 대형 디젤 엔진 실린더 헤드",
    spec: "M48 스터드 볼트 (목표 1,200 N·m)",
    targetTorque: 1200,
    tolerance: 90,
    boltCount: 8,
    gaugeSpeed: 1.35, // comfortable rhythmic pendulum swing
    timeLimit: 22,
  },
  {
    stage: 2,
    name: "초대형 프로펠러 중간축 커플링",
    spec: "M56 고장력 볼트 (목표 1,500 N·m)",
    targetTorque: 1500,
    tolerance: 80,
    boltCount: 10,
    gaugeSpeed: 1.65,
    timeLimit: 24,
  },
  {
    stage: 3,
    name: "LNG선 극저온 초고압 매니폴드",
    spec: "M64 인코넬 특수 볼트 (목표 1,800 N·m)",
    targetTorque: 1800,
    tolerance: 70,
    boltCount: 12,
    gaugeSpeed: 1.95,
    timeLimit: 26,
  },
];

export default function HydraulicBoltingGame({ onFinish }: HydraulicBoltingGameProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [gameState, setGameState] = useState<"READY" | "PLAYING" | "STAGE_CLEAR" | "GAMEOVER" | "VICTORY">("READY");
  const [stage, setStage] = useState(1);
  const [score, setScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(14);
  const [combo, setCombo] = useState(0);
  const [lastTorque, setLastTorque] = useState<number | null>(null);
  const [lastRating, setLastRating] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(gameAudio.getMuted());

  const stateRef = useRef({
    isPlaying: false,
    score: 0,
    stage: 1,
    timeLeft: 14,
    combo: 0,
    currentBoltIdx: 0,
    bolts: [] as Bolt[],
    needleAngle: 0, // 0 to 1 back and forth
    needleDir: 1,
    sparks: [] as Spark[],
    screenW: 600,
    screenH: 450,
    lastTime: performance.now(),
  });

  const toggleSound = (e: React.MouseEvent) => {
    e.stopPropagation();
    const muted = gameAudio.toggleMute();
    setIsMuted(muted);
  };

  const initStageBolts = (stgNum: number, w: number, h: number) => {
    const config = STAGE_CONFIGS[stgNum - 1];
    const centerX = w / 2;
    const centerY = h / 2 + 10;
    const radius = Math.min(w, h) * 0.32;
    const count = config.boltCount;

    // Cross/Star bolt tightening sequence pattern
    const orderIndices: number[] = [];
    // Star sequence: 0, count/2, 1, count/2+1, etc.
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
    stateRef.current.currentBoltIdx = 0;
  };

  const startStage = (stgNum: number) => {
    const config = STAGE_CONFIGS[stgNum - 1];
    stateRef.current.stage = stgNum;
    stateRef.current.timeLeft = config.timeLimit;
    stateRef.current.needleAngle = 0;
    stateRef.current.needleDir = 1;
    stateRef.current.lastTime = performance.now();

    initStageBolts(stgNum, stateRef.current.screenW, stateRef.current.screenH);

    setStage(stgNum);
    setTimeLeft(config.timeLimit);
    setLastTorque(null);
    setLastRating(null);
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

  // User Action: Tighten Bolt at current gauge position
  const handleTighten = () => {
    if (!stateRef.current.isPlaying) return;
    const curIdx = stateRef.current.currentBoltIdx;
    if (curIdx >= stateRef.current.bolts.length) return;

    const config = STAGE_CONFIGS[stateRef.current.stage - 1];
    const bolt = stateRef.current.bolts[curIdx];

    // Calculate applied torque based on needle position (0.0 to 1.0)
    // 0.5 is exactly the target torque
    const pos = stateRef.current.needleAngle;
    const appliedTorque = Math.round(config.targetTorque * (0.65 + pos * 0.7)); // range: 0.65 to 1.35 of target
    const diff = Math.abs(appliedTorque - config.targetTorque);

    let rating: "PERFECT" | "GOOD" | "OVER" | "UNDER" = "GOOD";
    let pts = 0;

    if (diff <= config.tolerance) {
      rating = "PERFECT";
      stateRef.current.combo++;
      pts = 350 + stateRef.current.combo * 50;
      gameAudio.playCombo(stateRef.current.combo);

      // Create spark burst
      for (let i = 0; i < 20; i++) {
        const ang = Math.random() * Math.PI * 2;
        const spd = 60 + Math.random() * 140;
        stateRef.current.sparks.push({
          x: bolt.x,
          y: bolt.y,
          vx: Math.cos(ang) * spd,
          vy: Math.sin(ang) * spd,
          life: 0.4 + Math.random() * 0.3,
          color: "#facc15",
        });
      }
    } else if (diff <= config.tolerance * 2.2) {
      rating = "GOOD";
      pts = 180;
      gameAudio.playWhack(false);

      for (let i = 0; i < 8; i++) {
        const ang = Math.random() * Math.PI * 2;
        const spd = 40 + Math.random() * 80;
        stateRef.current.sparks.push({
          x: bolt.x,
          y: bolt.y,
          vx: Math.cos(ang) * spd,
          vy: Math.sin(ang) * spd,
          life: 0.25,
          color: "#38bdf8",
        });
      }
    } else if (appliedTorque > config.targetTorque) {
      rating = "OVER";
      stateRef.current.combo = 0;
      pts = 40;
      gameAudio.playError();
    } else {
      rating = "UNDER";
      stateRef.current.combo = 0;
      pts = 30;
      gameAudio.playError();
    }

    bolt.tightened = true;
    bolt.quality = rating;
    bolt.torqueValue = appliedTorque;

    stateRef.current.score += pts;
    setScore(stateRef.current.score);
    setCombo(stateRef.current.combo);
    setLastTorque(appliedTorque);
    setLastRating(rating);

    // Next bolt
    stateRef.current.currentBoltIdx++;
    if (stateRef.current.currentBoltIdx >= stateRef.current.bolts.length) {
      // Stage cleared!
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
        confetti({ particleCount: 100, spread: 80, origin: { y: 0.6 } });
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
      }

      // --- RENDERING ---
      // 1. Dark Steel Blueprint Mechanical Background
      const bgGrad = ctx.createRadialGradient(w / 2, h / 2, 40, w / 2, h / 2, Math.max(w, h) * 0.7);
      bgGrad.addColorStop(0, "#0f172a");
      bgGrad.addColorStop(1, "#020617");
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, w, h);

      // Blueprint grid lines
      ctx.strokeStyle = "rgba(56, 189, 248, 0.08)";
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

      // Outer Flange Plate
      ctx.fillStyle = "#1e293b";
      ctx.beginPath();
      ctx.arc(centerX, centerY, flangeRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#334155";
      ctx.lineWidth = 4;
      ctx.stroke();

      // Flange Inner Bore
      ctx.fillStyle = "#090d16";
      ctx.beginPath();
      ctx.arc(centerX, centerY, flangeRadius * 0.58, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#475569";
      ctx.lineWidth = 2;
      ctx.stroke();

      // Pitch Circle Diameter (PCD) Guide Line
      ctx.strokeStyle = "rgba(56, 189, 248, 0.25)";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 6]);
      ctx.beginPath();
      ctx.arc(centerX, centerY, Math.min(w, h) * 0.32, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);

      // 3. Render Stud Bolts
      const curBoltIdx = stateRef.current.currentBoltIdx;
      for (let i = 0; i < stateRef.current.bolts.length; i++) {
        const b = stateRef.current.bolts[i];
        const isCurrent = i === curBoltIdx && stateRef.current.isPlaying;
        const boltRadius = Math.max(12, Math.min(w, h) * 0.038);

        ctx.save();
        ctx.translate(b.x, b.y);

        // Current target bolt glow & pulse
        if (isCurrent) {
          const pulse = Math.sin(time * 0.01) * 4;
          ctx.beginPath();
          ctx.arc(0, 0, boltRadius + 9 + pulse, 0, Math.PI * 2);
          ctx.fillStyle = "rgba(250, 204, 21, 0.25)";
          ctx.fill();
          ctx.strokeStyle = "#facc15";
          ctx.lineWidth = 2.5;
          ctx.stroke();
        }

        // Bolt Nut Hexagon
        ctx.fillStyle = b.tightened
          ? b.quality === "PERFECT"
            ? "#22c55e"
            : b.quality === "GOOD"
            ? "#38bdf8"
            : "#f43f5e"
          : isCurrent
          ? "#eab308"
          : "#64748b";

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
        ctx.lineWidth = 2;
        ctx.stroke();

        // Inner Stud Thread Hole
        ctx.beginPath();
        ctx.arc(0, 0, boltRadius * 0.45, 0, Math.PI * 2);
        ctx.fillStyle = "#0f172a";
        ctx.fill();

        // Sequence number badge
        ctx.fillStyle = "#ffffff";
        ctx.font = getGameCanvasFont(9, "black");
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(`${i + 1}`, 0, 0);

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
      ctx.fillStyle = "#38bdf8";
      ctx.font = getGameCanvasFont(11, "bold", true);
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const liveEstimatedTorque = Math.round(config.targetTorque * (0.65 + stateRef.current.needleAngle * 0.7));
      ctx.fillText(`${liveEstimatedTorque} N·m`, 0, gaugeRadius * 0.45);

      ctx.restore();

      // 5. Sparks particles
      const nextSparks: Spark[] = [];
      for (const sp of stateRef.current.sparks) {
        sp.x += sp.vx * dt;
        sp.y += sp.vy * dt;
        sp.life -= dt;
        if (sp.life > 0) {
          ctx.beginPath();
          ctx.arc(sp.x, sp.y, 2.5, 0, Math.PI * 2);
          ctx.fillStyle = sp.color;
          ctx.fill();
          nextSparks.push(sp);
        }
      }
      stateRef.current.sparks = nextSparks;

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
          {/* Bolting Progress */}
          <div className="flex items-center gap-1 bg-slate-800/80 px-2 py-1 rounded-md border border-slate-700">
            <span className="text-[10px] text-slate-400 font-bold">진행:</span>
            <span className="text-xs font-black text-cyan-300 font-mono">
              {stateRef.current.currentBoltIdx}/{config.boltCount}
            </span>
          </div>

          {/* Time Left */}
          <div className="flex items-center gap-1 bg-slate-800/80 px-2 py-1 rounded-md border border-slate-700">
            <span className="text-[10px] text-slate-400 font-bold">제한:</span>
            <span className={`text-xs font-black tabular-nums ${timeLeft <= 4 ? "text-rose-400 animate-pulse" : "text-emerald-300"}`}>
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

      {/* Main Canvas Viewport (100% Flex, responsive fit) */}
      <div
        ref={mountRef}
        onClick={handleTighten}
        className="relative flex-1 w-full min-h-0 overflow-hidden bg-slate-900 cursor-pointer"
      >
        <canvas ref={canvasRef} className="absolute inset-0 block w-full h-full" />

        {/* Real-time Hit Rating Feedback Badge */}
        {lastRating && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 pointer-events-none z-20 animate-in zoom-in-75 fade-in duration-150">
            <div
              className={`px-3 py-1 rounded-full text-xs font-black shadow-lg border ${
                lastRating === "PERFECT"
                  ? "bg-emerald-500/30 text-emerald-300 border-emerald-400"
                  : lastRating === "GOOD"
                  ? "bg-sky-500/30 text-sky-300 border-sky-400"
                  : "bg-rose-500/30 text-rose-300 border-rose-400"
              }`}
            >
              {lastRating === "PERFECT"
                ? `★ PERFECT CLAMP (${lastTorque} N·m) ★`
                : lastRating === "GOOD"
                ? `GOOD TORQUE (${lastTorque} N·m)`
                : lastRating === "OVER"
                ? `과토크 경고 (${lastTorque} N·m)`
                : `체결력 부족 (${lastTorque} N·m)`}
            </div>
          </div>
        )}

        {/* READY Overlay */}
        {gameState === "READY" && (
          <div
            onClick={(e) => e.stopPropagation()}
            className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm flex flex-col items-center justify-center p-4 text-center z-20"
          >
            <div className="w-14 h-14 rounded-2xl bg-sky-500/20 border border-sky-500/30 flex items-center justify-center mb-3 text-sky-400 shadow-lg">
              <Wrench className="w-8 h-8" />
            </div>
            <h3 className="text-lg sm:text-xl font-black text-white mb-2">
              초대형 엔진 & 축계 유압 볼팅 마스터
            </h3>
            <p className="text-xs sm:text-sm text-slate-300 max-w-md mb-4 leading-relaxed">
              선박 메인 엔진과 추진축 플랜지의 거대 스터드 볼트를 유압 토크 렌치로 정밀 체결하세요!
              중앙 게이지 바늘이 <strong>녹색 골든 토크 존</strong>에 도달할 때 화면을 클릭하거나
              [Spacebar]를 눌러 완벽한 조임력을 완성하세요.
            </p>

            <div className="flex flex-wrap items-center justify-center gap-3 text-xs text-slate-400 mb-6 bg-slate-900/90 px-4 py-2.5 rounded-xl border border-slate-800">
              <div className="flex items-center gap-1">
                <span className="px-2 py-0.5 bg-slate-800 rounded font-mono font-bold text-sky-300">
                  클릭 / 터치 / [Spacebar]
                </span>
                <span>골든 존 순간 체결</span>
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
              규정 시간 내에 모든 볼트를 체결하지 못했습니다. 중앙 게이지 바늘 타이밍에 맞춰 빠르게 클릭하세요.
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

      {/* Quick Action Footer Button */}
      <div className="flex items-center justify-between px-3 py-2 bg-slate-900 border-t border-slate-800 shrink-0 z-10 gap-2">
        <div className="text-[11px] text-slate-400 hidden sm:block">
          팁: 노란색으로 강조된 볼트 순서대로, 게이지 바늘이 녹색 구간에 올 때 [Spacebar]나 화면을 클릭하세요!
        </div>

        <button
          onClick={handleTighten}
          disabled={!stateRef.current.isPlaying}
          className="w-full sm:w-auto px-6 h-10 bg-sky-600 hover:bg-sky-500 active:bg-sky-700 disabled:opacity-40 disabled:pointer-events-none text-white font-black text-xs rounded-lg flex items-center justify-center gap-1.5 shadow-md active:scale-95 transition-transform ml-auto cursor-pointer"
        >
          <Wrench className="w-4 h-4" />
          유압 토크 체결 [Space]
        </button>
      </div>
    </div>
  );
}
