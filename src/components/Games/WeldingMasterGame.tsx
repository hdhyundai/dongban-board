import React, { useState, useEffect, useRef } from "react";
import { Play, RotateCcw, Volume2, VolumeX, Flame, Zap, CheckCircle2, Award } from "lucide-react";
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
  const [weldingHeat, setWeldingHeat] = useState(50); // 0-100 optimal around 50-70

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
  const animationFrameRef = useRef<number>(0);

  const toggleSound = () => {
    const muted = gameAudio.toggleMute();
    setIsMuted(muted);
  };

  // Generate path according to stage
  const generatePath = (stageNum: number, width: number, height: number): PathNode[] => {
    const nodes: PathNode[] = [];
    const padding = 50;
    const startX = padding;
    const endX = width - padding;
    const midY = height / 2;

    const count = 40 + stageNum * 15;
    for (let i = 0; i <= count; i++) {
      const t = i / count;
      const x = startX + (endX - startX) * t;
      let y = midY;

      if (stageNum === 1) {
        // Mild wave
        y = midY + Math.sin(t * Math.PI * 3) * 35;
      } else if (stageNum === 2) {
        // Zigzag bevel joint
        y = midY + Math.sin(t * Math.PI * 6) * 55 + Math.cos(t * Math.PI * 2) * 20;
      } else {
        // Curved complex hull section (bulbous bow joint)
        y = midY + Math.sin(t * Math.PI * 5) * 60 + Math.sin(t * Math.PI * 11) * 25;
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

  // Canvas loop
  useEffect(() => {
    if (!isPlaying) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Handle high DPI
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

      // Draw industrial steel background
      ctx.fillStyle = "#1e2430";
      ctx.fillRect(0, 0, w, h);

      // Steel plate texture & joint groove
      ctx.strokeStyle = "#2c3545";
      ctx.lineWidth = 1;
      for (let gy = 0; gy < h; gy += 30) {
        ctx.beginPath();
        ctx.moveTo(0, gy);
        ctx.lineTo(w, gy);
        ctx.stroke();
      }

      // Draw V-groove seam background (shadow & bevel)
      const path = seamPathRef.current;
      if (path.length > 1) {
        // Outer dark bevel
        ctx.beginPath();
        ctx.moveTo(path[0].x, path[0].y);
        for (let i = 1; i < path.length; i++) {
          ctx.lineTo(path[i].x, path[i].y);
        }
        ctx.strokeStyle = "#0d1117";
        ctx.lineWidth = 26;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.stroke();

        // Inner seam groove (glowing guide)
        ctx.beginPath();
        ctx.moveTo(path[0].x, path[0].y);
        for (let i = 1; i < path.length; i++) {
          ctx.lineTo(path[i].x, path[i].y);
        }
        ctx.strokeStyle = "#384358";
        ctx.lineWidth = 10;
        ctx.stroke();

        // Seam center guide line
        ctx.setLineDash([6, 6]);
        ctx.strokeStyle = "#00e5ff";
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // Draw heat-affected zone (HAZ) discoloration along beads
      const beads = beadsRef.current;
      if (beads.length > 1) {
        // Purple-blue heat temper ring
        ctx.beginPath();
        ctx.moveTo(beads[0].x, beads[0].y);
        for (let i = 1; i < beads.length; i++) {
          ctx.lineTo(beads[i].x, beads[i].y);
        }
        ctx.strokeStyle = "rgba(100, 120, 240, 0.28)";
        ctx.lineWidth = 32;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.stroke();

        // Golden oxide edge
        ctx.beginPath();
        ctx.moveTo(beads[0].x, beads[0].y);
        for (let i = 1; i < beads.length; i++) {
          ctx.lineTo(beads[i].x, beads[i].y);
        }
        ctx.strokeStyle = "rgba(220, 150, 40, 0.4)";
        ctx.lineWidth = 22;
        ctx.stroke();

        // Solid weld metal ripples (bead wave)
        for (let i = 0; i < beads.length; i++) {
          const b = beads[i];
          const radius = b.width;
          const grad = ctx.createRadialGradient(b.x, b.y, 2, b.x, b.y, radius);
          if (b.quality > 0.8) {
            grad.addColorStop(0, "#fff5dd");
            grad.addColorStop(0.5, "#d99b26");
            grad.addColorStop(1, "#593d0c");
          } else if (b.quality > 0.4) {
            grad.addColorStop(0, "#e8d5b5");
            grad.addColorStop(0.6, "#9e6818");
            grad.addColorStop(1, "#362208");
          } else {
            // Bad bead (too fast/slow)
            grad.addColorStop(0, "#999999");
            grad.addColorStop(0.7, "#444444");
            grad.addColorStop(1, "#111111");
          }

          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(b.x, b.y, radius, 0, Math.PI * 2);
          ctx.fill();

          // Bead crescent ripple
          ctx.strokeStyle = "rgba(255, 255, 255, 0.3)";
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(b.x - 2, b.y - 2, radius * 0.7, 0, Math.PI);
          ctx.stroke();
        }
      }

      // Next Target Indicator
      const curIdx = currentPathIdxRef.current;
      if (curIdx < path.length) {
        const target = path[curIdx];
        ctx.strokeStyle = "#ffd700";
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(target.x, target.y, 14 + Math.sin(time / 150) * 3, 0, Math.PI * 2);
        ctx.stroke();

        // Pulsing glow
        ctx.fillStyle = "rgba(255, 215, 0, 0.25)";
        ctx.beginPath();
        ctx.arc(target.x, target.y, 10, 0, Math.PI * 2);
        ctx.fill();
      }

      // Handle active welding
      if (isWeldingRef.current && curIdx < path.length) {
        const m = mousePosRef.current;
        const target = path[curIdx];
        const distToTarget = Math.hypot(m.x - target.x, m.y - target.y);

        // Distance deviation
        const maxTol = 32;
        if (distToTarget <= maxTol) {
          // Calculate movement speed
          let speedQuality = 1;
          if (lastWeldedPosRef.current) {
            const moveDist = Math.hypot(m.x - lastWeldedPosRef.current.x, m.y - lastWeldedPosRef.current.y);
            const speed = moveDist / Math.max(dt, 0.001); // px/sec
            // Optimal speed is 100 - 240 px/sec
            if (speed > 400) {
              speedQuality = 0.4; // Too fast
            } else if (speed < 40) {
              speedQuality = 0.5; // Too slow
            } else {
              speedQuality = 1 - Math.abs(speed - 160) / 240;
            }
          }

          const devQuality = Math.max(0, 1 - distToTarget / maxTol);
          const ptQuality = (speedQuality * 0.5 + devQuality * 0.5);

          // Add bead
          beadsRef.current.push({
            x: m.x,
            y: m.y,
            quality: ptQuality,
            width: 8 + (1 - speedQuality) * 4,
          });

          lastWeldedPosRef.current = { x: m.x, y: m.y };
          stageScoreRef.current += Math.round(ptQuality * 50);

          // Advance node if close enough
          if (distToTarget < 18) {
            currentPathIdxRef.current += 1;
          }

          // Sound trigger throttled
          if (time - lastSparkAudioTime > 80) {
            gameAudio.playWelding();
            lastSparkAudioTime = time;
          }

          // Generate spark particles
          for (let s = 0; s < 4; s++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 70 + Math.random() * 220;
            sparksRef.current.push({
              x: m.x,
              y: m.y,
              vx: Math.cos(angle) * speed,
              vy: Math.sin(angle) * speed - 40, // slight upward bias
              alpha: 1,
              life: 0.2 + Math.random() * 0.35,
              color: Math.random() > 0.4 ? "#fff4cc" : (Math.random() > 0.5 ? "#ffaa00" : "#ff4400"),
            });
          }

          // Arc flash core
          const arcGrad = ctx.createRadialGradient(m.x, m.y, 2, m.x, m.y, 28);
          arcGrad.addColorStop(0, "rgba(255, 255, 255, 0.95)");
          arcGrad.addColorStop(0.3, "rgba(200, 240, 255, 0.7)");
          arcGrad.addColorStop(0.7, "rgba(50, 160, 255, 0.3)");
          arcGrad.addColorStop(1, "rgba(0, 100, 255, 0)");

          ctx.fillStyle = arcGrad;
          ctx.beginPath();
          ctx.arc(m.x, m.y, 28, 0, Math.PI * 2);
          ctx.fill();

          // Arc center diamond
          ctx.fillStyle = "#ffffff";
          ctx.beginPath();
          ctx.arc(m.x, m.y, 4, 0, Math.PI * 2);
          ctx.fill();
        } else {
          // Off track penalty
          stagePenaltiesRef.current += 1;
        }

        // Check if finished path
        if (currentPathIdxRef.current >= path.length) {
          isWeldingRef.current = false;
          handleStageFinish();
        }
      }

      // Update and draw sparks
      const sparks = sparksRef.current;
      for (let i = sparks.length - 1; i >= 0; i--) {
        const sp = sparks[i];
        sp.x += sp.vx * dt;
        sp.y += sp.vy * dt;
        sp.vy += 320 * dt; // gravity
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

      // Draw torch tip guide when mouse moves
      const m = mousePosRef.current;
      if (m.x > 0 && m.y > 0) {
        ctx.strokeStyle = isWeldingRef.current ? "#00ffcc" : "rgba(255,255,255,0.4)";
        ctx.lineWidth = 1.5;
        // Crosshair
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
    const finalScore = stageScoreRef.current - stagePenaltiesRef.current * 10;
    const calcScore = Math.max(200, finalScore);
    const newTotal = totalScore + calcScore;
    setTotalScore(newTotal);

    // Calculate quality grade
    let grade = "A";
    if (stagePenaltiesRef.current < 5 && calcScore > 1400) grade = "S+";
    else if (stagePenaltiesRef.current < 15) grade = "S";
    else if (stagePenaltiesRef.current < 30) grade = "A";
    else grade = "B";

    setQualityGrade(grade);
    setStageComplete(true);

    if (stage >= 3) {
      setGameOver(true);
      onFinish(newTotal);
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
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    mousePosRef.current = { x, y };
  };

  const handlePointerUp = () => {
    isWeldingRef.current = false;
  };

  return (
    <div className="w-full max-w-4xl mx-auto flex flex-col items-center select-none">
      {/* Game Header Bar */}
      <div className="w-full bg-slate-900 border border-slate-800 text-white px-5 py-3.5 rounded-2xl flex flex-wrap items-center justify-between gap-3 shadow-xl mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-lg shadow-orange-500/20">
            <Flame className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-black text-lg text-white">용접 마스터 : 선박 블록 비드</h3>
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30">
                STAGE {stage}/3
              </span>
            </div>
            <p className="text-xs text-slate-400 font-medium">
              청색 가이드 라인을 따라 균일한 속도로 토치를 드래그하여 고품질 비드를 형성하세요!
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="text-right">
            <span className="text-xs text-slate-400 block font-medium">누적 용접 점수</span>
            <span className="text-2xl font-black text-amber-400 tracking-tight">
              {totalScore.toLocaleString()}
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

      {/* Main Canvas Workspace */}
      <div className="w-full relative rounded-2xl overflow-hidden border border-slate-800 shadow-2xl bg-slate-950 aspect-[16/9] min-h-[360px] flex items-center justify-center">
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
            <h2 className="text-2xl sm:text-3xl font-black text-white mb-2">선체 블록 용접 마스터</h2>
            <p className="text-slate-300 text-sm max-w-md mb-6 leading-relaxed">
              HD현대삼호의 명품 선박은 오차 없는 정밀 비드에서 탄생합니다.<br />
              마우스나 터치로 토치를 눌러 V자 이음매를 따라 최적의 속도로 용접하세요!
            </p>
            <button
              onClick={startGame}
              className="px-8 py-3.5 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-slate-950 font-black text-base rounded-xl shadow-lg shadow-orange-500/25 active:scale-95 transition-all flex items-center gap-2"
            >
              <Play className="w-5 h-5 fill-slate-950" />
              용접 작업 시작
            </button>
          </div>
        )}

        {/* Stage Complete Banner */}
        {isPlaying && stageComplete && !gameOver && (
          <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-md flex flex-col items-center justify-center p-6 z-20 animate-in fade-in zoom-in-95 duration-200">
            <div className="w-16 h-16 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center mb-3 text-emerald-400">
              <CheckCircle2 className="w-9 h-9" />
            </div>
            <span className="text-xs font-bold text-emerald-400 tracking-widest uppercase mb-1">STAGE PASSED</span>
            <h3 className="text-2xl font-black text-white mb-1">
              STAGE {stage} 비드 용접 검사 통과!
            </h3>
            <div className="flex items-center gap-4 my-4">
              <div className="bg-slate-900 border border-slate-800 px-4 py-2 rounded-xl text-center">
                <span className="text-[11px] text-slate-400 block">용접 품질 등급</span>
                <span className="text-2xl font-black text-amber-400">{qualityGrade}</span>
              </div>
              <div className="bg-slate-900 border border-slate-800 px-4 py-2 rounded-xl text-center">
                <span className="text-[11px] text-slate-400 block">현재 획득 점수</span>
                <span className="text-2xl font-black text-emerald-400">{totalScore.toLocaleString()}점</span>
              </div>
            </div>
            <button
              onClick={() => startStage(stage + 1)}
              className="px-7 py-3 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-slate-950 font-black text-sm rounded-xl shadow-lg shadow-emerald-500/25 active:scale-95 transition-all"
            >
              다음 스테이지 ({stage + 1}/3) 도전 →
            </button>
          </div>
        )}

        {/* Game Over / All Stages Complete */}
        {gameOver && (
          <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-md flex flex-col items-center justify-center p-6 z-20 animate-in fade-in zoom-in-95 duration-200">
            <div className="w-16 h-16 rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center mb-3 text-amber-400">
              <Award className="w-9 h-9" />
            </div>
            <span className="text-xs font-bold text-amber-400 tracking-widest uppercase mb-1">WELDING MASTER</span>
            <h3 className="text-2xl sm:text-3xl font-black text-white mb-2">
              최고 등급 선박 용접 완료!
            </h3>
            <p className="text-slate-300 text-sm mb-4">
              HD현대삼호 품질보증팀 검사 결과 비드 균일도 최우수 판정을 받았습니다.
            </p>
            <div className="bg-slate-900 border border-slate-800 px-6 py-4 rounded-2xl text-center mb-6 min-w-[200px]">
              <span className="text-xs text-slate-400 block mb-1">최종 공인 점수</span>
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

      {/* Guide Tips */}
      <div className="w-full mt-3 bg-slate-900/60 border border-slate-800/80 rounded-xl p-3 flex items-center justify-between text-xs text-slate-400">
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-amber-400 shrink-0" />
          <span>팁: 너무 빠르면 불완전 용입, 너무 느리면 용락 발생! 일정한 리듬을 유지하세요.</span>
        </div>
        <span className="text-slate-500 hidden sm:inline">V-Groove Full Penetration</span>
      </div>
    </div>
  );
}
