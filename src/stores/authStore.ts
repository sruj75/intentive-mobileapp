import { create } from 'zustand';
import { Session, User } from '@supabase/supabase-js';
import * as WebBrowser from 'expo-web-browser';
import * as AuthSession from 'expo-auth-session';
import { supabase } from '../lib/supabase';
import { useEffect, useRef } from 'react';

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

interface AuthState {
    user: User | null;
    session: Session | null;
    loading: boolean;
    authLoading: boolean;
    isReady: boolean;
    request: AuthSession.AuthRequest | null;
    promptAsync: (() => Promise<AuthSession.AuthSessionResult>) | null;
    processedCodes: Set<string>;

    // Actions
    setUser: (user: User | null) => void;
    setSession: (session: Session | null) => void;
    setLoading: (loading: boolean) => void;
    setAuthLoading: (authLoading: boolean) => void;
    setIsReady: (isReady: boolean) => void;
    setRequest: (request: AuthSession.AuthRequest | null) => void;
    setPromptAsync: (promptAsync: (() => Promise<AuthSession.AuthSessionResult>) | null) => void;
    handleAuthResponse: (code: string, codeVerifier: string) => Promise<void>;
    signInWithGoogle: () => Promise<void>;
    signOut: () => Promise<void>;
    initializeAuth: () => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
    user: null,
    session: null,
    loading: true,
    authLoading: false,
    isReady: false,
    request: null,
    promptAsync: null,
    processedCodes: new Set(),

    setUser: (user) => set({ user }),
    setSession: (session) => set({ session }),
    setLoading: (loading) => set({ loading }),
    setAuthLoading: (authLoading) => set({ authLoading }),
    setIsReady: (isReady) => set({ isReady }),
    setRequest: (request) => set({ request }),
    setPromptAsync: (promptAsync) => set({ promptAsync }),

    handleAuthResponse: async (code: string, codeVerifier: string) => {
        const { processedCodes } = get();

        // Prevent processing the same code multiple times
        if (processedCodes.has(code)) {
            return;
        }

        const newProcessedCodes = new Set(processedCodes);
        newProcessedCodes.add(code);
        set({ processedCodes: newProcessedCodes, authLoading: true });

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
            set({ authLoading: false });
        }
    },

    signInWithGoogle: async () => {
        const { promptAsync } = get();
        if (!promptAsync) {
            throw new Error('Auth request not initialized');
        }

        set({ authLoading: true });
        try {
            const result = await promptAsync();
            // If the user cancelled or there was an error, reset loading state
            // The success case is handled by the useAuthSession hook
            if (result.type !== 'success') {
                set({ authLoading: false });
            }
        } catch (error) {
            set({ authLoading: false });
            throw error;
        }
    },

    signOut: async () => {
        const { error } = await supabase.auth.signOut();
        if (error) throw error;
    },

    initializeAuth: () => {
        // Check active session
        supabase.auth.getSession().then(({ data: { session } }) => {
            set({
                session,
                user: session?.user ?? null,
                loading: false,
            });
        });

        // Listen for auth changes
        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            set({
                session,
                user: session?.user ?? null,
                loading: false,
            });
        });

        // Return cleanup function
        return () => subscription.unsubscribe();
    },
}));

// Custom hook to handle OAuth session
export function useAuthSession() {
    const handleAuthResponse = useAuthStore((state) => state.handleAuthResponse);
    const setRequest = useAuthStore((state) => state.setRequest);
    const setPromptAsync = useAuthStore((state) => state.setPromptAsync);
    const setIsReady = useAuthStore((state) => state.setIsReady);
    const setAuthLoading = useAuthStore((state) => state.setAuthLoading);

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

    // Update store with auth request
    useEffect(() => {
        setRequest(request);
        if (promptAsync) {
            setPromptAsync(promptAsync as () => Promise<AuthSession.AuthSessionResult>);
        }
        setIsReady(!!request);
    }, [request, promptAsync, setRequest, setPromptAsync, setIsReady]);

    // Handle OAuth response
    useEffect(() => {
        if (response?.type === 'success' && request?.codeVerifier) {
            handleAuthResponse(response.params.code, request.codeVerifier);
        } else if (response?.type === 'error' || response?.type === 'dismiss') {
            // Handle cancelled or errored OAuth flow
            setAuthLoading(false);
        }
    }, [response, request, handleAuthResponse, setAuthLoading]);
}
