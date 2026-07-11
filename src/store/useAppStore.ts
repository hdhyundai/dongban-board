import { create } from 'zustand';
import { User } from 'firebase/auth';
import { Task, Member } from '../types';

interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
}

interface AppState {
  currentUser: User | null;
  tasks: Task[];
  members: Member[];
  selectedDate: Date;
  selectedTaskId: string | null;
  filterTeam: string;
  searchQuery: string;
  syncStatus: 'loading' | 'firebase' | 'error';
  toasts: Toast[];
  
  setCurrentUser: (user: User | null) => void;
  setTasks: (tasks: Task[]) => void;
  setMembers: (members: Member[]) => void;
  setSelectedDate: (date: Date) => void;
  setSelectedTaskId: (id: string | null) => void;
  setFilterTeam: (teamId: string) => void;
  setSearchQuery: (query: string) => void;
  setSyncStatus: (status: 'loading' | 'firebase' | 'error') => void;
  
  addToast: (message: string, type?: 'success' | 'error' | 'info') => void;
  removeToast: (id: string) => void;
}

export const useAppStore = create<AppState>((set) => ({
  currentUser: null,
  tasks: [],
  members: [],
  selectedDate: new Date(),
  selectedTaskId: null,
  filterTeam: 'all',
  searchQuery: '',
  syncStatus: 'loading',
  toasts: [],
  
  setCurrentUser: (user) => set({ currentUser: user }),
  setTasks: (tasks) => set({ tasks }),
  setMembers: (members) => set({ members }),
  setSelectedDate: (date) => set({ selectedDate: date }),
  setSelectedTaskId: (id) => set({ selectedTaskId: id }),
  setFilterTeam: (teamId) => set({ filterTeam: teamId }),
  setSearchQuery: (query) => set({ searchQuery: query }),
  setSyncStatus: (status) => set({ syncStatus: status }),
  
  addToast: (message, type = 'success') => {
    const id = Date.now().toString();
    set((state) => ({ toasts: [...state.toasts, { id, message, type }] }));
    setTimeout(() => {
      set((state) => ({ toasts: state.toasts.filter(t => t.id !== id) }));
    }, 3000);
  },
  removeToast: (id) => set((state) => ({ toasts: state.toasts.filter(t => t.id !== id) })),
}));
