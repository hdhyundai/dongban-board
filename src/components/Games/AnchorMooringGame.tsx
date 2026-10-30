import React, { useEffect, useRef, useState } from "react";
import { Play, RotateCcw, Volume2, VolumeX, ShieldCheck, Anchor, Waves, AlertTriangle, CheckCircle2, Gauge, ArrowDown, ArrowUp } from "lucide-react";
import confetti from "canvas-confetti";
import { gameAudio } from "../../lib/gameSounds";

interface AnchorMooringGameProps {
  onFinish: (score: number) => void;
}

interface MooringLine {
  id: number;
  name: string;
  shortName: string;
  keyLabel: string;
  winchOffsetX: number; // offset from ship center
  winchOffsetY: number;
  bollardOffsetX: number; // offset from quay center
  color: string;
}

const MOORING_LINES: MooringLine[] = [
  { id: 0, name: "선수 헤드라인 (Head Line)", shortName: "1. 선수 헤드", keyLabel: "1 / Q", winchOffsetX: 160, winchOffsetY: -26, bollardOffsetX: 240, color: "#38bdf8" },
  { id: 1, name: "선수 횡/스프링라인 (Fwd Breast)", shortName: "2. 선수 횡라인", keyLabel: "2 / W", winchOffsetX: 65, winchOffsetY: -26, bollardOffsetX: 80, color: "#fbbf24" },
  { id: 2, name: "선미 횡/스프링라인 (Aft Breast)", shortName: "3. 선미 횡라인", keyLabel: "3 / E", winchOffsetX: -65, winchOffsetY: -26, bollardOffsetX: -80, color: "#a855f7" },
  { id: 3, name: "선미 스턴라인 (Stern Line)", shortName: "4. 선미 스턴", keyLabel: "4 / R", winchOffsetX: -160, winchOffsetY: -26, bollardOffsetX: -240, color: "#34d399" },
];

