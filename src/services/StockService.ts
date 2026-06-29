import * as SQLite from "expo-sqlite";
import { dbService } from "./DatabaseService";
import { formatDate } from "../utils/helpers";

// === INTERFACES ===
export interface Product {
  id: number;
  code_barre?: string;
  nom: string;
  categorie: string;
  sous_categorie?: string;
  prix_achat: number;
  prix_view: number;
  prix_promo?: number;
  stock_actuel: number;
  stock_minimum: number;
  stock_securite?: number;
  unite_mesure?: string;
  poids?: number;
  emplacement?: string;
  actif: number;
  created_at: string;
  updated_at: string;
}

export interface ProductWithStats extends Product {
  total_ventes: number;
  total_quantite: number;
  dernier_mouvement?: string;
  marge: number;
  rotation: number;
  valeur_stock: number;
}

export interface StockMovement {
  id: number;
  produit_id: number;
  type_mouvement: "VENTE" | "APPROVISIONNEMENT" | "PERTE" | "RETOUR" | "AJUSTEMENT";
  quantite: number;
  stock_avant: number;
  stock_apres: number;
  date_mouvement: string;
  commentaire?: string;
  utilisateur_id?: number;
  utilisateur_nom?: string;
}

export interface StockAlert {
  id: number;
  produit_id: number;
  nom: string;
  stock_actuel: number;
  stock_minimum: number;
  categorie: string;
  emplacement?: string;
  niveau: "critique" | "alerte" | "info";
}

export interface ProductFilter {
  search?: string;
  category?: string;
  minStock?: number;
  maxStock?: number;
  minPrice?: number;
  maxPrice?: number;
  activeOnly?: boolean;
  alertOnly?: boolean;
  outOfStockOnly?: boolean;
  sortBy?: "nom" | "stock" | "prix" | "ventes" | "marge";
  sortOrder?: "ASC" | "DESC";
  limit?: number;
  offset?: number;
}

export interface MovementFilter {
  productId?: number;
  startDate?: string;
  endDate?: string;
  types?: StockMovement["type_mouvement"][];
  userId?: number;
  limit?: number;
  offset?: number;
}

export interface StockStats {
  totalProducts: number;
  totalValue: number;
  averagePrice: number;
  lowStock: number;
  outOfStock: number;
  totalMovements: number;
  lastMovementDate: string | null;
  categories: { name: string; count: number; value: number }[];
}

// === CONSTANTES ===
const DATABASE_NAME = "stockia_secure.db";

// ============================================
// 📁 CLASSE PRINCIPALE
// ============================================

export class StockService {
  private static instance: StockService;
  private db: SQLite.SQLiteDatabase | null = null;

  private constructor() {}

  static getInstance(): StockService {
    if (!StockService.instance) {
      StockService.instance = new StockService();
    }
    return StockService.instance;
  }

  // === OBTENIR LA CONNEXION ===
  private async getDB(): Promise<SQLite.SQLiteDatabase> {
    if (!this.db) {
      this.db = await SQLite.openDatabaseAsync(DATABASE_NAME);
    }
    return this.db;
  }

