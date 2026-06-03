import { create } from "zustand";
import type { InvestmentAIResponse } from "@/services/investmentApi";

export type UserMessage = { id: string; role: "user"; text: string; ts: number };
export type EllyMessage =
  | { id: string; role: "elly"; state: "loading";                               ts: number }
  | { id: string; role: "elly"; state: "done";  response: InvestmentAIResponse; ts: number }
  | { id: string; role: "elly"; state: "error"; error: string;                  ts: number };
export type ChatMessage = UserMessage | EllyMessage;

interface Store {
  messages:       ChatMessage[];
  pushUser:       (text: string) => void;
  pushLoading:    () => string;
  resolveLoading: (id: string, response: InvestmentAIResponse) => void;
  failLoading:    (id: string, error: string) => void;
  clear:          () => void;
}

let seq = 0;
const uid = () => `${Date.now()}-${++seq}`;

export const useInvestmentChatStore = create<Store>((set) => ({
  messages: [],

  pushUser: (text) => set((s) => ({
    messages: [...s.messages, { id: uid(), role: "user", text, ts: Date.now() }],
  })),

  pushLoading: () => {
    const id = uid();
    set((s) => ({
      messages: [...s.messages, { id, role: "elly", state: "loading", ts: Date.now() }],
    }));
    return id;
  },

  resolveLoading: (id, response) => set((s) => ({
    messages: s.messages.map((m) =>
      m.id === id
        ? { id: m.id, role: "elly" as const, state: "done" as const, response, ts: m.ts }
        : m,
    ),
  })),

  failLoading: (id, error) => set((s) => ({
    messages: s.messages.map((m) =>
      m.id === id
        ? { id: m.id, role: "elly" as const, state: "error" as const, error, ts: m.ts }
        : m,
    ),
  })),

  clear: () => set({ messages: [] }),
}));
