import React, { useState, useEffect, useRef } from "react";
import { Play, RotateCcw, Volume2, VolumeX, Flame, Award, AlertTriangle, ShieldCheck, CheckCircle2, ChevronRight, Info } from "lucide-react";
import confetti from "canvas-confetti";
import { gameAudio } from "../../lib/gameSounds";
import { getGameCanvasFont } from "../../lib/gameFonts";

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

interface BeadRipple {
  x: number;
  y: number;
  width: number;
  quality: number; // 0 to 1
  createdAt: number;
}

interface PositionDef {
  id: string;
  code: string;
  title: string;
  blockName: string;
  orientation: "horizontal" | "vertical"; // horizontal seam or vertical-up
  jointType: string;
  technique: string;
  guideDesc: string;
  targetWeaveWidth: number; // px
  targetPauseSec: number; // side pause required
  timeLimit: number;
}

const POSITIONS: PositionDef[] = [
  {
    id: "1g",
    code: "1G 아래보기",
    title: "선체 외판 V-그루브 맞대기",
    blockName: "외판 블록 이음부 (Shell Butt Joint)",
    orientation: "horizontal",
    jointType: "60° V-Groove (루트 4mm / 백킹재)",
    technique: "지그재그(Zigzag) 대칭 균등 위빙",
    guideDesc: "양쪽 베벨 벽을 고르게 오가며 일정한 리듬으로 전진하세요. 균일한 루트 용입과 매끄러운 캡 비드를 형성합니다.",
    targetWeaveWidth: 32,
    targetPauseSec: 0.15,
    timeLimit: 32,
  },
  {
    id: "2g",
    code: "2G 수평 그루브",
    title: "종격벽 사이드 셸 수평 조인트",
    blockName: "종격벽 블록 (Longitudinal Bulkhead)",
    orientation: "horizontal",
    jointType: "비대칭 베벨 (상단 45° / 하단 15°)",
    technique: "상단 베벨 일시 멈춤(Upper Pause) 위빙",
    guideDesc: "중력으로 쇳물이 아래로 처집니다! 상단 베벨에서 0.25초 멈춰 쇳물을 굳히고, 아랫단은 빠르게 지나가 언더컷을 막으세요.",
    targetWeaveWidth: 28,
    targetPauseSec: 0.25,
    timeLimit: 30,
  },
  {
    id: "3g",
    code: "3G 수직 상진",
    title: "선체 늑골 트랜스버스 웨브 프레임",
    blockName: "웨브 프레임 수직 조인트 (Web Frame Vertical)",
    orientation: "vertical",
    jointType: "50° V-Groove 수직 맞대기",
    technique: "삼각(Triangle) 위빙 & 양단 정지(Side Pause)",
    guideDesc: "아래에서 위로 상진합니다! 양쪽 베벨 모재에서 0.3초 멈춰(Pause) 용착시키고, 중앙부는 쇳물 뭉침 방지를 위해 빠르게 지나가세요.",
    targetWeaveWidth: 34,
    targetPauseSec: 0.3,
    timeLimit: 32,
  },
  {
    id: "4g",
    code: "4G 오버헤드",
    title: "이중저 바닥판 하면 & 데크 천장",
    blockName: "상갑판 데크 하면 (Under-Deck Overhead)",
    orientation: "horizontal",
    jointType: "60° V-Groove 백킹 세라믹",
    technique: "초단 아크 미세 채찍(Narrow Whip) 위빙",
    guideDesc: "쇳물이 머리 위로 떨어지는 최고 난이도! 좁은 위빙 폭으로 빠르게 운봉하며 짧은 아크를 유지해 즉시 냉각 응고시키세요.",
    targetWeaveWidth: 22,
    targetPauseSec: 0.1,
    timeLimit: 28,
  },
];

