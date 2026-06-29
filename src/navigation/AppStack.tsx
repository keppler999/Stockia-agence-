import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, ActivityIndicator } from "react-native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";

// === CONTEXTE ===
import { useUser } from "../context/UserContext";

// === NAVIGATION ===
import MainTabs from "./MainTabs";

// === ÉCRANS ===
import LicenceBlockScreen from "../screens/LicenceBlockScreen";

// === TYPES ===
const Stack = createNativeStackNavigator<AppStackParamList>();

export type AppStackParamList = {
  MainTabs: undefined;
  LicenceBlock: undefined;
};

// ============================================
// 📁 GESTIONNAIRE DE NOTIFICATIONS
// ============================================

const NotificationHandler: React.FC = () => {
  useEffect(() => {
    const subscription = Notifications.addNotificationReceivedListener((notification) => {
      console.log("[Notification] Reçue:", notification);
    });

    const responseSubscription = Notifications.addNotificationResponseReceivedListener((response) => {
      console.log("[Notification] Réponse:", response);
      const data = response.notification.request.content.data;
      if (data?.screen) {
        console.log("[Notification] Naviguer vers:", data.screen);
      }
    });

    return () => {
      subscription.remove();
      responseSubscription.remove();
    };
  }, []);

  return null;
};

// ============================================
// 📁 COMPOSANT PRINCIPAL
// ============================================

const AppStack: React.FC = () => {
  const { user, blocked, isLoading } = useUser();
  const [notificationToken, setNotificationToken] = useState<string | null>(null);

  // === INITIALISATION DES NOTIFICATIONS ===
  useEffect(() => {
    registerForPushNotifications();
  }, []);

  const registerForPushNotifications = async () => {
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("default", {
        name: "default",
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: "#1565C0",
      });
    }

    if (Device.isDevice) {
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;

      if (existingStatus !== "granted") {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      if (finalStatus !== "granted") {
        console.warn("[AppStack] Notifications non autorisées");
        return;
      }

      try {
        const token = await Notifications.getExpoPushTokenAsync({
          projectId: "stockia-project-id",
        });
        setNotificationToken(token.data);
        console.log("[AppStack] Token notification:", token.data);
      } catch (error) {
        console.error("[AppStack] Erreur token:", error);
      }
    }
  };

  // === CHARGEMENT ===
  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#1565C0" />
        <Text style={styles.loadingText}>Chargement...</Text>
      </View>
    );
  }

  // === LICENCE BLOQUÉE ===
  if (blocked) {
    return (
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="LicenceBlock" component={LicenceBlockScreen} />
      </Stack.Navigator>
    );
  }

  // === APPLICATION PRINCIPALE ===
  return (
    <>
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
          animation: "slide_from_right",
          gestureEnabled: true,
          gestureDirection: "horizontal",
        }}
      >
        <Stack.Screen name="MainTabs" component={MainTabs} />
      </Stack.Navigator>
      <NotificationHandler />
    </>
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
  loadingText: {
    marginTop: 12,
    color: "#666666",
    fontSize: 14,
    fontWeight: "500",
  },
});

export default AppStack; 