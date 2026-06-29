import { useState, useEffect, useCallback, useMemo } from "react";
import * as SQLite from "expo-sqlite";
import { Alert } from "react-native";
import { dbService } from "../services/DatabaseService";
import * as Haptics from "expo-haptics";

// === INTERFACES ===
export interface DatabaseState {
  isInitialized: boolean;
  isLoading: boolean;
  error: string | null;
  stats: {
    tableCount: number;
    totalRows: number;
    size: string;
    lastBackup: string | null;
    integrity: boolean;
  } | null;
  queryCount: number;
  lastQuery: string | null;
  lastQueryTime: number | null;
}

export interface QueryOptions {
  timeout?: number;
  transaction?: boolean;
  log?: boolean;
}

export interface QueryResult<T = any> {
  data: T[];
  changes: number;
  lastInsertRowId: number;
  executionTime: number;
  success: boolean;
  error?: string;
}

export interface UseDatabaseReturn {
  state: DatabaseState;
  query: <T = any>(sql: string, params?: any[]) => Promise<QueryResult<T>>;
  transaction: <T>(callback: (db: SQLite.SQLiteDatabase) => Promise<T>) => Promise<T>;
  backup: () => Promise<{ success: boolean; path?: string; error?: string }>;
  restore: (path: string) => Promise<{ success: boolean; error?: string }>;
  getBackups: () => Promise<{ name: string; size: number; date: Date; path: string }[]>;
  deleteBackup: (name: string) => Promise<boolean>;
  cleanup: () => Promise<{ deleted: number; tables: string[] }>;
  checkIntegrity: () => Promise<{ valid: boolean; errors: string[] }>;
  reset: () => Promise<boolean>;
  getStats: () => Promise<DatabaseState["stats"]>;
  preparedQuery: <T = any>(sql: string, params: any[]) => Promise<QueryResult<T>>;
}

// === CONSTANTES ===
const QUERY_TIMEOUT = 30000; // 30 secondes

// ============================================
// 📁 HOOK DATABASE
// ============================================

