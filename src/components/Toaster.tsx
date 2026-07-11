import { CheckCircle, AlertTriangle, Info } from "lucide-react";
import { useAppStore } from "../store/useAppStore";
import { cn } from "../lib/utils";
import { AnimatePresence, motion } from "motion/react";
export default function Toaster() {
  const { toasts } = useAppStore();
  return (
    <div className="fixed bottom-8 right-8 z-[9999] flex flex-col gap-3 pointer-events-none">
      {" "}
      <AnimatePresence>
        {" "}
        {toasts.map((toast) => {
          let Icon = Info;
          let bgClass = "bg-[#007AFF]/10";
          let textClass = "text-[#007AFF]";
          if (toast.type === "success") {
            Icon = CheckCircle;
            bgClass = "bg-[#34C759]/10";
            textClass = "text-[#34C759]";
          } else if (toast.type === "error") {
            Icon = AlertTriangle;
            bgClass = "bg-[#FF3B30]/10";
            textClass = "text-[#FF3B30]";
          }
          return (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, x: 100 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 100 }}
              className="flex items-center gap-3 bg-white shadow-xl border border-gray-300 rounded-full px-5 py-3.5 pointer-events-auto"
            >
              {" "}
              <div className={cn("p-1 rounded-full", bgClass, textClass)}>
                {" "}
                <Icon className="w-4 h-4" />{" "}
              </div>{" "}
              <span className="text-[14px] font-bold text-[#1D1D1F] pr-2">
                {toast.message}
              </span>{" "}
            </motion.div>
          );
        })}{" "}
      </AnimatePresence>{" "}
    </div>
  );
}
