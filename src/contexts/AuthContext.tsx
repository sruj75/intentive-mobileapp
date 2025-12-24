import React, { createContext, useContext, useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { Session, User } from '@supabase/supabase-js';
import * as WebBrowser from 'expo-web-browser';
import * as AuthSession from 'expo-auth-session';
import { supabase } from '../lib/supabase';

WebBrowser.maybeCompleteAuthSession();

const GOOGLE_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID;
const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || 'http://localhost:3001';

if (!GOOGLE_CLIENT_ID) {
  throw new Error('EXPO_PUBLIC_GOOGLE_CLIENT_ID environment variable is required');
}

const discovery = {
  authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenEndpoint: 'https://oauth2.googleapis.com/token',
  revocationEndpoint: 'https://oauth2.googleapis.com/revoke',
};

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  authLoading: boolean;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  isReady: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [authLoading, setAuthLoading] = useState(false);
  
  // Track which authorization codes we've already processed to prevent duplicate calls
  const processedCodesRef = useRef<Set<string>>(new Set());

  // Bug 1 Fix: Memoize redirectUri to prevent recreation on every render
  const redirectUri = useMemo(() => AuthSession.makeRedirectUri({
    scheme: 'paratherapy',
  }), []);

  const [request, response, promptAsync] = AuthSession.useAuthRequest(
    {
      clientId: GOOGLE_CLIENT_ID,
      redirectUri,
      scopes: [
        'openid',
        'profile',
        'email',
        'https://www.googleapis.com/auth/calendar',
        'https://www.googleapis.com/auth/calendar.events',
      ],
      responseType: AuthSession.ResponseType.Code,
      usePKCE: true,
      extraParams: {
        access_type: 'offline',
        prompt: 'consent',
      },
    },
    discovery
  );

  // Handle OAuth response
  const handleAuthResponse = useCallback(async (code: string) => {
    // Prevent processing the same code multiple times
    if (processedCodesRef.current.has(code)) {
      return;
    }
    processedCodesRef.current.add(code);
    
    setAuthLoading(true);
    try {
      // Step 1: Exchange code for tokens via backend (no userId yet)
      const tokenResponse = await fetch(`${BACKEND_URL}/api/sync/tokens`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code,
          redirectUri,
        }),
      });

      if (!tokenResponse.ok) {
        throw new Error('Failed to exchange code for tokens');
      }

      const { idToken, googleTokens } = await tokenResponse.json();

      if (!idToken) {
        throw new Error('No ID token received from Google');
      }

      // Step 2: Sign in to Supabase with the Google ID token
      const { data, error: signInError } = await supabase.auth.signInWithIdToken({
        provider: 'google',
        token: idToken,
      });

      if (signInError) throw signInError;

      if (!data.user) {
        throw new Error('Failed to create Supabase user');
      }

      // Step 3: Store Google tokens for calendar sync
      const storeResponse = await fetch(`${BACKEND_URL}/api/sync/tokens`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${data.session?.access_token}`
        },
        body: JSON.stringify({
          userId: data.user.id,
          accessToken: googleTokens.accessToken,
          refreshToken: googleTokens.refreshToken,
          expiresAt: googleTokens.expiresAt,
        }),
      });

      if (!storeResponse.ok) {
        console.error('Failed to store Google tokens for calendar sync');
      }

      console.log('Successfully signed in with Google');
    } catch (error) {
      console.error('Google sign-in error:', error);
      throw error;
    } finally {
      setAuthLoading(false);
    }
  }, [redirectUri]);

  // Listen for OAuth response
  useEffect(() => {
    if (response?.type === 'success') {
      handleAuthResponse(response.params.code);
    } else if (response?.type === 'error' || response?.type === 'dismiss') {
      // Handle cancelled or errored OAuth flow
      setAuthLoading(false);
    }
  }, [response, handleAuthResponse]);

  useEffect(() => {
    // Check active session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Bug 2 Fix: Don't check stale response state in finally block
  const signInWithGoogle = async () => {
    setAuthLoading(true);
    try {
      const result = await promptAsync();
      // If the user cancelled or there was an error, reset loading state
      // The success case is handled by the useEffect watching response
      if (result.type !== 'success') {
        setAuthLoading(false);
      }
    } catch (error) {
      setAuthLoading(false);
      throw error;
    }
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  };

  return (
    <AuthContext.Provider value={{ 
      user, 
      session, 
      loading, 
      authLoading,
      signInWithGoogle, 
      signOut,
      isReady: !!request,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
