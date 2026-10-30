import React, { useState, useEffect } from "react";
import {
  X,
  Trophy,
  ChevronDown,
  ChevronUp,
  Anchor,
  Compass,
  Flame,
  Medal,
  Waves,
  Cog,
  Scan,
  Activity,
  ArrowLeftRight,
  Building2,
  Wrench,
  RotateCw,
  Crown,
  Sparkles,
} from "lucide-react";
import { db } from "../../lib/firebase";
import {
  collection,
  query,
  orderBy,
  limit,
  getDocs,
  doc,
  setDoc,
  getDoc,
} from "firebase/firestore";
import { useAppStore } from "../../store/useAppStore";

// 11 Dedicated Shipyard Games
import CraneStackGame from "../Games/CraneStackGame";
import GoliathTurnoverGame from "../Games/GoliathTurnoverGame";
import WeldingMasterGame from "../Games/WeldingMasterGame";
import EngineRoomPipeGame from "../Games/EngineRoomPipeGame";
import HydraulicBoltingGame from "../Games/HydraulicBoltingGame";
import DockWaterGame from "../Games/DockWaterGame";
import TugboatPilotGame from "../Games/TugboatPilotGame";
import AnchorMooringGame from "../Games/AnchorMooringGame";
import PropellerTuneGame from "../Games/PropellerTuneGame";
import LNGTankInspectGame from "../Games/LNGTankInspectGame";
import OceanRunnerGame from "../Games/OceanRunnerGame";

interface GameScore {
  id: string;
  playerName: string;
  score: number;
  timestamp: number;
}

interface GamesModalProps {
  onClose: () => void;
}

const getMonthString = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

const GAME_INFO: Record<string, { title: string; category: string; badge: string }> = {
  crane: { title: "골리앗 크레인 탑재", category: "중장비 & 선체 건조", badge: "대표작" },
  turnover: { title: "900T 블록 턴오버", category: "중장비 & 선체 건조", badge: "물리 연산" },
  welding: { title: "용접 마스터: 비드", category: "중장비 & 선체 건조", badge: "정밀" },
  pipe: { title: "기관실 복합 배관 CAD", category: "중장비 & 선체 건조", badge: "신규" },
  bolting: { title: "엔진·축계 유압 볼팅", category: "중장비 & 선체 건조", badge: "쾌속 리듬" },
  tugboat: { title: "영암호 예인선 파일럿", category: "도크 진수 & 시운전 작전", badge: "조종술" },
  voyager: { title: "영암만 Sea Trial 시운전", category: "도크 진수 & 시운전 작전", badge: "쾌속" },
  dockwater: { title: "드라이도크 안전 진수식", category: "도크 진수 & 시운전 작전", badge: "부력 수위" },
  mooring: { title: "안벽 계류 윈치 & 볼라드", category: "도크 진수 & 시운전 작전", badge: "신규" },
  propeller: { title: "황동 프로펠러 얼라인먼트", category: "도크 진수 & 시운전 작전", badge: "정밀" },
  lnginspect: { title: "LNG 멤브레인 레이저 검사", category: "도크 진수 & 시운전 작전", badge: "초정밀 NDT" },
};

