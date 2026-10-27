import React, { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { fetchAccessStatus, submitAccessCode, submitLogout, type AccessStatusResponse } from './accessApi.js';
import { AccessScreen } from './AccessScreen.js';

interface AccessContextType {
  status: AccessStatusResponse | null;
  loading: boolean;
  login: (code: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  refreshStatus: () => Promise<void>;
}

const AccessContext = createContext<AccessContextType | null>(null);

export function useAccess(): AccessContextType {
  const ctx = useContext(AccessContext);
  if (!ctx) {
    throw new Error('useAccess must be used within an AccessGate');
  }
  return ctx;
}

interface AccessGateProps {
  children: ReactNode;
}

export const AccessGate: React.FC<AccessGateProps> = ({ children }) => {
  const [status, setStatus] = useState<AccessStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshStatus = useCallback(async () => {
    try {
      const data = await fetchAccessStatus();
      setStatus(data);
    } catch {
      // If network fails to fetch status, assume no gate (or preserve existing)
      setStatus((prev) => prev ?? { required: false, authenticated: true });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshStatus();
  }, [refreshStatus]);

  // Listen for global 401 AUTH_REQUIRED from any API request
  useEffect(() => {
    const handleAuthRequired = () => {
      setStatus({ required: true, authenticated: false });
    };

    window.addEventListener('ripple:auth_required', handleAuthRequired);
    return () => window.removeEventListener('ripple:auth_required', handleAuthRequired);
  }, []);

  const login = useCallback(
    async (code: string) => {
      const res = await submitAccessCode(code);
      if (res.success) {
        setStatus({ required: true, authenticated: true });
      }
      return res;
    },
    []
  );

  const logout = useCallback(async () => {
    await submitLogout();
    setStatus({ required: true, authenticated: false });
  }, []);

  if (loading) {
    return (
      <div
        data-testid="access-gate-loading"
        className="min-h-screen w-full flex items-center justify-center bg-theme-bg"
      >
        <div className="w-8 h-8 rounded-full border-2 border-forest border-t-transparent animate-spin" />
      </div>
    );
  }

  if (status && status.required && !status.authenticated) {
    return <AccessScreen onSubmit={login} />;
  }

  return (
    <AccessContext.Provider value={{ status, loading, login, logout, refreshStatus }}>
      {children}
    </AccessContext.Provider>
  );
};
