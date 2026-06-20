import React, { createContext, useState, useEffect, useCallback } from 'react';
import type { ReactNode } from 'react';
import { generateKeyPair, keyPairFromSecretKey, toHex, toBase58, fingerprint } from '../crypto';

export interface UserIdentity {
  username: string;
  peerId: string;
  publicKeyHex: string;
  secretKeyHex: string;
  solanaAddress: string;
  fingerprint: string;
}

interface AuthContextType {
  identity: UserIdentity | null;
  register: (username: string, existingSecretKeyHex?: string) => UserIdentity;
  logout: () => void;
}

export const AuthContext = createContext<AuthContextType>({
  identity: null,
  register: () => { throw new Error('not ready'); },
  logout: () => {},
});

// sessionStorage: each browser tab gets its own identity (required for P2P demo)
const STORAGE_KEY = 'dm-identity-v1';

function buildIdentity(username: string, secretKeyHex?: string): UserIdentity {
  const kp = secretKeyHex ? keyPairFromSecretKey(secretKeyHex) : generateKeyPair();
  const pubHex = toHex(kp.publicKey);
  const secHex = toHex(kp.secretKey);
  return {
    username,
    peerId: pubHex.slice(0, 16),
    publicKeyHex: pubHex,
    secretKeyHex: secHex,
    solanaAddress: toBase58(kp.publicKey),
    fingerprint: fingerprint(kp.publicKey),
  };
}

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [identity, setIdentity] = useState<UserIdentity | null>(null);

  useEffect(() => {
    const stored = sessionStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        setIdentity(JSON.parse(stored));
      } catch {
        sessionStorage.removeItem(STORAGE_KEY);
      }
    }
  }, []);

  const register = useCallback((username: string, existingSecretKeyHex?: string): UserIdentity => {
    const id = buildIdentity(username, existingSecretKeyHex);
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(id));
    setIdentity(id);
    return id;
  }, []);

  const logout = useCallback(() => {
    sessionStorage.removeItem(STORAGE_KEY);
    setIdentity(null);
  }, []);

  return (
    <AuthContext.Provider value={{ identity, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
};
