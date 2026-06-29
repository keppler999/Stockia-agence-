import React, { useState, useEffect } from "react";
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
  Share,
} from "react-native";
import * as SQLite from "expo-sqlite";
import { Ionicons } from "@expo/vector-icons";
import { useUser } from "../context/UserContext";
import { LineChart, PieChart, BarChart } from "react-native-chart-kit";

const DATABASE_NAME = "stockia_secure.db";
const { width } = Dimensions.get("window");

// === INTERFACES ===
interface TopProduct {
  id: number;
  nom: string;
  quantite: number;
  total: number;
  categorie: string;
}

interface VenteJournaliere {
  date: string;
  total: number;
  nombre: number;
}

interface VenteParCategorie {
  nom: string;
  total: number;
  couleur: string;
}

// ============================================
// 📁 COMPOSANT PRINCIPAL
// ============================================

const AnalyticsScreen: React.FC = () => {
  const { user } = useUser();
  const isAdminOuGerant = user?.role === "ADMIN" || user?.role === "GERANT";

  // === SÉCURITÉ ===
  if (!isAdminOuGerant) {
    return (
      <View style={styles.unauthorizedContainer}>
        <Ionicons name="lock-closed" size={64} color="#C62828" />
        <Text style={styles.unauthorizedTitle}>Accès Refusé</Text>
        <Text style={styles.unauthorizedText}>
          Cette section est réservée à la direction.
        </Text>
      </View>
    );
  }

  // === ÉTATS ===
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [devise, setDevise] = useState("USD");
  const [periode, setPeriode] = useState<"jour" | "mois" | "annee">("mois");
  const [caTotal, setCaTotal] = useState(0);
  const [beneficesTotal, setBeneficesTotal] = useState(0);
  const [nombreVentes, setNombreVentes] = useState(0);
  const [panierMoyen, setPanierMoyen] = useState(0);
  const [margeMoyenne, setMargeMoyenne] = useState(0);
  const [topProduits, setTopProduits] = useState<TopProduct[]>([]);
  const [ventesJournalieres, setVentesJournalieres] = useState<VenteJournaliere[]>([]);
  const [ventesParCategorie, setVentesParCategorie] = useState<VenteParCategorie[]>([]);

  const colors = [
    "#1565C0", "#2E7D32", "#F57C00", "#C62828",
    "#6A1B9A", "#00838F", "#E65100", "#1A237E",
  ];

  // ============================================
  // 📁 CHARGEMENT
  // ============================================

  useEffect(() => {
    loadAnalyticsData();
  }, [periode]);

  const loadAnalyticsData = async () => {
    try {
      setLoading(true);
      const db = await SQLite.openDatabaseAsync(DATABASE_NAME);

      // Devise
      const paramDevise = await db.getFirstAsync<{ valeur: string }>(
        "SELECT valeur FROM parametres_systeme WHERE cle = 'devise_symbole';"
      );
      if (paramDevise) setDevise(paramDevise.valeur);

      // Période
      const { debut, fin } = getPeriodeDates();

      // CA
      const caResult = await db.getFirstAsync<{ total: number }>(
        "SELECT SUM(montant_net) as total FROM ventes WHERE date_vente BETWEEN ? AND ? AND statut = 'COMPLETEE';",
        [debut, fin]
      );
      setCaTotal(caResult?.total || 0);

      // Bénéfices
      const benefResult = await db.getFirstAsync<{ profit: number }>(
        `SELECT SUM((dv.prix_unitaire - p.prix_achat) * dv.quantite) as profit
         FROM details_ventes dv
         JOIN produits p ON dv.produit_id = p.id
         JOIN ventes v ON dv.vente_id = v.id
         WHERE v.date_vente BETWEEN ? AND ?
         AND v.statut = 'COMPLETEE';`,
        [debut, fin]
      );
      setBeneficesTotal(benefResult?.profit || 0);

      // Nombre de ventes
      const countResult = await db.getFirstAsync<{ count: number }>(
        "SELECT COUNT(*) as count FROM ventes WHERE date_vente BETWEEN ? AND ? AND statut = 'COMPLETEE';",
        [debut, fin]
      );
      setNombreVentes(countResult?.count || 0);

      // Panier moyen
      const panierResult = await db.getFirstAsync<{ avg: number }>(
        "SELECT AVG(montant_net) as avg FROM ventes WHERE date_vente BETWEEN ? AND ? AND statut = 'COMPLETEE';",
        [debut, fin]
      );
      setPanierMoyen(panierResult?.avg || 0);

      // Marge moyenne
      const margeResult = await db.getFirstAsync<{ marge: number }>(
        `SELECT AVG((dv.prix_unitaire - p.prix_achat) / dv.prix_unitaire * 100) as marge
         FROM details_ventes dv
         JOIN produits p ON dv.produit_id = p.id
         JOIN ventes v ON dv.vente_id = v.id
         WHERE v.date_vente BETWEEN ? AND ?
         AND v.statut = 'COMPLETEE';`,
        [debut, fin]
      );
      setMargeMoyenne(margeResult?.marge || 0);

      // Top produits
      const topResults = await db.getAllAsync<TopProduct>(
        `SELECT p.id, p.nom, SUM(dv.quantite) as quantite,
                SUM(dv.sous_total) as total, p.categorie
         FROM details_ventes dv
         JOIN produits p ON dv.produit_id = p.id
         JOIN ventes v ON dv.vente_id = v.id
         WHERE v.date_vente BETWEEN ? AND ?
         AND v.statut = 'COMPLETEE'
         GROUP BY dv.produit_id
         ORDER BY total DESC
         LIMIT 10;`,
        [debut, fin]
      );
      setTopProduits(topResults || []);

      // Ventes journalières
      const dailyResults = await db.getAllAsync<VenteJournaliere>(
        `SELECT DATE(date_vente) as date,
                SUM(montant_net) as total,
                COUNT(*) as nombre
         FROM ventes
         WHERE date_vente BETWEEN ? AND ?
         AND statut = 'COMPLETEE'
         GROUP BY DATE(date_vente)
         ORDER BY date ASC;`,
        [debut, fin]
      );
      setVentesJournalieres(dailyResults || []);

      // Ventes par catégorie
      const categoryResults = await db.getAllAsync<{ nom: string; total: number }>(
        `SELECT p.categorie as nom, SUM(dv.sous_total) as total
         FROM details_ventes dv
         JOIN produits p ON dv.produit_id = p.id
         JOIN ventes v ON dv.vente_id = v.id
         WHERE v.date_vente BETWEEN ? AND ?
         AND v.statut = 'COMPLETEE'
         GROUP BY p.categorie
         ORDER BY total DESC
         LIMIT 6;`,
        [debut, fin]
      );

      const categoryData = categoryResults.map((item, index) => ({
        ...item,
        couleur: colors[index % colors.length],
      }));
      setVentesParCategorie(categoryData);
    } catch (error) {
      console.error("[Analytics] Erreur chargement:", error);
      Alert.alert("Erreur", "Impossible de charger les données.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const getPeriodeDates = () => {
    const now = new Date();
    let debut = new Date();
    let fin = new Date();

    switch (periode) {
      case "jour":
        debut = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        fin = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        break;
      case "mois":
        debut = new Date(now.getFullYear(), now.getMonth(), 1);
        fin = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        break;
      case "annee":
        debut = new Date(now.getFullYear(), 0, 1);
        fin = new Date(now.getFullYear(), 11, 31);
        break;
    }

    return {
      debut: debut.toISOString().split("T")[0],
      fin: fin.toISOString().split("T")[0],
    };
  };

  // ============================================
  // 📁 EXPORT
  // ============================================

  const handleExport = async () => {
    try {
      const message = `
📊 RAPPORT ANALYTIQUE STOCKIA
${new Date().toLocaleString()}
${"=".repeat(40)}

📈 CHIFFRE D'AFFAIRES
• Total: ${caTotal.toFixed(2)} ${devise}

💰 BÉNÉFICES
• Total: ${beneficesTotal.toFixed(2)} ${devise}
• Marge: ${margeMoyenne.toFixed(1)}%

🛒 VENTES
• Nombre: ${nombreVentes}
• Panier moyen: ${panierMoyen.toFixed(2)} ${devise}

🏆 TOP PRODUITS
${topProduits.slice(0, 5).map((p, i) =>
  `${i+1}. ${p.nom} - ${p.quantite} unités (${p.total.toFixed(2)} ${devise})`
).join("\n")}

${"=".repeat(40)}
Généré par Stockia Analytics
      `;

      await Share.share({
        message: message,
        title: "Rapport Analytique Stockia",
      });
    } catch (error) {
      console.error("[Analytics] Erreur export:", error);
    }
  };

  // ============================================
  // 📁 RENDU
  // ============================================

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#1565C0" />
        <Text style={styles.loadingText}>Chargement des analyses...</Text>
      </View>
    );
  }

  const chartData = ventesJournalieres.map((d) => d.total);
  const chartLabels = ventesJournalieres.map((d) => {
    const date = new Date(d.date);
    return `${date.getDate()}/${date.getMonth() + 1}`;
  });

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContainer}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={loadAnalyticsData} />}
        showsVerticalScrollIndicator={false}
      >
        {/* === EN-TÊTE === */}
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>📊 Analyses</Text>
            <Text style={styles.subtitle}>
              {periode === "jour" ? "Aujourd'hui" :
               periode === "mois" ? "Ce mois-ci" :
               "Cette année"}
            </Text>
          </View>
          <TouchableOpacity style={styles.exportButton} onPress={handleExport}>
            <Ionicons name="share-outline" size={20} color="#1565C0" />
            <Text style={styles.exportButtonText}>Exporter</Text>
          </TouchableOpacity>
        </View>

        {/* === SÉLECTEUR PÉRIODE === */}
        <View style={styles.periodSelector}>
          {(["jour", "mois", "annee"] as const).map((p) => (
            <TouchableOpacity
              key={p}
              style={[styles.periodButton, periode === p && styles.periodButtonActive]}
              onPress={() => setPeriode(p)}
            >
              <Text style={[styles.periodButtonText, periode === p && styles.periodButtonTextActive]}>
                {p === "jour" ? "Jour" :
                 p === "mois" ? "Mois" :
                 "Année"}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* === KPI === */}
        <View style={styles.kpiGrid}>
          <View style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>Chiffre d'affaires</Text>
            <Text style={[styles.kpiValue, styles.blueText]}>
              {caTotal.toFixed(2)} {devise}
            </Text>
          </View>
          <View style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>Bénéfices</Text>
            <Text style={[styles.kpiValue, styles.greenText]}>
              +{beneficesTotal.toFixed(2)} {devise}
            </Text>
          </View>
          <View style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>Ventes</Text>
            <Text style={[styles.kpiValue, styles.orangeText]}>
              {nombreVentes}
            </Text>
          </View>
          <View style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>Panier moyen</Text>
            <Text style={[styles.kpiValue, styles.purpleText]}>
              {panierMoyen.toFixed(2)} {devise}
            </Text>
          </View>
          <View style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>Marge</Text>
            <Text style={[styles.kpiValue, styles.cyanText]}>
              {margeMoyenne.toFixed(1)}%
            </Text>
          </View>
        </View>

        {/* === GRAPHIQUE === */}
        {ventesJournalieres.length > 1 && (
          <View style={styles.chartContainer}>
            <Text style={styles.chartTitle}>📈 Évolution des ventes</Text>
            <LineChart
              data={{
                labels: chartLabels.map((_, i) =>
                  i % Math.ceil(chartLabels.length / 7) === 0 ? chartLabels[i] : ""
                ),
                datasets: [{ data: chartData }],
              }}
              width={width - 40}
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

        {/* === CATÉGORIES === */}
        {ventesParCategorie.length > 0 && (
          <View style={styles.chartContainer}>
            <Text style={styles.chartTitle}>📊 Ventes par catégorie</Text>
            <PieChart
              data={ventesParCategorie.map((c) => ({
                name: c.nom,
                population: c.total,
                color: c.couleur,
                legendFontColor: "#333",
                legendFontSize: 12,
              }))}
              width={width - 40}
              height={180}
              chartConfig={{
                color: (opacity = 1) => `rgba(0, 0, 0, ${opacity})`,
              }}
              accessor="population"
              backgroundColor="transparent"
              paddingLeft="15"
              absolute
            />
          </View>
        )}

        {/* === TOP PRODUITS === */}
        {topProduits.length > 0 && (
          <View style={styles.rankingContainer}>
            <Text style={styles.rankingTitle}>🏆 Top Produits</Text>
            {topProduits.slice(0, 5).map((item, index) => (
              <View key={item.id} style={styles.rankingItem}>
                <View style={styles.rankingLeft}>
                  <View style={[styles.rankingNumber, index < 3 && styles.rankingNumberTop]}>
                    <Text style={[styles.rankingNumberText, index < 3 && styles.rankingNumberTopText]}>
                      {index + 1}
                    </Text>
                  </View>
                  <View>
                    <Text style={styles.rankingName}>{item.nom}</Text>
                    <Text style={styles.rankingCategory}>{item.categorie}</Text>
                  </View>
                </View>
                <View style={styles.rankingRight}>
                  <Text style={styles.rankingQuantity}>{item.quantite} u</Text>
                  <Text style={styles.rankingAmount}>{item.total.toFixed(2)} {devise}</Text>
                </View>
              </View>
            ))}
          </View>
        )}

        <Text style={styles.footer}>Généré localement hors-ligne</Text>
      </ScrollView>
    </SafeAreaView>
  );
};

// ============================================
// 📁 STYLES
// ============================================

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F8F9FA" },
  scrollContainer: { padding: 16, paddingBottom: 40 },

  loadingContainer: { flex: 1, justifyContent: "center", alignItems: "center" },
  loadingText: { marginTop: 12, color: "#666", fontSize: 14 },

  unauthorizedContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
    backgroundColor: "#F8F9FA",
  },
  unauthorizedTitle: { fontSize: 22, fontWeight: "bold", color: "#333", marginTop: 16 },
  unauthorizedText: { fontSize: 14, color: "#666", textAlign: "center", marginTop: 8 },

  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  title: { fontSize: 24, fontWeight: "bold", color: "#1565C0" },
  subtitle: { fontSize: 13, color: "#666", marginTop: 2 },

  exportButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#E3F2FD",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 6,
  },
  exportButtonText: { color: "#1565C0", fontSize: 13, fontWeight: "500" },

  periodSelector: {
    flexDirection: "row",
    backgroundColor: "#FFF",
    borderRadius: 10,
    padding: 4,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#EAEAEA",
  },
  periodButton: { flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: "center" },
  periodButtonActive: { backgroundColor: "#1565C0" },
  periodButtonText: { fontSize: 13, color: "#666", fontWeight: "500" },
  periodButtonTextActive: { color: "#FFF" },

  kpiGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 16,
  },
  kpiCard: {
    flex: 1,
    minWidth: "48%",
    backgroundColor: "#FFF",
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: "#EAEAEA",
    elevation: 1,
  },
  kpiLabel: { fontSize: 11, color: "#777", fontWeight: "500" },
  kpiValue: { fontSize: 18, fontWeight: "bold", marginTop: 4 },

  blueText: { color: "#1565C0" },
  greenText: { color: "#2E7D32" },
  orangeText: { color: "#EF6C00" },
  purpleText: { color: "#6A1B9A" },
  cyanText: { color: "#00838F" },

  chartContainer: {
    backgroundColor: "#FFF",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#EAEAEA",
  },
  chartTitle: { fontSize: 15, fontWeight: "bold", color: "#333", marginBottom: 12 },
  chart: { borderRadius: 8 },

  rankingContainer: {
    backgroundColor: "#FFF",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#EAEAEA",
  },
  rankingTitle: { fontSize: 15, fontWeight: "bold", color: "#333", marginBottom: 12 },

  rankingItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#F0F0F0",
  },
  rankingLeft: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1 },
  rankingNumber: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#F5F5F5",
    justifyContent: "center",
    alignItems: "center",
  },
  rankingNumberTop: { backgroundColor: "#1565C0" },
  rankingNumberText: { fontSize: 12, fontWeight: "600", color: "#666" },
  rankingNumberTopText: { color: "#FFF" },
  rankingName: { fontSize: 14, fontWeight: "500", color: "#333" },
  rankingCategory: { fontSize: 11, color: "#999" },
  rankingRight: { alignItems: "flex-end" },
  rankingQuantity: { fontSize: 12, color: "#666" },
  rankingAmount: { fontSize: 14, fontWeight: "bold", color: "#1565C0" },

  footer: { fontSize: 11, color: "#999", textAlign: "center", marginTop: 16 },
});

export default AnalyticsScreen; 