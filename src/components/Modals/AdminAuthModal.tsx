import React, { useState } from "react";
import { X } from "lucide-react";
import { useAppStore } from "../../store/useAppStore";
import { ADMIN_HASH } from "../../lib/constants";
interface AdminAuthModalProps {
  onClose: () => void;
  onSuccess: () => void;
}
export default function AdminAuthModal({
  onClose,
  onSuccess,
}: AdminAuthModalProps) {
  const [password, setPassword] = useState("");
  const { addToast } = useAppStore();
  const handleVerify = (e: React.FormEvent) => {
    e.preventDefault();
    if (btoa(password) === ADMIN_HASH) {
      onSuccess();
    } else {
      addToast("관리자 비밀번호가 일치하지 않습니다.", "error");
    }
  };
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[300] p-4 sm:p-6 animate-in fade-in duration-300">
      {" "}
      <div className="bg-white rounded-[32px] shadow-2xl w-full max-w-[400px] overflow-hidden flex flex-col border border-gray-300">
        {" "}
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-200 bg-white ">
          {" "}
          <h3 className="text-[20px] font-bold text-[#1D1D1F] tracking-tight">
            관리자 모드 접속
          </h3>{" "}
          <button
            onClick={onClose}
            className="p-2 text-[#48484A] hover:text-[#1D1D1F] active:scale-95 hover:bg-[#F2F2F7] border border-gray-200 rounded-full transition-colors focus:outline-none"
          >
            {" "}
            <X className="w-4 h-4" />{" "}
          </button>{" "}
        </div>{" "}
        <form onSubmit={handleVerify} className="p-6 space-y-4 bg-white ">
          {" "}
          <div>
            {" "}
            <label className="block text-[13px] font-bold text-[#3A3A3C] mb-1.5 pl-1">
              접속 비밀번호
            </label>{" "}
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-[#F5F5F7] border border-gray-300 rounded-[12px] p-3.5 text-[15px] font-bold focus:bg-white focus:border-[#007AFF] outline-none transition-all"
              placeholder="비밀번호 입력"
            />{" "}
          </div>{" "}
          <button
            type="submit"
            className="mt-4 w-full py-3.5 bg-gray-800 active:scale-95 hover:bg-gray-700 text-white rounded-[12px] text-[15px] font-bold active:scale-95 transition-all shadow-sm"
          >
            {" "}
            접속하기{" "}
          </button>{" "}
        </form>{" "}
      </div>{" "}
    </div>
  );
}
