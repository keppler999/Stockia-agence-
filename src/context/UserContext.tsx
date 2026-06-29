import React, { createContext, useState, useEffect, useContext, useCallback, useMemo } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SQLite from "expo-sqlite";
import * as Crypto from "expo-crypto";
import * as Device from "expo-device";
import { Platform } from "react-native";

// === CONSTANTES ===
const DATABASE_NAME = "stockia_secure.db";
const STORAGE_KEYS = {
  USER_SESSION: "@stockia_user",
  USER_TOKEN: "@stockia_token",
  PRINT_ENABLED: "@stockia_print_enabled",
  BLOCKED_STATUS: "@stockia_blocked_status",
  LAST_LOGIN: "@stockia_last_login",
  DEVICE_ID: "@stockia_device_id",
} as const;

// === INTERFACES ===
export interface UserSession {
  id: number;
  nom: string;
  username: string;
  email?: string;
  role: "ADMIN" | "GERANT" | "CAISSIER" | "MAGASINIER";
  avatar?: string;
  magasin_id?: number;
  magasin_nom?: string;
  permissions?: string[];
  derniere_connexion?: string;
}

export interface AppSettings {
  printEnabled: boolean;
  darkMode: boolean;
  notifications: boolean;
  autoBackup: boolean;
  devise: string;
  nomBoutique: string;
}

export interface LicenceInfo {
  statut: "ACTIVE" | "EXPIRED" | "REVOKED" | "PENDING" | "DEMO";
  dateActivation?: string;
  dateExpiration?: string;
  joursRestants?: number;
  nomTitulaire?: string;
  emailTitulaire?: string;
  typeLicence?: "STANDARD" | "PREMIUM" | "ENTERPRISE";
}

export interface UserContextType {
  user: UserSession | null;
  setUser: (user: UserSession | null) => void;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<UserSession>;
  logout: () => Promise<void>;
  checkSession: () => Promise<boolean>;
  updateUser: (updates: Partial<UserSession>) => Promise<void>;
  hasPermission: (permission: string) => boolean;
  isAuthenticated: boolean;
  userRole: UserSession["role"] | null;
  settings: AppSettings;
  updateSettings: (settings: Partial<AppSettings>) => Promise<void>;
  printEnabled: boolean;
  setPrintEnabled: (enabled: boolean) => void;
  licence: LicenceInfo | null;
  checkLicence: () => Promise<boolean>;
  blocked: boolean;
  setBlocked: (blocked: boolean) => void;
  lastLogin: string | null;
  deviceId: string;
}

// === PERMISSIONS PAR RÔLE ===
const ROLE_PERMISSIONS: Record<UserSession["role"], string[]> = {
  ADMIN: [
    "*",
    "manage_users",
    "manage_products",
    "manage_inventory",
    "view_reports",
    "manage_magasins",
    "manage_system",
    "create_sales",
    "view_all_sales",
    "manage_stock",
    "view_analytics",
    "manage_settings",
    "view_audit_logs",
  ],
  GERANT: [
    "manage_products",
    "manage_inventory",
    "view_reports",
    "create_sales",
    "view_all_sales",
    "manage_stock",
    "view_analytics",
    "manage_settings",
    "manage_clients",
  ],
  CAISSIER: [
    "create_sales",
    "view_own_sales",
    "manage_stock",
    "view_clients",
    "create_clients",
    "print_tickets",
  ],
  MAGASINIER: [
    "manage_inventory",
    "manage_stock",
    "view_products",
    "create_mouvements",
    "view_stock_reports",
  ],
};

// === CONTEXTE ===
const UserContext = createContext<UserContextType | undefined>(undefined);

export const useUser = () => {
  const context = useContext(UserContext);
  if (!context) {
    throw new Error("useUser doit être utilisé à l'intérieur d'un UserProvider");
  }
  return context;
};

// ============================================
// 📁 PROVIDER
// ============================================

