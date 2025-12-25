import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useAuth } from '../contexts/AuthContext';

export function AuthScreen() {
  const { signInWithGoogle, authLoading, isReady } = useAuth();

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
              <View style={styles.googleIconContainer}>
                <Text style={styles.googleIcon}>G</Text>
              </View>
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
  googleIconContainer: {
    width: 24,
    height: 24,
    borderRadius: 4,
    backgroundColor: '#4285F4',
    justifyContent: 'center',
    alignItems: 'center',
  },
  googleIcon: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
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