export default function AnchorMooringGame({ onFinish }: AnchorMooringGameProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [gameState, setGameState] = useState<"READY" | "PLAYING" | "GAMEOVER">("READY");
  const [score, setScore] = useState(0);
  const [distanceToQuayM, setDistanceToQuayM] = useState(4.2);
  const [yawDeg, setYawDeg] = useState(2.2);
  const [stableHoldSec, setStableHoldSec] = useState(0);
  const [isMuted, setIsMuted] = useState(gameAudio.getMuted());
  const [alarmMsg, setAlarmMsg] = useState("");
  const [isSuccess, setIsSuccess] = useState(false);

  // Active tensions tracked in React state for immediate button & gauge responsiveness
  const [tensions, setTensions] = useState<number[]>([150, 120, 120, 150]);

  const stateRef = useRef({
    isPlaying: false,
    score: 0,
    w: 800,
    h: 480,
    shipY: 280, // quay fender contact Y will be computed
    fenderY: 155,
    shipAngle: 0.038, // slight initial yaw
    vy: 14, // offshore drift speed (pushed down by tidal surge)
    vAngle: -0.002,
    stableTimer: 0,
    isMoored: false,
    // Real-time actual rope tensions
    ropes: [150, 120, 120, 150],
    targetRopes: [150, 120, 120, 150],
    lastTime: performance.now(),
  });

  const toggleSound = (e: React.MouseEvent) => {
    e.stopPropagation();
    const muted = gameAudio.toggleMute();
    setIsMuted(muted);
  };

  const startGame = () => {
    const s = stateRef.current;
    s.score = 0;
    s.shipY = s.fenderY + 95; // ~4.3 meters offshore
    s.shipAngle = 0.038;
    s.vy = 12;
    s.vAngle = -0.002;
    s.stableTimer = 0;
    s.isMoored = false;
    s.isPlaying = true;
    s.lastTime = performance.now();

    const initialTensions = [150, 120, 120, 150];
    s.ropes = [...initialTensions];
    s.targetRopes = [...initialTensions];

    setTensions(initialTensions);
    setScore(0);
    setDistanceToQuayM(4.3);
    setYawDeg(2.2);
    setStableHoldSec(0);
    setAlarmMsg("");
    setIsSuccess(false);
    setGameState("PLAYING");

    gameAudio.playStart();
  };

  // Immediate, responsive tension adjustment
  const adjustRopeTension = (idx: number, deltaKN: number) => {
    if (gameState !== "PLAYING") return;
    const s = stateRef.current;
    const currentTarget = s.targetRopes[idx];
    const newTarget = Math.max(0, Math.min(860, currentTarget + deltaKN));
    s.targetRopes[idx] = newTarget;

    // Fast-response push so the rope reacts without sluggish delay
    s.ropes[idx] = Math.max(0, Math.min(860, s.ropes[idx] + deltaKN * 0.8));

    setTensions([...s.targetRopes]);
    gameAudio.playClick();
  };

  // Keyboard shortcut handlers (1..4 to Heave in, Q..R or Shift+1..4 to Slack)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (gameState !== "PLAYING") return;
      const isSlack = e.shiftKey;
      const delta = isSlack ? -60 : 60;

      if (e.key === "1") adjustRopeTension(0, delta);
      else if (e.key === "2") adjustRopeTension(1, delta);
      else if (e.key === "3") adjustRopeTension(2, delta);
      else if (e.key === "4") adjustRopeTension(3, delta);
      else if (e.key === "q" || e.key === "Q") adjustRopeTension(0, -60);
      else if (e.key === "w" || e.key === "W") adjustRopeTension(1, -60);
      else if (e.key === "e" || e.key === "E") adjustRopeTension(2, -60);
      else if (e.key === "r" || e.key === "R") adjustRopeTension(3, -60);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [gameState]);

  // Main Canvas Render & Kinematics Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = mountRef.current;
    if (!canvas || !container) return;

    let animId = 0;

    const resize = () => {
      const rect = container.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.max(480, Math.floor(rect.width));
      const h = Math.max(340, Math.floor(rect.height));

      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;

      stateRef.current.w = w;
      stateRef.current.h = h;
      stateRef.current.fenderY = Math.floor(h * 0.32);
    };

    const ro = new ResizeObserver(() => resize());
    ro.observe(container);
    resize();

    const finishGame = (success: boolean, reason?: string) => {
      const s = stateRef.current;
      if (!s.isPlaying) return;
      s.isPlaying = false;
      setIsSuccess(success);
      setGameState("GAMEOVER");
      if (reason) setAlarmMsg(reason);

      if (success) {
        gameAudio.playVictory();
        confetti({
          particleCount: 90,
          spread: 80,
          origin: { y: 0.6 },
          colors: ["#38BDF8", "#00A352", "#FBBF24", "#FFFFFF"],
        });
      } else {
        gameAudio.playFailure();
      }
      onFinish(s.score);
    };

    const render = (now: number) => {
      const s = stateRef.current;
      const dt = Math.min((now - s.lastTime) / 1000, 0.06);
      s.lastTime = now;

      const w = s.w;
      const h = s.h;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      ctx.save();
      ctx.scale(dpr, dpr);

      const fenderContactY = s.fenderY;
      const midX = w / 2;

      if (s.isPlaying) {
        // Continuous tidal current pushing ship outwards away from quay
        const tidalSurgeForce = 26 + Math.sin(now * 0.002) * 5;
        const windYawMoment = Math.sin(now * 0.0016) * 0.007;

        // Smooth tension ramp towards commanded target
        for (let i = 0; i < 4; i++) {
          s.ropes[i] += (s.targetRopes[i] - s.ropes[i]) * 10 * dt;
        }

        // Check line snap (> 820 kN)
        for (let i = 0; i < 4; i++) {
          if (s.ropes[i] >= 820) {
            gameAudio.playFailure();
            finishGame(false, `과장력 파단(Line Snap)! ${MOORING_LINES[i].name}이 820 kN을 초과하여 끊어졌습니다.`);
            ctx.restore();
            return;
          }
        }

        // BALANCED SYMMETRICAL FORCE CALCULATIONS:
        // Bow lines (0: Head, 1: Fwd Breast) pull the bow
        // Stern lines (2: Aft Breast, 3: Stern) pull the stern
        const bowInwardForce = (s.ropes[0] * 0.75 + s.ropes[1] * 1.0) * 0.038;
        const sternInwardForce = (s.ropes[3] * 0.75 + s.ropes[2] * 1.0) * 0.038;

        const totalInwardForce = bowInwardForce + sternInwardForce;

        // Vertical acceleration (tidalSurge pushes ship downwards +, inwardForce pulls ship upwards -)
        const netAccY = tidalSurgeForce - totalInwardForce;
        s.vy += netAccY * dt * 2.2;
        s.vy *= 0.92; // water resistance damping
        s.shipY += s.vy * dt * 4.5;

        // Yaw torque: difference between bow pull and stern pull
        const torque = (bowInwardForce - sternInwardForce) * 0.0018 + windYawMoment;
        s.vAngle += torque * dt * 14;
        s.vAngle *= 0.88; // angular drag
        s.shipAngle += s.vAngle * dt;

        // Distance from fenders in meters (fenderContactY is 0.0m)
        const currentDistM = Math.max(0, +((s.shipY - fenderContactY) / 22).toFixed(2));
        setDistanceToQuayM(currentDistM);
        const currentYawDeg = +((s.shipAngle * 180) / Math.PI).toFixed(1);
        setYawDeg(currentYawDeg);

        // Fender compression contact physics
        if (s.shipY <= fenderContactY) {
          const impactSpeed = Math.abs(s.vy);
          s.shipY = fenderContactY;

          if (impactSpeed > 26) {
            gameAudio.playFailure();
            finishGame(false, `방충재 격돌 사고! 충돌 속도가 너무 빨라 요코하마 펜더가 파손되었습니다.`);
            ctx.restore();
            return;
          }
          s.vy = 0;
        }

        // Fairway drift failure (> 7.5m)
        if (currentDistM > 7.5) {
          gameAudio.playFailure();
          finishGame(false, "계류 한계선 이탈! 선박이 조류에 밀려 항로 밖으로 표류하였습니다.");
          ctx.restore();
          return;
        }

        // Mooring Stability Verification:
        // Distance <= 0.45m, Yaw angle <= 1.2°, All 4 lines between 220 and 680 kN
        const isParallel = Math.abs(currentYawDeg) <= 1.2;
        const isSnug = currentDistM <= 0.45;
        const allLinesGood = s.ropes.every((t) => t >= 220 && t <= 680);

        if (isParallel && isSnug && allLinesGood) {
          s.stableTimer += dt;
          setStableHoldSec(+(s.stableTimer).toFixed(1));
          s.score += Math.round(dt * 250);
          setScore(s.score);

          if (s.stableTimer >= 4.0 && !s.isMoored) {
            s.isMoored = true;
            s.score += 3500;
            setScore(s.score);
            finishGame(true);
            ctx.restore();
            return;
          }
        } else {
          s.stableTimer = Math.max(0, s.stableTimer - dt * 1.5);
          setStableHoldSec(+(s.stableTimer).toFixed(1));
        }
      }

      // ---------------- RENDER ----------------
      ctx.clearRect(0, 0, w, h);

      // 1. Ocean Water Background
      const oceanGrad = ctx.createLinearGradient(0, 0, 0, h);
      oceanGrad.addColorStop(0, "#082f49");
      oceanGrad.addColorStop(0.5, "#0c4a6e");
      oceanGrad.addColorStop(1, "#0369a1");
      ctx.fillStyle = oceanGrad;
      ctx.fillRect(0, 0, w, h);

      // Water flow streaks
      ctx.strokeStyle = "rgba(255, 255, 255, 0.12)";
      ctx.lineWidth = 1;
      for (let y = fenderContactY + 20; y < h; y += 32) {
        ctx.beginPath();
        for (let x = 0; x < w; x += 25) {
          const wy = y + Math.sin(x * 0.04 + now * 0.003) * 3;
          if (x === 0) ctx.moveTo(x, wy);
          else ctx.lineTo(x, wy);
        }
        ctx.stroke();
      }

      // 2. Concrete Mooring Quay at top
      const quayH = fenderContactY - 30;
      ctx.fillStyle = "#334155";
      ctx.fillRect(0, 0, w, quayH);
      ctx.fillStyle = "#1e293b";
      ctx.fillRect(0, quayH - 6, w, 6);

      // Yellow/Black Hazard Safety Stripes
      for (let sx = 0; sx < w; sx += 32) {
        ctx.fillStyle = (sx / 32) % 2 === 0 ? "#facc15" : "#0f172a";
        ctx.fillRect(sx, quayH - 14, 32, 8);
      }

      // Pier Bollards (4 Symmetrical Bollards)
      MOORING_LINES.forEach((line) => {
        const bx = midX + line.bollardOffsetX;
        const by = quayH - 26;

        ctx.fillStyle = "#0f172a";
        ctx.beginPath();
        ctx.arc(bx, by, 9, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#cbd5e1";
        ctx.beginPath();
        ctx.arc(bx, by, 6, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = "#94a3b8";
        ctx.font = "bold 10px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(`볼라드 #${line.id + 1}`, bx, by - 12);
      });

      // 3. Yokohama Floating Pneumatic Rubber Fenders
      const fenderY = fenderContactY - 14;
      for (let fx = midX - 220; fx <= midX + 220; fx += 88) {
        ctx.fillStyle = "#09090b";
        ctx.beginPath();
        ctx.roundRect(fx - 16, fenderY, 32, 22, 6);
        ctx.fill();
        ctx.strokeStyle = "#71717a";
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Fender net stripes
        ctx.strokeStyle = "rgba(255, 255, 255, 0.25)";
        ctx.beginPath();
        ctx.moveTo(fx - 10, fenderY + 4);
        ctx.lineTo(fx + 10, fenderY + 18);
        ctx.moveTo(fx + 10, fenderY + 4);
        ctx.lineTo(fx - 10, fenderY + 18);
        ctx.stroke();
      }

      // 4. Mooring Lines (High-strength Ropes)
      MOORING_LINES.forEach((line, idx) => {
        const tension = s.ropes[idx];
        const cosA = Math.cos(s.shipAngle);
        const sinA = Math.sin(s.shipAngle);

        const wx = midX + line.winchOffsetX * cosA - line.winchOffsetY * sinA;
        const wy = s.shipY + line.winchOffsetX * sinA + line.winchOffsetY * cosA;
        const bx = midX + line.bollardOffsetX;
        const by = quayH - 26;

        // Line color changes according to tension zone
        let lineColor = line.color;
        if (tension > 720) lineColor = "#ef4444";
        else if (tension >= 220 && tension <= 680) lineColor = "#22c55e";
        else if (tension < 220) lineColor = "#38bdf8";

        ctx.strokeStyle = lineColor;
        ctx.lineWidth = 2.5 + (tension / 850) * 2.5;
        ctx.beginPath();
        ctx.moveTo(bx, by);
        ctx.lineTo(wx, wy);
        ctx.stroke();

        // Winch drum on vessel
        ctx.fillStyle = "#1e293b";
        ctx.beginPath();
        ctx.arc(wx, wy, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#cbd5e1";
        ctx.lineWidth = 1.5;
        ctx.stroke();
      });

      // 5. 15,000 TEU Container Ship Hull
      ctx.save();
      ctx.translate(midX, s.shipY);
      ctx.rotate(s.shipAngle);

      // Hull shadow
      ctx.fillStyle = "rgba(0, 0, 0, 0.35)";
      ctx.fillRect(-220 + 8, -42 + 8, 440, 84);

      // Outer Hull (HD Navy Blue)
      ctx.fillStyle = "#002C6C";
      ctx.beginPath();
      ctx.moveTo(225, 0); // Bow tip on right
      ctx.lineTo(185, -42);
      ctx.lineTo(-220, -42);
      ctx.lineTo(-220, 42);
      ctx.lineTo(185, 42);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "#001845";
      ctx.lineWidth = 2.5;
      ctx.stroke();

      // Deck container cells
      const boxW = 18;
      const boxH = 14;
      const cColors = ["#0284c7", "#f59e0b", "#10b981", "#ef4444", "#8b5cf6"];
      for (let bx = -180; bx < 160; bx += 22) {
        for (let by = -34; by <= 22; by += 18) {
          ctx.fillStyle = cColors[Math.abs(Math.floor(bx * 3 + by)) % cColors.length];
          ctx.fillRect(bx, by, boxW, boxH);
          ctx.strokeStyle = "rgba(0,0,0,0.25)";
          ctx.strokeRect(bx, by, boxW, boxH);
        }
      }

      // Bridge house at stern
      ctx.fillStyle = "#f8fafc";
      ctx.fillRect(-195, -28, 26, 56);
      ctx.fillStyle = "#0284c7";
      ctx.fillRect(-191, -24, 18, 48);

      // Ship Name
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 10px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("HD SAMHO CONTAINER 01", 0, 4);

      ctx.restore();

      // 6. Optimal Green Zone Guide Overlay
      if (s.stableTimer > 0) {
        ctx.fillStyle = "rgba(16, 185, 129, 0.15)";
        ctx.fillRect(midX - 230, fenderContactY - 5, 460, 40);
        ctx.strokeStyle = "#10b981";
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 6]);
        ctx.strokeRect(midX - 230, fenderContactY - 5, 460, 40);
        ctx.setLineDash([]);
      }

      ctx.restore();
      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    return () => {
      cancelAnimationFrame(animId);
      ro.disconnect();
    };
  }, [gameState]);

  return (
    <div className="w-full h-full flex flex-col items-center justify-between select-none font-hd p-1 sm:p-2 bg-slate-950 text-white rounded-2xl border border-slate-800 shadow-2xl overflow-hidden">
      {/* Top Status Header */}
      <div className="w-full bg-slate-900 border border-slate-800 text-white px-3 sm:px-4 py-2 rounded-xl flex flex-wrap items-center justify-between gap-2 shadow-md shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-600 flex items-center justify-center shadow-md shadow-blue-500/20 shrink-0">
            <Anchor className="w-4 h-4 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-xs sm:text-sm text-white">안벽 4-포인트 윈치 계류</h3>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-sky-500/20 text-sky-400 border border-sky-500/30 shrink-0">
                정밀 시뮬레이션
              </span>
            </div>
            <p className="text-[11px] text-slate-400 font-normal hidden md:block">
              1,2,3,4번 윈치로 4개 계류줄을 조율하여 안벽 방충재에 4초간 밀착·평행 고정하세요.
            </p>
          </div>
        </div>

        {/* Live Gauges */}
        <div className="flex items-center gap-2 text-xs font-semibold">
          <div className="bg-slate-800/90 px-2.5 py-1 rounded-lg border border-slate-700/60 text-center">
            <span className="text-slate-400 block text-[9px] font-medium">안벽 거리</span>
            <span className={`text-xs sm:text-sm font-bold tabular-nums ${distanceToQuayM <= 0.45 ? "text-emerald-400" : "text-cyan-400"}`}>
              {distanceToQuayM}m
            </span>
          </div>

          <div className="bg-slate-800/90 px-2.5 py-1 rounded-lg border border-slate-700/60 text-center">
            <span className="text-slate-400 block text-[9px] font-medium">선체 편각</span>
            <span className={`text-xs sm:text-sm font-bold tabular-nums ${Math.abs(yawDeg) <= 1.2 ? "text-emerald-400" : "text-amber-400"}`}>
              {yawDeg}°
            </span>
          </div>

          <div className="bg-slate-800/90 px-2.5 py-1 rounded-lg border border-slate-700/60 text-center">
            <span className="text-slate-400 block text-[9px] font-medium">유지 시간</span>
            <span className="text-xs sm:text-sm font-bold text-emerald-400 tabular-nums">
              {stableHoldSec}s / 4.0s
            </span>
          </div>

          <div className="bg-slate-800/90 px-2.5 py-1 rounded-lg border border-slate-700/60 text-center">
            <span className="text-slate-400 block text-[9px] font-medium">계류 점수</span>
            <span className="text-xs sm:text-sm font-bold text-sky-400 tabular-nums">{score.toLocaleString()}점</span>
          </div>

          <button
            onClick={toggleSound}
            className="p-1.5 bg-slate-800 hover:bg-slate-700 rounded-lg border border-slate-700 text-slate-300 transition-all active:scale-95 shrink-0"
            title={isMuted ? "소리 켜기" : "음소거"}
          >
            {isMuted ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4 text-emerald-400" />}
          </button>
        </div>
      </div>

      {/* Main Responsive Canvas Viewport */}
      <div
        ref={mountRef}
        className="w-full relative flex-1 min-h-[300px] rounded-xl overflow-hidden border border-slate-800 shadow-xl bg-slate-950 my-1.5 flex items-center justify-center"
      >
        <canvas ref={canvasRef} className="absolute inset-0 block w-full h-full" />

        {/* Alarm Banner */}
        {alarmMsg && gameState === "PLAYING" && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-rose-950/90 border border-rose-500 text-rose-200 px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-lg animate-bounce z-10">
            <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
            {alarmMsg}
          </div>
        )}

        {/* Start Overlay */}
        {gameState === "READY" && (
          <div className="absolute inset-0 bg-slate-950/85 backdrop-blur-sm flex flex-col items-center justify-center p-4 sm:p-6 text-center z-20 animate-in fade-in duration-200">
            <div className="w-12 h-12 rounded-xl bg-sky-500/20 border border-sky-500/40 flex items-center justify-center mb-2.5 text-sky-400 shadow-lg shadow-sky-500/10">
              <Anchor className="w-6 h-6" />
            </div>
            <h2 className="text-base sm:text-lg md:text-xl font-bold text-white mb-1.5">안벽 4-포인트 윈치 계류 시뮬레이터</h2>
            <p className="text-slate-300 text-xs sm:text-[13px] max-w-lg mb-3.5 leading-relaxed">
              <strong>1, 2, 3, 4 키</strong>로 각 윈치를 즉시 감아당기고(Shift 누르거나 Q,W,E,R로 풀림),<br />
              4개 로프 장력을 <strong>250~650 kN</strong>으로 균등 배분하여 <strong>안벽 거리 0.45m 이내</strong>로 4초간 유지하세요.
            </p>
            <button
              onClick={startGame}
              className="px-6 py-2.5 bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-600 hover:to-blue-700 text-white font-bold text-xs sm:text-sm rounded-xl shadow-lg active:scale-95 transition-all flex items-center gap-2 cursor-pointer"
            >
              <Play className="w-4 h-4 fill-white" />
              계류 윈치 작전 시작
            </button>
          </div>
        )}

        {/* Game Over / Victory Overlay */}
        {gameState === "GAMEOVER" && (
          <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-md flex flex-col items-center justify-center p-4 sm:p-6 text-center z-20 animate-in fade-in zoom-in-95 duration-200">
            {isSuccess ? (
              <>
                <div className="w-12 h-12 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center mb-2 text-emerald-400">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <h3 className="text-base sm:text-lg md:text-xl font-bold text-white mb-1">
                  안벽 4-포인트 완전 결속 성공!
                </h3>
                <p className="text-slate-300 text-xs sm:text-[13px] mb-3 max-w-sm">
                  볼라드와 방충재에 완벽하게 밀착되어 무사고 계류 승인이 발령되었습니다.
                </p>
              </>
            ) : (
              <>
                <div className="w-12 h-12 rounded-xl bg-rose-500/20 border border-rose-500/40 flex items-center justify-center mb-2 text-rose-400">
                  <AlertTriangle className="w-6 h-6" />
                </div>
                <h3 className="text-base sm:text-lg md:text-xl font-bold text-white mb-1">계류 작전 실패</h3>
                <p className="text-slate-300 text-xs sm:text-[13px] mb-3 max-w-sm">
                  {alarmMsg || "조류 유실 또는 방충재 충격 속도 초과로 중단되었습니다."}
                </p>
              </>
            )}

            <div className="bg-slate-900 border border-slate-800 px-5 py-2.5 rounded-xl text-center mb-3.5 min-w-[180px]">
              <span className="text-[10px] text-slate-400 block mb-0.5 font-medium">최종 계류 스코어</span>
              <span className="text-xl sm:text-2xl font-bold text-sky-400 tabular-nums">{score.toLocaleString()}점</span>
            </div>
            <button
              onClick={startGame}
              className="px-6 py-2.5 bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-600 hover:to-blue-700 text-white font-bold text-xs sm:text-sm rounded-xl active:scale-95 transition-all flex items-center gap-2 cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
              계류 재도전
            </button>
          </div>
        )}
      </div>

      {/* 4-Line Mooring Winch Remote Control Deck */}
      <div className="w-full grid grid-cols-2 sm:grid-cols-4 gap-2 shrink-0">
        {MOORING_LINES.map((line, idx) => {
          const currentTension = tensions[idx];
          const isOptimal = currentTension >= 220 && currentTension <= 680;
          const isDanger = currentTension > 720;

          return (
            <div
              key={idx}
              className={`p-2 sm:p-2.5 rounded-xl border flex flex-col justify-between transition-all ${
                isDanger
                  ? "bg-rose-950/40 border-rose-500/60 shadow-rose-950/40"
                  : isOptimal
                  ? "bg-emerald-950/30 border-emerald-500/50 shadow-emerald-950/30"
                  : "bg-slate-900/90 border-slate-800"
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-bold text-white truncate">{line.shortName}</span>
                <span
                  className={`text-xs font-bold tabular-nums ${
                    isDanger
                      ? "text-rose-400 animate-pulse"
                      : isOptimal
                      ? "text-emerald-400"
                      : "text-amber-400"
                  }`}
                >
                  {Math.round(currentTension)} kN
                </span>
              </div>

              {/* Tension Progress Gauge Bar */}
              <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden mb-2">
                <div
                  className={`h-full transition-all duration-100 ${
                    isDanger ? "bg-rose-500" : isOptimal ? "bg-emerald-400" : "bg-sky-400"
                  }`}
                  style={{ width: `${Math.min(100, (currentTension / 800) * 100)}%` }}
                />
              </div>

              <div className="flex gap-1.5">
                <button
                  onClick={() => adjustRopeTension(idx, 60)}
                  className="flex-1 py-1.5 bg-sky-600 hover:bg-sky-500 active:scale-95 text-white font-black text-xs rounded-lg transition-transform flex items-center justify-center gap-1 cursor-pointer shadow-sm"
                  title={`${line.keyLabel} 키`}
                >
                  <ArrowUp className="w-3.5 h-3.5" />
                  당김 [+{idx + 1}]
                </button>
                <button
                  onClick={() => adjustRopeTension(idx, -60)}
                  className="flex-1 py-1.5 bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-300 font-black text-xs rounded-lg transition-transform flex items-center justify-center gap-1 cursor-pointer border border-slate-700"
                >
                  <ArrowDown className="w-3.5 h-3.5" />
                  풀기
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
