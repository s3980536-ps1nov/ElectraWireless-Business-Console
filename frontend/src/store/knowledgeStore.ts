import { create } from "zustand";
import { persist } from "zustand/middleware";

export type GoalStage = "identified" | "in_progress" | "done";
export type SourceFeature = "f1" | "f2" | "f3" | "manual";

export type KnowledgeChatMessage =
  | { id: string; role: "user"; text: string; ts: number }
  | { id: string; role: "elly"; state: "loading"; ts: number }
  | { id: string; role: "elly"; state: "done"; text: string; ts: number }
  | { id: string; role: "elly"; state: "error"; error: string; ts: number };

interface KnowledgeState {
  messages: KnowledgeChatMessage[];
  pushUser: (text: string) => void;
  pushLoading: () => string;
  resolveLoading: (id: string, text: string) => void;
  failLoading: (id: string, error: string) => void;
  clearChat: () => void;
}

let seq = 0;
const uid = () => `${Date.now()}-${++seq}`;

export const useKnowledgeStore = create<KnowledgeState>()(
  persist(
    (set) => ({
      messages: [],

      pushUser: (text) =>
        set((s) => ({
          messages: [
            ...s.messages,
            { id: uid(), role: "user", text, ts: Date.now() },
          ],
        })),

      pushLoading: () => {
        const id = uid();
        set((s) => ({
          messages: [
            ...s.messages,
            { id, role: "elly", state: "loading", ts: Date.now() },
          ],
        }));
        return id;
      },

      resolveLoading: (id, text) =>
        set((s) => ({
          messages: s.messages.map((m) =>
            m.id === id
              ? ({ id: m.id, role: "elly", state: "done", text, ts: m.ts } as const)
              : m,
          ),
        })),

      failLoading: (id, error) =>
        set((s) => ({
          messages: s.messages.map((m) =>
            m.id === id
              ? ({ id: m.id, role: "elly", state: "error", error, ts: m.ts } as const)
              : m,
          ),
        })),

      clearChat: () => set({ messages: [] }),
    }),
    {
      name: "elly-knowledge-v1",
      partialize: (state) => ({ messages: state.messages }),
    },
  ),
);
