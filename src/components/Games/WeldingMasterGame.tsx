import React, { useState, useEffect, useRef } from "react";
import { Play, RotateCcw, Volume2, VolumeX, Flame, Zap, CheckCircle2, Award, AlertTriangle, Clock } from "lucide-react";
import confetti from "canvas-confetti";
import { gameAudio } from "../../lib/gameSounds";

interface WeldingMasterGameProps {
  onFinish: (score: number) => void;
}

interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  alpha: number;
  life: number;
  color: string;
}

interface BeadPoint {
  x: number;
  y: number;
  quality: number; // 0 to 1
  width: number;
}

interface PathNode {
  x: number;
  y: number;
}

export default function WeldingMasterGame({ onFinish }: WeldingMasterGameProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [stage, setStage] = useState(1);
  const [totalScore, setTotalScore] = useState(0);
  const [isMuted, setIsMuted] = useState(gameAudio.getMuted());
  const [stageComplete, setStageComplete] = useState(false);
  const [qualityGrade, setQualityGrade] = useState<string>("S");
  const [timeLeft, setTimeLeft] = useState(30); // 30s limit per seam
  const [heatInput, setHeatInput] = useState(18); // kJ/cm (optimal: 15~22)

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const isWeldingRef = useRef(false);
  const mousePosRef = useRef({ x: 0, y: 0 });
  const lastWeldedPosRef = useRef<{ x: number; y: number } | null>(null);
  const lastTimeRef = useRef<number>(0);
  const seamPathRef = useRef<PathNode[]>([]);
  const beadsRef = useRef<BeadPoint[]>([]);
  const sparksRef = useRef<Spark[]>([]);
  const currentPathIdxRef = useRef(0);
  const stageScoreRef = useRef(0);
  const stagePenaltiesRef = useRef(0);
  const timeLeftRef = useRef(30);
  const animationFrameRef = useRef<number>(0);

  const toggleSound = () => {
    const muted = gameAudio.toggleMute();
    setIsMuted(muted);
  };

  const generatePath = (stageNum: number, width: number, height: number): PathNode[] => {
    const nodes: PathNode[] = [];
    const padding = 60;
    const startX = padding;
    const endX = width - padding;
    const midY = height / 2;

    const count = 45 + stageNum * 12;
    for (let i = 0; i <= count; i++) {
      const t = i / count;
      const x = startX + (endX - startX) * t;
      let y = midY;

      if (stageNum === 1) {
        // Mild wave hull plate joint
        y = midY + Math.sin(t * Math.PI * 3) * 35;
      } else if (stageNum === 2) {
        // Double bevel curved joint
        y = midY + Math.sin(t * Math.PI * 6) * 50 + Math.cos(t * Math.PI * 2) * 22;
      } else {
        // Bulbous bow 3D intersection curve
        y = midY + Math.sin(t * Math.PI * 5) * 60 + Math.sin(t * Math.PI * 11) * 26;
      }
      nodes.push({ x, y });
    }
    return nodes;
  };

  const startStage = (stg: number) => {
    setStage(stg);
    setStageComplete(false);
    currentPathIdxRef.current = 0;
    stageScoreRef.current = 0;
    stagePenaltiesRef.current = 0;
    beadsRef.current = [];
    sparksRef.current = [];
    lastWeldedPosRef.current = null;
    timeLeftRef.current = 30;
    setTimeLeft(30);

    const canvas = canvasRef.current;
    if (canvas) {
      seamPathRef.current = generatePath(stg, canvas.width, canvas.height);
    }
  };

  const startGame = () => {
    gameAudio.playClick();
    setIsPlaying(true);
    setGameOver(false);
    setTotalScore(0);
    startStage(1);
  };

  // Timer countdown
  useEffect(() => {
    if (!isPlaying || stageComplete || gameOver) return;
    const timer = setInterval(() => {
      timeLeftRef.current -= 1;
      setTimeLeft(timeLeftRef.current);
      if (timeLeftRef.current <= 0) {
        clearInterval(timer);
        gameAudio.playDrop();
        setGameOver(true);
        setIsPlaying(false);
        onFinish(totalScore + stageScoreRef.current);
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [isPlaying, stageComplete, gameOver, totalScore]);

  // Canvas loop
  useEffect(() => {
    if (!isPlaying) return;

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

    if (seamPathRef.current.length === 0) {
      seamPathRef.current = generatePath(stage, w, h);
    }

    let lastSparkAudioTime = 0;

    const render = (time: number) => {
      const dt = lastTimeRef.current ? (time - lastTimeRef.current) / 1000 : 0.016;
      lastTimeRef.current = time;

      // Industrial Dark Steel Plate Background
      ctx.fillStyle = "#1e2430";
      ctx.fillRect(0, 0, w, h);

      // Steel plate mill grain & bevel groove
      ctx.strokeStyle = "#273142";
      ctx.lineWidth = 1;
      for (let gy = 0; gy < h; gy += 25) {
        ctx.beginPath();
        ctx.moveTo(0, gy);
        ctx.lineTo(w, gy);
        ctx.stroke();
      }

      // V-Groove Seam Base (Dark Chamfer)
      const path = seamPathRef.current;
      if (path.length > 1) {
        ctx.beginPath();
        ctx.moveTo(path[0].x, path[0].y);
        for (let i = 1; i < path.length; i++) {
          ctx.lineTo(path[i].x, path[i].y);
        }
        ctx.strokeStyle = "#0b0f19";
        ctx.lineWidth = 26;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.stroke();

        ctx.strokeStyle = "#334155";
        ctx.lineWidth = 10;
        ctx.stroke();

        // Glowing Guide Line
        ctx.setLineDash([6, 6]);
        ctx.strokeStyle = "#00e5ff";
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // Heat-Affected Zone (HAZ) & Molten Weld Bead Pool
      const beads = beadsRef.current;
      if (beads.length > 1) {
        // HAZ Tempering Color
        ctx.beginPath();
        ctx.moveTo(beads[0].x, beads[0].y);
        for (let i = 1; i < beads.length; i++) {
          ctx.lineTo(beads[i].x, beads[i].y);
        }
        ctx.strokeStyle = "rgba(99, 102, 241, 0.25)";
        ctx.lineWidth = 32;
        ctx.lineCap = "round";
        ctx.stroke();

        ctx.strokeStyle = "rgba(245, 158, 11, 0.35)";
        ctx.lineWidth = 22;
        ctx.stroke();

        // Weld Ripples
        for (let i = 0; i < beads.length; i++) {
          const b = beads[i];
          const radius = b.width;
          const grad = ctx.createRadialGradient(b.x, b.y, 2, b.x, b.y, radius);
          if (b.quality > 0.8) {
            grad.addColorStop(0, "#fffbeb");
            grad.addColorStop(0.5, "#f59e0b");
            grad.addColorStop(1, "#78350f");
          } else if (b.quality > 0.4) {
            grad.addColorStop(0, "#fef3c7");
            grad.addColorStop(0.6, "#d97706");
            grad.addColorStop(1, "#451a03");
          } else {
            grad.addColorStop(0, "#94a3b8");
            grad.addColorStop(0.7, "#475569");
            grad.addColorStop(1, "#1e293b");
          }

          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(b.x, b.y, radius, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Target Node Indicator
      const curIdx = currentPathIdxRef.current;
      if (curIdx < path.length) {
        const target = path[curIdx];
        ctx.strokeStyle = "#facc15";
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(target.x, target.y, 14 + Math.sin(time / 150) * 3, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Active Welding Arc Flash
      if (isWeldingRef.current && curIdx < path.length) {
        const m = mousePosRef.current;
        const target = path[curIdx];
        const dist = Math.hypot(m.x - target.x, m.y - target.y);

        if (dist <= 35) {
          let speedQuality = 1;
          if (lastWeldedPosRef.current) {
            const moveDist = Math.hypot(m.x - lastWeldedPosRef.current.x, m.y - lastWeldedPosRef.current.y);
            const speed = moveDist / Math.max(dt, 0.001);
            if (speed > 420 || speed < 40) {
              speedQuality = 0.5;
            } else {
              speedQuality = 1 - Math.abs(speed - 160) / 260;
            }
          }

          const devQuality = Math.max(0, 1 - dist / 35);
          const ptQuality = speedQuality * 0.5 + devQuality * 0.5;

          beadsRef.current.push({
            x: m.x,
            y: m.y,
            quality: ptQuality,
            width: 8 + (1 - speedQuality) * 4,
          });

          lastWeldedPosRef.current = { x: m.x, y: m.y };
          stageScoreRef.current += Math.round(ptQuality * 60);

          if (dist < 18) {
            currentPathIdxRef.current += 1;
          }

          if (time - lastSparkAudioTime > 80) {
            gameAudio.playWelding();
            lastSparkAudioTime = time;
          }

          // Sparks
          for (let s = 0; s < 5; s++) {
            const angle = Math.random() * Math.PI * 2;
            const spd = 80 + Math.random() * 240;
            sparksRef.current.push({
              x: m.x,
              y: m.y,
              vx: Math.cos(angle) * spd,
              vy: Math.sin(angle) * spd - 40,
              alpha: 1,
              life: 0.25 + Math.random() * 0.3,
              color: Math.random() > 0.4 ? "#fffbeb" : "#f59e0b",
            });
          }

          // Arc Flash Glow
          const arcGrad = ctx.createRadialGradient(m.x, m.y, 2, m.x, m.y, 30);
          arcGrad.addColorStop(0, "rgba(255, 255, 255, 0.98)");
          arcGrad.addColorStop(0.3, "rgba(186, 230, 253, 0.75)");
          arcGrad.addColorStop(0.7, "rgba(56, 189, 248, 0.3)");
          arcGrad.addColorStop(1, "rgba(0, 0, 0, 0)");
          ctx.fillStyle = arcGrad;
          ctx.beginPath();
          ctx.arc(m.x, m.y, 30, 0, Math.PI * 2);
          ctx.fill();
        } else {
          stagePenaltiesRef.current += 1;
        }

        if (currentPathIdxRef.current >= path.length) {
          isWeldingRef.current = false;
          handleStageFinish();
        }
      }

      // Update sparks
      const sparks = sparksRef.current;
      for (let i = sparks.length - 1; i >= 0; i--) {
        const sp = sparks[i];
        sp.x += sp.vx * dt;
        sp.y += sp.vy * dt;
        sp.vy += 320 * dt;
        sp.life -= dt;
        sp.alpha = Math.max(0, sp.life / 0.5);

        if (sp.life <= 0) {
          sparks.splice(i, 1);
          continue;
        }

        ctx.strokeStyle = sp.color;
        ctx.globalAlpha = sp.alpha;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(sp.x, sp.y);
        ctx.lineTo(sp.x - sp.vx * dt * 0.4, sp.y - sp.vy * dt * 0.4);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }

      // Torch reticle
      const m = mousePosRef.current;
      if (m.x > 0 && m.y > 0) {
        ctx.strokeStyle = isWeldingRef.current ? "#22d3ee" : "rgba(255,255,255,0.4)";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(m.x - 12, m.y);
        ctx.lineTo(m.x + 12, m.y);
        ctx.moveTo(m.x, m.y - 12);
        ctx.lineTo(m.x, m.y + 12);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(m.x, m.y, 8, 0, Math.PI * 2);
        ctx.stroke();
      }

      animationFrameRef.current = requestAnimationFrame(render);
    };

    animationFrameRef.current = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animationFrameRef.current);
  }, [isPlaying, stage]);

  const handleStageFinish = () => {
    gameAudio.playVictory();
    const finalScore = stageScoreRef.current + timeLeftRef.current * 40 - stagePenaltiesRef.current * 10;
    const calcScore = Math.max(300, finalScore);
    const newTotal = totalScore + calcScore;
    setTotalScore(newTotal);

    let grade = "A";
    if (stagePenaltiesRef.current < 4 && calcScore > 1600) grade = "S+";
    else if (stagePenaltiesRef.current < 12) grade = "S";
    else if (stagePenaltiesRef.current < 25) grade = "A";
    else grade = "B";

    setQualityGrade(grade);
    setStageComplete(true);

    if (stage >= 3) {
      setGameOver(true);
      onFinish(newTotal);
      confetti({
        particleCount: 80,
        spread: 80,
        origin: { y: 0.6 },
        colors: ["#F5A623", "#002C6C", "#00A352", "#FFFFFF"],
      });
    }
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isPlaying || stageComplete || gameOver) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    mousePosRef.current = { x, y };
    isWeldingRef.current = true;
    lastWeldedPosRef.current = { x, y };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    mousePosRef.current = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  };

  const handlePointerUp = () => {
    isWeldingRef.current = false;
  };

  return (
    <div className="w-full max-w-5xl mx-auto flex flex-col items-center select-none font-sans">
      {/* Top Header */}
      <div className="w-full bg-slate-900 border border-slate-800 text-white px-5 py-3 rounded-2xl flex flex-wrap items-center justify-between gap-4 shadow-xl mb-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-lg shadow-orange-500/20">
            <Flame className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-black text-base sm:text-lg text-white">용접 마스터: 선박 후판 비드 (FCAW)</h3>
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30">
                STAGE {stage}/3
              </span>
            </div>
            <p className="text-xs text-slate-400 font-medium">
              청색 V-그루브를 따라 토치를 드래그하여 결함 없는 초정밀 용접 비드를 생성하세요.
            </p>
          </div>
        </div>

        {/* Live Gauges */}
        <div className="flex items-center gap-4 text-xs font-semibold">
          <div className="bg-slate-800/80 px-3 py-1.5 rounded-xl border border-slate-700/60">
            <span className="text-slate-400 block text-[10px]">보호가스 잔여시간</span>
            <span className={`text-base font-black ${timeLeft <= 8 ? "text-rose-400 animate-pulse" : "text-amber-400"}`}>
              {timeLeft}초
            </span>
          </div>

          <div className="bg-slate-800/80 px-3 py-1.5 rounded-xl border border-slate-700/60">
            <span className="text-slate-400 block text-[10px]">용접 진행도</span>
            <span className="text-base font-black text-cyan-400">
              {seamPathRef.current.length > 0 ? Math.round((currentPathIdxRef.current / seamPathRef.current.length) * 100) : 0}%
            </span>
          </div>

          <div className="bg-slate-800/80 px-3 py-1.5 rounded-xl border border-slate-700/60">
            <span className="text-slate-400 block text-[10px]">누적 용접 점수</span>
            <span className="text-base font-black text-amber-400">{totalScore.toLocaleString()}점</span>
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

      {/* Main Canvas Viewport */}
      <div className="w-full relative rounded-2xl overflow-hidden border border-slate-800 shadow-2xl bg-slate-950 aspect-[16/9] min-h-[400px] flex items-center justify-center">
        <canvas
          ref={canvasRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
          className="w-full h-full cursor-crosshair touch-none"
        />

        {/* Start Overlay */}
        {!isPlaying && (
          <div className="absolute inset-0 bg-slate-950/85 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center z-20">
            <div className="w-16 h-16 rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center mb-4 text-amber-400 shadow-xl shadow-amber-500/10">
              <Flame className="w-8 h-8" />
            </div>
            <h2 className="text-2xl sm:text-3xl font-black text-white mb-2">선체 특수강 V-그루브 용접 마스터</h2>
            <p className="text-slate-300 text-sm max-w-lg mb-6 leading-relaxed">
              가만히 있으면 아크가 발생하지 않으며 <strong>30초 보호가스 타이머</strong>가 소진됩니다!<br />
              마우스를 누른 채 청색 가이드 라인을 따라 균일한 속도로 운봉하여<br />
              <strong>비파괴 초음파(UT) S등급</strong>의 결함 없는 명품 비드를 완성하세요.
            </p>
            <button
              onClick={startGame}
              className="px-8 py-3.5 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-slate-950 font-black text-base rounded-xl shadow-lg shadow-orange-500/25 active:scale-95 transition-all flex items-center gap-2"
            >
              <Play className="w-5 h-5 fill-slate-950" />
              아크 용접 시작
            </button>
          </div>
        )}

        {/* Stage Complete Banner */}
        {isPlaying && stageComplete && !gameOver && (
          <div className="absolute inset-0 bg-slate-950/85 backdrop-blur-md flex flex-col items-center justify-center p-6 z-20 animate-in fade-in zoom-in-95 duration-200">
            <div className="w-16 h-16 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center mb-3 text-emerald-400">
              <CheckCircle2 className="w-9 h-9" />
            </div>
            <span className="text-xs font-bold text-emerald-400 tracking-widest uppercase mb-1">STAGE PASSED</span>
            <h3 className="text-2xl font-black text-white mb-1">
              STAGE {stage} 비파괴 비드 검사 합격!
            </h3>
            <div className="flex items-center gap-4 my-4">
              <div className="bg-slate-900 border border-slate-800 px-5 py-2.5 rounded-xl text-center">
                <span className="text-[11px] text-slate-400 block">용접 품질 등급</span>
                <span className="text-2xl font-black text-amber-400">{qualityGrade}</span>
              </div>
              <div className="bg-slate-900 border border-slate-800 px-5 py-2.5 rounded-xl text-center">
                <span className="text-[11px] text-slate-400 block">누적 공정 점수</span>
                <span className="text-2xl font-black text-emerald-400">{totalScore.toLocaleString()}점</span>
              </div>
            </div>
            <button
              onClick={() => startStage(stage + 1)}
              className="px-7 py-3 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-slate-950 font-black text-sm rounded-xl shadow-lg shadow-emerald-500/25 active:scale-95 transition-all"
            >
              다음 스테이지 ({stage + 1}/3) 진행 →
            </button>
          </div>
        )}

        {/* Game Over */}
        {gameOver && (
          <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-md flex flex-col items-center justify-center p-6 z-20 animate-in fade-in zoom-in-95 duration-200">
            <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mb-3 ${stageComplete ? "bg-amber-500/20 text-amber-400" : "bg-rose-500/20 text-rose-400"}`}>
              {stageComplete ? <Award className="w-9 h-9" /> : <AlertTriangle className="w-9 h-9" />}
            </div>
            <h3 className="text-2xl sm:text-3xl font-black text-white mb-2">
              {stageComplete ? "명품 선박 용접 공정 완수!" : "용접 보호가스 소진 / 공정 중단"}
            </h3>
            <p className="text-slate-300 text-sm mb-4">
              {stageComplete ? "선급협회(KR/DNV) 규격을 만족하는 최고 품질 비드를 달성했습니다." : "제한시간 내에 비드를 완성하지 못했습니다."}
            </p>
            <div className="bg-slate-900 border border-slate-800 px-6 py-4 rounded-2xl text-center mb-6 min-w-[200px]">
              <span className="text-xs text-slate-400 block mb-1">최종 용접 점수</span>
              <span className="text-3xl font-black text-amber-400">{totalScore.toLocaleString()}점</span>
            </div>
            <button
              onClick={startGame}
              className="px-7 py-3 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white font-bold text-sm rounded-xl active:scale-95 transition-all flex items-center gap-2"
            >
              <RotateCcw className="w-4 h-4" />
              다시 도전하기
            </button>
          </div>
        )}
      </div>

      {/* Bottom Specs Info */}
      <div className="w-full mt-3 bg-slate-900/60 border border-slate-800/80 rounded-xl p-3 flex items-center justify-between text-xs text-slate-400">
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-amber-400 shrink-0" />
          <span>팁: 너무 빠르면 불완전 용입(Undercut), 너무 느리면 모재 용락 발생! 일정한 운봉 속도를 유지하세요.</span>
        </div>
        <span className="text-slate-500 hidden sm:inline">EH36 High-Tensile Steel FCAW</span>
      </div>
    </div>
  );
}