export function useDatabase(): UseDatabaseReturn {
  // === ÉTATS ===
  const [state, setState] = useState<DatabaseState>({
    isInitialized: false,
    isLoading: false,
    error: null,
    stats: null,
    queryCount: 0,
    lastQuery: null,
    lastQueryTime: null,
  });

  // === INITIALISATION ===
  useEffect(() => {
    initializeDatabase();
  }, []);

  const initializeDatabase = async () => {
    try {
      setState((prev) => ({ ...prev, isLoading: true }));

      await dbService.initialize();

      const stats = await dbService.getStats();

      setState((prev) => ({
        ...prev,
        isInitialized: true,
        isLoading: false,
        stats,
        error: null,
      }));

      console.log("[useDatabase] Base initialisée");
    } catch (error: any) {
      console.error("[useDatabase] Erreur initialisation:", error);
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: error.message || "Erreur d'initialisation de la base",
      }));
    }
  };

  // === EXÉCUTION DE REQUÊTE ===
  const query = useCallback(
    async <T = any>(sql: string, params: any[] = [], options: QueryOptions = {}): Promise<QueryResult<T>> => {
      const startTime = Date.now();

      try {
        setState((prev) => ({ ...prev, isLoading: true }));

        const db = await dbService.getConnection();
        const results = await db.getAllAsync<T>(sql, params);

        const executionTime = Date.now() - startTime;

        setState((prev) => ({
          ...prev,
          isLoading: false,
          queryCount: prev.queryCount + 1,
          lastQuery: sql.substring(0, 100) + (sql.length > 100 ? "..." : ""),
          lastQueryTime: executionTime,
        }));

        return {
          data: results || [],
          changes: 0,
          lastInsertRowId: 0,
          executionTime,
          success: true,
        };
      } catch (error: any) {
        console.error("[useDatabase] Erreur requête:", error);
        const executionTime = Date.now() - startTime;

        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: error.message || "Erreur d'exécution de la requête",
        }));

        return {
          data: [],
          changes: 0,
          lastInsertRowId: 0,
          executionTime,
          success: false,
          error: error.message,
        };
      }
    },
    []
  );

  // === TRANSACTION ===
  const transaction = useCallback(
    async <T>(callback: (db: SQLite.SQLiteDatabase) => Promise<T>): Promise<T> => {
      try {
        setState((prev) => ({ ...prev, isLoading: true }));

        const db = await dbService.getConnection();
        const result = await db.withTransactionAsync(callback);

        setState((prev) => ({
          ...prev,
          isLoading: false,
          queryCount: prev.queryCount + 1,
        }));

        return result;
      } catch (error: any) {
        console.error("[useDatabase] Erreur transaction:", error);
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: error.message || "Erreur de transaction",
        }));
        throw error;
      }
    },
    []
  );

  // === REQUÊTE PRÉPARÉE ===
  const preparedQuery = useCallback(
    async <T = any>(sql: string, params: any[]): Promise<QueryResult<T>> => {
      return query<T>(sql, params);
    },
    [query]
  );

  // === SAUVEGARDE ===
  const backup = useCallback(async () => {
    try {
      setState((prev) => ({ ...prev, isLoading: true }));

      const backupInfo = await dbService.backup();

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      setState((prev) => ({
        ...prev,
        isLoading: false,
      }));

      return {
        success: true,
        path: backupInfo.path,
      };
    } catch (error: any) {
      console.error("[useDatabase] Erreur backup:", error);
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: error.message || "Erreur de sauvegarde",
      }));

      return {
        success: false,
        error: error.message,
      };
    }
  }, []);

  // === RESTAURATION ===
  const restore = useCallback(async (path: string) => {
    try {
      setState((prev) => ({ ...prev, isLoading: true }));

      await dbService.restore(path);

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      setState((prev) => ({
        ...prev,
        isLoading: false,
      }));

      const stats = await dbService.getStats();
      setState((prev) => ({ ...prev, stats }));

      return { success: true };
    } catch (error: any) {
      console.error("[useDatabase] Erreur restore:", error);
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: error.message || "Erreur de restauration",
      }));

      return {
        success: false,
        error: error.message,
      };
    }
  }, []);

  // === OBTENIR LES SAUVEGARDES ===
  const getBackups = useCallback(async () => {
    try {
      return await dbService.getBackups();
    } catch (error: any) {
      console.error("[useDatabase] Erreur getBackups:", error);
      return [];
    }
  }, []);

  // === SUPPRIMER UNE SAUVEGARDE ===
  const deleteBackup = useCallback(async (name: string) => {
    try {
      const result = await dbService.deleteBackup(name);
      if (result) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
      return result;
    } catch (error: any) {
      console.error("[useDatabase] Erreur deleteBackup:", error);
      return false;
    }
  }, []);

  // === NETTOYAGE ===
  const cleanup = useCallback(async () => {
    try {
      setState((prev) => ({ ...prev, isLoading: true }));

      const result = await dbService.cleanup();

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      const stats = await dbService.getStats();
      setState((prev) => ({
        ...prev,
        isLoading: false,
        stats,
      }));

      return result;
    } catch (error: any) {
      console.error("[useDatabase] Erreur cleanup:", error);
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: error.message || "Erreur de nettoyage",
      }));

      return {
        deleted: 0,
        tables: [],
      };
    }
  }, []);

  // === VÉRIFICATION DE L'INTÉGRITÉ ===
  const checkIntegrity = useCallback(async () => {
    try {
      setState((prev) => ({ ...prev, isLoading: true }));

      const result = await dbService.checkIntegrity();

      setState((prev) => ({
        ...prev,
        isLoading: false,
      }));

      return result;
    } catch (error: any) {
      console.error("[useDatabase] Erreur checkIntegrity:", error);
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: error.message || "Erreur de vérification d'intégrité",
      }));

      return {
        valid: false,
        errors: [error.message],
      };
    }
  }, []);

  // === RÉINITIALISATION ===
  const reset = useCallback(async () => {
    try {
      setState((prev) => ({ ...prev, isLoading: true }));

      const result = await dbService.resetDatabase();

      if (result) {
        const stats = await dbService.getStats();
        setState((prev) => ({
          ...prev,
          isLoading: false,
          stats,
          error: null,
        }));

        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }

      return result;
    } catch (error: any) {
      console.error("[useDatabase] Erreur reset:", error);
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: error.message || "Erreur de réinitialisation",
      }));

      return false;
    }
  }, []);

  // === OBTENIR LES STATISTIQUES ===
  const getStats = useCallback(async () => {
    try {
      const stats = await dbService.getStats();
      setState((prev) => ({ ...prev, stats }));
      return stats;
    } catch (error: any) {
      console.error("[useDatabase] Erreur getStats:", error);
      return null;
    }
  }, []);

  // === VALEURS MÉMOISÉES ===
  const value = useMemo<UseDatabaseReturn>(
    () => ({
      state,
      query,
      transaction,
      backup,
      restore,
      getBackups,
      deleteBackup,
      cleanup,
      checkIntegrity,
      reset,
      getStats,
      preparedQuery,
    }),
    [
      state,
      query,
      transaction,
      backup,
      restore,
      getBackups,
      deleteBackup,
      cleanup,
      checkIntegrity,
      reset,
      getStats,
      preparedQuery,
    ]
  );

  return value;
}

// ============================================
// 📁 HOOKS DÉRIVÉS
// ============================================

export function useDatabaseStats() {
  const { state } = useDatabase();
  return state.stats;
}

export function useDatabaseError() {
  const { state } = useDatabase();
  return state.error;
}

export function useDatabaseLoading() {
  const { state } = useDatabase();
  return state.isLoading;
}

export function useDatabaseQueryCount() {
  const { state } = useDatabase();
  return state.queryCount;
}

export default useDatabase; 