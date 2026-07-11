export interface Member {
  email: string;
  name: string;
  title: string;
  birthDate: string;
  isLunar: boolean;
  lunarMap?: Record<string, string>;
}

export interface Task {
  id: string;
  title: string;
  type: 'individual' | 'section' | 'department' | 'notice';
  teamId: string;
  assignee: string;
  location?: string;
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
  description?: string;
  isFocus: boolean;
  creatorEmail: string;
}

export interface Team {
  id: string;
  name: string;
  text: string;
  bg: string;
  border: string;
  hex: string;
}