export default function WeldingMasterGame({ onFinish }: WeldingMasterGameProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [activeStageIdx, setActiveStageIdx] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [stageComplete, setStageComplete] = useState(false);
  const [totalScore, setTotalScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(30);
  const [isMuted, setIsMuted] = useState(gameAudio.getMuted());
  const [lastRating, setLastRating] = useState<string>("");
  const [qualityGrade, setQualityGrade] = useState("S+");

  // Real-time HUD gauges
  const [progressPct, setProgressPct] = useState(0);
  const [grooveFillRate, setGrooveFillRate] = useState(0);
  const [underfillWarning, setUnderfillWarning] = useState(false);
  const [weaveWidthStatus, setWeaveWidthStatus] = useState<"적정" | "협소" | "과다">("적정");
  const [pauseStatus, setPauseStatus] = useState<"양호" | "미달" | "과열">("양호");

  const posDef = POSITIONS[activeStageIdx];

  // Game state refs
  const stateRef = useRef({
    isPlaying: false,
    score: 0,
    progress: 0, // 0 to 1 along the seam
    fillRate: 0, // 0 to 100%
    fillSlices: Array.from({ length: 35 }, () => ({ left: false, center: false, right: false })),
    torchX: -100,
    torchY: -100,
    isWelding: false,
    lastTorchPos: { x: -100, y: -100 },
    lastTorchTime: 0,
    sidePauseTimer: 0,
    currentSide: "center" as "left" | "right" | "top" | "bottom" | "center",
    weavesCount: 0,
    perfectPauses: 0,
    undercutCount: 0,
    lackOfFusionCount: 0,
    beads: [] as BeadRipple[],
    sparks: [] as Spark[],
    w: 800,
    h: 460,
    grooveStartX: 80,
    grooveEndX: 720,
    grooveStartY: 80,
    grooveEndY: 380,
    grooveCenterY: 230,
    grooveCenterX: 400,
  });

  const toggleSound = (e: React.MouseEvent) => {
    e.stopPropagation();
    const muted = gameAudio.toggleMute();
    setIsMuted(muted);
  };

  const startPosition = (idx: number) => {
    setActiveStageIdx(idx);
    const p = POSITIONS[idx];
    setTimeLeft(p.timeLimit);
    setProgressPct(0);
    setGrooveFillRate(0);
    setUnderfillWarning(false);
    setStageComplete(false);
    setGameOver(false);
    setLastRating("");

    const s = stateRef.current;
    s.score = 0;
    s.progress = 0;
    s.fillRate = 0;
    s.fillSlices = Array.from({ length: 35 }, () => ({ left: false, center: false, right: false }));
    s.lastTorchPos = { x: -100, y: -100 };
    s.beads = [];
    s.sparks = [];
    s.weavesCount = 0;
    s.perfectPauses = 0;
    s.undercutCount = 0;
    s.lackOfFusionCount = 0;
    s.sidePauseTimer = 0;
    s.currentSide = "center";
    s.isWelding = false;
    s.isPlaying = true;

    setIsPlaying(true);
    gameAudio.playStart();
  };

  // Timer Countdown
  useEffect(() => {
    if (!isPlaying || stageComplete || gameOver) return;
    const t = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(t);
          handleTimeOut();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [isPlaying, stageComplete, gameOver]);

  const handleTimeOut = () => {
    const s = stateRef.current;
    s.isPlaying = false;
    setIsPlaying(false);
    setGameOver(true);
    gameAudio.playFailure();
    onFinish(totalScore + s.score);
  };

  const handleStageWin = () => {
    const s = stateRef.current;
    s.isPlaying = false;
    setIsPlaying(false);
    setStageComplete(true);

    const bonusTime = timeLeft * 45;
    const bonusQuality = Math.max(0, 1500 - s.undercutCount * 80 - s.lackOfFusionCount * 100);
    const stageFinalScore = s.score + bonusTime + bonusQuality;
    const newTotal = totalScore + stageFinalScore;
    setTotalScore(newTotal);

    let grade = "S+";
    if (s.undercutCount > 3 || s.lackOfFusionCount > 3) grade = "B";
    else if (s.undercutCount > 1 || s.lackOfFusionCount > 1) grade = "A";
    else if (s.perfectPauses >= 6) grade = "S+";
    else grade = "S";

    setQualityGrade(grade);
    gameAudio.playVictory();

    if (activeStageIdx >= POSITIONS.length - 1) {
      setGameOver(true);
      confetti({ particleCount: 90, spread: 80, origin: { y: 0.6 } });
      onFinish(newTotal);
    }
  };

  // ResizeObserver & HiDPI Canvas
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const resize = () => {
      const rect = container.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.max(340, Math.floor(rect.width));
      const h = Math.max(260, Math.floor(rect.height));

      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;

      const s = stateRef.current;
      s.w = w;
      s.h = h;
      s.grooveStartX = Math.floor(w * 0.1);
      s.grooveEndX = Math.floor(w * 0.9);
      s.grooveStartY = Math.floor(h * 0.88); // 3G vertical-up starts at bottom
      s.grooveEndY = Math.floor(h * 0.12); // ends at top
      s.grooveCenterY = Math.floor(h * 0.5);
      s.grooveCenterX = Math.floor(w * 0.5);
    };

    const ro = new ResizeObserver(() => resize());
    ro.observe(container);
    resize();

    return () => ro.disconnect();
  }, [activeStageIdx]);

  // Main Canvas Render & Arc Simulation Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId = 0;
    let lastTime = performance.now();
    let lastAudioTime = 0;

    const render = (now: number) => {
      const dt = Math.min((now - lastTime) / 1000, 0.05);
      lastTime = now;

      const s = stateRef.current;
      const w = s.w;
      const h = s.h;
      const isVert = posDef.orientation === "vertical";

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      ctx.save();
      ctx.scale(dpr, dpr);

      // ---------------- RENDER STEEL PLATES & BEVEL GROOVE ----------------
      // Dark Industrial Shipyard EH36 Steel Plates
      ctx.fillStyle = "#1e293b"; // Dark steel
      ctx.fillRect(0, 0, w, h);

      // Plate mill rolling grain & blast-cleaned texture
      ctx.strokeStyle = "rgba(71, 85, 105, 0.25)";
      ctx.lineWidth = 1;
      for (let y = 0; y < h; y += 22) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }

      // Groove Dimensions
      const grooveHalfWidth = Math.floor(posDef.targetWeaveWidth * 0.9);

      if (!isVert) {
        // HORIZONTAL GROOVE (1G, 2G, 4G)
        const gy = s.grooveCenterY;
        const gLeft = s.grooveStartX;
        const gRight = s.grooveEndX;

        // Top Plate (선체 상부 후판)
        const topGrad = ctx.createLinearGradient(0, gy - 80, 0, gy - grooveHalfWidth);
        topGrad.addColorStop(0, "#334155");
        topGrad.addColorStop(1, "#1e293b");
        ctx.fillStyle = topGrad;
        ctx.fillRect(0, 0, w, gy - grooveHalfWidth);

        // Bottom Plate (선체 하부 후판)
        const botGrad = ctx.createLinearGradient(0, gy + grooveHalfWidth, 0, gy + 80);
        botGrad.addColorStop(0, "#1e293b");
        botGrad.addColorStop(1, "#334155");
        ctx.fillStyle = botGrad;
        ctx.fillRect(0, gy + grooveHalfWidth, w, h - (gy + grooveHalfWidth));

        // Bevel Chamfer Slopes (60° V-Groove Bevel)
        // Upper Bevel Chamfer
        ctx.fillStyle = "#0f172a";
        ctx.fillRect(gLeft - 20, gy - grooveHalfWidth, (gRight - gLeft) + 40, grooveHalfWidth);
        // Lower Bevel Chamfer
        ctx.fillStyle = "#090d16";
        ctx.fillRect(gLeft - 20, gy, (gRight - gLeft) + 40, grooveHalfWidth);

        // Ceramic Backing Strip / Root Gap (루트 간격 4mm & 백킹재)
        ctx.fillStyle = "#e2e8f0"; // Ceramic white backing strip
        ctx.fillRect(gLeft - 20, gy - 3, (gRight - gLeft) + 40, 6);
        ctx.fillStyle = "#020617"; // Root gap opening
        ctx.fillRect(gLeft - 20, gy - 1.5, (gRight - gLeft) + 40, 3);

        // Groove Boundaries (Bevel Toes)
        ctx.strokeStyle = "#475569";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(gLeft - 20, gy - grooveHalfWidth);
        ctx.lineTo(gRight + 20, gy - grooveHalfWidth);
        ctx.moveTo(gLeft - 20, gy + grooveHalfWidth);
        ctx.lineTo(gRight + 20, gy + grooveHalfWidth);
        ctx.stroke();

        // 2G Horizontal Asymmetry Guide Notice
        if (posDef.id === "2g") {
          ctx.fillStyle = "#f59e0b";
          ctx.font = getGameCanvasFont(10, "bold");
          ctx.textAlign = "left";
          ctx.fillText("▲ 상단 베벨 (0.25초 정지: 언더컷 방지)", gLeft, gy - grooveHalfWidth - 8);
          ctx.fillStyle = "#94a3b8";
          ctx.fillText("▼ 하단 베벨 (빠른 통과: 쇳물 처짐 방지)", gLeft, gy + grooveHalfWidth + 16);
        }

        // Weaving Ghost Guide Track
        ctx.strokeStyle = "rgba(56, 189, 248, 0.25)";
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        for (let x = gLeft; x <= gRight; x += 16) {
          const wavePhase = (x - gLeft) / 24;
          const wy = gy + Math.sin(wavePhase * Math.PI) * (grooveHalfWidth - 3);
          if (x === gLeft) ctx.moveTo(x, wy);
          else ctx.lineTo(x, wy);
        }
        ctx.stroke();
        ctx.setLineDash([]);
      } else {
        // VERTICAL GROOVE (3G 수직 상진)
        const gx = s.grooveCenterX;
        const gBottom = s.grooveStartY; // Start at bottom
        const gTop = s.grooveEndY; // End at top

        // Left Plate
        ctx.fillStyle = "#334155";
        ctx.fillRect(0, 0, gx - grooveHalfWidth, h);
        // Right Plate
        ctx.fillStyle = "#334155";
        ctx.fillRect(gx + grooveHalfWidth, 0, w - (gx + grooveHalfWidth), h);

        // Bevel Chamfer (V-groove center)
        ctx.fillStyle = "#0f172a";
        ctx.fillRect(gx - grooveHalfWidth, gTop - 20, grooveHalfWidth * 2, (gBottom - gTop) + 40);

        // Ceramic Backing Strip
        ctx.fillStyle = "#e2e8f0";
        ctx.fillRect(gx - 3, gTop - 20, 6, (gBottom - gTop) + 40);
        ctx.fillStyle = "#020617";
        ctx.fillRect(gx - 1.5, gTop - 20, 3, (gBottom - gTop) + 40);

        // Bevel Toe Lines
        ctx.strokeStyle = "#475569";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(gx - grooveHalfWidth, gTop - 20);
        ctx.lineTo(gx - grooveHalfWidth, gBottom + 20);
        ctx.moveTo(gx + grooveHalfWidth, gTop - 20);
        ctx.lineTo(gx + grooveHalfWidth, gBottom + 20);
        ctx.stroke();

        // 3G Triangle Weave Guide Overlay
        ctx.strokeStyle = "rgba(56, 189, 248, 0.28)";
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        for (let y = gBottom; y >= gTop; y -= 16) {
          const wavePhase = (gBottom - y) / 24;
          const wx = gx + Math.sin(wavePhase * Math.PI) * (grooveHalfWidth - 3);
          if (y === gBottom) ctx.moveTo(wx, y);
          else ctx.lineTo(wx, y);
        }
        ctx.stroke();
        ctx.setLineDash([]);

        // Side Pause Labels
        ctx.fillStyle = "#f59e0b";
        ctx.font = getGameCanvasFont(9, "bold");
        ctx.textAlign = "right";
        ctx.fillText("좌측 0.3s 정지 ◀", gx - grooveHalfWidth - 6, gBottom - 30);
        ctx.textAlign = "left";
        ctx.fillText("▶ 우측 0.3s 정지", gx + grooveHalfWidth + 6, gBottom - 30);
      }

      // ---------------- RENDER SOLIDIFIED WELD BEADS ----------------
      s.beads.forEach((b) => {
        const grad = ctx.createRadialGradient(b.x, b.y, 2, b.x, b.y, b.width);
        if (b.quality > 0.8) {
          grad.addColorStop(0, "#fffbeb");
          grad.addColorStop(0.3, "#fde68a");
          grad.addColorStop(0.7, "#d97706");
          grad.addColorStop(1, "#361602");
        } else if (b.quality > 0.5) {
          grad.addColorStop(0, "#fef3c7");
          grad.addColorStop(0.4, "#f59e0b");
          grad.addColorStop(0.8, "#b45309");
          grad.addColorStop(1, "#1e293b");
        } else {
          grad.addColorStop(0, "#94a3b8");
          grad.addColorStop(0.5, "#475569");
          grad.addColorStop(1, "#0f172a");
        }

        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.width, 0, Math.PI * 2);
        ctx.fill();

        // Ripple metallic rim
        ctx.strokeStyle = "rgba(255, 255, 255, 0.18)";
        ctx.lineWidth = 1;
        ctx.stroke();
      });

      // ---------------- WEAVING KINEMATICS & POOL INTERACTION ----------------
      if (s.isWelding && s.isPlaying) {
        const tx = s.torchX;
        const ty = s.torchY;

        // Sound throttle
        if (now - lastAudioTime > 90) {
          gameAudio.playWelding();
          lastAudioTime = now;
        }

        // Distance from groove center line
        let distFromCenter = 0;
        let progressAlongSeam = 0;

        if (!isVert) {
          distFromCenter = Math.abs(ty - s.grooveCenterY);
          const seamLen = s.grooveEndX - s.grooveStartX;
          progressAlongSeam = Math.max(0, Math.min(1, (tx - s.grooveStartX) / seamLen));
        } else {
          distFromCenter = Math.abs(tx - s.grooveCenterX);
          const seamLen = s.grooveStartY - s.grooveEndY; // going up
          progressAlongSeam = Math.max(0, Math.min(1, (s.grooveStartY - ty) / seamLen));
        }

        // Update progress
        if (progressAlongSeam > s.progress) {
          s.progress = progressAlongSeam;
          setProgressPct(Math.round(s.progress * 100));
        }

        // Track Groove Fill Volume across 35 longitudinal slices & 3 lateral zones
        const sliceIdx = Math.max(0, Math.min(34, Math.floor(progressAlongSeam * 35)));
        const curSlice = s.fillSlices[sliceIdx];
        if (curSlice) {
          const lateralOffset = !isVert ? (ty - s.grooveCenterY) : (tx - s.grooveCenterX);
          if (Math.abs(lateralOffset) < grooveHalfWidth * 0.35) {
            curSlice.center = true;
          }
          if (lateralOffset < -grooveHalfWidth * 0.35) {
            curSlice.left = true;
          }
          if (lateralOffset > grooveHalfWidth * 0.35) {
            curSlice.right = true;
          }
        }

        // Recalculate overall groove fill rate (%)
        let filledPoints = 0;
        for (let i = 0; i < 35; i++) {
          const sl = s.fillSlices[i];
          if (sl.left) filledPoints += 0.35;
          if (sl.center) filledPoints += 0.30;
          if (sl.right) filledPoints += 0.35;
        }
        const currentFillRate = Math.min(100, Math.round((filledPoints / 35) * 100));
        s.fillRate = currentFillRate;
        setGrooveFillRate(currentFillRate);

        // Evaluate Weave Width
        const weaveRatio = distFromCenter / grooveHalfWidth;
        let currentWeaveRating = "적정";
        if (weaveRatio > 1.15) {
          currentWeaveRating = "과다";
          s.undercutCount++;
        } else if (weaveRatio < 0.35) {
          currentWeaveRating = "협소";
          s.lackOfFusionCount++;
        }
        setWeaveWidthStatus(currentWeaveRating as any);

        // Side Pause Detection
        const isAtEdge = weaveRatio >= 0.75;
        if (isAtEdge) {
          s.sidePauseTimer += dt;
          if (s.sidePauseTimer >= posDef.targetPauseSec && s.sidePauseTimer <= posDef.targetPauseSec + 0.35) {
            setPauseStatus("양호");
            setLastRating("★ PERFECT TOE FUSION (언더컷 제로)");
            s.perfectPauses++;
            s.score += 85;
          } else if (s.sidePauseTimer > posDef.targetPauseSec + 0.4) {
            setPauseStatus("과열");
            setLastRating("과열 경고: 쇳물 처짐/용락");
            s.score += 20;
          } else {
            setPauseStatus("미달");
          }
        } else {
          s.sidePauseTimer = 0;
          setPauseStatus("양호");
        }

        // Deposit Substantial Molten Pool Ripples (Heavy Shipyard Bead Diameter 36~46px)
        const rippleQuality = currentWeaveRating === "적정" ? 0.95 : 0.6;
        const baseRadius = Math.max(17, Math.floor(grooveHalfWidth * 0.65)) + (Math.random() - 0.5) * 2;

        // Interpolate beads between torch steps to prevent gaps
        if (s.lastTorchPos.x > 0 && s.lastTorchPos.y > 0) {
          const moveDist = Math.hypot(tx - s.lastTorchPos.x, ty - s.lastTorchPos.y);
          if (moveDist > 6 && moveDist < 70) {
            const steps = Math.min(Math.floor(moveDist / 6), 5);
            for (let st = 1; st <= steps; st++) {
              const interpX = s.lastTorchPos.x + (tx - s.lastTorchPos.x) * (st / steps);
              const interpY = s.lastTorchPos.y + (ty - s.lastTorchPos.y) * (st / steps);
              s.beads.push({
                x: interpX,
                y: interpY,
                width: baseRadius - 1 + Math.random() * 2,
                quality: rippleQuality,
                createdAt: now,
              });
            }
          }
        }

        s.beads.push({
          x: tx,
          y: ty,
          width: baseRadius,
          quality: rippleQuality,
          createdAt: now,
        });
        s.lastTorchPos = { x: tx, y: ty };
        s.score += Math.round(dt * 320);

        // STRICT WIN CONDITION: Must reach the end (>= 92%) AND groove fill rate must be at least 75%!
        if (s.progress >= 0.92) {
          if (s.fillRate >= 75) {
            setUnderfillWarning(false);
            handleStageWin();
          } else {
            setUnderfillWarning(true);
            setLastRating(`⚠️ 비드 충진량 미달 (${s.fillRate}% / 75%): 좌우 베벨을 위빙하여 채우세요!`);
          }
        }

        // Generate Sparks
        const sparkCount = 3 + Math.floor(Math.random() * 3);
        for (let sp = 0; sp < sparkCount; sp++) {
          const spAngle = Math.random() * Math.PI * 2;
          const spSpeed = 80 + Math.random() * 220;
          s.sparks.push({
            x: tx,
            y: ty,
            vx: Math.cos(spAngle) * spSpeed,
            vy: Math.sin(spAngle) * spSpeed,
            alpha: 1,
            life: 0.45 + Math.random() * 0.35,
            color: Math.random() > 0.4 ? "#fef08a" : "#f97316",
          });
        }

        // Render Active Molten Puddle (용융지) & Electric Arc
        const arcGrad = ctx.createRadialGradient(tx, ty, 3, tx, ty, 28);
        arcGrad.addColorStop(0, "rgba(255, 255, 255, 1)");
        arcGrad.addColorStop(0.2, "rgba(103, 232, 249, 0.95)");
        arcGrad.addColorStop(0.5, "rgba(245, 158, 11, 0.6)");
        arcGrad.addColorStop(1, "rgba(220, 38, 38, 0)");

        ctx.fillStyle = arcGrad;
        ctx.beginPath();
        ctx.arc(tx, ty, 30, 0, Math.PI * 2);
        ctx.fill();

        // Intense Arc Core
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(tx, ty, 6, 0, Math.PI * 2);
        ctx.fill();
      }

      // ---------------- RENDER SPARKS ----------------
      for (let i = s.sparks.length - 1; i >= 0; i--) {
        const p = s.sparks[i];
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.life -= dt * 1.8;
        if (p.life <= 0) {
          s.sparks.splice(i, 1);
        } else {
          ctx.fillStyle = p.color;
          ctx.globalAlpha = Math.max(0, p.life);
          ctx.beginPath();
          ctx.arc(p.x, p.y, 2, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = 1;
        }
      }

      ctx.restore();
      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, [posDef, activeStageIdx]);

  // Pointer Handlers for Torch Drag
  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isPlaying || stageComplete || gameOver) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {}

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const s = stateRef.current;
    s.torchX = x;
    s.torchY = y;
    s.isWelding = true;
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const s = stateRef.current;
    s.torchX = e.clientX - rect.left;
    s.torchY = e.clientY - rect.top;
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {}
    stateRef.current.isWelding = false;
  };

  return (
    <div className="relative w-full h-full flex flex-col bg-slate-950 font-hd select-none overflow-hidden text-white">
      {/* Top Header HUD */}
      <div className="flex items-center justify-between px-3 py-2 bg-slate-900 border-b border-slate-800 shrink-0 z-10">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-amber-500/20 text-amber-400 rounded-lg border border-amber-500/30">
            <Flame className="w-4 h-4" />
          </div>
          <div>
            <div className="text-xs sm:text-sm font-black text-slate-100 flex items-center gap-1.5">
              조선소 블록 그루브 & 위빙 마스터
              <span className="text-[10px] px-2 py-0.5 bg-amber-500/20 text-amber-300 rounded-full font-bold border border-amber-500/30">
                {posDef.code}
              </span>
            </div>
            <div className="text-[11px] text-slate-400 hidden sm:block">
              {posDef.title} ({posDef.technique})
            </div>
          </div>
        </div>

        {/* Live Gauges */}
        <div className="flex items-center gap-2 text-xs font-semibold">
          <div className="bg-slate-800/90 px-2 py-1 rounded-lg border border-slate-700/60 text-center">
            <span className="text-slate-400 block text-[9px] font-medium leading-tight">가스 잔여</span>
            <span className={`text-xs font-bold tabular-nums ${timeLeft <= 6 ? "text-rose-400 animate-pulse" : "text-amber-400"}`}>
              {timeLeft}s
            </span>
          </div>

          <div className="bg-slate-800/90 px-2 py-1 rounded-lg border border-slate-700/60 text-center">
            <span className="text-slate-400 block text-[9px] font-medium leading-tight">그루브 충진</span>
            <span className={`text-xs font-bold tabular-nums ${grooveFillRate >= 75 ? "text-emerald-400" : "text-amber-400"}`}>
              {grooveFillRate}% <span className="text-[9px] text-slate-500 font-normal">/ 75%</span>
            </span>
          </div>

          <div className="bg-slate-800/90 px-2 py-1 rounded-lg border border-slate-700/60 text-center">
            <span className="text-slate-400 block text-[9px] font-medium leading-tight">용접 진행도</span>
            <span className="text-xs font-bold text-cyan-400 tabular-nums">
              {progressPct}%
            </span>
          </div>

          <div className="bg-slate-800/90 px-2 py-1 rounded-lg border border-slate-700/60 text-center">
            <span className="text-slate-400 block text-[9px] font-medium leading-tight">위빙 폭</span>
            <span className={`text-xs font-bold ${weaveWidthStatus === "적정" ? "text-emerald-400" : "text-rose-400"}`}>
              {weaveWidthStatus}
            </span>
          </div>

          <div className="flex items-center gap-1.5 bg-amber-950/80 px-2.5 py-1 rounded-lg border border-amber-700">
            <Award className="w-3.5 h-3.5 text-amber-400" />
            <span className="text-xs sm:text-sm font-black text-amber-300 tabular-nums">
              {(totalScore + stateRef.current.score).toLocaleString()}점
            </span>
          </div>

          <button
            onClick={toggleSound}
            className="p-1.5 bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-300 transition-colors"
            title={isMuted ? "소리 켜기" : "음소거"}
          >
            {isMuted ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4 text-emerald-400" />}
          </button>
        </div>
      </div>

      {/* Position Quick Selection Bar */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-slate-900/90 border-b border-slate-800 shrink-0 gap-1 overflow-x-auto no-scrollbar">
        <div className="flex items-center gap-1.5">
          {POSITIONS.map((p, idx) => (
            <button
              key={p.id}
              onClick={() => startPosition(idx)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-black transition-all flex items-center gap-1 cursor-pointer ${
                activeStageIdx === idx
                  ? "bg-amber-500 text-slate-950 shadow-sm"
                  : "bg-slate-800 text-slate-300 hover:bg-slate-700"
              }`}
            >
              <span>{p.code}</span>
              <span className="text-[9px] opacity-80 hidden md:inline">({p.id.toUpperCase()})</span>
            </button>
          ))}
        </div>

        <div className="text-[11px] text-amber-300/90 hidden lg:flex items-center gap-1 truncate font-medium">
          <Info className="w-3 h-3 text-amber-400 shrink-0" />
          <span>{posDef.guideDesc}</span>
        </div>
      </div>

      {/* Main Canvas Viewport */}
      <div ref={containerRef} className="relative flex-1 w-full min-h-0 overflow-hidden bg-slate-950">
        <canvas
          ref={canvasRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
          className="absolute inset-0 block w-full h-full cursor-crosshair touch-none"
        />

        {/* Real-time Hit Rating Feedback Badge */}
        {lastRating && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 pointer-events-none z-20 animate-in zoom-in-75 fade-in duration-150">
            <div className={`px-3 py-1 rounded-full text-xs font-black shadow-lg border ${
              underfillWarning
                ? "bg-rose-950/90 text-rose-300 border-rose-500 animate-pulse"
                : "bg-amber-500/20 text-amber-300 border-amber-400"
            }`}>
              {lastRating}
            </div>
          </div>
        )}

        {/* Underfill Warning Floating Banner */}
        {underfillWarning && (
          <div className="absolute top-11 left-1/2 -translate-x-1/2 z-20 pointer-events-none animate-in fade-in zoom-in-95">
            <div className="px-3 py-1.5 rounded-xl text-xs font-black shadow-lg border bg-rose-950/95 text-rose-200 border-rose-500 flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>그루브 비드 충진량 부족 ({grooveFillRate}% / 75%): 단순히 지나가지 말고 좌우 베벨을 위빙하세요!</span>
            </div>
          </div>
        )}

        {/* START OVERLAY */}
        {!isPlaying && !stageComplete && !gameOver && (
          <div className="absolute inset-0 bg-slate-950/85 backdrop-blur-sm flex flex-col items-center justify-center p-4 text-center z-20 animate-in fade-in duration-200">
            <div className="w-12 h-12 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center mb-2 text-amber-400 shadow-md">
              <Flame className="w-6 h-6" />
            </div>
            <h2 className="text-base sm:text-lg font-black text-white mb-1">
              조선소 블록 {posDef.code} 그루브 용접 시뮬레이터
            </h2>
            <div className="text-xs text-amber-300 font-bold mb-2">
              대상: {posDef.blockName} ({posDef.jointType})
            </div>
            <p className="text-slate-300 text-xs max-w-md mb-4 leading-relaxed font-normal">
              단순히 선을 따라가는 것이 아니라, 마우스나 터치로 <strong>{posDef.technique}</strong>을
              구사하며 그루브 양단 베벨을 메우세요.<br />
              <span className="text-sky-300 font-semibold">{posDef.guideDesc}</span>
            </p>

            <button
              onClick={() => startPosition(activeStageIdx)}
              className="px-6 py-2.5 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-slate-950 font-black text-xs sm:text-sm rounded-xl shadow-lg active:scale-95 transition-all flex items-center gap-2 cursor-pointer"
            >
              <Play className="w-4 h-4 fill-slate-950" />
              {posDef.code} 위빙 아크 점화
            </button>
          </div>
        )}

        {/* STAGE SUCCESS OVERLAY */}
        {stageComplete && (
          <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-md flex flex-col items-center justify-center p-4 text-center z-20 animate-in fade-in zoom-in-95 duration-200">
            <div className="w-12 h-12 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center mb-2 text-emerald-400">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <h3 className="text-base sm:text-lg font-black text-white mb-1">
              {posDef.code} 그루브 비드 완벽 시공!
            </h3>
            <p className="text-slate-300 text-xs mb-3 max-w-sm font-normal">
              언더컷과 용입 불량 없이 균일한 물결형 비드를 완성하여 선급 검사를 통과했습니다.
            </p>

            <div className="flex items-center gap-3 mb-4">
              <div className="bg-slate-900 border border-slate-800 px-4 py-2 rounded-xl text-center">
                <span className="text-[10px] text-slate-400 block font-medium">품질 등급</span>
                <span className="text-xl font-black text-amber-400">{qualityGrade}</span>
              </div>
              <div className="bg-slate-900 border border-slate-800 px-4 py-2 rounded-xl text-center">
                <span className="text-[10px] text-slate-400 block font-medium">총 누적 점수</span>
                <span className="text-xl font-black text-sky-400 tabular-nums">{totalScore.toLocaleString()}점</span>
              </div>
            </div>

            <div className="flex gap-2">
              {activeStageIdx < POSITIONS.length - 1 ? (
                <button
                  onClick={() => startPosition(activeStageIdx + 1)}
                  className="px-5 py-2.5 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-slate-950 font-black text-xs sm:text-sm rounded-xl shadow-lg active:scale-95 transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  다음 자세 ({POSITIONS[activeStageIdx + 1].code})
                  <ChevronRight className="w-4 h-4" />
                </button>
              ) : (
                <button
                  onClick={() => startPosition(0)}
                  className="px-5 py-2.5 bg-gradient-to-r from-sky-500 to-blue-600 text-white font-black text-xs sm:text-sm rounded-xl shadow-lg active:scale-95 transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <RotateCcw className="w-4 h-4" />
                  1G부터 다시 도전하기
                </button>
              )}
            </div>
          </div>
        )}

        {/* GAMEOVER OVERLAY */}
        {gameOver && (
          <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-md flex flex-col items-center justify-center p-4 text-center z-20 animate-in fade-in zoom-in-95 duration-200">
            <div className="w-12 h-12 rounded-xl bg-rose-500/20 border border-rose-500/40 flex items-center justify-center mb-2 text-rose-400">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <h3 className="text-base sm:text-lg font-black text-white mb-1">용접 작업 중단</h3>
            <p className="text-slate-300 text-xs mb-3 max-w-sm font-normal">
              보호 가스 소진 또는 운봉 시간 초과로 비드가 중단되었습니다.
            </p>
            <div className="bg-slate-900 border border-slate-800 px-5 py-2 rounded-xl text-center mb-4">
              <span className="text-[10px] text-slate-400 block font-medium">최종 달성 점수</span>
              <span className="text-xl font-black text-amber-400 tabular-nums">{totalScore.toLocaleString()}점</span>
            </div>
            <button
              onClick={() => startPosition(activeStageIdx)}
              className="px-5 py-2.5 bg-gradient-to-r from-amber-500 to-orange-600 text-slate-950 font-black text-xs sm:text-sm rounded-xl shadow-lg active:scale-95 transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
              현재 자세 재도전
            </button>
          </div>
        )}
      </div>

      {/* Bottom Educational Weaving Guide Bar */}
      <div className="px-3 py-2 bg-slate-900/95 border-t border-slate-800 flex items-center justify-between text-xs shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-[10px] bg-slate-800 px-2 py-0.5 rounded font-bold text-slate-300 border border-slate-700">
            용접 비법
          </span>
          <span className="text-[11px] text-slate-300 font-medium truncate">
            {posDef.technique} — {posDef.guideDesc}
          </span>
        </div>

        <div className="hidden sm:flex items-center gap-2 text-[10px] text-slate-400">
          <span>마우스 클릭/터치 드래그로 위빙</span>
        </div>
      </div>
    </div>
  );
}
