import React, { useEffect, useRef, useState } from "react";
import { Play, RotateCcw, Volume2, VolumeX, ShieldCheck, Compass, Anchor, Waves, AlertTriangle, CheckCircle2, Gauge } from "lucide-react";
import confetti from "canvas-confetti";
import { gameAudio } from "../../lib/gameSounds";

interface AnchorMooringGameProps {
  onFinish: (score: number) => void;
}

interface MooringRope {
  name: string;
  shortName: string;
  winchX: number; // relative to ship center
  winchY: number;
  bollardX: number; // absolute quay coordinate
  bollardY: number;
  tensionKN: number; // 0 to 900 kN (snap at 850)
  targetTensionKN: number;
  color: string;
}

export default function AnchorMooringGame({ onFinish }: AnchorMooringGameProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [gameState, setGameState] = useState<"READY" | "PLAYING" | "GAMEOVER">("READY");
  const [score, setScore] = useState(0);
  const [distanceToQuayM, setDistanceToQuayM] = useState(4.2);
  const [speedMs, setSpeedMs] = useState(0.8);
  const [yawDeg, setYawDeg] = useState(2.4);
  const [stableHoldSec, setStableHoldSec] = useState(0);
  const [isMuted, setIsMuted] = useState(gameAudio.getMuted());
  const [alarmMsg, setAlarmMsg] = useState("");

  const stateRef = useRef({
    score: 0,
    shipX: 310,
    shipY: 260, // quay fender contact is at Y = 175
    shipAngle: 0.04, // radians yaw
    vx: 0,
    vy: 14, // offshore drift velocity (pushes down away from quay)
    vAngle: -0.003,
    stableTimer: 0,
    isMoored: false,
    ropes: [
      { name: "선수 헤드라인 (Head Line)", shortName: "1. 선수줄", winchX: 130, winchY: -15, bollardX: 520, bollardY: 100, tensionKN: 180, targetTensionKN: 180, color: "#38bdf8" },
      { name: "선수 스프링라인 (Fwd Spring)", shortName: "2. 선수봄줄", winchX: 60, winchY: -15, bollardX: 180, bollardY: 100, tensionKN: 140, targetTensionKN: 140, color: "#fbbf24" },
      { name: "선미 스프링라인 (Aft Spring)", shortName: "3. 선미봄줄", winchX: -60, winchY: -15, bollardX: 440, bollardY: 100, tensionKN: 140, targetTensionKN: 140, color: "#a855f7" },
      { name: "선미 스턴라인 (Stern Line)", shortName: "4. 선미줄", winchX: -130, winchY: -15, bollardX: 100, bollardY: 100, tensionKN: 180, targetTensionKN: 180, color: "#34d399" },
    ] as MooringRope[],
    fenders: [
      { x: 130, compressed: 0 },
      { x: 230, compressed: 0 },
      { x: 330, compressed: 0 },
      { x: 430, compressed: 0 },
      { x: 510, compressed: 0 },
    ],
    lastTime: 0,
  });

  const toggleSound = (e: React.MouseEvent) => {
    e.stopPropagation();
    const muted = gameAudio.toggleMute();
    setIsMuted(muted);
  };

  const startGame = () => {
    const s = stateRef.current;
    s.score = 0;
    s.shipX = 310;
    s.shipY = 270; // 4.2m away from fender contact
    s.shipAngle = 0.045;
    s.vx = 0;
    s.vy = 12; // persistent tidal current pulling ship into harbor fairway
    s.vAngle = -0.003;
    s.stableTimer = 0;
    s.isMoored = false;
    s.lastTime = performance.now();

    s.ropes[0].tensionKN = 120;
    s.ropes[0].targetTensionKN = 120;
    s.ropes[1].tensionKN = 100;
    s.ropes[1].targetTensionKN = 100;
    s.ropes[2].tensionKN = 100;
    s.ropes[2].targetTensionKN = 100;
    s.ropes[3].tensionKN = 120;
    s.ropes[3].targetTensionKN = 120;

    setScore(0);
    setDistanceToQuayM(4.2);
    setSpeedMs(0.8);
    setYawDeg(2.5);
    setStableHoldSec(0);
    setAlarmMsg("");
    setGameState("PLAYING");
    gameAudio.playClick();
  };

  // Adjust individual winch tension
  const adjustRopeTension = (idx: number, deltaKN: number) => {
    if (gameState !== "PLAYING") return;
    const r = stateRef.current.ropes[idx];
    r.targetTensionKN = Math.max(0, Math.min(880, r.targetTensionKN + deltaKN));
    gameAudio.playWinchCrank();
  };

  // Keyboard shortcut handlers (1,2,3,4 to heave in; Shift+1,2,3,4 to slack)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (gameState !== "PLAYING") return;
      const isSlack = e.shiftKey;
      const delta = isSlack ? -80 : 80;
      if (e.key === "1") adjustRopeTension(0, delta);
      else if (e.key === "2") adjustRopeTension(1, delta);
      else if (e.key === "3") adjustRopeTension(2, delta);
      else if (e.key === "4") adjustRopeTension(3, delta);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [gameState]);

  // Main Simulation Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;

    const finishGame = (success: boolean) => {
      setGameState("GAMEOVER");
      const finalScore = stateRef.current.score;
      onFinish(finalScore);
      if (success) {
        confetti({
          particleCount: 90,
          spread: 80,
          origin: { y: 0.6 },
          colors: ["#38BDF8", "#00A352", "#FBBF24", "#FFFFFF"],
        });
      }
    };

    const render = (now: number) => {
      const s = stateRef.current;
      const dt = Math.min((now - s.lastTime) / 1000, 0.05);
      s.lastTime = now;

      const w = canvas.width;
      const h = canvas.height;

      if (gameState === "PLAYING") {
        // Continuous tidal current pushing vessel outwards (downwards)
        const tidalSurgeForce = 22 + Math.sin(now * 0.002) * 5; // kN equivalent
        const windYawMoment = Math.sin(now * 0.0015) * 0.008;

        // Smoothly ramp actual tension toward target winch command
        s.ropes.forEach((r) => {
          r.tensionKN += (r.targetTensionKN - r.tensionKN) * 6 * dt;
        });

        // Check line snap (>840 kN)
        for (const r of s.ropes) {
          if (r.tensionKN >= 840) {
            gameAudio.playBomb();
            gameAudio.playDrop();
            setAlarmMsg(`사고: ${r.name} 과장력 파단(Line Snap) 발생!`);
            finishGame(false);
            return;
          }
        }

        // Sum net forces from 4 mooring lines
        // Fender contact line is at Y = 175
        const fenderContactY = 175;

        // Rope angles & inward pull calculation
        let totalPullY = 0;
        let totalTorque = 0;

        s.ropes.forEach((r) => {
          // Winch position on rotated ship
          const cosA = Math.cos(s.shipAngle);
          const sinA = Math.sin(s.shipAngle);
          const wx = s.shipX + r.winchX * cosA - r.winchY * sinA;
          const wy = s.shipY + r.winchX * sinA + r.winchY * cosA;

          const dx = r.bollardX - wx;
          const dy = r.bollardY - wy;
          const len = Math.hypot(dx, dy);

          if (len > 0) {
            const unitY = dy / len; // negative means pulling upwards toward quay
            const pullForce = (r.tensionKN / 450) * 18; // scale
            totalPullY += unitY * pullForce;

            // Torque around ship center
            const rx = wx - s.shipX;
            const ry = wy - s.shipY;
            const fy = unitY * pullForce;
            const fx = (dx / len) * pullForce;
            totalTorque += (rx * fy - ry * fx) * 0.0003;
          }
        });

        // Angular kinematics
        s.vAngle += (totalTorque + windYawMoment) * dt - s.vAngle * 1.8 * dt;
        s.shipAngle += s.vAngle * dt;

        // Vertical kinematics
        const netAccY = tidalSurgeForce + totalPullY; // tidalSurge pulls down (+), totalPullY pulls up (-)
        s.vy += netAccY * dt - s.vy * 0.9 * dt;
        s.shipY += s.vy * dt;

        // Fender compression contact at fenderContactY = 175
        const currentDistM = Math.max(0, +(((s.shipY - fenderContactY) / 22)).toFixed(2));
        setDistanceToQuayM(currentDistM);
        setSpeedMs(+(Math.abs(s.vy) * 0.05).toFixed(2));
        setYawDeg(+((s.shipAngle * 180) / Math.PI).toFixed(1));

        // Fender contact physics
        if (s.shipY <= fenderContactY) {
          const impactSpeed = Math.abs(s.vy);
          s.shipY = fenderContactY;

          if (impactSpeed > 18) {
            // Fender crushing crash
            gameAudio.playBomb();
            setAlarmMsg("사고: 안벽 요코하마 방충재 충돌 파손 (속도 초과)!");
            finishGame(false);
            return;
          }
          s.vy = 0;
        }

        // Drifting too far out into fairway failure (>7.5m)
        if (currentDistM > 7.5) {
          gameAudio.playDrop();
          setAlarmMsg("실패: 조류에 밀려 계류 한계선을 이탈했습니다!");
          finishGame(false);
          return;
        }

        // Mooring evaluation:
        // Distance 0.15 ~ 0.50m, Yaw angle < 0.025 rad, all 4 lines tensioned between 250 and 650 kN
        const isParallel = Math.abs(s.shipAngle) < 0.025;
        const isSnug = currentDistM <= 0.45;
        const allLinesGood = s.ropes.every((r) => r.tensionKN >= 220 && r.tensionKN <= 680);

        if (isParallel && isSnug && allLinesGood) {
          s.stableTimer += dt;
          setStableHoldSec(+(s.stableTimer).toFixed(1));
          s.score += Math.round(dt * 200);
          setScore(s.score);

          if (s.stableTimer >= 4.0 && !s.isMoored) {
            s.isMoored = true;
            gameAudio.playShipHorn();
            gameAudio.playVictory();
            s.score += 2500;
            setScore(s.score);
            setTimeout(() => finishGame(true), 1200);
          }
        } else {
          s.stableTimer = Math.max(0, s.stableTimer - dt * 1.5);
          setStableHoldSec(+(s.stableTimer).toFixed(1));
        }
      }

      // ---------------- RENDER ----------------
      ctx.clearRect(0, 0, w, h);

      // 1. Sea Water Background
      const oceanGrad = ctx.createLinearGradient(0, 0, 0, h);
      oceanGrad.addColorStop(0, "#082f49");
      oceanGrad.addColorStop(0.5, "#0c4a6e");
      oceanGrad.addColorStop(1, "#0369a1");
      ctx.fillStyle = oceanGrad;
      ctx.fillRect(0, 0, w, h);

      // Sea wave streaks
      ctx.strokeStyle = "rgba(255, 255, 255, 0.12)";
      ctx.lineWidth = 1;
      for (let y = 140; y < h; y += 30) {
        ctx.beginPath();
        for (let x = 0; x < w; x += 20) {
          const wy = y + Math.sin(x * 0.04 + now * 0.003) * 3;
          if (x === 0) ctx.moveTo(x, wy);
          else ctx.lineTo(x, wy);
        }
        ctx.stroke();
      }

      // 2. Concrete Mooring Quay (안벽) at top
      ctx.fillStyle = "#334155";
      ctx.fillRect(0, 0, w, 110);
      ctx.fillStyle = "#1e293b";
      ctx.fillRect(0, 105, w, 5);

      // Yellow/Black Quay Hazard Stripes
      for (let sx = 0; sx < w; sx += 32) {
        ctx.fillStyle = (sx / 32) % 2 === 0 ? "#facc15" : "#0f172a";
        ctx.fillRect(sx, 98, 32, 8);
      }

      // Pier Bollards (볼라드) on Concrete Quay
      s.ropes.forEach((r) => {
        ctx.fillStyle = "#0f172a";
        ctx.beginPath();
        ctx.arc(r.bollardX, r.bollardY, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#cbd5e1";
        ctx.beginPath();
        ctx.arc(r.bollardX, r.bollardY, 5, 0, Math.PI * 2);
        ctx.fill();
        // Label
        ctx.fillStyle = "#94a3b8";
        ctx.font = "bold 9px sans-serif";
        ctx.fillText(`볼라드 #${r.shortName.charAt(0)}`, r.bollardX - 16, r.bollardY - 14);
      });

      // 3. Yokohama Floating Pneumatic Rubber Fenders
      s.fenders.forEach((f) => {
        const fy = 110;
        ctx.fillStyle = "#09090b";
        ctx.beginPath();
        ctx.roundRect(f.x - 14, fy, 28, 22, 6);
        ctx.fill();
        ctx.strokeStyle = "#71717a";
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Tire net pattern
        ctx.strokeStyle = "rgba(255, 255, 255, 0.25)";
        ctx.beginPath();
        ctx.moveTo(f.x - 8, fy + 4);
        ctx.lineTo(f.x + 8, fy + 18);
        ctx.moveTo(f.x + 8, fy + 4);
        ctx.lineTo(f.x - 8, fy + 18);
        ctx.stroke();
      });

      // 4. Mooring Lines (High-Strength HMPE Ropes)
      s.ropes.forEach((r) => {
        const cosA = Math.cos(s.shipAngle);
        const sinA = Math.sin(s.shipAngle);
        const wx = s.shipX + r.winchX * cosA - r.winchY * sinA;
        const wy = s.shipY + r.winchX * sinA + r.winchY * cosA;

        // Line color changes from blue -> green -> amber -> red under high tension
        const tensionRatio = r.tensionKN / 850;
        const lineColor = tensionRatio > 0.8 ? "#ef4444" : tensionRatio > 0.65 ? "#f59e0b" : r.color;

        ctx.strokeStyle = lineColor;
        ctx.lineWidth = 2.5 + tensionRatio * 1.5;
        ctx.beginPath();
        ctx.moveTo(r.bollardX, r.bollardY);
        ctx.lineTo(wx, wy);
        ctx.stroke();

        // Winch drum on ship
        ctx.fillStyle = "#1e293b";
        ctx.beginPath();
        ctx.arc(wx, wy, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#cbd5e1";
        ctx.lineWidth = 1.5;
        ctx.stroke();
      });

      // 5. 15,000 TEU Container Ship Hull (Top-down view)
      ctx.save();
      ctx.translate(s.shipX, s.shipY);
      ctx.rotate(s.shipAngle);

      // Ship shadow
      ctx.fillStyle = "rgba(0, 0, 0, 0.35)";
      ctx.fillRect(-200 + 6, -45 + 6, 400, 90);

      // Main Outer Hull (HD Navy)
      ctx.fillStyle = "#002C6C";
      ctx.beginPath();
      // Pointy bow on the right
      ctx.moveTo(210, 0);
      ctx.lineTo(170, -45);
      ctx.lineTo(-200, -45);
      ctx.lineTo(-200, 45);
      ctx.lineTo(170, 45);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "#001845";
      ctx.lineWidth = 2;
      ctx.stroke();

      // Deck container cell guides
      const boxW = 16;
      const boxH = 14;
      const cColors = ["#0284c7", "#f59e0b", "#10b981", "#ef4444"];
      for (let bx = -170; bx < 150; bx += 20) {
        for (let by = -36; by <= 24; by += 16) {
          ctx.fillStyle = cColors[Math.abs(Math.floor(bx * 3 + by)) % cColors.length];
          ctx.fillRect(bx, by, boxW, boxH);
          ctx.strokeStyle = "rgba(0,0,0,0.2)";
          ctx.strokeRect(bx, by, boxW, boxH);
        }
      }

      // Wheelhouse bridge at stern
      ctx.fillStyle = "#f8fafc";
      ctx.fillRect(-175, -30, 24, 60);
      ctx.fillStyle = "#0284c7";
      ctx.fillRect(-172, -26, 18, 52);

      // Ship Name on Bow
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 9px sans-serif";
      ctx.fillText("HD SAMHO CONTAINER 01", -50, 4);

      ctx.restore();

      // 6. Optimal Green Zone Guide Overlay
      if (s.stableTimer > 0) {
        ctx.fillStyle = "rgba(16, 185, 129, 0.15)";
        ctx.fillRect(50, 110, w - 100, 75);
        ctx.strokeStyle = "#10b981";
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 6]);
        ctx.strokeRect(50, 110, w - 100, 75);
        ctx.setLineDash([]);
      }

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, [gameState]);

  return (
    <div className="w-full max-w-4xl mx-auto flex flex-col items-center select-none font-hd">
      {/* Top Header */}
      <div className="w-full bg-slate-900 border border-slate-800 text-white px-4 py-2.5 rounded-xl flex flex-wrap items-center justify-between gap-3 shadow-md mb-2">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-600 flex items-center justify-center shadow-md shadow-blue-500/20 shrink-0">
            <Anchor className="w-4 h-4 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-sm sm:text-base text-white">안벽 4-포인트 계류 윈치</h3>
              <span className="text-[10px] sm:text-[11px] font-bold px-2 py-0.5 rounded-full bg-sky-500/20 text-sky-400 border border-sky-500/30 shrink-0">
                정밀 시뮬레이션
              </span>
            </div>
            <p className="text-xs text-slate-400 font-normal hidden sm:block">
              조류 표류를 막고 4개 윈치 장력을 250~650 kN으로 유지하여 안벽에 4초간 밀착시키세요.
            </p>
          </div>
        </div>

        {/* Live Status Gauges */}
        <div className="flex items-center gap-2 sm:gap-3 text-xs font-semibold">
          <div className="bg-slate-800/80 px-2.5 py-1 rounded-lg border border-slate-700/60 text-center">
            <span className="text-slate-400 block text-[9px] font-medium">방충재 거리</span>
            <span className={`text-xs sm:text-sm font-bold tabular-nums ${distanceToQuayM <= 0.45 ? "text-emerald-400" : "text-cyan-400"}`}>
              {distanceToQuayM}m
            </span>
          </div>

          <div className="bg-slate-800/80 px-2.5 py-1 rounded-lg border border-slate-700/60 text-center">
            <span className="text-slate-400 block text-[9px] font-medium">선체 각도</span>
            <span className={`text-xs sm:text-sm font-bold tabular-nums ${Math.abs(yawDeg) < 1.5 ? "text-emerald-400" : "text-amber-400"}`}>
              {yawDeg}°
            </span>
          </div>

          <div className="bg-slate-800/80 px-2.5 py-1 rounded-lg border border-slate-700/60 text-center">
            <span className="text-slate-400 block text-[9px] font-medium">유지 시간</span>
            <span className="text-xs sm:text-sm font-bold text-emerald-400 tabular-nums">
              {stableHoldSec}s / 4.0s
            </span>
          </div>

          <div className="bg-slate-800/80 px-2.5 py-1 rounded-lg border border-slate-700/60 text-center">
            <span className="text-slate-400 block text-[9px] font-medium">계류 점수</span>
            <span className="text-xs sm:text-sm font-bold text-sky-400 tabular-nums">{score.toLocaleString()}점</span>
          </div>

          <button
            onClick={toggleSound}
            className="p-1.5 sm:p-2 bg-slate-800 hover:bg-slate-700 rounded-lg border border-slate-700 text-slate-300 transition-all active:scale-95 shrink-0"
            title={isMuted ? "소리 켜기" : "음소거"}
          >
            {isMuted ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4 text-emerald-400" />}
          </button>
        </div>
      </div>

      {/* Main Canvas Viewport */}
      <div className="w-full relative rounded-xl overflow-hidden border border-slate-800 shadow-xl bg-slate-950 h-[310px] sm:h-[340px] md:h-[360px] flex items-center justify-center">
        <canvas ref={canvasRef} className="w-full h-full block" width={640} height={420} />

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
            <p className="text-slate-300 text-xs sm:text-[13px] max-w-md mb-3.5 leading-relaxed">
              <strong>1, 2, 3, 4 키</strong>로 각 윈치 계류줄을 감아당기고(Shift 누르면 풀림),<br />
              로프 장력을 <strong>250~650 kN</strong>으로 균등 배분하여 <strong>안벽 거리 0.45m 이내</strong>로 4초간 고정하세요.
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
            {stateRef.current.isMoored ? (
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
      <div className="w-full mt-2 grid grid-cols-2 sm:grid-cols-4 gap-2">
        {stateRef.current.ropes.map((rope, idx) => (
          <div key={idx} className="bg-slate-900/90 border border-slate-800 p-2 sm:p-2.5 rounded-lg flex flex-col justify-between">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-bold text-white truncate">{rope.shortName}</span>
              <span className={`text-[10px] font-bold tabular-nums ${rope.tensionKN > 700 ? "text-rose-400 animate-pulse" : rope.tensionKN >= 250 && rope.tensionKN <= 650 ? "text-emerald-400" : "text-amber-400"}`}>
                {Math.round(rope.tensionKN)} kN
              </span>
            </div>
            <div className="flex gap-1 mt-0.5">
              <button
                onClick={() => adjustRopeTension(idx, 80)}
                className="flex-1 py-1 bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs rounded-md active:scale-95 transition-all shadow-sm"
              >
                당김 [+{idx + 1}]
              </button>
              <button
                onClick={() => adjustRopeTension(idx, -80)}
                className="flex-1 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs rounded-md active:scale-95 transition-all border border-slate-700"
              >
                풀기
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
