import { useState, useEffect, useCallback, useMemo } from "react";
import { AppState, Platform } from "react-native";
import * as Network from "expo-network";
import * as Battery from "expo-battery";
import * as Device from "expo-device";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useUser } from "../context/UserContext";
import { dbService } from "../services/DatabaseService";

// === INTERFACES ===
export interface AppStateInfo {
  appState: "active" | "background" | "inactive";
  isConnected: boolean;
  connectionType: "wifi" | "cellular" | "ethernet" | "unknown" | "none";
  batteryLevel: number;
  isCharging: boolean;
  deviceInfo: {
    model: string;
    os: string;
    osVersion: string;
    isTablet: boolean;
  };
  uptime: number;
  lastActivity: string;
  isOfflineMode: boolean;
}

export interface UseAppReturn {
  appState: AppStateInfo;
  refresh: () => Promise<void>;
  checkNetwork: () => Promise<boolean>;
  updateActivity: () => void;
  getUptime: () => string;
  restart: () => void;
  clearCache: () => Promise<void>;
}

// === CONSTANTES ===
const UPTIME_INTERVAL = 60000; // 1 minute

// ============================================
// 📁 HOOK PRINCIPAL
// ============================================

export function useApp(): UseAppReturn {
  const { user } = useUser();

  // === ÉTATS ===
  const [appState, setAppState] = useState<AppStateInfo>({
    appState: "active",
    isConnected: true,
    connectionType: "unknown",
    batteryLevel: 100,
    isCharging: false,
    deviceInfo: {
      model: "Unknown",
      os: Platform.OS,
      osVersion: Platform.Version.toString(),
      isTablet: false,
    },
    uptime: 0,
    lastActivity: new Date().toISOString(),
    isOfflineMode: false,
  });
  const [startTime] = useState(Date.now());

  // === RÉFÉRENCES ===
  let uptimeInterval: NodeJS.Timeout | null = null;

  // === INITIALISATION ===
  useEffect(() => {
    initializeApp();

    const subscription = AppState.addEventListener("change", handleAppStateChange);

    return () => {
      subscription.remove();
      if (uptimeInterval) {
        clearInterval(uptimeInterval);
      }
    };
  }, []);

  const initializeApp = async () => {
    try {
      const deviceInfo = await getDeviceInfo();
      const networkInfo = await checkNetworkStatus();
      const batteryInfo = await getBatteryInfo();
      const offlineMode = await checkOfflineMode();

      setAppState((prev) => ({
        ...prev,
        deviceInfo,
        isConnected: networkInfo.isConnected,
        connectionType: networkInfo.connectionType,
        batteryLevel: batteryInfo.level,
        isCharging: batteryInfo.isCharging,
        isOfflineMode: offlineMode,
        lastActivity: new Date().toISOString(),
      }));

      startUptimeCounter();

      console.log("[useApp] Application initialisée");
    } catch (error) {
      console.error("[useApp] Erreur initialisation:", error);
    }
  };

  const startUptimeCounter = () => {
    if (uptimeInterval) {
      clearInterval(uptimeInterval);
    }

    uptimeInterval = setInterval(() => {
      const uptime = Math.floor((Date.now() - startTime) / 1000);
      setAppState((prev) => ({ ...prev, uptime }));
    }, UPTIME_INTERVAL);
  };

  // === GESTION DE L'ÉTAT DE L'APPLICATION ===
  const handleAppStateChange = (nextAppState: "active" | "background" | "inactive") => {
    setAppState((prev) => ({
      ...prev,
      appState: nextAppState,
      lastActivity: new Date().toISOString(),
    }));

    if (nextAppState === "active") {
      refresh();
      updateActivity();
    }

    if (nextAppState === "background") {
      console.log("[useApp] Application en arrière-plan");
    }
  };

  // === RÉCUPÉRATION DES INFORMATIONS DE L'APPAREIL ===
  const getDeviceInfo = async () => {
    try {
      const model = (await Device.getModelNameAsync()) || "Unknown";
      const osVersion = Device.osVersion || "Unknown";
      const isTablet = await Device.isTabletAsync();

      return {
        model,
        os: Platform.OS,
        osVersion,
        isTablet,
      };
    } catch (error) {
      console.error("[useApp] Erreur device info:", error);
      return {
        model: "Unknown",
        os: Platform.OS,
        osVersion: Platform.Version.toString(),
        isTablet: false,
      };
    }
  };

  // === VÉRIFICATION DE LA CONNEXION RÉSEAU ===
  const checkNetworkStatus = async () => {
    try {
      const networkState = await Network.getNetworkStateAsync();
      return {
        isConnected: networkState.isConnected || false,
        connectionType: networkState.type || "unknown",
      };
    } catch (error) {
      console.error("[useApp] Erreur réseau:", error);
      return {
        isConnected: false,
        connectionType: "unknown",
      };
    }
  };

  // === RÉCUPÉRATION DES INFORMATIONS DE BATTERIE ===
  const getBatteryInfo = async () => {
    try {
      const batteryLevel = await Battery.getBatteryLevelAsync();
      const batteryState = await Battery.getBatteryStateAsync();

      return {
        level: Math.round(batteryLevel * 100),
        isCharging: batteryState === Battery.BatteryState.CHARGING,
      };
    } catch (error) {
      console.error("[useApp] Erreur batterie:", error);
      return {
        level: 100,
        isCharging: false,
      };
    }
  };

  // === VÉRIFICATION DU MODE HORS-LIGNE ===
  const checkOfflineMode = async (): Promise<boolean> => {
    try {
      const offlineMode = await AsyncStorage.getItem("@stockia_offline_mode");
      return offlineMode === "true";
    } catch (error) {
      console.error("[useApp] Erreur offline mode:", error);
      return false;
    }
  };

  // === RAFRAÎCHISSEMENT ===
  const refresh = useCallback(async () => {
    try {
      const networkInfo = await checkNetworkStatus();
      const batteryInfo = await getBatteryInfo();
      const offlineMode = await checkOfflineMode();

      setAppState((prev) => ({
        ...prev,
        isConnected: networkInfo.isConnected,
        connectionType: networkInfo.connectionType,
        batteryLevel: batteryInfo.level,
        isCharging: batteryInfo.isCharging,
        isOfflineMode: offlineMode,
        lastActivity: new Date().toISOString(),
      }));

      console.log("[useApp] Informations rafraîchies");
    } catch (error) {
      console.error("[useApp] Erreur refresh:", error);
    }
  }, []);

  // === VÉRIFICATION DE LA CONNEXION RÉSEAU ===
  const checkNetwork = useCallback(async (): Promise<boolean> => {
    try {
      const networkState = await Network.getNetworkStateAsync();
      const isConnected = networkState.isConnected || false;

      setAppState((prev) => ({
        ...prev,
        isConnected,
        connectionType: networkState.type || "unknown",
      }));

      return isConnected;
    } catch (error) {
      console.error("[useApp] Erreur checkNetwork:", error);
      return false;
    }
  }, []);

  // === MISE À JOUR DE LA DERNIÈRE ACTIVITÉ ===
  const updateActivity = useCallback(() => {
    setAppState((prev) => ({
      ...prev,
      lastActivity: new Date().toISOString(),
    }));
  }, []);

  // === RÉCUPÉRATION DU TEMPS D'UTILISATION ===
  const getUptime = useCallback((): string => {
    const seconds = appState.uptime;
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) {
      return `${hours}h ${minutes}m ${secs}s`;
    }
    if (minutes > 0) {
      return `${minutes}m ${secs}s`;
    }
    return `${secs}s`;
  }, [appState.uptime]);

  // === REDÉMARRER L'APPLICATION ===
  const restart = useCallback(() => {
    console.log("[useApp] Redémarrage de l'application");
  }, []);

  // === NETTOYAGE DU CACHE ===
  const clearCache = useCallback(async () => {
    try {
      console.log("[useApp] Nettoyage du cache...");

      if (uptimeInterval) {
        clearInterval(uptimeInterval);
        startUptimeCounter();
      }

      setAppState((prev) => ({
        ...prev,
        uptime: 0,
        lastActivity: new Date().toISOString(),
      }));

      console.log("[useApp] Cache nettoyé");
    } catch (error) {
      console.error("[useApp] Erreur clearCache:", error);
    }
  }, []);

  // === VALEURS MÉMOISÉES ===
  const value = useMemo<UseAppReturn>(
    () => ({
      appState,
      refresh,
      checkNetwork,
      updateActivity,
      getUptime,
      restart,
      clearCache,
    }),
    [appState, refresh, checkNetwork, updateActivity, getUptime, restart, clearCache]
  );

  return value;
}

// ============================================
// 📁 HOOKS DÉRIVÉS
// ============================================

export function useNetworkStatus(): boolean {
  const { appState } = useApp();
  return appState.isConnected;
}

export function useBatteryLevel(): number {
  const { appState } = useApp();
  return appState.batteryLevel;
}

export function useOfflineMode(): boolean {
  const { appState } = useApp();
  return appState.isOfflineMode;
}

export function useAppState(): "active" | "background" | "inactive" {
  const { appState } = useApp();
  return appState.appState;
}

export default useApp; 