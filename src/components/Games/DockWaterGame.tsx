import React, { useState, useEffect, useRef } from "react";
import { Play, RotateCcw, Volume2, VolumeX, Waves, AlertTriangle, ShieldCheck, Sparkles, Droplets, Gauge } from "lucide-react";
import confetti from "canvas-confetti";
import { gameAudio } from "../../lib/gameSounds";

interface DockWaterGameProps {
  onFinish: (score: number) => void;
}

export default function DockWaterGame({ onFinish }: DockWaterGameProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [success, setSuccess] = useState(false);
  const [score, setScore] = useState(0);
  const [waterLevel, setWaterLevel] = useState(0); // 0 to 100%
  const [shipAngle, setShipAngle] = useState(0); // degrees tilt (-5 to +5)
  const [bowValve, setBowValve] = useState(false); // 선수 주수문
  const [sternValve, setSternValve] = useState(false); // 선미 주수문
  const [portPump, setPortPump] = useState(false); // 좌현 배수/밸러스트
  const [starboardPump, setStarboardPump] = useState(false); // 우현 배수/밸러스트
  const [phase, setPhase] = useState<1 | 2 | 3>(1); // 1: 선저 주수, 2: 기주 분리(Float-off), 3: 도크 개방
  const [isMuted, setIsMuted] = useState(gameAudio.getMuted());
  const [warningMsg, setWarningMsg] = useState("");

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stateRef = useRef({
    waterLevel: 0,
    angle: 0,
    angularVelocity: 0,
    bowValve: false,
    sternValve: false,
    portPump: false,
    starboardPump: false,
    score: 0,
    timeElapsed: 0,
    liftOffAnnounced: false,
    waterParticles: [] as Array<{ x: number; y: number; vx: number; vy: number; life: number; color: string }>,
  });

  const toggleSound = () => {
    const muted = gameAudio.toggleMute();
    setIsMuted(muted);
  };

  const startGame = () => {
    gameAudio.playClick();
    gameAudio.playValveTurn();
    setIsPlaying(true);
    setGameOver(false);
    setSuccess(false);
    setScore(0);
    setWaterLevel(0);
    setShipAngle(0);
    setPhase(1);

    // CRITICAL: All valves start CLOSED so sitting still does NOT auto-complete the game!
    setBowValve(false);
    setSternValve(false);
    setPortPump(false);
    setStarboardPump(false);
    setWarningMsg("");

    stateRef.current = {
      waterLevel: 0,
      angle: 0,
      angularVelocity: 0,
      bowValve: false,
      sternValve: false,
      portPump: false,
      starboardPump: false,
      score: 0,
      timeElapsed: 0,
      liftOffAnnounced: false,
      waterParticles: [],
    };
  };

  // Toggle individual valve controls
  const toggleBow = () => {
    if (!isPlaying || gameOver || success) return;
    gameAudio.playValveTurn();
    setBowValve((prev) => {
      stateRef.current.bowValve = !prev;
      return !prev;
    });
  };

  const toggleStern = () => {
    if (!isPlaying || gameOver || success) return;
    gameAudio.playValveTurn();
    setSternValve((prev) => {
      stateRef.current.sternValve = !prev;
      return !prev;
    });
  };

  const togglePort = () => {
    if (!isPlaying || gameOver || success) return;
    gameAudio.playWaterRush();
    setPortPump((prev) => {
      stateRef.current.portPump = !prev;
      return !prev;
    });
  };

  const toggleStarboard = () => {
    if (!isPlaying || gameOver || success) return;
    gameAudio.playWaterRush();
    setStarboardPump((prev) => {
      stateRef.current.starboardPump = !prev;
      return !prev;
    });
  };

  // Keyboard shortcut handlers
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isPlaying || gameOver || success) return;
      if (e.key === "1") toggleBow();
      else if (e.key === "2") toggleStern();
      else if (e.key === "3") togglePort();
      else if (e.key === "4") toggleStarboard();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isPlaying, gameOver, success]);

  // Main simulation loop
  useEffect(() => {
    if (!isPlaying || gameOver || success) return;

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

    let animId: number;
    let lastTime = performance.now();

    const loop = (now: number) => {
      const dt = Math.min((now - lastTime) / 1000, 0.06);
      lastTime = now;
      const st = stateRef.current;
      st.timeElapsed += dt;

      // 1. Calculate Water Inflow
      let inflowRate = 0;
      if (st.bowValve) inflowRate += 2.4;
      if (st.sternValve) inflowRate += 2.4;
      if (st.portPump) inflowRate -= 0.5;
      if (st.starboardPump) inflowRate -= 0.5;

      // If all valves closed, no water fills!
      st.waterLevel = Math.max(0, Math.min(100, st.waterLevel + inflowRate * dt * 2.2));
      const roundedLevel = Math.round(st.waterLevel);
      setWaterLevel(roundedLevel);

      // Phase calculation
      let currentPhase: 1 | 2 | 3 = 1;
      if (st.waterLevel < 42) {
        currentPhase = 1; // 1단계: 선저 침수
      } else if (st.waterLevel < 78) {
        currentPhase = 2; // 2단계: 기주 분리 임계구간 (선박 부유 시작 - 최대 롤링 불안정성)
        if (!st.liftOffAnnounced) {
          st.liftOffAnnounced = true;
          gameAudio.playHydraulicWhoosh();
        }
      } else {
        currentPhase = 3; // 3단계: 도크 게이트 개방 및 수위 동기화
      }
      setPhase(currentPhase);

      // 2. Realistic Ship List & Trim Dynamics
      // When seated on keel blocks (water < 40%), blocks provide ground support;
      // When lifting off (42%~78%), metacentric height GM is delicate, requiring active ballast regulation!
      let tiltTorque = 0;

      // Valve flow torque (uneven inflow pushes vessel)
      if (st.bowValve && !st.sternValve) tiltTorque -= 1.6;
      if (st.sternValve && !st.bowValve) tiltTorque += 1.6;

      // Ballast pumps torque (corrective active counter-measure)
      if (st.portPump) tiltTorque += 2.2;      // Right roll correction
      if (st.starboardPump) tiltTorque -= 2.2; // Left roll correction

      // Environmental destabilizing surge during lift-off phase
      if (currentPhase === 2) {
        // High instability during keel block lift-off
        const instabilityFactor = Math.sin(now * 0.0028) * 1.8 + Math.cos(now * 0.0017) * 0.9;
        tiltTorque += instabilityFactor;
      } else if (currentPhase === 3) {
        // Outer tidal surge
        tiltTorque += Math.sin(now * 0.003) * 1.1;
      }

      // If ship is on keel blocks, friction limits angle
      const blockConstraint = st.waterLevel < 35 ? 0.4 : 1.0;
      st.angularVelocity += tiltTorque * blockConstraint * dt * 2.4;
      st.angularVelocity *= Math.pow(0.92, dt * 60); // water roll damping

      st.angle += st.angularVelocity * dt;
      const displayAngle = +(st.angle.toFixed(1));
      setShipAngle(displayAngle);

      // Score accumulation based on balance maintenance
      if (inflowRate > 0) {
        if (Math.abs(st.angle) < 1.2) {
          st.score += Math.round(dt * 180);
        } else if (Math.abs(st.angle) < 2.5) {
          st.score += Math.round(dt * 90);
        }
        setScore(st.score);
      }

      // Warning toast
      if (Math.abs(st.angle) >= 3.6) {
        setWarningMsg("경고: 선체 횡경사(List) 위험! 밸러스트 펌프로 즉각 수평을 맞추세요!");
      } else if (currentPhase === 2 && !warningMsg) {
        setWarningMsg("임계: 기주 분리(Float-off) 진행 중! 반목 전도 주의!");
      } else if (Math.abs(st.angle) < 2.5 && currentPhase !== 2) {
        setWarningMsg("");
      }

      // 3. Failure Condition: Keel Block Dislocation / Hull Wall Rupture
      if (Math.abs(st.angle) >= 5.5) {
        gameAudio.playBomb();
        gameAudio.playDrop();
        setGameOver(true);
        setIsPlaying(false);
        onFinish(st.score);
        return;
      }

      // 4. Success Condition: Dock 100% Water Level & Balanced!
      if (st.waterLevel >= 100) {
        if (Math.abs(st.angle) <= 2.2) {
          gameAudio.playShipHorn();
          gameAudio.playVictory();
          setSuccess(true);
          setIsPlaying(false);
          const finalScore = st.score + 3500;
          setScore(finalScore);
          onFinish(finalScore);
          confetti({
            particleCount: 90,
            spread: 80,
            origin: { y: 0.6 },
            colors: ["#00A352", "#007AFF", "#38BDF8", "#F5A623", "#FFFFFF"],
          });
          return;
        } else {
          // Unbalanced floating at 100%
          gameAudio.playDrop();
          setGameOver(true);
          setIsPlaying(false);
          onFinish(st.score);
          return;
        }
      }

      // Particle spray from open valves
      if (st.bowValve && Math.random() < 0.4) {
        st.waterParticles.push({
          x: w * 0.18 + (Math.random() - 0.5) * 16,
          y: h * 0.72,
          vx: Math.random() * 40 + 20,
          vy: -Math.random() * 30 - 10,
          life: 0,
          color: "rgba(186, 230, 253, 0.8)",
        });
      }
      if (st.sternValve && Math.random() < 0.4) {
        st.waterParticles.push({
          x: w * 0.82 + (Math.random() - 0.5) * 16,
          y: h * 0.72,
          vx: -Math.random() * 40 - 20,
          vy: -Math.random() * 30 - 10,
          life: 0,
          color: "rgba(186, 230, 253, 0.8)",
        });
      }

      // Update particles
      for (let i = st.waterParticles.length - 1; i >= 0; i--) {
        const p = st.waterParticles[i];
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy += 60 * dt; // gravity
        p.life += dt;
        if (p.life > 0.6) {
          st.waterParticles.splice(i, 1);
        }
      }

      // ---------------- RENDER DRYDOCK GRAPHICS ----------------
      ctx.clearRect(0, 0, w, h);

      // 1. Drydock Concrete Caisson Walls (도크 측벽)
      const dockLeft = 50;
      const dockRight = w - 50;
      const dockBottom = h - 55;
      const dockTop = 70;
      const dockDepth = dockBottom - dockTop;

      // Drydock pit background (dark concrete chamber)
      ctx.fillStyle = "#1e293b";
      ctx.fillRect(dockLeft, dockTop, dockRight - dockLeft, dockDepth);

      // Concrete Wall Texture & Depth Scales
      ctx.fillStyle = "#334155";
      ctx.fillRect(0, 0, dockLeft, h);
      ctx.fillRect(dockRight, 0, w - dockRight, h);
      ctx.fillRect(0, dockBottom, w, h - dockBottom);

      // Yellow/Black Safety Coaming along Dock Rim
      for (let y = dockTop; y < dockBottom; y += 24) {
        ctx.fillStyle = (y / 24) % 2 === 0 ? "#facc15" : "#0f172a";
        ctx.fillRect(dockLeft - 8, y, 8, 24);
        ctx.fillRect(dockRight, y, 8, 24);
      }

      // Depth graduation tick marks (수심계 0m ~ 14m)
      ctx.fillStyle = "#94a3b8";
      ctx.font = "bold 9px monospace";
      for (let m = 0; m <= 14; m += 2) {
        const my = dockBottom - (m / 14) * dockDepth;
        ctx.fillRect(dockLeft - 18, my, 8, 1.5);
        ctx.fillText(`${m}m`, dockLeft - 36, my + 3);
        ctx.fillRect(dockRight + 10, my, 8, 1.5);
        ctx.fillText(`${m}m`, dockRight + 22, my + 3);
      }

      // Wooden Keel Blocks (용골 반목 배열) on dock bottom
      const blockW = 16;
      const blockH = 14;
      const keelBlockY = dockBottom - blockH;
      for (let bx = dockLeft + 35; bx < dockRight - 35; bx += 28) {
        // Concrete pedestal
        ctx.fillStyle = "#475569";
        ctx.fillRect(bx, keelBlockY + 6, blockW, 8);
        // Hardwood oak cap
        ctx.fillStyle = "#b45309";
        ctx.fillRect(bx, keelBlockY, blockW, 6);
      }

      // 2. Rising Water Surface & Body in Drydock
      const currentWaterY = dockBottom - (st.waterLevel / 100) * (dockDepth * 0.88);

      if (st.waterLevel > 0) {
        const waterGrad = ctx.createLinearGradient(0, currentWaterY, 0, dockBottom);
        waterGrad.addColorStop(0, "rgba(56, 189, 248, 0.75)");
        waterGrad.addColorStop(0.3, "rgba(2, 132, 199, 0.85)");
        waterGrad.addColorStop(1, "rgba(12, 74, 110, 0.95)");

        ctx.fillStyle = waterGrad;
        ctx.beginPath();
        ctx.moveTo(dockLeft, currentWaterY);
        // Water wave ripples
        const waveStep = (dockRight - dockLeft) / 20;
        for (let i = 0; i <= 20; i++) {
          const wx = dockLeft + i * waveStep;
          const wy = currentWaterY + Math.sin(now * 0.005 + i * 0.8) * 3;
          ctx.lineTo(wx, wy);
        }
        ctx.lineTo(dockRight, dockBottom);
        ctx.lineTo(dockLeft, dockBottom);
        ctx.closePath();
        ctx.fill();

        // White crest line
        ctx.strokeStyle = "rgba(255, 255, 255, 0.5)";
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }

      // 3. Draw Water Sluice Ports (주수구)
      // Bow Sluice
      ctx.fillStyle = st.bowValve ? "#0284c7" : "#0f172a";
      ctx.beginPath();
      ctx.arc(dockLeft + 15, dockBottom - 25, 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = st.bowValve ? "#38bdf8" : "#475569";
      ctx.lineWidth = 2;
      ctx.stroke();

      // Stern Sluice
      ctx.fillStyle = st.sternValve ? "#0284c7" : "#0f172a";
      ctx.beginPath();
      ctx.arc(dockRight - 15, dockBottom - 25, 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = st.sternValve ? "#38bdf8" : "#475569";
      ctx.lineWidth = 2;
      ctx.stroke();

      // Water spray particles
      for (const p of st.waterParticles) {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }

      // 4. Draw Massive Container Ship Hull
      // Hull elevation: rests on blocks at keelBlockY until waterLevel reaches 42% (float-off!)
      const shipWidth = w * 0.65;
      const shipHeight = 85;
      const baseHullY = keelBlockY - shipHeight;

      // When water reaches > 40%, ship floats up with water level
      let floatOffset = 0;
      if (st.waterLevel > 40) {
        floatOffset = ((st.waterLevel - 40) / 60) * (dockDepth * 0.42);
      }
      const shipY = baseHullY - floatOffset;

      ctx.save();
      ctx.translate(w / 2, shipY + shipHeight / 2);
      ctx.rotate((st.angle * Math.PI) / 180);

      // Ship Hull Shadow
      ctx.fillStyle = "rgba(0, 0, 0, 0.35)";
      ctx.fillRect(-shipWidth / 2 + 5, -shipHeight / 2 + 5, shipWidth, shipHeight);

      // Bottom Anti-fouling Coating (Red)
      ctx.fillStyle = "#991b1b";
      ctx.beginPath();
      ctx.moveTo(-shipWidth / 2, 0);
      ctx.lineTo(shipWidth / 2, 0);
      ctx.lineTo(shipWidth / 2 - 18, shipHeight / 2);
      ctx.lineTo(-shipWidth / 2 + 18, shipHeight / 2);
      ctx.closePath();
      ctx.fill();

      // Topside Outer Hull (HD Navy Blue)
      ctx.fillStyle = "#002C6C";
      ctx.beginPath();
      ctx.moveTo(-shipWidth / 2 - 6, -shipHeight / 2);
      ctx.lineTo(shipWidth / 2 + 6, -shipHeight / 2);
      ctx.lineTo(shipWidth / 2, 0);
      ctx.lineTo(-shipWidth / 2, 0);
      ctx.closePath();
      ctx.fill();

      // Bulbous Bow at Fore (Right)
      ctx.fillStyle = "#7f1d1d";
      ctx.beginPath();
      ctx.arc(shipWidth / 2 - 10, shipHeight / 2 - 6, 12, 0, Math.PI * 2);
      ctx.fill();

      // Container Stacks on Upper Deck
      const boxW = 18;
      const boxH = 14;
      const colors = ["#0284c7", "#f59e0b", "#10b981", "#ef4444", "#6366f1"];
      for (let cx = -shipWidth / 2 + 25; cx < shipWidth / 2 - 50; cx += boxW + 4) {
        for (let cy = 0; cy < 2; cy++) {
          ctx.fillStyle = colors[Math.abs(Math.floor(cx * 7 + cy)) % colors.length];
          ctx.fillRect(cx, -shipHeight / 2 - (cy + 1) * (boxH + 1), boxW, boxH);
          ctx.strokeStyle = "rgba(0,0,0,0.3)";
          ctx.lineWidth = 1;
          ctx.strokeRect(cx, -shipHeight / 2 - (cy + 1) * (boxH + 1), boxW, boxH);
        }
      }

      // Deck Bridge Tower at Aft (Left)
      ctx.fillStyle = "#f8fafc";
      ctx.fillRect(-shipWidth / 2 + 20, -shipHeight / 2 - 42, 28, 42);
      ctx.fillStyle = "#0284c7"; // Bridge windows
      ctx.fillRect(-shipWidth / 2 + 24, -shipHeight / 2 - 38, 20, 8);
      // Modern Funnel
      ctx.fillStyle = "#002C6C";
      ctx.fillRect(-shipWidth / 2 + 52, -shipHeight / 2 - 32, 12, 32);
      ctx.fillStyle = "#00A352";
      ctx.fillRect(-shipWidth / 2 + 55, -shipHeight / 2 - 28, 6, 10);

      // Ship Name on Topsides
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 10px sans-serif";
      ctx.fillText("HD HYUNDAI SAMHO 01", -50, -10);

      // Inclinometer / Clinometer on Main Deck
      ctx.strokeStyle = Math.abs(st.angle) > 3.0 ? "#ef4444" : "#10b981";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, -shipHeight / 2 - 12, 12, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, -shipHeight / 2 - 12);
      ctx.lineTo(0, -shipHeight / 2 - 22);
      ctx.stroke();

      ctx.restore();

      // 5. Giant Gantry Crane Legs along Dock
      ctx.fillStyle = "#f59e0b";
      ctx.fillRect(dockLeft - 18, 10, 14, 50);
      ctx.fillRect(dockRight + 4, 10, 14, 50);
      ctx.strokeStyle = "#b45309";
      ctx.lineWidth = 2;
      ctx.strokeRect(dockLeft - 18, 10, 14, 50);
      ctx.strokeRect(dockRight + 4, 10, 14, 50);

      // Dock Head Banner
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 12px sans-serif";
      ctx.fillText("HD현대삼호 제1드라이도크 진수식 (FLOTATION)", dockLeft + 15, dockTop - 18);

      animId = requestAnimationFrame(loop);
    };

    animId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animId);
  }, [isPlaying, gameOver, success]);

  return (
    <div className="w-full max-w-4xl mx-auto flex flex-col items-center select-none font-hd">
      {/* Top Header */}
      <div className="w-full bg-slate-900 border border-slate-800 text-white px-4 py-2.5 rounded-xl flex flex-wrap items-center justify-between gap-3 shadow-md mb-2">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-md shadow-cyan-500/20 shrink-0">
            <Waves className="w-4 h-4 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-sm sm:text-base text-white">드라이도크 안전 진수식</h3>
              <span className={`text-[10px] sm:text-[11px] font-bold px-2 py-0.5 rounded-full border shrink-0 ${
                phase === 1
                  ? "bg-sky-500/20 text-sky-400 border-sky-500/30"
                  : phase === 2
                  ? "bg-amber-500/20 text-amber-400 border-amber-500/30 animate-pulse"
                  : "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
              }`}>
                {phase === 1 ? "1단계: 주수" : phase === 2 ? "2단계: 기주 분리" : "3단계: 진수 개방"}
              </span>
            </div>
            <p className="text-xs text-slate-400 font-normal hidden sm:block">
              주수문과 밸러스트 펌프를 조작하여 횡경사 ±2.0° 이내로 부유시키세요.
            </p>
          </div>
        </div>

        {/* Live Gauges */}
        <div className="flex items-center gap-2 sm:gap-3 text-xs font-semibold">
          <div className="bg-slate-800/80 px-2.5 py-1 rounded-lg border border-slate-700/60 text-center">
            <span className="text-slate-400 block text-[9px] font-medium">주수율</span>
            <span className="text-xs sm:text-sm font-bold text-cyan-400 tabular-nums">{waterLevel}%</span>
          </div>

          <div className="bg-slate-800/80 px-2.5 py-1 rounded-lg border border-slate-700/60 text-center">
            <span className="text-slate-400 block text-[9px] font-medium">횡경사 (List)</span>
            <span className={`text-xs sm:text-sm font-bold tabular-nums ${Math.abs(shipAngle) > 3.0 ? "text-rose-400 animate-pulse" : Math.abs(shipAngle) > 1.8 ? "text-amber-400" : "text-emerald-400"}`}>
              {shipAngle > 0 ? `+${shipAngle}° (우)` : shipAngle < 0 ? `${shipAngle}° (좌)` : "0.0°"}
            </span>
          </div>

          <div className="bg-slate-800/80 px-2.5 py-1 rounded-lg border border-slate-700/60 text-center">
            <span className="text-slate-400 block text-[9px] font-medium">진수 스코어</span>
            <span className="text-xs sm:text-sm font-bold text-sky-400 tabular-nums">{score.toLocaleString()}점</span>
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

      {/* Main Viewport */}
      <div className="w-full relative rounded-xl overflow-hidden border border-slate-800 shadow-xl bg-slate-950 h-[310px] sm:h-[340px] md:h-[360px] flex items-center justify-center">
        <canvas ref={canvasRef} className="w-full h-full block" />

        {/* Warning Toast */}
        {warningMsg && isPlaying && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-rose-950/90 border border-rose-500 text-rose-200 px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-lg animate-bounce z-10">
            <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
            {warningMsg}
          </div>
        )}

        {/* Start Overlay */}
        {!isPlaying && !gameOver && !success && (
          <div className="absolute inset-0 bg-slate-950/85 backdrop-blur-sm flex flex-col items-center justify-center p-4 sm:p-6 text-center z-20 animate-in fade-in duration-200">
            <div className="w-12 h-12 rounded-xl bg-cyan-500/20 border border-cyan-500/40 flex items-center justify-center mb-2.5 text-cyan-400 shadow-lg shadow-cyan-500/10">
              <Waves className="w-6 h-6" />
            </div>
            <h2 className="text-base sm:text-lg md:text-xl font-bold text-white mb-1.5">드라이도크 안전 진수식</h2>
            <p className="text-slate-300 text-xs sm:text-[13px] max-w-md mb-3.5 leading-relaxed">
              <strong>선수(1번) / 선미(2번) 밸브</strong>로 도크에 해수를 유입시키고,<br />
              <strong>40% 기주 분리(Float-off)</strong> 시 <strong>좌/우현 밸러스트(3,4번)</strong>로 <strong>±5.0° 이내</strong>를 유지하세요.
            </p>
            <button
              onClick={startGame}
              className="px-6 py-2.5 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 text-white font-bold text-xs sm:text-sm rounded-xl shadow-lg active:scale-95 transition-all flex items-center gap-2 cursor-pointer"
            >
              <Play className="w-4 h-4 fill-white" />
              진수 주수 시작
            </button>
          </div>
        )}

        {/* Failure Overlay */}
        {gameOver && (
          <div className="absolute inset-0 bg-rose-950/90 backdrop-blur-md flex flex-col items-center justify-center p-4 sm:p-6 text-center z-20 animate-in fade-in zoom-in-95 duration-200">
            <div className="w-12 h-12 rounded-xl bg-rose-500/20 border border-rose-500/40 flex items-center justify-center mb-2 text-rose-400">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <h3 className="text-base sm:text-lg md:text-xl font-bold text-white mb-1">선체 경사 한계 초과</h3>
            <p className="text-slate-300 text-xs sm:text-[13px] mb-3 max-w-sm">
              기울기 초과로 용골 반목 이탈 위험이 감지되어 비상 중단되었습니다.
            </p>
            <div className="bg-slate-900 border border-slate-800 px-5 py-2.5 rounded-xl text-center mb-3.5 min-w-[180px]">
              <span className="text-[10px] text-slate-400 block mb-0.5 font-medium">획득 점수</span>
              <span className="text-xl sm:text-2xl font-bold text-rose-400 tabular-nums">{score.toLocaleString()}점</span>
            </div>
            <button
              onClick={startGame}
              className="px-6 py-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white font-bold text-xs sm:text-sm rounded-xl active:scale-95 transition-all flex items-center gap-2 cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
              재도전
            </button>
          </div>
        )}

        {/* Success Overlay */}
        {success && (
          <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-md flex flex-col items-center justify-center p-4 sm:p-6 text-center z-20 animate-in fade-in zoom-in-95 duration-200">
            <div className="w-12 h-12 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center mb-2 text-amber-400">
              <Sparkles className="w-6 h-6" />
            </div>
            <span className="text-[10px] font-bold text-amber-400 tracking-wider uppercase mb-1">LAUNCHING SUCCESS</span>
            <h3 className="text-base sm:text-lg md:text-xl font-bold text-white mb-1">
              무사고 명품 진수식 완료!
            </h3>
            <p className="text-slate-300 text-xs sm:text-[13px] mb-3 max-w-sm">
              완벽한 수평 제어로 30만 톤급 선박이 해수면에 완벽하게 부유하여 출항 준비를 마쳤습니다.
            </p>
            <div className="bg-slate-900 border border-slate-800 px-5 py-2.5 rounded-xl text-center mb-3.5 min-w-[180px]">
              <span className="text-[10px] text-slate-400 block mb-0.5 font-medium">최종 공인 점수</span>
              <span className="text-xl sm:text-2xl font-bold text-cyan-400 tabular-nums">{score.toLocaleString()}점</span>
            </div>
            <button
              onClick={startGame}
              className="px-6 py-2.5 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 text-white font-bold text-xs sm:text-sm rounded-xl active:scale-95 transition-all cursor-pointer"
            >
              다시 진수하기
            </button>
          </div>
        )}
      </div>

      {/* Control Panel: 4 Industrial Ballast Valves & Pumps */}
      <div className="w-full mt-2 grid grid-cols-2 sm:grid-cols-4 gap-2">
        <button
          onClick={toggleBow}
          disabled={!isPlaying}
          className={`p-2 sm:p-2.5 rounded-lg border flex flex-col items-center justify-center transition-all ${
            bowValve
              ? "bg-cyan-500/25 border-cyan-400 text-cyan-200 shadow-md font-bold"
              : "bg-slate-900 border-slate-800 text-slate-400 hover:bg-slate-800 hover:text-white font-medium"
          }`}
        >
          <span className="text-xs flex items-center gap-1.5 font-bold">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
            선수 주수문 [1]
          </span>
          <span className="text-[10px] mt-0.5">
            {bowValve ? "해수 유입 중" : "닫힘 (클릭)"}
          </span>
        </button>

        <button
          onClick={toggleStern}
          disabled={!isPlaying}
          className={`p-2 sm:p-2.5 rounded-lg border flex flex-col items-center justify-center transition-all ${
            sternValve
              ? "bg-cyan-500/25 border-cyan-400 text-cyan-200 shadow-md font-bold"
              : "bg-slate-900 border-slate-800 text-slate-400 hover:bg-slate-800 hover:text-white font-medium"
          }`}
        >
          <span className="text-xs flex items-center gap-1.5 font-bold">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
            선미 주수문 [2]
          </span>
          <span className="text-[10px] mt-0.5">
            {sternValve ? "해수 유입 중" : "닫힘 (클릭)"}
          </span>
        </button>

        <button
          onClick={togglePort}
          disabled={!isPlaying}
          className={`p-2 sm:p-2.5 rounded-lg border flex flex-col items-center justify-center transition-all ${
            portPump
              ? "bg-amber-500/25 border-amber-400 text-amber-200 shadow-md font-bold"
              : "bg-slate-900 border-slate-800 text-slate-400 hover:bg-slate-800 hover:text-white font-medium"
          }`}
        >
          <span className="text-xs flex items-center gap-1.5 font-bold">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
            좌현 밸러스트 [3]
          </span>
          <span className="text-[10px] mt-0.5">
            {portPump ? "배수 작동 중" : "정지 (클릭)"}
          </span>
        </button>

        <button
          onClick={toggleStarboard}
          disabled={!isPlaying}
          className={`p-2 sm:p-2.5 rounded-lg border flex flex-col items-center justify-center transition-all ${
            starboardPump
              ? "bg-amber-500/25 border-amber-400 text-amber-200 shadow-md font-bold"
              : "bg-slate-900 border-slate-800 text-slate-400 hover:bg-slate-800 hover:text-white font-medium"
          }`}
        >
          <span className="text-xs flex items-center gap-1.5 font-bold">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
            우현 밸러스트 [4]
          </span>
          <span className="text-[10px] mt-0.5">
            {starboardPump ? "배수 작동 중" : "정지 (클릭)"}
          </span>
        </button>
      </div>
    </div>
  );
}
