import React, { useEffect, useRef, useState } from "react";
import { Play, RotateCcw, Volume2, VolumeX, Shield, Anchor, ArrowLeftRight, Compass, Wind } from "lucide-react";
import confetti from "canvas-confetti";
import { gameAudio } from "../../lib/gameSounds";

interface GoliathTurnoverGameProps {
  onFinish: (score: number) => void;
}

export default function GoliathTurnoverGame({ onFinish }: GoliathTurnoverGameProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [gameState, setGameState] = useState<"READY" | "PLAYING" | "GAMEOVER">("READY");
  const [score, setScore] = useState(0);
  const [angleDeg, setAngleDeg] = useState(0); // 0 to 180
  const [mainTension, setMainTension] = useState(450); // tons (0 to 900)
  const [auxTension, setAuxTension] = useState(350); // tons (0 to 900)
  const [windKnots, setWindKnots] = useState(8);
  const [safetyAlarm, setSafetyAlarm] = useState(false);
  const [isMuted, setIsMuted] = useState(gameAudio.getMuted());

  const stateRef = useRef({
    score: 0,
    angle: 0, // radians, 0 to PI
    targetAngle: 0,
    angleVelocity: 0,
    mainHoistY: 140, // height of main hoist hook
    auxHoistY: 140, // height of aux hoist hook
    trolleyX: 300,
    blockWeight: 780, // 780 tons
    mainTension: 390,
    auxTension: 390,
    wind: 8,
    windGustTimer: 0,
    stressLevel: 0, // 0 to 100
    stability: 100, // drops if out of balance
    isCompleted: false,
    particles: [] as Array<{ x: number; y: number; vx: number; vy: number; life: number; color: string }>,
    width: 620,
    height: 520,
    lastTime: 0,
    keys: { left: false, right: false, up: false, down: false },
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
    s.angle = 0;
    s.targetAngle = 0;
    s.angleVelocity = 0;
    s.mainHoistY = 160;
    s.auxHoistY = 160;
    s.mainTension = 390;
    s.auxTension = 390;
    s.wind = 7;
    s.windGustTimer = 0;
    s.stressLevel = 20;
    s.stability = 100;
    s.isCompleted = false;
    s.particles = [];
    s.lastTime = performance.now();

    setScore(0);
    setAngleDeg(0);
    setSafetyAlarm(false);
    setGameState("PLAYING");
    gameAudio.playClick();
  };

  // Hoist control actions
  const adjustHoists = (deltaMain: number, deltaAux: number) => {
    if (gameState !== "PLAYING") return;
    const s = stateRef.current;
    s.mainHoistY = Math.max(100, Math.min(260, s.mainHoistY + deltaMain));
    s.auxHoistY = Math.max(100, Math.min(260, s.auxHoistY + deltaAux));
    gameAudio.playHydraulicWhoosh();
  };

  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (gameState !== "PLAYING") return;
      if (e.key === "ArrowLeft" || e.key === "a") stateRef.current.keys.left = true;
      if (e.key === "ArrowRight" || e.key === "d") stateRef.current.keys.right = true;
      if (e.key === "ArrowUp" || e.key === "w") stateRef.current.keys.up = true;
      if (e.key === "ArrowDown" || e.key === "s") stateRef.current.keys.down = true;
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft" || e.key === "a") stateRef.current.keys.left = false;
      if (e.key === "ArrowRight" || e.key === "d") stateRef.current.keys.right = false;
      if (e.key === "ArrowUp" || e.key === "w") stateRef.current.keys.up = false;
      if (e.key === "ArrowDown" || e.key === "s") stateRef.current.keys.down = false;
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

    const finishGame = (success: boolean) => {
      setGameState("GAMEOVER");
      const finalScore = stateRef.current.score;
      onFinish(finalScore);
      if (success && finalScore >= 1500) {
        confetti({
          particleCount: 80,
          spread: 80,
          origin: { y: 0.6 },
          colors: ["#FF6B00", "#002C6C", "#00A352", "#FFFFFF"],
        });
      }
    };

    const render = (now: number) => {
      const s = stateRef.current;
      const dt = Math.min((now - s.lastTime) / 1000, 0.1);
      s.lastTime = now;

      const w = canvas.width;
      const h = canvas.height;

      // Handle continuous keys
      if (s.keys.left) s.auxHoistY = Math.max(100, Math.min(270, s.auxHoistY - 45 * dt));
      if (s.keys.right) s.auxHoistY = Math.max(100, Math.min(270, s.auxHoistY + 45 * dt));
      if (s.keys.up) s.mainHoistY = Math.max(100, Math.min(270, s.mainHoistY - 45 * dt));
      if (s.keys.down) s.mainHoistY = Math.max(100, Math.min(270, s.mainHoistY + 45 * dt));

      // Wind gusts
      s.windGustTimer += dt;
      if (s.windGustTimer > 3) {
        s.wind = 6 + Math.sin(now * 0.002) * 8 + (Math.random() * 4 - 2);
        setWindKnots(Math.round(s.wind));
        s.windGustTimer = 0;
      }

      // Physics: Angle calculated from relative height of main & aux hooks
      // When Main is high and Aux is lowered, block rotates
      const heightDiff = s.auxHoistY - s.mainHoistY; // -170 to +170
      const desiredAngle = Math.max(0, Math.min(Math.PI, ((heightDiff + 80) / 160) * Math.PI));

      // Angular acceleration with damping and wind buffeting
      const windTorque = (s.wind / 30) * 0.15;
      s.angleVelocity += (desiredAngle - s.angle) * 3.5 * dt - s.angleVelocity * 2.5 * dt + (Math.sin(now * 0.005) * windTorque * dt);
      s.angle += s.angleVelocity * dt;
      s.angle = Math.max(0, Math.min(Math.PI, s.angle));

      const currentDeg = Math.round((s.angle / Math.PI) * 180);
      setAngleDeg(currentDeg);

      // Tension calculation
      const cosA = Math.cos(s.angle);
      const sinA = Math.sin(s.angle);
      // As block turns, load shifts between main hoist and aux hoist
      const loadFactor = Math.abs(cosA);
      s.mainTension = Math.round(s.blockWeight * (0.5 + 0.4 * cosA) + (Math.random() * 6 - 3));
      s.auxTension = Math.round(s.blockWeight * (0.5 - 0.4 * cosA) + (Math.random() * 6 - 3));
      setMainTension(s.mainTension);
      setAuxTension(s.auxTension);

      // Stress & Stability
      const tensionDiff = Math.abs(s.mainTension - s.auxTension);
      const maxAllowedTension = 720;
      const isOverloaded = s.mainTension > maxAllowedTension || s.auxTension > maxAllowedTension;

      if (isOverloaded) {
        s.stability -= 30 * dt;
        setSafetyAlarm(true);
      } else {
        s.stability = Math.min(100, s.stability + 10 * dt);
        setSafetyAlarm(false);
      }

      // Check success condition: reaching 180° (Turnover Complete!)
      if (currentDeg >= 176 && !s.isCompleted && s.stability > 40) {
        s.isCompleted = true;
        s.score += 2000 + Math.round(s.stability * 10);
        setScore(s.score);
        gameAudio.playShipHorn();
        setTimeout(() => finishGame(true), 1200);
      } else if (s.stability <= 0) {
        // Wire overload failure
        gameAudio.playHit();
        finishGame(false);
      } else if (gameState === "PLAYING") {
        // Accumulate rotation progress score
        s.score += Math.round(currentDeg * 0.2 * dt * 10);
        setScore(s.score);
      }

      // ---------------- RENDER ----------------
      // 1. Shipyard & Drydock Sky Background
      ctx.fillStyle = "#1e293b";
      ctx.fillRect(0, 0, w, h);

      // Sky gradient
      const skyGrad = ctx.createLinearGradient(0, 0, 0, 360);
      skyGrad.addColorStop(0, "#0f172a");
      skyGrad.addColorStop(0.7, "#1e3a5f");
      skyGrad.addColorStop(1, "#334155");
      ctx.fillStyle = skyGrad;
      ctx.fillRect(0, 0, w, 360);

      // Distant cranes and dock gate silhouettes
      ctx.fillStyle = "#1e293b";
      ctx.beginPath();
      ctx.moveTo(40, 360);
      ctx.lineTo(80, 240);
      ctx.lineTo(95, 240);
      ctx.lineTo(135, 360);
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(500, 360);
      ctx.lineTo(540, 220);
      ctx.lineTo(555, 220);
      ctx.lineTo(595, 360);
      ctx.fill();

      // Drydock concrete ground & floor rails
      ctx.fillStyle = "#334155";
      ctx.fillRect(0, 360, w, h - 360);
      ctx.fillStyle = "#1e293b";
      ctx.fillRect(0, 360, w, 6);

      // Dock floor block supporting jigs (우드 서포트 지그)
      ctx.fillStyle = "#64748b";
      for (let jx = 180; jx <= 440; jx += 65) {
        ctx.fillRect(jx, 430, 35, 40);
        ctx.fillStyle = "#475569";
        ctx.fillRect(jx + 2, 430, 31, 6);
        ctx.fillStyle = "#64748b";
      }

      // Dock target landing zone marker
      ctx.save();
      ctx.strokeStyle = currentDeg >= 175 ? "#00FFC2" : "rgba(255, 200, 50, 0.4)";
      ctx.setLineDash([6, 4]);
      ctx.lineWidth = 2;
      ctx.strokeRect(170, 420, 280, 50);
      ctx.fillStyle = currentDeg >= 175 ? "rgba(0, 255, 194, 0.15)" : "rgba(255, 200, 50, 0.05)";
      ctx.fillRect(170, 420, 280, 50);
      ctx.restore();

      // 2. 900-Ton Goliath Crane (HD Hyundai Samho Bright Orange Gantry)
      const gantryY = 55;
      const gantryHeight = 42;

      // Twin Main Girders
      ctx.fillStyle = "#FF6B00"; // HD Hyundai Samho Goliath Orange
      ctx.fillRect(30, gantryY, w - 60, gantryHeight);

      // Top girder flange & bottom flange
      ctx.fillStyle = "#E05A00";
      ctx.fillRect(30, gantryY, w - 60, 6);
      ctx.fillRect(30, gantryY + gantryHeight - 6, w - 60, 6);

      // Gantry Truss X-bracing details
      ctx.strokeStyle = "rgba(0, 0, 0, 0.25)";
      ctx.lineWidth = 2;
      for (let gx = 45; gx < w - 60; gx += 45) {
        ctx.beginPath();
        ctx.moveTo(gx, gantryY + 6);
        ctx.lineTo(gx + 40, gantryY + gantryHeight - 6);
        ctx.moveTo(gx + 40, gantryY + 6);
        ctx.lineTo(gx, gantryY + gantryHeight - 6);
        ctx.stroke();
      }

      // "HD HYUNDAI SAMHO 900TON" Bold Lettering on Gantry
      ctx.save();
      ctx.fillStyle = "#002C6C";
      ctx.font = "900 13px 'HD Hyundai', sans-serif, system-ui";
      ctx.textAlign = "center";
      ctx.fillText("HD HYUNDAI SAMHO  •  900T GOLIATH CRANE", w / 2, gantryY + 26);
      ctx.restore();

      // Goliath Crane Giant Legs (Left & Right)
      ctx.fillStyle = "#E05A00";
      ctx.fillRect(20, gantryY, 25, 310);
      ctx.fillRect(w - 45, gantryY, 25, 310);
      // Rail Bogies
      ctx.fillStyle = "#1e293b";
      ctx.fillRect(10, 355, 45, 12);
      ctx.fillRect(w - 55, 355, 45, 12);

      // 3. Hoist Trolleys & Wire Ropes
      const trolleyMainX = 250;
      const trolleyAuxX = 370;

      // Trolley 1: Main Hoist (주권)
      ctx.fillStyle = "#334155";
      ctx.fillRect(trolleyMainX - 25, gantryY + gantryHeight, 50, 16);
      ctx.fillStyle = "#00A352";
      ctx.fillRect(trolleyMainX - 20, gantryY + gantryHeight + 2, 12, 12); // Green status

      // Trolley 2: Aux Hoist (보권)
      ctx.fillStyle = "#334155";
      ctx.fillRect(trolleyAuxX - 25, gantryY + gantryHeight, 50, 16);
      ctx.fillStyle = "#007AFF";
      ctx.fillRect(trolleyAuxX + 8, gantryY + gantryHeight + 2, 12, 12); // Blue status

      // Cable Drop Points to Hull Block
      // Block Center
      const blockCenterX = 310;
      const blockCenterY = (s.mainHoistY + s.auxHoistY) / 2 + 60;
      const blockRadius = 75;

      // Attachment lugs on block
      const lugAngle1 = s.angle;
      const lugAngle2 = s.angle + Math.PI;

      const lug1X = blockCenterX - Math.cos(lugAngle1) * 70;
      const lug1Y = blockCenterY - Math.sin(lugAngle1) * 70;
      const lug2X = blockCenterX + Math.cos(lugAngle1) * 70;
      const lug2Y = blockCenterY + Math.sin(lugAngle1) * 70;

      // Draw Main Hoist Wire (Twin steel ropes)
      ctx.strokeStyle = s.mainTension > 650 ? "#FF3B30" : "#cbd5e1";
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(trolleyMainX - 6, gantryY + gantryHeight + 16);
      ctx.lineTo(lug1X - 3, lug1Y);
      ctx.moveTo(trolleyMainX + 6, gantryY + gantryHeight + 16);
      ctx.lineTo(lug1X + 3, lug1Y);
      ctx.stroke();

      // Main Hook Block
      ctx.fillStyle = "#F5A623";
      ctx.fillRect(lug1X - 8, lug1Y - 14, 16, 12);

      // Draw Aux Hoist Wire (Twin steel ropes)
      ctx.strokeStyle = s.auxTension > 650 ? "#FF3B30" : "#cbd5e1";
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(trolleyAuxX - 6, gantryY + gantryHeight + 16);
      ctx.lineTo(lug2X - 3, lug2Y);
      ctx.moveTo(trolleyAuxX + 6, gantryY + gantryHeight + 16);
      ctx.lineTo(lug2X + 3, lug2Y);
      ctx.stroke();

      // Aux Hook Block
      ctx.fillStyle = "#F5A623";
      ctx.fillRect(lug2X - 8, lug2Y - 14, 16, 12);

      // 4. Draw Mega-block 3D Hull Section (Turnover Target)
      ctx.save();
      ctx.translate(blockCenterX, blockCenterY);
      ctx.rotate(s.angle);

      // Hull curved shell plate (선체 외판 형상)
      ctx.beginPath();
      ctx.moveTo(-80, -35);
      ctx.lineTo(80, -35);
      ctx.quadraticCurveTo(75, 45, 0, 50);
      ctx.quadraticCurveTo(-75, 45, -80, -35);
      ctx.closePath();

      // Hull coating color (Upper deck dark / bottom hull HD Navy)
      const hullGrad = ctx.createLinearGradient(0, -35, 0, 50);
      hullGrad.addColorStop(0, "#1d3557");
      hullGrad.addColorStop(0.6, "#002C6C");
      hullGrad.addColorStop(1, "#b91c1c"); // Red bottom primer
      ctx.fillStyle = hullGrad;
      ctx.fill();

      ctx.strokeStyle = "#94a3b8";
      ctx.lineWidth = 3;
      ctx.stroke();

      // Internal stiffeners & web frames (종골 및 격벽 보강재)
      ctx.strokeStyle = "rgba(255, 255, 255, 0.25)";
      ctx.lineWidth = 1.5;
      for (let ix = -60; ix <= 60; ix += 24) {
        ctx.beginPath();
        ctx.moveTo(ix, -32);
        ctx.lineTo(ix, 35 - Math.abs(ix) * 0.25);
        ctx.stroke();
      }

      // Lifting Lugs (샤클 체결 러그)
      ctx.fillStyle = "#facc15";
      ctx.fillRect(-74, -8, 12, 16);
      ctx.fillRect(62, -8, 12, 16);

      // Block Tag / Orientation Indicator
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 10px monospace";
      ctx.textAlign = "center";
      ctx.fillText("HULL-BLOCK #108A (800T)", 0, -10);
      ctx.fillStyle = currentDeg > 90 ? "#4ade80" : "#f87171";
      ctx.fillText(currentDeg > 90 ? "▲ TOP DECK (INVERTED)" : "▼ BASE BOTTOM", 0, 15);

      ctx.restore();

      // 5. Center of Gravity (CoG) & Wind Indicator
      ctx.save();
      ctx.fillStyle = "#FF3B30";
      ctx.beginPath();
      ctx.arc(blockCenterX, blockCenterY, 4, 0, Math.PI * 2);
      ctx.fill();

      // Direction vector arrow
      ctx.strokeStyle = "#FF3B30";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(blockCenterX, blockCenterY);
      ctx.lineTo(blockCenterX, blockCenterY + 30);
      ctx.stroke();
      ctx.restore();

      // 6. Stability bar on canvas
      ctx.save();
      ctx.fillStyle = "rgba(15, 23, 42, 0.85)";
      ctx.fillRect(15, h - 45, 220, 32);
      ctx.strokeStyle = "#475569";
      ctx.strokeRect(15, h - 45, 220, 32);

      ctx.fillStyle = s.stability > 50 ? "#00FFC2" : s.stability > 25 ? "#F5A623" : "#FF3B30";
      ctx.fillRect(20, h - 30, (210 * Math.max(0, s.stability)) / 100, 12);

      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 10px sans-serif";
      ctx.fillText(`와이어 하중 안정도: ${Math.round(s.stability)}%`, 22, h - 34);
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
          <Anchor className="w-4 h-4 text-amber-500" />
          <span className="font-bold text-[13px] text-amber-400">900톤 골리앗 크레인 메가블록 턴오버</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 text-[11px] bg-slate-800 px-2 py-0.5 rounded text-slate-300">
            <Wind className="w-3.5 h-3.5 text-sky-400" />
            <span>풍속 {windKnots} kts</span>
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
          <div className="text-[10px] text-slate-400">턴오버 각도</div>
          <div className="text-[16px] font-black text-amber-400 font-mono">{angleDeg}° / 180°</div>
        </div>
        <div>
          <div className="text-[10px] text-slate-400">주권 와이어 하중</div>
          <div className={`text-[16px] font-black font-mono ${mainTension > 650 ? "text-rose-500 animate-pulse" : "text-emerald-400"}`}>
            {mainTension} T
          </div>
        </div>
        <div>
          <div className="text-[10px] text-slate-400">보권 와이어 하중</div>
          <div className={`text-[16px] font-black font-mono ${auxTension > 650 ? "text-rose-500 animate-pulse" : "text-sky-400"}`}>
            {auxTension} T
          </div>
        </div>
        <div>
          <div className="text-[10px] text-slate-400">공학 안전 점수</div>
          <div className="text-[16px] font-black text-cyan-400 font-mono">{score.toLocaleString()}</div>
        </div>
      </div>

      {/* Main Canvas Viewport */}
      <div className="relative w-full aspect-[620/520] bg-slate-950 overflow-hidden border-x border-b border-slate-800">
        <canvas ref={canvasRef} width={620} height={520} className="w-full h-full block" />

        {/* READY Overlay */}
        {gameState === "READY" && (
          <div className="absolute inset-0 bg-slate-950/85 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center text-white">
            <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center mb-4 text-amber-500 shadow-lg shadow-amber-500/20">
              <Anchor className="w-8 h-8" />
            </div>
            <h3 className="text-xl font-black mb-2 text-white">
              900톤 골리앗 크레인 메가블록 턴오버
            </h3>
            <p className="text-sm text-slate-300 max-w-md mb-6 leading-relaxed">
              조선소 현장의 가장 웅장한 공학 작업!
              <br />
              800톤 대형 선체 블록을 주권(Main Hoist)과 보권(Aux Hoist)의 와이어 밸런스를 맞춰 공중에서 180도 뒤집어 지그에 안착시키세요.
            </p>
            <div className="flex flex-col gap-2 text-xs text-slate-400 bg-slate-900/80 p-3.5 rounded-xl border border-slate-800 mb-6 max-w-sm">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
                <span>[▲ / ▼] 키 또는 버튼: 주권(Main) 권상/권하 조절</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-sky-400" />
                <span>[◀ / ▶] 키 또는 버튼: 보권(Aux) 권상/권하 조절</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-rose-400" />
                <span>와이어 장력이 650T을 넘지 않도록 서서히 180° 회전</span>
              </div>
            </div>
            <button
              onClick={startGame}
              className="px-8 py-3 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white font-bold rounded-xl shadow-lg shadow-amber-600/30 flex items-center gap-2 transition-all transform active:scale-95"
            >
              <Play className="w-5 h-5 fill-current" />
              <span>턴오버 권상 개시</span>
            </button>
          </div>
        )}

        {/* GAMEOVER Overlay */}
        {gameState === "GAMEOVER" && (
          <div className="absolute inset-0 bg-slate-950/85 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center text-white animate-in fade-in duration-300">
            <div className={`w-16 h-16 rounded-full flex items-center justify-center mb-3 ${angleDeg >= 170 ? "bg-emerald-500/20 text-emerald-400" : "bg-rose-500/20 text-rose-400"}`}>
              {angleDeg >= 170 ? <Shield className="w-9 h-9" /> : <ArrowLeftRight className="w-9 h-9" />}
            </div>
            <h3 className="text-2xl font-black mb-1 text-white">
              {angleDeg >= 170 ? "메가블록 180° 턴오버 성공!" : "턴오버 작업 중단 (안전 하중 초과)"}
            </h3>
            <div className="text-xs text-slate-400 mb-4">
              {angleDeg >= 170 ? "도크 지그에 오차 없이 안전 안착 완료" : "와이어 로프 과부하 감지 및 비상 정지"}
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 w-full max-w-xs mb-6 shadow-xl space-y-2">
              <div className="flex justify-between items-center text-sm">
                <span className="text-slate-400">최종 획득 점수</span>
                <span className="text-xl font-black text-amber-400 font-mono">{score.toLocaleString()}점</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-400">최종 회전 각도</span>
                <span className="font-bold text-cyan-400 font-mono">{angleDeg}° / 180°</span>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={startGame}
                className="px-6 py-2.5 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white font-bold rounded-xl shadow-lg flex items-center gap-2 transition-all active:scale-95 text-sm"
              >
                <RotateCcw className="w-4 h-4" />
                <span>재작업 도전</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Bottom Interactive Controls (Touch & Click Support) */}
      <div className="w-full bg-slate-900 px-4 py-3 rounded-b-[16px] border border-t-0 border-slate-800 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-slate-300">주권(Main):</span>
          <button
            onClick={() => adjustHoists(-8, 0)}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 active:scale-95 text-xs font-bold text-emerald-400 rounded-lg border border-slate-700"
          >
            ▲ 올림 (권상)
          </button>
          <button
            onClick={() => adjustHoists(8, 0)}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 active:scale-95 text-xs font-bold text-slate-300 rounded-lg border border-slate-700"
          >
            ▼ 내림 (권하)
          </button>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-slate-300">보권(Aux):</span>
          <button
            onClick={() => adjustHoists(0, -8)}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 active:scale-95 text-xs font-bold text-sky-400 rounded-lg border border-slate-700"
          >
            ▲ 올림 (권상)
          </button>
          <button
            onClick={() => adjustHoists(0, 8)}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 active:scale-95 text-xs font-bold text-slate-300 rounded-lg border border-slate-700"
          >
            ▼ 내림 (권하)
          </button>
        </div>
      </div>
    </div>
  );
}
