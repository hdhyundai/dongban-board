import React, { useState, useEffect, useRef } from "react";
import { Play, RotateCcw, Volume2, VolumeX, Brush, Sparkles, Award, AlertCircle, CheckCircle2, Clock, Gauge } from "lucide-react";
import confetti from "canvas-confetti";
import { gameAudio } from "../../lib/gameSounds";

interface PaintBlasterGameProps {
  onFinish: (score: number) => void;
}

interface SprayParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  alpha: number;
  color: string;
}

export default function PaintBlasterGame({ onFinish }: PaintBlasterGameProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [stage, setStage] = useState(1);
  const [score, setScore] = useState(0);
  const [coverage, setCoverage] = useState(0); // 0 to 100%
  const [paintSagging, setPaintSagging] = useState(0); // defect penalty
  const [timeLeft, setTimeLeft] = useState(35); // seconds per stage
  const [nozzleMode, setNozzleMode] = useState<"wide" | "focus">("wide");
  const [gameOver, setGameOver] = useState(false);
  const [stageCleared, setStageCleared] = useState(false);
  const [isMuted, setIsMuted] = useState(gameAudio.getMuted());

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const isSprayingRef = useRef(false);
  const mousePosRef = useRef({ x: 0, y: 0 });
  const gridCoverageRef = useRef<Uint8Array | null>(null);
  const gridColsRef = useRef(54);
  const gridRowsRef = useRef(34);
  const particlesRef = useRef<SprayParticle[]>([]);
  const dwellTimeRef = useRef<{ x: number; y: number; time: number }>({ x: 0, y: 0, time: 0 });
  const lastSoundTimeRef = useRef(0);
  const scoreRef = useRef(0);
  const saggingRef = useRef(0);
  const timeLeftRef = useRef(35);

  const toggleSound = () => {
    const muted = gameAudio.toggleMute();
    setIsMuted(muted);
  };

  const initGrid = () => {
    const totalCells = gridColsRef.current * gridRowsRef.current;
    gridCoverageRef.current = new Uint8Array(totalCells);
    setCoverage(0);
    setPaintSagging(0);
    saggingRef.current = 0;
    timeLeftRef.current = 35;
    setTimeLeft(35);
  };

  const startGame = () => {
    gameAudio.playClick();
    setIsPlaying(true);
    setGameOver(false);
    setStageCleared(false);
    setStage(1);
    setScore(0);
    scoreRef.current = 0;
    initGrid();
  };

  const nextStage = () => {
    gameAudio.playClick();
    setStageCleared(false);
    setStage((prev) => prev + 1);
    initGrid();
  };

  // Timer countdown
  useEffect(() => {
    if (!isPlaying || gameOver || stageCleared) return;
    const interval = setInterval(() => {
      timeLeftRef.current -= 1;
      setTimeLeft(timeLeftRef.current);
      if (timeLeftRef.current <= 0) {
        clearInterval(interval);
        // Time expired failure
        gameAudio.playDrop();
        setGameOver(true);
        setIsPlaying(false);
        onFinish(scoreRef.current);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [isPlaying, gameOver, stageCleared]);

  // Main Canvas Render
  useEffect(() => {
    if (!isPlaying) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * window.devicePixelRatio;
    canvas.height = rect.height * window.devicePixelRatio;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    const w = rect.width;
    const h = rect.height;

    if (!gridCoverageRef.current) {
      initGrid();
    }

    let animId: number;
    let lastTime = performance.now();

    const loop = (now: number) => {
      const dt = Math.min((now - lastTime) / 1000, 0.08);
      lastTime = now;

      // Handle active paint spray
      if (isSprayingRef.current && !stageCleared && !gameOver) {
        const m = mousePosRef.current;

        // Check dwell time in one spot (paint sagging/running defect)
        const dMove = Math.hypot(m.x - dwellTimeRef.current.x, m.y - dwellTimeRef.current.y);
        if (dMove < 18) {
          dwellTimeRef.current.time += dt;
          if (dwellTimeRef.current.time > 0.6) {
            saggingRef.current += Math.round(dt * 25);
            setPaintSagging(saggingRef.current);
            // Deduct points for sloppy sagging
            scoreRef.current = Math.max(0, scoreRef.current - Math.round(dt * 30));
          }
        } else {
          dwellTimeRef.current = { x: m.x, y: m.y, time: 0 };
        }

        // Trigger spray sound throttled
        if (now - lastSoundTimeRef.current > 75) {
          gameAudio.playPaintSpray();
          lastSoundTimeRef.current = now;
        }

        const isWide = nozzleMode === "wide";
        const sprayRadius = isWide ? 38 : 22;
        const sprayDensity = isWide ? 14 : 26;

        // Spray mist particles from high-pressure airless tip
        for (let k = 0; k < 8; k++) {
          const ang = Math.random() * Math.PI * 2;
          const dist = Math.random() * sprayRadius;
          particlesRef.current.push({
            x: m.x + Math.cos(ang) * dist,
            y: m.y + Math.sin(ang) * dist,
            vx: (Math.random() - 0.5) * 60,
            vy: (Math.random() - 0.5) * 60 + 20,
            radius: 2 + Math.random() * 3,
            alpha: 0.9,
            color: stage === 1 ? "#dc2626" : stage === 2 ? "#0284c7" : "#059669",
          });
        }

        // Apply paint to coverage grid
        const grid = gridCoverageRef.current;
        if (grid) {
          const cols = gridColsRef.current;
          const rows = gridRowsRef.current;
          const cellW = w / cols;
          const cellH = h / rows;

          const minCol = Math.max(0, Math.floor((m.x - sprayRadius) / cellW));
          const maxCol = Math.min(cols - 1, Math.floor((m.x + sprayRadius) / cellW));
          const minRow = Math.max(0, Math.floor((m.y - sprayRadius) / cellH));
          const maxRow = Math.min(rows - 1, Math.floor((m.y + sprayRadius) / cellH));

          let newlyCovered = 0;
          for (let r = minRow; r <= maxRow; r++) {
            for (let c = minCol; c <= maxCol; c++) {
              const cx = (c + 0.5) * cellW;
              const cy = (r + 0.5) * cellH;
              if (Math.hypot(m.x - cx, m.y - cy) <= sprayRadius) {
                const idx = r * cols + c;
                const oldVal = grid[idx];
                const newVal = Math.min(100, oldVal + sprayDensity);
                if (oldVal < 80 && newVal >= 80) {
                  newlyCovered++;
                }
                grid[idx] = newVal;
              }
            }
          }

          if (newlyCovered > 0) {
            scoreRef.current += newlyCovered * 14;
            setScore(scoreRef.current);

            // Compute total coverage %
            let coveredCount = 0;
            for (let i = 0; i < grid.length; i++) {
              if (grid[i] >= 80) coveredCount++;
            }
            const pct = Math.round((coveredCount / grid.length) * 100);
            setCoverage(pct);

            // Stage complete at 94% coverage!
            if (pct >= 94) {
              gameAudio.playVictory();
              const stageBonus = 1500 + timeLeftRef.current * 30 - saggingRef.current * 6;
              scoreRef.current += Math.max(500, stageBonus);
              setScore(scoreRef.current);

              if (stage >= 3) {
                setGameOver(true);
                setIsPlaying(false);
                onFinish(scoreRef.current);
                confetti({
                  particleCount: 80,
                  spread: 70,
                  origin: { y: 0.6 },
                  colors: ["#DC2626", "#0284C7", "#059669", "#FFFFFF"],
                });
              } else {
                setStageCleared(true);
              }
            }
          }
        }
      }

      // Update particles
      for (let i = particlesRef.current.length - 1; i >= 0; i--) {
        const p = particlesRef.current[i];
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.alpha -= dt * 2.2;
        if (p.alpha <= 0) {
          particlesRef.current.splice(i, 1);
        }
      }

      // ---------------- RENDER ----------------
      ctx.clearRect(0, 0, w, h);

      // Base: Primed Shot-blasted Steel Plate
      ctx.fillStyle = "#334155";
      ctx.fillRect(0, 0, w, h);

      // Plate weld seams & butt-joints
      ctx.strokeStyle = "#1e293b";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(w / 3, 0);
      ctx.lineTo(w / 3, h);
      ctx.moveTo((w * 2) / 3, 0);
      ctx.lineTo((w * 2) / 3, h);
      ctx.moveTo(0, h / 2);
      ctx.lineTo(w, h / 2);
      ctx.stroke();

      // Mill scale & rust patches (areas requiring full paint protection)
      ctx.fillStyle = "rgba(180, 83, 9, 0.35)";
      ctx.beginPath();
      ctx.ellipse(w * 0.28, h * 0.35, 50, 30, 0.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(w * 0.72, h * 0.68, 60, 35, -0.3, 0, Math.PI * 2);
      ctx.fill();

      // Render Painted Coverage on Grid
      const grid = gridCoverageRef.current;
      if (grid) {
        const cols = gridColsRef.current;
        const rows = gridRowsRef.current;
        const cellW = w / cols;
        const cellH = h / rows;

        const basePaintColor =
          stage === 1
            ? "220, 38, 38" // Anti-fouling Red
            : stage === 2
            ? "2, 132, 199" // HD Marine Blue
            : "5, 150, 105"; // Eco Green Polyurethane

        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            const val = grid[r * cols + c];
            if (val > 0) {
              const alpha = Math.min(0.96, val / 85);
              ctx.fillStyle = `rgba(${basePaintColor}, ${alpha})`;
              ctx.fillRect(c * cellW, r * cellH, cellW + 0.6, cellH + 0.6);
            }
          }
        }
      }

      // Spray mist particles
      for (const p of particlesRef.current) {
        ctx.fillStyle = p.color;
        ctx.globalAlpha = p.alpha;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }

      // Draw Paint Sagging (Runs / 눈물 자국) Warning Markers
      if (saggingRef.current > 15) {
        ctx.fillStyle = "#ef4444";
        ctx.font = "bold 10px sans-serif";
        ctx.fillText(`도막 흘러내림(Sagging) 감점: -${saggingRef.current}점`, 20, h - 20);
      }

      // Airless Spray Gun Crosshair Target
      const m = mousePosRef.current;
      if (m.x > 0 && m.y > 0) {
        const sprayRadius = nozzleMode === "wide" ? 38 : 22;

        // Outer spray pattern ring
        ctx.strokeStyle = isSprayingRef.current ? "#38bdf8" : "rgba(255, 255, 255, 0.4)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(m.x, m.y, sprayRadius, 0, Math.PI * 2);
        ctx.stroke();

        // Crosshair reticle
        ctx.beginPath();
        ctx.moveTo(m.x - sprayRadius - 6, m.y);
        ctx.lineTo(m.x + sprayRadius + 6, m.y);
        ctx.moveTo(m.x, m.y - sprayRadius - 6);
        ctx.lineTo(m.x, m.y + sprayRadius + 6);
        ctx.stroke();
      }

      animId = requestAnimationFrame(loop);
    };

    animId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animId);
  }, [isPlaying, stage, nozzleMode, gameOver, stageCleared]);

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isPlaying || gameOver || stageCleared) return;
    isSprayingRef.current = true;
    updateMouse(e);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    updateMouse(e);
  };

  const handlePointerUp = () => {
    isSprayingRef.current = false;
  };

  const updateMouse = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    mousePosRef.current = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  };

  return (
    <div className="w-full max-w-5xl mx-auto flex flex-col items-center select-none font-sans">
      {/* Top Header */}
      <div className="w-full bg-slate-900 border border-slate-800 text-white px-5 py-3 rounded-2xl flex flex-wrap items-center justify-between gap-4 shadow-xl mb-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-pink-500 to-rose-600 flex items-center justify-center shadow-lg shadow-pink-500/20">
            <Brush className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-black text-base sm:text-lg text-white">선체 친환경 에어리스 도장 블래스터</h3>
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-pink-500/20 text-pink-400 border border-pink-500/30">
                {stage === 1 ? "1차: 선저 방오도료 (Anti-fouling)" : stage === 2 ? "2차: 외판 에폭시 프라이머" : "3차: 상갑판 우레탄 탑코트"}
              </span>
            </div>
            <p className="text-xs text-slate-400 font-medium">
              마우스를 드래그하여 고압 분사하고, 한곳에 머물지 말고 균일하게 94% 이상 도포하세요!
            </p>
          </div>
        </div>

        {/* Live Gauges */}
        <div className="flex items-center gap-4 text-xs font-semibold">
          <div className="bg-slate-800/80 px-3 py-1.5 rounded-xl border border-slate-700/60">
            <span className="text-slate-400 block text-[10px]">남은 검사 시간</span>
            <span className={`text-base font-black ${timeLeft <= 10 ? "text-rose-400 animate-pulse" : "text-amber-400"}`}>
              {timeLeft}초
            </span>
          </div>

          <div className="bg-slate-800/80 px-3 py-1.5 rounded-xl border border-slate-700/60">
            <span className="text-slate-400 block text-[10px]">도포율 (목표 94%)</span>
            <span className="text-base font-black text-cyan-400">{coverage}%</span>
          </div>

          <div className="bg-slate-800/80 px-3 py-1.5 rounded-xl border border-slate-700/60">
            <span className="text-slate-400 block text-[10px]">흘러내림 결함</span>
            <span className={`text-base font-black ${paintSagging > 20 ? "text-rose-400" : "text-slate-300"}`}>
              {paintSagging}점
            </span>
          </div>

          <div className="bg-slate-800/80 px-3 py-1.5 rounded-xl border border-slate-700/60">
            <span className="text-slate-400 block text-[10px]">도장 스코어</span>
            <span className="text-base font-black text-sky-400">{score.toLocaleString()}점</span>
          </div>

          <button
            onClick={toggleSound}
            className="p-2.5 bg-slate-800 hover:bg-slate-700 rounded-xl border border-slate-700 text-slate-300 transition-all active:scale-95"
            title={isMuted ? "소리 켜기" : "음소거"}
          >
            {isMuted ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4 text-emerald-400" />}
          </button>
        </div>
      </div>

      {/* Main Canvas Viewport */}
      <div className="w-full relative rounded-2xl overflow-hidden border border-slate-800 shadow-2xl bg-slate-950 aspect-[16/9] min-h-[400px] flex items-center justify-center cursor-crosshair">
        <canvas
          ref={canvasRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
          className="w-full h-full block"
        />

        {/* Start Overlay */}
        {!isPlaying && !gameOver && !stageCleared && (
          <div className="absolute inset-0 bg-slate-950/85 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center z-20">
            <div className="w-16 h-16 rounded-2xl bg-pink-500/20 border border-pink-500/40 flex items-center justify-center mb-4 text-pink-400 shadow-xl shadow-pink-500/10">
              <Brush className="w-8 h-8" />
            </div>
            <h2 className="text-2xl sm:text-3xl font-black text-white mb-2">선체 에어리스 도장 블래스터</h2>
            <p className="text-slate-300 text-sm max-w-lg mb-6 leading-relaxed">
              가만히 있으면 도포가 진행되지 않으며 <strong>35초 제한시간</strong>이 만료됩니다!<br />
              마우스를 누른 채 강판을 스캔하듯 분사하여 <strong>도포율 94%</strong>를 달성하세요.<br />
              한 곳에 오래 머물면 <strong>도막 흘러내림(Sagging)</strong> 감점이 발생합니다!
            </p>
            <button
              onClick={startGame}
              className="px-8 py-3.5 bg-gradient-to-r from-pink-500 to-rose-600 hover:from-pink-600 hover:to-rose-700 text-white font-black text-base rounded-xl shadow-lg shadow-pink-500/25 active:scale-95 transition-all flex items-center gap-2"
            >
              <Play className="w-5 h-5 fill-white" />
              도장 스프레이 가동
            </button>
          </div>
        )}

        {/* Stage Cleared */}
        {stageCleared && (
          <div className="absolute inset-0 bg-slate-950/85 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center z-20 animate-in fade-in zoom-in-95 duration-200">
            <div className="w-16 h-16 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center mb-3 text-emerald-400">
              <CheckCircle2 className="w-9 h-9" />
            </div>
            <h3 className="text-2xl font-black text-white mb-1">
              {stage}차 도막 품질 검사 합격!
            </h3>
            <p className="text-slate-300 text-sm mb-4">
              규정 건조 도막 두께(DFT) 및 표면 평탄도를 완벽하게 충족했습니다.
            </p>
            <button
              onClick={nextStage}
              className="px-7 py-3 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-slate-950 font-black text-sm rounded-xl shadow-lg shadow-emerald-500/25 active:scale-95 transition-all"
            >
              다음 도장 구역 ({stage + 1}/3) 진행 →
            </button>
          </div>
        )}

        {/* Game Over */}
        {gameOver && (
          <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center z-20 animate-in fade-in zoom-in-95 duration-200">
            <div className="w-16 h-16 rounded-2xl bg-rose-500/20 border border-rose-500/40 flex items-center justify-center mb-3 text-rose-400">
              <AlertCircle className="w-9 h-9" />
            </div>
            <h3 className="text-2xl font-black text-white mb-1">
              {coverage >= 94 ? "3단계 전체 도장 공정 완공!" : "도장 제한시간 초과 / 품질 불합격"}
            </h3>
            <p className="text-slate-300 text-sm mb-4">
              {coverage >= 94 ? "30만 톤급 선체 도장 공정을 최고 품질로 완수했습니다." : "35초 이내에 목표 도포율(94%)을 달성하지 못했습니다."}
            </p>
            <div className="bg-slate-900 border border-slate-800 px-6 py-4 rounded-2xl text-center mb-6 min-w-[200px]">
              <span className="text-xs text-slate-400 block mb-1">최종 공정 스코어</span>
              <span className="text-3xl font-black text-pink-400">{score.toLocaleString()}점</span>
            </div>
            <button
              onClick={startGame}
              className="px-7 py-3 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white font-bold text-sm rounded-xl active:scale-95 transition-all flex items-center gap-2"
            >
              <RotateCcw className="w-4 h-4" />
              재도전
            </button>
          </div>
        )}
      </div>

      {/* Nozzle Switch & Control Bar */}
      <div className="w-full mt-3 bg-slate-900/90 border border-slate-800 p-3 rounded-2xl flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-slate-300">노즐 분사 각도:</span>
          <button
            onClick={() => setNozzleMode("wide")}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all ${
              nozzleMode === "wide"
                ? "bg-pink-600 text-white shadow-md shadow-pink-600/30 font-black"
                : "bg-slate-800 text-slate-400 hover:text-white"
            }`}
          >
            광각 와이드 팬 (넓은 면적)
          </button>
          <button
            onClick={() => setNozzleMode("focus")}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all ${
              nozzleMode === "focus"
                ? "bg-pink-600 text-white shadow-md shadow-pink-600/30 font-black"
                : "bg-slate-800 text-slate-400 hover:text-white"
            }`}
          >
            정밀 집중 노즐 (모서리/용접선)
          </button>
        </div>

        <div className="text-xs text-slate-400 font-medium">
          팁: 마우스를 일정한 속도로 이동해야 도막 눈물(Sagging) 감점을 피할 수 있습니다.
        </div>
      </div>
    </div>
  );
}
