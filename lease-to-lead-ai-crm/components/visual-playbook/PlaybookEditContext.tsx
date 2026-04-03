"use client";

import { createContext, useContext } from "react";

export type PlaybookEditContextValue = {
  isAdmin: boolean;
  updateNodeMessagePrompt: (nodeId: string, messagePrompt: string) => void;
};

export const PlaybookEditContext = createContext<PlaybookEditContextValue | null>(null);

export function usePlaybookEdit() {
  return useContext(PlaybookEditContext);
}