export const UserProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // === ÉTATS PRINCIPAUX ===
  const [user, setUser] = useState<UserSession | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [blocked, setBlocked] = useState<boolean>(false);
  const [lastLogin, setLastLogin] = useState<string | null>(null);
  const [deviceId, setDeviceId] = useState<string>("UNKNOWN");
  const [licence, setLicence] = useState<LicenceInfo | null>(null);

  // === ÉTATS PARAMÈTRES ===
  const [settings, setSettings] = useState<AppSettings>({
    printEnabled: false,
    darkMode: false,
    notifications: true,
    autoBackup: false,
    devise: "USD",
    nomBoutique: "Stockia Store",
  });

  // === INITIALISATION ===
  useEffect(() => {
    initializeApp();
  }, []);

  const initializeApp = async (): Promise<void> => {
    try {
      setIsLoading(true);

      await getDeviceId();
      await loadSession();
      await loadSettings();
      await checkLicence();

      if (user) {
        await checkSessionValidity();
      }
    } catch (error) {
      console.error("[UserContext] Erreur d'initialisation:", error);
    } finally {
      setIsLoading(false);
    }
  };

  // === GESTION DE L'APPAREIL ===
  const getDeviceId = async (): Promise<void> => {
    try {
      let id = await AsyncStorage.getItem(STORAGE_KEYS.DEVICE_ID);
      if (!id) {
        const deviceId = (await Device.getDeviceIdAsync()) || "unknown";
        id = `STK-${deviceId.substring(0, 8)}-${Date.now().toString(36)}`;
        await AsyncStorage.setItem(STORAGE_KEYS.DEVICE_ID, id);
      }
      setDeviceId(id);
    } catch (error) {
      console.error("[UserContext] Erreur device ID:", error);
      setDeviceId(`STK-${Date.now().toString(36)}`);
    }
  };

  // === CHARGEMENT DE LA SESSION ===
  const loadSession = async (): Promise<void> => {
    try {
      const userData = await AsyncStorage.getItem(STORAGE_KEYS.USER_SESSION);
      if (userData) {
        const parsedUser = JSON.parse(userData);
        setUser(parsedUser);
      }

      const lastLoginData = await AsyncStorage.getItem(STORAGE_KEYS.LAST_LOGIN);
      if (lastLoginData) {
        setLastLogin(lastLoginData);
      }

      const blockedData = await AsyncStorage.getItem(STORAGE_KEYS.BLOCKED_STATUS);
      if (blockedData) {
        setBlocked(JSON.parse(blockedData));
      }
    } catch (error) {
      console.error("[UserContext] Erreur chargement session:", error);
    }
  };

  // === CHARGEMENT DES PARAMÈTRES ===
  const loadSettings = async (): Promise<void> => {
    try {
      const printData = await AsyncStorage.getItem(STORAGE_KEYS.PRINT_ENABLED);

      let devise = "USD";
      let nomBoutique = "Stockia Store";

      try {
        const db = await SQLite.openDatabaseAsync(DATABASE_NAME);
        const deviseResult = await db.getFirstAsync<{ valeur: string }>(
          "SELECT valeur FROM parametres_systeme WHERE cle = 'devise_symbole';"
        );
        if (deviseResult) devise = deviseResult.valeur;

        const boutiqueResult = await db.getFirstAsync<{ valeur: string }>(
          "SELECT valeur FROM parametres_systeme WHERE cle = 'nom_boutique';"
        );
        if (boutiqueResult) nomBoutique = boutiqueResult.valeur;
      } catch (dbError) {
        console.warn("[UserContext] Erreur lecture paramètres DB:", dbError);
      }

      setSettings({
        printEnabled: printData ? JSON.parse(printData) : false,
        darkMode: false,
        notifications: true,
        autoBackup: false,
        devise,
        nomBoutique,
      });
    } catch (error) {
      console.error("[UserContext] Erreur chargement paramètres:", error);
    }
  };

  // === VÉRIFICATION DE LA SESSION ===
  const checkSessionValidity = async (): Promise<boolean> => {
    try {
      const token = await AsyncStorage.getItem(STORAGE_KEYS.USER_TOKEN);
      if (!token) return false;

      const db = await SQLite.openDatabaseAsync(DATABASE_NAME);
      const session = await db.getFirstAsync<{ actif: number; date_fin: string }>(
        "SELECT actif, date_fin FROM sessions WHERE token = ? AND actif = 1;",
        [token]
      );

      if (!session) {
        await logout();
        return false;
      }

      if (session.date_fin && new Date(session.date_fin) < new Date()) {
        await logout();
        return false;
      }

      return true;
    } catch (error) {
      console.error("[UserContext] Erreur vérification session:", error);
      return false;
    }
  };

  // === CONNEXION ===
  const login = useCallback(async (username: string, password: string): Promise<UserSession> => {
    try {
      const db = await SQLite.openDatabaseAsync(DATABASE_NAME);

      const userResult = await db.getFirstAsync<{
        id: number;
        nom: string;
        username: string;
        role: string;
        email?: string;
        avatar?: string;
        magasin_id?: number;
        password: string;
      }>(
        "SELECT id, nom, username, role, email, avatar, magasin_id, password FROM utilisateurs WHERE username = ? AND actif = 1;",
        [username.trim()]
      );

      if (!userResult) {
        throw new Error("Identifiants invalides.");
      }

      const isValidPassword = userResult.password === password;
      if (!isValidPassword) {
        throw new Error("Identifiants invalides.");
      }

      const sessionUser: UserSession = {
        id: userResult.id,
        nom: userResult.nom,
        username: userResult.username,
        role: userResult.role as UserSession["role"],
        email: userResult.email,
        avatar: userResult.avatar,
        magasin_id: userResult.magasin_id,
        permissions: ROLE_PERMISSIONS[userResult.role as UserSession["role"]] || [],
        derniere_connexion: new Date().toISOString(),
      };

      const token = `stk_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;

      await AsyncStorage.setItem(STORAGE_KEYS.USER_SESSION, JSON.stringify(sessionUser));
      await AsyncStorage.setItem(STORAGE_KEYS.USER_TOKEN, token);
      await AsyncStorage.setItem(STORAGE_KEYS.LAST_LOGIN, new Date().toISOString());
      await AsyncStorage.removeItem(STORAGE_KEYS.BLOCKED_STATUS);

      await db.runAsync(
        `INSERT INTO sessions (utilisateur_id, token, date_debut, date_fin, actif)
         VALUES (?, ?, ?, ?, 1);`,
        [userResult.id, token, new Date().toISOString(), new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()]
      );

      await db.runAsync("UPDATE utilisateurs SET derniere_connexion = ? WHERE id = ?;", [
        new Date().toISOString(),
        userResult.id,
      ]);

      setUser(sessionUser);
      setLastLogin(new Date().toISOString());
      setBlocked(false);

      return sessionUser;
    } catch (error: any) {
      console.error("[UserContext] Erreur login:", error);
      throw new Error(error.message || "Erreur de connexion.");
    }
  }, []);

  // === DÉCONNEXION ===
  const logout = useCallback(async (): Promise<void> => {
    try {
      const token = await AsyncStorage.getItem(STORAGE_KEYS.USER_TOKEN);
      if (token) {
        const db = await SQLite.openDatabaseAsync(DATABASE_NAME);
        await db.runAsync("UPDATE sessions SET actif = 0, date_fin = ? WHERE token = ?;", [
          new Date().toISOString(),
          token,
        ]);
      }

      await AsyncStorage.multiRemove([STORAGE_KEYS.USER_SESSION, STORAGE_KEYS.USER_TOKEN, STORAGE_KEYS.LAST_LOGIN]);

      setUser(null);
      setLastLogin(null);
    } catch (error) {
      console.error("[UserContext] Erreur logout:", error);
      setUser(null);
    }
  }, []);

  // === VÉRIFICATION DE SESSION ===
  const checkSession = useCallback(async (): Promise<boolean> => {
    try {
      const userData = await AsyncStorage.getItem(STORAGE_KEYS.USER_SESSION);
      const token = await AsyncStorage.getItem(STORAGE_KEYS.USER_TOKEN);

      if (!userData || !token) return false;

      return await checkSessionValidity();
    } catch (error) {
      console.error("[UserContext] Erreur checkSession:", error);
      return false;
    }
  }, []);

  // === MISE À JOUR DE L'UTILISATEUR ===
  const updateUser = useCallback(async (updates: Partial<UserSession>): Promise<void> => {
    if (!user) return;

    try {
      const updatedUser = { ...user, ...updates };
      await AsyncStorage.setItem(STORAGE_KEYS.USER_SESSION, JSON.stringify(updatedUser));
      setUser(updatedUser);

      const db = await SQLite.openDatabaseAsync(DATABASE_NAME);
      const fields: string[] = [];
      const values: any[] = [];

      Object.entries(updates).forEach(([key, value]) => {
        if (key !== "id" && key !== "role" && key !== "permissions") {
          fields.push(`${key} = ?`);
          values.push(value);
        }
      });

      if (fields.length > 0) {
        values.push(user.id);
        await db.runAsync(`UPDATE utilisateurs SET ${fields.join(", ")} WHERE id = ?;`, values);
      }
    } catch (error) {
      console.error("[UserContext] Erreur updateUser:", error);
      throw error;
    }
  }, [user]);

  // === MISE À JOUR DES PARAMÈTRES ===
  const updateSettings = useCallback(async (newSettings: Partial<AppSettings>): Promise<void> => {
    try {
      const updatedSettings = { ...settings, ...newSettings };
      setSettings(updatedSettings);

      const savePromises: Promise<void>[] = [];

      if (newSettings.printEnabled !== undefined) {
        savePromises.push(
          AsyncStorage.setItem(STORAGE_KEYS.PRINT_ENABLED, JSON.stringify(newSettings.printEnabled))
        );
      }

      await Promise.all(savePromises);

      if (newSettings.devise) {
        const db = await SQLite.openDatabaseAsync(DATABASE_NAME);
        await db.runAsync("UPDATE parametres_systeme SET valeur = ? WHERE cle = 'devise_symbole';", [newSettings.devise]);
      }

      if (newSettings.nomBoutique) {
        const db = await SQLite.openDatabaseAsync(DATABASE_NAME);
        await db.runAsync("UPDATE parametres_systeme SET valeur = ? WHERE cle = 'nom_boutique';", [newSettings.nomBoutique]);
      }
    } catch (error) {
      console.error("[UserContext] Erreur updateSettings:", error);
      throw error;
    }
  }, [settings]);

  // === VÉRIFICATION DES PERMISSIONS ===
  const hasPermission = useCallback(
    (permission: string): boolean => {
      if (!user) return false;
      const permissions = user.permissions || ROLE_PERMISSIONS[user.role] || [];
      return permissions.includes("*") || permissions.includes(permission);
    },
    [user]
  );

  // === VÉRIFICATION DE LA LICENCE ===
  const checkLicence = useCallback(async (): Promise<boolean> => {
    try {
      const db = await SQLite.openDatabaseAsync(DATABASE_NAME);
      const licenceResult = await db.getFirstAsync<{
        cle_licence: string;
        device_fingerprint: string;
        date_activation: string;
        date_expiration: string;
        statut: string;
        type_licence: string;
        nom_titulaire?: string;
        email_titulaire?: string;
      }>("SELECT * FROM licences WHERE device_fingerprint = ?;", [deviceId]);

      if (!licenceResult) {
        setLicence({ statut: "PENDING" });
        setBlocked(true);
        return false;
      }

      const now = new Date();
      const expiration = new Date(licenceResult.date_expiration);
      const joursRestants = Math.ceil((expiration.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

      const licenceInfo: LicenceInfo = {
        statut: licenceResult.statut as LicenceInfo["statut"],
        dateActivation: licenceResult.date_activation,
        dateExpiration: licenceResult.date_expiration,
        joursRestants: joursRestants > 0 ? joursRestants : 0,
        nomTitulaire: licenceResult.nom_titulaire,
        emailTitulaire: licenceResult.email_titulaire,
        typeLicence: licenceResult.type_licence as LicenceInfo["typeLicence"],
      };

      setLicence(licenceInfo);

      if (licenceResult.statut === "EXPIRED" || licenceResult.statut === "REVOKED") {
        setBlocked(true);
        return false;
      }

      if (joursRestants <= 0) {
        await db.runAsync("UPDATE licences SET statut = 'EXPIRED' WHERE device_fingerprint = ?;", [deviceId]);
        setBlocked(true);
        return false;
      }

      setBlocked(false);
      return true;
    } catch (error) {
      console.error("[UserContext] Erreur checkLicence:", error);
      setBlocked(true);
      return false;
    }
  }, [deviceId]);

  // === VALEURS MÉMOISÉES ===
  const contextValue = useMemo<UserContextType>(
    () => ({
      user,
      setUser,
      isLoading,
      login,
      logout,
      checkSession,
      updateUser,
      hasPermission,
      isAuthenticated: !!user,
      userRole: user?.role || null,
      settings,
      updateSettings,
      printEnabled: settings.printEnabled,
      setPrintEnabled: (enabled: boolean) => {
        setSettings((prev) => ({ ...prev, printEnabled: enabled }));
        AsyncStorage.setItem(STORAGE_KEYS.PRINT_ENABLED, JSON.stringify(enabled));
      },
      licence,
      checkLicence,
      blocked,
      setBlocked,
      lastLogin,
      deviceId,
    }),
    [
      user,
      isLoading,
      login,
      logout,
      checkSession,
      updateUser,
      hasPermission,
      settings,
      updateSettings,
      licence,
      blocked,
      lastLogin,
      deviceId,
    ]
  );

  return <UserContext.Provider value={contextValue}>{children}</UserContext.Provider>;
};

export default UserContext; 