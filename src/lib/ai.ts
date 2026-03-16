import { type UserProfile } from "../context/AuthContext";
import { calculateNutrition } from "./nutrition";

const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";
const OPENAI_API_KEY = import.meta.env.VITE_OPENAI_KEY;

export interface AIResponse {
  text: string;
  data?: any;
}

export const MyaAI = {
  /**
   * Vygeneruje úvodní report (vstupní diagnózu)
   */
  async generateWelcomeReport(profile: UserProfile): Promise<AIResponse> {
    const results = calculateNutrition({
      gender: profile.gender,
      weight: profile.weight,
      height: profile.height,
      birthDate: profile.birthDate,
      activityLevel: profile.activityLevel,
      goal: profile.goal
    });

    const age = new Date().getFullYear() - new Date(profile.birthDate).getFullYear();
    const genderCzech = profile.gender === 'female' ? 'žena' : 'muž';
    
    // Čitelný popis aktivity
    const activityLevels: Record<number, string> = {
      1: "Leží v posteli / naprostý klid",
      1.2: "Sedavé zaměstnání, minimální pohyb",
      1.375: "Lehká aktivita (1-3 dny/týden cvičení nebo 10k kroků)",
      1.55: "Střední aktivita (3-5 dní/týden cvičení)",
      1.725: "Vysoká aktivita (6-7 dní/týden cvičení)",
      1.9: "Extrémní aktivita (profesionální sport, těžká fyzická práce)"
    };

    const systemPrompt = `Jsi Mya, empatická a profesionální AI asistentka pro zdravý životní styl aplikace Nouri. 
Tvým úkolem je na základě vypočítaných dat vygenerovat motivující "Vstupní diagnózu" (Report).
Mluv česky, buď povzbuzující, ale věcná. Používej emoji. 

DŮLEŽITÉ FORMÁTOVÁNÍ:
1. NIKDY nepoužívej markdown tabulky (|---|). Na mobilu jsou nečitelné.
2. Místo tabulek používej přehledné odrážky nebo tučný text pro klíčové hodnoty.
3. Používej strukturu:
   - ### 1. Analýza současného stavu (BMR, TDEE)
   - ### 2. Doporučený denní příjem a proč (vysvětli deficit/přebytek)
   - ### 3. Konkrétní tipy pro tebe (bílkoviny, kroky, voda)
   - ### 4. Přehled scénářů (Rychlý progres, Ideální balanc, Udržování) - zde použij odrážky, ne tabulku!`;

    const userPrompt = `Data uživatele:
Jméno: ${profile.name}
Pohlaví: ${genderCzech}
Věk: ${age} let
Výška: ${profile.height} cm
Váha: ${profile.weight} kg
Aktivita: ${activityLevels[profile.activityLevel] || profile.activityLevel}
Cíl: ${profile.goal === 'lose' ? 'Hubnout' : profile.goal === 'gain' ? 'Nabírat svaly' : 'Udržovat váhu'}
BMR: ${results.bmr} kcal
TDEE: ${results.tdee} kcal
Cílový příjem (Nouri výpočet): ${results.targetCalories} kcal
Doporučené bílkoviny: ${results.macros.protein} g

Prosím o vygenerování reportu ve stylu seniorního nutričního poradce.`;

    try {
      if (!OPENAI_API_KEY) throw new Error("Missing OpenAI API Key");

      const response = await fetch(OPENAI_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${OPENAI_API_KEY}`
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt }
          ],
          temperature: 0.7
        })
      });

      if (response.status === 429) {
        throw new Error("Rate limit exceeded. Try again in a minute.");
      }

      const json = await response.json();
      
      if (!json.choices) throw new Error("Invalid AI response");

      return {
        text: json.choices[0].message.content,
        data: results
      };
    } catch (error) {
      console.error("Mya AI Error:", error);
      return {
        text: "Mya právě odpočívá (OpenAI limit). Tvůj plán: Jez " + results.targetCalories + " kcal denně a soustřeď se na bílkoviny (" + results.macros.protein + "g).",
        data: results
      };
    }
  },

  /**
   * Vygeneruje krátkou proaktivní zprávu pro Home screen
   */
  async getDailyGreeting(profile: UserProfile, consumedToday: number): Promise<string> {
    const remaining = profile.targetCalories - consumedToday;
    
    const systemPrompt = `Jsi Mya z aplikace Nouri. Piš krátké, úderné a motivující zprávy (max 2 věty). 
Zohledni aktuální stav uživatele.`;

    const userPrompt = `Uživatel: ${profile.name}. Cíl: ${profile.targetCalories} kcal. Dnes snědeno: ${consumedToday} kcal. Zbývá: ${remaining} kcal.`;

    try {
      if (!OPENAI_API_KEY) return "Krásný den! Jak se dnes cítíš?";

      const response = await fetch(OPENAI_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${OPENAI_API_KEY}`
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt }
          ],
          max_tokens: 100
        })
      });

      if (response.status === 429) return "Dneska ti to sekne! Nezapomeň si zapisovat všechna jídla. ✨";

      const json = await response.json();
      return json.choices?.[0]?.message?.content || "Krásný den! Jak se dnes daří?";
    } catch (error) {
      return `Ahoj ${profile.name}! Nezapomeň si dnes zapsat všechna jídla.`;
    }
  }
};
