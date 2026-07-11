import React, { Component, ErrorInfo, ReactNode } from "react";
interface Props {
  children?: ReactNode;
}
interface State {
  hasError: boolean;
  error?: Error;
}
export class ErrorBoundary extends React.Component<Props, State> {
  public state: State = { hasError: false };
  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }
  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }
  public render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center h-screen bg-gray-50 text-gray-900 p-6">
          {" "}
          <div className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full border border-red-100 text-center">
            {" "}
            <h1 className="text-2xl font-bold text-red-500 mb-4">
              앗, 오류가 발생했습니다!
            </h1>{" "}
            <p className="text-gray-600 mb-6 text-sm break-words">
              {" "}
              {this.state.error?.message || "알 수 없는 오류"}{" "}
            </p>{" "}
            <button
              className="px-6 py-2 bg-[#1D1D1F] text-white rounded-xl font-bold active:scale-95 hover:bg-black transition-colors"
              onClick={() => window.location.reload()}
            >
              {" "}
              새로고침{" "}
            </button>{" "}
          </div>{" "}
        </div>
      );
    }
    return (this as any).props.children;
  }
}
