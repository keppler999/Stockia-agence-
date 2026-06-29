import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Animated,
  Dimensions,
  Vibration,
  StatusBar,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as LocalAuthentication from "expo-local-authentication";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Device from "expo-device";
import { useUser } from "../context/UserContext";
import { AuthService } from "../services/AuthService";

const { height, width } = Dimensions.get("window");

// ============================================
// 📁 ÉCRAN DE CONNEXION
// ============================================

const LoginScreen: React.FC = () => {
  const { login, setUser } = useUser();

  // === ÉTATS ===
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [attempts, setAttempts] = useState(0);
  const [lockoutTime, setLockoutTime] = useState(0);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricType, setBiometricType] = useState<string>("");
  const [deviceId, setDeviceId] = useState("");

  // === ANIMATIONS ===
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(40)).current;
  const scaleAnim = useRef(new Animated.Value(0.97)).current;
  const shakeAnim = useRef(new Animated.Value(0)).current;

  // === RÉFÉRENCES ===
  const usernameInputRef = useRef<TextInput>(null);
  const passwordInputRef = useRef<TextInput>(null);

  // === DÉCOMPTE DU VERROUILLAGE ===
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (lockoutTime > 0) {
      interval = setInterval(() => {
        setLockoutTime((prev) => {
          if (prev <= 1) {
            AsyncStorage.removeItem("@stockia_lockout_time");
            setAttempts(0);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [lockoutTime]);

  // === INITIALISATION ===
  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 600, useNativeDriver: true }),
      Animated.spring(scaleAnim, { toValue: 1, friction: 8, tension: 40, useNativeDriver: true }),
    ]).start();

    initializeApp();
  }, []);

  const initializeApp = async () => {
    try {
      await getDeviceId();
      await checkBiometricAvailability();
      await loadSavedCredentials();
      await checkLockoutStatus();
    } catch (error) {
      console.error("[LoginScreen] Erreur initialisation:", error);
    }
  };

  // === RÉCUPÉRATION DE L'ID APPAREIL ===
  const getDeviceId = async () => {
    try {
      let id = await AsyncStorage.getItem("@stockia_device_id");
      if (!id) {
        const deviceId = (await Device.getDeviceIdAsync()) || "unknown";
        id = `STK-${deviceId.substring(0, 8)}-${Date.now().toString(36)}`;
        await AsyncStorage.setItem("@stockia_device_id", id);
      }
      setDeviceId(id);
    } catch (error) {
      console.error("[LoginScreen] Erreur device ID:", error);
      setDeviceId(`STK-${Date.now().toString(36)}`);
    }
  };

  // === VÉRIFICATION BIOMÉTRIQUE ===
  const checkBiometricAvailability = async () => {
    try {
      const compatible = await LocalAuthentication.hasHardwareAsync();
      const enrolled = await LocalAuthentication.isEnrolledAsync();

      if (compatible && enrolled) {
        const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
        setBiometricAvailable(true);

        if (types.includes(LocalAuthentication.AuthenticationType.FACE)) {
          setBiometricType("Face ID");
        } else if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
          setBiometricType("Empreinte digitale");
        } else {
          setBiometricType("Biométrie");
        }
      }
    } catch (error) {
      console.error("[LoginScreen] Erreur biométrique:", error);
    }
  };

  // === CHARGEMENT DES IDENTIFIANTS SAUVEGARDÉS ===
  const loadSavedCredentials = async () => {
    try {
      const savedUsername = await AsyncStorage.getItem("@stockia_username");
      const savedPassword = await AsyncStorage.getItem("@stockia_password");
      const savedRemember = await AsyncStorage.getItem("@stockia_remember");

      if (savedRemember === "true" && savedUsername) {
        setUsername(savedUsername);
        setRememberMe(true);
        if (savedPassword) setPassword(savedPassword);
      }
    } catch (error) {
      console.error("[LoginScreen] Erreur chargement credentials:", error);
    }
  };

  // === VÉRIFICATION DU VERROUILLAGE ===
  const checkLockoutStatus = async () => {
    try {
      const lockout = await AsyncStorage.getItem("@stockia_lockout_time");
      if (lockout) {
        const lockTime = parseInt(lockout);
        const elapsed = Date.now() - lockTime;
        const remaining = 300000 - elapsed;

        if (remaining > 0) {
          setLockoutTime(Math.ceil(remaining / 1000));
        } else {
          await AsyncStorage.removeItem("@stockia_lockout_time");
          setAttempts(0);
        }
      }
    } catch (error) {
      console.error("[LoginScreen] Erreur lockout:", error);
    }
  };

  // === ANIMATION DE SECOUSSE ===
  const shakeAnimation = () => {
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 10, duration: 100, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 100, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 10, duration: 100, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 100, useNativeDriver: true }),
    ]).start();
  };

  // === CONNEXION ===
  const performLogin = async (user: string, pass: string) => {
    setLoading(true);
    setErrorMessage("");

    try {
      const licenceCheck = await AuthService.checkLicenceStatus(deviceId);
      if (!licenceCheck.valid) {
        Alert.alert(
          "🔒 Licence invalide",
          licenceCheck.message || "Veuillez contacter le support pour activer votre licence."
        );
        setLoading(false);
        return;
      }

      const session = await AuthService.login(user, pass);

      if (rememberMe) {
        await AsyncStorage.setItem("@stockia_username", user);
        await AsyncStorage.setItem("@stockia_password", pass);
        await AsyncStorage.setItem("@stockia_remember", "true");
      } else {
        await AsyncStorage.multiRemove([
          "@stockia_username",
          "@stockia_password",
          "@stockia_remember",
        ]);
      }

      setAttempts(0);
      await AsyncStorage.removeItem("@stockia_lockout_time");
      setUser(session);
      Vibration.vibrate(50);

      await AuthService.logAction(session.id, "LOGIN_SUCCESS", `Connexion réussie depuis ${Platform.OS}`);
    } catch (error: any) {
      const newAttempts = attempts + 1;
      setAttempts(newAttempts);
      Vibration.vibrate(200);
      shakeAnimation();

      await AuthService.logAction(0, "LOGIN_FAILED", `Tentative échouée: ${user} - ${error.message}`);

      if (newAttempts >= 5) {
        const lockTime = Date.now();
        await AsyncStorage.setItem("@stockia_lockout_time", lockTime.toString());
        setLockoutTime(300);
        Alert.alert(
          "🔒 Sécurité Stockia",
          "Trop d'échecs consécutifs. Écran verrouillé pendant 5 minutes."
        );
      } else {
        setErrorMessage(error.message || "Identifiants invalides.");
      }
    } finally {
      setLoading(false);
    }
  };

  // === GESTIONNAIRE DE CONNEXION ===
  const handleLogin = async () => {
    if (lockoutTime > 0) {
      Alert.alert(
        "Accès Suspendu",
        `Veuillez patienter encore ${Math.ceil(lockoutTime / 60)} minutes.`
      );
      return;
    }

    if (!username.trim() || !password.trim()) {
      setErrorMessage("Veuillez saisir votre identifiant et votre mot de passe.");
      Vibration.vibrate(100);
      shakeAnimation();
      return;
    }

    await performLogin(username.trim(), password.trim());
  };

  // === AUTHENTIFICATION BIOMÉTRIQUE ===
  const handleBiometricAuth = async () => {
    if (!biometricAvailable) {
      Alert.alert("Non disponible", "La biométrie n'est pas configurée sur cet appareil.");
      return;
    }

    if (!username || !password) {
      Alert.alert(
        "Identifiants requis",
        "Veuillez saisir vos identifiants textuels au moins une fois."
      );
      return;
    }

    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: `🔐 Connexion Stockia par ${biometricType}`,
        fallbackLabel: "Utiliser le mot de passe",
        cancelLabel: "Annuler",
        disableDeviceFallback: false,
      });

      if (result.success) {
        Vibration.vibrate(50);
        await performLogin(username, password);
      }
    } catch (error) {
      console.error("[Biometric] Erreur:", error);
      Alert.alert("Erreur", "Impossible d'utiliser la biométrique.");
    }
  };

  // === CONNEXION RAPIDE (tap sur le logo) ===
  const handleQuickLogin = async () => {
    if (username && password && !loading && lockoutTime === 0) {
      await performLogin(username, password);
    }
  };

  // === FORMATAGE DU TEMPS DE VERROUILLAGE ===
  const formatLockoutText = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs < 10 ? "0" : ""}${secs}`;
  };

  // ============================================
  // 📁 RENDU
  // ============================================

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={styles.container}
    >
      <StatusBar barStyle="light-content" backgroundColor="#1565C0" />

      <ScrollView
        contentContainerStyle={styles.scrollContainer}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Animated.View
          style={[
            styles.card,
            {
              opacity: fadeAnim,
              transform: [
                { translateY: slideAnim },
                { scale: scaleAnim },
                { translateX: shakeAnim },
              ],
            },
          ]}
        >
          {/* === LOGO === */}
          <TouchableOpacity
            style={styles.logoContainer}
            onPress={handleQuickLogin}
            activeOpacity={0.7}
            disabled={!username || !password || loading || lockoutTime > 0}
          >
            <View style={styles.logoIcon}>
              <Ionicons name="cube" size={40} color="#1565C0" />
            </View>
            <Text style={styles.title}>STOCKIA</Text>
            <Text style={styles.subtitle}>Gestion Commerciale Intelligente</Text>

            {username && password && !loading && lockoutTime === 0 && (
              <View style={styles.quickLoginHint}>
                <Ionicons name="flash" size={12} color="#1565C0" />
                <Text style={styles.quickLoginText}>Tap pour connexion rapide</Text>
              </View>
            )}
          </TouchableOpacity>

          {/* === MESSAGE D'ERREUR === */}
          {errorMessage ? (
            <View style={styles.errorContainer}>
              <Ionicons name="alert-circle" size={18} color="#D32F2F" />
              <Text style={styles.errorText}>{errorMessage}</Text>
            </View>
          ) : null}

          {/* === CHAMP IDENTIFIANT === */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>
              <Ionicons name="person-outline" size={14} color="#546E7A" /> Identifiant
            </Text>
            <View style={styles.inputWrapper}>
              <TextInput
                ref={usernameInputRef}
                style={styles.input}
                placeholder="Ex: admin, caissier1"
                placeholderTextColor="#90A4AE"
                value={username}
                onChangeText={(text) => {
                  setUsername(text);
                  setErrorMessage("");
                }}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="next"
                onSubmitEditing={() => passwordInputRef.current?.focus()}
                editable={lockoutTime === 0}
              />
              {username.length > 0 && (
                <TouchableOpacity onPress={() => setUsername("")} style={styles.clearButton}>
                  <Ionicons name="close-circle" size={18} color="#B0BEC5" />
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* === CHAMP MOT DE PASSE === */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>
              <Ionicons name="lock-closed-outline" size={14} color="#546E7A" /> Mot de passe
            </Text>
            <View style={styles.inputWrapper}>
              <TextInput
                ref={passwordInputRef}
                style={styles.input}
                placeholder="••••••••"
                placeholderTextColor="#90A4AE"
                value={password}
                onChangeText={(text) => {
                  setPassword(text);
                  setErrorMessage("");
                }}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="done"
                onSubmitEditing={handleLogin}
                editable={lockoutTime === 0}
              />
              <TouchableOpacity
                onPress={() => setShowPassword(!showPassword)}
                style={styles.eyeButton}
              >
                <Ionicons
                  name={showPassword ? "eye-outline" : "eye-off-outline"}
                  size={18}
                  color="#90A4AE"
                />
              </TouchableOpacity>
            </View>
          </View>

          {/* === OPTIONS === */}
          <View style={styles.optionsContainer}>
            <TouchableOpacity
              style={styles.rememberContainer}
              onPress={() => setRememberMe(!rememberMe)}
            >
              <View style={[styles.checkbox, rememberMe && styles.checkboxChecked]}>
                {rememberMe && <Ionicons name="checkmark" size={12} color="#FFFFFF" />}
              </View>
              <Text style={styles.rememberText}>Se souvenir de moi</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => {
                Alert.alert(
                  "Mot de passe oublié",
                  "Contactez votre administrateur pour réinitialiser votre mot de passe.",
                  [{ text: "OK" }]
                );
              }}
            >
              <Text style={styles.forgotText}>Mot de passe oublié ?</Text>
            </TouchableOpacity>
          </View>

          {/* === TENTATIVES === */}
          {attempts > 0 && lockoutTime === 0 && (
            <View style={styles.attemptsContainer}>
              <View style={styles.attemptsBar}>
                <View
                  style={[
                    styles.attemptsProgress,
                    { width: `${(attempts / 5) * 100}%` },
                    attempts >= 4 && styles.attemptsDanger,
                  ]}
                />
              </View>
              <Text style={styles.attemptsText}>
                {5 - attempts} tentative{5 - attempts > 1 ? "s" : ""} restante
                {5 - attempts > 1 ? "s" : ""}
              </Text>
            </View>
          )}

          {/* === BOUTON DE CONNEXION === */}
          <TouchableOpacity
            style={[styles.button, (loading || lockoutTime > 0) && styles.buttonDisabled]}
            onPress={handleLogin}
            disabled={loading || lockoutTime > 0}
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.buttonText}>
                {lockoutTime > 0
                  ? `🔒 Verrouillé (${formatLockoutText(lockoutTime)})`
                  : "Se connecter"}
              </Text>
            )}
          </TouchableOpacity>

          {/* === BOUTON BIOMÉTRIQUE === */}
          {biometricAvailable && username.length > 0 && password.length > 0 && lockoutTime === 0 && (
            <TouchableOpacity style={styles.biometricButton} onPress={handleBiometricAuth}>
              <Ionicons
                name={biometricType === "Face ID" ? "scan-outline" : "finger-print-outline"}
                size={22}
                color="#1565C0"
              />
              <Text style={styles.biometricText}>Utiliser {biometricType}</Text>
            </TouchableOpacity>
          )}

          {/* === FOOTER === */}
          <View style={styles.footerContainer}>
            <Text style={styles.footerText}>Spirale Agence — Mode Hors-ligne</Text>
            <Text style={styles.versionText}>v2.1.0</Text>
          </View>
        </Animated.View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

// ============================================
// 📁 STYLES
// ============================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#1565C0",
  },
  scrollContainer: {
    flexGrow: 1,
    justifyContent: "center",
    padding: 16,
    minHeight: height,
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 24,
    elevation: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
  },
  logoContainer: {
    alignItems: "center",
    marginBottom: 20,
  },
  logoIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "#E3F2FD",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 10,
  },
  title: {
    fontSize: 32,
    fontWeight: "bold",
    color: "#1565C0",
    letterSpacing: 2,
  },
  subtitle: {
    fontSize: 13,
    color: "#78909C",
    marginTop: 2,
  },
  quickLoginHint: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 6,
    backgroundColor: "#E3F2FD",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  quickLoginText: {
    fontSize: 10,
    color: "#1565C0",
    fontWeight: "500",
  },
  errorContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFEBEE",
    padding: 10,
    borderRadius: 8,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "#FFCDD2",
  },
  errorText: {
    flex: 1,
    fontSize: 12,
    color: "#D32F2F",
    marginLeft: 6,
  },
  inputGroup: {
    marginBottom: 14,
  },
  label: {
    fontSize: 13,
    fontWeight: "600",
    color: "#37474F",
    marginBottom: 6,
    flexDirection: "row",
    alignItems: "center",
  },
  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F8F9FA",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#CFD8DC",
  },
  input: {
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: "#263238",
  },
  clearButton: {
    paddingHorizontal: 8,
  },
  eyeButton: {
    paddingHorizontal: 10,
  },
  optionsContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  rememberContainer: {
    flexDirection: "row",
    alignItems: "center",
  },
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: "#90A4AE",
    marginRight: 6,
    justifyContent: "center",
    alignItems: "center",
  },
  checkboxChecked: {
    backgroundColor: "#1565C0",
    borderColor: "#1565C0",
  },
  rememberText: {
    fontSize: 13,
    color: "#546E7A",
  },
  forgotText: {
    fontSize: 13,
    color: "#1565C0",
    fontWeight: "500",
  },
  attemptsContainer: {
    marginBottom: 12,
  },
  attemptsBar: {
    height: 4,
    backgroundColor: "#E0E0E0",
    borderRadius: 2,
    overflow: "hidden",
    marginBottom: 4,
  },
  attemptsProgress: {
    height: "100%",
    backgroundColor: "#4CAF50",
    borderRadius: 2,
  },
  attemptsDanger: {
    backgroundColor: "#F44336",
  },
  attemptsText: {
    textAlign: "center",
    fontSize: 11,
    color: "#F44336",
    fontWeight: "500",
  },
  button: {
    backgroundColor: "#1565C0",
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 4,
    elevation: 3,
    shadowColor: "#1565C0",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
  },
  buttonDisabled: {
    backgroundColor: "#B0BEC5",
    elevation: 0,
    shadowOpacity: 0,
  },
  buttonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "bold",
  },
  biometricButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    marginTop: 10,
    borderWidth: 1,
    borderColor: "#CFD8DC",
    borderRadius: 10,
    backgroundColor: "#FAFAFA",
  },
  biometricText: {
    fontSize: 14,
    color: "#1565C0",
    fontWeight: "500",
    marginLeft: 8,
  },
  footerContainer: {
    alignItems: "center",
    marginTop: 18,
  },
  footerText: {
    fontSize: 11,
    color: "#90A4AE",
  },
  versionText: {
    fontSize: 10,
    color: "#CFD8DC",
    marginTop: 2,
  },
});

export default LoginScreen; 