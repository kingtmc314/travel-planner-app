// Guest mode: store trips in localStorage, merge on login
import { useState, useCallback } from "react";

export interface GuestTrip {
  id: string; // local UUID prefixed with "guest_"
  name: string;
  destination: string;
  startDate: string; // ISO date string
  endDate: string;
  baseCurrency: string;
  coverColor: string;
  createdAt: number;
  activities: GuestActivity[];
  expenses: GuestExpense[];
}

export interface GuestActivity {
  id: string;
  dayIndex: number;
  title: string;
  time?: string;
  location?: string;
  notes?: string;
}

export interface GuestExpense {
  id: string;
  title: string;
  amount: number;
  currency: string;
  date: string;
  category: string;
}

const STORAGE_KEY = "voyageai_guest_trips";

function load(): GuestTrip[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function save(trips: GuestTrip[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trips));
  } catch {}
}

function genId() {
  return "guest_" + Math.random().toString(36).slice(2, 10);
}

export function useGuestTrips() {
  const [trips, setTrips] = useState<GuestTrip[]>(load);

  const addTrip = useCallback((data: Omit<GuestTrip, "id" | "createdAt" | "activities" | "expenses">) => {
    const trip: GuestTrip = {
      ...data,
      id: genId(),
      createdAt: Date.now(),
      activities: [],
      expenses: [],
    };
    setTrips(prev => {
      const next = [trip, ...prev];
      save(next);
      return next;
    });
    return trip;
  }, []);

  const updateTrip = useCallback((id: string, patch: Partial<GuestTrip>) => {
    setTrips(prev => {
      const next = prev.map(t => t.id === id ? { ...t, ...patch } : t);
      save(next);
      return next;
    });
  }, []);

  const deleteTrip = useCallback((id: string) => {
    setTrips(prev => {
      const next = prev.filter(t => t.id !== id);
      save(next);
      return next;
    });
  }, []);

  const clearGuestTrips = useCallback(() => {
    setTrips([]);
    try { localStorage.removeItem(STORAGE_KEY); } catch {}
  }, []);

  return { trips, addTrip, updateTrip, deleteTrip, clearGuestTrips };
}

export function getGuestTrips(): GuestTrip[] {
  return load();
}
