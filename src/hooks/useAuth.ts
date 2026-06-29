import { useState, useEffect, useCallback, useMemo } from "react";
import { Alert, Vibration, Platform } from "react-native";
import * as LocalAuthentication from "expo-local-authentication";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useUser } from "../context/UserContext";
import { AuthService } from "../services/AuthService";
import * as Haptics from "expo-haptics";

// === INTERFACES ===
export interface AuthState {
  isLoading: boolean;
  error: string | null;
  attempts: number;
  lockoutTime: number;
  biometricAvailable: boolean;
  biometricType: "fingerprint" | "face" | "iris" | "none";
  isAuthenticated: boolean;
  user: any;
  lastLogin: string | null;
  isChecking: boolean;
}

export interface LoginCredentials {
  username: string;
  password: string;
  rememberMe?: boolean;
}

export interface LoginResult {
  success: boolean;
  message?: string;
  requiresTwoFactor?: boolean;
}

export interface UseAuthReturn {
  state: AuthState;
  login: (credentials: LoginCredentials) => Promise<LoginResult>;
  logout: () => Promise<void>;
  biometricLogin: () => Promise<LoginResult>;
  checkSession: () => Promise<boolean>;
  resetAttempts: () => Promise<void>;
  changePassword: (oldPassword: string, newPassword: string) => Promise<boolean>;
  resetPassword: (email: string) => Promise<boolean>;
  checkBiometric: () => Promise<boolean>;
  registerBiometric: () => Promise<boolean>;
}

// === CONSTANTES ===
const MAX_ATTEMPTS = 5;
const LOCKOUT_DURATION = 300; // 5 minutes en secondes
const STORAGE_KEYS = {
  LOGIN_ATTEMPTS: "@stockia_login_attempts",
  LOCKOUT_TIME: "@stockia_lockout_time",
  LAST_LOGIN: "@stockia_last_login",
  BIOMETRIC_ENABLED: "@stockia_biometric_enabled",
};

// ============================================
// 📁 HOOK AUTH
// ============================================

