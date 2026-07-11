import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { Member } from "../types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const formatDateForInput = (date: Date) => { 
  const y = date.getFullYear(); 
  const m = String(date.getMonth() + 1).padStart(2, '0'); 
  const d = String(date.getDate()).padStart(2, '0'); 
  return `${y}-${m}-${d}`; 
};

export const formatShortDate = (dateString: string) => { 
  const date = new Date(dateString); 
  const days = ['일', '월', '화', '수', '목', '금', '토']; 
  return `${date.getMonth() + 1}/${date.getDate()}(${days[date.getDay()]})`; 
};

export const isSameDate = (d1: Date | null, d2: Date | null) => { 
  if (!d1 || !d2) return false; 
  return d1.toDateString() === d2.toDateString(); 
};

export const getBirthdayThisYear = (person: Member, targetYear: number) => {
  if (person.isLunar && person.lunarMap && person.lunarMap[targetYear]) {
    const parts = person.lunarMap[targetYear].split('-');
    return { month: parseInt(parts[0], 10), day: parseInt(parts[1], 10) };
  }
  return {
    month: parseInt(person.birthDate.substring(5, 7), 10),
    day: parseInt(person.birthDate.substring(8, 10), 10)
  };
};

export const generateTimeOptions = () => {
  const options = [];
  for (let h = 0; h < 24; h++) {
    const hour = String(h).padStart(2, '0');
    options.push(`${hour}:00`);
    options.push(`${hour}:30`);
  }
  return options;
};
