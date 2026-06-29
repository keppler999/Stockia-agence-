import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Alert, Platform, Vibration } from "react-native";
import { BluetoothManager, BluetoothEscposPrinter } from "react-native-bluetooth-escpos-printer";
import * as Haptics from "expo-haptics";
import AsyncStorage from "@react-native-async-storage/async-storage";

// === INTERFACES ===
export interface BluetoothDevice {
  address: string;
  name: string;
  type?: string;
  connected?: boolean;
  rssi?: number;
}

export interface BluetoothState {
  isAvailable: boolean;
  isConnected: boolean;
  isConnecting: boolean;
  isScanning: boolean;
  devices: BluetoothDevice[];
  connectedDevice: BluetoothDevice | null;
  lastDevice: BluetoothDevice | null;
  error: string | null;
  savedDevices: BluetoothDevice[];
}

export interface BluetoothScanOptions {
  timeout?: number;
  nameFilter?: string;
  typeFilter?: string[];
}

export interface UseBluetoothReturn {
  state: BluetoothState;
  scanDevices: (options?: BluetoothScanOptions) => Promise<BluetoothDevice[]>;
  connect: (address: string) => Promise<boolean>;
  disconnect: () => Promise<void>;
  checkConnection: () => Promise<boolean>;
  saveDevice: (device: BluetoothDevice) => Promise<void>;
  removeDevice: (address: string) => Promise<void>;
  getSavedDevices: () => Promise<BluetoothDevice[]>;
  reset: () => Promise<void>;
}

// === CONSTANTES ===
const STORAGE_KEY_DEVICES = "@stockia_bluetooth_devices";
const STORAGE_KEY_LAST_DEVICE = "@stockia_bluetooth_last_device";
const DEFAULT_SCAN_TIMEOUT = 10000;

// ============================================
// 📁 HOOK BLUETOOTH
// ============================================

