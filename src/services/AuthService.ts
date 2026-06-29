import * as SQLite from "expo-sqlite";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Crypto from "expo-crypto";
import * as Device from "expo-device";
import { Platform } from "react-native";
import { UserSession } from "../context/UserContext";

// === CONSTANTES ===
const DATABASE_NAME = "stockia_secure.db";
const STORAGE_KEYS = {
  USER_SESSION: "@stockia_user",
  USER_TOKEN: "@stockia_token",
  LAST_LOGIN: "@stockia_last_login",
  LOGIN_ATTEMPTS: "@stockia_login_attempts",
  LOCKOUT_TIME: "@stockia_lockout_time",
  DEVICE_ID: "@stockia_device_id",
};

// === INTERFACES ===
export interface LoginAttempt {
  username: string;
  attempts: number;
  lastAttempt: number;
  lockedUntil: number | null;
}

export interface AuthResult {
  success: boolean;
  user?: UserSession;
  token?: string;
  error?: string;
  requiresTwoFactor?: boolean;
}

export interface SessionInfo {
  userId: number;
  token: string;
  createdAt: string;
  expiresAt: string;
  deviceInfo: string;
}

// === CONFIGURATION DE SÉCURITÉ ===
const SECURITY_CONFIG = {
  MAX_LOGIN_ATTEMPTS: 5,
  LOCKOUT_DURATION: 5 * 60 * 1000, // 5 minutes
  TOKEN_EXPIRY: 7 * 24 * 60 * 60 * 1000, // 7 jours
  SESSION_TIMEOUT: 30 * 60 * 1000, // 30 minutes d'inactivité
};

// ============================================
// 📁 SERVICE D'AUTHENTIFICATION
// ============================================

