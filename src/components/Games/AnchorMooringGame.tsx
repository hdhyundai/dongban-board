import React, { useEffect, useRef, useState } from "react";
import { Play, RotateCcw, Volume2, VolumeX, ShieldCheck, Compass, Anchor, Waves, ArrowDownUp } from "lucide-react";
import confetti from "canvas-confetti";
import { gameAudio } from "../../lib/gameSounds";

interface AnchorMooringGameProps {
  onFinish: (score: number) => void;
}

interface MooringLine {
  id: string;
  name: string;
  winchX: number;
  winchY: number;
  bollardX: number;
  bollardY: number;
  tension: number; // 0 to 100%
  slack: number;
  targetLength: number;
}

export default function AnchorMooringGame({ onFinish }: AnchorMooringGameProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [gameState, setGameState] = useState<"READY" | "PLAYING" | "GAMEOVER">("READY");
  const [score, setScore] = useState(0);
  const [distanceToQuay, setDistanceToQuay] = useState(2.8); // meters (target: 0.1 to 0.4m)
  const [currentSpeedKts, setCurrentSpeedKts] = useState(1.4);
  const [alignmentScore, setAlignmentScore] = useState(100);
  const [isMuted, setIsMuted] = useState(gameAudio.getMuted());

  const stateRef = useRef({
    score: 0,
    shipY: 180, // quay is at Y=80, ship drifts down
    shipAngle: 0.04, // slight yaw tilt
    vy: 12, // drift velocity
    vAngle: -0.005,
    foreWinchTension: 35,
    aftWinchTension: 30,
    lines: [] as MooringLine[],
    particles: [] as Array<{ x: number; y: number; vx: number; vy: number; life: number; color: string }>,
    width: 620,
    height: 520,
    lastTime: 0,
    stableTimer: 0,
    isMoored: false,
  });

  const animFrameRef = useRef<number | null>(null);

  const toggleSound = (e: React.MouseEvent) => {
    e.stopPropagation();
    const muted = gameAudio.toggleMute();
    setIsMuted(muted);
  };

  const startGame = () => {
    const s = stateRef.current;
    s.score = 0;
    s.shipY = 220; // 3.5 meters out
    s.shipAngle = 0.05;
    s.vy = 8;
    s.vAngle = -0.004;
    s.foreWinchTension = 30;
    s.aftWinchTension = 30;
    s.stableTimer = 0;
    s.isMoored = false;
    s.particles = [];
    s.lastTime = performance.now();

    setScore(0);
    setDistanceToQuay(3.5);
    setCurrentSpeedKts(1.2);
    setAlignmentScore(100);
    setGameState("PLAYING");
    gameAudio.playClick();
  };

  // Adjust fore/aft winches
  const adjustWinch = (type: "fore" | "aft", delta: number) => {
    if (gameState !== "PLAYING") return;
    const s = stateRef.current;
    if (type === "fore") {
      s.foreWinchTension = Math.max(0, Math.min(100, s.foreWinchTension + delta));
    } else {
      s.aftWinchTension = Math.max(0, Math.min(100, s.aftWinchTension + delta));
    }
    gameAudio.playWinchCrank();
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const finishGame = (success: boolean) => {
      setGameState("GAMEOVER");
      const finalScore = stateRef.current.score;
      onFinish(finalScore);
      if (success && finalScore >= 1200) {
        confetti({
          particleCount: 80,
          spread: 80,
          origin: { y: 0.6 },
          colors: ["#007AFF", "#00A352", "#F5A623", "#FFFFFF"],
        });
      }
    };

    const render = (now: number) => {
      const s = stateRef.current;
      const dt = Math.min((now - s.lastTime) / 1000, 0.1);
      s.lastTime = now;

      const w = canvas.width;
      const h = canvas.height;

      // Physics:
      // Quay wall is at Y = 90
      // Fender contact distance is Y = 135 (ship upper edge)
      // Tidal current pushes ship away (downwards) with force +15
      const tidalCurrent = 18; // pushes downwards
      const forePull = (s.foreWinchTension / 100) * 35;
      const aftPull = (s.aftWinchTension / 100) * 35;
      const netPull = (forePull + aftPull) / 2;

      // Angular torque caused by difference between fore and aft pulls
      const torque = (forePull - aftPull) * 0.0008;

      s.vAngle += torque * dt - s.vAngle * 1.5 * dt;
      s.shipAngle += s.vAngle * dt;
      // Clamp angle
      s.shipAngle = Math.max(-0.15, Math.min(0.15, s.shipAngle));

      const netAccY = tidalCurrent - netPull;
      s.vy += netAccY * dt - s.vy * 0.8 * dt;
      s.shipY += s.vy * dt;

      // Fender Collision at Y = 138
      const fenderY = 138;
      if (s.shipY <= fenderY) {
        s.shipY = fenderY;
        if (s.vy < -15) {
          // Hard slam on fender
          gameAudio.playDrop();
          s.score = Math.max(0, s.score - 100);
        }
        s.vy = 0;
      }

      // Calculate distance to quay in meters
      const distMeters = Math.max(0, +(((s.shipY - fenderY) / 30) + 0.1).toFixed(2));
      setDistanceToQuay(distMeters);
      setCurrentSpeedKts(+(Math.abs(s.vy) * 0.1).toFixed(1));

      // Mooring evaluation:
      // Ship is in the green zone if distMeters <= 0.35 and abs(shipAngle) < 0.03
      const isOptimal = distMeters <= 0.35 && Math.abs(s.shipAngle) < 0.03;
      if (isOptimal) {
        s.stableTimer += dt;
        s.score += Math.round(150 * dt);
        setScore(s.score);

        if (s.stableTimer >= 5 && !s.isMoored) {
          s.isMoored = true;
          s.score += 1500;
          setScore(s.score);
          gameAudio.playShipHorn();
          setTimeout(() => finishGame(true), 1200);
        }
      } else {
        s.stableTimer = Math.max(0, s.stableTimer - dt * 2);
      }

      // Check failure: Line snap if tension = 100 for too long or drifted > 7 meters
      if (s.shipY > 380) {
        gameAudio.playHit();
        finishGame(false);
      }

      // ---------------- RENDER ----------------
      // 1. Sea Water Background
      ctx.fillStyle = "#0c2340";
      ctx.fillRect(0, 0, w, h);

      // Sea wave patterns
      ctx.strokeStyle = "rgba(56, 189, 248, 0.15)";
      ctx.lineWidth = 1.5;
      for (let y = 100; y < h; y += 30) {
        ctx.beginPath();
        for (let x = 0; x < w; x += 15) {
          const waveY = y + Math.sin(x * 0.05 + now * 0.003) * 4;
          if (x === 0) ctx.moveTo(x, waveY);
          else ctx.lineTo(x, waveY);
        }
        ctx.stroke();
      }

      // 2. Concrete Quay Wall (안벽) at top
      ctx.fillStyle = "#475569";
      ctx.fillRect(0, 0, w, 85);
      ctx.fillStyle = "#334155";
      ctx.fillRect(0, 80, w, 6);

      // Yellow/Black Quay Hazard Stripes
      ctx.save();
      for (let sx = 0; sx < w; sx += 30) {
        ctx.fillStyle = (sx / 30) % 2 === 0 ? "#facc15" : "#1e293b";
        ctx.fillRect(sx, 74, 30, 8);
      }
      ctx.restore();

      // Mooring Bollards (주철 볼라드) on Quay
      const bollardForeX = 140;
      const bollardAftX = 480;
      [bollardForeX, bollardAftX].forEach((bx) => {
        ctx.save();
        ctx.fillStyle = "#0f172a";
        ctx.beginPath();
        ctx.arc(bx, 50, 9, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#64748b";
        ctx.beginPath();
        ctx.arc(bx, 50, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      });

      // Rubber Pneumatic Fenders (원통형 고무 방충재) on Quay face
      for (let fx = 100; fx <= 520; fx += 90) {
        ctx.fillStyle = "#1e293b";
        ctx.beginPath();
        ctx.roundRect(fx - 18, 86, 36, 16, 6);
        ctx.fill();
        ctx.strokeStyle = "#475569";
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      // 3. Huge Ship Hull (30만 톤급 컨테이너선)
      ctx.save();
      const shipCenterX = w / 2;
      const shipCenterY = s.shipY + 90;
      ctx.translate(shipCenterX, shipCenterY);
      ctx.rotate(s.shipAngle);

      // Main ship hull body
      const shipW = 460;
      const shipH = 140;

      // Deck background
      ctx.fillStyle = "#002C6C"; // HD Navy hull
      ctx.beginPath();
      ctx.roundRect(-shipW / 2, -shipH / 2, shipW, shipH, [30, 30, 10, 10]);
      ctx.fill();
      ctx.strokeStyle = "#94a3b8";
      ctx.lineWidth = 3;
      ctx.stroke();

      // Deck plating
      ctx.fillStyle = "#005696";
      ctx.beginPath();
      ctx.roundRect(-shipW / 2 + 10, -shipH / 2 + 10, shipW - 20, shipH - 20, [20, 20, 6, 6]);
      ctx.fill();

      // Container bays on ship
      for (let bx = -150; bx <= 150; bx += 65) {
        ctx.fillStyle = "#E05A47"; // HD orange/red container
        ctx.fillRect(bx - 25, -20, 50, 40);
        ctx.strokeStyle = "rgba(0, 0, 0, 0.4)";
        ctx.strokeRect(bx - 25, -20, 50, 40);
      }

      // Fore and Aft Winches on deck
      const foreWinchRelX = -170;
      const foreWinchRelY = -shipH / 2 + 20;
      const aftWinchRelX = 170;
      const aftWinchRelY = -shipH / 2 + 20;

      // Fore Winch Drum
      ctx.fillStyle = "#f59e0b";
      ctx.fillRect(foreWinchRelX - 10, foreWinchRelY - 8, 20, 16);
      // Aft Winch Drum
      ctx.fillStyle = "#38bdf8";
      ctx.fillRect(aftWinchRelX - 10, aftWinchRelY - 8, 20, 16);

      // Ship Name on deck
      ctx.fillStyle = "#ffffff";
      ctx.font = "900 12px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("HD SAMHO VLCC #8122", 0, 48);

      ctx.restore();

      // 4. Mooring Lines (Stretching synthetic hawsers)
      // Calculate world coordinates of winches
      const cosA = Math.cos(s.shipAngle);
      const sinA = Math.sin(s.shipAngle);

      const foreWinchWorldX = shipCenterX + (-170 * cosA - (foreWinchRelY * sinA));
      const foreWinchWorldY = shipCenterY + (-170 * sinA + (foreWinchRelY * cosA));

      const aftWinchWorldX = shipCenterX + (170 * cosA - (aftWinchRelY * sinA));
      const aftWinchWorldY = shipCenterY + (170 * sinA + (aftWinchRelY * cosA));

      // Draw Fore Line to bollardForeX
      ctx.save();
      const foreTensionColor = s.foreWinchTension > 85 ? "#ef4444" : s.foreWinchTension > 60 ? "#f59e0b" : "#4ade80";
      ctx.strokeStyle = foreTensionColor;
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.moveTo(foreWinchWorldX, foreWinchWorldY);
      ctx.lineTo(bollardForeX, 50);
      ctx.stroke();

      // Draw Aft Line to bollardAftX
      const aftTensionColor = s.aftWinchTension > 85 ? "#ef4444" : s.aftWinchTension > 60 ? "#f59e0b" : "#4ade80";
      ctx.strokeStyle = aftTensionColor;
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.moveTo(aftWinchWorldX, aftWinchWorldY);
      ctx.lineTo(bollardAftX, 50);
      ctx.stroke();
      ctx.restore();

      // 5. Target Landing Alignment Zone
      ctx.save();
      const isGreenZone = distMeters <= 0.35 && Math.abs(s.shipAngle) < 0.03;
      ctx.fillStyle = isGreenZone ? "rgba(34, 197, 94, 0.2)" : "rgba(250, 204, 21, 0.1)";
      ctx.fillRect(80, 85, w - 160, 55);
      ctx.strokeStyle = isGreenZone ? "#22c55e" : "rgba(250, 204, 21, 0.4)";
      ctx.setLineDash([6, 4]);
      ctx.strokeRect(80, 85, w - 160, 55);

      // Stability Hold Timer Bar
      if (s.stableTimer > 0) {
        ctx.fillStyle = "rgba(15, 23, 42, 0.85)";
        ctx.fillRect(w / 2 - 110, h - 45, 220, 32);
        ctx.strokeStyle = "#22c55e";
        ctx.strokeRect(w / 2 - 110, h - 45, 220, 32);

        ctx.fillStyle = "#22c55e";
        ctx.fillRect(w / 2 - 105, h - 30, (210 * s.stableTimer) / 5, 12);

        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 10px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(`완전 계류 결속 중: ${Math.round((s.stableTimer / 5) * 100)}%`, w / 2, h - 35);
      }
      ctx.restore();

      if (gameState === "PLAYING") {
        animFrameRef.current = requestAnimationFrame(render);
      }
    };

    if (gameState === "PLAYING") {
      animFrameRef.current = requestAnimationFrame(render);
    } else {
      render(performance.now());
    }

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [gameState]);

  return (
    <div className="relative flex flex-col items-center select-none w-full max-w-[660px]">
      {/* Top Status Bar */}
      <div className="flex items-center justify-between w-full px-4 py-2 bg-slate-900 border border-slate-800 rounded-t-[16px] text-white">
        <div className="flex items-center gap-2">
          <Anchor className="w-4 h-4 text-sky-400" />
          <span className="font-bold text-[13px] text-sky-400">초대형 선박 안벽 계류 윈치 & 볼라드 결속</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 text-[11px] bg-slate-800 px-2 py-0.5 rounded text-slate-300">
            <Waves className="w-3.5 h-3.5 text-cyan-400" />
            <span>조류 1.4 kts</span>
          </div>
          <button
            onClick={toggleSound}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300"
            title={isMuted ? "음소거 해제" : "음소거"}
          >
            {isMuted ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4 text-emerald-400" />}
          </button>
        </div>
      </div>

      {/* Stats HUD Bar */}
      <div className="grid grid-cols-4 w-full bg-slate-950 border-x border-b border-slate-800 px-3 py-2 text-center text-xs">
        <div>
          <div className="text-[10px] text-slate-400">안벽 이격 거리</div>
          <div className={`text-[16px] font-black font-mono ${distanceToQuay <= 0.35 ? "text-emerald-400" : "text-amber-400"}`}>
            {distanceToQuay} m
          </div>
        </div>
        <div>
          <div className="text-[10px] text-slate-400">선수 윈치 장력</div>
          <div className="text-[16px] font-black text-amber-400 font-mono">{stateRef.current.foreWinchTension}%</div>
        </div>
        <div>
          <div className="text-[10px] text-slate-400">선미 윈치 장력</div>
          <div className="text-[16px] font-black text-sky-400 font-mono">{stateRef.current.aftWinchTension}%</div>
        </div>
        <div>
          <div className="text-[10px] text-slate-400">계류 점수</div>
          <div className="text-[16px] font-black text-cyan-400 font-mono">{score.toLocaleString()}</div>
        </div>
      </div>

      {/* Main Canvas Viewport */}
      <div className="relative w-full aspect-[620/520] bg-slate-950 overflow-hidden border-x border-b border-slate-800">
        <canvas ref={canvasRef} width={620} height={520} className="w-full h-full block" />

        {/* READY Overlay */}
        {gameState === "READY" && (
          <div className="absolute inset-0 bg-slate-950/85 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center text-white">
            <div className="w-16 h-16 rounded-2xl bg-sky-500/10 border border-sky-500/30 flex items-center justify-center mb-4 text-sky-400 shadow-lg shadow-sky-500/20">
              <Anchor className="w-8 h-8" />
            </div>
            <h3 className="text-xl font-black mb-2 text-white">
              초대형 선박 안벽 계류 윈치 & 볼라드 결속
            </h3>
            <p className="text-sm text-slate-300 max-w-md mb-6 leading-relaxed">
              영암만 조류와 바람을 이겨내고 30만 톤급 선박을 안벽 방충재(Fender)에 정밀 0.3m 이내로 밀착 고정시키세요.
            </p>
            <div className="flex flex-col gap-2 text-xs text-slate-400 bg-slate-900/80 p-3.5 rounded-xl border border-slate-800 mb-6 max-w-sm">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-amber-400" />
                <span>선수 윈치(Fore): 선수 계류 로프 장력 조절</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-sky-400" />
                <span>선미 윈치(Aft): 선미 계류 로프 장력 조절</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
                <span>안벽에 0.35m 이내로 5초간 유지 시 계류 성공!</span>
              </div>
            </div>
            <button
              onClick={startGame}
              className="px-8 py-3 bg-gradient-to-r from-sky-600 to-blue-600 hover:from-sky-500 hover:to-blue-500 text-white font-bold rounded-xl shadow-lg shadow-sky-600/30 flex items-center gap-2 transition-all transform active:scale-95"
            >
              <Play className="w-5 h-5 fill-current" />
              <span>안벽 접안 작전 개시</span>
            </button>
          </div>
        )}

        {/* GAMEOVER Overlay */}
        {gameState === "GAMEOVER" && (
          <div className="absolute inset-0 bg-slate-950/85 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center text-white animate-in fade-in duration-300">
            <div className={`w-16 h-16 rounded-full flex items-center justify-center mb-3 ${distanceToQuay <= 0.4 ? "bg-emerald-500/20 text-emerald-400" : "bg-rose-500/20 text-rose-400"}`}>
              <ShieldCheck className="w-9 h-9" />
            </div>
            <h3 className="text-2xl font-black mb-1 text-white">
              {distanceToQuay <= 0.4 ? "안벽 계류 작전 완벽 성공!" : "계류선 이탈 / 재시도 필요"}
            </h3>
            <div className="text-xs text-slate-400 mb-4">
              {distanceToQuay <= 0.4 ? "볼라드 4개 완전 결속 및 안벽 밀착 안전 승인" : "조류에 의해 선박이 허용 범위를 벗어났습니다."}
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 w-full max-w-xs mb-6 shadow-xl space-y-2">
              <div className="flex justify-between items-center text-sm">
                <span className="text-slate-400">최종 획득 점수</span>
                <span className="text-xl font-black text-amber-400 font-mono">{score.toLocaleString()}점</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-400">최종 안벽 거리</span>
                <span className="font-bold text-cyan-400 font-mono">{distanceToQuay} m</span>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={startGame}
                className="px-6 py-2.5 bg-gradient-to-r from-sky-600 to-blue-600 hover:from-sky-500 hover:to-blue-500 text-white font-bold rounded-xl shadow-lg flex items-center gap-2 transition-all active:scale-95 text-sm"
              >
                <RotateCcw className="w-4 h-4" />
                <span>재작전 도전</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Bottom Interactive Winch Controls */}
      <div className="w-full bg-slate-900 px-4 py-3 rounded-b-[16px] border border-t-0 border-slate-800 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-amber-400">선수 윈치(Fore):</span>
          <button
            onClick={() => adjustWinch("fore", 12)}
            className="px-3 py-1.5 bg-amber-500/20 hover:bg-amber-500/30 active:scale-95 text-xs font-bold text-amber-400 rounded-lg border border-amber-500/40"
          >
            당기기 (+12%)
          </button>
          <button
            onClick={() => adjustWinch("fore", -12)}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 active:scale-95 text-xs font-bold text-slate-300 rounded-lg border border-slate-700"
          >
            풀기 (-12%)
          </button>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-sky-400">선미 윈치(Aft):</span>
          <button
            onClick={() => adjustWinch("aft", 12)}
            className="px-3 py-1.5 bg-sky-500/20 hover:bg-sky-500/30 active:scale-95 text-xs font-bold text-sky-400 rounded-lg border border-sky-500/40"
          >
            당기기 (+12%)
          </button>
          <button
            onClick={() => adjustWinch("aft", -12)}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 active:scale-95 text-xs font-bold text-slate-300 rounded-lg border border-slate-700"
          >
            풀기 (-12%)
          </button>
        </div>
      </div>
    </div>
  );
}
