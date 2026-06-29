import React, { useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Modal, Alert, Vibration } from "react-native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";
import { useUser } from "../context/UserContext";
import { AuthService } from "../services/AuthService";

// === ÉCRANS ===
import DashboardScreen from "../screens/DashboardScreen";
import CaisseScreen from "../screens/CaisseScreen";
import StockScreen from "../screens/StockScreen";
import AnalyticsScreen from "../screens/AnalyticsScreen";
import SettingsScreen from "../screens/SettingsScreen";

// === TYPES ===
const Tab = createBottomTabNavigator();

export type MainTabParamList = {
  Dashboard: undefined;
  Caisse: undefined;
  Stock: undefined;
  Analytics: undefined;
  Settings: undefined;
};

interface TabItem {
  key: keyof MainTabParamList;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  activeIcon: keyof typeof Ionicons.glyphMap;
  component: React.ComponentType<any>;
  roles?: ("ADMIN" | "GERANT" | "CAISSIER" | "MAGASINIER")[];
}

// ============================================
// 📁 COMPOSANT PRINCIPAL
// ============================================

const MainTabs: React.FC = () => {
  const { user, logout } = useUser();
  const role = user?.role || "CAISSIER";
  const [showLogoutModal, setShowLogoutModal] = useState(false);

  // === CONFIGURATION DES ONGLETS ===
  const getTabs = (): TabItem[] => {
    const tabs: TabItem[] = [];

    // 1. Dashboard - visible pour tous
    tabs.push({
      key: "Dashboard",
      label: "Accueil",
      icon: "home-outline",
      activeIcon: "home",
      component: DashboardScreen,
    });

    // 2. Caisse - Admin, Gérant, Caissier
    if (role === "ADMIN" || role === "GERANT" || role === "CAISSIER") {
      tabs.push({
        key: "Caisse",
        label: "Caisse",
        icon: "cash-outline",
        activeIcon: "cash",
        component: CaisseScreen,
      });
    }

    // 3. Stock - Admin, Gérant, Magasinier
    if (role === "ADMIN" || role === "GERANT" || role === "MAGASINIER") {
      tabs.push({
        key: "Stock",
        label: "Stock",
        icon: "cube-outline",
        activeIcon: "cube",
        component: StockScreen,
      });
    }

    // 4. Analytics - Admin, Gérant uniquement
    if (role === "ADMIN" || role === "GERANT") {
      tabs.push({
        key: "Analytics",
        label: "Analyses",
        icon: "analytics-outline",
        activeIcon: "analytics",
        component: AnalyticsScreen,
      });
    }

    // 5. Settings - visible pour tous
    tabs.push({
      key: "Settings",
      label: "Paramètres",
      icon: "settings-outline",
      activeIcon: "settings",
      component: SettingsScreen,
    });

    return tabs;
  };

  const tabs = getTabs();

  // === GESTION DE LA DÉCONNEXION ===
  const handleLogout = async () => {
    try {
      await AuthService.logout();
      if (user) {
        await AuthService.logAction(user.id, "LOGOUT", "Déconnexion volontaire");
      }
      logout();
      Vibration.vibrate(50);
    } catch (error) {
      console.error("[Logout] Erreur:", error);
      logout();
    } finally {
      setShowLogoutModal(false);
    }
  };

  // === ICÔNE PERSONNALISÉE ===
  const getTabIcon = (
    routeName: keyof MainTabParamList,
    focused: boolean,
    color: string,
    size: number
  ) => {
    const tab = tabs.find((t) => t.key === routeName);
    if (!tab) return null;

    const iconName = focused ? tab.activeIcon : tab.icon;
    return <Ionicons name={iconName} size={size} color={color} />;
  };

  return (
    <>
      <Tab.Navigator
        screenOptions={({ route }) => ({
          tabBarIcon: ({ focused, color, size }) =>
            getTabIcon(route.name as keyof MainTabParamList, focused, color, size),

          tabBarActiveTintColor: "#1565C0",
          tabBarInactiveTintColor: "#757575",

          tabBarStyle: {
            backgroundColor: "#FFFFFF",
            borderTopWidth: 1,
            borderTopColor: "#E0E0E0",
            height: 60,
            paddingBottom: 5,
            elevation: 8,
            shadowColor: "#000",
            shadowOffset: { width: 0, height: -2 },
            shadowOpacity: 0.05,
            shadowRadius: 4,
          },

          tabBarLabelStyle: {
            fontSize: 10,
            fontWeight: "500",
            marginTop: 2,
          },

          headerStyle: {
            backgroundColor: "#1565C0",
            elevation: 0,
            shadowOpacity: 0,
          },

          headerTitleStyle: {
            color: "#FFFFFF",
            fontSize: 18,
            fontWeight: "bold",
          },

          headerTintColor: "#FFFFFF",

          headerRight: () => (
            <TouchableOpacity
              style={styles.headerLogoutButton}
              onPress={() => setShowLogoutModal(true)}
              activeOpacity={0.7}
            >
              <Ionicons name="log-out-outline" size={24} color="#FFFFFF" />
            </TouchableOpacity>
          ),

          headerLeft: () => (
            <View style={styles.headerLeftContainer}>
              <View style={styles.headerAvatar}>
                <Text style={styles.headerAvatarText}>
                  {user?.nom?.charAt(0).toUpperCase() || "U"}
                </Text>
              </View>
              <View>
                <Text style={styles.headerUserName}>{user?.nom || "Utilisateur"}</Text>
                <View style={styles.headerRoleBadge}>
                  <Text style={styles.headerRoleText}>{user?.role || "Invité"}</Text>
                </View>
              </View>
            </View>
          ),
        })}
      >
        {tabs.map((tab) => (
          <Tab.Screen
            key={tab.key}
            name={tab.key}
            component={tab.component}
            options={{
              title: tab.label,
            }}
          />
        ))}
      </Tab.Navigator>

      {/* === MODAL DE DÉCONNEXION === */}
      <Modal
        visible={showLogoutModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowLogoutModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalIconContainer}>
              <Ionicons name="log-out-outline" size={56} color="#D32F2F" />
            </View>
            <Text style={styles.modalTitle}>Déconnexion</Text>
            <Text style={styles.modalText}>
              Êtes-vous sûr de vouloir vous déconnecter ?
            </Text>
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalCancelButton]}
                onPress={() => setShowLogoutModal(false)}
                activeOpacity={0.7}
              >
                <Text style={styles.modalCancelText}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalConfirmButton]}
                onPress={handleLogout}
                activeOpacity={0.7}
              >
                <Text style={styles.modalConfirmText}>Déconnecter</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
};

