import React, { useEffect, useRef, useState } from "react";
import { Play, RotateCcw, Volume2, VolumeX, Scan, Zap, AlertTriangle, ShieldCheck, Award, Radio } from "lucide-react";
import confetti from "canvas-confetti";
import { gameAudio } from "../../lib/gameSounds";
import { getGameCanvasFont } from "../../lib/gameFonts";

interface LNGTankInspectGameProps {
  onFinish: (score: number) => void;
}

type DefectType = "crack" | "pore" | "leak";

interface ActiveDefect {
  id: number;
  x: number;
  y: number;
  type: DefectType;
  requiredFreq: 120 | 240 | 480; // kHz
  radius: number;
  spawnTime: number;
  maxLifetime: number; // seconds before breach
  currentLife: number;
  cleared: boolean;
  angle: number;
}

interface LaserBeam {
  startX: number;
  startY: number;
  targetX: number;
  targetY: number;
  color: string;
  alpha: number;
}

export default function LNGTankInspectGame({ onFinish }: LNGTankInspectGameProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [gameState, setGameState] = useState<"READY" | "PLAYING" | "GAMEOVER">("READY");
  const [score, setScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(40);
  const [stage, setStage] = useState(1);
  const [activeFreq, setActiveFreq] = useState<120 | 240 | 480>(120);
  const [combo, setCombo] = useState(0);
  const [tankBreachLevel, setTankBreachLevel] = useState(0); // 0 to 100%
  const [clearedCount, setClearedCount] = useState(0);
  const [isMuted, setIsMuted] = useState(gameAudio.getMuted());
  const [feedback, setFeedback] = useState<{ text: string; color: string } | null>(null);

  const stateRef = useRef({
    isPlaying: false,
    score: 0,
    stage: 1,
    timeLeft: 40,
    combo: 0,
    maxCombo: 0,
    breach: 0,
    clearedCount: 0,
    mouseX: 320,
    mouseY: 200,
    activeFreq: 120 as 120 | 240 | 480,
    defects: [] as ActiveDefect[],
    lasers: [] as LaserBeam[],
    nextSpawnTimer: 0.6,
    idCounter: 1,
    corrugationAnim: 0,
  });

  const toggleSound = (e: React.MouseEvent) => {
    e.stopPropagation();
    const muted = gameAudio.toggleMute();
    setIsMuted(muted);
  };

  const spawnDefect = (w: number, h: number) => {
    const s = stateRef.current;
    if (s.defects.length >= 8 + s.stage * 2) return;

    const types: Array<{ type: DefectType; freq: 120 | 240 | 480 }> = [
      { type: "crack", freq: 120 },
      { type: "pore", freq: 240 },
      { type: "leak", freq: 480 },
    ];
    const picked = types[Math.floor(Math.random() * types.length)];

    const marginX = w * 0.12;
    const marginY = h * 0.12;

    s.defects.push({
      id: s.idCounter++,
      x: marginX + Math.random() * (w - marginX * 2),
      y: marginY + Math.random() * (h - marginY * 2),
      type: picked.type,
      requiredFreq: picked.freq,
      radius: 18 + Math.random() * 8,
      spawnTime: performance.now(),
      maxLifetime: Math.max(2.0, 4.2 - s.stage * 0.6),
      currentLife: 0,
      cleared: false,
      angle: Math.random() * Math.PI * 2,
    });
  };

  const startGame = () => {
    const s = stateRef.current;
    s.isPlaying = true;
    s.score = 0;
    s.stage = 1;
    s.timeLeft = 40;
    s.combo = 0;
    s.maxCombo = 0;
    s.breach = 0;
    s.clearedCount = 0;
    s.defects = [];
    s.lasers = [];
    s.activeFreq = 120;
    s.nextSpawnTimer = 0.4;

    setScore(0);
    setTimeLeft(40);
    setStage(1);
    setCombo(0);
    setTankBreachLevel(0);
    setClearedCount(0);
    setActiveFreq(120);
    setFeedback(null);
    setGameState("PLAYING");

    gameAudio.playClick();
  };

  // Timer loop
  useEffect(() => {
    if (gameState !== "PLAYING") return;
    const interval = setInterval(() => {
      const s = stateRef.current;
      s.timeLeft -= 1;
      setTimeLeft(s.timeLeft);

      // Advance stage every 14 seconds
      if (s.timeLeft === 26 && s.stage === 1) {
        s.stage = 2;
        setStage(2);
        gameAudio.playVictory();
        setFeedback({ text: "⚠️ 2단계: 극저온 급랭 수축 스트레스 급증!", color: "#38bdf8" });
      } else if (s.timeLeft === 12 && s.stage === 2) {
        s.stage = 3;
        setStage(3);
        gameAudio.playVictory();
        setFeedback({ text: "🚨 3단계: 초정밀 헬륨 누설 진공 비상 검사!", color: "#f43f5e" });
      }

      if (s.timeLeft <= 0) {
        clearInterval(interval);
        s.isPlaying = false;
        setGameState("GAMEOVER");
        gameAudio.playVictory();
        onFinish(s.score);
        confetti({ particleCount: 70, spread: 70, origin: { y: 0.6 } });
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [gameState]);

  // Main Render & Interaction Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;
    let lastTime = performance.now();

    const render = (now: number) => {
      const dt = Math.min((now - lastTime) / 1000, 0.08);
      lastTime = now;
      const s = stateRef.current;

      const w = canvas.width;
      const h = canvas.height;

      if (s.isPlaying) {
        s.corrugationAnim += dt;

        // Spawn defects dynamically
        s.nextSpawnTimer -= dt;
        if (s.nextSpawnTimer <= 0) {
          spawnDefect(w, h);
          s.nextSpawnTimer = Math.max(0.4, 1.2 - s.stage * 0.25 + Math.random() * 0.4);
        }

        // Update active defects
        for (let i = s.defects.length - 1; i >= 0; i--) {
          const d = s.defects[i];
          d.currentLife += dt;

          // If defect breached threshold!
          if (d.currentLife >= d.maxLifetime && !d.cleared) {
            s.breach = Math.min(100, s.breach + 18);
            s.combo = 0;
            setCombo(0);
            setTankBreachLevel(s.breach);
            setFeedback({ text: "💥 멤브레인 국부 누설 발생 (-100점 / 위험도 상승)!", color: "#ef4444" });
            s.score = Math.max(0, s.score - 100);
            setScore(s.score);
            gameAudio.playDrop();

            s.defects.splice(i, 1);

            if (s.breach >= 100) {
              s.isPlaying = false;
              setGameState("GAMEOVER");
              onFinish(s.score);
              break;
            }
          }
        }

        // Update Laser Beams
        for (let i = s.lasers.length - 1; i >= 0; i--) {
          s.lasers[i].alpha -= dt * 4;
          if (s.lasers[i].alpha <= 0) {
            s.lasers.splice(i, 1);
          }
        }
      }

      // ----------------- RENDER CANVAS -----------------
      ctx.clearRect(0, 0, w, h);

      // Cryogenic Stainless Steel Membrane Background
      const bgGrad = ctx.createLinearGradient(0, 0, w, h);
      bgGrad.addColorStop(0, "#0b1329");
      bgGrad.addColorStop(0.5, "#132142");
      bgGrad.addColorStop(1, "#0a0f1d");
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, w, h);

      // Stainless Steel Corrugated Ribs (주름 격자)
      ctx.save();
      const stepX = 70;
      const stepY = 55;

      for (let y = 30; y < h; y += stepY) {
        ctx.strokeStyle = "rgba(148, 163, 184, 0.15)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();

        ctx.fillStyle = "rgba(255, 255, 255, 0.04)";
        ctx.fillRect(0, y - 4, w, 8);
      }

      for (let x = 30; x < w; x += stepX) {
        ctx.strokeStyle = "rgba(148, 163, 184, 0.15)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();

        ctx.fillStyle = "rgba(255, 255, 255, 0.04)";
        ctx.fillRect(x - 4, 0, 8, h);
      }
      ctx.restore();

      // Render Active Defects
      s.defects.forEach((d) => {
        const lifeRatio = Math.min(1.0, d.currentLife / d.maxLifetime);
        const pulse = 1 + Math.sin(now * 0.01 + d.id) * 0.15;

        // Color based on required frequency
        // 120kHz: Cyan (#06b6d4)
        // 240kHz: Amber (#f59e0b)
        // 480kHz: Rose (#f43f5e)
        const defectColor =
          d.requiredFreq === 120 ? "#06b6d4" : d.requiredFreq === 240 ? "#f59e0b" : "#f43f5e";

        ctx.save();
        // Danger outer halo
        const grad = ctx.createRadialGradient(d.x, d.y, 2, d.x, d.y, d.radius * pulse * 1.6);
        grad.addColorStop(0, defectColor);
        grad.addColorStop(0.5, `${defectColor}80`);
        grad.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(d.x, d.y, d.radius * pulse * 1.6, 0, Math.PI * 2);
        ctx.fill();

        // Urgency countdown ring
        ctx.strokeStyle = lifeRatio > 0.7 ? "#ef4444" : "#ffffff";
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(d.x, d.y, d.radius + 6, -Math.PI / 2, -Math.PI / 2 + (1 - lifeRatio) * Math.PI * 2);
        ctx.stroke();

        // Required frequency badge
        ctx.fillStyle = "#0f172a";
        ctx.fillRect(d.x - 24, d.y - d.radius - 16, 48, 14);
        ctx.strokeStyle = defectColor;
        ctx.lineWidth = 1;
        ctx.strokeRect(d.x - 24, d.y - d.radius - 16, 48, 14);

        ctx.fillStyle = defectColor;
        ctx.font = getGameCanvasFont(9, "bold", true);
        ctx.textAlign = "center";
        ctx.fillText(`${d.requiredFreq}kHz`, d.x, d.y - d.radius - 6);

        // Core anomaly shape
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 2;
        ctx.beginPath();
        if (d.type === "crack") {
          ctx.moveTo(d.x - 10, d.y - 6);
          ctx.lineTo(d.x - 2, d.y + 4);
          ctx.lineTo(d.x + 4, d.y - 4);
          ctx.lineTo(d.x + 10, d.y + 6);
        } else if (d.type === "pore") {
          ctx.arc(d.x, d.y, 6, 0, Math.PI * 2);
        } else {
          ctx.moveTo(d.x, d.y - 8);
          ctx.lineTo(d.x + 8, d.y + 8);
          ctx.lineTo(d.x - 8, d.y + 8);
          ctx.closePath();
        }
        ctx.stroke();

        ctx.restore();
      });

      // Render Laser Beams
      s.lasers.forEach((l) => {
        ctx.save();
        ctx.strokeStyle = l.color;
        ctx.globalAlpha = l.alpha;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(l.startX, l.startY);
        ctx.lineTo(l.targetX, l.targetY);
        ctx.stroke();

        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(l.targetX, l.targetY, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      });

      // Render Crosshair Targeting Reticle
      if (s.isPlaying) {
        ctx.save();
        const retColor =
          s.activeFreq === 120 ? "#06b6d4" : s.activeFreq === 240 ? "#f59e0b" : "#f43f5e";

        // Outer rotating brackets
        ctx.strokeStyle = retColor;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(s.mouseX, s.mouseY, 26, 0, Math.PI * 2);
        ctx.stroke();

        // Crosshairs
        ctx.beginPath();
        ctx.moveTo(s.mouseX - 34, s.mouseY);
        ctx.lineTo(s.mouseX - 12, s.mouseY);
        ctx.moveTo(s.mouseX + 12, s.mouseY);
        ctx.lineTo(s.mouseX + 34, s.mouseY);
        ctx.moveTo(s.mouseX, s.mouseY - 34);
        ctx.lineTo(s.mouseX, s.mouseY - 12);
        ctx.moveTo(s.mouseX, s.mouseY + 12);
        ctx.lineTo(s.mouseX, s.mouseY + 34);
        ctx.stroke();

        // Frequency Label on Reticle
        ctx.fillStyle = retColor;
        ctx.font = getGameCanvasFont(10, "black", true);
        ctx.textAlign = "center";
        ctx.fillText(`[${s.activeFreq}kHz]`, s.mouseX, s.mouseY + 40);

        ctx.restore();
      }

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);

    const container = mountRef.current;
    if (!container) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const cw = entry.contentRect.width;
        const ch = entry.contentRect.height;
        if (cw > 50 && ch > 50) {
          canvas.width = cw;
          canvas.height = ch;
        }
      }
    });
    resizeObserver.observe(container);

    return () => {
      cancelAnimationFrame(animId);
      resizeObserver.disconnect();
    };
  }, [gameState]);

  // Pointer Movement
  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    stateRef.current.mouseX = e.clientX - rect.left;
    stateRef.current.mouseY = e.clientY - rect.top;
  };

  // Laser Strike Trigger (Click to scan & neutralize)
  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (gameState !== "PLAYING") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    const s = stateRef.current;
    const currentFreq = s.activeFreq;

    // Laser beam visualization
    const beamColor = currentFreq === 120 ? "#06b6d4" : currentFreq === 240 ? "#f59e0b" : "#f43f5e";
    s.lasers.push({
      startX: mx,
      startY: canvas.height,
      targetX: mx,
      targetY: my,
      color: beamColor,
      alpha: 1.0,
    });

    gameAudio.playClick();

    // Check hit on defects
    let hitFound = false;

    for (let i = s.defects.length - 1; i >= 0; i--) {
      const d = s.defects[i];
      const dist = Math.hypot(mx - d.x, my - d.y);

      if (dist <= d.radius + 12) {
        hitFound = true;

        if (d.requiredFreq === currentFreq) {
          // MATCHED RESONANCE FREQUENCY!
          const reactionTime = (performance.now() - d.spawnTime) / 1000;
          const isInstant = reactionTime < 0.8;

          s.combo += 1;
          s.maxCombo = Math.max(s.maxCombo, s.combo);
          s.clearedCount += 1;

          const basePts = 350;
          const speedBonus = isInstant ? 500 : Math.round(Math.max(0, 300 - reactionTime * 80));
          const precisionBonus = Math.round(Math.max(0, 1 - dist / (d.radius + 12)) * 300);
          const totalEarned = (basePts + speedBonus + precisionBonus) * Math.min(s.combo, 6);

          s.score += totalEarned;
          setScore(s.score);
          setCombo(s.combo);
          setClearedCount(s.clearedCount);

          setFeedback({
            text: isInstant
              ? `⚡ INSTANT RESOLVE! 초고속 탐지 (+${totalEarned.toLocaleString()}점)`
              : `🎯 공진 차단 성공 (+${totalEarned.toLocaleString()}점)`,
            color: "#10b981",
          });

          gameAudio.playPerfect(Math.min(s.combo, 8));
          s.defects.splice(i, 1);
        } else {
          // FREQUENCY MISMATCH PENALTY!
          s.combo = 0;
          setCombo(0);
          s.score = Math.max(0, s.score - 60);
          setScore(s.score);
          setFeedback({
            text: `⚠️ 주파수 불일치! [${d.requiredFreq}kHz]로 전환 필요 (-60점)`,
            color: "#f43f5e",
          });
          gameAudio.playDrop();
        }
        break;
      }
    }

    if (!hitFound) {
      // Blank air shot
      s.combo = 0;
      setCombo(0);
    }
  };

  const switchFrequency = (freq: 120 | 240 | 480) => {
    stateRef.current.activeFreq = freq;
    setActiveFreq(freq);
    gameAudio.playClick();
  };

  // Keyboard shortcut 1, 2, 3
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "1") switchFrequency(120);
      if (e.key === "2") switchFrequency(240);
      if (e.key === "3") switchFrequency(480);
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

  return (
    <div
      ref={mountRef}
      className="relative w-full h-full flex-1 min-h-0 flex flex-col bg-slate-950 rounded-xl lg:rounded-2xl overflow-hidden select-none font-hd text-white"
    >
      {/* Canvas Viewport Container */}
      <div className="relative flex-1 w-full min-h-0 overflow-hidden">
        <canvas
          ref={canvasRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          className="w-full h-full block cursor-crosshair touch-none"
        />

      {/* Top HUD */}
      <div className="absolute top-2 sm:top-3 left-2 sm:left-3 right-2 sm:right-3 flex items-center justify-between pointer-events-none z-10">
        <div className="flex items-center gap-1.5 sm:gap-2">
          <div className="bg-slate-900/90 backdrop-blur-md border border-slate-700/80 rounded-xl px-2.5 sm:px-3.5 py-1 sm:py-1.5 shadow-lg flex items-center gap-1.5 sm:gap-2">
            <Scan className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-400" />
            <span className="text-[11px] sm:text-[12px] font-black text-emerald-400 uppercase tracking-wider">
              {stage}단계: {stage === 1 ? "상온 기밀 검사" : stage === 2 ? "극저온 급랭 수축" : "헬륨 초미세 누설"}
            </span>
            <span className="text-[10px] sm:text-[11px] text-slate-300 font-bold bg-slate-800 px-1.5 sm:px-2 py-0.5 rounded-full">
              결함 제거: {clearedCount}개
            </span>
          </div>

          {combo > 1 && (
            <div className="bg-emerald-500/20 border border-emerald-500/40 rounded-xl px-2.5 py-1 text-emerald-400 text-[11px] font-black animate-pulse">
              ⚡ {combo} COMBO!
            </div>
          )}

          {tankBreachLevel > 0 && (
            <div className="bg-rose-500/20 border border-rose-500/40 rounded-xl px-2.5 py-1 text-rose-400 text-[11px] font-bold">
              누설 위험도: {tankBreachLevel}%
            </div>
          )}
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2 pointer-events-auto">
          <div className="bg-slate-900/90 border border-slate-700 rounded-xl px-2.5 py-1 text-[11px] font-bold text-slate-300">
            ⏳ {timeLeft}초
          </div>

          <button
            onClick={toggleSound}
            className="p-1.5 sm:p-2 bg-slate-800/90 hover:bg-slate-700 text-slate-300 rounded-xl border border-slate-700 shadow-md active:scale-95"
          >
            {isMuted ? <VolumeX className="w-3.5 h-3.5 text-rose-400" /> : <Volume2 className="w-3.5 h-3.5 text-emerald-400" />}
          </button>

          <div className="bg-slate-900/95 border border-emerald-500/30 rounded-xl px-3 sm:px-4 py-1 sm:py-1.5 shadow-lg flex items-center gap-1.5">
            <Award className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-[14px] sm:text-[15px] font-black text-emerald-400 tabular-nums">
              {score.toLocaleString()}점
            </span>
          </div>
        </div>
      </div>

      {/* Floating Center Feedback */}
      {feedback && (
        <div className="absolute top-14 left-1/2 -translate-x-1/2 pointer-events-none z-10 animate-in fade-in duration-150">
          <div
            className="px-4 py-1.5 rounded-full font-black text-[12px] shadow-xl border bg-slate-900/90 backdrop-blur-md whitespace-nowrap"
            style={{ color: feedback.color, borderColor: `${feedback.color}40` }}
          >
            {feedback.text}
          </div>
        </div>
      )}

      {/* Start / Game Over Modal Screen */}
      {gameState !== "PLAYING" && (
        <div className="absolute inset-0 bg-slate-950/85 backdrop-blur-md flex flex-col items-center justify-center p-4 sm:p-6 z-20 text-center animate-in fade-in duration-200">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center mb-3 shadow-xl shadow-emerald-500/20">
            <Scan className="w-7 h-7 text-white stroke-[2.5]" />
          </div>

          <h3 className="text-lg sm:text-xl font-black text-white mb-1.5 tracking-tight">
            {gameState === "READY" ? "LNG 극저온 멤브레인 레이저 검사" : "비파괴 레이저 검사 완료"}
          </h3>

          <p className="text-xs sm:text-[13px] text-slate-300 max-w-md mb-5 leading-relaxed">
            {gameState === "READY"
              ? "영하 163°C 극저온 LNG 화물창 스테인리스 멤브레인의 결함 탐지! 결함 색상(청색 120kHz / 황색 240kHz / 적색 480kHz)에 맞춰 하단 버튼이나 숫자키[1, 2, 3]로 전환한 뒤 클릭하여 레이저로 격파하세요."
              : `최종 검사 점수: ${score.toLocaleString()}점 (제거한 결함: ${clearedCount}개 / 최대 ${stateRef.current.maxCombo}콤보)`}
          </p>

          <button
            onClick={startGame}
            className="px-6 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white font-black text-sm rounded-xl shadow-lg shadow-emerald-500/30 flex items-center gap-2 transition-all active:scale-95 cursor-pointer"
          >
            {gameState === "READY" ? <Play className="w-4 h-4 fill-current" /> : <RotateCcw className="w-4 h-4" />}
            <span>{gameState === "READY" ? "초정밀 레이저 검사 시작" : "다시 검사하기"}</span>
          </button>
        </div>
      )}

      </div>

      {/* Dedicated Bottom Frequency Selector Bar - Outside the canvas so buttons never obscure flaws! */}
      <div className="px-3 py-2 bg-slate-900 border-t border-slate-800 shrink-0 z-10 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 sm:gap-2">
          <span className="text-[11px] font-bold text-slate-400 hidden sm:inline">레이저 주파수:</span>
          <button
            onClick={() => switchFrequency(120)}
            className={`px-3 py-1.5 rounded-lg font-black text-xs flex items-center gap-1.5 transition-all active:scale-95 border cursor-pointer ${
              activeFreq === 120
                ? "bg-cyan-500 text-slate-950 border-cyan-300 shadow-[0_0_12px_rgba(6,182,212,0.5)]"
                : "bg-slate-800 text-cyan-400 border-slate-700 hover:bg-slate-700"
            }`}
          >
            <Radio className="w-3.5 h-3.5" />
            <span>[1] 120kHz (미세 균열)</span>
          </button>

          <button
            onClick={() => switchFrequency(240)}
            className={`px-3 py-1.5 rounded-lg font-black text-xs flex items-center gap-1.5 transition-all active:scale-95 border cursor-pointer ${
              activeFreq === 240
                ? "bg-amber-500 text-slate-950 border-amber-300 shadow-[0_0_12px_rgba(245,158,11,0.5)]"
                : "bg-slate-800 text-amber-400 border-slate-700 hover:bg-slate-700"
            }`}
          >
            <Radio className="w-3.5 h-3.5" />
            <span>[2] 240kHz (기공 결함)</span>
          </button>

          <button
            onClick={() => switchFrequency(480)}
            className={`px-3 py-1.5 rounded-lg font-black text-xs flex items-center gap-1.5 transition-all active:scale-95 border cursor-pointer ${
              activeFreq === 480
                ? "bg-rose-500 text-slate-950 border-rose-300 shadow-[0_0_12px_rgba(244,63,94,0.5)]"
                : "bg-slate-800 text-rose-400 border-slate-700 hover:bg-slate-700"
            }`}
          >
            <Radio className="w-3.5 h-3.5" />
            <span>[3] 480kHz (헬륨 누설)</span>
          </button>
        </div>

        <div className="text-[11px] text-slate-400 font-mono hidden md:block">
          키보드 [1], [2], [3] 즉시 전환 가능 · 결함 색상과 일치시켜 격파
        </div>
      </div>
    </div>
  );
}
