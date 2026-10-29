import React, { useState, useEffect, useRef } from "react";
import { Play, RotateCcw, Volume2, VolumeX, Flame, Zap, CheckCircle2, Award, AlertTriangle } from "lucide-react";
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

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const isWeldingRef = useRef(false);
  const mousePosRef = useRef({ x: -100, y: -100 });
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
  const logicalSizeRef = useRef({ width: 860, height: 420 });

  const toggleSound = () => {
    const muted = gameAudio.toggleMute();
    setIsMuted(muted);
  };

  // Generate smooth weld seam path in CSS logical coordinates (width x height)
  const generatePath = (stageNum: number, width: number, height: number): PathNode[] => {
    const nodes: PathNode[] = [];
    const validW = Math.max(width, 600);
    const validH = Math.max(height, 320);

    const paddingX = Math.max(60, validW * 0.08);
    const startX = paddingX;
    const endX = validW - paddingX;
    const midY = validH / 2;

    // Amplitude kept well within bounds so the seam never touches borders
    const maxAmp = Math.min(validH * 0.22, 65);
    const count = 55 + stageNum * 12;

    for (let i = 0; i <= count; i++) {
      const t = i / count;
      const x = startX + (endX - startX) * t;
      let y = midY;

      if (stageNum === 1) {
        // Stage 1: Mild curved hull plate butt joint
        y = midY + Math.sin(t * Math.PI * 2.5) * (maxAmp * 0.65);
      } else if (stageNum === 2) {
        // Stage 2: S-curve transverse deck joint
        y = midY + Math.sin(t * Math.PI * 4) * (maxAmp * 0.75) + Math.cos(t * Math.PI * 2) * (maxAmp * 0.25);
      } else {
        // Stage 3: Complex curved bulbous bow block shell joint
        y = midY + Math.sin(t * Math.PI * 5) * (maxAmp * 0.8) + Math.sin(t * Math.PI * 9) * (maxAmp * 0.3);
      }
      nodes.push({ x: Math.round(x), y: Math.round(y) });
    }
    return nodes;
  };

  const getCanvasLogicalSize = () => {
    if (canvasRef.current) {
      const rect = canvasRef.current.getBoundingClientRect();
      if (rect.width > 200 && rect.height > 150) {
        return { width: rect.width, height: rect.height };
      }
    }
    return logicalSizeRef.current;
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

    const size = getCanvasLogicalSize();
    logicalSizeRef.current = size;
    seamPathRef.current = generatePath(stg, size.width, size.height);
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

  const containerRef = useRef<HTMLDivElement | null>(null);

  // ResizeObserver for 100% responsive fit inside modal
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 50 && height > 50) {
          logicalSizeRef.current = { width, height };
          // If path already exists, proportionally scale it
          if (seamPathRef.current.length > 0) {
            seamPathRef.current = generatePath(stage, width, height);
          }
        }
      }
    });

    ro.observe(container);
    return () => ro.disconnect();
  }, [stage]);

  // Main Canvas Render & Game Loop - runs continuously so plate and seam are always clearly visible
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let lastSparkAudioTime = 0;

    const render = (time: number) => {
      const dt = lastTimeRef.current ? Math.min((time - lastTimeRef.current) / 1000, 0.05) : 0.016;
      lastTimeRef.current = time;

      // Handle HiDPI & Resize dynamically
      const container = containerRef.current;
      const rect = container ? container.getBoundingClientRect() : canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.max(300, rect.width > 0 ? rect.width : logicalSizeRef.current.width);
      const h = Math.max(220, rect.height > 0 ? rect.height : logicalSizeRef.current.height);

      const bufW = Math.round(w * dpr);
      const bufH = Math.round(h * dpr);
      if (canvas.width !== bufW || canvas.height !== bufH) {
        canvas.width = bufW;
        canvas.height = bufH;
        canvas.style.width = `${w}px`;
        canvas.style.height = `${h}px`;
        logicalSizeRef.current = { width: w, height: h };
        seamPathRef.current = generatePath(stage, w, h);
      }

      // If seam path is not generated yet, generate now
      if (seamPathRef.current.length === 0) {
        logicalSizeRef.current = { width: w, height: h };
        seamPathRef.current = generatePath(stage, w, h);
      }

      ctx.save();
      ctx.scale(dpr, dpr);

      // 1. Industrial Shipbuilding Steel Plate Background (EH36 Grade)
      ctx.fillStyle = "#151b26";
      ctx.fillRect(0, 0, w, h);

      // Mill scale & rolling mill texture grain
      ctx.strokeStyle = "rgba(43, 56, 76, 0.45)";
      ctx.lineWidth = 1;
      for (let gy = 0; gy < h; gy += 24) {
        ctx.beginPath();
        ctx.moveTo(0, gy);
        ctx.lineTo(w, gy);
        ctx.stroke();
      }

      // Plate weld markings & tack welds
      ctx.strokeStyle = "rgba(148, 163, 184, 0.15)";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 12]);
      ctx.strokeRect(12, 12, w - 24, h - 24);
      ctx.setLineDash([]);

      const path = seamPathRef.current;

      // 2. High-Visibility V-Groove Seam & Root Gap
      if (path.length > 1) {
        // Bevel Chamfer Shadow (Wide dark groove)
        ctx.beginPath();
        ctx.moveTo(path[0].x, path[0].y);
        for (let i = 1; i < path.length; i++) {
          ctx.lineTo(path[i].x, path[i].y);
        }
        ctx.strokeStyle = "#080c14";
        ctx.lineWidth = 28;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.stroke();

        // Bevel Face (Dark metallic steel groove)
        ctx.strokeStyle = "#2e3a4e";
        ctx.lineWidth = 14;
        ctx.stroke();

        // Root Gap (Narrow center joint gap)
        ctx.strokeStyle = "#020617";
        ctx.lineWidth = 4;
        ctx.stroke();

        // High-Tech Laser Seam Tracker Guide (Neon Cyan glowing dashed line)
        ctx.save();
        ctx.shadowColor = "#00e5ff";
        ctx.shadowBlur = 8;
        ctx.strokeStyle = "#00f0ff";
        ctx.lineWidth = 2.5;
        ctx.setLineDash([8, 6]);
        ctx.stroke();
        ctx.restore();

        // Start Node Flag (Green Glow)
        const startPt = path[0];
        ctx.save();
        ctx.shadowColor = "#10b981";
        ctx.shadowBlur = 10;
        ctx.fillStyle = "#10b981";
        ctx.beginPath();
        ctx.arc(startPt.x, startPt.y, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        ctx.fillStyle = "#a7f3d0";
        ctx.font = "bold 11px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("▶ 용접 시작", startPt.x, startPt.y - 14);

        // Finish Node Flag (Amber Glow)
        const endPt = path[path.length - 1];
        ctx.save();
        ctx.shadowColor = "#f59e0b";
        ctx.shadowBlur = 10;
        ctx.fillStyle = "#f59e0b";
        ctx.beginPath();
        ctx.arc(endPt.x, endPt.y, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        ctx.fillStyle = "#fde68a";
        ctx.font = "bold 11px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("🏁 용접 완료", endPt.x, endPt.y - 14);
      }

      // 3. Heat-Affected Zone (HAZ) & Molten Weld Bead Pool
      const beads = beadsRef.current;
      if (beads.length > 1) {
        // HAZ Tempering Color halo
        ctx.beginPath();
        ctx.moveTo(beads[0].x, beads[0].y);
        for (let i = 1; i < beads.length; i++) {
          ctx.lineTo(beads[i].x, beads[i].y);
        }
        ctx.strokeStyle = "rgba(99, 102, 241, 0.28)";
        ctx.lineWidth = 32;
        ctx.lineCap = "round";
        ctx.stroke();

        ctx.strokeStyle = "rgba(245, 158, 11, 0.35)";
        ctx.lineWidth = 22;
        ctx.stroke();

        // Overlapping Weld Ripples (FCAW Bead Fish-Scale Pattern)
        for (let i = 0; i < beads.length; i++) {
          const b = beads[i];
          const radius = b.width;
          const grad = ctx.createRadialGradient(b.x, b.y, 2, b.x, b.y, radius);
          if (b.quality > 0.75) {
            grad.addColorStop(0, "#fffbeb");
            grad.addColorStop(0.4, "#fbbf24");
            grad.addColorStop(0.8, "#b45309");
            grad.addColorStop(1, "#451a03");
          } else if (b.quality > 0.45) {
            grad.addColorStop(0, "#fef3c7");
            grad.addColorStop(0.5, "#d97706");
            grad.addColorStop(1, "#361602");
          } else {
            grad.addColorStop(0, "#cbd5e1");
            grad.addColorStop(0.6, "#64748b");
            grad.addColorStop(1, "#1e293b");
          }

          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(b.x, b.y, radius, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // 4. Target Node Pulse Indicator
      const curIdx = currentPathIdxRef.current;
      if (curIdx < path.length) {
        const target = path[curIdx];
        const pulse = Math.sin(time / 140) * 3;

        ctx.save();
        ctx.shadowColor = "#facc15";
        ctx.shadowBlur = 12;
        ctx.strokeStyle = "#facc15";
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(target.x, target.y, 16 + pulse, 0, Math.PI * 2);
        ctx.stroke();

        // Inner focal crosshair
        ctx.strokeStyle = "rgba(250, 204, 21, 0.8)";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(target.x - 7, target.y);
        ctx.lineTo(target.x + 7, target.y);
        ctx.moveTo(target.x, target.y - 7);
        ctx.lineTo(target.x, target.y + 7);
        ctx.stroke();
        ctx.restore();
      }

      // 5. Active Welding Arc Flash & Bead Deposition Logic
      const m = mousePosRef.current;
      if (isWeldingRef.current && curIdx < path.length) {
        // Robust multi-node collision check: inspect next 4 nodes so fast mouse movement never skips
        let matchedNodeIdx = -1;
        let matchedDist = 999;

        for (let step = 0; step < 5; step++) {
          const checkIdx = curIdx + step;
          if (checkIdx < path.length) {
            const pNode = path[checkIdx];
            const d = Math.hypot(m.x - pNode.x, m.y - pNode.y);
            if (d <= 48 && d < matchedDist) {
              matchedDist = d;
              matchedNodeIdx = checkIdx;
            }
          }
        }

        if (matchedNodeIdx !== -1) {
          // Calculate welding speed & deviation quality
          let speedQuality = 0.9;
          if (lastWeldedPosRef.current) {
            const moveDist = Math.hypot(m.x - lastWeldedPosRef.current.x, m.y - lastWeldedPosRef.current.y);
            const speed = moveDist / Math.max(dt, 0.001);
            if (speed > 480 || speed < 30) {
              speedQuality = 0.55;
            } else {
              speedQuality = Math.max(0.65, 1 - Math.abs(speed - 180) / 320);
            }

            // Interpolate beads between steps for a seamless, continuous weld bead
            if (moveDist > 6) {
              const steps = Math.min(Math.floor(moveDist / 5), 6);
              for (let s = 1; s <= steps; s++) {
                const interpX = lastWeldedPosRef.current.x + (m.x - lastWeldedPosRef.current.x) * (s / steps);
                const interpY = lastWeldedPosRef.current.y + (m.y - lastWeldedPosRef.current.y) * (s / steps);
                beadsRef.current.push({
                  x: interpX,
                  y: interpY,
                  quality: speedQuality,
                  width: 9 + (1 - speedQuality) * 4,
                });
              }
            }
          }

          const devQuality = Math.max(0.4, 1 - matchedDist / 48);
          const ptQuality = speedQuality * 0.5 + devQuality * 0.5;

          beadsRef.current.push({
            x: m.x,
            y: m.y,
            quality: ptQuality,
            width: 9 + (1 - speedQuality) * 4,
          });

          lastWeldedPosRef.current = { x: m.x, y: m.y };
          stageScoreRef.current += Math.round(ptQuality * 65);

          // Advance path index smoothly
          currentPathIdxRef.current = Math.max(currentPathIdxRef.current, matchedNodeIdx + 1);

          // Audio throttling
          if (time - lastSparkAudioTime > 80) {
            gameAudio.playWelding();
            lastSparkAudioTime = time;
          }

          // Sparks Generation
          for (let s = 0; s < 4; s++) {
            const angle = Math.random() * Math.PI * 2;
            const spd = 90 + Math.random() * 260;
            sparksRef.current.push({
              x: m.x,
              y: m.y,
              vx: Math.cos(angle) * spd,
              vy: Math.sin(angle) * spd - 45,
              alpha: 1,
              life: 0.22 + Math.random() * 0.28,
              color: Math.random() > 0.35 ? "#fffbeb" : "#f59e0b",
            });
          }

          // Brilliant Arc Discharge Glow
          ctx.save();
          const arcGrad = ctx.createRadialGradient(m.x, m.y, 2, m.x, m.y, 38);
          arcGrad.addColorStop(0, "rgba(255, 255, 255, 1)");
          arcGrad.addColorStop(0.25, "rgba(186, 230, 253, 0.85)");
          arcGrad.addColorStop(0.65, "rgba(56, 189, 248, 0.4)");
          arcGrad.addColorStop(1, "rgba(0, 0, 0, 0)");
          ctx.fillStyle = arcGrad;
          ctx.beginPath();
          ctx.arc(m.x, m.y, 38, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        } else {
          stagePenaltiesRef.current += 1;
        }

        // Check if finished entire weld seam
        if (currentPathIdxRef.current >= path.length) {
          isWeldingRef.current = false;
          handleStageFinish();
        }
      }

      // 6. Update and render sparks
      const sparks = sparksRef.current;
      for (let i = sparks.length - 1; i >= 0; i--) {
        const sp = sparks[i];
        sp.x += sp.vx * dt;
        sp.y += sp.vy * dt;
        sp.vy += 340 * dt;
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

      // 7. Industrial Welding Torch Nozzle & Reticle
      if (m.x > 0 && m.y > 0) {
        // Distance to target indicator ring
        const inWeldRange = curIdx < path.length && Math.hypot(m.x - path[curIdx].x, m.y - path[curIdx].y) <= 48;

        ctx.save();
        ctx.strokeStyle = isWeldingRef.current
          ? "#38bdf8"
          : inWeldRange
          ? "#10b981"
          : "rgba(255,255,255,0.45)";
        ctx.lineWidth = 1.5;

        // Crosshair
        ctx.beginPath();
        ctx.moveTo(m.x - 14, m.y);
        ctx.lineTo(m.x + 14, m.y);
        ctx.moveTo(m.x, m.y - 14);
        ctx.lineTo(m.x, m.y + 14);
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(m.x, m.y, inWeldRange ? 12 : 8, 0, Math.PI * 2);
        ctx.stroke();

        // Realistic Torch Ceramic Cup & Gas Nozzle Graphic
        ctx.fillStyle = "#334155";
        ctx.beginPath();
        ctx.moveTo(m.x + 8, m.y - 20);
        ctx.lineTo(m.x + 14, m.y - 42);
        ctx.lineTo(m.x + 22, m.y - 40);
        ctx.lineTo(m.x + 16, m.y - 18);
        ctx.closePath();
        ctx.fill();

        // Copper Tip
        ctx.fillStyle = "#b45309";
        ctx.beginPath();
        ctx.moveTo(m.x + 4, m.y - 10);
        ctx.lineTo(m.x + 8, m.y - 20);
        ctx.lineTo(m.x + 16, m.y - 18);
        ctx.lineTo(m.x + 8, m.y - 8);
        ctx.closePath();
        ctx.fill();

        ctx.restore();
      }

      ctx.restore(); // Restore DPR scale
      animationFrameRef.current = requestAnimationFrame(render);
    };

    animationFrameRef.current = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animationFrameRef.current);
  }, [isPlaying, stage]);

  const handleStageFinish = () => {
    gameAudio.playVictory();
    const finalScore = stageScoreRef.current + timeLeftRef.current * 40 - stagePenaltiesRef.current * 8;
    const calcScore = Math.max(400, finalScore);
    const newTotal = totalScore + calcScore;
    setTotalScore(newTotal);

    let grade = "A";
    if (stagePenaltiesRef.current < 6 && calcScore > 1700) grade = "S+";
    else if (stagePenaltiesRef.current < 15) grade = "S";
    else if (stagePenaltiesRef.current < 30) grade = "A";
    else grade = "B";

    setQualityGrade(grade);
    setStageComplete(true);

    if (stage >= 3) {
      setGameOver(true);
      onFinish(newTotal);
      confetti({
        particleCount: 90,
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
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Ignore if pointer capture fails
    }
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

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // Ignore
    }
    isWeldingRef.current = false;
  };

  return (
    <div className="relative w-full h-full flex flex-col bg-slate-950 font-hd select-none overflow-hidden text-white">
      {/* Top Header HUD */}
      <div className="flex items-center justify-between px-3 py-2 bg-slate-900/95 border-b border-slate-800 shrink-0 z-10 backdrop-blur-md">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-amber-500/20 text-amber-400 rounded-lg border border-amber-500/30">
            <Flame className="w-4 h-4" />
          </div>
          <div>
            <div className="text-xs font-black text-slate-100 flex items-center gap-1.5">
              용접 마스터: 선체 후판 비드 (FCAW)
              <span className="text-[10px] px-1.5 py-0.2 bg-amber-500/20 text-amber-300 rounded font-bold">
                STAGE {stage}/3
              </span>
            </div>
            <div className="text-[10px] text-slate-400 hidden sm:block">
              청색 V-그루브 레이저 가이드를 따라 정밀 비드를 시공하세요
            </div>
          </div>
        </div>

        {/* Live Gauges */}
        <div className="flex items-center gap-2 sm:gap-3 text-xs font-semibold">
          <div className="bg-slate-800/80 px-2 py-1 rounded-md border border-slate-700/60 text-center">
            <span className="text-slate-400 block text-[9px] font-medium leading-tight">가스 잔여</span>
            <span className={`text-xs font-bold tabular-nums ${timeLeft <= 8 ? "text-rose-400 animate-pulse" : "text-amber-400"}`}>
              {timeLeft}s
            </span>
          </div>

          <div className="bg-slate-800/80 px-2 py-1 rounded-md border border-slate-700/60 text-center">
            <span className="text-slate-400 block text-[9px] font-medium leading-tight">진행도</span>
            <span className="text-xs font-bold text-cyan-400 tabular-nums">
              {seamPathRef.current.length > 0 ? Math.round((currentPathIdxRef.current / seamPathRef.current.length) * 100) : 0}%
            </span>
          </div>

          <div className="flex items-center gap-1.5 bg-amber-950/80 px-2.5 py-1 rounded-md border border-amber-700">
            <Award className="w-3.5 h-3.5 text-amber-400" />
            <span className="text-xs sm:text-sm font-black text-amber-300 tabular-nums">
              {totalScore.toLocaleString()}점
            </span>
          </div>

          <button
            onClick={toggleSound}
            className="p-1 text-slate-400 hover:text-white transition-colors"
            title={isMuted ? "소리 켜기" : "음소거"}
          >
            {isMuted ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4 text-emerald-400" />}
          </button>
        </div>
      </div>

      {/* Main Canvas Viewport - 100% flex height, fits container completely */}
      <div ref={containerRef} className="relative flex-1 w-full min-h-0 overflow-hidden bg-slate-950">
        <canvas
          ref={canvasRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
          className="absolute inset-0 block w-full h-full cursor-crosshair touch-none"
        />

        {/* Start Overlay */}
        {!isPlaying && (
          <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm flex flex-col items-center justify-center p-4 text-center z-20 animate-in fade-in duration-200">
            <div className="w-12 h-12 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center mb-2.5 text-amber-400 shadow-md">
              <Flame className="w-6 h-6" />
            </div>
            <h2 className="text-sm sm:text-base font-bold text-white mb-1">선체 특수강 V-그루브 용접 마스터</h2>
            <p className="text-slate-300 text-xs max-w-sm mb-4 leading-relaxed font-normal">
              화면의 <strong>청색 레이저 가이드 선</strong>을 따라 마우스를 누른 채<br />
              일정한 속도로 이동하여 <strong>선급 기준(KR/DNV) 최고 등급</strong>의 비드를 용접하세요.
            </p>
            <button
              onClick={startGame}
              className="px-6 py-2 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-slate-950 font-bold text-xs sm:text-sm rounded-xl shadow-md active:scale-95 transition-all flex items-center gap-2 cursor-pointer"
            >
              <Play className="w-4 h-4 fill-slate-950" />
              아크 용접 시작
            </button>
          </div>
        )}

        {/* Stage Complete Banner */}
        {isPlaying && stageComplete && !gameOver && (
          <div className="absolute inset-0 bg-slate-950/85 backdrop-blur-md flex flex-col items-center justify-center p-4 z-20 animate-in fade-in zoom-in-95 duration-200">
            <div className="w-12 h-12 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center mb-2 text-emerald-400">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <span className="text-[10px] font-bold text-emerald-400 tracking-widest uppercase mb-1">STAGE PASSED</span>
            <h3 className="text-sm sm:text-base font-bold text-white mb-1">
              STAGE {stage} 비파괴 비드 검사 합격!
            </h3>
            <div className="flex items-center gap-3 my-2.5">
              <div className="bg-slate-900 border border-slate-800 px-3.5 py-1.5 rounded-xl text-center">
                <span className="text-[9px] text-slate-400 block">용접 품질 등급</span>
                <span className="text-lg font-bold text-amber-400">{qualityGrade}</span>
              </div>
              <div className="bg-slate-900 border border-slate-800 px-3.5 py-1.5 rounded-xl text-center">
                <span className="text-[9px] text-slate-400 block">누적 공정 점수</span>
                <span className="text-lg font-bold text-emerald-400 tabular-nums">{totalScore.toLocaleString()}점</span>
              </div>
            </div>
            <button
              onClick={() => startStage(stage + 1)}
              className="px-5 py-2 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-slate-950 font-bold text-xs sm:text-sm rounded-xl shadow-md active:scale-95 transition-all cursor-pointer"
            >
              다음 스테이지 ({stage + 1}/3) 진행 →
            </button>
          </div>
        )}

        {/* Game Over Banner */}
        {gameOver && (
          <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-md flex flex-col items-center justify-center p-4 z-20 animate-in fade-in zoom-in-95 duration-200">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-2 ${stageComplete ? "bg-amber-500/20 text-amber-400" : "bg-rose-500/20 text-rose-400"}`}>
              {stageComplete ? <Award className="w-6 h-6" /> : <AlertTriangle className="w-6 h-6" />}
            </div>
            <h3 className="text-sm sm:text-base font-bold text-white mb-1">
              {stageComplete ? "명품 선박 용접 공정 완수!" : "용접 보호가스 소진 / 공정 중단"}
            </h3>
            <p className="text-slate-300 text-xs mb-2.5 max-w-sm font-normal">
              {stageComplete ? "선급협회(KR/DNV) 규격을 만족하는 최고 품질 비드를 달성했습니다." : "제한시간 내에 비드를 완성하지 못했습니다."}
            </p>
            <div className="bg-slate-900 border border-slate-800 px-4 py-2 rounded-xl text-center mb-3 min-w-[160px]">
              <span className="text-[9px] text-slate-400 block">최종 용접 점수</span>
              <span className="text-xl font-bold text-amber-400 tabular-nums">{totalScore.toLocaleString()}점</span>
            </div>
            <button
              onClick={startGame}
              className="px-5 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white font-bold text-xs sm:text-sm rounded-xl active:scale-95 transition-all flex items-center gap-2 cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
              다시 도전하기
            </button>
          </div>
        )}
      </div>

      {/* Bottom Specs Info */}
      <div className="px-3 py-1.5 bg-slate-900/95 border-t border-slate-800 shrink-0 flex items-center justify-between text-[11px] text-slate-400">
        <div className="flex items-center gap-1.5">
          <Zap className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          <span>마우스 버튼을 누른 채 청색 가이드 라인을 따라 전진하면 아크가 점화되고 비드가 생성됩니다.</span>
        </div>
        <span className="text-slate-500 hidden sm:inline font-mono">EH36 FCAW</span>
      </div>
    </div>
  );
}