// ============================================
// 📁 STYLES
// ============================================

const styles = StyleSheet.create({
  // === HEADER ===
  headerLeftContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginLeft: 16,
    gap: 10,
  },
  headerAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "rgba(255,255,255,0.2)",
    justifyContent: "center",
    alignItems: "center",
  },
  headerAvatarText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "bold",
  },
  headerUserName: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "600",
  },
  headerRoleBadge: {
    backgroundColor: "rgba(255,255,255,0.15)",
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 8,
    alignSelf: "flex-start",
  },
  headerRoleText: {
    color: "#FFFFFF",
    fontSize: 8,
    fontWeight: "bold",
  },
  headerLogoutButton: {
    marginRight: 16,
    padding: 4,
  },

  // === MODAL ===
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalContent: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 28,
    width: "85%",
    maxWidth: 340,
    alignItems: "center",
    elevation: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
  },
  modalIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "#FFEBEE",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: "bold",
    color: "#333333",
    marginBottom: 8,
  },
  modalText: {
    fontSize: 14,
    color: "#666666",
    textAlign: "center",
    marginBottom: 24,
    lineHeight: 20,
  },
  modalActions: {
    flexDirection: "row",
    width: "100%",
    gap: 10,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  modalCancelButton: {
    backgroundColor: "#F5F5F5",
  },
  modalCancelText: {
    color: "#666666",
    fontWeight: "600",
    fontSize: 15,
  },
  modalConfirmButton: {
    backgroundColor: "#D32F2F",
  },
  modalConfirmText: {
    color: "#FFFFFF",
    fontWeight: "bold",
    fontSize: 15,
  },
});

export default MainTabs; 