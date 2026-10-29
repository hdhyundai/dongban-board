import React, { useEffect, useRef, useState } from "react";
import { Play, RotateCcw, Volume2, VolumeX, Compass, Zap, Gauge, ArrowLeft, ArrowRight, Award, ShieldAlert } from "lucide-react";
import confetti from "canvas-confetti";
import { gameAudio } from "../../lib/gameSounds";

interface OceanRunnerGameProps {
  onFinish: (score: number) => void;
}

interface Obstacle {
  id: number;
  x: number;
  y: number; // Y moves downward in top-down scrolling
  width: number;
  height: number;
  type: "reef" | "container" | "gate" | "fuel";
  passed: boolean;
  collected?: boolean;
}

interface WakeParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  alpha: number;
}

export default function OceanRunnerGame({ onFinish }: OceanRunnerGameProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [gameState, setGameState] = useState<"READY" | "PLAYING" | "GAMEOVER">("READY");
  const [score, setScore] = useState(0);
  const [speedKnots, setSpeedKnots] = useState(18);
  const [distanceMeters, setDistanceMeters] = useState(0);
  const [shipHullLife, setShipHullLife] = useState(3);
  const [isMuted, setIsMuted] = useState(gameAudio.getMuted());
  const [ecoBoostTime, setEcoBoostTime] = useState(0);

  const keysRef = useRef<{ left: boolean; right: boolean; boost: boolean }>({
    left: false,
    right: false,
    boost: false,
  });

  const stateRef = useRef({
    isPlaying: false,
    score: 0,
    distance: 0,
    speed: 18, // knots
    shipX: 400,
    shipTargetX: 400,
    shipY: 420,
    shipAngle: 0,
    obstacles: [] as Obstacle[],
    nextObstacleY: -100,
    wakeParticles: [] as WakeParticle[],
    hullLife: 3,
    ecoBoost: 0,
    combo: 0,
    screenW: 800,
    screenH: 520,
    waterOffset: 0,
    lastTime: performance.now(),
  });

  const toggleSound = (e: React.MouseEvent) => {
    e.stopPropagation();
    const muted = gameAudio.toggleMute();
    setIsMuted(muted);
  };

  const startGame = () => {
    stateRef.current.isPlaying = true;
    stateRef.current.score = 0;
    stateRef.current.distance = 0;
    stateRef.current.speed = 18;
    stateRef.current.shipX = stateRef.current.screenW / 2;
    stateRef.current.shipTargetX = stateRef.current.screenW / 2;
    stateRef.current.shipY = stateRef.current.screenH - 100;
    stateRef.current.shipAngle = 0;
    stateRef.current.obstacles = [];
    stateRef.current.nextObstacleY = -120;
    stateRef.current.wakeParticles = [];
    stateRef.current.hullLife = 3;
    stateRef.current.ecoBoost = 0;
    stateRef.current.combo = 0;
    stateRef.current.lastTime = performance.now();

    setGameState("PLAYING");
    setScore(0);
    setDistanceMeters(0);
    setSpeedKnots(18);
    setShipHullLife(3);
    setEcoBoostTime(0);

    gameAudio.playStart();
  };

  const handleGameOver = () => {
    if (!stateRef.current.isPlaying) return;
    stateRef.current.isPlaying = false;
    const finalScore = Math.floor(stateRef.current.score);

    setGameState("GAMEOVER");
    setScore(finalScore);

    if (finalScore >= 1200) {
      gameAudio.playVictory();
      confetti({ particleCount: 70, spread: 60, origin: { y: 0.6 } });
    } else {
      gameAudio.playFailure();
    }

    onFinish(finalScore);
  };

  // Keyboard controls
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") keysRef.current.left = true;
      if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") keysRef.current.right = true;
      if (e.key === " " || e.key === "ArrowUp" || e.key === "w" || e.key === "W") {
        keysRef.current.boost = true;
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") keysRef.current.left = false;
      if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") keysRef.current.right = false;
      if (e.key === " " || e.key === "ArrowUp" || e.key === "w" || e.key === "W") {
        keysRef.current.boost = false;
      }
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  // Main 2D Canvas Loop & Resize
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = mountRef.current;
    if (!canvas || !container) return;

    let animId = 0;

    const resize = () => {
      const rect = container.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.max(320, Math.floor(rect.width));
      const h = Math.max(280, Math.floor(rect.height));

      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;

      stateRef.current.screenW = w;
      stateRef.current.screenH = h;
      if (!stateRef.current.isPlaying) {
        stateRef.current.shipX = w / 2;
        stateRef.current.shipTargetX = w / 2;
        stateRef.current.shipY = h - 90;
      }
    };

    const ro = new ResizeObserver(() => resize());
    ro.observe(container);
    resize();

    const spawnObstacle = () => {
      const w = stateRef.current.screenW;
      const types: Array<"reef" | "container" | "gate" | "fuel"> = ["container", "reef", "gate", "fuel"];
      const roll = Math.random();
      let type: "reef" | "container" | "gate" | "fuel" = "container";
      if (roll < 0.35) type = "container";
      else if (roll < 0.65) type = "reef";
      else if (roll < 0.85) type = "gate";
      else type = "fuel";

      const margin = 70;
      const x = margin + Math.random() * (w - margin * 2);

      stateRef.current.obstacles.push({
        id: Date.now() + Math.random(),
        x,
        y: -60,
        width: type === "gate" ? 140 : type === "fuel" ? 36 : 48,
        height: type === "gate" ? 24 : type === "fuel" ? 36 : 48,
        type,
        passed: false,
        collected: false,
      });

      // Frequency scales with speed
      const gap = Math.max(140, 240 - stateRef.current.speed * 3);
      stateRef.current.nextObstacleY = -gap;
    };

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

      // Update gameplay physics if PLAYING
      if (stateRef.current.isPlaying) {
        // Boost mechanic
        if (keysRef.current.boost) {
          stateRef.current.ecoBoost = Math.min(5, stateRef.current.ecoBoost + dt * 2);
        } else {
          stateRef.current.ecoBoost = Math.max(0, stateRef.current.ecoBoost - dt * 2.5);
        }

        const targetSpeed = 16 + (stateRef.current.ecoBoost > 0 ? 12 : 0) + (stateRef.current.distance / 1200);
        stateRef.current.speed += (targetSpeed - stateRef.current.speed) * dt * 2;
        const currentSpeed = stateRef.current.speed;

        // Steering
        const steerSpeed = (180 + currentSpeed * 4) * dt;
        let targetAngle = 0;
        if (keysRef.current.left) {
          stateRef.current.shipX -= steerSpeed;
          targetAngle = -0.16;
        }
        if (keysRef.current.right) {
          stateRef.current.shipX += steerSpeed;
          targetAngle = 0.16;
        }

        stateRef.current.shipAngle += (targetAngle - stateRef.current.shipAngle) * dt * 10;
        stateRef.current.shipX = Math.max(45, Math.min(w - 45, stateRef.current.shipX));
        stateRef.current.shipY = h - 90;

        // Forward motion
        const scrollDist = currentSpeed * 18 * dt;
        stateRef.current.waterOffset = (stateRef.current.waterOffset + scrollDist) % 80;
        stateRef.current.distance += scrollDist * 0.4;

        // Wake particles
        if (Math.random() < 0.7) {
          stateRef.current.wakeParticles.push({
            x: stateRef.current.shipX + (Math.random() - 0.5) * 12,
            y: stateRef.current.shipY + 36,
            vx: (Math.random() - 0.5) * 15,
            vy: scrollDist * 0.4,
            radius: 3 + Math.random() * 4,
            alpha: 0.8,
          });
        }

        // Spawn obstacles
        stateRef.current.nextObstacleY += scrollDist;
        if (stateRef.current.nextObstacleY >= 0) {
          spawnObstacle();
        }

        // Update obstacles & collisions
        const shipBox = {
          x: stateRef.current.shipX - 18,
          y: stateRef.current.shipY - 32,
          w: 36,
          h: 68,
        };

        const activeObstacles: Obstacle[] = [];
        for (const obs of stateRef.current.obstacles) {
          obs.y += scrollDist;

          // Gate passing logic
          if (obs.type === "gate" && !obs.passed && obs.y > shipBox.y) {
            obs.passed = true;
            const distToCenter = Math.abs(stateRef.current.shipX - obs.x);
            if (distToCenter < obs.width / 2) {
              // Scored gate!
              stateRef.current.combo++;
              const pts = 250 + stateRef.current.combo * 50;
              stateRef.current.score += pts;
              gameAudio.playCombo(stateRef.current.combo);
            }
          }

          // Fuel collection
          if (obs.type === "fuel" && !obs.collected) {
            const dist = Math.hypot(stateRef.current.shipX - obs.x, stateRef.current.shipY - obs.y);
            if (dist < 42) {
              obs.collected = true;
              stateRef.current.score += 200;
              stateRef.current.ecoBoost = 4;
              gameAudio.playPop();
            }
          }

          // Obstacle collision (reef / container)
          if ((obs.type === "container" || obs.type === "reef") && !obs.passed) {
            const collision =
              shipBox.x < obs.x + obs.width / 2 &&
              shipBox.x + shipBox.w > obs.x - obs.width / 2 &&
              shipBox.y < obs.y + obs.height / 2 &&
              shipBox.y + shipBox.h > obs.y - obs.height / 2;

            if (collision) {
              obs.passed = true;
              stateRef.current.hullLife -= 1;
              stateRef.current.speed = Math.max(10, stateRef.current.speed - 8);
              stateRef.current.combo = 0;
              gameAudio.playError();

              if (stateRef.current.hullLife <= 0) {
                handleGameOver();
                break;
              }
            }
          }

          if (obs.y < h + 100 && !obs.collected) {
            activeObstacles.push(obs);
          }
        }
        stateRef.current.obstacles = activeObstacles;

        // Continuous score for distance
        stateRef.current.score += dt * currentSpeed * 1.5;

        // Sync states for React UI
        setScore(Math.floor(stateRef.current.score));
        setDistanceMeters(Math.floor(stateRef.current.distance));
        setSpeedKnots(Math.floor(currentSpeed));
        setShipHullLife(stateRef.current.hullLife);
        setEcoBoostTime(Math.ceil(stateRef.current.ecoBoost));
      }

      // --- RENDERING ---
      // 1. Deep Ocean Background
      const oceanGrad = ctx.createLinearGradient(0, 0, 0, h);
      oceanGrad.addColorStop(0, "#082f49"); // deep navy
      oceanGrad.addColorStop(1, "#0284c7"); // bright azure
      ctx.fillStyle = oceanGrad;
      ctx.fillRect(0, 0, w, h);

      // Sea wave ripples
      ctx.strokeStyle = "rgba(255, 255, 255, 0.12)";
      ctx.lineWidth = 1.5;
      const waveSpacing = 36;
      for (let y = -waveSpacing + stateRef.current.waterOffset; y < h + waveSpacing; y += waveSpacing) {
        ctx.beginPath();
        for (let x = 0; x <= w; x += 30) {
          const waveY = y + Math.sin((x + time * 0.08) * 0.04) * 4;
          if (x === 0) ctx.moveTo(x, waveY);
          else ctx.lineTo(x, waveY);
        }
        ctx.stroke();
      }

      // 2. Wake Particles
      const nextParticles: WakeParticle[] = [];
      for (const p of stateRef.current.wakeParticles) {
        p.y += p.vy;
        p.x += p.vx;
        p.radius += 0.15;
        p.alpha -= 0.02;

        if (p.alpha > 0) {
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(255, 255, 255, ${p.alpha * 0.7})`;
          ctx.fill();
          nextParticles.push(p);
        }
      }
      stateRef.current.wakeParticles = nextParticles;

      // 3. Render Obstacles
      for (const obs of stateRef.current.obstacles) {
        ctx.save();
        ctx.translate(obs.x, obs.y);

        if (obs.type === "container") {
          // Floating 40ft Shipping Container
          ctx.fillStyle = "#e11d48"; // vibrant shipping red
          ctx.fillRect(-obs.width / 2, -obs.height / 2, obs.width, obs.height);
          ctx.strokeStyle = "#881337";
          ctx.lineWidth = 2;
          ctx.strokeRect(-obs.width / 2, -obs.height / 2, obs.width, obs.height);

          // Container corrugated lines
          ctx.strokeStyle = "rgba(255, 255, 255, 0.4)";
          ctx.lineWidth = 1;
          for (let cx = -obs.width / 2 + 8; cx < obs.width / 2; cx += 8) {
            ctx.beginPath();
            ctx.moveTo(cx, -obs.height / 2 + 2);
            ctx.lineTo(cx, obs.height / 2 - 2);
            ctx.stroke();
          }

          // Warning hazard tag
          ctx.fillStyle = "#fef08a";
          ctx.fillRect(-8, -6, 16, 12);
        } else if (obs.type === "reef") {
          // Dangerous Submerged Reef Shoal
          ctx.fillStyle = "#334155";
          ctx.beginPath();
          ctx.moveTo(-obs.width / 2, 0);
          ctx.lineTo(-obs.width / 4, -obs.height / 2);
          ctx.lineTo(obs.width / 4, -obs.height / 3);
          ctx.lineTo(obs.width / 2, 0);
          ctx.lineTo(obs.width / 3, obs.height / 2);
          ctx.lineTo(-obs.width / 3, obs.height / 2);
          ctx.closePath();
          ctx.fill();

          ctx.strokeStyle = "#64748b";
          ctx.lineWidth = 2;
          ctx.stroke();

          // Reef foam
          ctx.strokeStyle = "rgba(255, 255, 255, 0.5)";
          ctx.strokeRect(-obs.width / 2 - 4, -obs.height / 2 - 4, obs.width + 8, obs.height + 8);
        } else if (obs.type === "gate") {
          // Speed Radar Measurement Gate (2 Green Navigation Buoys + Laser line)
          const halfSpan = obs.width / 2;

          // Connecting Laser Gate
          ctx.strokeStyle = obs.passed ? "rgba(74, 222, 128, 0.25)" : "rgba(74, 222, 128, 0.85)";
          ctx.lineWidth = 3;
          ctx.setLineDash([6, 6]);
          ctx.beginPath();
          ctx.moveTo(-halfSpan, 0);
          ctx.lineTo(halfSpan, 0);
          ctx.stroke();
          ctx.setLineDash([]);

          // Buoy Left
          ctx.fillStyle = "#22c55e";
          ctx.beginPath();
          ctx.arc(-halfSpan, 0, 9, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = "#ffffff";
          ctx.lineWidth = 2;
          ctx.stroke();

          // Buoy Right
          ctx.beginPath();
          ctx.arc(halfSpan, 0, 9, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();

          // Gate Label
          ctx.fillStyle = "#4ade80";
          ctx.font = "bold 10px monospace";
          ctx.textAlign = "center";
          ctx.fillText("SPEED GATE", 0, -8);
        } else if (obs.type === "fuel") {
          // Eco-Fuel Canister
          ctx.fillStyle = "#10b981";
          ctx.beginPath();
          ctx.arc(0, 0, 14, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = "#ffffff";
          ctx.lineWidth = 2.5;
          ctx.stroke();

          // Zap icon symbol
          ctx.fillStyle = "#ffffff";
          ctx.beginPath();
          ctx.moveTo(-2, -7);
          ctx.lineTo(4, -1);
          ctx.lineTo(0, 0);
          ctx.lineTo(3, 7);
          ctx.lineTo(-4, 1);
          ctx.lineTo(-1, 0);
          ctx.closePath();
          ctx.fill();
        }

        ctx.restore();
      }

      // 4. Render Ship (VLCC Container/Tanker)
      ctx.save();
      ctx.translate(stateRef.current.shipX, stateRef.current.shipY);
      ctx.rotate(stateRef.current.shipAngle);

      // Ship Hull Drop Shadow
      ctx.fillStyle = "rgba(0, 0, 0, 0.35)";
      ctx.beginPath();
      ctx.roundRect(-16, -30, 32, 66, [14, 14, 4, 4]);
      ctx.fill();

      // Outer Hull (HD Deep Navy / Steel Grey)
      ctx.fillStyle = "#0f172a";
      ctx.beginPath();
      ctx.moveTo(0, -36); // bow
      ctx.lineTo(16, -18);
      ctx.lineTo(16, 28);
      ctx.lineTo(-16, 28);
      ctx.lineTo(-16, -18);
      ctx.closePath();
      ctx.fill();

      // Hull border & bulbous bow accent
      ctx.strokeStyle = "#38bdf8";
      ctx.lineWidth = 2;
      ctx.stroke();

      // Deck Main Plate
      ctx.fillStyle = "#0284c7";
      ctx.fillRect(-12, -18, 24, 40);

      // Deck Cargo Hatch Covers (HD Green / Orange blocks)
      ctx.fillStyle = "#f97316";
      ctx.fillRect(-9, -14, 18, 8);
      ctx.fillRect(-9, -2, 18, 8);
      ctx.fillRect(-9, 10, 18, 8);

      // Bridge Deckhouse (aft)
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(-10, 20, 20, 7);
      ctx.fillStyle = "#0284c7";
      ctx.fillRect(-8, 22, 16, 2);

      // Eco Turbo Glow Effect
      if (stateRef.current.ecoBoost > 0) {
        ctx.strokeStyle = "rgba(56, 189, 248, 0.8)";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(0, 0, 28, 0, Math.PI * 2);
        ctx.stroke();
      }

      ctx.restore();

      ctx.restore(); // Restore DPR scaling

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animId);
      ro.disconnect();
    };
  }, []);

  return (
    <div className="relative w-full h-full flex flex-col bg-slate-950 font-hd select-none overflow-hidden text-white">
      {/* Header HUD */}
      <div className="flex items-center justify-between px-3 py-2 bg-slate-900/95 border-b border-slate-800 shrink-0 z-10 backdrop-blur-md">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-indigo-500/20 text-indigo-400 rounded-lg border border-indigo-500/30">
            <Compass className="w-4 h-4" />
          </div>
          <div>
            <div className="text-xs font-black text-slate-100 flex items-center gap-1.5">
              영암만 Sea Trial 시운전
              <span className="text-[10px] px-1.5 py-0.2 bg-indigo-500/20 text-indigo-300 rounded font-bold">
                쾌속 항해
              </span>
            </div>
            <div className="text-[10px] text-slate-400">
              컨테이너·암초 회피 & 스피드 레이더 게이트 통과
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-4">
          {/* Speed */}
          <div className="flex items-center gap-1 bg-slate-800/80 px-2 py-1 rounded-md border border-slate-700">
            <Gauge className="w-3.5 h-3.5 text-cyan-400" />
            <span className="text-xs font-black text-cyan-300">{speedKnots} KTS</span>
          </div>

          {/* Distance */}
          <div className="hidden sm:flex items-center gap-1 bg-slate-800/80 px-2 py-1 rounded-md border border-slate-700">
            <span className="text-[10px] text-slate-400 font-bold">항행:</span>
            <span className="text-xs font-black text-emerald-300">{distanceMeters}m</span>
          </div>

          {/* Hull Life */}
          <div className="flex items-center gap-1 bg-slate-800/80 px-2 py-1 rounded-md border border-slate-700">
            <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />
            <div className="flex gap-1">
              {[1, 2, 3].map((heart) => (
                <div
                  key={heart}
                  className={`w-2 h-3 rounded-xs ${
                    heart <= shipHullLife ? "bg-rose-500 shadow-xs shadow-rose-500/50" : "bg-slate-700"
                  }`}
                />
              ))}
            </div>
          </div>

          {/* Score */}
          <div className="flex items-center gap-1.5 bg-indigo-950/80 px-2.5 py-1 rounded-md border border-indigo-700">
            <Award className="w-3.5 h-3.5 text-amber-400" />
            <span className="text-xs sm:text-sm font-black text-amber-300">
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

      {/* Main Canvas Container (100% Flex, responsive fit) */}
      <div ref={mountRef} className="relative flex-1 w-full min-h-0 overflow-hidden bg-slate-900">
        <canvas ref={canvasRef} className="absolute inset-0 block w-full h-full" />

        {/* READY Overlay */}
        {gameState === "READY" && (
          <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm flex flex-col items-center justify-center p-4 text-center z-20">
            <div className="w-14 h-14 rounded-2xl bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center mb-3 text-indigo-400 shadow-lg">
              <Compass className="w-8 h-8" />
            </div>
            <h3 className="text-lg sm:text-xl font-black text-white mb-2">
              영암만 Sea Trial 실해역 시운전
            </h3>
            <p className="text-xs sm:text-sm text-slate-300 max-w-md mb-4 leading-relaxed">
              신조선 VLCC의 최고 속력 테스트! 부유 컨테이너와 암초를 날렵하게 피하고,
              녹색 스피드 측정 게이트를 정중앙으로 통과하여 연속 콤보 보너스를 획득하세요.
            </p>

            <div className="flex flex-wrap items-center justify-center gap-3 text-xs text-slate-400 mb-6 bg-slate-900/90 px-4 py-2.5 rounded-xl border border-slate-800">
              <div className="flex items-center gap-1">
                <span className="px-1.5 py-0.5 bg-slate-800 rounded font-mono font-bold text-slate-200">
                  ← / →
                </span>
                <span>조타 방향키</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="px-1.5 py-0.5 bg-slate-800 rounded font-mono font-bold text-slate-200">
                  스페이스바
                </span>
                <span>터보 가속</span>
              </div>
            </div>

            <button
              onClick={startGame}
              className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white font-black text-sm rounded-xl shadow-lg shadow-indigo-600/30 transition-all flex items-center gap-2"
            >
              <Play className="w-4 h-4 fill-white" />
              시운전 출항하기
            </button>
          </div>
        )}

        {/* GAMEOVER Overlay */}
        {gameState === "GAMEOVER" && (
          <div className="absolute inset-0 bg-slate-950/85 backdrop-blur-md flex flex-col items-center justify-center p-4 text-center z-20 animate-in fade-in zoom-in-95">
            <div className="w-14 h-14 rounded-2xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center mb-2 text-amber-400">
              <Award className="w-8 h-8" />
            </div>
            <h3 className="text-lg sm:text-xl font-black text-white mb-1">
              시운전 작전 종료
            </h3>
            <div className="text-2xl sm:text-3xl font-black text-amber-300 mb-2">
              최종 점수: {score.toLocaleString()}점
            </div>
            <p className="text-xs text-slate-300 max-w-sm mb-5">
              항행 거리: <span className="font-bold text-emerald-400">{distanceMeters}m</span> |
              월간 최고 기록에 등록되었습니다.
            </p>

            <button
              onClick={startGame}
              className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white font-black text-sm rounded-xl shadow-lg shadow-indigo-600/30 transition-all flex items-center gap-2"
            >
              <RotateCcw className="w-4 h-4" />
              다시 출항하기
            </button>
          </div>
        )}
      </div>

      {/* On-screen Mobile/Touch Controls */}
      <div className="flex items-center justify-between px-3 py-2 bg-slate-900 border-t border-slate-800 shrink-0 z-10 gap-2">
        <div className="flex gap-2">
          <button
            onPointerDown={() => (keysRef.current.left = true)}
            onPointerUp={() => (keysRef.current.left = false)}
            onPointerLeave={() => (keysRef.current.left = false)}
            className="w-12 h-10 bg-slate-800 active:bg-slate-700 hover:bg-slate-750 border border-slate-700 rounded-lg flex items-center justify-center text-slate-300 active:scale-95 transition-transform"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <button
            onPointerDown={() => (keysRef.current.right = true)}
            onPointerUp={() => (keysRef.current.right = false)}
            onPointerLeave={() => (keysRef.current.right = false)}
            className="w-12 h-10 bg-slate-800 active:bg-slate-700 hover:bg-slate-750 border border-slate-700 rounded-lg flex items-center justify-center text-slate-300 active:scale-95 transition-transform"
          >
            <ArrowRight className="w-5 h-5" />
          </button>
        </div>

        <div className="text-center text-[11px] text-slate-400 hidden sm:block">
          키보드 [A/D] 또는 방향키로 조타 · [Space] 에코 터보 부스터
        </div>

        <button
          onPointerDown={() => (keysRef.current.boost = true)}
          onPointerUp={() => (keysRef.current.boost = false)}
          onPointerLeave={() => (keysRef.current.boost = false)}
          className="px-4 h-10 bg-cyan-600 active:bg-cyan-500 hover:bg-cyan-550 border border-cyan-500 rounded-lg flex items-center gap-1.5 text-white font-black text-xs active:scale-95 transition-transform"
        >
          <Zap className="w-4 h-4 fill-white" />
          터보 부스터 {ecoBoostTime > 0 ? `(${ecoBoostTime}s)` : ""}
        </button>
      </div>
    </div>
  );
}
