import React, { useState, useEffect, useRef } from "react";
import { Play, RotateCcw, Volume2, VolumeX, Waves, AlertTriangle, ShieldCheck, Sparkles, Gauge, Compass } from "lucide-react";
import confetti from "canvas-confetti";
import { gameAudio } from "../../lib/gameSounds";

interface DockWaterGameProps {
  onFinish: (score: number) => void;
}

export default function DockWaterGame({ onFinish }: DockWaterGameProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [success, setSuccess] = useState(false);
  const [score, setScore] = useState(0);
  const [waterLevel, setWaterLevel] = useState(0); // 0 to 100%
  const [shipAngle, setShipAngle] = useState(0); // degrees tilt (-5 to +5)
  const [phase, setPhase] = useState<1 | 2 | 3>(1); // 1: 선저 주수, 2: 기주 분리(Float-off), 3: 도크 개방
  const [isMuted, setIsMuted] = useState(gameAudio.getMuted());
  const [warningMsg, setWarningMsg] = useState("");
  const [surgeAlert, setSurgeAlert] = useState<string | null>(null);

  // 4 Sluice Valves
  const [valves, setValves] = useState<{
    bowPort: boolean; // 선수 좌현
    bowStbd: boolean; // 선수 우현
    sternPort: boolean; // 선미 좌현
    sternStbd: boolean; // 선미 우현
  }>({
    bowPort: false,
    bowStbd: false,
    sternPort: false,
    sternStbd: false,
  });

  const stateRef = useRef({
    waterLevel: 0,
    angle: 0,
    angularVelocity: 0,
    valves: { bowPort: false, bowStbd: false, sternPort: false, sternStbd: false },
    score: 0,
    timeElapsed: 0,
    nextSurgeTime: 3.5,
    surgeSector: -1, // 0: Port surge, 1: Starboard surge
    surgeTorque: 0,
    userActionCount: 0,
    waterParticles: [] as Array<{ x: number; y: number; vx: number; vy: number; life: number; color: string }>,
  });

  const toggleSound = () => {
    const muted = gameAudio.toggleMute();
    setIsMuted(muted);
  };

  const toggleValve = (key: "bowPort" | "bowStbd" | "sternPort" | "sternStbd") => {
    if (!isPlaying || gameOver || success) return;
    gameAudio.playValveTurn();
    stateRef.current.userActionCount++;
    setValves((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      stateRef.current.valves = next;
      return next;
    });
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
    setWarningMsg("");
    setSurgeAlert(null);

    const initialValves = { bowPort: false, bowStbd: false, sternPort: false, sternStbd: false };
    setValves(initialValves);

    stateRef.current = {
      waterLevel: 0,
      angle: 0,
      angularVelocity: 0,
      valves: initialValves,
      score: 0,
      timeElapsed: 0,
      nextSurgeTime: 3.5,
      surgeSector: -1,
      surgeTorque: 0,
      userActionCount: 0,
      waterParticles: [],
    };
  };

  // Keyboard shortcut handlers (1, 2, 3, 4)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isPlaying || gameOver || success) return;
      if (e.key === "1") toggleValve("bowPort");
      else if (e.key === "2") toggleValve("bowStbd");
      else if (e.key === "3") toggleValve("sternPort");
      else if (e.key === "4") toggleValve("sternStbd");
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isPlaying, gameOver, success]);

  // Main simulation & render loop
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = mountRef.current;
    if (!canvas || !container) return;

    let animId = 0;
    let lastTime = performance.now();

    const resize = () => {
      const rect = container.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.max(320, Math.floor(rect.width));
      const h = Math.max(260, Math.floor(rect.height));

      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
    };

    const ro = new ResizeObserver(() => resize());
    ro.observe(container);
    resize();

    const render = (now: number) => {
      const dt = Math.min((now - lastTime) / 1000, 0.08);
      lastTime = now;

      const st = stateRef.current;
      const v = st.valves;
      const rect = container.getBoundingClientRect();
      const w = rect.width;
      const h = rect.height;

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      ctx.save();
      ctx.scale(dpr, dpr);

      if (isPlaying && !gameOver && !success) {
        st.timeElapsed += dt;

        // 1. Water Inflow calculation
        let openCount = 0;
        if (v.bowPort) openCount++;
        if (v.bowStbd) openCount++;
        if (v.sternPort) openCount++;
        if (v.sternStbd) openCount++;

        // Water level rises proportional to open valves
        if (openCount > 0) {
          st.waterLevel = Math.min(100, st.waterLevel + openCount * 1.65 * dt);
        }
        setWaterLevel(Math.round(st.waterLevel));

        // Phase update
        let currentPhase: 1 | 2 | 3 = 1;
        if (st.waterLevel < 40) currentPhase = 1; // 선저 안착 침수
        else if (st.waterLevel < 78) currentPhase = 2; // 기주 분리 임계구간 (선박 부유 시작 - 최대 롤링 불안정)
        else currentPhase = 3; // 도크 개방 수위 동기화
        setPhase(currentPhase);

        // 2. Dynamic Tidal Surge Trigger (Every 3.5 ~ 5 seconds)
        // This ensures sitting idle with all 4 valves open WILL CAUSE AN ASYMMETRIC OVERTURNING SURGE!
        if (st.timeElapsed >= st.nextSurgeTime) {
          st.nextSurgeTime = st.timeElapsed + 3.5 + Math.random() * 2.0;
          st.surgeSector = Math.random() < 0.5 ? 0 : 1; // 0: Port surge, 1: Starboard surge
          st.surgeTorque = (st.surgeSector === 0 ? -1 : 1) * (2.8 + Math.random() * 1.4);

          setSurgeAlert(
            st.surgeSector === 0
              ? "⚡ 외해 조류 서지: [좌현 주수구] 수압 급상승! (반대편 밸브로 균형 조절)"
              : "⚡ 외해 조류 서지: [우현 주수구] 수압 급상승! (반대편 밸브로 균형 조절)"
          );
        }

        // Surge decays over 2.5 seconds
        if (Math.abs(st.surgeTorque) > 0.05) {
          st.surgeTorque *= Math.pow(0.65, dt);
        } else {
          st.surgeTorque = 0;
          if (surgeAlert) setSurgeAlert(null);
        }

        // 3. Torque & Inclinometer Dynamics
        let netTorque = 0;

        // Valve asymmetric inflows:
        // Left valves (Port) push right (+roll); Right valves (Starboard) push left (-roll)
        const portTorque = (v.bowPort ? 1.8 : 0) + (v.sternPort ? 1.8 : 0);
        const stbdTorque = (v.bowStbd ? 1.8 : 0) + (v.sternStbd ? 1.8 : 0);
        netTorque += (portTorque - stbdTorque);

        // Add Tidal Surge push
        netTorque += st.surgeTorque;

        // Environmental hydrodynamic instability during float-off
        if (currentPhase === 2) {
          netTorque += Math.sin(now * 0.003) * 1.5;
        }

        // Keel block ground friction: when seated (< 35%), blocks limit rotation;
        // When lifted off (> 40%), GM stability is delicate!
        const blockFriction = st.waterLevel < 35 ? 0.35 : 1.1;
        st.angularVelocity += netTorque * blockFriction * dt * 2.2;
        st.angularVelocity *= Math.pow(0.88, dt * 60); // roll damping

        st.angle += st.angularVelocity * dt;
        const currentAngle = +(st.angle.toFixed(1));
        setShipAngle(currentAngle);

        // Score based on staying level within green zone (±1.0°)
        if (openCount > 0) {
          if (Math.abs(st.angle) <= 1.0) {
            st.score += Math.round(dt * 220); // PERFECT balance
          } else if (Math.abs(st.angle) <= 2.2) {
            st.score += Math.round(dt * 90);
          }
          setScore(st.score);
        }

        // Warnings
        if (Math.abs(st.angle) >= 2.6) {
          setWarningMsg("위험: 횡경사 쏠림 심각! 반대편 주수 밸브를 열어 즉시 수평을 복구하세요!");
        } else if (currentPhase === 2) {
          setWarningMsg("기주 분리 임계구간: 선체가 반목에서 떠오르는 중! (수평 유지 요망)");
        } else {
          setWarningMsg("");
        }

        // 4. Failure Check: Angle exceeds ±3.6 degrees (Keel Block Slip / Wall Impact)
        if (Math.abs(st.angle) >= 3.6) {
          gameAudio.playBomb();
          gameAudio.playFailure();
          setGameOver(true);
          setIsPlaying(false);
          onFinish(st.score);
        }

        // 5. Success Check: Water reaches 100% while well balanced!
        if (st.waterLevel >= 100) {
          if (Math.abs(st.angle) <= 1.5) {
            gameAudio.playVictory();
            setSuccess(true);
            setIsPlaying(false);
            const finalScore = st.score + 4000;
            setScore(finalScore);
            onFinish(finalScore);
            confetti({ particleCount: 90, spread: 80, origin: { y: 0.6 } });
          } else {
            // Reached 100% but ship is tilted/jammed
            gameAudio.playDrop();
            setGameOver(true);
            setIsPlaying(false);
            onFinish(st.score);
          }
        }
      }

      // --- RENDERING DRYDOCK 2D GRAPHICS ---
      ctx.clearRect(0, 0, w, h);

      const dockLeft = 50;
      const dockRight = w - 50;
      const dockBottom = h - 35;
      const dockTop = 50;
      const dockDepth = dockBottom - dockTop;

      // Drydock Pit Concrete Chamber
      ctx.fillStyle = "#1e293b";
      ctx.fillRect(dockLeft, dockTop, dockRight - dockLeft, dockDepth);

      // Dock Quay Walls (Left & Right concrete banks)
      ctx.fillStyle = "#334155";
      ctx.fillRect(0, 0, dockLeft, h);
      ctx.fillRect(dockRight, 0, w - dockRight, h);
      ctx.fillRect(0, dockBottom, w, h - dockBottom);

      // Yellow/Black Hazard Coaming along rim
      for (let y = dockTop; y < dockBottom; y += 20) {
        ctx.fillStyle = (y / 20) % 2 === 0 ? "#facc15" : "#0f172a";
        ctx.fillRect(dockLeft - 6, y, 6, 20);
        ctx.fillRect(dockRight, y, 6, 20);
      }

      // Keel Blocks along bottom
      const keelBlockY = dockBottom - 12;
      for (let bx = dockLeft + 30; bx < dockRight - 30; bx += 28) {
        ctx.fillStyle = "#475569";
        ctx.fillRect(bx, keelBlockY + 4, 16, 8);
        ctx.fillStyle = "#b45309";
        ctx.fillRect(bx, keelBlockY, 16, 4);
      }

      // Rising Seawater
      const currentWaterY = dockBottom - (st.waterLevel / 100) * (dockDepth * 0.88);
      if (st.waterLevel > 0) {
        const waterGrad = ctx.createLinearGradient(0, currentWaterY, 0, dockBottom);
        waterGrad.addColorStop(0, "rgba(56, 189, 248, 0.75)");
        waterGrad.addColorStop(1, "rgba(12, 74, 110, 0.95)");

        ctx.fillStyle = waterGrad;
        ctx.beginPath();
        ctx.moveTo(dockLeft, currentWaterY);
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
      }

      // Sluice Valve Ports in Dock Wall
      // Port valves (Left wall)
      ctx.fillStyle = v.bowPort || v.sternPort ? "#0284c7" : "#0f172a";
      ctx.beginPath();
      ctx.arc(dockLeft + 12, dockBottom - 20, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = v.bowPort || v.sternPort ? "#38bdf8" : "#64748b";
      ctx.lineWidth = 2;
      ctx.stroke();

      // Starboard valves (Right wall)
      ctx.fillStyle = v.bowStbd || v.sternStbd ? "#0284c7" : "#0f172a";
      ctx.beginPath();
      ctx.arc(dockRight - 12, dockBottom - 20, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = v.bowStbd || v.sternStbd ? "#38bdf8" : "#64748b";
      ctx.stroke();

      // 300,000 DWT Container Vessel in Dock
      const midX = w / 2;
      // As water rises above 40%, vessel floats up off the keel blocks
      const floatLift = st.waterLevel < 40 ? 0 : ((st.waterLevel - 40) / 60) * (dockDepth * 0.55);
      const shipBaseY = keelBlockY - floatLift;

      ctx.save();
      ctx.translate(midX, shipBaseY - 45);
      ctx.rotate((st.angle * Math.PI) / 180);

      const shipW = Math.min(180, w * 0.38);
      const shipH = 80;

      // Ship Hull Bottom (Primer Red)
      ctx.fillStyle = "#991b1b";
      ctx.beginPath();
      ctx.roundRect(-shipW / 2, -shipH / 2 + 25, shipW, shipH - 25, [0, 0, 16, 16]);
      ctx.fill();
      ctx.strokeStyle = "#f87171";
      ctx.lineWidth = 2;
      ctx.stroke();

      // Hull Topside (Navy Blue)
      ctx.fillStyle = "#0f172a";
      ctx.fillRect(-shipW / 2, -shipH / 2, shipW, 25);
      ctx.strokeStyle = "#38bdf8";
      ctx.strokeRect(-shipW / 2, -shipH / 2, shipW, 25);

      // Deck Cargo Containers
      ctx.fillStyle = "#f97316";
      for (let cx = -shipW / 2 + 10; cx < shipW / 2 - 10; cx += 22) {
        ctx.fillRect(cx, -shipH / 2 - 14, 18, 14);
      }

      ctx.restore();

      // Center Inclinometer Bubble Gauge at Top of Dock
      const gaugeW = 140;
      const gaugeH = 22;
      const gx = midX - gaugeW / 2;
      const gy = 18;

      ctx.fillStyle = "#020617";
      ctx.beginPath();
      ctx.roundRect(gx, gy, gaugeW, gaugeH, 6);
      ctx.fill();
      ctx.strokeStyle = "#334155";
      ctx.lineWidth = 2;
      ctx.stroke();

      // Green Center Safe Zone (±1.0°)
      const safeWidth = 44;
      ctx.fillStyle = "rgba(34, 197, 94, 0.25)";
      ctx.fillRect(midX - safeWidth / 2, gy + 2, safeWidth, gaugeH - 4);
      ctx.strokeStyle = "#22c55e";
      ctx.strokeRect(midX - safeWidth / 2, gy + 2, safeWidth, gaugeH - 4);

      // Inclinometer Bubble
      const bubbleX = midX + Math.max(-55, Math.min(55, st.angle * 18));
      ctx.beginPath();
      ctx.arc(bubbleX, gy + gaugeH / 2, 7, 0, Math.PI * 2);
      ctx.fillStyle = Math.abs(st.angle) <= 1.0 ? "#22c55e" : Math.abs(st.angle) <= 2.4 ? "#facc15" : "#f43f5e";
      ctx.fill();
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.restore(); // Restore DPR scale

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animId);
      ro.disconnect();
    };
  }, [isPlaying, gameOver, success]);

  return (
    <div className="relative w-full h-full flex flex-col bg-slate-950 font-hd select-none overflow-hidden text-white">
      {/* Top Header HUD */}
      <div className="flex items-center justify-between px-3 py-2 bg-slate-900/95 border-b border-slate-800 shrink-0 z-10 backdrop-blur-md">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-cyan-500/20 text-cyan-400 rounded-lg border border-cyan-500/30">
            <Waves className="w-4 h-4" />
          </div>
          <div>
            <div className="text-xs font-black text-slate-100 flex items-center gap-1.5">
              드라이도크 안전 진수식 (Undocking)
              <span className="text-[10px] px-1.5 py-0.2 bg-cyan-500/20 text-cyan-300 rounded font-bold">
                PHASE {phase}/3
              </span>
            </div>
            <div className="text-[10px] text-slate-400 hidden sm:block">
              {phase === 1 ? "1단계: 선저 침수" : phase === 2 ? "2단계: 기주 분리(Float-off) 수평 제어" : "3단계: 도크 게이트 개방 및 출항"}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-4">
          {/* Water Level */}
          <div className="flex items-center gap-1 bg-slate-800/80 px-2 py-1 rounded-md border border-slate-700">
            <Gauge className="w-3.5 h-3.5 text-cyan-400" />
            <span className="text-xs font-black text-cyan-300 font-mono">{waterLevel}%</span>
          </div>

          {/* Ship List Tilt */}
          <div className="flex items-center gap-1 bg-slate-800/80 px-2 py-1 rounded-md border border-slate-700">
            <Compass className="w-3.5 h-3.5 text-amber-400" />
            <span
              className={`text-xs font-black font-mono ${
                Math.abs(shipAngle) <= 1.0
                  ? "text-emerald-300"
                  : Math.abs(shipAngle) <= 2.2
                  ? "text-amber-300"
                  : "text-rose-400 animate-pulse"
              }`}
            >
              {shipAngle > 0 ? `+${shipAngle}` : shipAngle}°
            </span>
          </div>

          {/* Score */}
          <div className="flex items-center gap-1.5 bg-cyan-950/80 px-2.5 py-1 rounded-md border border-cyan-700">
            <span className="text-xs sm:text-sm font-black text-amber-300 tabular-nums">
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

      {/* Main Canvas Viewport (100% Flex, responsive fit) */}
      <div ref={mountRef} className="relative flex-1 w-full min-h-0 overflow-hidden bg-slate-900">
        <canvas ref={canvasRef} className="absolute inset-0 block w-full h-full" />

        {/* Dynamic Surge Alert Toast */}
        {surgeAlert && (
          <div className="absolute top-12 left-1/2 -translate-x-1/2 pointer-events-none z-20 animate-in fade-in zoom-in-95 duration-150">
            <div className="px-3.5 py-1.5 rounded-full text-xs font-black bg-rose-950/90 border border-rose-500 text-rose-300 shadow-xl">
              {surgeAlert}
            </div>
          </div>
        )}

        {/* READY Overlay */}
        {!isPlaying && !gameOver && !success && (
          <div className="absolute inset-0 bg-slate-950/85 backdrop-blur-sm flex flex-col items-center justify-center p-4 text-center z-20">
            <div className="w-14 h-14 rounded-2xl bg-cyan-500/20 border border-cyan-500/30 flex items-center justify-center mb-3 text-cyan-400 shadow-lg">
              <Waves className="w-8 h-8" />
            </div>
            <h3 className="text-lg sm:text-xl font-black text-white mb-2">
              드라이도크 안전 진수식 (Undocking Balancing)
            </h3>
            <p className="text-xs sm:text-sm text-slate-300 max-w-md mb-4 leading-relaxed">
              조선소 드라이도크에 해수를 주수하여 거대 선박을 안전하게 바다로 띄우세요!<br />
              <strong>4개 구역 주수 밸브</strong>를 조작하여 수위를 100%까지 채우되,
              외해 조류 서지와 불균형 수압으로 인한 선체 경사가 <strong>±1.0° 안전 범위</strong>를
              벗어나지 않도록 실시간 밸브 개폐로 수평을 맞추어야 합니다.
            </p>

            <div className="flex flex-wrap items-center justify-center gap-3 text-xs text-slate-400 mb-6 bg-slate-900/90 px-4 py-2.5 rounded-xl border border-slate-800">
              <div className="flex items-center gap-1">
                <span className="px-1.5 py-0.5 bg-slate-800 rounded font-mono font-bold text-cyan-300">
                  숫자키 1, 2, 3, 4
                </span>
                <span>4개 밸브 개별 개폐</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="px-1.5 py-0.5 bg-slate-800 rounded font-mono font-bold text-amber-300">
                  ±3.5° 초과 시
                </span>
                <span>반목 전도 전복 실패</span>
              </div>
            </div>

            <button
              onClick={startGame}
              className="px-6 py-2.5 bg-cyan-600 hover:bg-cyan-500 active:scale-95 text-white font-black text-sm rounded-xl shadow-lg shadow-cyan-600/30 transition-all flex items-center gap-2 cursor-pointer"
            >
              <Play className="w-4 h-4 fill-white" />
              도크 주수 진수 시작
            </button>
          </div>
        )}

        {/* GAMEOVER Overlay */}
        {gameOver && (
          <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-md flex flex-col items-center justify-center p-4 text-center z-20 animate-in fade-in zoom-in-95">
            <div className="w-14 h-14 rounded-2xl bg-rose-500/20 border border-rose-500/30 flex items-center justify-center mb-2 text-rose-400">
              <AlertTriangle className="w-8 h-8" />
            </div>
            <h3 className="text-lg sm:text-xl font-black text-white mb-1">
              선체 경사 초과 / 반목 전도 사고
            </h3>
            <p className="text-xs text-slate-300 max-w-sm mb-4">
              불균형 주수로 인해 선체 경사가 위험 한계(±3.5°)를 초과하여 진수 작업이 중단되었습니다.
              조류 서지가 발생하는 쪽의 밸브를 신속히 닫고 반대편을 열어 균형을 회복해야 합니다.
            </p>
            <div className="bg-slate-900 border border-slate-800 px-4 py-2 rounded-xl mb-4">
              <span className="text-[10px] text-slate-400 block">달성 점수</span>
              <span className="text-xl font-black text-amber-300 tabular-nums">{score.toLocaleString()}점</span>
            </div>

            <button
              onClick={startGame}
              className="px-6 py-2.5 bg-cyan-600 hover:bg-cyan-500 active:scale-95 text-white font-black text-sm rounded-xl shadow-lg shadow-cyan-600/30 transition-all flex items-center gap-2 cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
              다시 진수하기
            </button>
          </div>
        )}

        {/* SUCCESS Overlay */}
        {success && (
          <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-md flex flex-col items-center justify-center p-4 text-center z-20 animate-in fade-in zoom-in-95">
            <div className="w-14 h-14 rounded-2xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center mb-2 text-amber-400">
              <Sparkles className="w-8 h-8" />
            </div>
            <h3 className="text-lg sm:text-xl font-black text-white mb-1">
              무사고 명품 진수식 성공!
            </h3>
            <div className="text-2xl sm:text-3xl font-black text-amber-300 mb-2">
              최종 점수: {score.toLocaleString()}점
            </div>
            <p className="text-xs text-slate-300 max-w-sm mb-5">
              완벽한 수평 제어로 30만 톤급 선박이 해수면에 성공적으로 부유하여 도크 게이트를 통과하였습니다!
            </p>

            <button
              onClick={startGame}
              className="px-6 py-2.5 bg-cyan-600 hover:bg-cyan-500 active:scale-95 text-white font-black text-sm rounded-xl shadow-lg shadow-cyan-600/30 transition-all flex items-center gap-2 cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
              다시 진수하기
            </button>
          </div>
        )}
      </div>

      {/* Control Panel: 4 Industrial Sluice Gate Valves */}
      <div className="px-3 py-2 bg-slate-900 border-t border-slate-800 shrink-0 z-10 grid grid-cols-2 sm:grid-cols-4 gap-2">
        <button
          onClick={() => toggleValve("bowPort")}
          disabled={!isPlaying}
          className={`p-2 rounded-lg border flex flex-col items-center justify-center transition-all cursor-pointer ${
            valves.bowPort
              ? "bg-cyan-500/25 border-cyan-400 text-cyan-200 shadow-md font-bold"
              : "bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-750 hover:text-white"
          }`}
        >
          <span className="text-xs font-bold flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${valves.bowPort ? "bg-cyan-400 animate-pulse" : "bg-slate-600"}`} />
            [1] 선수 좌현 밸브
          </span>
          <span className="text-[10px] text-slate-400 mt-0.5">
            {valves.bowPort ? "유입 중 (우경사 토크)" : "닫힘 (클릭)"}
          </span>
        </button>

        <button
          onClick={() => toggleValve("bowStbd")}
          disabled={!isPlaying}
          className={`p-2 rounded-lg border flex flex-col items-center justify-center transition-all cursor-pointer ${
            valves.bowStbd
              ? "bg-cyan-500/25 border-cyan-400 text-cyan-200 shadow-md font-bold"
              : "bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-750 hover:text-white"
          }`}
        >
          <span className="text-xs font-bold flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${valves.bowStbd ? "bg-cyan-400 animate-pulse" : "bg-slate-600"}`} />
            [2] 선수 우현 밸브
          </span>
          <span className="text-[10px] text-slate-400 mt-0.5">
            {valves.bowStbd ? "유입 중 (좌경사 토크)" : "닫힘 (클릭)"}
          </span>
        </button>

        <button
          onClick={() => toggleValve("sternPort")}
          disabled={!isPlaying}
          className={`p-2 rounded-lg border flex flex-col items-center justify-center transition-all cursor-pointer ${
            valves.sternPort
              ? "bg-amber-500/25 border-amber-400 text-amber-200 shadow-md font-bold"
              : "bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-750 hover:text-white"
          }`}
        >
          <span className="text-xs font-bold flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${valves.sternPort ? "bg-amber-400 animate-pulse" : "bg-slate-600"}`} />
            [3] 선미 좌현 밸브
          </span>
          <span className="text-[10px] text-slate-400 mt-0.5">
            {valves.sternPort ? "유입 중 (우경사 토크)" : "닫힘 (클릭)"}
          </span>
        </button>

        <button
          onClick={() => toggleValve("sternStbd")}
          disabled={!isPlaying}
          className={`p-2 rounded-lg border flex flex-col items-center justify-center transition-all cursor-pointer ${
            valves.sternStbd
              ? "bg-amber-500/25 border-amber-400 text-amber-200 shadow-md font-bold"
              : "bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-750 hover:text-white"
          }`}
        >
          <span className="text-xs font-bold flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${valves.sternStbd ? "bg-amber-400 animate-pulse" : "bg-slate-600"}`} />
            [4] 선미 우현 밸브
          </span>
          <span className="text-[10px] text-slate-400 mt-0.5">
            {valves.sternStbd ? "유입 중 (좌경사 토크)" : "닫힘 (클릭)"}
          </span>
        </button>
      </div>
    </div>
  );
}
