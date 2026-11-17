import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { zustandStorage } from './storage';

/** User preference: spoken coaching cues on/off (captions are always shown). */
export const useVoicePref = create<{ voice: boolean; toggle: () => void }>()(
  persist((set) => ({ voice: true, toggle: () => set((s) => ({ voice: !s.voice })) }), {
    name: 'lb-voice',
    storage: createJSONStorage(() => zustandStorage),
  }),
);

type SpeechModule = { speak: (t: string, o?: Record<string, unknown>) => void; stop: () => void };
let speech: SpeechModule | null | undefined;

/** Lazily loads expo-speech; a dev build compiled before it was added simply stays silent (captions still show). */
function load(): SpeechModule | null {
  if (speech !== undefined) return speech;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    speech = require('expo-speech') as SpeechModule;
  } catch {
    speech = null;
  }
  return speech;
}

/** Speaks a coaching cue (VISUALS.md §4.1). Pre-generated voice files replace TTS later. */
export function say(text: string) {
  if (!useVoicePref.getState().voice) return;
  try {
    const s = load();
    s?.stop();
    s?.speak(text, { rate: 1.02, pitch: 1.0 });
  } catch {
    // native module missing in this build: captions carry the cue
  }
}

export function silence() {
  try {
    load()?.stop();
  } catch {
    /* noop */
  }
}