  // === PRODUITS ===
  async getProducts(filter: ProductFilter = {}): Promise<Product[]> {
    try {
      const db = await this.getDB();
      let query = "SELECT * FROM produits WHERE 1=1";
      const params: any[] = [];

      if (filter.search) {
        query += " AND (nom LIKE ? OR code_barre LIKE ?)";
        params.push(`%${filter.search}%`, `%${filter.search}%`);
      }

      if (filter.category) {
        query += " AND categorie = ?";
        params.push(filter.category);
      }

      if (filter.minStock !== undefined) {
        query += " AND stock_actuel >= ?";
        params.push(filter.minStock);
      }

      if (filter.maxStock !== undefined) {
        query += " AND stock_actuel <= ?";
        params.push(filter.maxStock);
      }

      if (filter.minPrice !== undefined) {
        query += " AND prix_view >= ?";
        params.push(filter.minPrice);
      }

      if (filter.maxPrice !== undefined) {
        query += " AND prix_view <= ?";
        params.push(filter.maxPrice);
      }

      if (filter.activeOnly) {
        query += " AND actif = 1";
      }

      if (filter.alertOnly) {
        query += " AND stock_actuel <= stock_minimum";
      }

      if (filter.outOfStockOnly) {
        query += " AND stock_actuel <= 0";
      }

      if (filter.sortBy) {
        const order = filter.sortOrder || "ASC";
        query += ` ORDER BY ${filter.sortBy} ${order}`;
      } else {
        query += " ORDER BY nom ASC";
      }

      if (filter.limit !== undefined) {
        query += " LIMIT ?";
        params.push(filter.limit);
        if (filter.offset !== undefined) {
          query += " OFFSET ?";
          params.push(filter.offset);
        }
      }

      return await db.getAllAsync<Product>(query, params);
    } catch (error) {
      console.error("[StockService] Erreur getProducts:", error);
      throw error;
    }
  }

  async getProductById(id: number): Promise<Product | null> {
    try {
      const db = await this.getDB();
      return await db.getFirstAsync<Product>("SELECT * FROM produits WHERE id = ?;", [id]);
    } catch (error) {
      console.error("[StockService] Erreur getProductById:", error);
      return null;
    }
  }

  async getProductByBarcode(barcode: string): Promise<Product | null> {
    try {
      const db = await this.getDB();
      return await db.getFirstAsync<Product>("SELECT * FROM produits WHERE code_barre = ?;", [barcode]);
    } catch (error) {
      console.error("[StockService] Erreur getProductByBarcode:", error);
      return null;
    }
  }

