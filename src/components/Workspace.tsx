import { useState } from "react";
import Header from "./Header";
import Calendar from "./Calendar";
import DailyFocus from "./DailyFocus";
import TaskModal from "./Modals/TaskModal";
import AdminAuthModal from "./Modals/AdminAuthModal";
import AdminPanelModal from "./Modals/AdminPanelModal";
import GamesModal from "./Modals/GamesModal";
import { useAppStore } from "../store/useAppStore";
import { Sliders, Filter, Star } from "lucide-react";
import { TEAMS } from "../lib/constants";
import { formatShortDate } from "../lib/utils";
import { format } from "date-fns";
export default function Workspace() {
  const {
    filterTeam,
    setFilterTeam,
    searchQuery,
    tasks,
    selectedDate,
    setSelectedTaskId,
  } = useAppStore();
  const [showFilterMobile, setShowFilterMobile] = useState(false);
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [modalInitialDate, setModalInitialDate] = useState<Date>(new Date());
  const [isAdminAuthOpen, setIsAdminAuthOpen] = useState(false);
  const [isAdminPanelOpen, setIsAdminPanelOpen] = useState(false);
  const [isGamesModalOpen, setIsGamesModalOpen] = useState(false);
  const [isMobileScheduleOpen, setIsMobileScheduleOpen] = useState(false);
  const filteredTasks = tasks.filter((task) => {
    const matchTeam = filterTeam === "all" || task.teamId === filterTeam;
    const searchLower = searchQuery.toLowerCase();
    const matchSearch =
      task.title.toLowerCase().includes(searchLower) ||
      task.assignee.toLowerCase().includes(searchLower);
    return matchTeam && matchSearch;
  });
  const curYM = format(new Date(), "yyyy-MM");
  const actualToday = format(new Date(), "yyyy-MM-dd");
  const focusTasks = filteredTasks
    .filter(
      (t) =>
        t.isFocus &&
        t.endDate >= actualToday &&
        (t.startDate.startsWith(curYM) || t.endDate.startsWith(curYM)),
    )
    .sort((a, b) => a.startDate.localeCompare(b.startDate));
  const handleOpenTaskModal = (date: Date = new Date()) => {
    setEditingTaskId(null);
    setModalInitialDate(date);
    setIsTaskModalOpen(true);
  };
  const handleEditTask = (id: string) => {
    setEditingTaskId(id);
    setIsTaskModalOpen(true);
  };
  return (
    <div
      className="flex-1 flex flex-col min-h-screen w-full relative"
      style={{
        backgroundImage: "url('/yard.png')",
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundAttachment: "fixed",
      }}
    >
      {" "}
      <div className="absolute inset-0 bg-[#F2F2F7]/85 backdrop-blur-lg z-0"></div>{" "}
      <div className="relative z-10 flex flex-col flex-1 h-full w-full">
        {" "}
        <Header
          onNewTask={() => handleOpenTaskModal()}
          onOpenAdmin={() => setIsAdminAuthOpen(true)}
          onOpenGames={() => setIsGamesModalOpen(true)}
        />{" "}
        <main className="flex-1 p-0 sm:p-4 md:p-6 lg:p-8 flex flex-col xl:flex-row gap-0 sm:gap-6 max-w-[1800px] mx-auto w-full h-full min-h-0 relative bg-white sm:bg-transparent">
          {" "}
          <div className="flex-1 flex flex-col gap-0 sm:gap-6 min-w-0 min-h-0">
            {" "}
            <div className="bg-white rounded-none sm:rounded-[28px] sm:shadow-sm flex flex-col shrink-0 transition-all border-b sm:border border-gray-300 border-x-0 sm:border-x">
              {" "}
              <button
                onClick={() => setShowFilterMobile(!showFilterMobile)}
                className="xl:hidden w-full flex items-center justify-between px-4 py-3 text-[13px] font-bold text-[#48484A] bg-gray-50 active:bg-gray-100 transition-colors"
              >
                {" "}
                <span className="flex items-center gap-1.5">
                  <Sliders className="w-4 h-4 text-[#007AFF]" /> 파트 필터 및
                  포커스 업무
                </span>{" "}
              </button>{" "}
              <div
                className={`${showFilterMobile ? "flex" : "hidden"} xl:flex flex-col lg:flex-row gap-6 lg:gap-8 p-4 sm:p-5 md:p-6`}
              >
                {" "}
                <div className="lg:w-2/5 flex flex-col gap-3">
                  {" "}
                  <h3 className="text-[13px] font-bold text-[#3A3A3C] flex items-center gap-1.5 uppercase tracking-wider pl-1">
                    {" "}
                    <Filter className="w-3.5 h-3.5" /> 파트 필터링{" "}
                  </h3>{" "}
                  <div className="bg-[#E5E5EA] p-1.5 rounded-[16px] grid grid-cols-3 gap-1.5">
                    {" "}
                    <button
                      onClick={() => setFilterTeam("all")}
                      className={`px-3 py-2 rounded-[12px] text-[13px] md:text-[14px] font-bold border ${filterTeam === "all" ? "bg-white text-[#1D1D1F] border-gray-300 shadow-sm" : "text-[#48484A] border-transparent active:scale-95 hover:bg-gray-100"}`}
                    >
                      전체
                    </button>{" "}
                    {TEAMS.filter((t) => t.id !== "t_notice").map((team) => (
                      <button
                        key={team.id}
                        onClick={() => setFilterTeam(team.id)}
                        className={`px-3 py-2 rounded-[12px] text-[13px] md:text-[14px] font-bold border ${filterTeam === team.id ? "bg-white text-[#1D1D1F] border-gray-300 shadow-sm" : "text-[#48484A] border-transparent active:scale-95 hover:bg-gray-100"}`}
                      >
                        {team.name}
                      </button>
                    ))}{" "}
                  </div>{" "}
                </div>{" "}
                <div className="lg:w-3/5 flex flex-col gap-3 lg:border-l border-gray-200 lg:pl-8">
                  {" "}
                  <h3 className="text-[13px] font-bold text-[#3A3A3C] flex items-center gap-1.5 uppercase tracking-wider pl-1">
                    {" "}
                    <Star className="w-3.5 h-3.5 text-[#FF9500]" /> 이달의
                    포커스 업무{" "}
                  </h3>{" "}
                  <div className="flex flex-wrap gap-2 overflow-y-auto max-h-[100px] no-scrollbar">
                    {" "}
                    {focusTasks.length === 0 ? (
                      <span className="text-[13px] text-[#86868B] font-bold">
                        진행 중인 포커스 업무가 없습니다.
                      </span>
                    ) : (
                      focusTasks.map((t) => {
                        const team = TEAMS.find((x) => x.id === t.teamId) || {
                          hex: "#000",
                        };
                        return (
                          <div
                            key={t.id}
                            onClick={() => setSelectedTaskId(t.id)}
                            className="cursor-pointer px-3 py-1.5 rounded-[12px] text-[12px] flex items-center gap-2 bg-white border border-gray-200 shadow-sm active:scale-95 hover:bg-gray-50"
                          >
                            {" "}
                            <span className="font-bold text-[#48484A] bg-gray-100 px-1.5 rounded">
                              {formatShortDate(t.startDate)}
                            </span>{" "}
                            <div
                              className="w-2 h-2 rounded-full"
                              style={{ backgroundColor: team.hex }}
                            ></div>{" "}
                            <span className="font-bold truncate max-w-[120px]">
                              {t.title}
                            </span>{" "}
                          </div>
                        );
                      })
                    )}{" "}
                  </div>{" "}
                </div>{" "}
              </div>{" "}
            </div>{" "}
            <Calendar
              filteredTasks={filteredTasks}
              onOpenTaskModal={handleOpenTaskModal}
              onEditTask={handleEditTask}
            />{" "}
          </div>{" "}
          <DailyFocus
            filteredTasks={filteredTasks}
            onOpenTaskModal={handleOpenTaskModal}
            onEditTask={handleEditTask}
            isMobileOpen={isMobileScheduleOpen}
            onCloseMobile={() => setIsMobileScheduleOpen(false)}
            onToggleMobile={() =>
              setIsMobileScheduleOpen(!isMobileScheduleOpen)
            }
          />{" "}
        </main>{" "}
        {isTaskModalOpen && (
          <TaskModal
            isOpen={isTaskModalOpen}
            onClose={() => setIsTaskModalOpen(false)}
            taskId={editingTaskId}
            initialDate={modalInitialDate}
          />
        )}{" "}
        {isAdminAuthOpen && (
          <AdminAuthModal
            onClose={() => setIsAdminAuthOpen(false)}
            onSuccess={() => {
              setIsAdminAuthOpen(false);
              setIsAdminPanelOpen(true);
            }}
          />
        )}{" "}
        {isAdminPanelOpen && (
          <AdminPanelModal onClose={() => setIsAdminPanelOpen(false)} />
        )}{" "}
        {isGamesModalOpen && (
          <GamesModal onClose={() => setIsGamesModalOpen(false)} />
        )}{" "}
      </div>{" "}
    </div>
  );
}
