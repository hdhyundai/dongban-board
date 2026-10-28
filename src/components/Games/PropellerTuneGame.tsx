import React, { useState, useEffect, useRef } from "react";
import { Play, RotateCcw, Volume2, VolumeX, Cog, Zap, Award, Sparkles, CheckCircle2 } from "lucide-react";
import { gameAudio } from "../../lib/gameSounds";

interface PropellerTuneGameProps {
  onFinish: (score: number) => void;
}

interface PulseWave {
  radius: number;
  maxRadius: number;
  speed: number;
  targetRadius: number;
  hit: boolean;
  color: string;
}

export default function PropellerTuneGame({ onFinish }: PropellerTuneGameProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [score, setScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const [torqueProgress, setTorqueProgress] = useState(0); // 0 to 100%
  const [rpm, setRpm] = useState(0);
  const [ratingText, setRatingText] = useState<{ text: string; color: string } | null>(null);
  const [gameOver, setGameOver] = useState(false);
  const [isMuted, setIsMuted] = useState(gameAudio.getMuted());

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stateRef = useRef({
    propellerAngle: 0,
    propellerSpeed: 1.2, // rad/s
    pulses: [] as PulseWave[],
    nextPulseTime: 0,
    score: 0,
    combo: 0,
    torque: 0,
    targetRadius: 130,
    particles: [] as { x: number; y: number; vx: number; vy: number; life: number; color: string }[],
  });

  const toggleSound = () => {
    const muted = gameAudio.toggleMute();
    setIsMuted(muted);
  };

  const startGame = () => {
    gameAudio.playClick();
    gameAudio.playMetalClang(550);
    setIsPlaying(true);
    setGameOver(false);
    setScore(0);
    setCombo(0);
    setTorqueProgress(0);
    setRpm(15);
    setRatingText(null);

    stateRef.current = {
      propellerAngle: 0,
      propellerSpeed: 1.2,
      pulses: [],
      nextPulseTime: performance.now() + 600,
      score: 0,
      combo: 0,
      torque: 0,
      targetRadius: 130,
      particles: [],
    };
  };

  const handleTuneAction = () => {
    if (!isPlaying || gameOver) return;
    const st = stateRef.current;
    const now = performance.now();

    // Find closest pulse to target radius
    let closestIdx = -1;
    let minDiff = 9999;
    for (let i = 0; i < st.pulses.length; i++) {
      const p = st.pulses[i];
      if (p.hit) continue;
      const diff = Math.abs(p.radius - p.targetRadius);
      if (diff < minDiff) {
        minDiff = diff;
        closestIdx = i;
      }
    }

    if (closestIdx !== -1 && minDiff < 32) {
      const p = st.pulses[closestIdx];
      p.hit = true;

      let pts = 0;
      let text = "GREAT";
      let color = "#38bdf8";

      if (minDiff < 10) {
        // Perfect 0.01mm tolerance
        pts = 350;
        text = "PERFECT (0.01mm)";
        color = "#facc15";
        st.combo += 1;
        gameAudio.playMetalClang(700 + Math.min(st.combo * 40, 600));
      } else if (minDiff < 20) {
        pts = 200;
        text = "EXCELLENT (0.03mm)";
        color = "#34d399";
        st.combo += 1;
        gameAudio.playMetalClang(600);
      } else {
        pts = 100;
        text = "GOOD (0.08mm)";
        color = "#60a5fa";
        st.combo = 1;
        gameAudio.playMetalClang(500);
      }

      st.score += pts * Math.min(4, Math.floor(st.combo / 4) + 1);
      st.torque = Math.min(100, st.torque + (minDiff < 10 ? 8 : 5));
      st.propellerSpeed = 1.2 + (st.torque / 100) * 4.0;

      // Burst particles
      for (let k = 0; k < 25; k++) {
        const ang = Math.random() * Math.PI * 2;
        const spd = 60 + Math.random() * 150;
        st.particles.push({
          x: p.targetRadius * Math.cos(ang),
          y: p.targetRadius * Math.sin(ang),
          vx: Math.cos(ang) * spd,
          vy: Math.sin(ang) * spd,
          life: 0.4 + Math.random() * 0.3,
          color: text.includes("PERFECT") ? "#fde047" : "#38bdf8",
        });
      }

      setScore(st.score);
      setCombo(st.combo);
      setTorqueProgress(Math.round(st.torque));
      setRpm(Math.round(15 + (st.torque / 100) * 70));
      setRatingText({ text, color });

      // Check 100% full alignment
      if (st.torque >= 100) {
        gameAudio.playVictory();
        gameAudio.playShipHorn();
        const finalScore = st.score + 3000;
        setScore(finalScore);
        setGameOver(true);
        setIsPlaying(false);
        onFinish(finalScore);
      }
    } else {
      // Missed timing
      st.combo = 0;
      setCombo(0);
      setRatingText({ text: "MISS (허용공차 초과)", color: "#f87171" });
      gameAudio.playDrop();
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        e.preventDefault();
        handleTuneAction();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isPlaying, gameOver]);

  // Main Canvas Render
  useEffect(() => {
    if (!isPlaying || gameOver) return;

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
      const dt = Math.min((now - lastTime) / 1000, 0.08);
      lastTime = now;
      const st = stateRef.current;

      // Spawn pulses at rhythmic cadence
      if (now >= st.nextPulseTime && st.torque < 100) {
        st.pulses.push({
          radius: 20,
          maxRadius: 210,
          speed: 110 + (st.torque / 100) * 45,
          targetRadius: st.targetRadius,
          hit: false,
          color: "#00e5ff",
        });
        const interval = Math.max(550, 1100 - (st.torque / 100) * 400);
        st.nextPulseTime = now + interval;
      }

      // Update propeller rotation
      st.propellerAngle += st.propellerSpeed * dt;

      // Update pulses
      for (let i = st.pulses.length - 1; i >= 0; i--) {
        const p = st.pulses[i];
        p.radius += p.speed * dt;
        if (p.radius > p.maxRadius) {
          if (!p.hit) {
            // Pulse passed without hitting
            st.combo = 0;
            setCombo(0);
          }
          st.pulses.splice(i, 1);
        }
      }

      // Update particles
      for (let i = st.particles.length - 1; i >= 0; i--) {
        const part = st.particles[i];
        part.x += part.vx * dt;
        part.y += part.vy * dt;
        part.life -= dt;
        if (part.life <= 0) {
          st.particles.splice(i, 1);
        }
      }

      // DRAWING
      ctx.clearRect(0, 0, w, h);

      // Shaft tunnel / engine room hull background
      const bgGrad = ctx.createRadialGradient(w / 2, h / 2, 20, w / 2, h / 2, w * 0.6);
      bgGrad.addColorStop(0, "#131b2e");
      bgGrad.addColorStop(0.7, "#090d16");
      bgGrad.addColorStop(1, "#04060a");
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, w, h);

      // Concentric calibration grid rings
      ctx.save();
      ctx.translate(w / 2, h / 2);

      for (let r = 50; r <= 180; r += 40) {
        ctx.strokeStyle = "rgba(148, 163, 184, 0.12)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.stroke();
      }

      // TARGET ALIGNMENT RING (Laser Sensor Zone)
      const targetR = st.targetRadius;
      ctx.strokeStyle = "rgba(0, 229, 255, 0.4)";
      ctx.lineWidth = 3;
      ctx.setLineDash([8, 8]);
      ctx.beginPath();
      ctx.arc(0, 0, targetR, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);

      // 4 Laser Sensor Heads at 90 deg
      for (let a = 0; a < 4; a++) {
        const rad = (a * Math.PI) / 2;
        const sx = Math.cos(rad) * targetR;
        const sy = Math.sin(rad) * targetR;
        ctx.fillStyle = "#facc15";
        ctx.beginPath();
        ctx.arc(sx, sy, 4.5, 0, Math.PI * 2);
        ctx.fill();
      }

      // DRAW EXPANDING PULSE WAVES
      for (const p of st.pulses) {
        if (p.hit) continue;
        const alpha = Math.max(0, 1 - p.radius / p.maxRadius);
        ctx.strokeStyle = p.color;
        ctx.globalAlpha = alpha;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(0, 0, p.radius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }

      // DRAW PARTICLES
      for (const pt of st.particles) {
        ctx.fillStyle = pt.color;
        ctx.globalAlpha = Math.max(0, pt.life / 0.7);
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }

      // DRAW 5-BLADE BRONZE PROPELLER
      ctx.save();
      ctx.rotate(st.propellerAngle);

      const numBlades = 5;
      const bladeLength = 95;

      for (let b = 0; b < numBlades; b++) {
        ctx.save();
        ctx.rotate((b * Math.PI * 2) / numBlades);

        // Skewed Bronze Blade Contour
        const bladeGrad = ctx.createLinearGradient(0, 0, 0, -bladeLength);
        bladeGrad.addColorStop(0, "#b45309"); // dark bronze hub
        bladeGrad.addColorStop(0.5, "#d97706"); // golden amber blade
        bladeGrad.addColorStop(1, "#fef08a"); // polished tip edge

        ctx.fillStyle = bladeGrad;
        ctx.beginPath();
        ctx.moveTo(0, -18);
        // Hydrodynamic airfoil curvature
        ctx.bezierCurveTo(22, -35, 38, -65, 12, -bladeLength);
        ctx.bezierCurveTo(-15, -95, -28, -60, -8, -25);
        ctx.closePath();
        ctx.fill();

        // High polished leading edge highlight
        ctx.strokeStyle = "rgba(255, 255, 255, 0.4)";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(2, -22);
        ctx.bezierCurveTo(20, -40, 32, -65, 10, -bladeLength + 2);
        ctx.stroke();

        ctx.restore();
      }

      // Propeller Hub Bossing (Center Cone)
      const hubGrad = ctx.createRadialGradient(-3, -3, 2, 0, 0, 24);
      hubGrad.addColorStop(0, "#fbbf24");
      hubGrad.addColorStop(0.7, "#78350f");
      hubGrad.addColorStop(1, "#451a03");
      ctx.fillStyle = hubGrad;
      ctx.beginPath();
      ctx.arc(0, 0, 24, 0, Math.PI * 2);
      ctx.fill();

      // Hub Cap Bolts (6 bolts)
      for (let bolt = 0; bolt < 6; bolt++) {
        const bRad = (bolt * Math.PI * 2) / 6;
        const bx = Math.cos(bRad) * 15;
        const by = Math.sin(bRad) * 15;
        ctx.fillStyle = "#fef08a";
        ctx.beginPath();
        ctx.arc(bx, by, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore(); // end propeller rotate
      ctx.restore(); // end translate center

      animId = requestAnimationFrame(loop);
    };

    animId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animId);
  }, [isPlaying, gameOver]);

  return (
    <div className="w-full max-w-4xl mx-auto flex flex-col items-center select-none">
      {/* Header */}
      <div className="w-full bg-slate-900 border border-slate-800 text-white px-5 py-3.5 rounded-2xl flex flex-wrap items-center justify-between gap-3 shadow-xl mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-yellow-600 flex items-center justify-center shadow-lg shadow-amber-500/20">
            <Cog className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-black text-lg text-white">선박 프로펠러 & 샤프트 얼라인먼트</h3>
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30">
                회전수: {rpm} RPM
              </span>
            </div>
            <p className="text-xs text-slate-400 font-medium">
              공진 펄스가 청색 레이저 센서 링에 도달할 때 타이밍에 맞춰 토크를 튜닝하세요!
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="text-right">
            <span className="text-xs text-slate-400 block font-medium">얼라인먼트 점수</span>
            <span className="text-2xl font-black text-amber-400 tracking-tight">
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
      <div
        onClick={handleTuneAction}
        className="w-full relative rounded-2xl overflow-hidden border border-slate-800 shadow-2xl bg-slate-950 aspect-[16/9] min-h-[380px] flex items-center justify-center cursor-pointer"
      >
        <canvas ref={canvasRef} className="w-full h-full" />

        {/* Rating text popup */}
        {ratingText && isPlaying && (
          <div
            key={Date.now()}
            className="absolute top-12 left-1/2 -translate-x-1/2 font-black text-lg sm:text-xl drop-shadow-lg animate-in fade-in zoom-in-75 duration-150 pointer-events-none"
            style={{ color: ratingText.color }}
          >
            {ratingText.text}
          </div>
        )}

        {/* Combo HUD */}
        {combo > 1 && isPlaying && (
          <div className="absolute top-4 left-4 bg-slate-900/80 backdrop-blur-md border border-slate-700/60 px-4 py-2 rounded-xl text-white pointer-events-none animate-bounce">
            <span className="text-[10px] text-amber-400 font-bold block uppercase tracking-widest">COMBO</span>
            <span className="text-xl font-black text-white">{combo} 연속 일치</span>
          </div>
        )}

        {/* Start Overlay */}
        {!isPlaying && !gameOver && (
          <div className="absolute inset-0 bg-slate-950/85 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center z-20">
            <div className="w-16 h-16 rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center mb-4 text-amber-400 shadow-xl shadow-amber-500/10">
              <Cog className="w-8 h-8" />
            </div>
            <h2 className="text-2xl sm:text-3xl font-black text-white mb-2">프로펠러 축계 정렬 튜너</h2>
            <p className="text-slate-300 text-sm max-w-md mb-6 leading-relaxed">
              70톤급 청동 프로펠러의 미세 공진을 조율합니다.<br />
              화면을 클릭하거나 <span className="text-amber-400 font-bold">[스페이스바]</span>를 눌러 원형 링에 파동이 겹치는 순간을 튜닝하세요!
            </p>
            <button
              onClick={startGame}
              className="px-8 py-3.5 bg-gradient-to-r from-amber-500 to-yellow-600 hover:from-amber-600 hover:to-yellow-700 text-slate-950 font-black text-base rounded-xl shadow-lg shadow-amber-500/25 active:scale-95 transition-all flex items-center gap-2"
            >
              <Play className="w-5 h-5 fill-slate-950" />
              정밀 얼라인먼트 개시
            </button>
          </div>
        )}

        {/* Game Clear / 100% Torque Calibration */}
        {gameOver && (
          <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center z-20 animate-in fade-in zoom-in-95 duration-200">
            <div className="w-16 h-16 rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center mb-3 text-amber-400">
              <Award className="w-9 h-9" />
            </div>
            <span className="text-xs font-bold text-amber-400 tracking-widest uppercase mb-1">ALIGNMENT PERFECT</span>
            <h3 className="text-2xl sm:text-3xl font-black text-white mb-2">
              축계 정렬 100% 오차 제로 완료!
            </h3>
            <p className="text-slate-300 text-sm mb-4 max-w-md">
              완벽한 공진 댐핑으로 주기관 85 RPM 전속 항해가 승인되었습니다.
            </p>
            <div className="bg-slate-900 border border-slate-800 px-6 py-4 rounded-2xl text-center mb-6 min-w-[200px]">
              <span className="text-xs text-slate-400 block mb-1">최종 공인 점수</span>
              <span className="text-3xl font-black text-amber-400">{score.toLocaleString()}점</span>
            </div>
            <button
              onClick={startGame}
              className="px-7 py-3 bg-gradient-to-r from-amber-500 to-yellow-600 hover:from-amber-600 hover:to-yellow-700 text-slate-950 font-black text-sm rounded-xl active:scale-95 transition-all flex items-center gap-2"
            >
              <RotateCcw className="w-4 h-4" />
              다시 조율하기
            </button>
          </div>
        )}
      </div>

      {/* Torque Progress Bar & Spacebar Tap Button */}
      <div className="w-full mt-4 flex flex-col sm:flex-row items-center gap-4 bg-slate-900 border border-slate-800 p-4 rounded-2xl">
        <div className="flex-1 w-full">
          <div className="flex justify-between items-center text-xs mb-1.5 font-bold">
            <span className="text-slate-300">토크 볼트 체결률 (Torque Calibration)</span>
            <span className="text-amber-400">{torqueProgress}% / 100%</span>
          </div>
          <div className="w-full h-3.5 bg-slate-800 rounded-full overflow-hidden p-0.5 border border-slate-700">
            <div
              className="h-full bg-gradient-to-r from-amber-500 via-yellow-400 to-emerald-400 rounded-full transition-all duration-150 shadow-md"
              style={{ width: `${torqueProgress}%` }}
            />
          </div>
        </div>

        <button
          onClick={handleTuneAction}
          disabled={!isPlaying}
          className="w-full sm:w-auto px-7 py-3 bg-gradient-to-r from-amber-500 to-yellow-600 hover:from-amber-600 hover:to-yellow-700 text-slate-950 font-black text-sm rounded-xl shadow-lg shadow-amber-500/25 active:scale-95 transition-all flex items-center justify-center gap-2 shrink-0"
        >
          <Zap className="w-4 h-4 fill-slate-950" />
          타이밍 터치 / SPACEBAR
        </button>
      </div>
    </div>
  );
}
