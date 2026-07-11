import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "./lib/firebase";
import { api } from "./lib/api";
import { INITIAL_MEMBERS } from "./lib/constants";
import { useAppStore } from "./store/useAppStore";
import Login from "./components/Login";
import Workspace from "./components/Workspace";
import Toaster from "./components/Toaster";
export default function App() {
  const { setCurrentUser, setTasks, setMembers, setSyncStatus } = useAppStore();
  const [loading, setLoading] = useState(true);
      useEffect(() => {
    let unsubMembers: (() => void) | undefined;
    let unsubTasks: (() => void) | undefined;
    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      if (user) {
        setSyncStatus("loading");
        unsubMembers = api.subscribeMembers((members) => {
          if (members.length === 0) {
            api.saveMembers(INITIAL_MEMBERS);
          } else {
            setMembers(members);
          }
        });
        unsubTasks = api.subscribeTasks(
          (tasks) => {
            setTasks(tasks);
            setSyncStatus("firebase");
            setLoading(false);
          },
          (err) => {
            console.error(err);
            setSyncStatus("error");
          },
        );
      } else {
        if (unsubMembers) unsubMembers();
        if (unsubTasks) unsubTasks();
        setLoading(false);
      }
    });
    
    return () => {
      unsubscribeAuth();
      if (unsubMembers) unsubMembers();
      if (unsubTasks) unsubTasks();
    };
  }, [setCurrentUser, setMembers, setTasks, setSyncStatus]);
  if (loading) {
    return (
      <div className="min-h-screen bg-[#F2F2F7] p-2 sm:p-4 transition-colors duration-300">
        {" "}
        <div className="flex flex-col gap-4 animate-pulse h-screen">
          {" "}
          <div className="h-[70px] bg-white rounded-[24px] w-full shrink-0"></div>{" "}
          <div className="flex-1 flex gap-4 min-h-0">
            {" "}
            <div className="hidden lg:block w-[280px] bg-white rounded-[28px] shrink-0"></div>{" "}
            <div className="flex-1 bg-white rounded-[28px]"></div>{" "}
          </div>{" "}
        </div>{" "}
      </div>
    );
  }
  return (
    <>
      {" "}
      {useAppStore.getState().currentUser ? <Workspace /> : <Login />}{" "}
      <Toaster />{" "}
    </>
  );
}
