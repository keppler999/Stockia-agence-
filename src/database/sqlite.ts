import * as SQLite from "expo-sqlite";

export type ResultRow = { [key: string]: any };

function transactionAsync(db: SQLite.WebSQLDatabase, sql: string, params: any[] = []): Promise<SQLite.SQLResultSet> {
  return new Promise((resolve, reject) => {
    db.transaction((tx) => {
      tx.executeSql(
        sql,
        params,
        (_tx, result) => resolve(result),
        (_tx, err) => {
          reject(err);
          return false;
        }
      );
    });
  });
}

export async function openDatabaseAsync(name: string): Promise<{
  executeSql: (sql: string, params?: any[]) => Promise<SQLite.SQLResultSet>;
  getFirstAsync: <T = any>(sql: string, params?: any[]) => Promise<T | null>;
  runAsync: (sql: string, params?: any[]) => Promise<void>;
}> {
  const db = SQLite.openDatabase(name);

  const executeSql = async (sql: string, params: any[] = []) => {
    return await transactionAsync(db, sql, params);
  };

  const getFirstAsync = async <T = any>(sql: string, params: any[] = []) => {
    const res = await executeSql(sql, params);
    if (res.rows && res.rows.length > 0) {
      return (res.rows.item(0) as unknown) as T;
    }
    return null;
  };

  const runAsync = async (sql: string, params: any[] = []) => {
    await executeSql(sql, params);
  };

  return { executeSql, getFirstAsync, runAsync };
}
