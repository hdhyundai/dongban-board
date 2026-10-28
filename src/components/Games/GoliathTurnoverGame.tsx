import React, { useEffect, useRef, useState } from "react";
import { Play, RotateCcw, Volume2, VolumeX, Shield, ArrowLeftRight, Wind, Gauge, AlertTriangle, Sparkles, CheckCircle2 } from "lucide-react";
import confetti from "canvas-confetti";
import { gameAudio } from "../../lib/gameSounds";

interface GoliathTurnoverGameProps {
  onFinish: (score: number) => void;
}

export default function GoliathTurnoverGame({ onFinish }: GoliathTurnoverGameProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [gameState, setGameState] = useState<"READY" | "PLAYING" | "GAMEOVER">("READY");
  const [score, setScore] = useState(0);
  const [angleDeg, setAngleDeg] = useState(0); // 0 to 180°
  const [mainTension, setMainTension] = useState(0); // tons
  const [auxTension, setAuxTension] = useState(0); // tons
  const [altitudeM, setAltitudeM] = useState(0); // clearance meters
  const [windKnots, setWindKnots] = useState(12);
  const [phaseStep, setPhaseStep] = useState<"LIFT" | "TURNOVER" | "STABILIZE" | "LANDING">("LIFT");
  const [isMuted, setIsMuted] = useState(gameAudio.getMuted());
  const [alarmText, setAlarmText] = useState("");

  const stateRef = useRef({
    score: 0,
    angle: 0, // radians: 0 (flat on ground) to PI (180° inverted)
    angularVelocity: 0,
    altitude: 0, // 0 to 45 meters
    mainHoistY: 260, // ground level
    auxHoistY: 260,
    trolleyX: 300,
    pendulumSway: 0, // pendulum angle swing in radians
    pendulumVelocity: 0,
    blockWeight: 820, // 820 tons
    mainTension: 0,
    auxTension: 0,
    wind: 12,
    windGustTimer: 0,
    isCompleted: false,
    particles: [] as Array<{ x: number; y: number; vx: number; vy: number; life: number; color: string }>,
    lastTime: 0,
    keys: { mainUp: false, mainDown: false, auxUp: false, auxDown: false, trolleyL: false, trolleyR: false },
  });

  const toggleSound = (e: React.MouseEvent) => {
    e.stopPropagation();
    const muted = gameAudio.toggleMute();
    setIsMuted(muted);
  };

  const startGame = () => {
    const s = stateRef.current;
    s.score = 0;
    s.angle = 0;
    s.angularVelocity = 0;
    s.altitude = 0;
    s.mainHoistY = 250; // starts at ground
    s.auxHoistY = 250;
    s.trolleyX = 300;
    s.pendulumSway = 0;
    s.pendulumVelocity = 0;
    s.mainTension = 0;
    s.auxTension = 0;
    s.wind = 12;
    s.windGustTimer = 0;
    s.isCompleted = false;
    s.particles = [];
    s.lastTime = performance.now();

    setScore(0);
    setAngleDeg(0);
    setAltitudeM(0);
    setPhaseStep("LIFT");
    setAlarmText("");
    setGameState("PLAYING");
    gameAudio.playClick();
    gameAudio.playMetalClang(500);
  };

  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (gameState !== "PLAYING") return;
      const k = stateRef.current.keys;
      if (e.key === "w" || e.key === "W") k.mainUp = true;
      if (e.key === "s" || e.key === "S") k.mainDown = true;
      if (e.key === "ArrowUp") k.auxUp = true;
      if (e.key === "ArrowDown") k.auxDown = true;
      if (e.key === "a" || e.key === "A" || e.key === "ArrowLeft") k.trolleyL = true;
      if (e.key === "d" || e.key === "D" || e.key === "ArrowRight") k.trolleyR = true;
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      const k = stateRef.current.keys;
      if (e.key === "w" || e.key === "W") k.mainUp = false;
      if (e.key === "s" || e.key === "S") k.mainDown = false;
      if (e.key === "ArrowUp") k.auxUp = false;
      if (e.key === "ArrowDown") k.auxDown = false;
      if (e.key === "a" || e.key === "A" || e.key === "ArrowLeft") k.trolleyL = false;
      if (e.key === "d" || e.key === "D" || e.key === "ArrowRight") k.trolleyR = false;
    };
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [gameState]);

  // Main Simulation Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;

    const finishGame = (success: boolean) => {
      setGameState("GAMEOVER");
      const finalScore = stateRef.current.score;
      onFinish(finalScore);
      if (success) {
        confetti({
          particleCount: 90,
          spread: 80,
          origin: { y: 0.6 },
          colors: ["#F5A623", "#002C6C", "#00A352", "#FFFFFF"],
        });
      }
    };

    const render = (now: number) => {
      const s = stateRef.current;
      const dt = Math.min((now - s.lastTime) / 1000, 0.05);
      s.lastTime = now;

      const w = canvas.width;
      const h = canvas.height;

      if (gameState === "PLAYING") {
        // Hoist & Trolley Input Handling
        const hoistSpeed = 38 * dt; // px/s
        if (s.keys.mainUp) {
          s.mainHoistY = Math.max(90, s.mainHoistY - hoistSpeed);
          gameAudio.playHydraulicWhoosh();
        }
        if (s.keys.mainDown) {
          s.mainHoistY = Math.min(260, s.mainHoistY + hoistSpeed);
        }
        if (s.keys.auxUp) {
          s.auxHoistY = Math.max(90, s.auxHoistY - hoistSpeed);
          gameAudio.playHydraulicWhoosh();
        }
        if (s.keys.auxDown) {
          s.auxHoistY = Math.min(260, s.auxHoistY + hoistSpeed);
        }
        if (s.keys.trolleyL) {
          s.trolleyX = Math.max(140, s.trolleyX - 45 * dt);
          s.pendulumVelocity -= 0.6 * dt; // trolley move affects swing
        }
        if (s.keys.trolleyR) {
          s.trolleyX = Math.min(w - 140, s.trolleyX + 45 * dt);
          s.pendulumVelocity += 0.6 * dt;
        }

        // Wind gusts
        s.windGustTimer += dt;
        if (s.windGustTimer > 2.5) {
          s.wind = 10 + Math.sin(now * 0.002) * 8 + (Math.random() * 4 - 2);
          setWindKnots(Math.round(s.wind));
          s.windGustTimer = 0;
        }

        // Altitude calculation: Lowest hook position relative to ground (260)
        const avgHookY = (s.mainHoistY + s.auxHoistY) / 2;
        const currentAltitudeM = Math.max(0, +(((260 - avgHookY) / 160) * 35).toFixed(1));
        s.altitude = currentAltitudeM;
        setAltitudeM(currentAltitudeM);

        // Physics: Angle depends strictly on cable height difference, but only works when lifted!
        // When grounded (altitude < 3m), block cannot invert!
        if (currentAltitudeM < 2.5) {
          s.angle = 0;
          s.angularVelocity = 0;
          setPhaseStep("LIFT");
          setAlarmText("");
        } else {
          // Turnover kinematics: Aux hoist lifts relative to main hoist to flip block
          // heightDelta: when Aux is lifted (s.auxHoistY < s.mainHoistY), block rotates
          const heightDelta = s.mainHoistY - s.auxHoistY; // -150 to +150
          const targetRad = Math.max(0, Math.min(Math.PI, ((heightDelta + 40) / 130) * Math.PI));

          s.angularVelocity += (targetRad - s.angle) * 4.0 * dt - s.angularVelocity * 2.8 * dt;
          s.angle += s.angularVelocity * dt;

          if (s.angle < Math.PI * 0.4) {
            setPhaseStep("TURNOVER");
          } else if (s.angle < Math.PI * 0.92) {
            setPhaseStep("STABILIZE");
          } else {
            setPhaseStep("LANDING");
          }
        }

        const currentDeg = Math.round((s.angle / Math.PI) * 180);
        setAngleDeg(currentDeg);

        // Pendulum wind swing physics
        const windForce = (s.wind / 35) * (0.4 + Math.sin(s.angle) * 0.6);
        const restoringTorque = -3.5 * s.pendulumSway;
        s.pendulumVelocity += (restoringTorque + windForce) * dt;
        s.pendulumVelocity *= Math.pow(0.94, dt * 60);
        s.pendulumSway += s.pendulumVelocity * dt;

        // Dynamic cable tension calculation (Load transfer at 90° dead-center)
        if (currentAltitudeM > 0.5) {
          const cosA = Math.cos(s.angle);
          // Main tension starts high at 0°, transfers to Aux tension as angle reaches 180°
          s.mainTension = Math.max(0, Math.round(s.blockWeight * (0.5 + 0.48 * cosA) + (Math.random() * 8 - 4)));
          s.auxTension = Math.max(0, Math.round(s.blockWeight * (0.5 - 0.48 * cosA) + (Math.random() * 8 - 4)));
        } else {
          s.mainTension = 0;
          s.auxTension = 0;
        }
        setMainTension(s.mainTension);
        setAuxTension(s.auxTension);

        // Cable overload safety check (>760 tons on a single hook)
        const singleHookMax = 780;
        const isCableOverload = s.mainTension > singleHookMax || s.auxTension > singleHookMax;
        const isSwayExcess = Math.abs(s.pendulumSway) > 0.28;

        if (isCableOverload) {
          setAlarmText("경고: 단일 와이어 권상 하중 초과! (780T 한계)");
        } else if (isSwayExcess) {
          setAlarmText("경고: 강풍 횡진동(Sway) 위험! 트롤리로 진동을 감쇠하세요!");
        } else {
          setAlarmText("");
        }

        // Failure conditions
        if (s.mainTension > 840 || s.auxTension > 840 || Math.abs(s.pendulumSway) > 0.45) {
          gameAudio.playBomb();
          finishGame(false);
          return;
        }

        // Success condition: 180° Inversion AND Smoothly lowered to transporter (<5m altitude)
        if (currentDeg >= 175 && currentAltitudeM <= 3.8 && Math.abs(s.pendulumSway) < 0.08 && !s.isCompleted) {
          s.isCompleted = true;
          gameAudio.playShipHorn();
          gameAudio.playVictory();
          const bonus = 3000 + Math.round((45 - s.wind) * 20);
          s.score += bonus;
          setScore(s.score);
          setTimeout(() => finishGame(true), 1200);
        } else if (currentAltitudeM > 3) {
          // Active score accumulation while rotating
          s.score += Math.round(currentDeg * 0.15 * dt * 8);
          setScore(s.score);
        }
      }

      // ---------------- RENDER GOLIATH CRANE VIEWPORT ----------------
      ctx.clearRect(0, 0, w, h);

      // 1. Shipyard Drydock & Sky Background
      const skyGrad = ctx.createLinearGradient(0, 0, 0, h);
      skyGrad.addColorStop(0, "#0f172a");
      skyGrad.addColorStop(0.6, "#1e293b");
      skyGrad.addColorStop(1, "#334155");
      ctx.fillStyle = skyGrad;
      ctx.fillRect(0, 0, w, h);

      // Yard ground / concrete assembly slab
      ctx.fillStyle = "#1e293b";
      ctx.fillRect(0, h - 55, w, 55);
      ctx.strokeStyle = "#475569";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, h - 55);
      ctx.lineTo(w, h - 55);
      ctx.stroke();

      // 2. Transporter Flatbed Vehicle (48-wheel Multi-axle Transporter)
      const transX = w / 2 - 80;
      const transY = h - 50;
      ctx.fillStyle = "#f59e0b"; // Yellow heavy transporter
      ctx.fillRect(transX, transY, 160, 18);
      ctx.fillStyle = "#0f172a";
      for (let wx = transX + 10; wx < transX + 155; wx += 14) {
        ctx.beginPath();
        ctx.arc(wx, transY + 22, 6, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 9px sans-serif";
      ctx.fillText("HD SAMHO 1000T TRANSPORTER", transX + 10, transY + 12);

      // 3. Giant Goliath Crane Structure (1,200T 골리앗 크레인)
      // Left and Right Giant Legs (A-frame Truss)
      ctx.fillStyle = "#eab308";
      // Left Leg
      ctx.beginPath();
      ctx.moveTo(40, h - 55);
      ctx.lineTo(80, 50);
      ctx.lineTo(95, 50);
      ctx.lineTo(60, h - 55);
      ctx.closePath();
      ctx.fill();

      // Right Leg
      ctx.beginPath();
      ctx.moveTo(w - 40, h - 55);
      ctx.lineTo(w - 80, 50);
      ctx.lineTo(w - 95, 50);
      ctx.lineTo(w - 60, h - 55);
      ctx.closePath();
      ctx.fill();

      // Horizontal Gantry Girder Beam (상부 거더)
      ctx.fillStyle = "#ca8a04";
      ctx.fillRect(70, 30, w - 140, 24);
      ctx.fillStyle = "#eab308";
      ctx.fillRect(70, 34, w - 140, 16);

      // HD Hyundai Crane Brand Mark
      ctx.fillStyle = "#002C6C";
      ctx.font = "black 12px sans-serif";
      ctx.fillText("HD HYUNDAI 1200T GOLIATH CRANE", w / 2 - 110, 46);

      // 4. Moving Hoist Trolleys on Girder
      const tX = s.trolleyX;
      // Main Hoist Trolley
      ctx.fillStyle = "#0284c7";
      ctx.fillRect(tX - 35, 24, 30, 12);
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 8px sans-serif";
      ctx.fillText("주권", tX - 28, 33);

      // Aux Hoist Trolley
      ctx.fillStyle = "#ea580c";
      ctx.fillRect(tX + 5, 24, 30, 12);
      ctx.fillStyle = "#ffffff";
      ctx.fillText("보권", tX + 12, 33);

      // 5. Heavy Steel Wire Ropes from Trolleys to Hooks
      // Wire sway deflection
      const swayOffset = Math.sin(s.pendulumSway) * 50;

      const mainHookX = tX - 20 + swayOffset;
      const mainHookY = s.mainHoistY;

      const auxHookX = tX + 20 + swayOffset;
      const auxHookY = s.auxHoistY;

      // Draw Main Wire (Dual lines)
      ctx.strokeStyle = "#cbd5e1";
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(tX - 25, 36);
      ctx.lineTo(mainHookX - 4, mainHookY);
      ctx.moveTo(tX - 15, 36);
      ctx.lineTo(mainHookX + 4, mainHookY);
      ctx.stroke();

      // Draw Aux Wire (Dual lines)
      ctx.strokeStyle = "#f97316";
      ctx.beginPath();
      ctx.moveTo(tX + 15, 36);
      ctx.lineTo(auxHookX - 4, auxHookY);
      ctx.moveTo(tX + 25, 36);
      ctx.lineTo(auxHookX + 4, auxHookY);
      ctx.stroke();

      // Sheave Hook Blocks
      ctx.fillStyle = "#334155";
      ctx.fillRect(mainHookX - 10, mainHookY, 20, 14);
      ctx.fillRect(auxHookX - 10, auxHookY, 20, 14);

      // Heavy Lifting Hooks
      ctx.strokeStyle = "#e2e8f0";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(mainHookX, mainHookY + 20, 7, 0, Math.PI);
      ctx.arc(auxHookX, auxHookY + 20, 7, 0, Math.PI);
      ctx.stroke();

      // 6. 900-Ton Curved Hull Bilge Mega-Block (곡블록)
      // Block center sits suspended between the two hooks
      const blockCenterX = (mainHookX + auxHookX) / 2;
      const blockCenterY = (mainHookY + auxHookY) / 2 + 30;

      ctx.save();
      ctx.translate(blockCenterX, blockCenterY);
      ctx.rotate(s.angle);

      // Block Shadow
      ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
      ctx.fillRect(-85, -28, 170, 56);

      // Curved Bilge Plating (Steel Blue Primer)
      ctx.fillStyle = "#1e3a8a";
      ctx.beginPath();
      ctx.roundRect(-80, -25, 160, 50, [12, 12, 4, 4]);
      ctx.fill();
      ctx.strokeStyle = "#60a5fa";
      ctx.lineWidth = 2;
      ctx.stroke();

      // Internal Longitudinal Stiffeners & Web Frames (늑골 보강재 격자)
      ctx.strokeStyle = "rgba(255, 255, 255, 0.25)";
      ctx.lineWidth = 1.5;
      for (let lx = -60; lx <= 60; lx += 20) {
        ctx.beginPath();
        ctx.moveTo(lx, -25);
        ctx.lineTo(lx, 25);
        ctx.stroke();
      }

      // Lifting Lug Trunnions (턴오버 전용 러그)
      ctx.fillStyle = "#f59e0b";
      ctx.beginPath();
      ctx.arc(-70, -25, 8, 0, Math.PI * 2);
      ctx.arc(70, -25, 8, 0, Math.PI * 2);
      ctx.fill();

      // Block Specification Text
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 9px sans-serif";
      ctx.fillText("HD SAMHO 820T BILGE BLOCK", -65, 3);
      ctx.fillText(`ROTATION: ${(s.angle * 180 / Math.PI).toFixed(0)}°`, -35, 16);

      ctx.restore();

      // Rigging Slings connecting hooks to block lugs
      ctx.strokeStyle = "#f8fafc";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(mainHookX, mainHookY + 27);
      ctx.lineTo(blockCenterX - Math.cos(s.angle) * 70, blockCenterY - Math.sin(s.angle) * 70);
      ctx.moveTo(auxHookX, auxHookY + 27);
      ctx.lineTo(blockCenterX + Math.cos(s.angle) * 70, blockCenterY + Math.sin(s.angle) * 70);
      ctx.stroke();

      // 7. Wind and Altitude HUD
      ctx.fillStyle = "#38bdf8";
      ctx.font = "bold 11px sans-serif";
      ctx.fillText(`고도: ${s.altitude}m / 풍속: ${s.wind.toFixed(0)} kts`, 25, 45);

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, [gameState]);

  return (
    <div className="w-full max-w-4xl mx-auto flex flex-col items-center select-none font-hd">
      {/* Top Telemetry Header */}
      <div className="w-full bg-slate-900 border border-slate-800 text-white px-4 py-2.5 rounded-xl flex flex-wrap items-center justify-between gap-3 shadow-md mb-2">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-md shadow-amber-500/20 shrink-0">
            <ArrowLeftRight className="w-4 h-4 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-sm sm:text-base text-white">900T 초대형 블록 턴오버</h3>
              <span className={`text-[10px] sm:text-[11px] font-bold px-2 py-0.5 rounded-full border shrink-0 ${
                phaseStep === "LIFT"
                  ? "bg-sky-500/20 text-sky-400 border-sky-500/30"
                  : phaseStep === "TURNOVER"
                  ? "bg-amber-500/20 text-amber-400 border-amber-500/30 animate-pulse"
                  : phaseStep === "STABILIZE"
                  ? "bg-purple-500/20 text-purple-400 border-purple-500/30"
                  : "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
              }`}>
                {phaseStep === "LIFT"
                  ? "1단계: 권상"
                  : phaseStep === "TURNOVER"
                  ? "2단계: 90° 반전"
                  : phaseStep === "STABILIZE"
                  ? "3단계: 진동 억제"
                  : "4단계: 안착"}
              </span>
            </div>
            <p className="text-xs text-slate-400 font-normal hidden sm:block">
              주권·보권 이중 윈치로 820톤 곡블록을 180° 공중 반전시켜 트랜스포터에 안착시키세요.
            </p>
          </div>
        </div>

        {/* Live Tension and Angle Gauges */}
        <div className="flex items-center gap-2 sm:gap-3 text-xs font-semibold">
          <div className="bg-slate-800/80 px-2.5 py-1 rounded-lg border border-slate-700/60 text-center">
            <span className="text-slate-400 block text-[9px] font-medium">반전각</span>
            <span className="text-xs sm:text-sm font-bold text-amber-400 tabular-nums">{angleDeg}° / 180°</span>
          </div>

          <div className="bg-slate-800/80 px-2.5 py-1 rounded-lg border border-slate-700/60 text-center">
            <span className="text-slate-400 block text-[9px] font-medium">주권/보권</span>
            <span className="text-xs sm:text-sm font-bold text-sky-400 tabular-nums">{mainTension}T / {auxTension}T</span>
          </div>

          <div className="bg-slate-800/80 px-2.5 py-1 rounded-lg border border-slate-700/60 text-center">
            <span className="text-slate-400 block text-[9px] font-medium">인양 고도</span>
            <span className="text-xs sm:text-sm font-bold text-emerald-400 tabular-nums">{altitudeM}m</span>
          </div>

          <div className="bg-slate-800/80 px-2.5 py-1 rounded-lg border border-slate-700/60 text-center">
            <span className="text-slate-400 block text-[9px] font-medium">공정 스코어</span>
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

      {/* Main Canvas Viewport */}
      <div className="w-full relative rounded-xl overflow-hidden border border-slate-800 shadow-xl bg-slate-950 h-[310px] sm:h-[340px] md:h-[360px] flex items-center justify-center">
        <canvas ref={canvasRef} className="w-full h-full block" width={640} height={420} />

        {/* Hazard Alarm Toast */}
        {alarmText && gameState === "PLAYING" && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-rose-950/90 border border-rose-500 text-rose-200 px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-lg animate-bounce z-10">
            <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
            {alarmText}
          </div>
        )}

        {/* Start Overlay */}
        {gameState === "READY" && (
          <div className="absolute inset-0 bg-slate-950/85 backdrop-blur-sm flex flex-col items-center justify-center p-4 sm:p-6 text-center z-20 animate-in fade-in duration-200">
            <div className="w-12 h-12 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center mb-2.5 text-amber-400 shadow-lg shadow-amber-500/10">
              <ArrowLeftRight className="w-6 h-6" />
            </div>
            <h2 className="text-base sm:text-lg md:text-xl font-bold text-white mb-1.5">900T 초대형 블록 공중 턴오버</h2>
            <p className="text-slate-300 text-xs sm:text-[13px] max-w-md mb-3.5 leading-relaxed">
              <strong>W / S (주권)</strong>와 <strong>▲ / ▼ (보권)</strong>으로 블록을 15m 이상 띄운 후,<br />
              보권을 상승시켜 <strong>180° 공중 반전</strong>하여 하단 트랜스포터에 안전 안착시키세요.
            </p>
            <button
              onClick={startGame}
              className="px-6 py-2.5 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white font-bold text-xs sm:text-sm rounded-xl shadow-lg active:scale-95 transition-all flex items-center gap-2 cursor-pointer"
            >
              <Play className="w-4 h-4 fill-white" />
              턴오버 크레인 가동
            </button>
          </div>
        )}

        {/* Game Over / Success Overlay */}
        {gameState === "GAMEOVER" && (
          <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-md flex flex-col items-center justify-center p-4 sm:p-6 text-center z-20 animate-in fade-in zoom-in-95 duration-200">
            {stateRef.current.isCompleted ? (
              <>
                <div className="w-12 h-12 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center mb-2 text-emerald-400">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <h3 className="text-base sm:text-lg md:text-xl font-bold text-white mb-1">
                  무사고 900T 턴오버 완료!
                </h3>
                <p className="text-slate-300 text-xs sm:text-[13px] mb-3 max-w-sm">
                  하중 사점 통과와 횡진동 감쇠를 완벽히 통제하여 안전 탑재되었습니다.
                </p>
              </>
            ) : (
              <>
                <div className="w-12 h-12 rounded-xl bg-rose-500/20 border border-rose-500/40 flex items-center justify-center mb-2 text-rose-400">
                  <AlertTriangle className="w-6 h-6" />
                </div>
                <h3 className="text-base sm:text-lg md:text-xl font-bold text-white mb-1">와이어 과하중 / 블록 충돌</h3>
                <p className="text-slate-300 text-xs sm:text-[13px] mb-3 max-w-sm">
                  단일 와이어 허용 하중 초과 또는 진동으로 비상 정지되었습니다.
                </p>
              </>
            )}

            <div className="bg-slate-900 border border-slate-800 px-5 py-2.5 rounded-xl text-center mb-3.5 min-w-[180px]">
              <span className="text-[10px] text-slate-400 block mb-0.5 font-medium">최종 공정 스코어</span>
              <span className="text-xl sm:text-2xl font-bold text-amber-400 tabular-nums">{score.toLocaleString()}점</span>
            </div>
            <button
              onClick={startGame}
              className="px-6 py-2.5 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white font-bold text-xs sm:text-sm rounded-xl active:scale-95 transition-all flex items-center gap-2 cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
              턴오버 재도전
            </button>
          </div>
        )}
      </div>

      {/* Crane Dual Hoist & Trolley Control Deck */}
      <div className="w-full mt-2 grid grid-cols-1 sm:grid-cols-3 gap-2">
        {/* Main Hoist Control */}
        <div className="bg-slate-900/90 border border-slate-800 p-2 sm:p-2.5 rounded-lg flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-sky-400 block">주권 (Main)</span>
            <span className="text-[10px] text-slate-400">W / S</span>
          </div>
          <div className="flex gap-1">
            <button
              onMouseDown={() => (stateRef.current.keys.mainUp = true)}
              onMouseUp={() => (stateRef.current.keys.mainUp = false)}
              className="px-2.5 py-1.5 bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs rounded-lg active:scale-95"
            >
              ▲ 권상
            </button>
            <button
              onMouseDown={() => (stateRef.current.keys.mainDown = true)}
              onMouseUp={() => (stateRef.current.keys.mainDown = false)}
              className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs rounded-lg active:scale-95"
            >
              ▼ 권하
            </button>
          </div>
        </div>

        {/* Aux Hoist Control (Crucial for Turnover Inversion!) */}
        <div className="bg-slate-900/90 border border-slate-800 p-2 sm:p-2.5 rounded-lg flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-orange-400 block">보권 (Aux) 반전</span>
            <span className="text-[10px] text-slate-400">↑ / ↓</span>
          </div>
          <div className="flex gap-1">
            <button
              onMouseDown={() => (stateRef.current.keys.auxUp = true)}
              onMouseUp={() => (stateRef.current.keys.auxUp = false)}
              className="px-2.5 py-1.5 bg-orange-600 hover:bg-orange-500 text-white font-bold text-xs rounded-lg active:scale-95 shadow-md shadow-orange-500/20"
            >
              ▲ 반전
            </button>
            <button
              onMouseDown={() => (stateRef.current.keys.auxDown = true)}
              onMouseUp={() => (stateRef.current.keys.auxDown = false)}
              className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs rounded-lg active:scale-95"
            >
              ▼ 하강
            </button>
          </div>
        </div>

        {/* Trolley Sway Dampener */}
        <div className="bg-slate-900/90 border border-slate-800 p-2 sm:p-2.5 rounded-lg flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-amber-400 block">횡진동 제어</span>
            <span className="text-[10px] text-slate-400">A / D</span>
          </div>
          <div className="flex gap-1">
            <button
              onMouseDown={() => (stateRef.current.keys.trolleyL = true)}
              onMouseUp={() => (stateRef.current.keys.trolleyL = false)}
              className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs rounded-lg active:scale-95"
            >
              ◀ 좌
            </button>
            <button
              onMouseDown={() => (stateRef.current.keys.trolleyR = true)}
              onMouseUp={() => (stateRef.current.keys.trolleyR = false)}
              className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs rounded-lg active:scale-95"
            >
              우 ▶
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