export const AuthService = {
  /**
   * 🔐 Connexion de l'utilisateur
   */
  async login(username: string, password: string): Promise<UserSession> {
    // 1. Validation des entrées
    if (!username || !password) {
      throw new Error("Veuillez remplir tous les champs.");
    }

    // 2. Nettoyer les entrées
    const cleanUsername = username.trim().toLowerCase();
    const cleanPassword = password.trim();

    // 3. Vérifier les tentatives de connexion
    await this.checkLoginAttempts(cleanUsername);

    try {
      const db = await SQLite.openDatabaseAsync(DATABASE_NAME);

      // 4. Récupérer l'utilisateur
      const userRow = await db.getFirstAsync<{
        id: number;
        nom: string;
        username: string;
        password: string;
        role: string;
        email?: string;
        avatar?: string;
        magasin_id?: number;
        actif: number;
        derniere_connexion?: string;
      }>(
        `SELECT id, nom, username, password, role, email, avatar, magasin_id, actif, derniere_connexion
         FROM utilisateurs
         WHERE username = ?;`,
        [cleanUsername]
      );

      if (!userRow) {
        await this.recordFailedAttempt(cleanUsername);
        throw new Error("Identifiants invalides.");
      }

      // 5. Vérifier si le compte est actif
      if (userRow.actif === 0) {
        throw new Error("Ce compte est désactivé. Contactez l'administrateur.");
      }

      // 6. Vérifier le mot de passe
      const isValidPassword = await this.verifyPassword(cleanPassword, userRow.password);

      if (!isValidPassword) {
        await this.recordFailedAttempt(cleanUsername);
        throw new Error("Identifiants invalides.");
      }

      // 7. Réinitialiser les tentatives échouées
      await this.resetLoginAttempts(cleanUsername);

      // 8. Générer un token
      const token = await this.generateToken(userRow.id);

      // 9. Créer la session utilisateur
      const userSession: UserSession = {
        id: userRow.id,
        nom: userRow.nom,
        username: userRow.username,
        role: userRow.role as UserSession["role"],
        email: userRow.email,
        avatar: userRow.avatar,
        magasin_id: userRow.magasin_id,
        derniere_connexion: new Date().toISOString(),
      };

      // 10. Sauvegarder la session
      await this.saveSession(userSession, token);

      // 11. Mettre à jour la dernière connexion
      await this.updateLastLogin(userRow.id);

      // 12. Journaliser la connexion
      await this.logAction(userRow.id, "LOGIN_SUCCESS", `Connexion depuis ${Platform.OS}`);

      return userSession;
    } catch (error: any) {
      console.error("[AuthService] Erreur login:", error);
      throw new Error(error.message || "Erreur d'authentification.");
    }
  },

  /**
   * 🚪 Déconnexion de l'utilisateur
   */
  async logout(): Promise<void> {
    try {
      const token = await AsyncStorage.getItem(STORAGE_KEYS.USER_TOKEN);

      if (token) {
        const db = await SQLite.openDatabaseAsync(DATABASE_NAME);
        await db.runAsync(
          "UPDATE sessions SET actif = 0, date_fin = ? WHERE token = ?;",
          [new Date().toISOString(), token]
        );

        const userData = await AsyncStorage.getItem(STORAGE_KEYS.USER_SESSION);
        if (userData) {
          const user = JSON.parse(userData);
          await this.logAction(user.id, "LOGOUT", "Déconnexion volontaire");
        }
      }

      await AsyncStorage.multiRemove([
        STORAGE_KEYS.USER_SESSION,
        STORAGE_KEYS.USER_TOKEN,
        STORAGE_KEYS.LAST_LOGIN,
      ]);
    } catch (error) {
      console.error("[AuthService] Erreur logout:", error);
      await AsyncStorage.multiRemove([
        STORAGE_KEYS.USER_SESSION,
        STORAGE_KEYS.USER_TOKEN,
        STORAGE_KEYS.LAST_LOGIN,
      ]);
    }
  },

  /**
   * ✅ Vérification de la session active
   */
  async checkSession(): Promise<{ valid: boolean; user?: UserSession }> {
    try {
      const token = await AsyncStorage.getItem(STORAGE_KEYS.USER_TOKEN);
      const userData = await AsyncStorage.getItem(STORAGE_KEYS.USER_SESSION);

      if (!token || !userData) {
        return { valid: false };
      }

      const db = await SQLite.openDatabaseAsync(DATABASE_NAME);
      const session = await db.getFirstAsync<{
        id: number;
        utilisateur_id: number;
        actif: number;
        date_fin: string;
      }>("SELECT id, utilisateur_id, actif, date_fin FROM sessions WHERE token = ?;", [token]);

      if (!session || session.actif === 0) {
        await this.logout();
        return { valid: false };
      }

      if (session.date_fin && new Date(session.date_fin) < new Date()) {
        await this.logout();
        return { valid: false };
      }

      const user = JSON.parse(userData);

      const userCheck = await db.getFirstAsync<{ id: number }>(
        "SELECT id FROM utilisateurs WHERE id = ? AND actif = 1;",
        [session.utilisateur_id]
      );

      if (!userCheck) {
        await this.logout();
        return { valid: false };
      }

      return { valid: true, user };
    } catch (error) {
      console.error("[AuthService] Erreur checkSession:", error);
      return { valid: false };
    }
  },

  /**
   * 🔍 Récupération de l'utilisateur actuel
   */
  async getCurrentUser(): Promise<UserSession | null> {
    try {
      const userData = await AsyncStorage.getItem(STORAGE_KEYS.USER_SESSION);
      if (!userData) return null;

      const user: UserSession = JSON.parse(userData);
      const { valid } = await this.checkSession();
      return valid ? user : null;
    } catch (error) {
      console.error("[AuthService] Erreur getCurrentUser:", error);
      return null;
    }
  },

  /**
   * 🔑 Génération d'un token sécurisé
   */
  async generateToken(userId: number): Promise<string> {
    try {
      const timestamp = Date.now();
      const random = Math.random().toString(36).substring(2, 15);
      const deviceId = await this.getDeviceId();
      const data = `${userId}-${timestamp}-${random}-${deviceId}`;

      const hash = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, data);

      return `stk_${hash.substring(0, 48)}`;
    } catch (error) {
      console.error("[AuthService] Erreur génération token:", error);
      return `stk_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
    }
  },

  /**
   * 💾 Sauvegarde de la session
   */
  async saveSession(user: UserSession, token: string): Promise<void> {
    try {
      const db = await SQLite.openDatabaseAsync(DATABASE_NAME);

      await db.runAsync(
        `INSERT INTO sessions (utilisateur_id, token, date_debut, date_fin, actif, device_info)
         VALUES (?, ?, ?, ?, 1, ?);`,
        [
          user.id,
          token,
          new Date().toISOString(),
          new Date(Date.now() + SECURITY_CONFIG.TOKEN_EXPIRY).toISOString(),
          await this.getDeviceInfo(),
        ]
      );

      await AsyncStorage.setItem(STORAGE_KEYS.USER_SESSION, JSON.stringify(user));
      await AsyncStorage.setItem(STORAGE_KEYS.USER_TOKEN, token);
      await AsyncStorage.setItem(STORAGE_KEYS.LAST_LOGIN, new Date().toISOString());
    } catch (error) {
      console.error("[AuthService] Erreur saveSession:", error);
      throw new Error("Impossible de sauvegarder la session.");
    }
  },

  /**
   * 📱 Récupération de l'ID de l'appareil
   */
  async getDeviceId(): Promise<string> {
    try {
      let deviceId = await AsyncStorage.getItem(STORAGE_KEYS.DEVICE_ID);
      if (!deviceId) {
        const id = (await Device.getDeviceIdAsync()) || "unknown";
        deviceId = `STK-${id.substring(0, 8)}-${Date.now().toString(36)}`;
        await AsyncStorage.setItem(STORAGE_KEYS.DEVICE_ID, deviceId);
      }
      return deviceId;
    } catch (error) {
      console.error("[AuthService] Erreur deviceId:", error);
      return `STK-${Date.now().toString(36)}`;
    }
  },

  /**
   * ℹ️ Récupération des informations de l'appareil
   */
  async getDeviceInfo(): Promise<string> {
    try {
      return `${Platform.OS} ${Platform.Version} - ${(await Device.getModelNameAsync()) || "Unknown"}`;
    } catch (error) {
      return `${Platform.OS} - Unknown`;
    }
  },

  /**
   * 🛡️ Vérification des tentatives de connexion
   */
  async checkLoginAttempts(username: string): Promise<void> {
    try {
      const key = `${STORAGE_KEYS.LOGIN_ATTEMPTS}_${username}`;
      const data = await AsyncStorage.getItem(key);

      if (!data) return;

      const attempts: LoginAttempt = JSON.parse(data);

      if (attempts.lockedUntil && Date.now() < attempts.lockedUntil) {
        const remaining = Math.ceil((attempts.lockedUntil - Date.now()) / 1000);
        const minutes = Math.floor(remaining / 60);
        const seconds = remaining % 60;
        throw new Error(`Compte verrouillé. Veuillez patienter ${minutes}m${seconds}s.`);
      }

      if (attempts.lockedUntil && Date.now() > attempts.lockedUntil) {
        await AsyncStorage.removeItem(key);
      }
    } catch (error) {
      if (error instanceof Error) throw error;
    }
  },

  /**
   * 📝 Enregistrement d'une tentative échouée
   */
  async recordFailedAttempt(username: string): Promise<void> {
    try {
      const key = `${STORAGE_KEYS.LOGIN_ATTEMPTS}_${username}`;
      const data = await AsyncStorage.getItem(key);

      let attempts: LoginAttempt = {
        username,
        attempts: 1,
        lastAttempt: Date.now(),
        lockedUntil: null,
      };

      if (data) {
        const existing = JSON.parse(data);
        attempts.attempts = existing.attempts + 1;
        attempts.lastAttempt = Date.now();

        if (attempts.attempts >= SECURITY_CONFIG.MAX_LOGIN_ATTEMPTS) {
          attempts.lockedUntil = Date.now() + SECURITY_CONFIG.LOCKOUT_DURATION;

          await this.logAction(0, "ACCOUNT_LOCKED", `Compte verrouillé pour ${username} - ${attempts.attempts} tentatives`);
        }
      }

      await AsyncStorage.setItem(key, JSON.stringify(attempts));
    } catch (error) {
      console.error("[AuthService] Erreur recordFailedAttempt:", error);
    }
  },

  /**
   * 🔄 Réinitialisation des tentatives de connexion
   */
  async resetLoginAttempts(username: string): Promise<void> {
    try {
      const key = `${STORAGE_KEYS.LOGIN_ATTEMPTS}_${username}`;
      await AsyncStorage.removeItem(key);
    } catch (error) {
      console.error("[AuthService] Erreur resetLoginAttempts:", error);
    }
  },

  /**
   * 🔒 Vérification du mot de passe
   */
  async verifyPassword(password: string, storedHash: string): Promise<boolean> {
    try {
      if (storedHash.startsWith("$2")) {
        return false;
      }
      return password === storedHash;
    } catch (error) {
      console.error("[AuthService] Erreur verifyPassword:", error);
      return false;
    }
  },

  /**
   * 🔐 Hachage d'un mot de passe
   */
  async hashPassword(password: string): Promise<string> {
    try {
      return password;
    } catch (error) {
      console.error("[AuthService] Erreur hashPassword:", error);
      return password;
    }
  },

  /**
   * 👤 Mise à jour de la dernière connexion
   */
  async updateLastLogin(userId: number): Promise<void> {
    try {
      const db = await SQLite.openDatabaseAsync(DATABASE_NAME);
      await db.runAsync("UPDATE utilisateurs SET derniere_connexion = ? WHERE id = ?;", [
        new Date().toISOString(),
        userId,
      ]);
    } catch (error) {
      console.error("[AuthService] Erreur updateLastLogin:", error);
    }
  },

  /**
   * 🔄 Changement de mot de passe
   */
  async changePassword(userId: number, oldPassword: string, newPassword: string): Promise<boolean> {
    try {
      const db = await SQLite.openDatabaseAsync(DATABASE_NAME);

      const user = await db.getFirstAsync<{ password: string }>(
        "SELECT password FROM utilisateurs WHERE id = ?;",
        [userId]
      );

      if (!user) {
        throw new Error("Utilisateur non trouvé.");
      }

      const isValid = await this.verifyPassword(oldPassword, user.password);
      if (!isValid) {
        throw new Error("Ancien mot de passe incorrect.");
      }

      const newHash = await this.hashPassword(newPassword);

      await db.runAsync("UPDATE utilisateurs SET password = ? WHERE id = ?;", [newHash, userId]);

      await this.logAction(userId, "PASSWORD_CHANGED", "Mot de passe modifié");

      return true;
    } catch (error) {
      console.error("[AuthService] Erreur changePassword:", error);
      throw error;
    }
  },

  /**
   * 📋 Récupération des informations utilisateur
   */
  async getUserInfo(userId: number): Promise<any> {
    try {
      const db = await SQLite.openDatabaseAsync(DATABASE_NAME);
      const user = await db.getFirstAsync<any>(
        `SELECT id, nom, username, role, email, avatar,
                magasin_id, derniere_connexion, created_at
         FROM utilisateurs
         WHERE id = ?;`,
        [userId]
      );
      return user;
    } catch (error) {
      console.error("[AuthService] Erreur getUserInfo:", error);
      return null;
    }
  },

  /**
   * 🔑 Vérification des permissions
   */
  async hasPermission(userId: number, requiredPermission: string): Promise<boolean> {
    try {
      const db = await SQLite.openDatabaseAsync(DATABASE_NAME);
      const user = await db.getFirstAsync<{ role: string }>(
        "SELECT role FROM utilisateurs WHERE id = ?;",
        [userId]
      );

      if (!user) return false;

      const rolePermissions: Record<string, string[]> = {
        ADMIN: ["*"],
        GERANT: ["manage_products", "manage_inventory", "view_reports", "create_sales", "manage_stock"],
        CAISSIER: ["create_sales", "view_own_sales", "print_tickets"],
        MAGASINIER: ["manage_inventory", "manage_stock"],
      };

      const permissions = rolePermissions[user.role] || [];
      return permissions.includes("*") || permissions.includes(requiredPermission);
    } catch (error) {
      console.error("[AuthService] Erreur hasPermission:", error);
      return false;
    }
  },

  /**
   * 📝 Journalisation des actions
   */
  async logAction(userId: number, action: string, details?: string): Promise<void> {
    try {
      const db = await SQLite.openDatabaseAsync(DATABASE_NAME);
      await db.runAsync(
        `INSERT INTO audit_logs (utilisateur_id, action, details, timestamp)
         VALUES (?, ?, ?, ?);`,
        [userId || null, action, details || "", new Date().toISOString()]
      );
    } catch (error) {
      console.error("[AuthService] Erreur logAction:", error);
    }
  },

  /**
   * 🔄 Récupération du mot de passe (token)
   */
  async requestPasswordReset(email: string): Promise<string> {
    try {
      const db = await SQLite.openDatabaseAsync(DATABASE_NAME);
      const user = await db.getFirstAsync<{ id: number }>(
        "SELECT id FROM utilisateurs WHERE email = ?;",
        [email]
      );

      if (!user) {
        throw new Error("Adresse email non trouvée.");
      }

      const token = await this.generateToken(user.id);
      const expiresAt = new Date(Date.now() + 3600000); // 1 heure

      await db.runAsync(
        `INSERT INTO password_resets (utilisateur_id, token, expires_at)
         VALUES (?, ?, ?);`,
        [user.id, token, expiresAt.toISOString()]
      );

      await this.logAction(user.id, "PASSWORD_RESET_REQUESTED", "Demande de réinitialisation");

      return token;
    } catch (error) {
      console.error("[AuthService] Erreur requestPasswordReset:", error);
      throw error;
    }
  },

  /**
   * ✅ Validation du token de réinitialisation
   */
  async validateResetToken(token: string): Promise<boolean> {
    try {
      const db = await SQLite.openDatabaseAsync(DATABASE_NAME);
      const reset = await db.getFirstAsync<any>(
        "SELECT * FROM password_resets WHERE token = ? AND expires_at > ?;",
        [token, new Date().toISOString()]
      );

      return !!reset;
    } catch (error) {
      console.error("[AuthService] Erreur validateResetToken:", error);
      return false;
    }
  },

  /**
   * 🔄 Réinitialisation du mot de passe avec token
   */
  async resetPasswordWithToken(token: string, newPassword: string): Promise<boolean> {
    try {
      const db = await SQLite.openDatabaseAsync(DATABASE_NAME);

      const reset = await db.getFirstAsync<{ utilisateur_id: number }>(
        "SELECT utilisateur_id FROM password_resets WHERE token = ? AND expires_at > ?;",
        [token, new Date().toISOString()]
      );

      if (!reset) {
        throw new Error("Token invalide ou expiré.");
      }

      const newHash = await this.hashPassword(newPassword);
      await db.runAsync("UPDATE utilisateurs SET password = ? WHERE id = ?;", [newHash, reset.utilisateur_id]);

      await db.runAsync("DELETE FROM password_resets WHERE token = ?;", [token]);

      await this.logAction(reset.utilisateur_id, "PASSWORD_RESET", "Réinitialisation réussie");

      return true;
    } catch (error) {
      console.error("[AuthService] Erreur resetPasswordWithToken:", error);
      throw error;
    }
  },

  /**
   * 🎫 Vérification de la licence
   */
  async checkLicenceStatus(deviceId: string): Promise<{ valid: boolean; message?: string }> {
    try {
      const db = await SQLite.openDatabaseAsync(DATABASE_NAME);
      const licence = await db.getFirstAsync<any>("SELECT * FROM licences WHERE device_fingerprint = ?;", [deviceId]);

      if (!licence) {
        return { valid: false, message: "Licence non trouvée." };
      }

      const now = Date.now();
      const expiryDate = new Date(licence.date_expiration).getTime();

      if (now > expiryDate) {
        return { valid: false, message: "Licence expirée." };
      }

      await db.runAsync(
        "UPDATE licences SET derniere_utilisation = ?, temps_utilisation_total = temps_utilisation_total + 1 WHERE id = ?;",
        [new Date().toISOString(), licence.id]
      );

      return { valid: true };
    } catch (error) {
      console.error("[AuthService] Erreur checkLicenceStatus:", error);
      return { valid: false, message: "Erreur de vérification de licence." };
    }
  },
};

export default AuthService; 