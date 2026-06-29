import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  RefreshControl,
  ActivityIndicator,
  Dimensions,
  Alert,
} from "react-native";
import * as SQLite from "expo-sqlite";
import { Ionicons } from "@expo/vector-icons";
import { useUser } from "../context/UserContext";
import { LineChart, PieChart } from "react-native-chart-kit";

const DATABASE_NAME = "stockia_secure.db";
const { width } = Dimensions.get("window");

// === INTERFACES ===
interface DashboardData {
  caJour: number;
  caMois: number;
  beneficesJour: number;
  beneficesMois: number;
  dettesEnCours: number;
  produitsAlerte: number;
  ventesJour: number;
  clientsJour: number;
  panierMoyen: number;
  progressionObjectif: number;
}

interface ProduitAlerte {
  id: number;
  nom: string;
  stock_actuel: number;
  stock_minimum: number;
  categorie: string;
}

interface VenteJournaliere {
  date: string;
  total: number;
}

// ============================================
// 📁 COMPOSANT PRINCIPAL
// ============================================

const DashboardScreen: React.FC = () => {
  const { user } = useUser();
  const isAdminOuGerant = user?.role === "ADMIN" || user?.role === "GERANT";

  // === ÉTATS ===
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [devise, setDevise] = useState("USD");
  const [nomBoutique, setNomBoutique] = useState("Ma Boutique");
  const [data, setData] = useState<DashboardData>({
    caJour: 0,
    caMois: 0,
    beneficesJour: 0,
    beneficesMois: 0,
    dettesEnCours: 0,
    produitsAlerte: 0,
    ventesJour: 0,
    clientsJour: 0,
    panierMoyen: 0,
    progressionObjectif: 0,
  });
  const [produitsAlerte, setProduitsAlerte] = useState<ProduitAlerte[]>([]);
  const [statistiquesHebdo, setStatistiquesHebdo] = useState<VenteJournaliere[]>([]);
  const [objectifJour, setObjectifJour] = useState(500);

  // ============================================
  // 📁 CHARGEMENT DES DONNÉES
  // ============================================

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      const db = await SQLite.openDatabaseAsync(DATABASE_NAME);

      await loadSettings(db);
      await loadIndicators(db);
      await loadStockAlerts(db);
      await loadWeeklyStats(db);
    } catch (error) {
      console.error("[Dashboard] Erreur chargement:", error);
      Alert.alert("Erreur", "Impossible de charger les données.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const loadSettings = async (db: SQLite.SQLiteDatabase) => {
    try {
      const paramBoutique = await db.getFirstAsync<{ valeur: string }>(
        "SELECT valeur FROM parametres_systeme WHERE cle = 'nom_boutique';"
      );
      if (paramBoutique) setNomBoutique(paramBoutique.valeur);

      const paramDevise = await db.getFirstAsync<{ valeur: string }>(
        "SELECT valeur FROM parametres_systeme WHERE cle = 'devise_symbole';"
      );
      if (paramDevise) setDevise(paramDevise.valeur);

      const paramObjectif = await db.getFirstAsync<{ valeur: string }>(
        "SELECT valeur FROM parametres_systeme WHERE cle = 'objectif_journalier';"
      );
      setObjectifJour(parseFloat(paramObjectif?.valeur || "500"));
    } catch (error) {
      console.error("[Dashboard] Erreur paramètres:", error);
    }
  };

  const loadIndicators = async (db: SQLite.SQLiteDatabase) => {
    try {
      const aujourdHui = new Date().toISOString().split("T")[0];
      const debutMois = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
        .toISOString()
        .split("T")[0];

      // CA Jour
      const caJourResult = await db.getFirstAsync<{ total: number }>(
        "SELECT SUM(montant_net) as total FROM ventes WHERE date_vente LIKE ?;",
        [`${aujourdHui}%`]
      );
      const caJour = caJourResult?.total || 0;

      // CA Mois
      const caMoisResult = await db.getFirstAsync<{ total: number }>(
        "SELECT SUM(montant_net) as total FROM ventes WHERE date_vente >= ?;",
        [debutMois]
      );
      const caMois = caMoisResult?.total || 0;

      // Ventes du jour
      const ventesResult = await db.getFirstAsync<{ count: number }>(
        "SELECT COUNT(*) as count FROM ventes WHERE date_vente LIKE ?;",
        [`${aujourdHui}%`]
      );
      const ventesJour = ventesResult?.count || 0;

      // Clients uniques
      const clientsResult = await db.getFirstAsync<{ count: number }>(
        "SELECT COUNT(DISTINCT client_id) as count FROM ventes WHERE date_vente LIKE ? AND client_id IS NOT NULL;",
        [`${aujourdHui}%`]
      );
      const clientsJour = clientsResult?.count || 0;

      // Dettes
      const dettesResult = await db.getFirstAsync<{ total: number }>(
        "SELECT SUM(montant_restant) as total FROM dettes WHERE statut = 'EN_COURS';"
      );
      const dettes = dettesResult?.total || 0;

      // Produits en alerte
      const alerteResult = await db.getFirstAsync<{ count: number }>(
        "SELECT COUNT(*) as count FROM produits WHERE stock_actuel <= stock_minimum;"
      );
      const produitsAlerte = alerteResult?.count || 0;

      // Bénéfices (Admin/Gérant uniquement)
      let beneficesJour = 0;
      let beneficesMois = 0;

      if (isAdminOuGerant) {
        const benefJourResult = await db.getFirstAsync<{ profit: number }>(
          `SELECT SUM((dv.prix_unitaire - p.prix_achat) * dv.quantite) as profit
           FROM details_ventes dv
           JOIN produits p ON dv.produit_id = p.id
           JOIN ventes v ON dv.vente_id = v.id
           WHERE v.date_vente LIKE ?;`,
          [`${aujourdHui}%`]
        );
        beneficesJour = benefJourResult?.profit || 0;

        const benefMoisResult = await db.getFirstAsync<{ profit: number }>(
          `SELECT SUM((dv.prix_unitaire - p.prix_achat) * dv.quantite) as profit
           FROM details_ventes dv
           JOIN produits p ON dv.produit_id = p.id
           JOIN ventes v ON dv.vente_id = v.id
           WHERE v.date_vente >= ?;`,
          [debutMois]
        );
        beneficesMois = benefMoisResult?.profit || 0;
      }

      // Panier moyen
      const panierResult = await db.getFirstAsync<{ avg: number }>(
        "SELECT AVG(montant_net) as avg FROM ventes WHERE date_vente LIKE ?;",
        [`${aujourdHui}%`]
      );
      const panierMoyen = panierResult?.avg || 0;

      // Progression objectif
      const progression = objectifJour > 0 ? (caJour / objectifJour) * 100 : 0;

      setData({
        caJour,
        caMois,
        beneficesJour,
        beneficesMois,
        dettesEnCours: dettes,
        produitsAlerte,
        ventesJour,
        clientsJour,
        panierMoyen,
        progressionObjectif: Math.min(progression, 100),
      });
    } catch (error) {
      console.error("[Dashboard] Erreur indicateurs:", error);
    }
  };

  const loadStockAlerts = async (db: SQLite.SQLiteDatabase) => {
    try {
      const results = await db.getAllAsync<ProduitAlerte>(
        `SELECT id, nom, stock_actuel, stock_minimum, categorie
         FROM produits
         WHERE stock_actuel <= stock_minimum
         ORDER BY (stock_minimum - stock_actuel) DESC
         LIMIT 5;`
      );
      setProduitsAlerte(results || []);
    } catch (error) {
      console.error("[Dashboard] Erreur alertes:", error);
    }
  };

  const loadWeeklyStats = async (db: SQLite.SQLiteDatabase) => {
    try {
      const dateDebutSemaine = new Date();
      dateDebutSemaine.setDate(dateDebutSemaine.getDate() - 7);

      const results = await db.getAllAsync<VenteJournaliere>(
        `SELECT DATE(date_vente) as date, SUM(montant_net) as total
         FROM ventes
         WHERE date_vente >= ?
         GROUP BY DATE(date_vente)
         ORDER BY jour ASC;`,
        [dateDebutSemaine.toISOString().split("T")[0]]
      );
      setStatistiquesHebdo(results || []);
    } catch (error) {
      console.error("[Dashboard] Erreur stats hebdo:", error);
    }
  };

  // ============================================
  // 📁 RAFRAÎCHISSEMENT
  // ============================================

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadDashboardData();
  }, []);

  // ============================================
  // 📁 GESTION DES ALERTES
  // ============================================

  const handleStockAlert = () => {
    if (produitsAlerte.length === 0) {
      Alert.alert("✅ Stock OK", "Tous les produits sont bien approvisionnés.");
      return;
    }

    const message = produitsAlerte
      .map((p) => `• ${p.nom}: ${p.stock_actuel}/${p.stock_minimum} unités`)
      .join("\n");

    Alert.alert(
      `⚠️ Alertes Stock (${produitsAlerte.length})`,
      `${message}\n\nVeuillez réapprovisionner ces produits.`,
      [{ text: "OK" }]
    );
  };

  // ============================================
  // 📁 RENDU
  // ============================================

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#1565C0" />
        <Text style={styles.loadingText}>Chargement du tableau de bord...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContainer}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
      >
        {/* === EN-TÊTE === */}
        <View style={styles.header}>
          <View>
            <Text style={styles.shopName}>{nomBoutique}</Text>
            <Text style={styles.userBadge}>
              <Ionicons name="person-circle" size={16} color="#FFFFFF" />
              {user?.nom} ({user?.role})
            </Text>
          </View>
          <TouchableOpacity style={styles.notificationButton} onPress={handleStockAlert}>
            <Ionicons name="notifications-outline" size={24} color="#FFFFFF" />
            {data.produitsAlerte > 0 && (
              <View style={styles.notificationBadge}>
                <Text style={styles.notificationBadgeText}>{data.produitsAlerte}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        {/* === OBJECTIF === */}
        <View style={styles.objectifContainer}>
          <View style={styles.objectifHeader}>
            <Text style={styles.objectifLabel}>🎯 Objectif du jour</Text>
            <Text style={styles.objectifValue}>
              {data.caJour.toFixed(2)} / {objectifJour.toFixed(2)} {devise}
            </Text>
          </View>
          <View style={styles.progressBarContainer}>
            <View
              style={[
                styles.progressBar,
                { width: `${data.progressionObjectif}%` },
                data.progressionObjectif >= 100 && styles.progressBarComplete,
              ]}
            />
          </View>
          <Text style={styles.progressText}>{data.progressionObjectif.toFixed(0)}% atteint</Text>
        </View>

        {/* === KPI === */}
        <View style={styles.kpiGrid}>
          {/* CA Jour */}
          <View style={styles.kpiCard}>
            <Ionicons name="cash" size={20} color="#1565C0" />
            <Text style={styles.kpiLabel}>CA du jour</Text>
            <Text style={[styles.kpiValue, styles.blueText]}>
              {data.caJour.toFixed(2)} {devise}
            </Text>
            <Text style={styles.kpiSub}>Mois: {data.caMois.toFixed(2)} {devise}</Text>
          </View>

          {/* Ventes */}
          <View style={styles.kpiCard}>
            <Ionicons name="receipt" size={20} color="#2E7D32" />
            <Text style={styles.kpiLabel}>Ventes</Text>
            <Text style={[styles.kpiValue, styles.greenText]}>{data.ventesJour}</Text>
            <Text style={styles.kpiSub}>{data.clientsJour} clients</Text>
          </View>

          {/* Bénéfices (Admin/Gérant uniquement) */}
          {isAdminOuGerant && (
            <View style={styles.kpiCard}>
              <Ionicons name="trending-up" size={20} color="#EF6C00" />
              <Text style={styles.kpiLabel}>Bénéfice (Jour)</Text>
              <Text style={[styles.kpiValue, styles.orangeText]}>
                +{data.beneficesJour.toFixed(2)} {devise}
              </Text>
              <Text style={styles.kpiSub}>Mois: +{data.beneficesMois.toFixed(2)}</Text>
            </View>
          )}

          {/* Panier moyen */}
          <View style={styles.kpiCard}>
            <Ionicons name="cart" size={20} color="#6A1B9A" />
            <Text style={styles.kpiLabel}>Panier moyen</Text>
            <Text style={[styles.kpiValue, styles.purpleText]}>
              {data.panierMoyen.toFixed(2)} {devise}
            </Text>
          </View>

          {/* Dettes */}
          <View style={styles.kpiCard}>
            <Ionicons name="card" size={20} color="#C62828" />
            <Text style={styles.kpiLabel}>Crédits clients</Text>
            <Text style={[styles.kpiValue, styles.redText]}>
              {data.dettesEnCours.toFixed(2)} {devise}
            </Text>
          </View>

          {/* Alertes Stock */}
          <TouchableOpacity style={[styles.kpiCard, styles.stockCard]} onPress={handleStockAlert}>
            <Ionicons
              name={data.produitsAlerte > 0 ? "alert" : "checkmark"}
              size={20}
              color={data.produitsAlerte > 0 ? "#C62828" : "#2E7D32"}
            />
            <Text style={styles.kpiLabel}>Alertes Stock</Text>
            <Text style={[styles.kpiValue, data.produitsAlerte > 0 ? styles.redText : styles.greenText]}>
              {data.produitsAlerte}
            </Text>
            <Text style={styles.kpiSub}>
              {data.produitsAlerte > 0 ? `⚠️ ${data.produitsAlerte} produit(s)` : "✅ Stock OK"}
            </Text>
          </TouchableOpacity>
        </View>

        {/* === GRAPHIQUE === */}
        {statistiquesHebdo.length > 1 && (
          <View style={styles.chartContainer}>
            <Text style={styles.chartTitle}>📈 Évolution des ventes (7 jours)</Text>
            <LineChart
              data={{
                labels: statistiquesHebdo.map((_, i) =>
                  i % 2 === 0 ? new Date(statistiquesHebdo[i].date).getDate().toString() : ""
                ),
                datasets: [{ data: statistiquesHebdo.map((s) => s.total) }],
              }}
              width={width - 32}
              height={180}
              chartConfig={{
                backgroundColor: "#FFFFFF",
                backgroundGradientFrom: "#FFFFFF",
                backgroundGradientTo: "#FFFFFF",
                decimalPlaces: 0,
                color: (opacity = 1) => `rgba(21, 101, 192, ${opacity})`,
                labelColor: (opacity = 1) => `rgba(0, 0, 0, ${opacity})`,
                style: { borderRadius: 8 },
              }}
              bezier
              style={styles.chart}
            />
          </View>
        )}

        {/* === ALERTES STOCK === */}
        {produitsAlerte.length > 0 && (
          <View style={styles.alertSection}>
            <Text style={styles.alertTitle}>⚠️ Produits à réapprovisionner</Text>
            {produitsAlerte.map((produit) => (
              <View key={produit.id} style={styles.alertItem}>
                <View>
                  <Text style={styles.alertItemName}>{produit.nom}</Text>
                  <Text style={styles.alertItemCategory}>{produit.categorie}</Text>
                </View>
                <View style={styles.alertItemRight}>
                  <Text
                    style={[
                      styles.alertItemStock,
                      produit.stock_actuel === 0 && styles.alertItemStockUrgent,
                    ]}
                  >
                    {produit.stock_actuel} / {produit.stock_minimum}
                  </Text>
                  {produit.stock_actuel === 0 && (
                    <View style={styles.urgentBadge}>
                      <Text style={styles.urgentText}>URGENT</Text>
                    </View>
                  )}
                </View>
              </View>
            ))}
          </View>
        )}

        {/* === FOOTER === */}
        <Text style={styles.footer}>Dernière mise à jour: {new Date().toLocaleString()}</Text>
      </ScrollView>
    </SafeAreaView>
  );
};