  async createProduct(data: Omit<Product, "id" | "created_at" | "updated_at">): Promise<number> {
    try {
      const db = await this.getDB();
      const now = new Date().toISOString();

      const result = await db.runAsync(
        `INSERT INTO produits (
          code_barre, nom, categorie, sous_categorie,
          prix_achat, prix_view, prix_promo,
          stock_actuel, stock_minimum, stock_securite,
          unite_mesure, poids, emplacement, actif,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
        [
          data.code_barre || null,
          data.nom,
          data.categorie,
          data.sous_categorie || null,
          data.prix_achat,
          data.prix_view,
          data.prix_promo || null,
          data.stock_actuel,
          data.stock_minimum,
          data.stock_securite || null,
          data.unite_mesure || "unité",
          data.poids || null,
          data.emplacement || null,
          data.actif !== undefined ? data.actif : 1,
          now,
          now,
        ]
      );

      return Number(result.lastInsertRowId);
    } catch (error) {
      console.error("[StockService] Erreur createProduct:", error);
      throw error;
    }
  }

  async updateProduct(id: number, data: Partial<Product>): Promise<boolean> {
    try {
      const db = await this.getDB();
      const now = new Date().toISOString();

      const fields: string[] = [];
      const values: any[] = [];

      const allowedFields = [
        "code_barre",
        "nom",
        "categorie",
        "sous_categorie",
        "prix_achat",
        "prix_view",
        "prix_promo",
        "stock_actuel",
        "stock_minimum",
        "stock_securite",
        "unite_mesure",
        "poids",
        "emplacement",
        "actif",
      ];

      for (const field of allowedFields) {
        if (data[field as keyof Product] !== undefined) {
          fields.push(`${field} = ?`);
          values.push(data[field as keyof Product]);
        }
      }

      if (fields.length === 0) return false;

      fields.push("updated_at = ?");
      values.push(now);
      values.push(id);

      const result = await db.runAsync(`UPDATE produits SET ${fields.join(", ")} WHERE id = ?;`, values);

      return result.changes > 0;
    } catch (error) {
      console.error("[StockService] Erreur updateProduct:", error);
      throw error;
    }
  }

  async deleteProduct(id: number): Promise<boolean> {
    try {
      const db = await this.getDB();
      const result = await db.runAsync("UPDATE produits SET actif = 0 WHERE id = ?;", [id]);
      return result.changes > 0;
    } catch (error) {
      console.error("[StockService] Erreur deleteProduct:", error);
      throw error;
    }
  }

  // === GESTION DU STOCK ===
  async addStock(productId: number, quantity: number, commentaire?: string, userId?: number): Promise<boolean> {
    try {
      const db = await this.getDB();
      const product = await this.getProductById(productId);
      if (!product) throw new Error("Produit non trouvé.");

      const newStock = product.stock_actuel + quantity;
      const now = new Date().toISOString();

      await db.withTransactionAsync(async () => {
        await db.runAsync("UPDATE produits SET stock_actuel = ?, updated_at = ? WHERE id = ?;", [newStock, now, productId]);

        await db.runAsync(
          `INSERT INTO mouvements_stock (
            produit_id, type_mouvement, quantite,
            stock_avant, stock_apres, date_mouvement,
            commentaire, utilisateur_id
          ) VALUES (?, 'APPROVISIONNEMENT', ?, ?, ?, ?, ?, ?);`,
          [productId, quantity, product.stock_actuel, newStock, now, commentaire || "Approvisionnement", userId || null]
        );
      });

      return true;
    } catch (error) {
      console.error("[StockService] Erreur addStock:", error);
      throw error;
    }
  }

  async removeStock(
    productId: number,
    quantity: number,
    type: StockMovement["type_mouvement"] = "VENTE",
    commentaire?: string,
    userId?: number
  ): Promise<boolean> {
    try {
      const db = await this.getDB();
      const product = await this.getProductById(productId);
      if (!product) throw new Error("Produit non trouvé.");

      if (product.stock_actuel < quantity) {
        throw new Error(`Stock insuffisant. Disponible: ${product.stock_actuel}`);
      }

      const newStock = product.stock_actuel - quantity;
      const now = new Date().toISOString();

      await db.withTransactionAsync(async () => {
        await db.runAsync("UPDATE produits SET stock_actuel = ?, updated_at = ? WHERE id = ?;", [newStock, now, productId]);

        await db.runAsync(
          `INSERT INTO mouvements_stock (
            produit_id, type_mouvement, quantite,
            stock_avant, stock_apres, date_mouvement,
            commentaire, utilisateur_id
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?);`,
          [productId, type, -quantity, product.stock_actuel, newStock, now, commentaire || `${type}`, userId || null]
        );
      });

      return true;
    } catch (error) {
      console.error("[StockService] Erreur removeStock:", error);
      throw error;
    }
  }

  async adjustStock(productId: number, newStock: number, reason: string, userId?: number): Promise<boolean> {
    try {
      const db = await this.getDB();
      const product = await this.getProductById(productId);
      if (!product) throw new Error("Produit non trouvé.");

      if (newStock < 0) {
        throw new Error("Le stock ne peut pas être négatif.");
      }

      const quantityChange = newStock - product.stock_actuel;
      const now = new Date().toISOString();

      await db.withTransactionAsync(async () => {
        await db.runAsync("UPDATE produits SET stock_actuel = ?, updated_at = ? WHERE id = ?;", [newStock, now, productId]);

        await db.runAsync(
          `INSERT INTO mouvements_stock (
            produit_id, type_mouvement, quantite,
            stock_avant, stock_apres, date_mouvement,
            commentaire, utilisateur_id
          ) VALUES (?, 'AJUSTEMENT', ?, ?, ?, ?, ?, ?);`,
          [
            productId,
            quantityChange,
            product.stock_actuel,
            newStock,
            now,
            `Ajustement: ${reason}`,
            userId || null,
          ]
        );
      });

      return true;
    } catch (error) {
      console.error("[StockService] Erreur adjustStock:", error);
      throw error;
    }
  }

  // === MOUVEMENTS DE STOCK ===
  async getMovements(filter: MovementFilter = {}): Promise<StockMovement[]> {
    try {
      const db = await this.getDB();
      let query = `
        SELECT m.*, u.nom as utilisateur_nom
        FROM mouvements_stock m
        LEFT JOIN utilisateurs u ON m.utilisateur_id = u.id
        WHERE 1=1
      `;
      const params: any[] = [];

      if (filter.productId) {
        query += " AND m.produit_id = ?";
        params.push(filter.productId);
      }

      if (filter.startDate) {
        query += " AND m.date_mouvement >= ?";
        params.push(filter.startDate);
      }

      if (filter.endDate) {
        query += " AND m.date_mouvement <= ?";
        params.push(filter.endDate);
      }

      if (filter.types && filter.types.length > 0) {
        query += ` AND m.type_mouvement IN (${filter.types.map(() => "?").join(", ")})`;
        params.push(...filter.types);
      }

      if (filter.userId) {
        query += " AND m.utilisateur_id = ?";
        params.push(filter.userId);
      }

      query += " ORDER BY m.date_mouvement DESC";

      if (filter.limit !== undefined) {
        query += " LIMIT ?";
        params.push(filter.limit);
        if (filter.offset !== undefined) {
          query += " OFFSET ?";
          params.push(filter.offset);
        }
      }

      return await db.getAllAsync<StockMovement>(query, params);
    } catch (error) {
      console.error("[StockService] Erreur getMovements:", error);
      throw error;
    }
  }

  async getProductMovements(productId: number, limit: number = 20): Promise<StockMovement[]> {
    return this.getMovements({ productId, limit });
  }

  async getStockAlerts(): Promise<StockAlert[]> {
    try {
      const db = await this.getDB();
      return await db.getAllAsync<StockAlert>(
        `SELECT
          id, nom, stock_actuel, stock_minimum, categorie, emplacement,
          CASE
            WHEN stock_actuel <= 0 THEN 'critique'
            WHEN stock_actuel <= stock_minimum THEN 'alerte'
            ELSE 'info'
          END as niveau
        FROM produits
        WHERE actif = 1 AND stock_actuel <= stock_minimum
        ORDER BY (stock_minimum - stock_actuel) DESC;`
      );
    } catch (error) {
      console.error("[StockService] Erreur getStockAlerts:", error);
      return [];
    }
  }

  async getOutOfStockProducts(): Promise<Product[]> {
    try {
      const db = await this.getDB();
      return await db.getAllAsync<Product>(
        "SELECT * FROM produits WHERE actif = 1 AND stock_actuel <= 0 ORDER BY nom ASC;"
      );
    } catch (error) {
      console.error("[StockService] Erreur getOutOfStockProducts:", error);
      return [];
    }
  }

  // === STATISTIQUES ===
  async getStockStats(): Promise<StockStats> {
    try {
      const db = await this.getDB();

      const stats = await db.getFirstAsync<{
        total: number;
        value: number;
        avgPrice: number;
        lowStock: number;
        outOfStock: number;
        totalMovements: number;
        lastMovement: string;
      }>(
        `SELECT
          COUNT(*) as total,
          SUM(stock_actuel * prix_achat) as value,
          AVG(prix_view) as avgPrice,
          SUM(CASE WHEN stock_actuel <= stock_minimum AND stock_actuel > 0 THEN 1 ELSE 0 END) as lowStock,
          SUM(CASE WHEN stock_actuel <= 0 THEN 1 ELSE 0 END) as outOfStock,
          (SELECT COUNT(*) FROM mouvements_stock) as totalMovements,
          (SELECT MAX(date_mouvement) FROM mouvements_stock) as lastMovement
        FROM produits
        WHERE actif = 1;`
      );

      const categories = await db.getAllAsync<{ name: string; count: number; value: number }>(
        `SELECT
          categorie as name,
          COUNT(*) as count,
          SUM(stock_actuel * prix_achat) as value
        FROM produits
        WHERE actif = 1
        GROUP BY categorie
        ORDER BY value DESC;`
      );

      return {
        totalProducts: stats?.total || 0,
        totalValue: stats?.value || 0,
        averagePrice: stats?.avgPrice || 0,
        lowStock: stats?.lowStock || 0,
        outOfStock: stats?.outOfStock || 0,
        totalMovements: stats?.totalMovements || 0,
        lastMovementDate: stats?.lastMovement || null,
        categories,
      };
    } catch (error) {
      console.error("[StockService] Erreur getStockStats:", error);
      throw error;
    }
  }

  async getTopProducts(limit: number = 10): Promise<ProductWithStats[]> {
    try {
      const db = await this.getDB();
      return await db.getAllAsync<ProductWithStats>(
        `SELECT
          p.*,
          COALESCE(SUM(dv.quantite), 0) as total_quantite,
          COALESCE(SUM(dv.sous_total), 0) as total_ventes,
          MAX(v.date_vente) as dernier_mouvement,
          (p.prix_view - p.prix_achat) / NULLIF(p.prix_achat, 0) * 100 as marge,
          COALESCE(SUM(dv.quantite) / NULLIF(p.stock_actuel + SUM(dv.quantite), 0), 0) as rotation,
          p.stock_actuel * p.prix_achat as valeur_stock
        FROM produits p
        LEFT JOIN details_ventes dv ON p.id = dv.produit_id
        LEFT JOIN ventes v ON dv.vente_id = v.id AND v.statut = 'COMPLETEE'
        WHERE p.actif = 1
        GROUP BY p.id
        ORDER BY total_ventes DESC
        LIMIT ?;`,
        [limit]
      );
    } catch (error) {
      console.error("[StockService] Erreur getTopProducts:", error);
      return [];
    }
  }

  // === EXPORT ===
  async exportProductsToCSV(): Promise<string> {
    try {
      const products = await this.getProducts({ activeOnly: true });

      const headers = [
        "ID",
        "Nom",
        "Catégorie",
        "Code-barres",
        "Prix Achat",
        "Prix Vente",
        "Stock",
        "Stock Minimum",
        "Unité",
        "Emplacement",
        "Créé le",
      ];

      const rows = products.map((p) => [
        p.id,
        p.nom,
        p.categorie,
        p.code_barre || "",
        p.prix_achat.toFixed(2),
        p.prix_view.toFixed(2),
        p.stock_actuel,
        p.stock_minimum,
        p.unite_mesure || "",
        p.emplacement || "",
        formatDate(p.created_at),
      ]);

      const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
      return csv;
    } catch (error) {
      console.error("[StockService] Erreur exportProductsToCSV:", error);
      throw error;
    }
  }

  async importProductsFromCSV(csv: string): Promise<{ success: number; failed: number; errors: string[] }> {
    try {
      const lines = csv.split("\n").filter((line) => line.trim());
      if (lines.length < 2) {
        throw new Error("CSV vide ou invalide.");
      }

      const dataLines = lines.slice(1);
      let success = 0;
      let failed = 0;
      const errors: string[] = [];

      for (let i = 0; i < dataLines.length; i++) {
        try {
          const cols = dataLines[i].split(",");
          if (cols.length < 4) {
            errors.push(`Ligne ${i + 2}: Format invalide`);
            failed++;
            continue;
          }

          await this.createProduct({
            nom: cols[1] || `Produit ${i + 1}`,
            categorie: cols[2] || "Non classé",
            code_barre: cols[3] || undefined,
            prix_achat: parseFloat(cols[4]) || 0,
            prix_view: parseFloat(cols[5]) || 0,
            stock_actuel: parseInt(cols[6]) || 0,
            stock_minimum: parseInt(cols[7]) || 5,
            unite_mesure: cols[8] || "unité",
            emplacement: cols[9] || undefined,
            actif: 1,
          });
          success++;
        } catch (error) {
          errors.push(`Ligne ${i + 2}: ${(error as Error).message}`);
          failed++;
        }
      }

      return { success, failed, errors };
    } catch (error) {
      console.error("[StockService] Erreur importProductsFromCSV:", error);
      throw error;
    }
  }
}

// === EXPORT ===
export const stockService = StockService.getInstance();

export default StockService; 