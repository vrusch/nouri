import { createContext } from "react";
import { type User } from "firebase/auth";
import { type UserProfile } from "./AuthContext";

export interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  updateProfile: (data: Partial<UserProfile>) => Promise<void>;
  updateProfileArray: (
    field: "vacationDates" | "plannedWorkoutDays" | "customReminders",
    op: "union" | "remove",
    values: (string | number)[]
  ) => Promise<void>;
  logout: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);
