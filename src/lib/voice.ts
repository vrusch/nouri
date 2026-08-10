import { httpsCallable } from "firebase/functions";
import { functions } from "./firebase";

const transcribeAudioFn = httpsCallable<{ audioDataUrl: string }, { text: string } | null>(
  functions,
  "transcribeAudio"
);

export const MyaVoice = {
  /**
   * Přepíše nahrávku řeči na text přes server-side Cloud Function (Whisper).
   * Vrací null jak při chybě, tak když se z nahrávky nepodařilo rozpoznat žádnou řeč.
   */
  async transcribeAudio(audioDataUrl: string): Promise<string | null> {
    try {
      const response = await transcribeAudioFn({ audioDataUrl });
      return response.data?.text ?? null;
    } catch (error) {
      console.error("Mya Voice Error:", error);
      return null;
    }
  },
};
