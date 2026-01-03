import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useAuthStore } from '../stores/authStore';

export function AuthScreen() {
  const signInWithGoogle = useAuthStore((state) => state.signInWithGoogle);
  const authLoading = useAuthStore((state) => state.authLoading);
  const isReady = useAuthStore((state) => state.isReady);

  const handleGoogleSignIn = async () => {
    try {
      await signInWithGoogle();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'An unexpected error occurred';
      Alert.alert('Sign In Error', message);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.logo}>☀️</Text>
        <Text style={styles.title}>Intentive</Text>
        <Text style={styles.subtitle}>Your All-Day care for ADHD</Text>
      </View>

      <View style={styles.content}>
        <Text style={styles.description}>
          Sign in with your Google account to sync your calendar and manage your daily schedule.
        </Text>

        <TouchableOpacity
          style={[styles.googleButton, (!isReady || authLoading) && styles.buttonDisabled]}
          onPress={handleGoogleSignIn}
          disabled={!isReady || authLoading}
        >
          {authLoading ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <>
              <Svg width={20} height={20} viewBox="0 0 24 24">
                <Path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <Path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <Path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                />
                <Path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                />
              </Svg>
              <Text style={styles.googleButtonText}>Continue with Google</Text>
            </>
          )}
        </TouchableOpacity>

        <Text style={styles.footerText}>
          By signing in, you agree to sync your Google Calendar with Intentive
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0D0D0D',
    justifyContent: 'center',
    padding: 24,
  },
  header: {
    alignItems: 'center',
    marginBottom: 48,
  },
  logo: {
    fontSize: 64,
    marginBottom: 16,
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: -1,
  },
  subtitle: {
    fontSize: 16,
    color: '#8B8B8B',
    marginTop: 8,
  },
  content: {
    gap: 24,
  },
  description: {
    fontSize: 15,
    color: '#A0A0A0',
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: 12,
  },
  googleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    gap: 12,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  googleButtonText: {
    color: '#1A1A1A',
    fontSize: 16,
    fontWeight: '600',
  },
  footerText: {
    fontSize: 13,
    color: '#6B6B6B',
    textAlign: 'center',
    paddingHorizontal: 24,
    lineHeight: 18,
  },
});
