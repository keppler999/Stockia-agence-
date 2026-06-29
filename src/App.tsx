import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, ActivityIndicator } from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import { UserProvider, useUser } from "./context/UserContext";
import AuthStack from "./navigation/AuthStack";
import AppStack from "./navigation/AppStack";

// === EMPÊCHER LE SPLASH SCREEN DE SE FERMER AUTOMATIQUEMENT ===
SplashScreen.preventAutoHideAsync();

// ============================================
// 📁 COMPOSANT DE CHARGEMENT
// ============================================

const LoadingScreen: React.FC = () => {
  return (
    <View style={styles.loadingContainer}>
      <View style={styles.loadingLogo}>
        <Text style={styles.loadingLogoText}>📦</Text>
      </View>
      <Text style={styles.loadingTitle}>STOCKIA</Text>
      <Text style={styles.loadingSubtitle}>Gestion Commerciale Intelligente</Text>
      <ActivityIndicator size="large" color="#1565C0" style={styles.loadingSpinner} />
      <Text style={styles.loadingVersion}>v2.1.0</Text>
    </View>
  );
};

// ============================================
// 📁 CONTENU PRINCIPAL DE L'APPLICATION
// ============================================

const AppContent: React.FC = () => {
  const { user, isLoading, blocked } = useUser();
  const [appIsReady, setAppIsReady] = useState(false);

  // === INITIALISATION DE L'APPLICATION ===
  useEffect(() => {
    const prepareApp = async () => {
      try {
        // Simuler un temps de chargement pour le splash screen
        await new Promise((resolve) => setTimeout(resolve, 1500));
      } catch (error) {
        console.error("[App] Erreur d'initialisation:", error);
      } finally {
        setAppIsReady(true);
        await SplashScreen.hideAsync();
      }
    };

    prepareApp();
  }, []);

  // === AFFICHAGE DU CHARGEMENT ===
  if (!appIsReady || isLoading) {
    return <LoadingScreen />;
  }

  // === AFFICHAGE DE LA NAVIGATION ===
  return (
    <NavigationContainer>
      <StatusBar style="light" backgroundColor="#1565C0" />
      {blocked ? <AuthStack initialRoute="LicenceBlock" /> : user ? <AppStack /> : <AuthStack />}
    </NavigationContainer>
  );
};

// ============================================
// 📁 COMPOSANT PRINCIPAL
// ============================================

const App: React.FC = () => {
  return (
    <UserProvider>
      <AppContent />
    </UserProvider>
  );
};

// ============================================
// 📁 STYLES
// ============================================

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    padding: 20,
  },
  loadingLogo: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "#E3F2FD",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
  },
  loadingLogoText: {
    fontSize: 40,
  },
  loadingTitle: {
    fontSize: 32,
    fontWeight: "bold",
    color: "#1565C0",
    letterSpacing: 2,
  },
  loadingSubtitle: {
    fontSize: 14,
    color: "#78909C",
    marginTop: 4,
    marginBottom: 24,
  },
  loadingSpinner: {
    marginTop: 8,
  },
  loadingVersion: {
    fontSize: 12,
    color: "#B0BEC5",
    marginTop: 16,
  },
});

export default App; 