import { httpsCallable } from "firebase/functions";
import { functions } from "./firebase";

export type WorkoutConfidence = "low" | "medium" | "high";

export interface WorkoutAnalysis {
  name: string;
  caloriesBurned: number;
  durationMinutes: number;
  confidence: WorkoutConfidence;
}

const analyzeWorkoutFn = httpsCallable<{ description: string }, WorkoutAnalysis | null>(functions, "analyzeWorkout");

export const MyaWorkout = {
  /**
   * Odhadne spálené kalorie ze slovního popisu tréninku, server-side Cloud Function (stejná
   * rodina jako MyaVision.analyzeFoodText). Vrací null při chybě — volající strana musí
   * v tom případě nabídnout manuální zápis.
   */
  async analyzeWorkout(description: string): Promise<WorkoutAnalysis | null> {
    try {
      const response = await analyzeWorkoutFn({ description });
      return response.data;
    } catch (error) {
      console.error("Mya Workout Error:", error);
      return null;
    }
  },
};
