import React, { useState, useEffect, useRef } from "react";
import { Play, RotateCcw, Volume2, VolumeX, Compass, Anchor, Navigation, ShieldAlert, Award } from "lucide-react";
import { gameAudio } from "../../lib/gameSounds";

interface TugboatPilotGameProps {
  onFinish: (score: number) => void;
}

export default function TugboatPilotGame({ onFinish }: TugboatPilotGameProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [stage, setStage] = useState(1);
  const [score, setScore] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [stageCleared, setStageCleared] = useState(false);
  const [isMuted, setIsMuted] = useState(gameAudio.getMuted());
  const [activeTug, setActiveTug] = useState<"bow" | "stern">("bow"); // 선수 예인선 vs 선미 예인선

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Ship and harbor state
  const stateRef = useRef({
    ship: {
      x: 140,
      y: 200,
      vx: 0,
      vy: 0,
      angle: 0, // radians
      angularVelocity: 0,
      length: 140,
      width: 32,
    },
    tug1: { thrust: 0, angle: 0 }, // bow tugboat
    tug2: { thrust: 0, angle: 0 }, // stern tugboat
    current: { x: 0.15, y: 0.05 },
    wind: { x: 0.1, y: 0.1 },
    berth: { x: 420, y: 200, width: 60, height: 160 },
    obstacles: [] as { x: number; y: number; r: number }[],
    score: 0,
    time: 0,
  });

  const toggleSound = () => {
    const muted = gameAudio.toggleMute();
    setIsMuted(muted);
  };

  const setupStage = (stg: number, w: number, h: number) => {
    const st = stateRef.current;
    st.ship.x = 100;
    st.ship.y = h / 2 + (Math.random() - 0.5) * 50;
    st.ship.vx = 0.5;
    st.ship.vy = 0;
    st.ship.angle = (Math.random() - 0.5) * 0.4;
    st.ship.angularVelocity = 0;

    st.berth = {
      x: w - 85,
      y: h / 2 - 80,
      width: 45,
      height: 160,
    };

    if (stg === 1) {
      st.current = { x: 0.12, y: 0.04 };
      st.wind = { x: 0.05, y: 0.02 };
      st.obstacles = [
        { x: w * 0.45, y: h * 0.25, r: 16 },
        { x: w * 0.55, y: h * 0.75, r: 16 },
      ];
    } else if (stg === 2) {
      st.current = { x: 0.18, y: -0.16 }; // strong cross-current
      st.wind = { x: -0.12, y: 0.18 };
      st.obstacles = [
        { x: w * 0.38, y: h * 0.3, r: 18 },
        { x: w * 0.52, y: h * 0.65, r: 18 },
        { x: w * 0.68, y: h * 0.28, r: 18 },
      ];
    } else {
      // Night / Tight Quay
      st.current = { x: 0.22, y: 0.2 };
      st.wind = { x: 0.2, y: -0.22 };
      st.obstacles = [
        { x: w * 0.35, y: h * 0.25, r: 20 },
        { x: w * 0.45, y: h * 0.75, r: 20 },
        { x: w * 0.62, y: h * 0.45, r: 22 },
      ];
    }
  };

  const startGame = () => {
    gameAudio.playClick();
    gameAudio.playShipHorn();
    setIsPlaying(true);
    setGameOver(false);
    setStageCleared(false);
    setScore(0);
    setStage(1);
    stateRef.current.score = 0;
    stateRef.current.time = 0;

    const canvas = canvasRef.current;
    if (canvas) {
      setupStage(1, canvas.width / window.devicePixelRatio, canvas.height / window.devicePixelRatio);
    }
  };

  const applyThrust = (tugType: "bow" | "stern", dThrust: number, dAngle: number) => {
    const st = stateRef.current;
    const tug = tugType === "bow" ? st.tug1 : st.tug2;
    tug.thrust = Math.max(-1, Math.min(1, tug.thrust + dThrust));
    tug.angle += dAngle;
    gameAudio.playValveTurn();
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isPlaying) return;
      if (e.key === "ArrowUp" || e.key === "w") applyThrust(activeTug, 0.3, 0);
      else if (e.key === "ArrowDown" || e.key === "s") applyThrust(activeTug, -0.3, 0);
      else if (e.key === "ArrowLeft" || e.key === "a") applyThrust(activeTug, 0, -0.2);
      else if (e.key === "ArrowRight" || e.key === "d") applyThrust(activeTug, 0, 0.2);
      else if (e.key === "Tab") {
        e.preventDefault();
        setActiveTug((prev) => (prev === "bow" ? "stern" : "bow"));
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isPlaying, activeTug]);

  useEffect(() => {
    if (!isPlaying || gameOver || stageCleared) return;

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

    setupStage(stage, w, h);

    let animId: number;
    let lastTime = performance.now();

    const loop = (now: number) => {
      const dt = Math.min((now - lastTime) / 1000, 0.08);
      lastTime = now;
      const st = stateRef.current;
      st.time += dt;

      // Apply physics to Ship
      const ship = st.ship;

      // Forces from Tug 1 (Bow)
      const bowX = ship.x + Math.cos(ship.angle) * (ship.length * 0.42);
      const bowY = ship.y + Math.sin(ship.angle) * (ship.length * 0.42);
      const f1x = Math.cos(ship.angle + st.tug1.angle) * st.tug1.thrust * 45;
      const f1y = Math.sin(ship.angle + st.tug1.angle) * st.tug1.thrust * 45;

      // Forces from Tug 2 (Stern)
      const sternX = ship.x - Math.cos(ship.angle) * (ship.length * 0.42);
      const sternY = ship.y - Math.sin(ship.angle) * (ship.length * 0.42);
      const f2x = Math.cos(ship.angle + st.tug2.angle) * st.tug2.thrust * 45;
      const f2y = Math.sin(ship.angle + st.tug2.angle) * st.tug2.thrust * 45;

      // Total thrust & environmental drift
      const totalFx = f1x + f2x + st.current.x * 25 + st.wind.x * 15;
      const totalFy = f1y + f2y + st.current.y * 25 + st.wind.y * 15;

      // Torque calculation
      // Torque = r x F
      const torque1 = (bowX - ship.x) * f1y - (bowY - ship.y) * f1x;
      const torque2 = (sternX - ship.x) * f2y - (sternY - ship.y) * f2x;
      const totalTorque = (torque1 + torque2) * 0.0003;

      // Update linear & angular velocities with water drag
      ship.vx += (totalFx * 0.02) * dt;
      ship.vy += (totalFy * 0.02) * dt;
      ship.vx *= 0.985;
      ship.vy *= 0.985;

      ship.angularVelocity += totalTorque * dt;
      ship.angularVelocity *= 0.96;

      ship.x += ship.vx * 60 * dt;
      ship.y += ship.vy * 60 * dt;
      ship.angle += ship.angularVelocity * dt;

      // Natural decay of tug thrust command
      st.tug1.thrust *= 0.99;
      st.tug2.thrust *= 0.99;

      // Boundary / Obstacle collision
      for (const obs of st.obstacles) {
        const d = Math.hypot(ship.x - obs.x, ship.y - obs.y);
        if (d < obs.r + ship.width * 0.6) {
          gameAudio.playBomb();
          setGameOver(true);
          setIsPlaying(false);
          onFinish(st.score);
          return;
        }
      }

      // Quay collision check (Right edge pier wall)
      const quayWallX = w - 40;
      if (ship.x + ship.length * 0.45 > quayWallX) {
        // Must be in berth zone with low speed and aligned angle
        const speed = Math.hypot(ship.vx, ship.vy);
        const inBerthY = ship.y >= st.berth.y - 20 && ship.y <= st.berth.y + st.berth.height + 20;
        const angleNorm = Math.abs(ship.angle % Math.PI);
        const isAligned = angleNorm < 0.25 || Math.abs(angleNorm - Math.PI) < 0.25;

        if (inBerthY && speed < 0.6 && isAligned) {
          // Successful Docking!
          gameAudio.playShipHorn();
          gameAudio.playVictory();
          const stagePts = 1500 - Math.round(st.time * 15);
          st.score += Math.max(500, stagePts);
          setScore(st.score);

          if (stage >= 3) {
            setGameOver(true);
            setIsPlaying(false);
            onFinish(st.score);
          } else {
            setStageCleared(true);
          }
          return;
        } else {
          // Hard Crash into quay fender
          gameAudio.playDrop();
          gameAudio.playBomb();
          setGameOver(true);
          setIsPlaying(false);
          onFinish(st.score);
          return;
        }
      }

      // Top / Bottom harbor limits
      if (ship.y < 30 || ship.y > h - 30 || ship.x < 20) {
        ship.vy *= -0.5;
        ship.vx *= -0.5;
      }

      // DRAW GRAPHICS
      ctx.clearRect(0, 0, w, h);

      // Harbor sea background
      const oceanGrad = ctx.createLinearGradient(0, 0, w, h);
      oceanGrad.addColorStop(0, "#082f49");
      oceanGrad.addColorStop(0.5, "#0c4a6e");
      oceanGrad.addColorStop(1, "#0369a1");
      ctx.fillStyle = oceanGrad;
      ctx.fillRect(0, 0, w, h);

      // Water current flow arrows
      ctx.strokeStyle = "rgba(255, 255, 255, 0.12)";
      ctx.lineWidth = 1.5;
      for (let cx = 40; cx < w - 60; cx += 70) {
        for (let cy = 40; cy < h; cy += 60) {
          ctx.beginPath();
          ctx.moveTo(cx, cy);
          ctx.lineTo(cx + st.current.x * 60, cy + st.current.y * 60);
          ctx.stroke();
        }
      }

      // Right Outfitting Quay Pier Wall
      ctx.fillStyle = "#334155";
      ctx.fillRect(w - 40, 0, 40, h);
      // Yellow-black warning stripes on quay edge
      for (let sy = 0; sy < h; sy += 24) {
        ctx.fillStyle = sy % 48 === 0 ? "#eab308" : "#1e293b";
        ctx.fillRect(w - 40, sy, 8, 24);
      }

      // Berth Target Zone (Mooring Basin)
      const b = st.berth;
      ctx.fillStyle = "rgba(16, 185, 129, 0.25)";
      ctx.fillRect(b.x - 20, b.y, b.width + 20, b.height);
      ctx.strokeStyle = "#10b981";
      ctx.lineWidth = 2.5;
      ctx.setLineDash([8, 6]);
      ctx.strokeRect(b.x - 20, b.y, b.width + 20, b.height);
      ctx.setLineDash([]);

      ctx.fillStyle = "#10b981";
      ctx.font = "bold 11px sans-serif";
      ctx.fillText("HD현대삼호 의장안벽 접안지", b.x - 15, b.y - 8);

      // Draw Navigation Buoys / Obstacles
      for (const obs of st.obstacles) {
        // Anchor chain ripple
        ctx.strokeStyle = "rgba(255, 255, 255, 0.2)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(obs.x, obs.y, obs.r + 4, 0, Math.PI * 2);
        ctx.stroke();

        // Buoy body
        ctx.fillStyle = "#ea580c";
        ctx.beginPath();
        ctx.arc(obs.x, obs.y, obs.r, 0, Math.PI * 2);
        ctx.fill();

        // Flashing light on buoy
        ctx.fillStyle = Math.sin(now / 200) > 0 ? "#fef08a" : "#ca8a04";
        ctx.beginPath();
        ctx.arc(obs.x, obs.y, obs.r * 0.4, 0, Math.PI * 2);
        ctx.fill();
      }

      // Draw 300,000 DWT Tanker Ship Hull
      ctx.save();
      ctx.translate(ship.x, ship.y);
      ctx.rotate(ship.angle);

      // Hull Shadow
      ctx.fillStyle = "rgba(0, 0, 0, 0.35)";
      ctx.fillRect(-ship.length / 2 + 4, -ship.width / 2 + 4, ship.length, ship.width);

      // Ship Main Deck
      ctx.fillStyle = "#b91c1c"; // Red anti-fouling / tanker deck
      ctx.beginPath();
      // Bow pointy shape
      ctx.moveTo(ship.length / 2, 0);
      ctx.lineTo(ship.length / 2 - 20, -ship.width / 2);
      ctx.lineTo(-ship.length / 2, -ship.width / 2);
      ctx.lineTo(-ship.length / 2, ship.width / 2);
      ctx.lineTo(ship.length / 2 - 20, ship.width / 2);
      ctx.closePath();
      ctx.fill();

      // Deck piping & hatches
      ctx.strokeStyle = "#475569";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-ship.length / 2 + 25, 0);
      ctx.lineTo(ship.length / 2 - 25, 0);
      ctx.stroke();

      // Superstructure & Bridge at stern
      ctx.fillStyle = "#f8fafc";
      ctx.fillRect(-ship.length / 2 + 10, -ship.width / 2 + 5, 24, ship.width - 10);
      ctx.fillStyle = "#0284c7";
      ctx.fillRect(-ship.length / 2 + 20, -ship.width / 2 + 8, 8, ship.width - 16);

      // Ship name
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 8px sans-serif";
      ctx.fillText("HD SAMHO 01", -15, 3);
      ctx.restore();

      // Draw Tugboat 1 (Bow)
      drawTugboat(ctx, bowX, bowY, ship.angle + st.tug1.angle, st.tug1.thrust, activeTug === "bow", "1호 (선수)");

      // Draw Tugboat 2 (Stern)
      drawTugboat(ctx, sternX, sternY, ship.angle + st.tug2.angle, st.tug2.thrust, activeTug === "stern", "2호 (선미)");

      // Tow Lines between ship and tugboats
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(bowX, bowY);
      ctx.lineTo(bowX + Math.cos(ship.angle + st.tug1.angle) * 16, bowY + Math.sin(ship.angle + st.tug1.angle) * 16);
      ctx.moveTo(sternX, sternY);
      ctx.lineTo(sternX + Math.cos(ship.angle + st.tug2.angle) * 16, sternY + Math.sin(ship.angle + st.tug2.angle) * 16);
      ctx.stroke();
      ctx.setLineDash([]);

      animId = requestAnimationFrame(loop);
    };

    animId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animId);
  }, [isPlaying, gameOver, stageCleared, stage, activeTug]);

  const drawTugboat = (
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    angle: number,
    thrust: number,
    isActive: boolean,
    label: string
  ) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);

    // Active ring
    if (isActive) {
      ctx.strokeStyle = "#38bdf8";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, 16, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Tugboat body (Orange harbor workboat)
    ctx.fillStyle = isActive ? "#f97316" : "#c2410c";
    ctx.beginPath();
    ctx.ellipse(0, 0, 12, 6, 0, 0, Math.PI * 2);
    ctx.fill();

    // Rubber fender bow
    ctx.fillStyle = "#1e293b";
    ctx.fillRect(8, -5, 4, 10);

    // Thrust water wake
    if (Math.abs(thrust) > 0.05) {
      ctx.fillStyle = "rgba(255, 255, 255, 0.7)";
      ctx.beginPath();
      ctx.arc(-14, 0, 5 * Math.abs(thrust), 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();

    // Label
    ctx.fillStyle = isActive ? "#38bdf8" : "#94a3b8";
    ctx.font = "bold 9px sans-serif";
    ctx.fillText(label, x - 15, y - 18);
  };

  return (
    <div className="w-full max-w-4xl mx-auto flex flex-col items-center select-none">
      {/* Header */}
      <div className="w-full bg-slate-900 border border-slate-800 text-white px-5 py-3.5 rounded-2xl flex flex-wrap items-center justify-between gap-3 shadow-xl mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-sky-600 flex items-center justify-center shadow-lg shadow-sky-500/20">
            <Compass className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-black text-lg text-white">영암호 예인선 하버 파일럿</h3>
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-sky-500/20 text-sky-400 border border-sky-500/30">
                구역 {stage}/3
              </span>
            </div>
            <p className="text-xs text-slate-400 font-medium">
              조류와 바람을 이겨내고 2척의 예인선으로 30만 톤급 선박을 안벽에 안전 접안하세요!
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="text-right">
            <span className="text-xs text-slate-400 block font-medium">하버 스코어</span>
            <span className="text-2xl font-black text-sky-400 tracking-tight">
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

      {/* Main Canvas */}
      <div className="w-full relative rounded-2xl overflow-hidden border border-slate-800 shadow-2xl bg-slate-950 aspect-[16/9] min-h-[380px] flex items-center justify-center">
        <canvas ref={canvasRef} className="w-full h-full" />

        {/* Start Overlay */}
        {!isPlaying && !gameOver && !stageCleared && (
          <div className="absolute inset-0 bg-slate-950/85 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center z-20">
            <div className="w-16 h-16 rounded-2xl bg-sky-500/20 border border-sky-500/40 flex items-center justify-center mb-4 text-sky-400 shadow-xl shadow-sky-500/10">
              <Anchor className="w-8 h-8" />
            </div>
            <h2 className="text-2xl sm:text-3xl font-black text-white mb-2">하버 예인선 도킹 시뮬레이터</h2>
            <p className="text-slate-300 text-sm max-w-md mb-6 leading-relaxed">
              방향키(또는 하단 버튼)로 예인선의 추력과 조타를 제어하고,<br />
              선수/선미 예인선을 번갈아 전환하며 초대형 선박을 녹색 안벽 구역에 저속 안착시키세요!
            </p>
            <button
              onClick={startGame}
              className="px-8 py-3.5 bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-600 hover:to-blue-700 text-white font-black text-base rounded-xl shadow-lg shadow-sky-500/25 active:scale-95 transition-all flex items-center gap-2"
            >
              <Play className="w-5 h-5 fill-white" />
              도킹 파일럿 출항
            </button>
          </div>
        )}

        {/* Stage Cleared */}
        {stageCleared && (
          <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center z-20 animate-in fade-in zoom-in-95 duration-200">
            <div className="w-16 h-16 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center mb-3 text-emerald-400">
              <Award className="w-9 h-9" />
            </div>
            <h3 className="text-2xl font-black text-white mb-1">
              구역 {stage} 무사고 안벽 접안 완료!
            </h3>
            <p className="text-slate-300 text-sm mb-4">
              완벽한 속도 감속과 조타 각도로 안전하게 안벽 펜더에 접현했습니다.
            </p>
            <button
              onClick={() => {
                setStageCleared(false);
                setStage(stage + 1);
              }}
              className="px-7 py-3 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-slate-950 font-black text-sm rounded-xl shadow-lg shadow-emerald-500/25 active:scale-95 transition-all"
            >
              다음 구역 ({stage + 1}/3) 항해 →
            </button>
          </div>
        )}

        {/* Game Over */}
        {gameOver && (
          <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center z-20 animate-in fade-in zoom-in-95 duration-200">
            <div className="w-16 h-16 rounded-2xl bg-rose-500/20 border border-rose-500/40 flex items-center justify-center mb-3 text-rose-400">
              <ShieldAlert className="w-9 h-9" />
            </div>
            <h3 className="text-2xl font-black text-white mb-1">선체 접촉 사고 발생</h3>
            <p className="text-slate-300 text-sm mb-4">
              안벽 진입 속도 초과 또는 항로 부표 충돌로 예인 작전이 중단되었습니다.
            </p>
            <div className="bg-slate-900 border border-slate-800 px-6 py-3 rounded-2xl text-center mb-6">
              <span className="text-xs text-slate-400 block mb-0.5">최종 점수</span>
              <span className="text-2xl font-black text-sky-400">{score.toLocaleString()}점</span>
            </div>
            <button
              onClick={startGame}
              className="px-7 py-3 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white font-bold text-sm rounded-xl active:scale-95 transition-all flex items-center gap-2"
            >
              <RotateCcw className="w-4 h-4" />
              도킹 재도전
            </button>
          </div>
        )}
      </div>

      {/* Controls Bar */}
      <div className="w-full mt-3 bg-slate-900/90 border border-slate-800 p-3 rounded-2xl flex flex-wrap items-center justify-between gap-3">
        {/* Tugboat Selector */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTug("bow")}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all ${
              activeTug === "bow"
                ? "bg-sky-500 text-white shadow-md shadow-sky-500/30"
                : "bg-slate-800 text-slate-400 hover:text-white"
            }`}
          >
            선수 예인선 1호
          </button>
          <button
            onClick={() => setActiveTug("stern")}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all ${
              activeTug === "stern"
                ? "bg-sky-500 text-white shadow-md shadow-sky-500/30"
                : "bg-slate-800 text-slate-400 hover:text-white"
            }`}
          >
            선미 예인선 2호
          </button>
          <span className="text-[11px] text-slate-400 hidden sm:inline ml-2">(단축키: TAB키로 전환)</span>
        </div>

        {/* Direction Steering Pad */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => applyThrust(activeTug, 0, -0.25)}
            className="p-2.5 bg-slate-800 hover:bg-slate-700 rounded-xl text-white font-bold text-xs active:scale-95 transition-all"
            title="좌조타"
          >
            ◀ 좌조타
          </button>
          <button
            onClick={() => applyThrust(activeTug, 0.35, 0)}
            className="p-2.5 bg-sky-600 hover:bg-sky-500 rounded-xl text-white font-bold text-xs active:scale-95 transition-all shadow-md shadow-sky-600/20"
            title="전진 추력"
          >
            ▲ 전진 추력
          </button>
          <button
            onClick={() => applyThrust(activeTug, -0.35, 0)}
            className="p-2.5 bg-slate-800 hover:bg-slate-700 rounded-xl text-white font-bold text-xs active:scale-95 transition-all"
            title="후진 추력"
          >
            ▼ 후진
          </button>
          <button
            onClick={() => applyThrust(activeTug, 0, 0.25)}
            className="p-2.5 bg-slate-800 hover:bg-slate-700 rounded-xl text-white font-bold text-xs active:scale-95 transition-all"
            title="우조타"
          >
            우조타 ▶
          </button>
        </div>
      </div>
    </div>
  );
}
