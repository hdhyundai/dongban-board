import React, { useEffect, useRef, useState } from "react";
import { Play, RotateCcw, Volume2, VolumeX, ArrowLeftRight, Award, AlertTriangle, ShieldCheck, ArrowUp, ArrowDown, ChevronsDown } from "lucide-react";
import confetti from "canvas-confetti";
import { gameAudio } from "../../lib/gameSounds";
import { getGameCanvasFont } from "../../lib/gameFonts";

interface GoliathTurnoverGameProps {
  onFinish: (score: number) => void;
}

export default function GoliathTurnoverGame({ onFinish }: GoliathTurnoverGameProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [gameState, setGameState] = useState<"READY" | "PLAYING" | "GAMEOVER" | "SUCCESS">("READY");
  const [score, setScore] = useState(0);
  const [currentAngle, setCurrentAngle] = useState(0);
  const [hoist1Tension, setHoist1Tension] = useState(450); // Tons
  const [hoist2Tension, setHoist2Tension] = useState(450); // Tons
  const [isMuted, setIsMuted] = useState(gameAudio.getMuted());
  const [timeLeft, setTimeLeft] = useState(50);
  const [guidanceMsg, setGuidanceMsg] = useState("주권(H1)을 올리고 보권(H2)을 내려 블록을 세우세요!");

  // Controller inputs
  const controlRef = useRef<{ h1Up: boolean; h1Down: boolean; h2Up: boolean; h2Down: boolean; dualDown: boolean }>({
    h1Up: false,
    h1Down: false,
    h2Up: false,
    h2Down: false,
    dualDown: false,
  });

  // Physical simulation state
  const stateRef = useRef({
    isPlaying: false,
    score: 0,
    timeLeft: 50,
    angle: 0, // 0 to 180 degrees
    angularVelocity: 0,
    h1Y: 180, // Main hoist hook Y (in canvas space)
    h2Y: 180, // Aux hoist hook Y (in canvas space)
    tension1: 450,
    tension2: 450,
    overloadCount: 0,
    smoothnessScore: 1200,
    screenW: 800,
    screenH: 520,
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
    stateRef.current.timeLeft = 50;
    stateRef.current.angle = 0;
    stateRef.current.angularVelocity = 0;
    stateRef.current.h1Y = 190;
    stateRef.current.h2Y = 190;
    stateRef.current.tension1 = 450;
    stateRef.current.tension2 = 450;
    stateRef.current.overloadCount = 0;
    stateRef.current.smoothnessScore = 1400;
    stateRef.current.lastTime = performance.now();

    setGameState("PLAYING");
    setScore(0);
    setCurrentAngle(0);
    setHoist1Tension(450);
    setHoist2Tension(450);
    setTimeLeft(50);
    setGuidanceMsg("주권(H1)을 올리고 보권(H2)을 내려 블록을 세우세요!");

    gameAudio.playStart();
  };

  const handleGameOver = (isSuccess: boolean) => {
    if (!stateRef.current.isPlaying) return;
    stateRef.current.isPlaying = false;

    let finalScore = 0;
    if (isSuccess) {
      const anglePrecision = Math.max(0, 2500 - Math.abs(180 - stateRef.current.angle) * 350);
      const timeBonus = Math.floor(stateRef.current.timeLeft * 30);
      const smoothness = Math.max(0, Math.floor(stateRef.current.smoothnessScore));
      finalScore = Math.floor(anglePrecision + timeBonus + smoothness);

      setGameState("SUCCESS");
      gameAudio.playVictory();
      confetti({ particleCount: 90, spread: 80, origin: { y: 0.6 } });
    } else {
      finalScore = Math.max(100, Math.floor(stateRef.current.angle * 6));
      setGameState("GAMEOVER");
      gameAudio.playFailure();
    }

    setScore(finalScore);
    onFinish(finalScore);
  };

  // Keyboard controls
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (k === "q") controlRef.current.h1Up = true;
      if (k === "a") controlRef.current.h1Down = true;
      if (k === "w" || k === "e") controlRef.current.h2Up = true;
      if (k === "s" || k === "d") controlRef.current.h2Down = true;
      if (e.code === "Space" || e.key === " ") controlRef.current.dualDown = true;
    };
    const onKeyUp = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (k === "q") controlRef.current.h1Up = false;
      if (k === "a") controlRef.current.h1Down = false;
      if (k === "w" || k === "e") controlRef.current.h2Up = false;
      if (k === "s" || k === "d") controlRef.current.h2Down = false;
      if (e.code === "Space" || e.key === " ") controlRef.current.dualDown = false;
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  // Main 2D Loop & Responsive Resize
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
    };

    const ro = new ResizeObserver(() => resize());
    ro.observe(container);
    resize();

    const render = (time: number) => {
      const dt = Math.min((time - stateRef.current.lastTime) / 1000, 0.08);
      stateRef.current.lastTime = time;

      const s = stateRef.current;
      const c = controlRef.current;
      const w = s.screenW;
      const h = s.screenH;

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      ctx.save();
      ctx.scale(dpr, dpr);

      // Update simulation if PLAYING
      if (s.isPlaying) {
        s.timeLeft -= dt;
        if (s.timeLeft <= 0) {
          handleGameOver(false);
        }

        // Hoist speeds
        const hoistSpeed = 95;
        if (c.dualDown) {
          s.h1Y += hoistSpeed * dt * 0.9;
          s.h2Y += hoistSpeed * dt * 0.9;
        } else {
          if (c.h1Up) s.h1Y -= hoistSpeed * dt;
          if (c.h1Down) s.h1Y += hoistSpeed * dt;
          if (c.h2Up) s.h2Y -= hoistSpeed * dt;
          if (c.h2Down) s.h2Y += hoistSpeed * dt;
        }

        // Cable limits in canvas space
        const minY = 80;
        const maxY = h - 90;
        s.h1Y = Math.max(minY, Math.min(maxY, s.h1Y));
        s.h2Y = Math.max(minY, Math.min(maxY, s.h2Y));

        // Differential height between the two hoists
        // When H1 is higher than H2 (s.h2Y > s.h1Y), torque turns the block clockwise (0 -> 180)
        const deltaH = s.h2Y - s.h1Y;

        // Realistic Turnover Torque Dynamics
        // 1. Driving torque from hoist differential
        const drivingTorque = (deltaH / 40) * 18.0;

        // 2. Gravitational over-center effect: near 90°, gravity assists rotation past the center
        const rad = (s.angle * Math.PI) / 180;
        const gravityEffect = Math.sin(rad * 2) * 4.5;

        // Net rotational acceleration
        const targetAngVel = drivingTorque + (s.angle > 15 && s.angle < 165 ? gravityEffect : 0);
        s.angularVelocity += (targetAngVel - s.angularVelocity * 2.5) * dt * 4;

        // Update angle
        s.angle += s.angularVelocity * dt;
        s.angle = Math.max(0, Math.min(185, s.angle));

        // 3. Dynamic Cable Tension Calculation (900T Total Load)
        // Tension shifts between H1 and H2 based on tilt angle and angular acceleration
        const tiltShift = Math.sin(rad) * 200 + (s.angularVelocity * 3.5);
        const t1 = 450 + tiltShift;
        const t2 = 900 - t1;

        s.tension1 = Math.max(100, Math.min(880, Math.round(t1)));
        s.tension2 = Math.max(100, Math.min(880, Math.round(t2)));

        // Overload alarm & check
        if (s.tension1 > 820 || s.tension2 > 820) {
          s.overloadCount += dt;
          s.smoothnessScore -= dt * 70;
          if (s.overloadCount > 4.0) {
            handleGameOver(false);
          }
        } else {
          s.overloadCount = Math.max(0, s.overloadCount - dt * 2);
        }

        // 4. Update Guidance Messages
        if (s.angle < 80) {
          setGuidanceMsg("주권(H1)을 올리고 보권(H2)을 내려 블록을 세우세요!");
        } else if (s.angle < 168) {
          setGuidanceMsg("사점 통과 완료! 180° 수평을 향해 계속 회전시키세요!");
        } else {
          setGuidanceMsg("★ 180° 반전 성공! [동시 하강]으로 도크 받침대에 부드럽게 안착시키세요!");
        }

        // 5. Landing / Touchdown Detection
        // Keel blocks sit at Y = h - 45. The suspended block's bottom is around center + 30
        const blockCenterY = (s.h1Y + s.h2Y) / 2 + 25;
        const blockBottomY = blockCenterY + 20;

        // When block is near 180° (within ±5.5°) and lowered close to the dock keel blocks:
        if (
          Math.abs(s.angle - 180) <= 5.5 &&
          Math.abs(s.angularVelocity) < 3.5 &&
          blockBottomY >= h - 75
        ) {
          handleGameOver(true);
        }

        // Update React states
        setCurrentAngle(+(s.angle.toFixed(1)));
        setHoist1Tension(s.tension1);
        setHoist2Tension(s.tension2);
        setTimeLeft(Math.max(0, Math.ceil(s.timeLeft)));
      }

      // --- RENDERING ---
      // 1. Drydock Background
      ctx.fillStyle = "#0f172a";
      ctx.fillRect(0, 0, w, h);

      // Dock floor
      const dockFloorY = h - 42;
      ctx.fillStyle = "#1e293b";
      ctx.fillRect(0, dockFloorY, w, 42);

      // Dock floor concrete keel blocks (where 180° inverted hull will land)
      const keelW = 36;
      for (let kx = w / 2 - 130; kx <= w / 2 + 130; kx += 52) {
        // Concrete block
        ctx.fillStyle = "#475569";
        ctx.fillRect(kx - keelW / 2, dockFloorY - 14, keelW, 14);
        // Wood oak cap
        ctx.fillStyle = "#b45309";
        ctx.fillRect(kx - keelW / 2, dockFloorY - 18, keelW, 4);
        // Landing guide target line
        ctx.strokeStyle = Math.abs(s.angle - 180) <= 5.5 ? "#22c55e" : "rgba(255,255,255,0.2)";
        ctx.lineWidth = 1.5;
        ctx.strokeRect(kx - keelW / 2, dockFloorY - 18, keelW, 18);
      }

      // 2. Goliath Crane Overhead Gantry Beam
      const gantryY = 48;
      ctx.fillStyle = "#eab308"; // HD Crane Yellow
      ctx.fillRect(20, gantryY - 16, w - 40, 24);
      ctx.strokeStyle = "#ca8a04";
      ctx.lineWidth = 2.5;
      ctx.strokeRect(20, gantryY - 16, w - 40, 24);

      // Truss cross bracing
      ctx.strokeStyle = "rgba(0, 0, 0, 0.4)";
      ctx.lineWidth = 1.5;
      for (let tx = 30; tx < w - 40; tx += 36) {
        ctx.beginPath();
        ctx.moveTo(tx, gantryY - 16);
        ctx.lineTo(tx + 18, gantryY + 8);
        ctx.lineTo(tx + 36, gantryY - 16);
        ctx.stroke();
      }

      // Gantry Crane Logo
      ctx.fillStyle = "#002c6c";
      ctx.font = getGameCanvasFont(11, "bold");
      ctx.textAlign = "center";
      ctx.fillText("HD HYUNDAI GOLIATH CRANE 1200T", w / 2, gantryY - 1);

      // 3. Main (H1) and Aux (H2) Trolleys & Cables
      const t1X = w / 2 - Math.max(70, w * 0.18);
      const t2X = w / 2 + Math.max(70, w * 0.18);

      // Trolley 1 (Main Hoist)
      ctx.fillStyle = "#1e293b";
      ctx.fillRect(t1X - 22, gantryY + 8, 44, 16);
      ctx.fillStyle = "#38bdf8";
      ctx.font = getGameCanvasFont(9, "bold");
      ctx.fillText("주권 (H1)", t1X, gantryY + 20);

      // Trolley 2 (Aux Hoist)
      ctx.fillStyle = "#1e293b";
      ctx.fillRect(t2X - 22, gantryY + 8, 44, 16);
      ctx.fillStyle = "#f97316";
      ctx.fillText("보권 (H2)", t2X, gantryY + 20);

      // Hook positions
      const h1Pos = { x: t1X, y: s.h1Y };
      const h2Pos = { x: t2X, y: s.h2Y };

      // Wire Cable 1
      ctx.strokeStyle = s.tension1 > 820 ? "#ef4444" : "#94a3b8";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(t1X, gantryY + 24);
      ctx.lineTo(h1Pos.x, h1Pos.y);
      ctx.stroke();

      // Wire Cable 2
      ctx.strokeStyle = s.tension2 > 820 ? "#ef4444" : "#94a3b8";
      ctx.beginPath();
      ctx.moveTo(t2X, gantryY + 24);
      ctx.lineTo(h2Pos.x, h2Pos.y);
      ctx.stroke();

      // Hooks
      ctx.fillStyle = "#475569";
      ctx.fillRect(h1Pos.x - 10, h1Pos.y - 12, 20, 12);
      ctx.fillRect(h2Pos.x - 10, h2Pos.y - 12, 20, 12);

      // 4. Suspended 900-Ton Curved Ship Mega-Block
      const blockCenterX = (h1Pos.x + h2Pos.x) / 2;
      const blockCenterY = (h1Pos.y + h2Pos.y) / 2 + 25;
      const blockRad = (s.angle * Math.PI) / 180;

      ctx.save();
      ctx.translate(blockCenterX, blockCenterY);
      ctx.rotate(blockRad);

      const blockW = 160;
      const blockH = 46;

      // Curved Hull Shell Plating (Primer Red)
      ctx.fillStyle = "#991b1b";
      ctx.beginPath();
      ctx.roundRect(-blockW / 2, -blockH / 2, blockW, blockH, [0, 0, 18, 18]);
      ctx.fill();
      ctx.strokeStyle = "#f87171";
      ctx.lineWidth = 2.5;
      ctx.stroke();

      // Internal Steel Stiffeners
      ctx.strokeStyle = "#475569";
      ctx.lineWidth = 2;
      for (let sx = -blockW / 2 + 18; sx < blockW / 2; sx += 24) {
        ctx.beginPath();
        ctx.moveTo(sx, -blockH / 2);
        ctx.lineTo(sx, blockH / 2 - 6);
        ctx.stroke();
      }

      // Center of Gravity Marker
      ctx.beginPath();
      ctx.arc(0, 0, 8, 0, Math.PI * 2);
      ctx.fillStyle = "#eab308";
      ctx.fill();
      ctx.strokeStyle = "#000000";
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = "#000000";
      ctx.font = getGameCanvasFont(7, "black");
      ctx.fillText("CG", 0, 2.5);

      // 180° Target Touchdown Green Flange
      ctx.fillStyle = "#22c55e";
      ctx.fillRect(-blockW / 2 + 12, -blockH / 2 - 4, blockW - 24, 4);

      ctx.restore();

      // Slings connecting hooks to block
      ctx.strokeStyle = "#e2e8f0";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(h1Pos.x, h1Pos.y);
      ctx.lineTo(blockCenterX - 52, blockCenterY);
      ctx.moveTo(h2Pos.x, h2Pos.y);
      ctx.lineTo(blockCenterX + 52, blockCenterY);
      ctx.stroke();

      // 5. Inclinometer Angle Display Badge
      ctx.fillStyle = "rgba(15, 23, 42, 0.9)";
      ctx.fillRect(w - 145, 62, 135, 68);
      ctx.strokeStyle = "#334155";
      ctx.strokeRect(w - 145, 62, 135, 68);

      ctx.fillStyle = "#94a3b8";
      ctx.font = getGameCanvasFont(10, "medium");
      ctx.textAlign = "left";
      ctx.fillText("현재 반전 각도:", w - 135, 80);
      ctx.fillStyle = Math.abs(s.angle - 180) <= 5.5 ? "#4ade80" : "#fbbf24";
      ctx.font = getGameCanvasFont(20, "black", true);
      ctx.fillText(`${s.angle.toFixed(1)}°`, w - 135, 104);
      ctx.fillStyle = "#38bdf8";
      ctx.font = getGameCanvasFont(9, "bold");
      ctx.fillText("목표: 180.0° 완착", w - 135, 120);

      ctx.restore(); // Restore DPR scale

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
      {/* Top Header HUD */}
      <div className="flex items-center justify-between px-3 py-2 bg-slate-900/95 border-b border-slate-800 shrink-0 z-10 backdrop-blur-md">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-orange-500/20 text-orange-400 rounded-lg border border-orange-500/30">
            <ArrowLeftRight className="w-4 h-4" />
          </div>
          <div>
            <div className="text-xs font-black text-slate-100 flex items-center gap-1.5">
              900T 블록 턴오버 (Turnover)
              <span className="text-[10px] px-1.5 py-0.2 bg-orange-500/20 text-orange-300 rounded font-bold">
                정밀 물리 연산
              </span>
            </div>
            <div className="text-[10px] text-slate-400 hidden sm:block">
              {guidanceMsg}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-4">
          {/* Tension H1 */}
          <div className="flex items-center gap-1 bg-slate-800/80 px-2 py-1 rounded-md border border-slate-700">
            <span className="text-[10px] text-cyan-400 font-bold">H1:</span>
            <span
              className={`text-xs font-black font-mono ${
                hoist1Tension > 820 ? "text-rose-400 animate-pulse" : "text-cyan-300"
              }`}
            >
              {hoist1Tension}T
            </span>
          </div>

          {/* Tension H2 */}
          <div className="flex items-center gap-1 bg-slate-800/80 px-2 py-1 rounded-md border border-slate-700">
            <span className="text-[10px] text-orange-400 font-bold">H2:</span>
            <span
              className={`text-xs font-black font-mono ${
                hoist2Tension > 820 ? "text-rose-400 animate-pulse" : "text-orange-300"
              }`}
            >
              {hoist2Tension}T
            </span>
          </div>

          {/* Angle */}
          <div className="flex items-center gap-1 bg-slate-800/80 px-2 py-1 rounded-md border border-slate-700">
            <span className="text-[10px] text-slate-400 font-bold">각도:</span>
            <span
              className={`text-xs font-black font-mono ${
                Math.abs(currentAngle - 180) <= 5.5 ? "text-emerald-300 animate-pulse" : "text-amber-300"
              }`}
            >
              {currentAngle}°
            </span>
          </div>

          {/* Time Left */}
          <div className="flex items-center gap-1 bg-slate-800/80 px-2 py-1 rounded-md border border-slate-700">
            <span className="text-[10px] text-slate-400 font-bold">시간:</span>
            <span className={`text-xs font-black ${timeLeft <= 10 ? "text-rose-400" : "text-emerald-300"}`}>
              {timeLeft}s
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
      <div ref={mountRef} className="relative flex-1 w-full min-h-0 overflow-hidden bg-slate-900">
        <canvas ref={canvasRef} className="absolute inset-0 block w-full h-full" />

        {/* Live Dynamic Guidance Banner */}
        {gameState === "PLAYING" && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 pointer-events-none z-10 animate-in fade-in">
            <div
              className={`px-3.5 py-1 rounded-full text-xs font-black shadow-lg border backdrop-blur-md ${
                Math.abs(currentAngle - 180) <= 5.5
                  ? "bg-emerald-950/90 border-emerald-500 text-emerald-300 animate-pulse"
                  : "bg-slate-900/90 border-slate-700 text-slate-200"
              }`}
            >
              {guidanceMsg}
            </div>
          </div>
        )}

        {/* READY Overlay */}
        {gameState === "READY" && (
          <div className="absolute inset-0 bg-slate-950/85 backdrop-blur-sm flex flex-col items-center justify-center p-4 text-center z-20">
            <div className="w-14 h-14 rounded-2xl bg-orange-500/20 border border-orange-500/30 flex items-center justify-center mb-3 text-orange-400 shadow-lg">
              <ArrowLeftRight className="w-8 h-8" />
            </div>
            <h3 className="text-lg sm:text-xl font-black text-white mb-2">
              골리앗 크레인 900T 메가블록 공중 턴오버
            </h3>
            <p className="text-xs sm:text-sm text-slate-300 max-w-md mb-4 leading-relaxed">
              조선소 1200톤 골리앗 크레인의 주권(H1)과 보권(H2) 호이스트 고도차를 조절하여
              거대 900톤 블록을 <strong>180.0° 뒤집은 후</strong>, 도크 바닥 반목에 부드럽게 안착시키세요.<br />
              180° 근처에 도달하면 <strong>[동시 하강]</strong>을 눌러 도크 받침대에 터치다운합니다.
            </p>

            <div className="flex flex-wrap items-center justify-center gap-3 text-xs text-slate-400 mb-6 bg-slate-900/90 px-4 py-2.5 rounded-xl border border-slate-800">
              <div className="flex items-center gap-1">
                <span className="px-1.5 py-0.5 bg-slate-800 rounded font-mono font-bold text-cyan-300">
                  Q / A
                </span>
                <span>주권(H1) 상승/하강</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="px-1.5 py-0.5 bg-slate-800 rounded font-mono font-bold text-orange-300">
                  W / S
                </span>
                <span>보권(H2) 상승/하강</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="px-1.5 py-0.5 bg-slate-800 rounded font-mono font-bold text-emerald-300">
                  Spacebar
                </span>
                <span>동시 하강 안착</span>
              </div>
            </div>

            <button
              onClick={startGame}
              className="px-6 py-2.5 bg-orange-600 hover:bg-orange-500 active:scale-95 text-white font-black text-sm rounded-xl shadow-lg shadow-orange-600/30 transition-all flex items-center gap-2 cursor-pointer"
            >
              <Play className="w-4 h-4 fill-white" />
              턴오버 권상 시작
            </button>
          </div>
        )}

        {/* SUCCESS Overlay */}
        {gameState === "SUCCESS" && (
          <div className="absolute inset-0 bg-slate-950/85 backdrop-blur-md flex flex-col items-center justify-center p-4 text-center z-20 animate-in fade-in zoom-in-95">
            <div className="w-14 h-14 rounded-2xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center mb-2 text-emerald-400">
              <ShieldCheck className="w-8 h-8" />
            </div>
            <h3 className="text-lg sm:text-xl font-black text-white mb-1">
              180.0° 턴오버 정밀 안착 대성공!
            </h3>
            <div className="text-2xl sm:text-3xl font-black text-amber-300 mb-2">
              최종 점수: {score.toLocaleString()}점
            </div>
            <p className="text-xs text-slate-300 max-w-sm mb-5">
              180° 무충격 반전 및 완벽한 케이블 텐션 분산 안착 성공! 월간 랭킹에 최고 기록이 등록되었습니다.
            </p>

            <button
              onClick={startGame}
              className="px-6 py-2.5 bg-orange-600 hover:bg-orange-500 active:scale-95 text-white font-black text-sm rounded-xl shadow-lg shadow-orange-600/30 transition-all flex items-center gap-2 cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
              다시 도전하기
            </button>
          </div>
        )}

        {/* GAMEOVER Overlay */}
        {gameState === "GAMEOVER" && (
          <div className="absolute inset-0 bg-slate-950/85 backdrop-blur-md flex flex-col items-center justify-center p-4 text-center z-20 animate-in fade-in zoom-in-95">
            <div className="w-14 h-14 rounded-2xl bg-rose-500/20 border border-rose-500/30 flex items-center justify-center mb-2 text-rose-400">
              <AlertTriangle className="w-8 h-8" />
            </div>
            <h3 className="text-lg sm:text-xl font-black text-white mb-1">
              작전 시간 초과 / 와이어 과부하
            </h3>
            <div className="text-xl sm:text-2xl font-black text-amber-300 mb-2">
              기록 점수: {score.toLocaleString()}점
            </div>
            <p className="text-xs text-slate-300 max-w-sm mb-5">
              주권과 보권의 고도차를 유지하여 180°까지 회전시킨 후, 수평을 맞추어 도크 바닥으로 하강시키세요.
            </p>

            <button
              onClick={startGame}
              className="px-6 py-2.5 bg-orange-600 hover:bg-orange-500 active:scale-95 text-white font-black text-sm rounded-xl shadow-lg shadow-orange-600/30 transition-all flex items-center gap-2 cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
              재도전하기
            </button>
          </div>
        )}
      </div>

      {/* On-screen Dual Hoist Control Panel */}
      <div className="flex flex-wrap items-center justify-between px-3 py-2 bg-slate-900 border-t border-slate-800 shrink-0 z-10 gap-2">
        {/* Hoist 1 Controls */}
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-black text-cyan-400 mr-1 hidden sm:inline">
            주권 (H1)
          </span>
          <button
            onPointerDown={() => (controlRef.current.h1Up = true)}
            onPointerUp={() => (controlRef.current.h1Up = false)}
            onPointerLeave={() => (controlRef.current.h1Up = false)}
            className="w-11 h-9 bg-slate-800 active:bg-cyan-600 hover:bg-slate-750 border border-slate-700 rounded-lg flex items-center justify-center text-cyan-300 active:scale-95 transition-transform"
            title="주권 상승 (Q)"
          >
            <ArrowUp className="w-4 h-4" />
          </button>
          <button
            onPointerDown={() => (controlRef.current.h1Down = true)}
            onPointerUp={() => (controlRef.current.h1Down = false)}
            onPointerLeave={() => (controlRef.current.h1Down = false)}
            className="w-11 h-9 bg-slate-800 active:bg-cyan-600 hover:bg-slate-750 border border-slate-700 rounded-lg flex items-center justify-center text-cyan-300 active:scale-95 transition-transform"
            title="주권 하강 (A)"
          >
            <ArrowDown className="w-4 h-4" />
          </button>
        </div>

        {/* Center: Dual Hoist Lowering Button for Touchdown */}
        <button
          onPointerDown={() => (controlRef.current.dualDown = true)}
          onPointerUp={() => (controlRef.current.dualDown = false)}
          onPointerLeave={() => (controlRef.current.dualDown = false)}
          className={`px-3.5 h-9 rounded-lg border flex items-center gap-1.5 text-xs font-black transition-all active:scale-95 cursor-pointer ${
            Math.abs(currentAngle - 180) <= 5.5
              ? "bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-400 shadow-lg shadow-emerald-600/30 animate-pulse"
              : "bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-750"
          }`}
          title="양쪽 호이스트 동시 하강 (Spacebar)"
        >
          <ChevronsDown className="w-4 h-4" />
          <span>도크 안착 하강 [Space]</span>
        </button>

        {/* Hoist 2 Controls */}
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-black text-orange-400 mr-1 hidden sm:inline">
            보권 (H2)
          </span>
          <button
            onPointerDown={() => (controlRef.current.h2Up = true)}
            onPointerUp={() => (controlRef.current.h2Up = false)}
            onPointerLeave={() => (controlRef.current.h2Up = false)}
            className="w-11 h-9 bg-slate-800 active:bg-orange-600 hover:bg-slate-750 border border-slate-700 rounded-lg flex items-center justify-center text-orange-300 active:scale-95 transition-transform"
            title="보권 상승 (W)"
          >
            <ArrowUp className="w-4 h-4" />
          </button>
          <button
            onPointerDown={() => (controlRef.current.h2Down = true)}
            onPointerUp={() => (controlRef.current.h2Down = false)}
            onPointerLeave={() => (controlRef.current.h2Down = false)}
            className="w-11 h-9 bg-slate-800 active:bg-orange-600 hover:bg-slate-750 border border-slate-700 rounded-lg flex items-center justify-center text-orange-300 active:scale-95 transition-transform"
            title="보권 하강 (S)"
          >
            <ArrowDown className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
