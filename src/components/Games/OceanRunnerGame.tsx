import React, { useEffect, useRef, useState } from "react";
import { Play, RotateCcw, Volume2, VolumeX, Shield, Zap, Compass } from "lucide-react";
import confetti from "canvas-confetti";
import { gameAudio } from "../../lib/gameSounds";

interface OceanRunnerGameProps {
  onFinish: (score: number) => void;
}

interface Obstacle {
  x: number;
  y: number;
  width: number;
  height: number;
  type: "reef" | "buoy" | "driftwood";
  speed: number;
}

interface Collectible {
  x: number;
  y: number;
  width: number;
  height: number;
  type: "battery" | "anchor" | "shield" | "turbo";
  speed: number;
}

interface WaterParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  alpha: number;
  life: number;
}

export default function OceanRunnerGame({ onFinish }: OceanRunnerGameProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [gameState, setGameState] = useState<"READY" | "PLAYING" | "GAMEOVER">("READY");
  const [score, setScore] = useState(0);
  const [distance, setDistance] = useState(0);
  const [battery, setBattery] = useState(100);
  const [hasShield, setHasShield] = useState(false);
  const [isTurbo, setIsTurbo] = useState(false);
  const [gameOverReason, setGameOverReason] = useState("");
  const [isMuted, setIsMuted] = useState(gameAudio.getMuted());

  const stateRef = useRef({
    playerX: 250,
    playerY: 420,
    targetX: 250,
    playerWidth: 42,
    playerHeight: 74,
    speed: 5,
    distance: 0,
    battery: 100,
    score: 0,
    hasShield: false,
    turboTimer: 0,
    obstacles: [] as Obstacle[],
    collectibles: [] as Collectible[],
    wakeParticles: [] as WaterParticle[],
    shake: 0,
    width: 540,
    height: 520,
    lastSpawn: 0,
  });

  const animFrameRef = useRef<number | null>(null);

  const toggleSound = (e: React.MouseEvent) => {
    e.stopPropagation();
    const muted = gameAudio.toggleMute();
    setIsMuted(muted);
  };

  const startGame = () => {
    const s = stateRef.current;
    s.playerX = s.width / 2;
    s.targetX = s.width / 2;
    s.playerY = s.height - 80;
    s.speed = 5;
    s.distance = 0;
    s.score = 0;
    s.battery = 100;
    s.hasShield = false;
    s.turboTimer = 0;
    s.obstacles = [];
    s.collectibles = [];
    s.wakeParticles = [];
    s.shake = 0;
    s.lastSpawn = Date.now();

    setScore(0);
    setDistance(0);
    setBattery(100);
    setHasShield(false);
    setIsTurbo(false);
    setGameOverReason("");
    setGameState("PLAYING");
    gameAudio.playClick();
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (gameState !== "PLAYING") return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * stateRef.current.width;
    stateRef.current.targetX = Math.max(30, Math.min(stateRef.current.width - 30, x));
  };

  // Keyboard navigation
  useEffect(() => {
    const keys: Record<string, boolean> = {};

    const handleKeyDown = (e: KeyboardEvent) => {
      keys[e.key] = true;
      if (e.code === "Space" && (gameState === "READY" || gameState === "GAMEOVER")) {
        startGame();
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      keys[e.key] = false;
    };

    const interval = setInterval(() => {
      if (gameState !== "PLAYING") return;
      const s = stateRef.current;
      const step = 9;
      if (keys["ArrowLeft"] || keys["a"] || keys["A"]) {
        s.targetX = Math.max(30, s.targetX - step);
      }
      if (keys["ArrowRight"] || keys["d"] || keys["D"]) {
        s.targetX = Math.min(s.width - 30, s.targetX + step);
      }
    }, 16);

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      clearInterval(interval);
    };
  }, [gameState]);

  // Main game loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let running = true;

    const render = () => {
      if (!running) return;
      const s = stateRef.current;

      if (gameState === "PLAYING") {
        // Player movement smoothing
        s.playerX += (s.targetX - s.playerX) * 0.22;

        // Drain battery over time (prevents idling)
        s.battery = Math.max(0, s.battery - 0.05);
        setBattery(Math.round(s.battery));

        if (s.battery <= 0) {
          gameAudio.playDrop();
          setGameOverReason("친환경 배터리 방전으로 추진력 상실!");
          setGameState("GAMEOVER");
          onFinish(s.score);
          return;
        }

        // Turbo handling
        const currentSpeed = s.turboTimer > 0 ? s.speed * 1.8 : s.speed;
        if (s.turboTimer > 0) {
          s.turboTimer--;
          if (s.turboTimer === 0) setIsTurbo(false);
        }

        s.distance += Math.round(currentSpeed * 0.3);
        s.score += s.turboTimer > 0 ? 3 : 1;
        setDistance(s.distance);
        setScore(s.score);

        // Gradually ramp baseline speed with distance
        s.speed = Math.min(11, 5 + s.distance * 0.003);

        // Spawn obstacles & collectibles
        const now = Date.now();
        if (now - s.lastSpawn > Math.max(450, 1100 - s.speed * 60)) {
          s.lastSpawn = now;
          // Spawn lane (occasionally target near player position to prevent stationary play)
          const laneX = Math.random() < 0.4
            ? Math.max(40, Math.min(s.width - 40, s.playerX + (Math.random() - 0.5) * 60))
            : Math.random() * (s.width - 100) + 50;

          if (Math.random() < 0.65) {
            // Spawn obstacle
            const types: ("reef" | "buoy" | "driftwood")[] = ["reef", "buoy", "driftwood"];
            const t = types[Math.floor(Math.random() * types.length)];
            const width = t === "reef" ? 44 : t === "driftwood" ? 48 : 28;
            const height = t === "reef" ? 34 : t === "driftwood" ? 22 : 28;
            s.obstacles.push({
              x: laneX,
              y: -50,
              width,
              height,
              type: t,
              speed: currentSpeed,
            });
          } else {
            // Spawn item
            const roll = Math.random();
            const itemType = roll < 0.5 ? "battery" : roll < 0.8 ? "anchor" : roll < 0.92 ? "shield" : "turbo";
            s.collectibles.push({
              x: laneX,
              y: -40,
              width: 28,
              height: 28,
              type: itemType,
              speed: currentSpeed,
            });
          }
        }

        // Spawn ship wake particles
        s.wakeParticles.push({
          x: s.playerX - 8 + (Math.random() - 0.5) * 6,
          y: s.playerY + s.playerHeight / 2 + 8,
          vx: -Math.random() * 1.5 - 0.5,
          vy: currentSpeed * 0.5,
          size: Math.random() * 5 + 3,
          alpha: 0.8,
          life: 0,
        });
        s.wakeParticles.push({
          x: s.playerX + 8 + (Math.random() - 0.5) * 6,
          y: s.playerY + s.playerHeight / 2 + 8,
          vx: Math.random() * 1.5 + 0.5,
          vy: currentSpeed * 0.5,
          size: Math.random() * 5 + 3,
          alpha: 0.8,
          life: 0,
        });
      }

      // Handle shake
      if (s.shake > 0) {
        s.shake *= 0.85;
        if (s.shake < 0.2) s.shake = 0;
      }

      ctx.save();
      ctx.clearRect(0, 0, s.width, s.height);

      if (s.shake > 0) {
        ctx.translate((Math.random() - 0.5) * s.shake, (Math.random() - 0.5) * s.shake);
      }

      // --- Deep Ocean Background with Flowing Water Waves ---
      const oceanGrad = ctx.createLinearGradient(0, 0, 0, s.height);
      oceanGrad.addColorStop(0, "#002B49");
      oceanGrad.addColorStop(0.5, "#004B7A");
      oceanGrad.addColorStop(1, "#006FA6");
      ctx.fillStyle = oceanGrad;
      ctx.fillRect(0, 0, s.width, s.height);

      // Water flow streaks
      const offset = (Date.now() * 0.3) % 40;
      ctx.fillStyle = "rgba(255, 255, 255, 0.08)";
      for (let y = -40 + offset; y < s.height; y += 40) {
        for (let x = 20; x < s.width; x += 90) {
          ctx.fillRect(x + Math.sin(y * 0.05) * 15, y, 40, 2);
        }
      }

      // Wake particles
      for (let i = s.wakeParticles.length - 1; i >= 0; i--) {
        const p = s.wakeParticles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.size *= 1.02;
        p.alpha -= 0.025;

        ctx.fillStyle = `rgba(255, 255, 255, ${Math.max(0, p.alpha)})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();

        if (p.alpha <= 0) s.wakeParticles.splice(i, 1);
      }

      // --- Draw Obstacles & Check Collisions ---
      for (let i = s.obstacles.length - 1; i >= 0; i--) {
        const obs = s.obstacles[i];
        if (gameState === "PLAYING") {
          obs.y += s.turboTimer > 0 ? s.speed * 1.8 : s.speed;
        }

        // Draw obstacle
        if (obs.type === "reef") {
          ctx.fillStyle = "#374151";
          ctx.beginPath();
          ctx.moveTo(obs.x, obs.y + obs.height);
          ctx.lineTo(obs.x + obs.width / 2, obs.y);
          ctx.lineTo(obs.x + obs.width, obs.y + obs.height);
          ctx.closePath();
          ctx.fill();
          // Rock highlights
          ctx.fillStyle = "#6B7280";
          ctx.fillRect(obs.x + 8, obs.y + 12, 10, 8);
        } else if (obs.type === "buoy") {
          ctx.fillStyle = "#EF4444";
          ctx.beginPath();
          ctx.arc(obs.x + obs.width / 2, obs.y + obs.height / 2, obs.width / 2, 0, Math.PI * 2);
          ctx.fill();
          // Flashing beacon light
          ctx.fillStyle = (Date.now() % 600 < 300) ? "#FBBF24" : "#FFFFFF";
          ctx.beginPath();
          ctx.arc(obs.x + obs.width / 2, obs.y + obs.height / 2 - 4, 4, 0, Math.PI * 2);
          ctx.fill();
        } else {
          // Driftwood
          ctx.fillStyle = "#78350F";
          ctx.fillRect(obs.x, obs.y, obs.width, obs.height);
          ctx.fillStyle = "#92400E";
          ctx.fillRect(obs.x + 6, obs.y + 3, obs.width - 12, obs.height - 6);
        }

        // Collision Check with Ship
        if (gameState === "PLAYING") {
          const hit =
            Math.abs((obs.x + obs.width / 2) - s.playerX) < (obs.width / 2 + s.playerWidth / 2 - 4) &&
            Math.abs((obs.y + obs.height / 2) - s.playerY) < (obs.height / 2 + s.playerHeight / 2 - 6);

          if (hit) {
            if (s.turboTimer > 0) {
              // Smashes through obstacle in turbo mode!
              s.obstacles.splice(i, 1);
              s.score += 100;
              gameAudio.playWhack(true);
              continue;
            } else if (s.hasShield) {
              // Absorbed by shield!
              s.hasShield = false;
              setHasShield(false);
              s.obstacles.splice(i, 1);
              s.shake = 10;
              gameAudio.playWhack(false);
              continue;
            } else {
              // Game Over Crash!
              s.shake = 20;
              gameAudio.playBomb();
              setGameState("GAMEOVER");
              onFinish(s.score);
              if (s.score >= 1500) {
                confetti({ particleCount: 70, spread: 80 });
              }
              break;
            }
          }
        }

        // Remove offscreen
        if (obs.y > s.height + 50) {
          s.obstacles.splice(i, 1);
        }
      }

      // --- Draw Collectibles & Check Pickups ---
      for (let i = s.collectibles.length - 1; i >= 0; i--) {
        const item = s.collectibles[i];
        if (gameState === "PLAYING") {
          item.y += s.turboTimer > 0 ? s.speed * 1.8 : s.speed;
        }

        ctx.save();
        ctx.translate(item.x + item.width / 2, item.y + item.height / 2);

        if (item.type === "battery") {
          // Green Eco Battery Core
          ctx.fillStyle = "#10B981";
          ctx.beginPath();
          ctx.roundRect(-10, -12, 20, 24, [4]);
          ctx.fill();
          ctx.fillStyle = "#FFFFFF";
          ctx.font = "bold 13px sans-serif";
          ctx.fillText("⚡", -6, 4);
        } else if (item.type === "anchor") {
          // Golden Anchor
          ctx.fillStyle = "#F59E0B";
          ctx.beginPath();
          ctx.arc(0, 0, 14, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = "#FFFFFF";
          ctx.font = "bold 13px sans-serif";
          ctx.fillText("⚓", -7, 4);
        } else if (item.type === "shield") {
          // Blue Shield
          ctx.fillStyle = "#3B82F6";
          ctx.beginPath();
          ctx.arc(0, 0, 14, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = "#FFFFFF";
          ctx.font = "bold 13px sans-serif";
          ctx.fillText("🛡️", -7, 4);
        } else {
          // Red Turbo Booster
          ctx.fillStyle = "#EF4444";
          ctx.beginPath();
          ctx.arc(0, 0, 14, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = "#FFFFFF";
          ctx.font = "bold 13px sans-serif";
          ctx.fillText("🚀", -7, 4);
        }
        ctx.restore();

        // Pickup detection
        if (gameState === "PLAYING") {
          const picked =
            Math.abs((item.x + item.width / 2) - s.playerX) < (item.width / 2 + s.playerWidth / 2 + 6) &&
            Math.abs((item.y + item.height / 2) - s.playerY) < (item.height / 2 + s.playerHeight / 2 + 6);

          if (picked) {
            if (item.type === "battery") {
              s.score += 50;
              s.battery = Math.min(100, s.battery + 28);
              setBattery(Math.round(s.battery));
              gameAudio.playPickup();
            } else if (item.type === "anchor") {
              s.score += 150;
              gameAudio.playPerfect(3);
            } else if (item.type === "shield") {
              s.hasShield = true;
              setHasShield(true);
              gameAudio.playPowerup();
            } else if (item.type === "turbo") {
              s.turboTimer = 200; // ~3.5 seconds
              setIsTurbo(true);
              gameAudio.playPowerup();
            }
            s.collectibles.splice(i, 1);
            continue;
          }
        }

        if (item.y > s.height + 40) {
          s.collectibles.splice(i, 1);
        }
      }

      // --- Draw Player Vessel (HD Hyundai LNG Carrier Vector) ---
      ctx.save();
      ctx.translate(s.playerX, s.playerY);

      // Turbo glow effect
      if (s.turboTimer > 0) {
        ctx.fillStyle = "rgba(239, 68, 68, 0.4)";
        ctx.beginPath();
        ctx.ellipse(0, 0, s.playerWidth + 12, s.playerHeight + 10, 0, 0, Math.PI * 2);
        ctx.fill();
      }

      // Shield bubble
      if (s.hasShield) {
        ctx.strokeStyle = "#60A5FA";
        ctx.lineWidth = 3;
        ctx.fillStyle = "rgba(96, 165, 250, 0.25)";
        ctx.beginPath();
        ctx.arc(0, 0, s.playerHeight * 0.65, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }

      // Ship Hull Outline
      ctx.fillStyle = "#003876"; // HD Blue Hull
      ctx.beginPath();
      ctx.moveTo(0, -s.playerHeight / 2); // Bow
      ctx.bezierCurveTo(
        s.playerWidth / 2, -s.playerHeight * 0.3,
        s.playerWidth / 2, s.playerHeight * 0.3,
        s.playerWidth * 0.4, s.playerHeight / 2
      );
      ctx.lineTo(-s.playerWidth * 0.4, s.playerHeight / 2);
      ctx.bezierCurveTo(
        -s.playerWidth / 2, s.playerHeight * 0.3,
        -s.playerWidth / 2, -s.playerHeight * 0.3,
        0, -s.playerHeight / 2
      );
      ctx.fill();

      // Deck deckhouse
      ctx.fillStyle = "#F8FAFC";
      ctx.fillRect(-s.playerWidth * 0.28, s.playerHeight * 0.12, s.playerWidth * 0.56, 16);

      // LNG Membrane Tanks (3 Spherical Dome Silos)
      ctx.fillStyle = "#00A352"; // HD Green Eco Tanks
      for (let ty = -s.playerHeight * 0.22; ty <= s.playerHeight * 0.05; ty += 14) {
        ctx.beginPath();
        ctx.ellipse(0, ty, s.playerWidth * 0.28, 5.5, 0, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
      ctx.restore(); // Restore shake

      animFrameRef.current = requestAnimationFrame(render);
    };

    animFrameRef.current = requestAnimationFrame(render);
    return () => {
      running = false;
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [gameState]);

  return (
    <div className="w-full max-w-4xl mx-auto flex flex-col items-center select-none font-hd">
      {/* Top Header */}
      <div className="w-full bg-slate-900 border border-slate-800 text-white px-4 py-2.5 rounded-xl flex flex-wrap items-center justify-between gap-3 shadow-md mb-2">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-md shadow-blue-500/20 shrink-0">
            <Compass className="w-4 h-4 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm sm:text-base font-bold text-white">영암만 쾌속 항해 (Ocean Voyager)</h3>
              {hasShield && (
                <span className="text-[10px] sm:text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/30 flex items-center gap-1 animate-pulse">
                  <Shield className="w-3 h-3" /> 방어막
                </span>
              )}
              {isTurbo && (
                <span className="text-[10px] sm:text-xs font-semibold px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-400 border border-rose-500/30 flex items-center gap-1 animate-bounce">
                  <Zap className="w-3 h-3 fill-current" /> 터보
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400 font-normal hidden sm:block">
              암초를 회피하고 친환경 배터리와 황금 닻을 수집하며 영암만을 고속 항주하세요.
            </p>
          </div>
        </div>

        {/* Live Gauges */}
        <div className="flex items-center gap-2 sm:gap-3 text-xs font-semibold">
          <div className="bg-slate-800/80 px-2.5 py-1 rounded-lg border border-slate-700/60 text-center">
            <span className="text-slate-400 block text-[9px] font-medium">항해 거리</span>
            <span className="text-xs sm:text-sm font-bold text-sky-400 tabular-nums">
              {distance.toLocaleString()} NM
            </span>
          </div>

          <div className="bg-slate-800/80 px-2.5 py-1 rounded-lg border border-slate-700/60 text-center">
            <span className="text-slate-400 block text-[9px] font-medium">추진 배터리</span>
            <span className={`text-xs sm:text-sm font-bold tabular-nums ${battery < 25 ? "text-rose-400 animate-pulse" : "text-emerald-400"}`}>
              {battery}%
            </span>
          </div>

          <div className="bg-slate-800/80 px-2.5 py-1 rounded-lg border border-slate-700/60 text-center">
            <span className="text-slate-400 block text-[9px] font-medium">항해 스코어</span>
            <span className="text-xs sm:text-sm font-bold text-emerald-400 tabular-nums">
              {score.toLocaleString()}점
            </span>
          </div>

          <button
            onClick={toggleSound}
            className="p-1.5 sm:p-2 bg-slate-800 hover:bg-slate-700 rounded-lg border border-slate-700 text-slate-300 transition-all active:scale-95 shrink-0"
            title={isMuted ? "소리 켜기" : "음소거"}
          >
            {isMuted ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4 text-emerald-400" />}
          </button>
        </div>
      </div>

      {/* Canvas Container with Pointer Controls */}
      <div
        onPointerMove={handlePointerMove}
        className="w-full relative rounded-xl overflow-hidden border border-slate-800 shadow-xl bg-slate-950 h-[340px] sm:h-[370px] md:h-[380px] flex items-center justify-center cursor-crosshair touch-none"
      >
        <canvas ref={canvasRef} width={540} height={520} className="w-full h-full object-cover block" />

        {/* START OVERLAY */}
        {gameState === "READY" && (
          <div className="absolute inset-0 bg-slate-950/85 backdrop-blur-md flex flex-col items-center justify-center p-4 sm:p-6 text-center text-white z-20">
            <div className="w-12 h-12 rounded-xl bg-blue-500/20 border border-blue-500/40 flex items-center justify-center mb-3 text-blue-400 shadow-md">
              <Compass className="w-6 h-6" />
            </div>
            <h2 className="text-base sm:text-lg md:text-xl font-bold text-white mb-1.5">영암만 쾌속 항해</h2>
            <p className="text-slate-300 text-xs sm:text-[13px] max-w-sm mb-4 leading-relaxed font-normal">
              가만히 있으면 배터리가 방전되어 표류합니다!<br />
              암초와 부표를 피하고 <span className="text-emerald-400 font-bold">⚡친환경 배터리</span>와 <span className="text-amber-400 font-bold">⚓황금 닻</span>을 수집하세요!
            </p>
            <button
              onClick={startGame}
              className="px-6 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-xs sm:text-sm rounded-xl shadow-md active:scale-95 transition-all flex items-center gap-2"
            >
              <Play className="w-4 h-4 fill-current" />
              출항하기
            </button>
          </div>
        )}

        {/* GAME OVER OVERLAY */}
        {gameState === "GAMEOVER" && (
          <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-md flex flex-col items-center justify-center p-4 sm:p-6 text-center text-white z-20 animate-in fade-in duration-200">
            <div className="w-12 h-12 rounded-xl bg-rose-500/20 border border-rose-500/40 flex items-center justify-center mb-2.5 text-rose-400">
              <Compass className="w-6 h-6" />
            </div>
            <h3 className="text-base sm:text-lg md:text-xl font-bold text-white mb-1">시운전 항해 종료</h3>
            <p className="text-slate-300 text-xs sm:text-[13px] mb-3 max-w-sm font-normal">{gameOverReason || "장애물에 충돌했습니다!"}</p>

            <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 w-full max-w-xs mb-4 shadow-md space-y-1.5">
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-400">최종 점수</span>
                <span className="font-bold text-emerald-400 tabular-nums">{score.toLocaleString()}점</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-400">항해 거리</span>
                <span className="font-bold text-sky-400 tabular-nums">{distance.toLocaleString()} NM</span>
              </div>
            </div>

            <button
              onClick={startGame}
              className="px-6 py-2.5 bg-gradient-to-r from-sky-600 to-blue-600 hover:from-sky-500 hover:to-blue-500 text-white font-bold text-xs sm:text-sm rounded-xl shadow-md active:scale-95 transition-all flex items-center gap-2"
            >
              <RotateCcw className="w-4 h-4" />
              다시 출항하기
            </button>
          </div>
        )}
      </div>

      {/* Footer Instructions */}
      <div className="w-full mt-2 bg-slate-900/90 border border-slate-800 p-2 sm:p-2.5 rounded-xl text-[11px] text-slate-400 flex items-center justify-between">
        <span>💡 조작법: 마우스 좌우 이동 / 좌우 방향키 (← →)</span>
        <span className="text-slate-500 hidden sm:inline">🚀 터보 부스터 획득 시 전방 무적 돌파</span>
      </div>
    </div>
  );
}
