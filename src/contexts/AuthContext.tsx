import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { Session, User } from '@supabase/supabase-js';
import * as WebBrowser from 'expo-web-browser';
import * as AuthSession from 'expo-auth-session';
import { supabase } from '../lib/supabase';

WebBrowser.maybeCompleteAuthSession();

const GOOGLE_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID;
const GOOGLE_REDIRECT_URI = process.env.EXPO_PUBLIC_GOOGLE_REDIRECT_URI;
const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

if (!GOOGLE_CLIENT_ID) {
  throw new Error('EXPO_PUBLIC_GOOGLE_CLIENT_ID environment variable is required');
}

if (!GOOGLE_REDIRECT_URI) {
  throw new Error('EXPO_PUBLIC_GOOGLE_REDIRECT_URI environment variable is required');
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

  const [request, response, promptAsync] = AuthSession.useAuthRequest(
    {
      clientId: GOOGLE_CLIENT_ID,
      redirectUri: GOOGLE_REDIRECT_URI,
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

  // Handle OAuth response - exchange code for tokens directly on mobile using PKCE
  const handleAuthResponse = useCallback(async (code: string, codeVerifier: string) => {
    // Prevent processing the same code multiple times
    if (processedCodesRef.current.has(code)) {
      return;
    }
    processedCodesRef.current.add(code);

    setAuthLoading(true);
    try {
      // Step 1: Exchange code for tokens directly on mobile (PKCE - no client secret needed)
      const tokenResponse = await fetch(discovery.tokenEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: GOOGLE_CLIENT_ID!,
          code,
          code_verifier: codeVerifier,
          grant_type: 'authorization_code',
          redirect_uri: GOOGLE_REDIRECT_URI!,
        }).toString(),
      });

      if (!tokenResponse.ok) {
        const errorData = await tokenResponse.text();
        console.error('Token exchange error:', errorData);
        throw new Error('Failed to exchange code for tokens');
      }

      const tokens = await tokenResponse.json();
      const { id_token: idToken, access_token: accessToken, refresh_token: refreshToken, expires_in } = tokens;

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

      // Step 3: Store Google tokens for calendar sync via backend
      const expiresAt = new Date(Date.now() + (expires_in || 3600) * 1000).toISOString();
      const storeResponse = await fetch(`${BACKEND_URL}/api/sync/tokens`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${data.session?.access_token}`
        },
        body: JSON.stringify({
          userId: data.user.id,
          accessToken,
          refreshToken,
          expiresAt,
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
  }, []);

  // Listen for OAuth response
  useEffect(() => {
    if (response?.type === 'success' && request?.codeVerifier) {
      handleAuthResponse(response.params.code, request.codeVerifier);
    } else if (response?.type === 'error' || response?.type === 'dismiss') {
      // Handle cancelled or errored OAuth flow
      setAuthLoading(false);
    }
  }, [response, request, handleAuthResponse]);

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