// ============================================
// 📁 STYLES
// ============================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F8F9FA",
  },
  scrollContainer: {
    padding: 16,
    paddingBottom: 40,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    marginTop: 12,
    color: "#666",
    fontSize: 14,
  },

  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#1565C0",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  shopName: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#FFFFFF",
  },
  userBadge: {
    fontSize: 13,
    color: "#E3F2FD",
    marginTop: 2,
  },
  notificationButton: {
    position: "relative",
    padding: 4,
  },
  notificationBadge: {
    position: "absolute",
    top: -2,
    right: -2,
    backgroundColor: "#C62828",
    borderRadius: 10,
    width: 18,
    height: 18,
    justifyContent: "center",
    alignItems: "center",
  },
  notificationBadgeText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "bold",
  },

  objectifContainer: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#EAEAEA",
  },
  objectifHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  objectifLabel: {
    fontSize: 14,
    color: "#666",
    fontWeight: "500",
  },
  objectifValue: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#1565C0",
  },
  progressBarContainer: {
    height: 8,
    backgroundColor: "#E0E0E0",
    borderRadius: 4,
    overflow: "hidden",
  },
  progressBar: {
    height: "100%",
    backgroundColor: "#1565C0",
    borderRadius: 4,
  },
  progressBarComplete: {
    backgroundColor: "#2E7D32",
  },
  progressText: {
    fontSize: 12,
    color: "#666",
    marginTop: 4,
    textAlign: "right",
  },

  kpiGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 16,
  },
  kpiCard: {
    flex: 1,
    minWidth: "30%",
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: "#EAEAEA",
    elevation: 1,
  },
  kpiLabel: {
    fontSize: 11,
    color: "#777",
    fontWeight: "500",
  },
  kpiValue: {
    fontSize: 16,
    fontWeight: "bold",
    marginTop: 2,
  },
  kpiSub: {
    fontSize: 10,
    color: "#999",
    marginTop: 2,
  },
  stockCard: {
    backgroundColor: "#FFF5F5",
    borderColor: "#FFCDD2",
  },
  blueText: { color: "#1565C0" },
  greenText: { color: "#2E7D32" },
  orangeText: { color: "#EF6C00" },
  redText: { color: "#C62828" },
  purpleText: { color: "#6A1B9A" },

  chartContainer: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#EAEAEA",
  },
  chartTitle: {
    fontSize: 15,
    fontWeight: "bold",
    color: "#333",
    marginBottom: 12,
  },
  chart: {
    borderRadius: 8,
  },

  alertSection: {
    backgroundColor: "#FFF5F5",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#FFCDD2",
  },
  alertTitle: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#C62828",
    marginBottom: 12,
  },
  alertItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#FFCDD2",
  },
  alertItemName: {
    fontSize: 14,
    fontWeight: "500",
    color: "#333",
  },
  alertItemCategory: {
    fontSize: 11,
    color: "#666",
  },
  alertItemRight: {
    alignItems: "flex-end",
  },
  alertItemStock: {
    fontSize: 12,
    color: "#666",
  },
  alertItemStockUrgent: {
    color: "#C62828",
    fontWeight: "bold",
  },
  urgentBadge: {
    backgroundColor: "#C62828",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    marginTop: 2,
  },
  urgentText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "bold",
  },

  footer: {
    textAlign: "center",
    fontSize: 11,
    color: "#999",
    marginTop: 8,
  },
});

export default DashboardScreen; 