export interface ProcessingRunRegistry {
  begin(itemId: string): string;
  isActive(itemId: string, runId: string): boolean;
  finish(itemId: string, runId: string): void;
  cancelAll(): void;
}

export const createProcessingRunRegistry = (): ProcessingRunRegistry => {
  const activeRuns = new Map<string, string>();

  return {
    begin(itemId: string) {
      const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
      activeRuns.set(itemId, runId);
      return runId;
    },
    isActive(itemId: string, runId: string) {
      return activeRuns.get(itemId) === runId;
    },
    finish(itemId: string, runId: string) {
      if (activeRuns.get(itemId) === runId) {
        activeRuns.delete(itemId);
      }
    },
    cancelAll() {
      activeRuns.clear();
    },
  };
};
