import {
  Calendar as CalendarIcon,
  MapPin,
  Users,
  Briefcase,
  User,
  Bell,
  Star,
  Plus,
} from "lucide-react";
import { useAppStore } from "../store/useAppStore";
import { TEAMS, HOLIDAYS, getHoliday } from "../lib/constants";
import { formatDateForInput, cn } from "../lib/utils";
import { Task } from "../types";

interface DailyFocusProps {
  filteredTasks: Task[];
  onOpenTaskModal: (date: Date) => void;
  onEditTask: (id: string) => void;
  isMobileOpen?: boolean;
  onCloseMobile?: () => void;
  onToggleMobile?: () => void;
}

export default function DailyFocus({
  filteredTasks,
  onOpenTaskModal,
  onEditTask,
  isMobileOpen,
  onCloseMobile,
  onToggleMobile,
}: DailyFocusProps) {
  const { selectedDate, selectedTaskId } = useAppStore();
  const dateStr = formatDateForInput(selectedDate);
  const isHol = getHoliday(dateStr);

  let dayTasks = filteredTasks
    .filter((t) => t.startDate <= dateStr && t.endDate >= dateStr)
    .sort((a, b) => a.startTime.localeCompare(b.startTime));

  if (selectedTaskId) {
    dayTasks = dayTasks.filter((t) => t.id === selectedTaskId);
  }

  return (
    <div
      className={cn(
        "fixed inset-x-0 bottom-0 z-40 bg-white rounded-t-[24px] shadow-[0_-4px_20px_rgba(0,0,0,0.15)] flex flex-col transition-transform duration-300 xl:translate-y-0 xl:relative xl:inset-auto xl:w-[380px] 2xl:w-[420px] xl:rounded-[28px] xl:shadow-sm xl:flex h-[60vh] xl:h-auto xl:max-h-[calc(100vh-6rem)] border border-gray-300 xl:mt-0 shrink-0",
        isMobileOpen ? "translate-y-0" : "translate-y-[calc(100%-64px)]",
      )}
    >
      <div
        className="w-full flex justify-center pt-3 pb-2 xl:hidden cursor-pointer active:bg-gray-50 rounded-t-[24px]"
        onClick={onToggleMobile || onCloseMobile}
      >
        <div className="w-10 h-1.5 bg-gray-300 rounded-full"></div>
      </div>

      <div
        className="px-4 pb-4 sm:p-5 md:p-6 border-b border-gray-200 flex justify-between items-center xl:items-start cursor-pointer xl:cursor-auto"
        onClick={onToggleMobile || onCloseMobile}
      >
        <div>
          <h2 className="text-[16px] md:text-[20px] font-bold text-[#1D1D1F] mb-0.5 tracking-tight flex items-center gap-2">
            상세 일정{" "}
            <span className="text-[10px] text-[#007AFF] bg-[#007AFF]/10 px-2 py-0.5 rounded-full xl:hidden">
              위로 밀어서 열기
            </span>
          </h2>
          <p className="text-[13px] sm:text-[14px] font-bold text-[#48484A] flex items-center">
            {selectedDate.getMonth() + 1}월 {selectedDate.getDate()}일{" "}
            {isHol && (
              <span className="ml-2 text-[#FF3B30] text-[11px] font-bold">
                ({isHol})
              </span>
            )}
          </p>
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onOpenTaskModal(selectedDate);
          }}
          className="p-1.5 sm:p-2 bg-[#F2F2F7] active:scale-95 hover:bg-[#E5E5EA] border border-gray-300 text-[#007AFF] rounded-full transition-colors active:scale-95"
        >
          <Plus className="w-4 h-4 sm:w-5 sm:h-5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 md:p-4 space-y-2.5 bg-[#F9F9FB] rounded-b-[24px] xl:rounded-b-[28px] no-scrollbar">
        {dayTasks.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-[#86868B] py-10">
            <CalendarIcon className="w-8 h-8 mb-2 opacity-50" />
            <p className="font-bold text-[14px]">일정 없음</p>
          </div>
        ) : (
          dayTasks.map((t) => {
            const team = TEAMS.find((x) => x.id === t.teamId)!;
            const Icon =
              t.type === "notice"
                ? Bell
                : t.type === "section"
                  ? Users
                  : t.type === "department"
                    ? Briefcase
                    : User;
            const typeLabel =
              t.type === "notice"
                ? "부서공지"
                : t.type === "section"
                  ? "과단위"
                  : t.type === "department"
                    ? "부서단위"
                    : "개인별";

            return (
              <div
                key={t.id}
                onDoubleClick={() => onEditTask(t.id)}
                className="bg-white rounded-[14px] p-3 shadow-sm relative overflow-hidden border border-gray-200 select-none hover:shadow-md transition-all cursor-pointer group"
              >
                <div
                  className="absolute left-0 top-0 bottom-0 w-1"
                  style={{ backgroundColor: team.hex }}
                ></div>
                <div className="pl-2 flex flex-col gap-1.5">
                  <div className="flex justify-between items-start">
                    <h4 className="font-bold text-[14px] text-[#1D1D1F] leading-tight flex items-center gap-1.5">
                      {t.title}{" "}
                      {t.isFocus && (
                        <Star className="w-3.5 h-3.5 text-[#FF9500] fill-[#FF9500] mb-px" />
                      )}
                    </h4>
                    <span
                      className={`text-[10px] font-bold px-1.5 py-0.5 rounded-[4px] ${team.bg} ${team.text} border ${team.border} whitespace-nowrap`}
                    >
                      {team.name}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[12px] font-bold text-[#48484A] ">
                    <span className="flex items-center gap-1 bg-gray-50 px-1.5 py-0.5 rounded-[4px] border border-gray-100">
                      <CalendarIcon className="w-3 h-3" /> {t.startTime}
                      {t.endTime ? `~${t.endTime}` : ""}
                    </span>
                    {t.location && (
                      <span className="flex items-center gap-1">
                        <MapPin className="w-3 h-3" /> {t.location}
                      </span>
                    )}
                    <span className="flex items-center gap-1 text-[#1D1D1F] ">
                      <Icon className="w-3 h-3 text-[#48484A] " />{" "}
                      {t.assignee || "-"}{" "}
                      <span className="font-medium text-[10px] text-[#86868B]">
                        ({typeLabel})
                      </span>
                    </span>
                  </div>
                  {t.description && (
                    <div className="mt-0.5 text-[12px] text-[#3A3A3C] bg-[#F9F9FB] px-2.5 py-2 rounded-[8px] leading-relaxed font-medium whitespace-pre-wrap border border-gray-100">
                      {t.description}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
