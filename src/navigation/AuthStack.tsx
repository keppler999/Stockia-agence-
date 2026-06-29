import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";

// === ÉCRANS ===
import LoginScreen from "../screens/LoginScreen";
import LicenceBlockScreen from "../screens/LicenceBlockScreen";

// === TYPES ===
export type AuthStackParamList = {
  Login: undefined;
  LicenceBlock: undefined;
  Register: undefined;
  ForgotPassword: undefined;
  ResetPassword: { token: string };
  VerifyEmail: { email: string };
};

// === NAVIGATEUR ===
const Stack = createNativeStackNavigator<AuthStackParamList>();

// ============================================
// 📁 COMPOSANTS PLACEHOLDER
// ============================================

const RegisterScreen: React.FC<{ navigation: any }> = ({ navigation }) => (
  <View style={styles.placeholderContainer}>
    <Ionicons name="person-add" size={64} color="#1565C0" />
    <Text style={styles.placeholderTitle}>Inscription</Text>
    <Text style={styles.placeholderText}>
      Fonctionnalité d'inscription disponible prochainement.
    </Text>
    <TouchableOpacity style={styles.placeholderButton} onPress={() => navigation.goBack()}>
      <Text style={styles.placeholderButtonText}>Retour à la connexion</Text>
    </TouchableOpacity>
  </View>
);

const ForgotPasswordScreen: React.FC<{ navigation: any }> = ({ navigation }) => (
  <View style={styles.placeholderContainer}>
    <Ionicons name="mail" size={64} color="#1565C0" />
    <Text style={styles.placeholderTitle}>Mot de passe oublié</Text>
    <Text style={styles.placeholderText}>
      Entrez votre email pour recevoir un lien de réinitialisation.
    </Text>
    <TouchableOpacity style={styles.placeholderButton} onPress={() => navigation.goBack()}>
      <Text style={styles.placeholderButtonText}>Retour à la connexion</Text>
    </TouchableOpacity>
  </View>
);

const ResetPasswordScreen: React.FC<{ route: any }> = ({ route }) => (
  <View style={styles.placeholderContainer}>
    <Ionicons name="key" size={64} color="#1565C0" />
    <Text style={styles.placeholderTitle}>Réinitialisation</Text>
    <Text style={styles.placeholderText}>Token: {route.params?.token || "N/A"}</Text>
    <TouchableOpacity style={styles.placeholderButton}>
      <Text style={styles.placeholderButtonText}>Réinitialiser le mot de passe</Text>
    </TouchableOpacity>
  </View>
);

const VerifyEmailScreen: React.FC<{ route: any }> = ({ route }) => (
  <View style={styles.placeholderContainer}>
    <Ionicons name="mail-open" size={64} color="#1565C0" />
    <Text style={styles.placeholderTitle}>Vérification email</Text>
    <Text style={styles.placeholderText}>Email: {route.params?.email || "N/A"}</Text>
    <TouchableOpacity style={styles.placeholderButton}>
      <Text style={styles.placeholderButtonText}>Vérifier</Text>
    </TouchableOpacity>
  </View>
);

// ============================================
// 📁 NAVIGATEUR PRINCIPAL
// ============================================

const AuthStack: React.FC = () => {
  return (
    <Stack.Navigator
      initialRouteName="Login"
      screenOptions={{
        headerStyle: {
          backgroundColor: "#1565C0",
        },
        headerTitleStyle: {
          color: "#FFFFFF",
          fontSize: 18,
          fontWeight: "bold",
        },
        headerTintColor: "#FFFFFF",
        headerBackTitle: "Retour",
        animation: "slide_from_right",
        gestureEnabled: true,
        gestureDirection: "horizontal",
      }}
    >
      {/* === ÉCRAN DE CONNEXION === */}
      <Stack.Screen
        name="Login"
        component={LoginScreen}
        options={{
          headerShown: false,
        }}
      />

      {/* === ÉCRAN DE LICENCE BLOQUÉE === */}
      <Stack.Screen
        name="LicenceBlock"
        component={LicenceBlockScreen}
        options={{
          headerShown: false,
        }}
      />

      {/* === ÉCRAN D'INSCRIPTION === */}
      <Stack.Screen
        name="Register"
        component={RegisterScreen}
        options={{
          title: "Inscription",
          headerLeft: ({ canGoBack, onPress }) =>
            canGoBack && (
              <TouchableOpacity onPress={onPress} style={styles.headerBackButton}>
                <Ionicons name="chevron-back" size={24} color="#FFFFFF" />
              </TouchableOpacity>
            ),
        }}
      />

      {/* === ÉCRAN MOT DE PASSE OUBLIÉ === */}
      <Stack.Screen
        name="ForgotPassword"
        component={ForgotPasswordScreen}
        options={{
          title: "Mot de passe oublié",
          headerLeft: ({ canGoBack, onPress }) =>
            canGoBack && (
              <TouchableOpacity onPress={onPress} style={styles.headerBackButton}>
                <Ionicons name="chevron-back" size={24} color="#FFFFFF" />
              </TouchableOpacity>
            ),
        }}
      />

      {/* === ÉCRAN RÉINITIALISATION === */}
      <Stack.Screen
        name="ResetPassword"
        component={ResetPasswordScreen}
        options={{
          title: "Réinitialisation",
          headerLeft: ({ canGoBack, onPress }) =>
            canGoBack && (
              <TouchableOpacity onPress={onPress} style={styles.headerBackButton}>
                <Ionicons name="chevron-back" size={24} color="#FFFFFF" />
              </TouchableOpacity>
            ),
        }}
      />

      {/* === ÉCRAN VÉRIFICATION EMAIL === */}
      <Stack.Screen
        name="VerifyEmail"
        component={VerifyEmailScreen}
        options={{
          title: "Vérification email",
          headerLeft: ({ canGoBack, onPress }) =>
            canGoBack && (
              <TouchableOpacity onPress={onPress} style={styles.headerBackButton}>
                <Ionicons name="chevron-back" size={24} color="#FFFFFF" />
              </TouchableOpacity>
            ),
        }}
      />
    </Stack.Navigator>
  );
};

// ============================================
// 📁 STYLES
// ============================================

const styles = StyleSheet.create({
  placeholderContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#F8F9FA",
    padding: 20,
  },
  placeholderTitle: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#333333",
    marginTop: 16,
  },
  placeholderText: {
    fontSize: 14,
    color: "#666666",
    textAlign: "center",
    marginTop: 8,
    marginBottom: 24,
    paddingHorizontal: 20,
    lineHeight: 20,
  },
  placeholderButton: {
    backgroundColor: "#1565C0",
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  placeholderButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "600",
  },
  headerBackButton: {
    padding: 4,
    marginLeft: 8,
  },
});

export default AuthStack;