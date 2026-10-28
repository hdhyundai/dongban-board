import React, { useState, useEffect, useRef } from "react";
import { Play, RotateCcw, Volume2, VolumeX, Waves, AlertTriangle, ShieldCheck, Sparkles } from "lucide-react";
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
  const [bowValve, setBowValve] = useState(false); // 선수
  const [sternValve, setSternValve] = useState(false); // 선미
  const [portPump, setPortPump] = useState(false); // 좌현 배수
  const [starboardPump, setStarboardPump] = useState(false); // 우현 배수
  const [isMuted, setIsMuted] = useState(gameAudio.getMuted());
  const [warningMsg, setWarningMsg] = useState("");

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stateRef = useRef({
    waterLevel: 0,
    angle: 0,
    bowValve: false,
    sternValve: false,
    portPump: false,
    starboardPump: false,
    score: 0,
    timeElapsed: 0,
    confetti: [] as { x: number; y: number; vx: number; vy: number; color: string; size: number }[],
  });

  const toggleSound = () => {
    const muted = gameAudio.toggleMute();
    setIsMuted(muted);
  };

  const startGame = () => {
    gameAudio.playClick();
    setIsPlaying(true);
    setGameOver(false);
    setSuccess(false);
    setScore(0);
    setWaterLevel(0);
    setShipAngle(0);
    setBowValve(true);
    setSternValve(true);
    setPortPump(false);
    setStarboardPump(false);
    setWarningMsg("");

    stateRef.current = {
      waterLevel: 0,
      angle: 0,
      bowValve: true,
      sternValve: true,
      portPump: false,
      starboardPump: false,
      score: 0,
      timeElapsed: 0,
      confetti: [],
    };
  };

  // Toggle valves & pumps
  const toggleBow = () => {
    gameAudio.playValveTurn();
    setBowValve((prev) => {
      stateRef.current.bowValve = !prev;
      return !prev;
    });
  };

  const toggleStern = () => {
    gameAudio.playValveTurn();
    setSternValve((prev) => {
      stateRef.current.sternValve = !prev;
      return !prev;
    });
  };

  const togglePort = () => {
    gameAudio.playWaterRush();
    setPortPump((prev) => {
      stateRef.current.portPump = !prev;
      return !prev;
    });
  };

  const toggleStarboard = () => {
    gameAudio.playWaterRush();
    setStarboardPump((prev) => {
      stateRef.current.starboardPump = !prev;
      return !prev;
    });
  };

  useEffect(() => {
    if (!isPlaying || gameOver || success) return;

    let animId: number;
    let lastTime = performance.now();
    let waveOffset = 0;

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

    const loop = (now: number) => {
      const dt = Math.min((now - lastTime) / 1000, 0.1);
      lastTime = now;
      waveOffset += dt * 3;

      const st = stateRef.current;
      st.timeElapsed += dt;

      // Calculate inflow and tilt balance
      let inflow = 0;
      let angleDelta = 0;

      // Random tidal fluctuation
      const tidalSurge = Math.sin(now / 1400) * 0.45;

      if (st.bowValve) {
        inflow += 2.2;
        angleDelta -= 0.65; // bow heavier (front goes down)
      }
      if (st.sternValve) {
        inflow += 2.2;
        angleDelta += 0.65; // stern heavier
      }
      if (st.portPump) {
        angleDelta += 0.9;
        inflow -= 0.6;
      }
      if (st.starboardPump) {
        angleDelta -= 0.9;
        inflow -= 0.6;
      }

      // Physics damping & water level integration
      st.waterLevel = Math.min(100, Math.max(0, st.waterLevel + inflow * dt * 2.8));
      st.angle += (angleDelta + tidalSurge) * dt * 2.2;
      st.angle *= 0.985; // natural stabilization resistance

      setWaterLevel(Math.round(st.waterLevel));
      setShipAngle(parseFloat(st.angle.toFixed(1)));

      // Score accumulation based on balance
      if (Math.abs(st.angle) < 1.5) {
        st.score += Math.round(dt * 150);
      } else if (Math.abs(st.angle) < 3.0) {
        st.score += Math.round(dt * 80);
      }

      setScore(st.score);

      // Warning check
      if (Math.abs(st.angle) >= 4.2) {
        setWarningMsg("경고: 선체 기울기 한계치 임박! 밸브 균형을 조정하세요!");
      } else {
        setWarningMsg("");
      }

      // Tilt failure condition
      if (Math.abs(st.angle) >= 6.5) {
        gameAudio.playBomb();
        setGameOver(true);
        setIsPlaying(false);
        onFinish(st.score);
        return;
      }

      // Success condition: Dock water level reached 100%
      if (st.waterLevel >= 100) {
        gameAudio.playShipHorn();
        gameAudio.playVictory();
        setSuccess(true);
        setIsPlaying(false);
        const finalScore = st.score + 2500;
        setScore(finalScore);
        onFinish(finalScore);

        // Populate celebratory confetti
        for (let c = 0; c < 80; c++) {
          st.confetti.push({
            x: w / 2 + (Math.random() - 0.5) * 120,
            y: h / 2,
            vx: (Math.random() - 0.5) * 400,
            vy: -150 - Math.random() * 300,
            color: ["#ffd700", "#00e5ff", "#ff4081", "#76ff03", "#ffffff"][Math.floor(Math.random() * 5)],
            size: 4 + Math.random() * 5,
          });
        }
        return;
      }

      // Draw Graphics
      ctx.clearRect(0, 0, w, h);

      // 1. Sky & Dry dock walls
      const skyGrad = ctx.createLinearGradient(0, 0, 0, h);
      skyGrad.addColorStop(0, "#0b1528");
      skyGrad.addColorStop(0.6, "#182944");
      skyGrad.addColorStop(1, "#253b5c");
      ctx.fillStyle = skyGrad;
      ctx.fillRect(0, 0, w, h);

      // Dock side concrete walls
      ctx.fillStyle = "#334155";
      ctx.fillRect(0, 0, 36, h);
      ctx.fillRect(w - 36, 0, 36, h);

      // Dock depth markings
      ctx.fillStyle = "#94a3b8";
      ctx.font = "bold 9px monospace";
      for (let yMark = 60; yMark < h - 40; yMark += 35) {
        const depthM = ((h - 40 - yMark) / (h - 100) * 14).toFixed(1);
        ctx.fillText(`${depthM}m`, 8, yMark);
        ctx.fillRect(28, yMark - 2, 8, 2);
        ctx.fillRect(w - 36, yMark - 2, 8, 2);
      }

      // Dock floor & Keel blocks (침목/반목)
      ctx.fillStyle = "#1e293b";
      ctx.fillRect(0, h - 35, w, 35);
      // Keel blocks along floor
      for (let bx = 60; bx < w - 60; bx += 32) {
        ctx.fillStyle = "#475569";
        ctx.fillRect(bx, h - 48, 20, 13);
        ctx.fillStyle = "#64748b";
        ctx.fillRect(bx + 2, h - 52, 16, 4);
      }

      // 2. Rising Sea Water
      const waterTopY = (h - 48) - (st.waterLevel / 100) * (h - 120);

      ctx.save();
      ctx.beginPath();
      ctx.moveTo(36, h);
      ctx.lineTo(36, waterTopY);
      // Sinusoidal waves on water surface
      for (let x = 36; x <= w - 36; x += 8) {
        const wy = waterTopY + Math.sin(x * 0.04 + waveOffset) * 3;
        ctx.lineTo(x, wy);
      }
      ctx.lineTo(w - 36, h);
      ctx.closePath();

      const waterGrad = ctx.createLinearGradient(0, waterTopY, 0, h);
      waterGrad.addColorStop(0, "rgba(0, 180, 255, 0.65)");
      waterGrad.addColorStop(0.3, "rgba(0, 110, 210, 0.78)");
      waterGrad.addColorStop(1, "rgba(0, 40, 100, 0.92)");
      ctx.fillStyle = waterGrad;
      ctx.fill();

      // Water spray from active valves
      if (st.bowValve) {
        ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
        ctx.fillRect(40, waterTopY - 10, 12, 10);
      }
      if (st.sternValve) {
        ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
        ctx.fillRect(w - 52, waterTopY - 10, 12, 10);
      }
      ctx.restore();

      // 3. Mega Container Ship / Tanker Hull
      // Floats when water exceeds keel height
      const floatRatio = Math.max(0, Math.min(1, (st.waterLevel - 15) / 85));
      const shipBaseY = (h - 52) - floatRatio * (h - 145);

      ctx.save();
      // Translate to ship center of gravity
      const shipCenterX = w / 2;
      ctx.translate(shipCenterX, shipBaseY);
      ctx.rotate((st.angle * Math.PI) / 180);

      // Ship Hull (HD 현대 블루 & 레드 앤티파울링)
      const shipWidth = w * 0.72;
      const shipHeight = 52;

      // Bottom red anti-fouling hull
      ctx.fillStyle = "#b91c1c";
      ctx.beginPath();
      ctx.moveTo(-shipWidth / 2, 0);
      ctx.lineTo(shipWidth / 2, 0);
      ctx.lineTo(shipWidth / 2 - 25, shipHeight / 2);
      ctx.lineTo(-shipWidth / 2 + 35, shipHeight / 2);
      ctx.closePath();
      ctx.fill();

      // Bulbous bow (구상선수)
      ctx.beginPath();
      ctx.arc(-shipWidth / 2 + 10, shipHeight / 4, 12, 0, Math.PI * 2);
      ctx.fillStyle = "#991b1b";
      ctx.fill();

      // Upper black/navy top-sides
      ctx.fillStyle = "#0f172a";
      ctx.beginPath();
      ctx.moveTo(-shipWidth / 2, 0);
      ctx.lineTo(shipWidth / 2, 0);
      ctx.lineTo(shipWidth / 2 + 10, -shipHeight / 2);
      ctx.lineTo(-shipWidth / 2 - 10, -shipHeight / 2);
      ctx.closePath();
      ctx.fill();

      // HD HYUNDAI SAMHO Logo text on hull
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 9px sans-serif";
      ctx.fillText("HD HYUNDAI SAMHO", -45, -6);

      // Deck Containers / Deckhouse
      // Deck superstructure (Bridge)
      ctx.fillStyle = "#f8fafc";
      ctx.fillRect(shipWidth / 3 - 35, -shipHeight / 2 - 28, 28, 28);
      ctx.fillStyle = "#38bdf8";
      ctx.fillRect(shipWidth / 3 - 33, -shipHeight / 2 - 22, 24, 6); // Bridge glass

      // Radar mast
      ctx.strokeStyle = "#94a3b8";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(shipWidth / 3 - 21, -shipHeight / 2 - 28);
      ctx.lineTo(shipWidth / 3 - 21, -shipHeight / 2 - 40);
      ctx.stroke();

      // Colored stacked containers
      const containerColors = ["#0284c7", "#ea580c", "#16a34a", "#eab308"];
      for (let ci = 0; ci < 5; ci++) {
        const cx = -shipWidth / 2 + 25 + ci * 36;
        ctx.fillStyle = containerColors[ci % containerColors.length];
        ctx.fillRect(cx, -shipHeight / 2 - 16, 32, 16);
        ctx.strokeStyle = "#00000044";
        ctx.strokeRect(cx, -shipHeight / 2 - 16, 32, 16);
      }

      ctx.restore();

      // 4. Incline Level Gauge (Crosshair in top center)
      const gaugeX = w / 2;
      const gaugeY = 38;
      ctx.fillStyle = "rgba(15, 23, 42, 0.75)";
      ctx.beginPath();
      ctx.arc(gaugeX, gaugeY, 26, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = Math.abs(st.angle) > 4 ? "#ef4444" : "#10b981";
      ctx.lineWidth = 2.5;
      ctx.stroke();

      // Bubble indicator
      const bubbleX = gaugeX + (st.angle / 6) * 18;
      ctx.fillStyle = Math.abs(st.angle) > 4 ? "#f87171" : "#34d399";
      ctx.beginPath();
      ctx.arc(bubbleX, gaugeY, 6, 0, Math.PI * 2);
      ctx.fill();

      animId = requestAnimationFrame(loop);
    };

    animId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animId);
  }, [isPlaying, gameOver, success]);

  return (
    <div className="w-full max-w-4xl mx-auto flex flex-col items-center select-none">
      {/* Header Bar */}
      <div className="w-full bg-slate-900 border border-slate-800 text-white px-5 py-3.5 rounded-2xl flex flex-wrap items-center justify-between gap-3 shadow-xl mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/20">
            <Waves className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-black text-lg text-white">드라이도크 진수식 : 수위 & 밸런스</h3>
              <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${Math.abs(shipAngle) > 4 ? "bg-rose-500/20 text-rose-400 border border-rose-500/30" : "bg-cyan-500/20 text-cyan-400 border border-cyan-500/30"}`}>
                기울기: {shipAngle > 0 ? `+${shipAngle}° 선미` : `${shipAngle}° 선수`}
              </span>
            </div>
            <p className="text-xs text-slate-400 font-medium">
              선박이 수평(±2°)을 유지하도록 주수 밸브와 배수 펌프를 조절하여 100% 진수시키세요!
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="text-right">
            <span className="text-xs text-slate-400 block font-medium">진수 점수</span>
            <span className="text-2xl font-black text-cyan-400 tracking-tight">
              {score.toLocaleString()}
            </span>
          </div>

          <button
            onClick={toggleSound}
            className="p-2.5 bg-slate-800 hover:bg-slate-700 rounded-xl border border-slate-700 text-slate-300 transition-all active:scale-95"
            title={isMuted ? "소리 켜기" : "음소거"}
          >
            {isMuted ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4 text-emerald-400" />}
          </button>
        </div>
      </div>

      {/* Main Screen */}
      <div className="w-full relative rounded-2xl overflow-hidden border border-slate-800 shadow-2xl bg-slate-950 aspect-[16/9] min-h-[380px] flex items-center justify-center">
        <canvas ref={canvasRef} className="w-full h-full" />

        {/* Warning Toast */}
        {warningMsg && isPlaying && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-rose-950/90 border border-rose-500 text-rose-200 px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 shadow-lg animate-bounce">
            <AlertTriangle className="w-4 h-4 text-rose-400" />
            {warningMsg}
          </div>
        )}

        {/* Water Level & Balance HUD */}
        {isPlaying && (
          <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between pointer-events-none">
            <div className="bg-slate-900/80 backdrop-blur-md border border-slate-700/60 px-4 py-2 rounded-xl text-white">
              <span className="text-[11px] text-slate-400 block">도크 주수율</span>
              <span className="text-xl font-black text-cyan-400">{waterLevel}%</span>
            </div>
            <div className="bg-slate-900/80 backdrop-blur-md border border-slate-700/60 px-4 py-2 rounded-xl text-white text-right">
              <span className="text-[11px] text-slate-400 block">허용 한계 각도</span>
              <span className="text-xl font-black text-amber-400">±6.0° MAX</span>
            </div>
          </div>
        )}

        {/* Start Overlay */}
        {!isPlaying && !gameOver && !success && (
          <div className="absolute inset-0 bg-slate-950/85 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center z-20">
            <div className="w-16 h-16 rounded-2xl bg-cyan-500/20 border border-cyan-500/40 flex items-center justify-center mb-4 text-cyan-400 shadow-xl shadow-cyan-500/10">
              <Waves className="w-8 h-8" />
            </div>
            <h2 className="text-2xl sm:text-3xl font-black text-white mb-2">드라이도크 안전 진수식</h2>
            <p className="text-slate-300 text-sm max-w-md mb-6 leading-relaxed">
              30만 톤급 초대형 선박의 안전한 부유(Float-off)를 위해<br />
              선수/선미 밸브와 배수 펌프를 유기적으로 가동하여 선체 균형을 맞추세요!
            </p>
            <button
              onClick={startGame}
              className="px-8 py-3.5 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 text-white font-black text-base rounded-xl shadow-lg shadow-cyan-500/25 active:scale-95 transition-all flex items-center gap-2"
            >
              <Play className="w-5 h-5 fill-white" />
              진수 주수 시작
            </button>
          </div>
        )}

        {/* Failure Overlay */}
        {gameOver && (
          <div className="absolute inset-0 bg-rose-950/90 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center z-20 animate-in fade-in zoom-in-95 duration-200">
            <div className="w-16 h-16 rounded-2xl bg-rose-500/20 border border-rose-500/40 flex items-center justify-center mb-3 text-rose-400">
              <AlertTriangle className="w-9 h-9" />
            </div>
            <h3 className="text-2xl font-black text-white mb-1">선체 경사 한계 초과 (경동 발생)</h3>
            <p className="text-slate-300 text-sm mb-4">
              선체 기울기가 6.5°를 초과하여 긴급 주수 중단 조치가 취해졌습니다.
            </p>
            <div className="bg-slate-900 border border-slate-800 px-6 py-3 rounded-2xl text-center mb-6">
              <span className="text-xs text-slate-400 block mb-0.5">획득 점수</span>
              <span className="text-2xl font-black text-rose-400">{score.toLocaleString()}점</span>
            </div>
            <button
              onClick={startGame}
              className="px-7 py-3 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white font-bold text-sm rounded-xl active:scale-95 transition-all flex items-center gap-2"
            >
              <RotateCcw className="w-4 h-4" />
              재도전
            </button>
          </div>
        )}

        {/* Success / Launching Ceremony Overlay */}
        {success && (
          <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center z-20 animate-in fade-in zoom-in-95 duration-200">
            <div className="w-16 h-16 rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center mb-3 text-amber-400">
              <Sparkles className="w-9 h-9" />
            </div>
            <span className="text-xs font-bold text-amber-400 tracking-widest uppercase mb-1">SAFE LAUNCHING SUCCESS</span>
            <h3 className="text-2xl sm:text-3xl font-black text-white mb-2">
              무사고 명품 진수식 성공!
            </h3>
            <p className="text-slate-300 text-sm mb-4 max-w-md">
              완벽한 밸런스로 선박이 도크 수면에 안착하였습니다. 영암호를 거쳐 대양으로 힘차게 출항합니다!
            </p>
            <div className="bg-slate-900 border border-slate-800 px-6 py-4 rounded-2xl text-center mb-6 min-w-[200px]">
              <span className="text-xs text-slate-400 block mb-1">최종 공인 점수</span>
              <span className="text-3xl font-black text-cyan-400">{score.toLocaleString()}점</span>
            </div>
            <button
              onClick={startGame}
              className="px-7 py-3 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 text-white font-black text-sm rounded-xl active:scale-95 transition-all"
            >
              다시 진수하기
            </button>
          </div>
        )}
      </div>

      {/* Control Panel (Valves & Pumps) */}
      <div className="w-full mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <button
          onClick={toggleBow}
          disabled={!isPlaying}
          className={`p-3 rounded-xl border flex flex-col items-center justify-center transition-all ${
            bowValve
              ? "bg-cyan-500/20 border-cyan-500 text-cyan-300 shadow-lg shadow-cyan-500/20 font-black"
              : "bg-slate-900 border-slate-800 text-slate-400 hover:bg-slate-800 font-medium"
          }`}
        >
          <span className="text-xs">선수 주수 밸브</span>
          <span className="text-[11px] font-bold mt-1">{bowValve ? "열림 (주수 중)" : "닫힘"}</span>
        </button>

        <button
          onClick={toggleStern}
          disabled={!isPlaying}
          className={`p-3 rounded-xl border flex flex-col items-center justify-center transition-all ${
            sternValve
              ? "bg-cyan-500/20 border-cyan-500 text-cyan-300 shadow-lg shadow-cyan-500/20 font-black"
              : "bg-slate-900 border-slate-800 text-slate-400 hover:bg-slate-800 font-medium"
          }`}
        >
          <span className="text-xs">선미 주수 밸브</span>
          <span className="text-[11px] font-bold mt-1">{sternValve ? "열림 (주수 중)" : "닫힘"}</span>
        </button>

        <button
          onClick={togglePort}
          disabled={!isPlaying}
          className={`p-3 rounded-xl border flex flex-col items-center justify-center transition-all ${
            portPump
              ? "bg-amber-500/20 border-amber-500 text-amber-300 shadow-lg shadow-amber-500/20 font-black"
              : "bg-slate-900 border-slate-800 text-slate-400 hover:bg-slate-800 font-medium"
          }`}
        >
          <span className="text-xs">좌현 밸러스트 배수</span>
          <span className="text-[11px] font-bold mt-1">{portPump ? "가동 (우회전)" : "정지"}</span>
        </button>

        <button
          onClick={toggleStarboard}
          disabled={!isPlaying}
          className={`p-3 rounded-xl border flex flex-col items-center justify-center transition-all ${
            starboardPump
              ? "bg-amber-500/20 border-amber-500 text-amber-300 shadow-lg shadow-amber-500/20 font-black"
              : "bg-slate-900 border-slate-800 text-slate-400 hover:bg-slate-800 font-medium"
          }`}
        >
          <span className="text-xs">우현 밸러스트 배수</span>
          <span className="text-[11px] font-bold mt-1">{starboardPump ? "가동 (좌회전)" : "정지"}</span>
        </button>
      </div>
    </div>
  );
}