export function useBluetooth(): UseBluetoothReturn {
  // === ÉTATS ===
  const [state, setState] = useState<BluetoothState>({
    isAvailable: false,
    isConnected: false,
    isConnecting: false,
    isScanning: false,
    devices: [],
    connectedDevice: null,
    lastDevice: null,
    error: null,
    savedDevices: [],
  });

  // === RÉFÉRENCES ===
  const scanTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isMounted = useRef(true);

  // === NETTOYAGE ===
  useEffect(() => {
    isMounted.current = true;
    initializeBluetooth();

    return () => {
      isMounted.current = false;
      if (scanTimeoutRef.current) {
        clearTimeout(scanTimeoutRef.current);
      }
    };
  }, []);

  const initializeBluetooth = async () => {
    try {
      setState((prev) => ({ ...prev, isAvailable: true }));
      await loadSavedDevices();
      await checkConnection();

      console.log("[useBluetooth] Initialisé");
    } catch (error) {
      console.error("[useBluetooth] Erreur initialisation:", error);
      setState((prev) => ({
        ...prev,
        isAvailable: false,
        error: "Bluetooth non disponible",
      }));
    }
  };

  // === CHARGER LES APPAREILS SAUVEGARDÉS ===
  const loadSavedDevices = async () => {
    try {
      const devicesData = await AsyncStorage.getItem(STORAGE_KEY_DEVICES);
      if (devicesData) {
        const devices = JSON.parse(devicesData);
        setState((prev) => ({ ...prev, savedDevices: devices }));
      }

      const lastDeviceData = await AsyncStorage.getItem(STORAGE_KEY_LAST_DEVICE);
      if (lastDeviceData) {
        const lastDevice = JSON.parse(lastDeviceData);
        setState((prev) => ({ ...prev, lastDevice }));
      }
    } catch (error) {
      console.error("[useBluetooth] Erreur chargement appareils:", error);
    }
  };

  // === SCAN DES APPAREILS ===
  const scanDevices = useCallback(
    async (options: BluetoothScanOptions = {}): Promise<BluetoothDevice[]> => {
      const { timeout = DEFAULT_SCAN_TIMEOUT, nameFilter, typeFilter } = options;

      try {
        setState((prev) => ({
          ...prev,
          isScanning: true,
          error: null,
          devices: [],
        }));

        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

        const devices = await BluetoothManager.scanDevices(timeout);

        let filteredDevices = devices.map((d: any) => ({
          address: d.address,
          name: d.name || `Appareil ${d.address.substring(0, 4)}`,
          type: d.type,
          connected: false,
          rssi: d.rssi,
        }));

        if (nameFilter) {
          filteredDevices = filteredDevices.filter((d) => d.name.toLowerCase().includes(nameFilter.toLowerCase()));
        }

        if (typeFilter && typeFilter.length > 0) {
          filteredDevices = filteredDevices.filter((d) => d.type && typeFilter.includes(d.type));
        }

        setState((prev) => ({
          ...prev,
          isScanning: false,
          devices: filteredDevices,
        }));

        Vibration.vibrate(50);

        return filteredDevices;
      } catch (error: any) {
        console.error("[useBluetooth] Erreur scan:", error);
        setState((prev) => ({
          ...prev,
          isScanning: false,
          error: error.message || "Erreur de scan Bluetooth",
        }));
        return [];
      }
    },
    []
  );

  // === CONNEXION À UN APPAREIL ===
  const connect = useCallback(
    async (address: string): Promise<boolean> => {
      try {
        setState((prev) => ({
          ...prev,
          isConnecting: true,
          error: null,
        }));

        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

        await BluetoothManager.connect(address);

        const connectedDevice = await BluetoothManager.getConnectedDevice();

        const device: BluetoothDevice = {
          address: connectedDevice.address || address,
          name: connectedDevice.name || `Appareil ${address.substring(0, 4)}`,
          connected: true,
        };

        await saveDevice(device);

        setState((prev) => ({
          ...prev,
          isConnected: true,
          isConnecting: false,
          connectedDevice: device,
          lastDevice: device,
        }));

        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Vibration.vibrate(100);

        console.log(`[useBluetooth] Connecté à ${device.name}`);
        return true;
      } catch (error: any) {
        console.error("[useBluetooth] Erreur connexion:", error);
        setState((prev) => ({
          ...prev,
          isConnecting: false,
          error: error.message || "Erreur de connexion Bluetooth",
        }));

        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        Vibration.vibrate(200);

        return false;
      }
    },
    []
  );

  // === DÉCONNEXION ===
  const disconnect = useCallback(async (): Promise<void> => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

      await BluetoothManager.close();

      setState((prev) => ({
        ...prev,
        isConnected: false,
        connectedDevice: null,
        error: null,
      }));

      console.log("[useBluetooth] Déconnecté");
    } catch (error: any) {
      console.error("[useBluetooth] Erreur déconnexion:", error);
      setState((prev) => ({
        ...prev,
        error: error.message || "Erreur de déconnexion",
      }));
    }
  }, []);

  // === VÉRIFICATION DE LA CONNEXION ===
  const checkConnection = useCallback(async (): Promise<boolean> => {
    try {
      const isConnected = await BluetoothManager.isConnected();

      if (isConnected) {
        const device = await BluetoothManager.getConnectedDevice();
        const connectedDevice: BluetoothDevice = {
          address: device.address,
          name: device.name || "Imprimante",
          connected: true,
        };

        setState((prev) => ({
          ...prev,
          isConnected: true,
          connectedDevice,
        }));

        return true;
      }

      setState((prev) => ({
        ...prev,
        isConnected: false,
        connectedDevice: null,
      }));

      return false;
    } catch (error) {
      console.error("[useBluetooth] Erreur checkConnection:", error);
      setState((prev) => ({
        ...prev,
        isConnected: false,
        connectedDevice: null,
      }));
      return false;
    }
  }, []);

  // === SAUVEGARDER UN APPAREIL ===
  const saveDevice = useCallback(
    async (device: BluetoothDevice): Promise<void> => {
      try {
        let devices = state.savedDevices;

        const existingIndex = devices.findIndex((d) => d.address === device.address);
        if (existingIndex >= 0) {
          devices[existingIndex] = { ...device, saved: true };
        } else {
          devices = [...devices, { ...device, saved: true }];
        }

        await AsyncStorage.setItem(STORAGE_KEY_DEVICES, JSON.stringify(devices));
        await AsyncStorage.setItem(STORAGE_KEY_LAST_DEVICE, JSON.stringify(device));

        setState((prev) => ({
          ...prev,
          savedDevices: devices,
          lastDevice: device,
        }));
      } catch (error) {
        console.error("[useBluetooth] Erreur saveDevice:", error);
      }
    },
    [state.savedDevices]
  );

  // === SUPPRIMER UN APPAREIL SAUVEGARDÉ ===
  const removeDevice = useCallback(
    async (address: string): Promise<void> => {
      try {
        const devices = state.savedDevices.filter((d) => d.address !== address);

        await AsyncStorage.setItem(STORAGE_KEY_DEVICES, JSON.stringify(devices));

        setState((prev) => ({
          ...prev,
          savedDevices: devices,
        }));

        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      } catch (error) {
        console.error("[useBluetooth] Erreur removeDevice:", error);
      }
    },
    [state.savedDevices]
  );

  // === OBTENIR LES APPAREILS SAUVEGARDÉS ===
  const getSavedDevices = useCallback(async (): Promise<BluetoothDevice[]> => {
    try {
      const devicesData = await AsyncStorage.getItem(STORAGE_KEY_DEVICES);
      if (devicesData) {
        const devices = JSON.parse(devicesData);
        setState((prev) => ({ ...prev, savedDevices: devices }));
        return devices;
      }
      return [];
    } catch (error) {
      console.error("[useBluetooth] Erreur getSavedDevices:", error);
      return [];
    }
  }, []);

  // === RÉINITIALISATION ===
  const reset = useCallback(async (): Promise<void> => {
    try {
      await disconnect();

      setState((prev) => ({
        ...prev,
        isConnected: false,
        isConnecting: false,
        isScanning: false,
        devices: [],
        connectedDevice: null,
        error: null,
      }));

      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      console.log("[useBluetooth] Réinitialisé");
    } catch (error) {
      console.error("[useBluetooth] Erreur reset:", error);
    }
  }, [disconnect]);

  // === VALEURS MÉMOISÉES ===
  const value = useMemo<UseBluetoothReturn>(
    () => ({
      state,
      scanDevices,
      connect,
      disconnect,
      checkConnection,
      saveDevice,
      removeDevice,
      getSavedDevices,
      reset,
    }),
    [
      state,
      scanDevices,
      connect,
      disconnect,
      checkConnection,
      saveDevice,
      removeDevice,
      getSavedDevices,
      reset,
    ]
  );

  return value;
}

// ============================================
// 📁 HOOKS DÉRIVÉS
// ============================================

export function useBluetoothState() {
  const { state } = useBluetooth();
  return state;
}

export function useBluetoothConnection() {
  const { state } = useBluetooth();
  return {
    isConnected: state.isConnected,
    isConnecting: state.isConnecting,
    connectedDevice: state.connectedDevice,
  };
}

export function useBluetoothDevices() {
  const { state } = useBluetooth();
  return state.devices;
}

export function useBluetoothSavedDevices() {
  const { state } = useBluetooth();
  return state.savedDevices;
}

export default useBluetooth; 