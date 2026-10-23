import { useState, useCallback } from 'react';
import { api, getFriendlyErrorMessage } from './api.js';
import { useProjects } from './projectContext.js';

export function useRescan() {
  const [isScanning, setIsScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const { refresh } = useProjects();

  const rescan = useCallback(
    async (projectId: string, onComplete?: () => Promise<void> | void) => {
      if (isScanning) return;
      setIsScanning(true);
      setScanError(null);
      try {
        await api.scanProject(projectId);
        await refresh();
        if (onComplete) {
          await onComplete();
        }
      } catch (err: unknown) {
        const friendly = getFriendlyErrorMessage(err);
        setScanError(friendly);
        throw err;
      } finally {
        setIsScanning(false);
      }
    },
    [isScanning, refresh]
  );

  return { rescan, isScanning, scanError };
}
