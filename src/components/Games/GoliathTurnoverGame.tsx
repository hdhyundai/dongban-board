import React, { useEffect, useRef, useState } from "react";
import { Play, RotateCcw, Volume2, VolumeX, ArrowLeftRight, Award, AlertTriangle, ShieldCheck, ArrowUp, ArrowDown } from "lucide-react";
import confetti from "canvas-confetti";
import { gameAudio } from "../../lib/gameSounds";

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
  const [timeLeft, setTimeLeft] = useState(45);

  // Controller inputs
  const controlRef = useRef<{ h1Up: boolean; h1Down: boolean; h2Up: boolean; h2Down: boolean }>({
    h1Up: false,
    h1Down: false,
    h2Up: false,
    h2Down: false,
  });

  // Physical simulation state
  const stateRef = useRef({
    isPlaying: false,
    score: 0,
    timeLeft: 45,
    angle: 0, // 0 to 180 degrees
    angularVelocity: 0,
    h1Y: 200, // Hoist 1 hook Y in canvas space
    h2Y: 200, // Hoist 2 hook Y in canvas space
    tension1: 450,
    tension2: 450,
    overloadCount: 0,
    smoothnessScore: 1000,
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
    stateRef.current.timeLeft = 45;
    stateRef.current.angle = 0;
    stateRef.current.angularVelocity = 0;
    stateRef.current.h1Y = 220;
    stateRef.current.h2Y = 220;
    stateRef.current.tension1 = 450;
    stateRef.current.tension2 = 450;
    stateRef.current.overloadCount = 0;
    stateRef.current.smoothnessScore = 1200;
    stateRef.current.lastTime = performance.now();

    setGameState("PLAYING");
    setScore(0);
    setCurrentAngle(0);
    setHoist1Tension(450);
    setHoist2Tension(450);
    setTimeLeft(45);

    gameAudio.playStart();
  };

  const handleGameOver = (isSuccess: boolean) => {
    if (!stateRef.current.isPlaying) return;
    stateRef.current.isPlaying = false;

    let finalScore = 0;
    if (isSuccess) {
      const anglePrecision = Math.max(0, 1000 - Math.abs(180 - stateRef.current.angle) * 120);
      const timeBonus = Math.floor(stateRef.current.timeLeft * 25);
      const smoothness = Math.max(0, Math.floor(stateRef.current.smoothnessScore));
      finalScore = Math.floor(anglePrecision + timeBonus + smoothness);

      setGameState("SUCCESS");
      gameAudio.playVictory();
      confetti({ particleCount: 80, spread: 70, origin: { y: 0.6 } });
    } else {
      finalScore = Math.max(100, Math.floor(stateRef.current.angle * 4));
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
      if (k === "w" || k === "e" || k === "arrowup") controlRef.current.h2Up = true;
      if (k === "s" || k === "d" || k === "arrowdown") controlRef.current.h2Down = true;
    };
    const onKeyUp = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (k === "q") controlRef.current.h1Up = false;
      if (k === "a") controlRef.current.h1Down = false;
      if (k === "w" || k === "e" || k === "arrowup") controlRef.current.h2Up = false;
      if (k === "s" || k === "d" || k === "arrowdown") controlRef.current.h2Down = false;
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
      const dt = Math.min((time - stateRef.current.lastTime) / 1000, 0.1);
      stateRef.current.lastTime = time;

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      ctx.save();
      ctx.scale(dpr, dpr);

      const w = stateRef.current.screenW;
      const h = stateRef.current.screenH;

      // Update simulation if PLAYING
      if (stateRef.current.isPlaying) {
        stateRef.current.timeLeft -= dt;
        if (stateRef.current.timeLeft <= 0) {
          handleGameOver(false);
        }

        // Hoist speed (pixels per second)
        const hoistSpeed = 75;
        if (controlRef.current.h1Up) stateRef.current.h1Y -= hoistSpeed * dt;
        if (controlRef.current.h1Down) stateRef.current.h1Y += hoistSpeed * dt;
        if (controlRef.current.h2Up) stateRef.current.h2Y -= hoistSpeed * dt;
        if (controlRef.current.h2Down) stateRef.current.h2Y += hoistSpeed * dt;

        // Boundaries for hoists
        const minY = 90;
        const maxY = h - 140;
        stateRef.current.h1Y = Math.max(minY, Math.min(maxY, stateRef.current.h1Y));
        stateRef.current.h2Y = Math.max(minY, Math.min(maxY, stateRef.current.h2Y));

        // Block Physics: calculate angle based on hoist differential
        // Horizontal distance between hoists = w * 0.38
        const hoistSpan = Math.max(160, w * 0.38);
        const deltaY = stateRef.current.h2Y - stateRef.current.h1Y;

        // Target geometric angle in degrees
        // As H2 goes lower or H1 goes higher, angle increases from 0 to 180
        const geometricAngle = Math.atan2(deltaY, hoistSpan * 0.5) * (180 / Math.PI);
        const mappedAngle = Math.max(0, Math.min(185, (deltaY / 140) * 180));

        // Smooth physical dampening
        const targetAngVel = (mappedAngle - stateRef.current.angle) * 3.5;
        stateRef.current.angularVelocity += (targetAngVel - stateRef.current.angularVelocity) * dt * 4;
        stateRef.current.angle += stateRef.current.angularVelocity * dt;

        // Dynamic Cable Tension Calculation (Tons)
        // Total block mass = 900T
        const angRad = (stateRef.current.angle * Math.PI) / 180;
        const baseT1 = 450 + Math.sin(angRad) * 220 + (stateRef.current.angularVelocity * 15);
        const baseT2 = 900 - baseT1;

        stateRef.current.tension1 = Math.max(50, Math.min(950, baseT1));
        stateRef.current.tension2 = Math.max(50, Math.min(950, baseT2));

        // Overload / Shock penalty
        if (stateRef.current.tension1 > 780 || stateRef.current.tension2 > 780) {
          stateRef.current.overloadCount += dt;
          stateRef.current.smoothnessScore -= dt * 60;
          if (stateRef.current.overloadCount > 2.5) {
            // Cable break!
            handleGameOver(false);
          }
        }

        // Check Success Condition: Angle near 180 deg (±4 deg) and stable
        if (
          Math.abs(stateRef.current.angle - 180) < 4.5 &&
          Math.abs(stateRef.current.angularVelocity) < 2.0 &&
          stateRef.current.h1Y > h - 180
        ) {
          handleGameOver(true);
        }

        // Update React HUD states
        setCurrentAngle(Math.round(stateRef.current.angle * 10) / 10);
        setHoist1Tension(Math.round(stateRef.current.tension1));
        setHoist2Tension(Math.round(stateRef.current.tension2));
        setTimeLeft(Math.max(0, Math.ceil(stateRef.current.timeLeft)));
      }

      // --- 2D RENDERING ---
      // 1. Drydock Background
      ctx.fillStyle = "#0f172a"; // Deep navy dock
      ctx.fillRect(0, 0, w, h);

      // Dock side walls and dock pit floor
      const dockFloorY = h - 40;
      ctx.fillStyle = "#1e293b";
      ctx.fillRect(0, dockFloorY, w, 40);

      // Keel blocks on dock floor (concrete supports where 180deg block should land)
      ctx.fillStyle = "#f59e0b";
      const blockBaseW = 40;
      for (let bx = w / 2 - 120; bx <= w / 2 + 120; bx += 60) {
        ctx.fillRect(bx - blockBaseW / 2, dockFloorY - 14, blockBaseW, 14);
        ctx.strokeStyle = "#78350f";
        ctx.lineWidth = 1.5;
        ctx.strokeRect(bx - blockBaseW / 2, dockFloorY - 14, blockBaseW, 14);
      }

      // 2. Goliath Crane Gantry Overhead Beam
      const gantryY = 50;
      ctx.fillStyle = "#eab308"; // Goliath Crane Yellow
      ctx.fillRect(20, gantryY - 16, w - 40, 24);
      ctx.strokeStyle = "#ca8a04";
      ctx.lineWidth = 3;
      ctx.strokeRect(20, gantryY - 16, w - 40, 24);

      // Crane truss diagonal braces
      ctx.strokeStyle = "rgba(0, 0, 0, 0.4)";
      ctx.lineWidth = 2;
      for (let tx = 30; tx < w - 40; tx += 40) {
        ctx.beginPath();
        ctx.moveTo(tx, gantryY - 16);
        ctx.lineTo(tx + 20, gantryY + 8);
        ctx.lineTo(tx + 40, gantryY - 16);
        ctx.stroke();
      }

      // Crane Name Plate
      ctx.fillStyle = "#002c6c";
      ctx.font = "bold 11px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("HD SAMHO GOLIATH CRANE 1200T", w / 2, gantryY - 1);

      // 3. Trolleys & Cable Hoists
      const t1X = w / 2 - Math.max(80, w * 0.19);
      const t2X = w / 2 + Math.max(80, w * 0.19);

      // Trolley 1 (Main Hoist)
      ctx.fillStyle = "#1e293b";
      ctx.fillRect(t1X - 22, gantryY + 8, 44, 16);
      ctx.fillStyle = "#38bdf8";
      ctx.font = "bold 9px sans-serif";
      ctx.fillText("주권 (H1)", t1X, gantryY + 20);

      // Trolley 2 (Aux Hoist)
      ctx.fillStyle = "#1e293b";
      ctx.fillRect(t2X - 22, gantryY + 8, 44, 16);
      ctx.fillStyle = "#f97316";
      ctx.fillText("보권 (H2)", t2X, gantryY + 20);

      // Hook 1 & 2 Positions
      const h1Pos = { x: t1X, y: stateRef.current.h1Y };
      const h2Pos = { x: t2X, y: stateRef.current.h2Y };

      // Wire 1 (Steel Wire Rope)
      ctx.strokeStyle = stateRef.current.tension1 > 750 ? "#ef4444" : "#94a3b8";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(t1X, gantryY + 24);
      ctx.lineTo(h1Pos.x, h1Pos.y);
      ctx.stroke();

      // Wire 2
      ctx.strokeStyle = stateRef.current.tension2 > 750 ? "#ef4444" : "#94a3b8";
      ctx.beginPath();
      ctx.moveTo(t2X, gantryY + 24);
      ctx.lineTo(h2Pos.x, h2Pos.y);
      ctx.stroke();

      // Hook Blocks
      ctx.fillStyle = "#475569";
      ctx.fillRect(h1Pos.x - 10, h1Pos.y - 12, 20, 12);
      ctx.fillRect(h2Pos.x - 10, h2Pos.y - 12, 20, 12);

      // 4. 900-Ton Curved Ship Hull Block
      // Center of suspended block
      const blockCenterX = (h1Pos.x + h2Pos.x) / 2;
      const blockCenterY = (h1Pos.y + h2Pos.y) / 2 + 35;
      const blockAngleRad = (stateRef.current.angle * Math.PI) / 180;

      ctx.save();
      ctx.translate(blockCenterX, blockCenterY);
      ctx.rotate(blockAngleRad);

      const blockW = 160;
      const blockH = 50;

      // Curved Hull Bottom Outer Plating (Shipyard primer red/brown)
      ctx.fillStyle = "#991b1b"; // Primer Hull Red
      ctx.beginPath();
      ctx.roundRect(-blockW / 2, -blockH / 2, blockW, blockH, [0, 0, 20, 20]);
      ctx.fill();
      ctx.strokeStyle = "#f87171";
      ctx.lineWidth = 2.5;
      ctx.stroke();

      // Internal T-Beam Stiffeners
      ctx.strokeStyle = "#475569";
      ctx.lineWidth = 2;
      for (let sx = -blockW / 2 + 20; sx < blockW / 2; sx += 24) {
        ctx.beginPath();
        ctx.moveTo(sx, -blockH / 2);
        ctx.lineTo(sx, blockH / 2 - 8);
        ctx.stroke();
      }

      // Center of Gravity Marker (Yellow/Black hazard circle)
      ctx.beginPath();
      ctx.arc(0, 0, 9, 0, Math.PI * 2);
      ctx.fillStyle = "#eab308";
      ctx.fill();
      ctx.strokeStyle = "#000000";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = "#000000";
      ctx.font = "bold 8px sans-serif";
      ctx.fillText("CG", 0, 3);

      // 180° Target Landing Side Marker (Flange)
      ctx.fillStyle = "#22c55e";
      ctx.fillRect(-blockW / 2 + 10, -blockH / 2 - 4, blockW - 20, 4);

      ctx.restore();

      // Slings connecting hooks to block attachment pad eyes
      ctx.strokeStyle = "#e2e8f0";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(h1Pos.x, h1Pos.y);
      ctx.lineTo(blockCenterX - 50, blockCenterY);
      ctx.moveTo(h2Pos.x, h2Pos.y);
      ctx.lineTo(blockCenterX + 50, blockCenterY);
      ctx.stroke();

      // 5. Target Angle Compass Display
      ctx.fillStyle = "rgba(15, 23, 42, 0.85)";
      ctx.fillRect(w - 150, 60, 140, 70);
      ctx.strokeStyle = "#334155";
      ctx.strokeRect(w - 150, 60, 140, 70);

      ctx.fillStyle = "#94a3b8";
      ctx.font = "10px sans-serif";
      ctx.textAlign = "left";
      ctx.fillText("현재 반전 각도:", w - 140, 80);
      ctx.fillStyle = Math.abs(stateRef.current.angle - 180) < 5 ? "#4ade80" : "#fbbf24";
      ctx.font = "bold 18px monospace";
      ctx.fillText(`${stateRef.current.angle.toFixed(1)}°`, w - 140, 105);
      ctx.fillStyle = "#38bdf8";
      ctx.font = "9px sans-serif";
      ctx.fillText("목표: 180.0° 완착", w - 140, 120);

      ctx.restore(); // Restore DPR

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
            <div className="text-[10px] text-slate-400">
              주권·보권 와이어 텐션 밸런싱 & 180.0° 안전 반전
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-4">
          {/* Tension H1 */}
          <div className="flex items-center gap-1 bg-slate-800/80 px-2 py-1 rounded-md border border-slate-700">
            <span className="text-[10px] text-cyan-400 font-bold">H1:</span>
            <span
              className={`text-xs font-black font-mono ${
                hoist1Tension > 750 ? "text-rose-400 animate-pulse" : "text-cyan-300"
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
                hoist2Tension > 750 ? "text-rose-400 animate-pulse" : "text-orange-300"
              }`}
            >
              {hoist2Tension}T
            </span>
          </div>

          {/* Angle */}
          <div className="flex items-center gap-1 bg-slate-800/80 px-2 py-1 rounded-md border border-slate-700">
            <span className="text-[10px] text-slate-400 font-bold">각도:</span>
            <span className="text-xs font-black text-amber-300 font-mono">{currentAngle}°</span>
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

      {/* Main Canvas Container (100% Flex, responsive fit) */}
      <div ref={mountRef} className="relative flex-1 w-full min-h-0 overflow-hidden bg-slate-900">
        <canvas ref={canvasRef} className="absolute inset-0 block w-full h-full" />

        {/* READY Overlay */}
        {gameState === "READY" && (
          <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm flex flex-col items-center justify-center p-4 text-center z-20">
            <div className="w-14 h-14 rounded-2xl bg-orange-500/20 border border-orange-500/30 flex items-center justify-center mb-3 text-orange-400 shadow-lg">
              <ArrowLeftRight className="w-8 h-8" />
            </div>
            <h3 className="text-lg sm:text-xl font-black text-white mb-2">
              900T 대형 메가블록 공중 반전(턴오버) 작전
            </h3>
            <p className="text-xs sm:text-sm text-slate-300 max-w-md mb-4 leading-relaxed">
              조선소 골리앗 크레인의 주권(H1)과 보권(H2) 호이스트를 정밀 조작하여 거대 900톤 블록을
              공중에서 180.0° 뒤집은 후, 도크 받침대에 부드럽게 안착시키세요.
              와이어 장력이 750톤을 초과하면 과부하 파단 위험이 발생합니다!
            </p>

            <div className="flex flex-wrap items-center justify-center gap-4 text-xs text-slate-400 mb-6 bg-slate-900/90 px-4 py-2.5 rounded-xl border border-slate-800">
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
            </div>

            <button
              onClick={startGame}
              className="px-6 py-2.5 bg-orange-600 hover:bg-orange-500 active:scale-95 text-white font-black text-sm rounded-xl shadow-lg shadow-orange-600/30 transition-all flex items-center gap-2"
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
              턴오버 안착 대성공!
            </h3>
            <div className="text-2xl sm:text-3xl font-black text-amber-300 mb-2">
              최종 점수: {score.toLocaleString()}점
            </div>
            <p className="text-xs text-slate-300 max-w-sm mb-5">
              180.0° 무충격 정밀 안착 및 장력 분산 성공! 월간 랭킹에 최고 기록이 반영되었습니다.
            </p>

            <button
              onClick={startGame}
              className="px-6 py-2.5 bg-orange-600 hover:bg-orange-500 active:scale-95 text-white font-black text-sm rounded-xl shadow-lg shadow-orange-600/30 transition-all flex items-center gap-2"
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
              와이어 과부하 / 시간 초과
            </h3>
            <div className="text-2xl sm:text-3xl font-black text-amber-300 mb-2">
              점수: {score.toLocaleString()}점
            </div>
            <p className="text-xs text-slate-300 max-w-sm mb-5">
              호이스트 장력이 급격히 쏠리거나 시간이 초과되었습니다. 주권과 보권의 고도차를 완만하게 조절하세요.
            </p>

            <button
              onClick={startGame}
              className="px-6 py-2.5 bg-orange-600 hover:bg-orange-500 active:scale-95 text-white font-black text-sm rounded-xl shadow-lg shadow-orange-600/30 transition-all flex items-center gap-2"
            >
              <RotateCcw className="w-4 h-4" />
              재도전하기
            </button>
          </div>
        )}
      </div>

      {/* On-screen Dual Hoist Control Panel */}
      <div className="flex items-center justify-between px-3 py-2 bg-slate-900 border-t border-slate-800 shrink-0 z-10 gap-2">
        {/* Hoist 1 Controls */}
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-black text-cyan-400 mr-1 hidden sm:inline">
            주권 (H1)
          </span>
          <button
            onPointerDown={() => (controlRef.current.h1Up = true)}
            onPointerUp={() => (controlRef.current.h1Up = false)}
            onPointerLeave={() => (controlRef.current.h1Up = false)}
            className="w-12 h-10 bg-slate-800 active:bg-cyan-600 hover:bg-slate-750 border border-slate-700 rounded-lg flex items-center justify-center text-cyan-300 active:scale-95 transition-transform"
            title="주권 상승 (Q)"
          >
            <ArrowUp className="w-5 h-5" />
          </button>
          <button
            onPointerDown={() => (controlRef.current.h1Down = true)}
            onPointerUp={() => (controlRef.current.h1Down = false)}
            onPointerLeave={() => (controlRef.current.h1Down = false)}
            className="w-12 h-10 bg-slate-800 active:bg-cyan-600 hover:bg-slate-750 border border-slate-700 rounded-lg flex items-center justify-center text-cyan-300 active:scale-95 transition-transform"
            title="주권 하강 (A)"
          >
            <ArrowDown className="w-5 h-5" />
          </button>
        </div>

        <div className="text-center text-[11px] text-slate-400 hidden md:block">
          키보드 [Q/A] 주권 상승·하강 · [W/S] 보권 상승·하강
        </div>

        {/* Hoist 2 Controls */}
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-black text-orange-400 mr-1 hidden sm:inline">
            보권 (H2)
          </span>
          <button
            onPointerDown={() => (controlRef.current.h2Up = true)}
            onPointerUp={() => (controlRef.current.h2Up = false)}
            onPointerLeave={() => (controlRef.current.h2Up = false)}
            className="w-12 h-10 bg-slate-800 active:bg-orange-600 hover:bg-slate-750 border border-slate-700 rounded-lg flex items-center justify-center text-orange-300 active:scale-95 transition-transform"
            title="보권 상승 (W)"
          >
            <ArrowUp className="w-5 h-5" />
          </button>
          <button
            onPointerDown={() => (controlRef.current.h2Down = true)}
            onPointerUp={() => (controlRef.current.h2Down = false)}
            onPointerLeave={() => (controlRef.current.h2Down = false)}
            className="w-12 h-10 bg-slate-800 active:bg-orange-600 hover:bg-slate-750 border border-slate-700 rounded-lg flex items-center justify-center text-orange-300 active:scale-95 transition-transform"
            title="보권 하강 (S)"
          >
            <ArrowDown className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
}