export default function GamesModal({ onClose }: GamesModalProps) {
  const { currentUser, members } = useAppStore();
  const [activeGame, setActiveGame] = useState<string>("crane");
  const [leaderboard, setLeaderboard] = useState<GameScore[]>([]);
  const [loadingBoard, setLoadingBoard] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isMobileBoardOpen, setIsMobileBoardOpen] = useState(false);

  /* Derive player name from logged-in user */
  const currentMember = members.find((m) => m.email === currentUser?.email);
  const extractName = (displayName?: string | null) => {
    if (!displayName) return currentUser?.email?.split("@")[0] || "익명 사용자";
    const parts = displayName.split(" ");
    if (parts.length >= 3 && /^\d+$/.test(parts[0])) return parts[1];
    if (
      parts.length === 2 &&
      ["사원", "대리", "과장", "차장", "부장", "책임", "수석"].includes(parts[1])
    )
      return parts[0];
    const match = displayName.match(/[가-힣]{2,4}/);
    return match ? match[0] : displayName;
  };

  const playerName = currentMember
    ? currentMember.name
    : extractName(currentUser?.displayName);

  const displayPlayerName = (nameOrId?: string) => {
    if (!nameOrId) return "익명 사용자";
    const member = members.find(
      (m) => m.email.split("@")[0] === nameOrId || m.name === nameOrId
    );
    return member ? member.name : nameOrId;
  };

  useEffect(() => {
    fetchLeaderboard(activeGame);
  }, [activeGame]);

  const fetchLeaderboard = async (gameId: string) => {
    setLoadingBoard(true);
    try {
      const monthStr = getMonthString();
      const q = query(
        collection(db, `games/${gameId}/monthly_scores/${monthStr}/scores`),
        orderBy("score", "desc"),
        limit(50)
      );
      const snapshot = await getDocs(q);
      const scores: GameScore[] = [];
      snapshot.forEach((doc) =>
        scores.push({ id: doc.id, ...doc.data() } as GameScore)
      );
      const uniqueScores: GameScore[] = [];
      const seenPlayers = new Set<string>();
      for (const s of scores) {
        if (!seenPlayers.has(s.playerName)) {
          seenPlayers.add(s.playerName);
          uniqueScores.push(s);
          if (uniqueScores.length === 10) break;
        }
      }
      setLeaderboard(uniqueScores);
    } catch (e) {
      console.error("Fetch leaderboard error:", e);
    } finally {
      setLoadingBoard(false);
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await fetchLeaderboard(activeGame);
    setTimeout(() => setIsRefreshing(false), 500);
  };

  const saveScore = async (score: number) => {
    try {
      const docId = currentUser?.email || playerName;
      const monthStr = getMonthString();
      const docRef = doc(db, `games/${activeGame}/monthly_scores/${monthStr}/scores`, docId);
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        const currentScore = docSnap.data().score;
        if (score <= currentScore) {
          fetchLeaderboard(activeGame);
          return;
        }
      }
      await setDoc(docRef, { playerName, score, timestamp: Date.now() });
      fetchLeaderboard(activeGame);
    } catch (e) {
      console.error("Save score error:", e);
    }
  };

  const getScoreFormat = (_gameId: string, val: number) => {
    return `${val.toLocaleString()}점`;
  };

  // Find user's own ranking in current leaderboard
  const myRankIndex = leaderboard.findIndex(
    (s) => s.playerName === playerName || (currentUser?.email && s.id === currentUser.email)
  );
  const myRecord = myRankIndex !== -1 ? leaderboard[myRankIndex] : null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-2 sm:p-3 lg:p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      {/* Expanded modal width: max-w-[98vw] 2xl:max-w-[1580px] xl:max-w-[1460px] lg:max-w-[1340px] to accommodate fixed ranking on the right without invading game screen */}
      <div className="bg-slate-900 rounded-[22px] shadow-2xl w-full max-w-[98vw] 2xl:max-w-[1580px] xl:max-w-[1460px] lg:max-w-[1340px] flex flex-col lg:flex-row overflow-hidden border border-slate-700/80 h-[92vh] max-h-[820px] min-h-[560px] font-hd">
        {/* Compact Sidebar */}
        <div className="w-full lg:w-48 xl:w-52 bg-slate-50 lg:border-r border-b lg:border-b-0 border-gray-200 p-2.5 flex flex-col shrink-0 lg:overflow-y-auto">
          <div className="flex justify-between items-center mb-1 lg:mb-3">
            <h2 className="text-[14px] lg:text-[16px] font-black text-[#002C6C] flex items-center gap-1.5 tracking-tight">
              <Building2 className="w-4 h-4 text-amber-500" />
              HD조선소 아케이드
            </h2>
            <button
              onClick={onClose}
              className="lg:hidden p-1.5 bg-gray-200 rounded-full text-gray-600 active:scale-95"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Game Selection Tabs */}
          <div className="flex flex-row lg:flex-col gap-1 lg:gap-1.5 mb-1 lg:mb-4 overflow-x-auto custom-scrollbar pb-1 lg:pb-0">
            {/* Category 1: 중장비 & 건조 엔지니어링 */}
            <div className="hidden lg:block text-[10px] font-black text-slate-400 px-2 py-0.5 uppercase tracking-wider">
              중장비 & 선체 건조
            </div>
            <GameTab
              id="crane"
              icon={<Anchor className="w-3.5 h-3.5 text-amber-500" />}
              label="골리앗 크레인 탑재"
              badge="대표작"
              active={activeGame}
              onClick={setActiveGame}
            />
            <GameTab
              id="turnover"
              icon={<ArrowLeftRight className="w-3.5 h-3.5 text-orange-500" />}
              label="900T 블록 턴오버"
              badge="물리 연산"
              active={activeGame}
              onClick={setActiveGame}
            />
            <GameTab
              id="welding"
              icon={<Flame className="w-3.5 h-3.5 text-rose-500" />}
              label="용접 마스터: 비드"
              badge="정밀"
              active={activeGame}
              onClick={setActiveGame}
            />
            <GameTab
              id="pipe"
              icon={<Activity className="w-3.5 h-3.5 text-cyan-500" />}
              label="기관실 복합 배관 CAD"
              badge="신규"
              active={activeGame}
              onClick={setActiveGame}
            />
            <GameTab
              id="bolting"
              icon={<Wrench className="w-3.5 h-3.5 text-sky-500" />}
              label="엔진·축계 유압 볼팅"
              badge="쾌속 리듬"
              active={activeGame}
              onClick={setActiveGame}
            />

            {/* Category 2: 시운전 & 도크 항만 작전 */}
            <div className="hidden lg:block text-[10px] font-black text-slate-400 px-2 pt-2 pb-0.5 uppercase tracking-wider border-t border-slate-200 mt-1">
              도크 진수 & 시운전 작전
            </div>
            <GameTab
              id="tugboat"
              icon={<Compass className="w-3.5 h-3.5 text-sky-500" />}
              label="영암호 예인선 파일럿"
              badge="조종술"
              active={activeGame}
              onClick={setActiveGame}
            />
            <GameTab
              id="voyager"
              icon={<Compass className="w-3.5 h-3.5 text-indigo-500" />}
              label="영암만 Sea Trial 시운전"
              badge="쾌속"
              active={activeGame}
              onClick={setActiveGame}
            />
            <GameTab
              id="dockwater"
              icon={<Waves className="w-3.5 h-3.5 text-cyan-500" />}
              label="드라이도크 안전 진수식"
              badge="부력 수위"
              active={activeGame}
              onClick={setActiveGame}
            />
            <GameTab
              id="mooring"
              icon={<Anchor className="w-3.5 h-3.5 text-blue-500" />}
              label="안벽 계류 윈치 & 볼라드"
              badge="신규"
              active={activeGame}
              onClick={setActiveGame}
            />
            <GameTab
              id="propeller"
              icon={<Cog className="w-3.5 h-3.5 text-yellow-500" />}
              label="황동 프로펠러 얼라인먼트"
              badge="정밀"
              active={activeGame}
              onClick={setActiveGame}
            />
            <GameTab
              id="lnginspect"
              icon={<Scan className="w-3.5 h-3.5 text-emerald-500" />}
              label="LNG 멤브레인 레이저 검사"
              badge="초정밀 NDT"
              active={activeGame}
              onClick={setActiveGame}
            />
          </div>

          {/* Current Player Profile Footer */}
          <div className="mt-auto hidden lg:block bg-white p-2.5 rounded-[12px] border border-gray-200 shadow-sm">
            <div className="text-[10px] font-bold text-gray-400 mb-0.5">현재 플레이어</div>
            <div className="text-[13px] font-black text-[#1D1D1F] flex items-center justify-between">
              <span className="truncate">{playerName}</span>
              <span className="text-[9px] bg-blue-100 text-[#007AFF] px-1.5 py-0.5 rounded-full font-bold">
                동반성장부
              </span>
            </div>
          </div>
        </div>

        {/* Main Game Screen */}
        <div className="flex-1 flex flex-col bg-slate-950 relative h-full min-h-0 min-w-0 overflow-hidden">
          {/* Top Control Bar for Large Screen */}
          <div className="hidden lg:flex items-center justify-between px-4 py-2 bg-slate-950/90 border-b border-slate-800 z-30 shrink-0">
            <div className="flex items-center gap-2.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              <span className="text-xs font-black text-white">
                HD현대삼호 조선소 아케이드
              </span>
              <span className="text-slate-600">|</span>
              <span className="text-xs font-bold text-amber-400">
                {GAME_INFO[activeGame]?.title || "게임"}
              </span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                {GAME_INFO[activeGame]?.badge}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-500/10 border border-amber-500/30 text-[11px] font-bold text-amber-300">
                <Trophy className="w-3.5 h-3.5 text-amber-400" />
                <span>월간 랭킹 순위 화면 고정</span>
              </div>
            </div>
          </div>

          <div className="flex-1 p-0.5 sm:p-1 flex flex-col items-center justify-center relative h-full min-h-0 w-full overflow-hidden font-hd">
            {activeGame === "crane" && <CraneStackGame onFinish={saveScore} />}
            {activeGame === "turnover" && <GoliathTurnoverGame onFinish={saveScore} />}
            {activeGame === "welding" && <WeldingMasterGame onFinish={saveScore} />}
            {activeGame === "pipe" && <EngineRoomPipeGame onFinish={saveScore} />}
            {(activeGame === "bolting" || activeGame === "paint") && <HydraulicBoltingGame onFinish={saveScore} />}
            {activeGame === "dockwater" && <DockWaterGame onFinish={saveScore} />}
            {activeGame === "tugboat" && <TugboatPilotGame onFinish={saveScore} />}
            {activeGame === "mooring" && <AnchorMooringGame onFinish={saveScore} />}
            {activeGame === "propeller" && <PropellerTuneGame onFinish={saveScore} />}
            {activeGame === "lnginspect" && <LNGTankInspectGame onFinish={saveScore} />}
            {activeGame === "voyager" && <OceanRunnerGame onFinish={saveScore} />}
          </div>
        </div>

        {/* Monthly Leaderboard Panel - Fixed & Always Visible on the Right */}
        <div className="w-full lg:w-72 xl:w-80 2xl:w-84 bg-[#0d1424] text-white flex flex-col shrink-0 border-t lg:border-t-0 lg:border-l border-slate-800 shadow-xl overflow-hidden">
          {/* Mobile Collapse Toggle Header */}
          <div className="lg:hidden flex items-center justify-between px-3 py-2 bg-slate-900 border-b border-slate-800">
            <button
              onClick={() => setIsMobileBoardOpen(!isMobileBoardOpen)}
              className="flex items-center gap-1.5 text-xs font-bold text-amber-400"
            >
              <Trophy className="w-4 h-4 fill-amber-400 text-amber-400" />
              <span>월간 랭킹 순위 ({new Date().getMonth() + 1}월)</span>
              {isMobileBoardOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
            <button
              onClick={handleRefresh}
              disabled={loadingBoard || isRefreshing}
              className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-white transition-colors"
              title="새로고침"
            >
              <RotateCw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin text-amber-400" : ""}`} />
            </button>
          </div>

          <div className={`flex-col flex-1 p-3 lg:p-4 min-h-0 overflow-hidden ${isMobileBoardOpen ? "flex" : "hidden lg:flex"}`}>
            {/* Header */}
            <div className="flex items-start justify-between mb-2.5 pb-2.5 border-b border-slate-800">
              <div>
                <div className="flex items-center gap-1.5">
                  <div className="w-6 h-6 rounded-lg bg-amber-500/20 flex items-center justify-center border border-amber-500/30">
                    <Trophy className="w-3.5 h-3.5 text-amber-400" />
                  </div>
                  <h3 className="text-sm font-black text-white tracking-tight">
                    월간 랭킹 순위
                  </h3>
                  <span className="text-[10px] font-black text-amber-400 bg-amber-400/10 border border-amber-400/20 px-1.5 py-0.5 rounded-full">
                    {new Date().getMonth() + 1}월
                  </span>
                </div>
                <div className="text-[11px] font-bold text-slate-400 mt-1 flex items-center gap-1">
                  <span className="text-sky-400 truncate max-w-[130px]">{GAME_INFO[activeGame]?.title || "게임"}</span>
                  <span className="text-slate-600">|</span>
                  <span className="flex items-center gap-1 text-[10px] text-emerald-400 shrink-0">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                    실시간 고정 집계
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-1">
                <button
                  onClick={handleRefresh}
                  disabled={loadingBoard || isRefreshing}
                  className="p-1.5 bg-slate-800/80 hover:bg-slate-700/80 active:scale-95 rounded-lg text-slate-400 hover:text-amber-300 border border-slate-700 transition-all cursor-pointer"
                  title="랭킹 새로고침"
                >
                  <RotateCw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin text-amber-400" : ""}`} />
                </button>
                <button
                  onClick={onClose}
                  className="hidden lg:flex p-1.5 bg-slate-800/80 hover:bg-rose-500/20 hover:text-rose-300 active:scale-95 rounded-lg text-slate-400 border border-slate-700 transition-all cursor-pointer"
                  title="닫기"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Current Player Status Card */}
            <div className="mb-2.5 p-2.5 rounded-xl bg-gradient-to-r from-blue-950/60 to-slate-900/80 border border-blue-500/20 shadow-sm shrink-0">
              <div className="flex items-center justify-between text-[11px] mb-1">
                <span className="text-slate-400 font-bold flex items-center gap-1">
                  <Sparkles className="w-3 h-3 text-amber-400" />
                  내 이번 달 기록
                </span>
                <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-blue-500/20 text-blue-300 truncate max-w-[110px]">
                  {playerName}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-black text-white">
                  {myRecord ? (
                    <span className="flex items-center gap-1 text-amber-300">
                      {myRankIndex === 0 && <Crown className="w-3.5 h-3.5 text-amber-400" />}
                      {myRankIndex + 1}위
                    </span>
                  ) : (
                    <span className="text-slate-400 font-normal">미기록</span>
                  )}
                </span>
                <span className="text-xs font-black text-emerald-400 tabular-nums">
                  {myRecord ? getScoreFormat(activeGame, myRecord.score) : "게임 도전 대기"}
                </span>
              </div>
            </div>

            {/* Leaderboard List */}
            <div className="flex-1 overflow-y-auto no-scrollbar space-y-1.5 pr-0.5">
              {loadingBoard ? (
                <div className="text-xs text-slate-400 text-center py-10 flex flex-col items-center gap-2">
                  <RotateCw className="w-5 h-5 text-amber-400 animate-spin" />
                  <span>실시간 기록 불러오는 중...</span>
                </div>
              ) : leaderboard.length === 0 ? (
                <div className="text-xs text-slate-400 text-center py-10 flex flex-col items-center">
                  <Trophy className="w-8 h-8 text-slate-600 mb-2 stroke-1" />
                  <span className="font-bold text-slate-300">이번 달 첫 랭커에 도전하세요!</span>
                  <span className="text-[11px] text-slate-500 mt-1">게임을 완료하면 점수가 자동 등록됩니다.</span>
                </div>
              ) : (
                leaderboard.map((s, i) => {
                  const isMe = s.playerName === playerName || (currentUser?.email && s.id === currentUser.email);
                  return (
                    <div
                      key={s.id}
                      className={`flex items-center justify-between px-2.5 py-2 rounded-xl transition-all border ${
                        isMe
                          ? "ring-1 ring-amber-400/50 bg-amber-500/10 border-amber-500/30"
                          : i === 0
                          ? "bg-gradient-to-r from-amber-500/15 to-amber-900/10 border-amber-500/30 text-amber-200"
                          : i === 1
                          ? "bg-slate-300/10 border-slate-300/20 text-slate-200"
                          : i === 2
                          ? "bg-amber-800/15 border-amber-700/25 text-amber-300"
                          : "bg-slate-900/40 border-slate-800 text-slate-300 hover:bg-slate-800/40"
                      }`}
                    >
                      <div className="flex items-center gap-2 overflow-hidden min-w-0">
                        <span
                          className={`font-black text-xs w-5 text-center shrink-0 ${
                            i === 0
                              ? "text-amber-400"
                              : i === 1
                              ? "text-slate-300"
                              : i === 2
                              ? "text-amber-600"
                              : "text-slate-500"
                          }`}
                        >
                          {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}`}
                        </span>
                        <div className="flex flex-col min-w-0">
                          <div className="flex items-center gap-1">
                            <span
                              className={`text-xs font-bold truncate max-w-[95px] xl:max-w-[110px] ${
                                isMe ? "text-amber-300 font-black" : "text-slate-200"
                              }`}
                              title={displayPlayerName(s.playerName)}
                            >
                              {displayPlayerName(s.playerName)}
                            </span>
                            {isMe && (
                              <span className="text-[9px] bg-amber-400 text-slate-950 px-1 rounded font-black shrink-0">
                                나
                              </span>
                            )}
                          </div>
                          <span className="text-[9px] text-slate-500">
                            {displayPlayerName(s.playerName).length > 4 ? "HD현대삼호" : "조선사업부"}
                          </span>
                        </div>
                      </div>

                      <div className="flex flex-col items-end shrink-0 ml-1.5">
                        <span className="text-xs font-black text-emerald-400 tabular-nums">
                          {getScoreFormat(activeGame, s.score)}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Bottom Info Banner */}
            <div className="mt-2.5 pt-2 border-t border-slate-800/80 text-[10px] text-slate-500 flex items-center justify-between shrink-0">
              <span className="truncate">매월 말일 24:00 마감</span>
              <span className="text-amber-400/80 font-bold shrink-0">동반성장 마일리지</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function GameTab({
  id,
  label,
  icon,
  badge,
  active,
  onClick,
}: {
  id: string;
  label: string;
  icon: React.ReactNode;
  badge?: string;
  active: string;
  onClick: (id: string) => void;
}) {
  const isSelected = active === id;
  return (
    <button
      onClick={() => onClick(id)}
      className={`shrink-0 whitespace-nowrap px-3 py-2 lg:w-full lg:text-left rounded-[12px] font-bold text-[12px] lg:text-[13px] transition-all flex items-center justify-between gap-2 ${
        isSelected
          ? "bg-[#002C6C] text-white shadow-md shadow-blue-900/20"
          : "bg-white lg:bg-transparent text-gray-700 hover:bg-gray-200/70 border border-gray-200 lg:border-transparent active:scale-95"
      }`}
    >
      <div className="flex items-center gap-2 truncate">
        <span className={isSelected ? "text-amber-300" : "text-gray-500"}>{icon}</span>
        <span className="truncate">{label}</span>
      </div>
      {badge && (
        <span
          className={`text-[9px] font-black px-1.5 py-0.5 rounded-full uppercase shrink-0 ${
            isSelected
              ? "bg-amber-400 text-slate-900"
              : "bg-blue-100 text-[#007AFF]"
          }`}
        >
          {badge}
        </span>
      )}
    </button>
  );
}