export function useAuth(): UseAuthReturn {
  const { user, setUser, logout: contextLogout } = useUser();

  // === ÉTATS ===
  const [state, setState] = useState<AuthState>({
    isLoading: false,
    error: null,
    attempts: 0,
    lockoutTime: 0,
    biometricAvailable: false,
    biometricType: "none",
    isAuthenticated: false,
    user: null,
    lastLogin: null,
    isChecking: false,
  });

  // === DÉCOMPTE DU VERROUILLAGE ===
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (state.lockoutTime > 0) {
      interval = setInterval(() => {
        setState((prev) => {
          if (prev.lockoutTime <= 1) {
            AsyncStorage.removeItem(STORAGE_KEYS.LOCKOUT_TIME);
            return { ...prev, lockoutTime: 0, attempts: 0 };
          }
          return { ...prev, lockoutTime: prev.lockoutTime - 1 };
        });
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [state.lockoutTime]);

  // === INITIALISATION ===
  useEffect(() => {
    initializeAuth();
  }, []);

  const initializeAuth = async () => {
    try {
      const attemptsData = await AsyncStorage.getItem(STORAGE_KEYS.LOGIN_ATTEMPTS);
      if (attemptsData) {
        const parsed = JSON.parse(attemptsData);
        setState((prev) => ({ ...prev, attempts: parsed.count || 0 }));
      }

      const lockoutData = await AsyncStorage.getItem(STORAGE_KEYS.LOCKOUT_TIME);
      if (lockoutData) {
        const lockTime = parseInt(lockoutData);
        const elapsed = Math.floor((Date.now() - lockTime) / 1000);
        const remaining = LOCKOUT_DURATION - elapsed;
        if (remaining > 0) {
          setState((prev) => ({ ...prev, lockoutTime: remaining }));
        } else {
          await AsyncStorage.removeItem(STORAGE_KEYS.LOCKOUT_TIME);
        }
      }

      await checkBiometric();
      await checkSession();

      const lastLogin = await AsyncStorage.getItem(STORAGE_KEYS.LAST_LOGIN);
      if (lastLogin) {
        setState((prev) => ({ ...prev, lastLogin }));
      }
    } catch (error) {
      console.error("[useAuth] Erreur initialisation:", error);
    }
  };

  // === ENREGISTRER UNE TENTATIVE ===
  const recordAttempt = useCallback(async () => {
    const newAttempts = state.attempts + 1;
    setState((prev) => ({ ...prev, attempts: newAttempts }));

    await AsyncStorage.setItem(STORAGE_KEYS.LOGIN_ATTEMPTS, JSON.stringify({ count: newAttempts, lastAttempt: Date.now() }));

    if (newAttempts >= MAX_ATTEMPTS) {
      const lockTime = Date.now();
      await AsyncStorage.setItem(STORAGE_KEYS.LOCKOUT_TIME, lockTime.toString());
      setState((prev) => ({
        ...prev,
        lockoutTime: LOCKOUT_DURATION,
      }));
      throw new Error(`Compte verrouillé pour ${LOCKOUT_DURATION / 60} minutes.`);
    }
  }, [state.attempts]);

  // === RÉINITIALISER LES TENTATIVES ===
  const resetAttempts = useCallback(async () => {
    setState((prev) => ({ ...prev, attempts: 0, lockoutTime: 0 }));
    await AsyncStorage.removeItem(STORAGE_KEYS.LOGIN_ATTEMPTS);
    await AsyncStorage.removeItem(STORAGE_KEYS.LOCKOUT_TIME);
  }, []);

  // === VÉRIFICATION DE LA BIOMÉTRIE ===
  const checkBiometric = useCallback(async (): Promise<boolean> => {
    try {
      const compatible = await LocalAuthentication.hasHardwareAsync();
      const enrolled = await LocalAuthentication.isEnrolledAsync();

      if (compatible && enrolled) {
        const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
        let biometricType: AuthState["biometricType"] = "none";

        if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
          biometricType = "fingerprint";
        } else if (types.includes(LocalAuthentication.AuthenticationType.FACE)) {
          biometricType = "face";
        } else if (types.includes(LocalAuthentication.AuthenticationType.IRIS)) {
          biometricType = "iris";
        }

        setState((prev) => ({
          ...prev,
          biometricAvailable: true,
          biometricType,
        }));
        return true;
      }

      setState((prev) => ({
        ...prev,
        biometricAvailable: false,
        biometricType: "none",
      }));
      return false;
    } catch (error) {
      console.error("[useAuth] Erreur checkBiometric:", error);
      return false;
    }
  }, []);

  // === CONNEXION ===
  const login = useCallback(
    async (credentials: LoginCredentials): Promise<LoginResult> => {
      const { username, password, rememberMe = false } = credentials;

      if (state.lockoutTime > 0) {
        return {
          success: false,
          message: `Compte verrouillé. Veuillez patienter ${Math.ceil(state.lockoutTime / 60)} minutes.`,
        };
      }

      if (!username.trim() || !password.trim()) {
        return {
          success: false,
          message: "Veuillez remplir tous les champs.",
        };
      }

      try {
        setState((prev) => ({ ...prev, isLoading: true, error: null }));

        await AuthService.logAction(0, "LOGIN_ATTEMPT", `Tentative pour ${username}`);

        const session = await AuthService.login(username.trim(), password.trim());

        await resetAttempts();

        setUser(session);
        setState((prev) => ({
          ...prev,
          isAuthenticated: true,
          user: session,
          lastLogin: new Date().toISOString(),
          error: null,
        }));

        await AsyncStorage.setItem(STORAGE_KEYS.LAST_LOGIN, new Date().toISOString());

        await AuthService.logAction(session.id, "LOGIN_SUCCESS", "Connexion réussie");

        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Vibration.vibrate(50);

        return { success: true };
      } catch (error: any) {
        await recordAttempt();

        const errorMessage = error.message || "Identifiants invalides.";

        await AuthService.logAction(0, "LOGIN_FAILED", errorMessage);

        setState((prev) => ({
          ...prev,
          error: errorMessage,
          isLoading: false,
        }));

        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        Vibration.vibrate(200);

        return {
          success: false,
          message: errorMessage,
        };
      } finally {
        setState((prev) => ({ ...prev, isLoading: false }));
      }
    },
    [state.lockoutTime, state.attempts, recordAttempt, resetAttempts, setUser]
  );

  // === AUTHENTIFICATION BIOMÉTRIQUE ===
  const biometricLogin = useCallback(async (): Promise<LoginResult> => {
    if (!state.biometricAvailable) {
      return {
        success: false,
        message: "La biométrie n'est pas disponible sur cet appareil.",
      };
    }

    if (state.lockoutTime > 0) {
      return {
        success: false,
        message: `Compte verrouillé. Veuillez patienter ${Math.ceil(state.lockoutTime / 60)} minutes.`,
      };
    }

    try {
      setState((prev) => ({ ...prev, isLoading: true }));

      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: "Authentification Stockia",
        fallbackLabel: "Utiliser le mot de passe",
        cancelLabel: "Annuler",
        disableDeviceFallback: false,
      });

      if (!result.success) {
        if (result.error !== "user_cancel") {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
          Vibration.vibrate(200);
        }
        return {
          success: false,
          message: result.error || "Authentification biométrique échouée.",
        };
      }

      const username = await AsyncStorage.getItem("@stockia_username");
      const password = await AsyncStorage.getItem("@stockia_password");

      if (!username || !password) {
        return {
          success: false,
          message: "Aucun identifiant sauvegardé. Connectez-vous avec votre mot de passe.",
        };
      }

      const loginResult = await login({
        username,
        password,
        rememberMe: true,
      });

      if (loginResult.success) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Vibration.vibrate(50);
      }

      return loginResult;
    } catch (error: any) {
      console.error("[useAuth] Erreur biométrique:", error);
      return {
        success: false,
        message: error.message || "Erreur lors de l'authentification biométrique.",
      };
    } finally {
      setState((prev) => ({ ...prev, isLoading: false }));
    }
  }, [state.biometricAvailable, state.lockoutTime, login]);

  // === DÉCONNEXION ===
  const logout = useCallback(async (): Promise<void> => {
    try {
      setState((prev) => ({ ...prev, isLoading: true }));

      await AuthService.logout();
      await contextLogout();

      setState((prev) => ({
        ...prev,
        isAuthenticated: false,
        user: null,
        isLoading: false,
        error: null,
      }));

      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      Vibration.vibrate(30);

      console.log("[useAuth] Déconnexion réussie");
    } catch (error) {
      console.error("[useAuth] Erreur déconnexion:", error);
      setState((prev) => ({
        ...prev,
        isAuthenticated: false,
        user: null,
        isLoading: false,
      }));
      await contextLogout();
    }
  }, [contextLogout]);

  // === VÉRIFICATION DE SESSION ===
  const checkSession = useCallback(async (): Promise<boolean> => {
    try {
      setState((prev) => ({ ...prev, isChecking: true }));

      const { valid, user: sessionUser } = await AuthService.checkSession();

      if (valid && sessionUser) {
        setState((prev) => ({
          ...prev,
          isAuthenticated: true,
          user: sessionUser,
          isChecking: false,
        }));
        return true;
      }

      setState((prev) => ({
        ...prev,
        isAuthenticated: false,
        user: null,
        isChecking: false,
      }));
      return false;
    } catch (error) {
      console.error("[useAuth] Erreur checkSession:", error);
      setState((prev) => ({ ...prev, isChecking: false }));
      return false;
    }
  }, []);

  // === CHANGEMENT DE MOT DE PASSE ===
  const changePassword = useCallback(
    async (oldPassword: string, newPassword: string): Promise<boolean> => {
      if (!state.user) {
        Alert.alert("Erreur", "Vous devez être connecté pour changer votre mot de passe.");
        return false;
      }

      try {
        setState((prev) => ({ ...prev, isLoading: true }));

        const success = await AuthService.changePassword(state.user.id, oldPassword, newPassword);

        if (success) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          Alert.alert("Succès", "Votre mot de passe a été modifié avec succès.");
        }

        return success;
      } catch (error: any) {
        Alert.alert("Erreur", error.message || "Impossible de changer le mot de passe.");
        return false;
      } finally {
        setState((prev) => ({ ...prev, isLoading: false }));
      }
    },
    [state.user]
  );

  // === RÉINITIALISATION DU MOT DE PASSE ===
  const resetPassword = useCallback(async (email: string): Promise<boolean> => {
    try {
      setState((prev) => ({ ...prev, isLoading: true }));

      const token = await AuthService.requestPasswordReset(email);

      if (token) {
        Alert.alert("Email envoyé", "Un lien de réinitialisation a été envoyé à votre adresse email.");
        return true;
      }

      Alert.alert("Erreur", "Impossible d'envoyer l'email de réinitialisation.");
      return false;
    } catch (error: any) {
      Alert.alert("Erreur", error.message || "Impossible de réinitialiser le mot de passe.");
      return false;
    } finally {
      setState((prev) => ({ ...prev, isLoading: false }));
    }
  }, []);

  // === ENREGISTRER LA BIOMÉTRIE ===
  const registerBiometric = useCallback(async (): Promise<boolean> => {
    try {
      const available = await checkBiometric();
      if (!available) {
        Alert.alert("Non disponible", "La biométrie n'est pas disponible sur cet appareil.");
        return false;
      }

      await AsyncStorage.setItem(STORAGE_KEYS.BIOMETRIC_ENABLED, "true");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      Alert.alert("Succès", "Authentification biométrique activée.");

      return true;
    } catch (error) {
      console.error("[useAuth] Erreur registerBiometric:", error);
      Alert.alert("Erreur", "Impossible d'activer la biométrie.");
      return false;
    }
  }, [checkBiometric]);

  // === VALEURS MÉMOISÉES ===
  const value = useMemo<UseAuthReturn>(
    () => ({
      state,
      login,
      logout,
      biometricLogin,
      checkSession,
      resetAttempts,
      changePassword,
      resetPassword,
      checkBiometric,
      registerBiometric,
    }),
    [
      state,
      login,
      logout,
      biometricLogin,
      checkSession,
      resetAttempts,
      changePassword,
      resetPassword,
      checkBiometric,
      registerBiometric,
    ]
  );

  return value;
}

// ============================================
// 📁 HOOKS DÉRIVÉS
// ============================================

export function useIsAuthenticated(): boolean {
  const { state } = useAuth();
  return state.isAuthenticated;
}

export function useCurrentUser() {
  const { state } = useAuth();
  return state.user;
}

export function useBiometricAvailable(): boolean {
  const { state } = useAuth();
  return state.biometricAvailable;
}

export function useAuthError(): string | null {
  const { state } = useAuth();
  return state.error;
}

export function useAuthLoading(): boolean {
  const { state } = useAuth();
  return state.isLoading;
}

export default useAuth; 