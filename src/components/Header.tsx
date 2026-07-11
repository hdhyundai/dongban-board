import { useEffect, useState } from "react";
import {
  Search,
  Download,
  Settings,
  Plus,
  LogOut,
  Loader,
  Zap,
  AlertCircle,
  Gamepad2,
} from "lucide-react";
import { useAppStore } from "../store/useAppStore";
import { auth } from "../lib/firebase";
import { QUOTES } from "../lib/constants";
import { exportToExcel } from "../lib/excel";

interface HeaderProps {
  onNewTask: () => void;
  onOpenAdmin: () => void;
  onOpenGames?: () => void;
}

export default function Header({
  onNewTask,
  onOpenAdmin,
  onOpenGames,
}: HeaderProps) {
  const { syncStatus, searchQuery, setSearchQuery, tasks, addToast } =
    useAppStore();
  const [quoteIndex, setQuoteIndex] = useState(0);
  const [quoteVisible, setQuoteVisible] = useState(true);

  useEffect(() => {
    const interval = setInterval(() => {
      setQuoteVisible(false);
      setTimeout(() => {
        setQuoteIndex((prev) => (prev + 1) % QUOTES.length);
        setQuoteVisible(true);
      }, 700);
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  const handleDownload = () => {
    const success = exportToExcel(tasks);
    if (!success) {
      addToast("데이터가 없습니다.", "error");
    }
  };

  return (
    <header className="sticky top-0 z-50 bg-white/95 backdrop-blur-xl border-b border-gray-300 px-3 sm:px-5 md:px-6 xl:px-10 py-2.5 sm:py-3 md:py-3.5 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 sm:gap-4 transition-all">
      <div className="flex items-center justify-between w-full md:w-auto shrink-0">
        <div className="flex items-center gap-2 sm:gap-3">
          <img
            src="/ci.png"
            alt="HD Hyundai Samho CI"
            className="h-6 sm:h-7 md:h-8 object-contain shrink-0 mr-1"
          />
          <div className="flex flex-col justify-center">
            <div className="flex items-center gap-1.5 sm:gap-2">
              <h1 className="text-[15px] sm:text-[17px] md:text-[19px] font-bold tracking-tight text-[#1D1D1F] leading-tight shrink-0">
                동반성장부
              </h1>
              {syncStatus === "loading" && (
                <div className="flex items-center gap-1 text-[10px] sm:text-[11px] font-bold px-2 py-0.5 rounded-full transition-all border border-gray-300 bg-[#007AFF]/10 text-[#007AFF] shrink-0 whitespace-nowrap">
                  <Loader className="w-2.5 h-2.5 sm:w-3 sm:h-3 animate-spin" /> 통신 중
                </div>
              )}
              {syncStatus === "firebase" && (
                <div className="flex items-center gap-1 text-[10px] sm:text-[11px] font-bold px-2 py-0.5 rounded-full transition-all border border-gray-300 bg-[#34C759]/10 text-[#34C759] shrink-0 whitespace-nowrap">
                  <Zap className="w-2.5 h-2.5 sm:w-3 sm:h-3 fill-current" /> 연동 중
                </div>
              )}
              {syncStatus === "error" && (
                <div className="flex items-center gap-1 text-[10px] sm:text-[11px] font-bold px-2 py-0.5 rounded-full transition-all border border-gray-300 bg-[#FF3B30]/10 text-[#FF3B30] shrink-0 whitespace-nowrap">
                  <AlertCircle className="w-2.5 h-2.5 sm:w-3 sm:h-3" /> 실패
                </div>
              )}
            </div>
            <div className="flex items-center mt-0.5">
              <p className="hidden sm:block text-[11px] sm:text-[12px] md:text-[13px] text-[#48484A] font-semibold">
                통합 업무 워크스페이스
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="hidden xl:flex flex-1 justify-center items-center px-4 min-w-0">
        <div
          className={`transition-opacity duration-700 ease-in-out ${quoteVisible ? "opacity-100" : "opacity-0"} max-w-[550px] truncate text-center cursor-default select-none flex items-baseline gap-2`}
        >
          <span className="text-[14px] text-[#48484A] font-medium tracking-tight italic truncate w-full">
            "{QUOTES[quoteIndex].text}"
          </span>
          <span className="text-[11px] text-[#86868B] font-bold shrink-0">
            — {QUOTES[quoteIndex].author}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-1.5 sm:gap-2 w-full md:w-auto shrink-0 overflow-x-auto no-scrollbar pb-0.5 md:pb-0">
        <div className="relative shrink-0 flex-1 md:flex-none">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#48484A] " />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="검색"
            className="pl-9 pr-3 py-1.5 bg-gray-100 active:scale-95 hover:bg-gray-200 focus:bg-white border border-gray-300 focus:border-[#007AFF] rounded-[8px] text-[13px] md:text-[14px] transition-all focus:outline-none focus:ring-4 focus:ring-[#007AFF]/10 placeholder:text-[#86868B] font-semibold w-full md:w-[177px]"
          />
        </div>
        <button
          onClick={handleDownload}
          className="bg-white hover:bg-gray-100 border border-gray-300 text-[#1D1D1F] active:scale-95 p-1.5 xl:px-3 xl:py-1.5 rounded-[8px] xl:rounded-full text-[13px] font-bold flex items-center justify-center gap-1.5 transition-all shadow-sm shrink-0"
        >
          <Download className="w-4 h-4 sm:w-4.5 sm:h-4.5" />
          <span className="hidden xl:inline">다운로드</span>
        </button>
        {onOpenGames && (
          <button
            onClick={onOpenGames}
            className="bg-[#FF9500] hover:bg-[#FF8A00] text-white active:scale-95 p-1.5 xl:px-3 xl:py-1.5 rounded-[8px] xl:rounded-full text-[13px] font-bold flex items-center justify-center gap-1.5 transition-all shadow-sm shrink-0"
          >
            <Gamepad2 className="w-4 h-4 sm:w-4.5 sm:h-4.5" />
            <span className="hidden xl:inline">미니게임</span>
          </button>
        )}
        <button
          onClick={onOpenAdmin}
          className="bg-gray-800 hover:bg-gray-700 text-white active:scale-95 p-1.5 xl:px-3 xl:py-1.5 rounded-[8px] xl:rounded-full text-[13px] font-bold flex items-center justify-center gap-1.5 transition-all shadow-sm shrink-0"
        >
          <Settings className="w-4 h-4 sm:w-4.5 sm:h-4.5" />
          <span className="hidden xl:inline">관리자</span>
        </button>
        <button
          onClick={onNewTask}
          className="bg-[#007AFF] hover:bg-[#0062CC] text-white active:scale-95 px-2 py-1.5 xl:px-3 xl:py-1.5 rounded-[8px] xl:rounded-full text-[13px] font-bold flex items-center justify-center gap-1 transition-all shadow-[0_4px_12px_rgba(0,122,255,0.25)] shrink-0"
        >
          <Plus className="w-4 h-4 sm:w-4.5 sm:h-4.5" />
          <span className="hidden xl:inline">새 일정</span>
        </button>
        <button
          onClick={() => auth.signOut()}
          className="p-1.5 xl:p-1.5 bg-[#F2F2F7] hover:bg-[#E5E5EA] border border-gray-300 text-[#FF3B30] active:scale-95 rounded-[8px] xl:rounded-full transition-all flex items-center justify-center shrink-0"
        >
          <LogOut className="w-4 h-4 sm:w-4.5 sm:h-4.5" />
        </button>
      </div>
    </header>
  );
}
