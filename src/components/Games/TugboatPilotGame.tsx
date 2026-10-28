import React, { useState, useEffect, useRef } from "react";
import { Play, RotateCcw, Volume2, VolumeX, Compass, Anchor, Navigation, ShieldAlert, Award, Wind, Gauge, ChevronRight } from "lucide-react";
import { gameAudio } from "../../lib/gameSounds";

interface TugboatPilotGameProps {
  onFinish: (score: number) => void;
}

interface TugState {
  thrust: number; // -1 to 1
  angle: number;  // radians relative to ship
  x: number;
  y: number;
  hp: number;     // horsepower label
}

export default function TugboatPilotGame({ onFinish }: TugboatPilotGameProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [stage, setStage] = useState(1);
  const [score, setScore] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [stageCleared, setStageCleared] = useState(false);
  const [isMuted, setIsMuted] = useState(gameAudio.getMuted());
  const [activeTugId, setActiveTugId] = useState<"bow" | "stern">("bow");
  const [telemetry, setTelemetry] = useState({
    speedKts: 0,
    angleDeg: 0,
    distMeters: 100,
    windKnots: 12,
    currentKts: 1.5,
  });

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Ship and harbor simulation state (persists across tug switches)
  const simRef = useRef({
    ship: {
      x: 120,
      y: 220,
      vx: 0.15,
      vy: 0.05,
      angle: 0.05,
      angularVelocity: 0,
      length: 155,
      width: 36,
      mass: 8000,
    },
    tugBow: {
      thrust: 0,
      angle: 0,
      x: 0,
      y: 0,
      hp: 7500,
    } as TugState,
    tugStern: {
      thrust: 0,
      angle: 0,
      x: 0,
      y: 0,
      hp: 6000,
    } as TugState,
    current: { x: 0.12, y: 0.06 },
    wind: { x: 0.1, y: -0.05, knots: 14 },
    berth: { x: 440, y: 140, width: 44, height: 180 },
    obstacles: [] as { x: number; y: number; r: number; label?: string }[],
    score: 0,
    time: 0,
    stableDockTimer: 0,
    waterParticles: [] as Array<{ x: number; y: number; vx: number; vy: number; life: number; maxLife: number; size: number; alpha: number }>,
    activeTug: "bow" as "bow" | "stern",
  });

  // Keep ref in sync without triggering effects
  useEffect(() => {
    simRef.current.activeTug = activeTugId;
  }, [activeTugId]);

  const toggleSound = () => {
    const muted = gameAudio.toggleMute();
    setIsMuted(muted);
  };

  const setupStageData = (stg: number, w: number, h: number) => {
    const s = simRef.current;
    s.time = 0;
    s.stableDockTimer = 0;
    s.waterParticles = [];

    // Target berth is along the right quay wall
    const quayWallX = w - 48;
    s.berth = {
      x: quayWallX - 42,
      y: h / 2 - 90,
      width: 42,
      height: 180,
    };

    // Position ship on the left / outer fairway
    s.ship.x = 110;
    s.ship.y = h / 2 + (stg === 2 ? 60 : stg === 3 ? -50 : 20);
    s.ship.vx = 0.12;
    s.ship.vy = 0.04;
    s.ship.angle = (stg === 2 ? -0.18 : stg === 3 ? 0.22 : 0.04);
    s.ship.angularVelocity = 0;

    // Reset tug thrusters
    s.tugBow.thrust = 0;
    s.tugBow.angle = 0;
    s.tugStern.thrust = 0;
    s.tugStern.angle = 0;

    if (stg === 1) {
      // Stage 1: Mild weather, harbor navigation with entrance buoys
      s.current = { x: 0.09, y: 0.04 };
      s.wind = { x: 0.06, y: -0.04, knots: 10 };
      s.obstacles = [
        { x: w * 0.42, y: h * 0.22, r: 16, label: "북등부표 #1" },
        { x: w * 0.48, y: h * 0.78, r: 16, label: "남등부표 #2" },
      ];
    } else if (stg === 2) {
      // Stage 2: Strong tidal ebb current & breakwater spit
      s.current = { x: 0.16, y: -0.14 };
      s.wind = { x: -0.1, y: 0.16, knots: 18 };
      s.obstacles = [
        { x: w * 0.36, y: h * 0.28, r: 18, label: "암초주의 #A" },
        { x: w * 0.54, y: h * 0.72, r: 20, label: "남측방파제" },
        { x: w * 0.65, y: h * 0.24, r: 18, label: "준설작업선" },
      ];
    } else {
      // Stage 3: Night gale & tight quay docking
      s.current = { x: 0.22, y: 0.18 };
      s.wind = { x: 0.2, y: -0.22, knots: 24 };
      s.obstacles = [
        { x: w * 0.32, y: h * 0.22, r: 20, label: "외항부표" },
        { x: w * 0.46, y: h * 0.8, r: 22, label: "계류바지선" },
        { x: w * 0.64, y: h * 0.42, r: 22, label: "해상크레인" },
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

    simRef.current.score = 0;
    const canvas = canvasRef.current;
    if (canvas) {
      const rect = canvas.getBoundingClientRect();
      setupStageData(1, rect.width, rect.height);
    }
  };

  // Adjust active tugboat thrust and azimuth angle
  const adjustTug = (dThrust: number, dAngle: number) => {
    if (!isPlaying || gameOver || stageCleared) return;
    const s = simRef.current;
    const tug = s.activeTug === "bow" ? s.tugBow : s.tugStern;

    tug.thrust = Math.max(-1, Math.min(1, tug.thrust + dThrust));
    tug.angle += dAngle;
    gameAudio.playValveTurn();
  };

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isPlaying || gameOver || stageCleared) return;

      if (e.key === "ArrowUp" || e.key === "w" || e.key === "W") {
        e.preventDefault();
        adjustTug(0.25, 0);
      } else if (e.key === "ArrowDown" || e.key === "s" || e.key === "S") {
        e.preventDefault();
        adjustTug(-0.25, 0);
      } else if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") {
        e.preventDefault();
        adjustTug(0, -0.2);
      } else if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") {
        e.preventDefault();
        adjustTug(0, 0.2);
      } else if (e.key === "Tab") {
        e.preventDefault();
        setActiveTugId((prev) => (prev === "bow" ? "stern" : "bow"));
        gameAudio.playClick();
      } else if (e.key === "1") {
        setActiveTugId("bow");
        gameAudio.playClick();
      } else if (e.key === "2") {
        setActiveTugId("stern");
        gameAudio.playClick();
      } else if (e.key === " ") {
        // Emergency all-stop thrust
        simRef.current.tugBow.thrust = 0;
        simRef.current.tugStern.thrust = 0;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isPlaying, gameOver, stageCleared]);

  // Main game loop (Only depends on isPlaying, gameOver, stageCleared, stage)
  // CRITICAL: activeTugId is explicitly EXCLUDED from dependencies so tug switching NEVER resets the ship!
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

    setupStageData(stage, w, h);

    let animId: number;
    let lastTime = performance.now();
    let telemetryThrottle = 0;

    const loop = (now: number) => {
      const dt = Math.min((now - lastTime) / 1000, 0.05);
      lastTime = now;
      const s = simRef.current;
      s.time += dt;

      const ship = s.ship;

      // Calculate Tugboat Attachment Points
      // Bow tug is connected to ship's bow stem, Stern tug to poop deck
      const halfL = ship.length * 0.44;
      const bowX = ship.x + Math.cos(ship.angle) * halfL;
      const bowY = ship.y + Math.sin(ship.angle) * halfL;
      const sternX = ship.x - Math.cos(ship.angle) * halfL;
      const sternY = ship.y - Math.sin(ship.angle) * halfL;

      // Update tug locations (towed along with realistic cable offset)
      const cableLen = 28;
      const bowTugAngle = ship.angle + s.tugBow.angle;
      const sternTugAngle = ship.angle + s.tugStern.angle;

      s.tugBow.x = bowX + Math.cos(bowTugAngle) * cableLen;
      s.tugBow.y = bowY + Math.sin(bowTugAngle) * cableLen;
      s.tugStern.x = sternX - Math.cos(sternTugAngle) * cableLen;
      s.tugStern.y = sternY - Math.sin(sternTugAngle) * cableLen;

      // Forces from Tug 1 (선수 7,500 HP)
      const f1Mag = s.tugBow.thrust * 48;
      const f1x = Math.cos(bowTugAngle) * f1Mag;
      const f1y = Math.sin(bowTugAngle) * f1Mag;

      // Forces from Tug 2 (선미 6,000 HP)
      const f2Mag = s.tugStern.thrust * 40;
      const f2x = -Math.cos(sternTugAngle) * f2Mag;
      const f2y = -Math.sin(sternTugAngle) * f2Mag;

      // Environmental forces (Tidal current + Wind against giant hull windage)
      const windForceX = s.wind.x * 22;
      const windForceY = s.wind.y * 22;
      const currentForceX = s.current.x * 30;
      const currentForceY = s.current.y * 30;

      const totalFx = f1x + f2x + windForceX + currentForceX;
      const totalFy = f1y + f2y + windForceY + currentForceY;

      // Torque = r x F
      // Bow torque
      const r1x = bowX - ship.x;
      const r1y = bowY - ship.y;
      const torque1 = r1x * f1y - r1y * f1x;

      // Stern torque
      const r2x = sternX - ship.x;
      const r2y = sternY - ship.y;
      const torque2 = r2x * f2y - r2y * f2x;

      // Wind yaw moment
      const windTorque = (Math.sin(ship.angle) * windForceX - Math.cos(ship.angle) * windForceY) * 15;
      const netTorque = (torque1 + torque2 + windTorque) * 0.00028;

      // Update linear & angular velocities with realistic hydrodynamic resistance
      ship.vx += (totalFx * 0.012) * dt;
      ship.vy += (totalFy * 0.012) * dt;

      // Lateral drag is much higher than longitudinal drag for ships
      const fwdX = Math.cos(ship.angle);
      const fwdY = Math.sin(ship.angle);
      const fwdSpeed = ship.vx * fwdX + ship.vy * fwdY;
      const latSpeed = ship.vx * (-fwdY) + ship.vy * fwdX;

      const fwdDamped = fwdSpeed * Math.pow(0.97, dt * 60);
      const latDamped = latSpeed * Math.pow(0.88, dt * 60); // water resists sideways drift

      ship.vx = fwdDamped * fwdX - latDamped * fwdY;
      ship.vy = fwdDamped * fwdY + latDamped * fwdX;

      ship.angularVelocity += netTorque * dt;
      ship.angularVelocity *= Math.pow(0.93, dt * 60); // rotational water damping

      ship.x += ship.vx * 60 * dt;
      ship.y += ship.vy * 60 * dt;
      ship.angle += ship.angularVelocity * dt;

      // Spawn propeller water wake particles from active thrust
      if (Math.abs(s.tugBow.thrust) > 0.1) {
        s.waterParticles.push({
          x: s.tugBow.x - Math.cos(bowTugAngle) * 12,
          y: s.tugBow.y - Math.sin(bowTugAngle) * 12,
          vx: -Math.cos(bowTugAngle) * (s.tugBow.thrust * 40) + (Math.random() - 0.5) * 10,
          vy: -Math.sin(bowTugAngle) * (s.tugBow.thrust * 40) + (Math.random() - 0.5) * 10,
          life: 0,
          maxLife: 0.6 + Math.random() * 0.4,
          size: 3 + Math.random() * 4,
          alpha: 0.8,
        });
      }
      if (Math.abs(s.tugStern.thrust) > 0.1) {
        s.waterParticles.push({
          x: s.tugStern.x + Math.cos(sternTugAngle) * 12,
          y: s.tugStern.y + Math.sin(sternTugAngle) * 12,
          vx: Math.cos(sternTugAngle) * (s.tugStern.thrust * 40) + (Math.random() - 0.5) * 10,
          vy: Math.sin(sternTugAngle) * (s.tugStern.thrust * 40) + (Math.random() - 0.5) * 10,
          life: 0,
          maxLife: 0.6 + Math.random() * 0.4,
          size: 3 + Math.random() * 4,
          alpha: 0.8,
        });
      }

      // Update water particles
      for (let i = s.waterParticles.length - 1; i >= 0; i--) {
        const p = s.waterParticles[i];
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.life += dt;
        p.alpha = Math.max(0, 1 - p.life / p.maxLife);
        p.size += dt * 4;
        if (p.life >= p.maxLife) {
          s.waterParticles.splice(i, 1);
        }
      }

      // Telemetry update (throttled for UI smoothness)
      telemetryThrottle += dt;
      if (telemetryThrottle > 0.1) {
        telemetryThrottle = 0;
        const currentSpeedKts = +(Math.hypot(ship.vx, ship.vy) * 2.8).toFixed(2);
        const deg = +((ship.angle * 180 / Math.PI) % 360).toFixed(1);
        const distToBerth = Math.max(0, Math.round(s.berth.x - (ship.x + ship.length * 0.45)));
        setTelemetry({
          speedKts: currentSpeedKts,
          angleDeg: deg,
          distMeters: distToBerth,
          windKnots: s.wind.knots,
          currentKts: +(Math.hypot(s.current.x, s.current.y) * 12).toFixed(1),
        });
      }

      // ---------------- COLLISIONS & DOCKING VALIDATION ----------------
      // 1. Obstacle collision
      for (const obs of s.obstacles) {
        const d = Math.hypot(ship.x - obs.x, ship.y - obs.y);
        if (d < obs.r + ship.width * 0.55) {
          gameAudio.playBomb();
          setGameOver(true);
          setIsPlaying(false);
          onFinish(s.score);
          return;
        }
      }

      // 2. Outer basin boundary collisions
      if (ship.y < 35 || ship.y > h - 35 || ship.x < 30) {
        // Grounding on mudflats
        gameAudio.playDrop();
        gameAudio.playBomb();
        setGameOver(true);
        setIsPlaying(false);
        onFinish(s.score);
        return;
      }

      // 3. Right Quay Pier Wall Contact
      const quayWallX = w - 48;
      const shipRightEdge = ship.x + Math.cos(ship.angle) * (ship.length * 0.46);

      if (shipRightEdge >= s.berth.x) {
        const speedKts = Math.hypot(ship.vx, ship.vy) * 2.8;
        const inBerthY = ship.y >= s.berth.y - 15 && ship.y <= s.berth.y + s.berth.height + 15;
        // Ship angle must be parallel to pier (angle close to 0 or 180 deg)
        const angleNorm = Math.abs(ship.angle % Math.PI);
        const isParallel = angleNorm < 0.12 || Math.abs(angleNorm - Math.PI) < 0.12;

        if (inBerthY && isParallel && speedKts <= 0.45) {
          // Soft fender compression: require holding position for 1.5 seconds!
          s.stableDockTimer += dt;
          s.ship.vx *= 0.85;
          s.ship.vy *= 0.85;

          if (s.stableDockTimer >= 1.5) {
            // Successful Safe Berthing!
            gameAudio.playShipHorn();
            gameAudio.playVictory();
            const stageBonus = 2000 - Math.round(s.time * 12);
            s.score += Math.max(800, stageBonus);
            setScore(s.score);

            if (stage >= 3) {
              setGameOver(true);
              setIsPlaying(false);
              onFinish(s.score);
            } else {
              setStageCleared(true);
            }
            return;
          }
        } else {
          // Hard Quay Impact / Fender crushed
          gameAudio.playDrop();
          gameAudio.playBomb();
          setGameOver(true);
          setIsPlaying(false);
          onFinish(s.score);
          return;
        }
      } else {
        s.stableDockTimer = 0;
      }

      // ---------------- RENDER ----------------
      ctx.clearRect(0, 0, w, h);

      // 1. Sea Water Background with Bathymetry Gradient
      const oceanGrad = ctx.createLinearGradient(0, 0, w, h);
      if (stage === 3) {
        // Night harbor
        oceanGrad.addColorStop(0, "#031526");
        oceanGrad.addColorStop(0.6, "#051f38");
        oceanGrad.addColorStop(1, "#072b4c");
      } else {
        oceanGrad.addColorStop(0, "#082f49");
        oceanGrad.addColorStop(0.5, "#0c4a6e");
        oceanGrad.addColorStop(1, "#0369a1");
      }
      ctx.fillStyle = oceanGrad;
      ctx.fillRect(0, 0, w, h);

      // Sea Current Flow Streamlines
      ctx.strokeStyle = stage === 3 ? "rgba(56, 189, 248, 0.15)" : "rgba(255, 255, 255, 0.14)";
      ctx.lineWidth = 1.2;
      for (let cx = 50; cx < w - 70; cx += 80) {
        for (let cy = 40; cy < h; cy += 65) {
          const flowX = cx + Math.sin(now * 0.002 + cy * 0.05) * 5;
          ctx.beginPath();
          ctx.moveTo(flowX, cy);
          ctx.lineTo(flowX + s.current.x * 70, cy + s.current.y * 70);
          ctx.stroke();
          // Arrowhead
          const tipX = flowX + s.current.x * 70;
          const tipY = cy + s.current.y * 70;
          ctx.fillStyle = ctx.strokeStyle;
          ctx.beginPath();
          ctx.arc(tipX, tipY, 2, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Propeller wake particles
      for (const p of s.waterParticles) {
        ctx.fillStyle = `rgba(255, 255, 255, ${p.alpha})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }

      // 2. Concrete Outfitting Quay (의장안벽) on Right Edge
      ctx.fillStyle = "#334155";
      ctx.fillRect(quayWallX, 0, w - quayWallX, h);
      ctx.fillStyle = "#1e293b";
      ctx.fillRect(quayWallX - 4, 0, 4, h);

      // Hazard Stripes along Quay Edge
      for (let sy = 0; sy < h; sy += 26) {
        ctx.fillStyle = (sy / 26) % 2 === 0 ? "#facc15" : "#0f172a";
        ctx.fillRect(quayWallX - 10, sy, 6, 26);
      }

      // Giant Gantry / Outfitting Jib Cranes along the Pier
      ctx.fillStyle = "#0284c7";
      ctx.fillRect(quayWallX + 8, h * 0.25 - 15, 20, 30);
      ctx.fillRect(quayWallX + 8, h * 0.7 - 15, 20, 30);
      // Crane jibs extending toward water
      ctx.strokeStyle = "#38bdf8";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(quayWallX + 18, h * 0.25);
      ctx.lineTo(quayWallX - 12, h * 0.25);
      ctx.moveTo(quayWallX + 18, h * 0.7);
      ctx.lineTo(quayWallX - 12, h * 0.7);
      ctx.stroke();

      // Mooring Bollards on Quay
      for (let by = s.berth.y - 30; by <= s.berth.y + s.berth.height + 30; by += 35) {
        ctx.fillStyle = "#e2e8f0";
        ctx.beginPath();
        ctx.arc(quayWallX + 4, by, 4, 0, Math.PI * 2);
        ctx.fill();
      }

      // Rubber Fenders (Yokohama Pneumatic Fenders)
      const fenderCount = 6;
      for (let i = 0; i <= fenderCount; i++) {
        const fy = s.berth.y + (s.berth.height / fenderCount) * i;
        ctx.fillStyle = "#09090b";
        ctx.beginPath();
        ctx.roundRect(quayWallX - 16, fy - 7, 12, 14, 4);
        ctx.fill();
        ctx.strokeStyle = "#71717a";
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      // Target Berth Slot Indicator
      const b = s.berth;
      const isReadyToDock = s.stableDockTimer > 0;
      ctx.fillStyle = isReadyToDock ? "rgba(16, 185, 129, 0.35)" : "rgba(14, 165, 233, 0.18)";
      ctx.fillRect(b.x - 10, b.y, b.width + 10, b.height);
      ctx.strokeStyle = isReadyToDock ? "#10b981" : "#38bdf8";
      ctx.lineWidth = 2.5;
      ctx.setLineDash([8, 6]);
      ctx.strokeRect(b.x - 10, b.y, b.width + 10, b.height);
      ctx.setLineDash([]);

      // Berth label & Alignment markers
      ctx.fillStyle = isReadyToDock ? "#34d399" : "#bae6fd";
      ctx.font = "bold 11px sans-serif";
      ctx.fillText(
        isReadyToDock ? `안벽 접현 중... ${(s.stableDockTimer / 1.5 * 100).toFixed(0)}%` : "HD현대삼호 제1의장안벽",
        b.x - 14,
        b.y - 12
      );

      // 3. Navigation Buoys / Obstacles
      for (const obs of s.obstacles) {
        // Warning ripple
        ctx.strokeStyle = "rgba(255, 255, 255, 0.25)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(obs.x, obs.y, obs.r + 6, 0, Math.PI * 2);
        ctx.stroke();

        // Buoy body
        ctx.fillStyle = "#ea580c";
        ctx.beginPath();
        ctx.arc(obs.x, obs.y, obs.r, 0, Math.PI * 2);
        ctx.fill();

        // Flashing navigation beacon
        const beaconOn = Math.sin(now / 180 + obs.x) > 0.2;
        ctx.fillStyle = beaconOn ? "#fef08a" : "#78350f";
        ctx.beginPath();
        ctx.arc(obs.x, obs.y, obs.r * 0.45, 0, Math.PI * 2);
        ctx.fill();

        if (obs.label) {
          ctx.fillStyle = "#cbd5e1";
          ctx.font = "bold 9px sans-serif";
          ctx.fillText(obs.label, obs.x - 20, obs.y + obs.r + 14);
        }
      }

      // 4. Draw 300,000 DWT VLCC Supertanker
      ctx.save();
      ctx.translate(ship.x, ship.y);
      ctx.rotate(ship.angle);

      // Hull Shadow
      ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
      ctx.fillRect(-ship.length / 2 + 6, -ship.width / 2 + 6, ship.length, ship.width);

      // Main Deck (Anti-fouling red + dark grey catwalks)
      ctx.fillStyle = "#991b1b";
      ctx.beginPath();
      // Pointy bulbous bow shape
      ctx.moveTo(ship.length / 2 + 8, 0);
      ctx.lineTo(ship.length / 2 - 20, -ship.width / 2);
      ctx.lineTo(-ship.length / 2, -ship.width / 2);
      ctx.lineTo(-ship.length / 2, ship.width / 2);
      ctx.lineTo(ship.length / 2 - 20, ship.width / 2);
      ctx.closePath();
      ctx.fill();

      // Outer hull boundary line
      ctx.strokeStyle = "#450a0a";
      ctx.lineWidth = 2;
      ctx.stroke();

      // Deck Cargo Manifold & Piping Grid
      ctx.strokeStyle = "#475569";
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(-ship.length / 2 + 30, 0);
      ctx.lineTo(ship.length / 2 - 28, 0);
      ctx.stroke();

      // Cargo tank hatches (화물창 맨홀)
      for (let tx = -ship.length / 2 + 36; tx < ship.length / 2 - 36; tx += 24) {
        ctx.fillStyle = "#334155";
        ctx.fillRect(tx - 4, -8, 8, 16);
      }

      // Superstructure & Navigation Bridge Tower at Stern
      ctx.fillStyle = "#f8fafc";
      ctx.fillRect(-ship.length / 2 + 10, -ship.width / 2 + 4, 28, ship.width - 8);
      // Bridge navigation windows (blue glass)
      ctx.fillStyle = "#0284c7";
      ctx.fillRect(-ship.length / 2 + 24, -ship.width / 2 + 7, 8, ship.width - 14);

      // Funnel (HD Modern Green & Orange Accent)
      ctx.fillStyle = "#002C6C";
      ctx.fillRect(-ship.length / 2 + 12, -6, 10, 12);
      ctx.fillStyle = "#00A352";
      ctx.fillRect(-ship.length / 2 + 18, -4, 4, 8);

      // Ship Name on Bow Deck
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 9px sans-serif";
      ctx.fillText("HD SAMHO VLCC", -25, 3);

      ctx.restore();

      // 5. Towlines (High-strength Dyneema / Steel Wire Ropes)
      ctx.strokeStyle = "#f8fafc";
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 3]);

      // Bow Towline
      ctx.beginPath();
      ctx.moveTo(bowX, bowY);
      ctx.lineTo(s.tugBow.x, s.tugBow.y);
      ctx.stroke();

      // Stern Towline
      ctx.beginPath();
      ctx.moveTo(sternX, sternY);
      ctx.lineTo(s.tugStern.x, s.tugStern.y);
      ctx.stroke();
      ctx.setLineDash([]);

      // 6. Draw Tugboats with 360° Azimuth Pod Vectors
      drawTugboat(
        ctx,
        s.tugBow.x,
        s.tugBow.y,
        bowTugAngle,
        s.tugBow.thrust,
        s.activeTug === "bow",
        "1호기 (선수 7,500HP)",
        "#f97316"
      );

      drawTugboat(
        ctx,
        s.tugStern.x,
        s.tugStern.y,
        sternTugAngle,
        s.tugStern.thrust,
        s.activeTug === "stern",
        "2호기 (선미 6,000HP)",
        "#0ea5e9"
      );

      // 7. Night Mode Lighting Effects
      if (stage === 3) {
        // Darkness scrim
        ctx.fillStyle = "rgba(0, 5, 20, 0.45)";
        ctx.fillRect(0, 0, w, h);

        // Tug searchlight beams toward ship
        drawSearchlight(ctx, s.tugBow.x, s.tugBow.y, bowTugAngle - Math.PI);
        drawSearchlight(ctx, s.tugStern.x, s.tugStern.y, sternTugAngle);
      }

      animId = requestAnimationFrame(loop);
    };

    animId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animId);
  }, [isPlaying, gameOver, stageCleared, stage]);

  const drawSearchlight = (ctx: CanvasRenderingContext2D, x: number, y: number, angle: number) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    const grad = ctx.createRadialGradient(0, 0, 5, 120, 0, 90);
    grad.addColorStop(0, "rgba(255, 255, 220, 0.8)");
    grad.addColorStop(0.3, "rgba(255, 255, 200, 0.3)");
    grad.addColorStop(1, "rgba(255, 255, 200, 0)");

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, 140, -0.3, 0.3);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  };

  const drawTugboat = (
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    angle: number,
    thrust: number,
    isActive: boolean,
    label: string,
    hullColor: string
  ) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);

    // Active Selection Ring with Pulsing Glow
    if (isActive) {
      ctx.strokeStyle = "#38bdf8";
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(0, 0, 22, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = "rgba(56, 189, 248, 0.18)";
      ctx.beginPath();
      ctx.arc(0, 0, 20, 0, Math.PI * 2);
      ctx.fill();
    }

    // Heavy ASD Tugboat Hull (Bulbous Rounded Stern workboat)
    ctx.fillStyle = hullColor;
    ctx.beginPath();
    ctx.ellipse(0, 0, 16, 9, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Heavy Rubber Fender on Bow
    ctx.fillStyle = "#18181b";
    ctx.fillRect(10, -7, 6, 14);

    // Wheelhouse Cabin
    ctx.fillStyle = "#f8fafc";
    ctx.fillRect(-6, -5, 10, 10);
    ctx.fillStyle = "#0284c7";
    ctx.fillRect(-1, -4, 4, 8);

    // Towing Winch Drum
    ctx.fillStyle = "#71717a";
    ctx.beginPath();
    ctx.arc(-8, 0, 3, 0, Math.PI * 2);
    ctx.fill();

    // Thrust Vector Direction Indicator
    if (Math.abs(thrust) > 0.05) {
      const vectorLen = thrust * 28;
      ctx.strokeStyle = thrust > 0 ? "#22c55e" : "#ef4444";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(vectorLen, 0);
      ctx.stroke();
    }

    ctx.restore();

    // Tugboat HUD Label with Horsepower and Thrust Meter
    ctx.fillStyle = isActive ? "#38bdf8" : "#94a3b8";
    ctx.font = "bold 10px sans-serif";
    ctx.fillText(label, x - 28, y - 24);

    // Thrust Bar
    const barW = 32;
    const barH = 4;
    ctx.fillStyle = "rgba(15, 23, 42, 0.7)";
    ctx.fillRect(x - barW / 2, y - 20, barW, barH);
    ctx.fillStyle = thrust > 0 ? "#22c55e" : thrust < 0 ? "#ef4444" : "#64748b";
    ctx.fillRect(x - barW / 2, y - 20, barW * Math.abs(thrust), barH);
  };

  return (
    <div className="w-full max-w-5xl mx-auto flex flex-col items-center select-none font-sans">
      {/* Top Telemetry Header */}
      <div className="w-full bg-slate-900 border border-slate-800 text-white px-5 py-3 rounded-2xl flex flex-wrap items-center justify-between gap-4 shadow-xl mb-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-sky-600 flex items-center justify-center shadow-lg shadow-sky-500/20">
            <Compass className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-black text-base sm:text-lg text-white">영암호 초대형선 예인 파일럿</h3>
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-sky-500/20 text-sky-400 border border-sky-500/30">
                구역 {stage}/3
              </span>
            </div>
            <p className="text-xs text-slate-400 font-medium">
              선수·선미 예인선 추력 벡터를 조타하여 30만 톤급 선박을 안벽에 감속 평행 접안하세요.
            </p>
          </div>
        </div>

        {/* Live Gauges */}
        <div className="flex items-center gap-4 text-xs font-semibold">
          <div className="bg-slate-800/80 px-3 py-1.5 rounded-xl border border-slate-700/60">
            <span className="text-slate-400 block text-[10px]">선박 접근 속도</span>
            <span className={`text-base font-black ${telemetry.speedKts > 0.45 ? "text-rose-400" : "text-emerald-400"}`}>
              {telemetry.speedKts} kts
            </span>
          </div>

          <div className="bg-slate-800/80 px-3 py-1.5 rounded-xl border border-slate-700/60">
            <span className="text-slate-400 block text-[10px]">선체 평행 각도</span>
            <span className={`text-base font-black ${Math.abs(telemetry.angleDeg % 180) > 6 ? "text-amber-400" : "text-sky-400"}`}>
              {telemetry.angleDeg}°
            </span>
          </div>

          <div className="bg-slate-800/80 px-3 py-1.5 rounded-xl border border-slate-700/60">
            <span className="text-slate-400 block text-[10px]">하버 스코어</span>
            <span className="text-base font-black text-sky-400">
              {score.toLocaleString()}점
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

      {/* Main Canvas Viewport */}
      <div className="w-full relative rounded-2xl overflow-hidden border border-slate-800 shadow-2xl bg-slate-950 aspect-[16/9] min-h-[400px] flex items-center justify-center">
        <canvas ref={canvasRef} className="w-full h-full" />

        {/* Start Overlay */}
        {!isPlaying && !gameOver && !stageCleared && (
          <div className="absolute inset-0 bg-slate-950/85 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center z-20">
            <div className="w-16 h-16 rounded-2xl bg-sky-500/20 border border-sky-500/40 flex items-center justify-center mb-4 text-sky-400 shadow-xl shadow-sky-500/10">
              <Anchor className="w-8 h-8" />
            </div>
            <h2 className="text-2xl sm:text-3xl font-black text-white mb-2">하버 예인선 실시간 정밀 도킹</h2>
            <p className="text-slate-300 text-sm max-w-lg mb-6 leading-relaxed">
              가만히 있으면 거센 조류와 돌풍에 의해 선박이 암초나 방파제에 좌초됩니다!<br />
              <strong>TAB키 또는 버튼</strong>으로 선수 1호기 / 선미 2호기를 전환하고,<br />
              <strong>방향키 (W,A,S,D)</strong>로 360° 추력을 조타하여 안벽 녹색 구역에 <strong>0.45 kts 이하</strong>로 정밀 접안하세요.
            </p>
            <button
              onClick={startGame}
              className="px-8 py-3.5 bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-600 hover:to-blue-700 text-white font-black text-base rounded-xl shadow-lg shadow-sky-500/25 active:scale-95 transition-all flex items-center gap-2"
            >
              <Play className="w-5 h-5 fill-white" />
              예인선 하버 작전 출항
            </button>
          </div>
        )}

        {/* Stage Cleared */}
        {stageCleared && (
          <div className="absolute inset-0 bg-slate-950/85 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center z-20 animate-in fade-in zoom-in-95 duration-200">
            <div className="w-16 h-16 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center mb-3 text-emerald-400">
              <Award className="w-9 h-9" />
            </div>
            <h3 className="text-2xl font-black text-white mb-1">
              구역 {stage} 무사고 안벽 완벽 접안 성공!
            </h3>
            <p className="text-slate-300 text-sm mb-4">
              안전 접근 속도 준수 및 요코하마 펜더 완충 안착으로 하버 안전 등급 A+를 획득했습니다.
            </p>
            <button
              onClick={() => {
                setStageCleared(false);
                setStage(stage + 1);
              }}
              className="px-7 py-3 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-slate-950 font-black text-sm rounded-xl shadow-lg shadow-emerald-500/25 active:scale-95 transition-all flex items-center gap-2"
            >
              다음 구역 ({stage + 1}/3) 항해 출항
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Game Over */}
        {gameOver && (
          <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center z-20 animate-in fade-in zoom-in-95 duration-200">
            <div className="w-16 h-16 rounded-2xl bg-rose-500/20 border border-rose-500/40 flex items-center justify-center mb-3 text-rose-400">
              <ShieldAlert className="w-9 h-9" />
            </div>
            <h3 className="text-2xl font-black text-white mb-1">선체 접촉 사고 / 좌초 발생</h3>
            <p className="text-slate-300 text-sm mb-4">
              안벽 진입 속도 초과(0.45 kts 이상 충격) 또는 조류 표류로 예인 작전이 실패했습니다.
            </p>
            <div className="bg-slate-900 border border-slate-800 px-6 py-3 rounded-2xl text-center mb-6">
              <span className="text-xs text-slate-400 block mb-0.5">최종 하버 스코어</span>
              <span className="text-2xl font-black text-sky-400">{score.toLocaleString()}점</span>
            </div>
            <button
              onClick={startGame}
              className="px-7 py-3 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white font-bold text-sm rounded-xl active:scale-95 transition-all flex items-center gap-2"
            >
              <RotateCcw className="w-4 h-4" />
              예인 작전 재도전
            </button>
          </div>
        )}
      </div>

      {/* Interactive ASD Tugboat Flight Deck Controls */}
      <div className="w-full mt-3 bg-slate-900/90 border border-slate-800 p-3.5 rounded-2xl flex flex-wrap items-center justify-between gap-4">
        {/* Tugboat Selector (Switching keeps continuous ship state!) */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setActiveTugId("bow");
              gameAudio.playClick();
            }}
            className={`px-4 py-2.5 rounded-xl text-xs font-black transition-all flex items-center gap-2 ${
              activeTugId === "bow"
                ? "bg-gradient-to-r from-orange-500 to-amber-600 text-white shadow-lg shadow-orange-500/30 scale-105"
                : "bg-slate-800 text-slate-400 hover:text-white"
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
            선수 1호기 (7,500 HP)
          </button>
          <button
            onClick={() => {
              setActiveTugId("stern");
              gameAudio.playClick();
            }}
            className={`px-4 py-2.5 rounded-xl text-xs font-black transition-all flex items-center gap-2 ${
              activeTugId === "stern"
                ? "bg-gradient-to-r from-sky-500 to-blue-600 text-white shadow-lg shadow-sky-500/30 scale-105"
                : "bg-slate-800 text-slate-400 hover:text-white"
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
            선미 2호기 (6,000 HP)
          </button>
          <span className="text-[11px] text-slate-400 hidden lg:inline ml-2 font-medium">
            (TAB키 / 숫자 1,2키로 즉시 전환)
          </span>
        </div>

        {/* Precision Azimuth Thruster Steering Controls */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => adjustTug(0, -0.25)}
            className="px-3 py-2 bg-slate-800 hover:bg-slate-700 rounded-xl text-white font-bold text-xs active:scale-95 transition-all border border-slate-700"
            title="좌현 360° 선회 조타 (A/Left)"
          >
            ◀ 좌조타
          </button>
          <button
            onClick={() => adjustTug(0.25, 0)}
            className="px-3.5 py-2 bg-sky-600 hover:bg-sky-500 rounded-xl text-white font-bold text-xs active:scale-95 transition-all shadow-md shadow-sky-600/20"
            title="추력 증속 (W/Up)"
          >
            ▲ 전진 추력
          </button>
          <button
            onClick={() => adjustTug(-0.25, 0)}
            className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 rounded-xl text-white font-bold text-xs active:scale-95 transition-all border border-slate-700"
            title="후진 감속 (S/Down)"
          >
            ▼ 감속/후진
          </button>
          <button
            onClick={() => adjustTug(0, 0.25)}
            className="px-3 py-2 bg-slate-800 hover:bg-slate-700 rounded-xl text-white font-bold text-xs active:scale-95 transition-all border border-slate-700"
            title="우현 360° 선회 조타 (D/Right)"
          >
            우조타 ▶
          </button>
          <button
            onClick={() => {
              simRef.current.tugBow.thrust = 0;
              simRef.current.tugStern.thrust = 0;
              gameAudio.playDrop();
            }}
            className="px-3 py-2 bg-rose-950/80 hover:bg-rose-900 border border-rose-800 text-rose-300 font-bold text-xs rounded-xl active:scale-95 transition-all ml-1"
            title="추력 정지 (Space)"
          >
            추력 중립
          </button>
        </div>
      </div>
    </div>
  );
}
