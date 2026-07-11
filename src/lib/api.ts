import { encryptField, decryptField } from "./crypto";
import { collection, doc, setDoc, deleteDoc, getDoc, onSnapshot } from "firebase/firestore";
import { db, getAppId } from "./firebase";
import { Task, Member } from "../types";

export const api = {
  subscribeTasks: (callback: (tasks: Task[]) => void, onError: (error: any) => void) => {
    return onSnapshot(collection(db, 'artifacts', getAppId(), 'public', 'data', 'workspace_tasks'), (snap) => {
      callback(snap.docs.map(d => {
        const data = d.data();
        if (data.title) data.title = decryptField(data.title);
        if (data.description) data.description = decryptField(data.description);
        return { id: d.id, ...data } as Task;
      }));
    }, onError);
  },
  subscribeMembers: (callback: (members: Member[]) => void) => {
    return onSnapshot(doc(db, 'artifacts', getAppId(), 'public', 'data', 'workspace_settings', 'members'), (snap) => {
      if (snap.exists()) {
        callback(snap.data().list || []);
      } else {
        callback([]);
      }
    });
  },
  saveTask: (taskId: string, data: Partial<Task>) => {
    const secureData = { ...data };
    if (secureData.title) secureData.title = encryptField(secureData.title);
    if (secureData.description) secureData.description = encryptField(secureData.description);
    return setDoc(doc(db, 'artifacts', getAppId(), 'public', 'data', 'workspace_tasks', taskId), secureData);
  },
  deleteTask: (taskId: string) => {
    return deleteDoc(doc(db, 'artifacts', getAppId(), 'public', 'data', 'workspace_tasks', taskId));
  },
  saveMembers: (members: Member[]) => {
    return setDoc(doc(db, 'artifacts', getAppId(), 'public', 'data', 'workspace_settings', 'members'), { list: members });
  },
  saveBirthdayLog: (logId: string, data: any) => {
    return setDoc(doc(db, 'artifacts', getAppId(), 'public', 'data', 'birthday_logs', logId), data);
  },
  getBirthdayLog: (logId: string) => {
    return getDoc(doc(db, 'artifacts', getAppId(), 'public', 'data', 'birthday_logs', logId));
  }
};
