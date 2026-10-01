import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("Missing Supabase environment variables.");
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export type DashboardRole = "super_admin" | "admin";

export type DashboardAccount = {
  id: string;
  username: string;
  email: string;
  name: string;
  role: DashboardRole;
  created_at: string;
};

export type Participant = {
  userId: number;
  name: string | null;
  lastname: string | null;
  school: string | null;
  age: number | null;
  gender: string | null;
  updatedAt: string | null;
  created_at: string | null;
  Watch: string | null;
  email: string | null;
};

export type SceneData = {
  sceneDataId: number;
  gameDataId: number | null;
  details: Record<string, unknown> | null;
  act: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  userId: number | null;
};

export type WatchLog = {
  watchId: string;
  act: string | null;
  timestamp: string | null;
  PPG: number | null;
  EDA: number | null;
  IMU: unknown;
  emotionValue: string | null;
  userId: number | null;
};
