import React, { useEffect, useRef, useState } from "react";
import { Play, RotateCcw, Volume2, VolumeX, ShieldCheck, Zap, AlertTriangle, Scan, CheckCircle2 } from "lucide-react";
import confetti from "canvas-confetti";
import { gameAudio } from "../../lib/gameSounds";

interface LNGTankInspectGameProps {
  onFinish: (score: number) => void;
}

interface Defect {
  id: number;
  x: number;
  y: number;
  type: "micro_crack" | "pore" | "undercut" | "cold_joint";
  radius: number;
  progress: number; // 0 to 1 (scanned progress)
  severity: number; // 1 to 3
  cleared: boolean;
  seamIndex: number;
  discovered: boolean;
}

interface ScanParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  alpha: number;
  life: number;
  color: string;
}

export default function LNGTankInspectGame({ onFinish }: LNGTankInspectGameProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [gameState, setGameState] = useState<"READY" | "PLAYING" | "GAMEOVER">("READY");
  const [score, setScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(45);
  const [tankPressure, setTankPressure] = useState(101.3); // kPa
  const [laserPower, setLaserPower] = useState(85);
  const [defectCount, setDefectCount] = useState(0);
  const [clearedCount, setClearedCount] = useState(0);
  const [combo, setCombo] = useState(0);
  const [isMuted, setIsMuted] = useState(gameAudio.getMuted());

  const stateRef = useRef({
    score: 0,
    timeLeft: 45,
    combo: 0,
    maxCombo: 0,
    scannerX: 300,
    scannerY: 260,
    isScanning: false,
    defects: [] as Defect[],
    particles: [] as ScanParticle[],
    corrugationPhase: 0,
    width: 620,
    height: 520,
    lastFrameTime: 0,
    pulseTimer: 0,
    temperatureK: 111.15, // -162°C LNG temperature
  });

  const animFrameRef = useRef<number | null>(null);

  const toggleSound = (e: React.MouseEvent) => {
    e.stopPropagation();
    const muted = gameAudio.toggleMute();
    setIsMuted(muted);
  };

  const spawnDefects = (width: number, height: number): Defect[] => {
    const list: Defect[] = [];
    const types: Array<"micro_crack" | "pore" | "undercut" | "cold_joint"> = [
      "micro_crack",
      "pore",
      "undercut",
      "cold_joint",
    ];
    // Generate along the corrugation weld seams
    const seamRows = [height * 0.25, height * 0.45, height * 0.65, height * 0.82];
    const seamCols = [width * 0.2, width * 0.4, width * 0.6, width * 0.8];

    let id = 1;
    // Generate 12-16 defects distributed along seams
    for (let i = 0; i < 14; i++) {
      const isHorizontal = Math.random() > 0.45;
      let x = 0;
      let y = 0;
      if (isHorizontal) {
        y = seamRows[Math.floor(Math.random() * seamRows.length)] + (Math.random() * 8 - 4);
        x = 60 + Math.random() * (width - 120);
      } else {
        x = seamCols[Math.floor(Math.random() * seamCols.length)] + (Math.random() * 8 - 4);
        y = 50 + Math.random() * (height - 100);
      }

      list.push({
        id: id++,
        x,
        y,
        type: types[Math.floor(Math.random() * types.length)],
        radius: 14 + Math.random() * 8,
        progress: 0,
        severity: Math.floor(Math.random() * 3) + 1,
        cleared: false,
        seamIndex: i,
        discovered: false,
      });
    }
    return list;
  };

  const startGame = () => {
    const s = stateRef.current;
    s.score = 0;
    s.timeLeft = 45;
    s.combo = 0;
    s.maxCombo = 0;
    s.particles = [];
    s.defects = spawnDefects(s.width, s.height);
    s.lastFrameTime = performance.now();
    s.isScanning = false;
    s.scannerX = s.width / 2;
    s.scannerY = s.height / 2;

    setScore(0);
    setTimeLeft(45);
    setDefectCount(s.defects.length);
    setClearedCount(0);
    setCombo(0);
    setGameState("PLAYING");
    gameAudio.playClick();
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (gameState !== "PLAYING") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    stateRef.current.scannerX = (e.clientX - rect.left) * scaleX;
    stateRef.current.scannerY = (e.clientY - rect.top) * scaleY;
  };

  const handlePointerDown = () => {
    if (gameState === "PLAYING") {
      stateRef.current.isScanning = true;
      gameAudio.playMetalClang(1200);
    }
  };

  const handlePointerUp = () => {
    stateRef.current.isScanning = false;
  };

  // Main Game Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let timerInterval: any = null;
    if (gameState === "PLAYING") {
      timerInterval = setInterval(() => {
        stateRef.current.timeLeft -= 1;
        setTimeLeft(stateRef.current.timeLeft);

        // Fluctuate pressure slightly for realism
        setTankPressure((p) => +(101.3 + (Math.sin(Date.now() / 1500) * 0.4)).toFixed(1));

        if (stateRef.current.timeLeft <= 0) {
          clearInterval(timerInterval);
          finishGame();
        }
      }, 1000);
    }

    const finishGame = () => {
      setGameState("GAMEOVER");
      const finalScore = stateRef.current.score;
      onFinish(finalScore);
      if (finalScore >= 1200) {
        confetti({
          particleCount: 70,
          spread: 70,
          origin: { y: 0.6 },
          colors: ["#00A352", "#007AFF", "#50E3C2", "#FFFFFF"],
        });
      }
    };

    const render = (now: number) => {
      const s = stateRef.current;
      const dt = Math.min((now - s.lastFrameTime) / 1000, 0.1);
      s.lastFrameTime = now;
      s.pulseTimer += dt * 3;
      s.corrugationPhase += dt * 0.5;

      const w = canvas.width;
      const h = canvas.height;

      // 1. Draw Background - Mark-III Stainless Steel Membrane Cargo Hold
      ctx.fillStyle = "#0c121d";
      ctx.fillRect(0, 0, w, h);

      // Stainless steel metallic sheen & corrugated knots pattern
      const grad = ctx.createLinearGradient(0, 0, w, h);
      grad.addColorStop(0, "#162338");
      grad.addColorStop(0.5, "#1f304c");
      grad.addColorStop(1, "#111a28");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);

      // Corrugation grid (주름진 스테인리스 격자 판넬)
      const stepX = 70;
      const stepY = 55;

      ctx.save();
      // Draw horizontal corrugation ribs
      for (let y = 30; y < h; y += stepY) {
        ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();

        // 3D corrugation crest
        ctx.fillStyle = "rgba(255, 255, 255, 0.05)";
        ctx.fillRect(0, y - 6, w, 12);
        ctx.fillStyle = "rgba(0, 0, 0, 0.25)";
        ctx.fillRect(0, y + 6, w, 4);
      }

      // Draw vertical corrugation ribs
      for (let x = 30; x < w; x += stepX) {
        ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();

        // 3D corrugation crest
        ctx.fillStyle = "rgba(255, 255, 255, 0.04)";
        ctx.fillRect(x - 5, 0, 10, h);
        ctx.fillStyle = "rgba(0, 0, 0, 0.25)";
        ctx.fillRect(x + 5, 0, 4, h);
      }

      // Corrugation intersection knots (주름 교차 매듭 다이아몬드 패턴)
      for (let x = 30; x < w; x += stepX) {
        for (let y = 30; y < h; y += stepY) {
          ctx.beginPath();
          ctx.arc(x, y, 5, 0, Math.PI * 2);
          ctx.fillStyle = "rgba(200, 225, 255, 0.25)";
          ctx.fill();
        }
      }

      // Overlay cryogenic frost particles / cold haze
      ctx.fillStyle = "rgba(100, 200, 255, 0.03)";
      ctx.fillRect(0, 0, w, h);
      ctx.restore();

      // 2. Render Seam Weld Lines (용접선)
      ctx.save();
      ctx.strokeStyle = "rgba(0, 163, 82, 0.35)"; // HD Green tint
      ctx.setLineDash([8, 4]);
      ctx.lineWidth = 2;
      [h * 0.25, h * 0.45, h * 0.65, h * 0.82].forEach((rowY) => {
        ctx.beginPath();
        ctx.moveTo(20, rowY);
        ctx.lineTo(w - 20, rowY);
        ctx.stroke();
      });
      [w * 0.2, w * 0.4, w * 0.6, w * 0.8].forEach((colX) => {
        ctx.beginPath();
        ctx.moveTo(colX, 20);
        ctx.lineTo(colX, h - 20);
        ctx.stroke();
      });
      ctx.restore();

      // 3. Update & Render Defects
      let activeDefectNearby = false;
      const scanRadius = 45;

      s.defects.forEach((d) => {
        const dist = Math.hypot(d.x - s.scannerX, d.y - s.scannerY);

        // Discovery check
        if (dist < scanRadius + 30) {
          d.discovered = true;
        }

        if (!d.cleared && d.discovered) {
          // Render defect indicator
          const pulse = Math.sin(s.pulseTimer * 3 + d.id) * 0.2 + 0.8;
          ctx.save();

          // Flaw glow
          const defectGrad = ctx.createRadialGradient(d.x, d.y, 2, d.x, d.y, d.radius * pulse);
          defectGrad.addColorStop(0, "rgba(255, 75, 75, 0.9)");
          defectGrad.addColorStop(0.5, "rgba(255, 120, 40, 0.6)");
          defectGrad.addColorStop(1, "rgba(255, 50, 50, 0)");

          ctx.fillStyle = defectGrad;
          ctx.beginPath();
          ctx.arc(d.x, d.y, d.radius * pulse, 0, Math.PI * 2);
          ctx.fill();

          // Defect seam crack line
          ctx.strokeStyle = "#ffffff";
          ctx.lineWidth = 1.8;
          ctx.beginPath();
          ctx.moveTo(d.x - 7, d.y - 3);
          ctx.lineTo(d.x - 2, d.y + 4);
          ctx.lineTo(d.x + 3, d.y - 4);
          ctx.lineTo(d.x + 8, d.y + 2);
          ctx.stroke();

          // Scanning progress ring
          if (d.progress > 0) {
            ctx.strokeStyle = "#00FF9D";
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(d.x, d.y, d.radius + 6, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * d.progress);
            ctx.stroke();

            // Progress text
            ctx.fillStyle = "#00FF9D";
            ctx.font = "bold 10px monospace";
            ctx.textAlign = "center";
            ctx.fillText(`${Math.round(d.progress * 100)}%`, d.x, d.y - d.radius - 8);
          }

          ctx.restore();
        } else if (d.cleared) {
          // Cleared seal
          ctx.save();
          ctx.strokeStyle = "rgba(0, 220, 130, 0.6)";
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(d.x, d.y, 8, 0, Math.PI * 2);
          ctx.stroke();

          ctx.fillStyle = "#00E080";
          ctx.beginPath();
          ctx.arc(d.x, d.y, 3, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }

        // Check if scanner is on top of this defect and scanning
        if (!d.cleared && dist < scanRadius) {
          activeDefectNearby = true;
          // Progress increases when in range
          const scanRate = (s.isScanning ? 1.8 : 0.8) * dt;
          d.progress += scanRate;

          // Emit scan particles
          if (Math.random() < 0.6) {
            s.particles.push({
              x: d.x + (Math.random() * 12 - 6),
              y: d.y + (Math.random() * 12 - 6),
              vx: (Math.random() - 0.5) * 60,
              vy: -Math.random() * 80,
              alpha: 1,
              life: 0.4,
              color: s.isScanning ? "#00FFC2" : "#38BDF8",
            });
          }

          if (d.progress >= 1) {
            d.cleared = true;
            d.progress = 1;
            s.combo += 1;
            s.maxCombo = Math.max(s.maxCombo, s.combo);
            const added = 120 + s.combo * 25;
            s.score += added;
            setScore(s.score);
            setCombo(s.combo);

            const cleared = s.defects.filter((item) => item.cleared).length;
            setClearedCount(cleared);

            gameAudio.playPerfect(Math.min(s.combo, 8));

            // Burst particles
            for (let k = 0; k < 18; k++) {
              const angle = Math.random() * Math.PI * 2;
              const spd = 40 + Math.random() * 120;
              s.particles.push({
                x: d.x,
                y: d.y,
                vx: Math.cos(angle) * spd,
                vy: Math.sin(angle) * spd,
                alpha: 1,
                life: 0.6 + Math.random() * 0.4,
                color: "#00E676",
              });
            }

            // Check if all cleared!
            if (cleared === s.defects.length) {
              s.score += 500; // All clear bonus
              setScore(s.score);
              gameAudio.playShipHorn();
              setTimeout(() => finishGame(), 800);
            }
          }
        }
      });

      // 4. Update & Render Particles
      for (let i = s.particles.length - 1; i >= 0; i--) {
        const p = s.particles[i];
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.life -= dt;
        p.alpha = Math.max(0, p.life / 0.6);

        ctx.save();
        ctx.fillStyle = p.color;
        ctx.globalAlpha = p.alpha;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        if (p.life <= 0) {
          s.particles.splice(i, 1);
        }
      }

      // 5. Draw Laser Scanner Head & HUD (Follows cursor)
      const sx = s.scannerX;
      const sy = s.scannerY;

      ctx.save();
      // Outer scanner ring
      ctx.strokeStyle = activeDefectNearby
        ? "rgba(255, 75, 75, 0.85)"
        : s.isScanning
        ? "rgba(0, 255, 180, 0.9)"
        : "rgba(56, 189, 248, 0.8)";
      ctx.lineWidth = s.isScanning ? 2.5 : 1.5;
      ctx.beginPath();
      ctx.arc(sx, sy, scanRadius, 0, Math.PI * 2);
      ctx.stroke();

      // Scanner crosshairs
      ctx.beginPath();
      ctx.moveTo(sx - scanRadius - 8, sy);
      ctx.lineTo(sx - scanRadius + 8, sy);
      ctx.moveTo(sx + scanRadius - 8, sy);
      ctx.lineTo(sx + scanRadius + 8, sy);
      ctx.moveTo(sx, sy - scanRadius - 8);
      ctx.lineTo(sx, sy - scanRadius + 8);
      ctx.moveTo(sx, sy + scanRadius - 8);
      ctx.lineTo(sx, sy + scanRadius + 8);
      ctx.stroke();

      // Rotating radar sweep
      const sweepAngle = (now / 350) % (Math.PI * 2);
      const sweepGrad = ctx.createConicGradient(sweepAngle, sx, sy);
      sweepGrad.addColorStop(0, "rgba(0, 255, 180, 0.2)");
      sweepGrad.addColorStop(0.12, "rgba(0, 255, 180, 0)");
      sweepGrad.addColorStop(1, "rgba(0, 255, 180, 0)");
      ctx.fillStyle = sweepGrad;
      ctx.beginPath();
      ctx.arc(sx, sy, scanRadius - 1, 0, Math.PI * 2);
      ctx.fill();

      // Center laser dot
      ctx.fillStyle = s.isScanning ? "#FF3B30" : "#00F0FF";
      ctx.shadowColor = s.isScanning ? "#FF3B30" : "#00F0FF";
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(sx, sy, 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // 6. Draw HUD overlays
      ctx.save();
      // Oscilloscope sonogram wave at bottom
      const oscY = h - 35;
      ctx.fillStyle = "rgba(10, 20, 32, 0.85)";
      ctx.fillRect(15, oscY - 15, 200, 38);
      ctx.strokeStyle = "rgba(56, 189, 248, 0.4)";
      ctx.strokeRect(15, oscY - 15, 200, 38);

      ctx.strokeStyle = activeDefectNearby ? "#FF453A" : "#00FFC2";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let x = 0; x < 190; x += 3) {
        const amp = activeDefectNearby ? 12 : 3;
        const wave = Math.sin((x * 0.15) + (now * 0.01)) * amp;
        if (x === 0) ctx.moveTo(20 + x, oscY + wave);
        else ctx.lineTo(20 + x, oscY + wave);
      }
      ctx.stroke();

      ctx.fillStyle = "rgba(255, 255, 255, 0.7)";
      ctx.font = "9px monospace";
      ctx.fillText("ULTRASONIC ECHO SPECTRUM (NDT)", 22, oscY - 5);
      ctx.restore();

      if (gameState === "PLAYING") {
        animFrameRef.current = requestAnimationFrame(render);
      }
    };

    if (gameState === "PLAYING") {
      animFrameRef.current = requestAnimationFrame(render);
    } else {
      // Draw idle preview
      render(performance.now());
    }

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      if (timerInterval) clearInterval(timerInterval);
    };
  }, [gameState]);

  return (
    <div className="relative flex flex-col items-center select-none w-full max-w-[660px]">
      {/* Top Status Bar */}
      <div className="flex items-center justify-between w-full px-4 py-2 bg-slate-900/90 border border-slate-800 rounded-t-[16px] text-white">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-cyan-400 font-bold text-[13px]">
            <Scan className="w-4 h-4 animate-spin-slow" />
            <span>LNG Mark-III 멤브레인 비파괴 검사</span>
          </div>
          <div className="hidden sm:flex items-center gap-1 text-[11px] bg-slate-800 px-2 py-0.5 rounded text-slate-300 font-mono">
            <span>극저온 -162°C</span>
            <span className="text-cyan-400">| {tankPressure} kPa</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={toggleSound}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
            title={isMuted ? "음소거 해제" : "음소거"}
          >
            {isMuted ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4 text-emerald-400" />}
          </button>
        </div>
      </div>

      {/* Stats HUD Bar */}
      <div className="grid grid-cols-4 w-full bg-slate-950 border-x border-b border-slate-800 px-3 py-2 text-center text-xs">
        <div>
          <div className="text-[10px] text-slate-400">검사 점수</div>
          <div className="text-[16px] font-black text-amber-400 font-mono">{score.toLocaleString()}</div>
        </div>
        <div>
          <div className="text-[10px] text-slate-400">남은 시간</div>
          <div className={`text-[16px] font-black font-mono ${timeLeft <= 10 ? "text-rose-500 animate-pulse" : "text-white"}`}>
            {timeLeft}초
          </div>
        </div>
        <div>
          <div className="text-[10px] text-slate-400">결함 조치</div>
          <div className="text-[16px] font-black text-emerald-400 font-mono">
            {clearedCount} / {defectCount}
          </div>
        </div>
        <div>
          <div className="text-[10px] text-slate-400">연속 검사</div>
          <div className="text-[16px] font-black text-cyan-400 font-mono">{combo}x</div>
        </div>
      </div>

      {/* Main Canvas Viewport */}
      <div className="relative w-full aspect-[620/520] bg-slate-950 overflow-hidden border-x border-b border-slate-800 cursor-crosshair">
        <canvas
          ref={canvasRef}
          width={620}
          height={520}
          onPointerMove={handlePointerMove}
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerUp}
          className="w-full h-full block"
        />

        {/* READY Overlay */}
        {gameState === "READY" && (
          <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center text-white">
            <div className="w-16 h-16 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center mb-4 text-cyan-400 shadow-lg shadow-cyan-500/20">
              <Scan className="w-8 h-8" />
            </div>
            <h3 className="text-xl font-black mb-2 text-white">
              LNG선 멤브레인 화물창 정밀 레이저 검사
            </h3>
            <p className="text-sm text-slate-300 max-w-md mb-6 leading-relaxed">
              HD현대삼호의 주력 선종인 친환경 LNG 운반선!
              <br />
              극저온(-163°C) 스테인리스 멤브레인 주름판의 용접 시임(Seam)을 스캔하여 마이크로 기공과 균열을 전수 조치하세요.
            </p>
            <div className="flex flex-col gap-2 text-xs text-slate-400 bg-slate-900/80 p-3.5 rounded-xl border border-slate-800 mb-6 max-w-sm">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-cyan-400" />
                <span>마우스/터치로 탐촉자(헤드)를 용접선 위로 이동</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-rose-400" />
                <span>결함 발견 시 클릭/터치 홀드로 초정밀 레이저 조사</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
                <span>게이지 100% 달성 시 무결점 품질 합격 판정</span>
              </div>
            </div>
            <button
              onClick={startGame}
              className="px-8 py-3 bg-gradient-to-r from-cyan-600 to-emerald-600 hover:from-cyan-500 hover:to-emerald-500 text-white font-bold rounded-xl shadow-lg shadow-cyan-600/30 flex items-center gap-2 transition-all transform active:scale-95"
            >
              <Play className="w-5 h-5 fill-current" />
              <span>정밀 검사 시작</span>
            </button>
          </div>
        )}

        {/* GAMEOVER Overlay */}
        {gameState === "GAMEOVER" && (
          <div className="absolute inset-0 bg-slate-950/85 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center text-white animate-in fade-in duration-300">
            <div className="w-16 h-16 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center mb-3 text-emerald-400">
              <ShieldCheck className="w-9 h-9" />
            </div>
            <h3 className="text-2xl font-black mb-1 text-white">화물창 NDT 비파괴 검사 완료</h3>
            <div className="text-xs text-slate-400 mb-4">선급(DNV/KR) 극저온 밀폐 안전 적합 판정</div>

            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 w-full max-w-xs mb-6 shadow-xl space-y-2">
              <div className="flex justify-between items-center text-sm">
                <span className="text-slate-400">최종 획득 점수</span>
                <span className="text-xl font-black text-amber-400 font-mono">{score.toLocaleString()}점</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-400">조치 완료 결함</span>
                <span className="font-bold text-emerald-400 font-mono">
                  {clearedCount} / {defectCount} ({defectCount > 0 ? Math.round((clearedCount / defectCount) * 100) : 100}%)
                </span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-400">품질 인증 등급</span>
                <span className="font-black text-cyan-400">
                  {clearedCount === defectCount ? "AAA (무결점 명품선박)" : clearedCount >= 10 ? "AA (우수)" : "A (보통)"}
                </span>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={startGame}
                className="px-6 py-2.5 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold rounded-xl shadow-lg flex items-center gap-2 transition-all active:scale-95 text-sm"
              >
                <RotateCcw className="w-4 h-4" />
                <span>재검사 도전</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Footer Instructions */}
      <div className="w-full bg-slate-900 px-4 py-2.5 rounded-b-[16px] border border-t-0 border-slate-800 text-[11px] text-slate-400 flex items-center justify-between">
        <span>💡 팁: 결함 위에서 클릭을 유지하면 고출력 레이저 펄스로 즉각 결함을 용삭 및 조치합니다.</span>
        <span className="text-slate-500 font-mono">HD KSOE Cryogenic QC v2.4</span>
      </div>
    </div>
  );
}
