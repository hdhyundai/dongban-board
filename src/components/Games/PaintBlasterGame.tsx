import React, { useState, useEffect, useRef } from "react";
import { Play, RotateCcw, Volume2, VolumeX, Brush, Sparkles, Award, AlertCircle, CheckCircle2 } from "lucide-react";
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
  const [gameOver, setGameOver] = useState(false);
  const [stageCleared, setStageCleared] = useState(false);
  const [isMuted, setIsMuted] = useState(gameAudio.getMuted());

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const isSprayingRef = useRef(false);
  const mousePosRef = useRef({ x: 0, y: 0 });
  const gridCoverageRef = useRef<Uint8Array | null>(null);
  const gridColsRef = useRef(50);
  const gridRowsRef = useRef(30);
  const particlesRef = useRef<SprayParticle[]>([]);
  const dwellTimeRef = useRef<{ x: number; y: number; time: number }>({ x: 0, y: 0, time: 0 });
  const lastSoundTimeRef = useRef(0);
  const scoreRef = useRef(0);
  const saggingRef = useRef(0);

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

        // Check dwell time in one spot (paint sagging defect)
        const dMove = Math.hypot(m.x - dwellTimeRef.current.x, m.y - dwellTimeRef.current.y);
        if (dMove < 15) {
          dwellTimeRef.current.time += dt;
          if (dwellTimeRef.current.time > 0.8) {
            saggingRef.current += Math.round(dt * 15);
            setPaintSagging(saggingRef.current);
          }
        } else {
          dwellTimeRef.current = { x: m.x, y: m.y, time: 0 };
        }

        // Trigger spray sound throttled
        if (now - lastSoundTimeRef.current > 75) {
          gameAudio.playPaintSpray();
          lastSoundTimeRef.current = now;
        }

        // Spray particles from nozzle
        for (let k = 0; k < 6; k++) {
          const ang = Math.random() * Math.PI * 2;
          const dist = Math.random() * 26;
          particlesRef.current.push({
            x: m.x + Math.cos(ang) * dist,
            y: m.y + Math.sin(ang) * dist,
            vx: (Math.random() - 0.5) * 50,
            vy: (Math.random() - 0.5) * 50 + 20,
            radius: 2 + Math.random() * 3,
            alpha: 0.9,
            color: stage === 1 ? "#dc2626" : (stage === 2 ? "#0284c7" : "#0d9488"),
          });
        }

        // Apply paint to coverage grid
        const grid = gridCoverageRef.current;
        if (grid) {
          const cols = gridColsRef.current;
          const rows = gridRowsRef.current;
          const cellW = w / cols;
          const cellH = h / rows;

          const sprayRadius = 32;
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
                const newVal = Math.min(100, oldVal + 18);
                if (oldVal < 80 && newVal >= 80) {
                  newlyCovered++;
                }
                grid[idx] = newVal;
              }
            }
          }

          if (newlyCovered > 0) {
            scoreRef.current += newlyCovered * 12;
            setScore(scoreRef.current);

            // Compute total coverage %
            let coveredCount = 0;
            for (let i = 0; i < grid.length; i++) {
              if (grid[i] >= 80) coveredCount++;
            }
            const pct = Math.round((coveredCount / grid.length) * 100);
            setCoverage(pct);

            // Stage complete at 95% coverage
            if (pct >= 95) {
              gameAudio.playVictory();
              const stageBonus = 1200 - saggingRef.current * 8;
              scoreRef.current += Math.max(400, stageBonus);
              setScore(scoreRef.current);

              if (stage >= 3) {
                setGameOver(true);
                setIsPlaying(false);
                onFinish(scoreRef.current);
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

      // DRAW GRAPHICS
      ctx.clearRect(0, 0, w, h);

      // Base: Oxidized Steel Plate with rust textures
      ctx.fillStyle = "#3f3f46";
      ctx.fillRect(0, 0, w, h);

      // Steel Plate Weld Seams & Rivets
      ctx.strokeStyle = "#27272a";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(w / 3, 0);
      ctx.lineTo(w / 3, h);
      ctx.moveTo((w * 2) / 3, 0);
      ctx.lineTo((w * 2) / 3, h);
      ctx.moveTo(0, h / 2);
      ctx.lineTo(w, h / 2);
      ctx.stroke();

      // Rust Patches
      ctx.fillStyle = "rgba(180, 83, 9, 0.4)";
      ctx.beginPath();
      ctx.ellipse(w * 0.25, h * 0.35, 45, 25, 0.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(w * 0.72, h * 0.65, 55, 30, -0.3, 0, Math.PI * 2);
      ctx.fill();

      // Render Painted Coverage on Grid
      const grid = gridCoverageRef.current;
      if (grid) {
        const cols = gridColsRef.current;
        const rows = gridRowsRef.current;
        const cellW = w / cols;
        const cellH = h / rows;

        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            const val = grid[r * cols + c];
            if (val > 0) {
              const alpha = val / 100;
              ctx.fillStyle =
                stage === 1
                  ? `rgba(220, 38, 38, ${alpha})`
                  : stage === 2
                  ? `rgba(2, 132, 199, ${alpha})`
                  : `rgba(13, 148, 136, ${alpha})`;
              ctx.fillRect(c * cellW, r * cellH, cellW + 0.5, cellH + 0.5);
            }
          }
        }
      }

      // Draw Spray Particles
      for (const p of particlesRef.current) {
        ctx.fillStyle = p.color;
        ctx.globalAlpha = p.alpha;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }

      // Draw Airless Spray Gun Crosshair / Nozzle Ring
      const m = mousePosRef.current;
      if (m.x > 0 && m.y > 0) {
        ctx.strokeStyle = isSprayingRef.current ? "#facc15" : "rgba(255, 255, 255, 0.5)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(m.x, m.y, 32, 0, Math.PI * 2);
        ctx.stroke();

        ctx.fillStyle = isSprayingRef.current ? "#facc15" : "rgba(255, 255, 255, 0.8)";
        ctx.beginPath();
        ctx.arc(m.x, m.y, 3, 0, Math.PI * 2);
        ctx.fill();
      }

      animId = requestAnimationFrame(loop);
    };

    animId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animId);
  }, [isPlaying, stage, stageCleared, gameOver]);

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isPlaying || stageCleared || gameOver) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    mousePosRef.current = { x, y };
    isSprayingRef.current = true;
    dwellTimeRef.current = { x, y, time: 0 };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    mousePosRef.current = { x, y };
  };

  const handlePointerUp = () => {
    isSprayingRef.current = false;
  };

  return (
    <div className="w-full max-w-4xl mx-auto flex flex-col items-center select-none">
      {/* Header */}
      <div className="w-full bg-slate-900 border border-slate-800 text-white px-5 py-3.5 rounded-2xl flex flex-wrap items-center justify-between gap-3 shadow-xl mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-rose-500 to-pink-600 flex items-center justify-center shadow-lg shadow-rose-500/20">
            <Brush className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-black text-lg text-white">도장 공정 : 친환경 방오 도료 스프레이</h3>
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-400 border border-rose-500/30">
                블록 {stage}/3 ({stage === 1 ? "선저 방오도료" : stage === 2 ? "외판 탑코트" : "타기실 특수도장"})
              </span>
            </div>
            <p className="text-xs text-slate-400 font-medium">
              마우스/터치로 에어리스 건을 드래그하여 도료 흘림 없이 균일하게 95% 이상 도장하세요!
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="text-right">
            <span className="text-xs text-slate-400 block font-medium">도장 점수</span>
            <span className="text-2xl font-black text-rose-400 tracking-tight">
              {score.toLocaleString()}
            </span>
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

      {/* Main Canvas */}
      <div className="w-full relative rounded-2xl overflow-hidden border border-slate-800 shadow-2xl bg-slate-950 aspect-[16/9] min-h-[380px] flex items-center justify-center">
        <canvas
          ref={canvasRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
          className="w-full h-full cursor-crosshair touch-none"
        />

        {/* Coverage HUD */}
        {isPlaying && (
          <div className="absolute top-4 left-4 flex items-center gap-3 pointer-events-none">
            <div className="bg-slate-900/80 backdrop-blur-md border border-slate-700/60 px-4 py-2 rounded-xl text-white">
              <span className="text-[10px] text-slate-400 block">선체 도장 도포율</span>
              <span className="text-xl font-black text-rose-400">{coverage}% / 95%</span>
            </div>

            {paintSagging > 0 && (
              <div className="bg-rose-950/80 border border-rose-600/70 px-3.5 py-2 rounded-xl text-rose-300 text-xs font-bold flex items-center gap-1.5">
                <AlertCircle className="w-4 h-4 text-rose-400" />
                도료 흘림 결함: -{paintSagging}점
              </div>
            )}
          </div>
        )}

        {/* Start Overlay */}
        {!isPlaying && !gameOver && !stageCleared && (
          <div className="absolute inset-0 bg-slate-950/85 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center z-20">
            <div className="w-16 h-16 rounded-2xl bg-rose-500/20 border border-rose-500/40 flex items-center justify-center mb-4 text-rose-400 shadow-xl shadow-rose-500/10">
              <Brush className="w-8 h-8" />
            </div>
            <h2 className="text-2xl sm:text-3xl font-black text-white mb-2">선체 친환경 도장 스프레이</h2>
            <p className="text-slate-300 text-sm max-w-md mb-6 leading-relaxed">
              세계 최고 친환경 선박을 위한 고압 에어리스 도장 공정입니다.<br />
              한 곳에 오래 머물면 도료가 흘러내리니 부드럽게 지그재그로 분사하여 95%를 채우세요!
            </p>
            <button
              onClick={startGame}
              className="px-8 py-3.5 bg-gradient-to-r from-rose-500 to-pink-600 hover:from-rose-600 hover:to-pink-700 text-white font-black text-base rounded-xl shadow-lg shadow-rose-500/25 active:scale-95 transition-all flex items-center gap-2"
            >
              <Play className="w-5 h-5 fill-white" />
              도장 작업 개시
            </button>
          </div>
        )}

        {/* Stage Cleared */}
        {stageCleared && (
          <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center z-20 animate-in fade-in zoom-in-95 duration-200">
            <div className="w-16 h-16 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center mb-3 text-emerald-400">
              <CheckCircle2 className="w-9 h-9" />
            </div>
            <h3 className="text-2xl font-black text-white mb-1">
              블록 {stage} 도막 두께 검사 합격!
            </h3>
            <p className="text-slate-300 text-sm mb-4">
              도포율 95% 달성 및 친환경 도막 균일성 인증을 획득했습니다.
            </p>
            <button
              onClick={nextStage}
              className="px-7 py-3 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-slate-950 font-black text-sm rounded-xl shadow-lg shadow-emerald-500/25 active:scale-95 transition-all"
            >
              다음 블록 ({stage + 1}/3) 도장 →
            </button>
          </div>
        )}

        {/* Game Clear */}
        {gameOver && (
          <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center z-20 animate-in fade-in zoom-in-95 duration-200">
            <div className="w-16 h-16 rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center mb-3 text-amber-400">
              <Award className="w-9 h-9" />
            </div>
            <span className="text-xs font-bold text-amber-400 tracking-widest uppercase mb-1">COATING MASTER</span>
            <h3 className="text-2xl sm:text-3xl font-black text-white mb-2">
              전 선체 친환경 특수 도장 완공!
            </h3>
            <p className="text-slate-300 text-sm mb-4 max-w-md">
              HD현대삼호 품질 기준을 완벽하게 만족하는 무결점 방오 도막이 완성되었습니다.
            </p>
            <div className="bg-slate-900 border border-slate-800 px-6 py-4 rounded-2xl text-center mb-6 min-w-[200px]">
              <span className="text-xs text-slate-400 block mb-1">최종 공인 점수</span>
              <span className="text-3xl font-black text-rose-400">{score.toLocaleString()}점</span>
            </div>
            <button
              onClick={startGame}
              className="px-7 py-3 bg-gradient-to-r from-rose-500 to-pink-600 hover:from-rose-600 hover:to-pink-700 text-white font-black text-sm rounded-xl active:scale-95 transition-all flex items-center gap-2"
            >
              <RotateCcw className="w-4 h-4" />
              다시 도장하기
            </button>
          </div>
        )}
      </div>

      {/* Control Tips */}
      <div className="w-full mt-3 bg-slate-900/60 border border-slate-800/80 rounded-xl p-3 flex items-center justify-between text-xs text-slate-400">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-rose-400 shrink-0" />
          <span>에어리스 스프레이 건: 마우스/손가락을 누른 상태로 캔버스 전역을 쓸어내려 도색하세요.</span>
        </div>
        <span className="text-slate-500 hidden sm:inline">Eco Low-VOC Paint System</span>
      </div>
    </div>
  );
}
