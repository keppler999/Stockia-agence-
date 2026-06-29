import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  Alert,
  Modal,
  SafeAreaView,
  RefreshControl,
  ActivityIndicator,
  ScrollView,
} from "react-native";
import * as SQLite from "expo-sqlite";
import { Ionicons } from "@expo/vector-icons";
import { useUser } from "../context/UserContext";

const DATABASE_NAME = "stockia_secure.db";

// === INTERFACES ===
interface Produit {
  id: number;
  code_barre: string;
  nom: string;
  categorie: string;
  prix_achat: number;
  prix_view: number;
  stock_actuel: number;
  stock_minimum: number;
  unite_mesure: string;
}

interface MouvementStock {
  id: number;
  produit_id: number;
  type_mouvement: string;
  quantite: number;
  stock_avant: number;
  stock_apres: number;
  date_mouvement: string;
  commentaire: string;
}

// ============================================
// 📁 COMPOSANT PRINCIPAL
// ============================================

const StockScreen: React.FC = () => {
  const { user } = useUser();
  const isMagasinier = user?.role === "MAGASINIER";

  // === ÉTATS ===
  const [produits, setProduits] = useState<Produit[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [devise, setDevise] = useState("USD");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [categories, setCategories] = useState<string[]>([]);
  const [selectedCategorie, setSelectedCategorie] = useState<string>("Toutes");

  // === MODAL APPROVISIONNEMENT ===
  const [selectedProduit, setSelectedProduit] = useState<Produit | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [quantiteEntree, setQuantiteEntree] = useState("");
  const [prixAchat, setPrixAchat] = useState("");
  const [commentaire, setCommentaire] = useState("");

  // === MODAL HISTORIQUE ===
  const [showMouvements, setShowMouvements] = useState(false);
  const [mouvements, setMouvements] = useState<MouvementStock[]>([]);
  const [mouvementsLoading, setMouvementsLoading] = useState(false);

  // === STATS ===
  const [totalProduits, setTotalProduits] = useState(0);
  const [totalValeurStock, setTotalValeurStock] = useState(0);
  const [alertesStock, setAlertesStock] = useState(0);

  // ============================================
  // 📁 CHARGEMENT
  // ============================================

  useEffect(() => {
    loadStockData();
  }, []);

  const loadStockData = async () => {
    try {
      setLoading(true);
      const db = await SQLite.openDatabaseAsync(DATABASE_NAME);

      // Devise
      const paramDevise = await db.getFirstAsync<{ valeur: string }>(
        "SELECT valeur FROM parametres_systeme WHERE cle = 'devise_symbole';"
      );
      if (paramDevise) setDevise(paramDevise.valeur);

      // Produits
      const allProducts = await db.getAllAsync<Produit>(
        `SELECT id, code_barre, nom, categorie, prix_achat, prix_view,
                stock_actuel, stock_minimum, unite_mesure
         FROM produits
         ORDER BY nom ASC;`
      );
      setProduits(allProducts || []);
      setTotalProduits(allProducts.length);

      // Catégories
      const uniqueCategories = ["Toutes", ...new Set(allProducts.map((p) => p.categorie))];
      setCategories(uniqueCategories);

      // Alertes
      const alerteResult = await db.getFirstAsync<{ count: number }>(
        "SELECT COUNT(*) as count FROM produits WHERE stock_actuel <= stock_minimum;"
      );
      setAlertesStock(alerteResult?.count || 0);

      // Valeur stock
      const valeurResult = await db.getFirstAsync<{ total: number }>(
        "SELECT SUM(stock_actuel * prix_achat) as total FROM produits;"
      );
      setTotalValeurStock(valeurResult?.total || 0);
    } catch (error) {
      console.error("[StockScreen] Erreur chargement:", error);
      Alert.alert("Erreur", "Impossible de charger les données du stock.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const loadMouvements = async (produitId: number) => {
    try {
      setMouvementsLoading(true);
      const db = await SQLite.openDatabaseAsync(DATABASE_NAME);

      const results = await db.getAllAsync<MouvementStock>(
        `SELECT id, produit_id, type_mouvement, quantite,
                stock_avant, stock_apres, date_mouvement, commentaire
         FROM mouvements_stock
         WHERE produit_id = ?
         ORDER BY date_mouvement DESC
         LIMIT 20;`,
        [produitId]
      );
      setMouvements(results || []);
    } catch (error) {
      console.error("[StockScreen] Erreur chargement mouvements:", error);
      Alert.alert("Erreur", "Impossible de charger l'historique.");
    } finally {
      setMouvementsLoading(false);
    }
  };

  // ============================================
  // 📁 APPROVISIONNEMENT
  // ============================================

  const handleApprovisionner = async () => {
    const qtyToAdd = parseInt(quantiteEntree);
    if (!selectedProduit || isNaN(qtyToAdd) || qtyToAdd <= 0) {
      Alert.alert("Champs invalide", "Veuillez entrer une quantité positive valide.");
      return;
    }

    try {
      const db = await SQLite.openDatabaseAsync(DATABASE_NAME);
      const dateMouvement = new Date().toISOString();

      await db.withTransactionAsync(async () => {
        const nouveauStock = selectedProduit.stock_actuel + qtyToAdd;

        await db.runAsync(
          "UPDATE produits SET stock_actuel = ? WHERE id = ?;",
          [nouveauStock, selectedProduit.id]
        );

        if (prixAchat && parseFloat(prixAchat) !== selectedProduit.prix_achat) {
          await db.runAsync(
            "UPDATE produits SET prix_achat = ? WHERE id = ?;",
            [parseFloat(prixAchat), selectedProduit.id]
          );
        }

        await db.runAsync(
          `INSERT INTO mouvements_stock (
            produit_id, type_mouvement, quantite,
            stock_avant, stock_apres, date_mouvement,
            commentaire, utilisateur_id
          ) VALUES (?, 'APPROVISIONNEMENT', ?, ?, ?, ?, ?, ?);`,
          [
            selectedProduit.id,
            qtyToAdd,
            selectedProduit.stock_actuel,
            nouveauStock,
            dateMouvement,
            commentaire || `Nouvel arrivage par ${user?.nom}`,
            user?.id || null,
          ]
        );
      });

      Alert.alert("✅ Succès", `Le stock de "${selectedProduit.nom}" a été mis à jour.`);
      resetApproModal();
      loadStockData();
    } catch (error) {
      console.error("[StockScreen] Erreur approvisionnement:", error);
      Alert.alert("Erreur", "Impossible d'enregistrer l'entrée de stock.");
    }
  };

  const resetApproModal = () => {
    setModalVisible(false);
    setQuantiteEntree("");
    setPrixAchat("");
    setCommentaire("");
    setSelectedProduit(null);
  };

  // ============================================
  // 📁 FILTRAGE
  // ============================================

  const getFilteredProducts = () => {
    let filtered = produits.filter(
      (p) =>
        p.nom.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (p.code_barre && p.code_barre.includes(searchQuery))
    );

    if (selectedCategorie !== "Toutes") {
      filtered = filtered.filter((p) => p.categorie === selectedCategorie);
    }

    return filtered;
  };

  // ============================================
  // 📁 STATUT STOCK
  // ============================================

  const getStockStatus = (stock: number, minimum: number) => {
    if (stock <= 0) return { label: "RUPTURE", color: "#C62828" };
    if (stock <= minimum) return { label: "ALERTE", color: "#EF6C00" };
    if (stock <= minimum * 2) return { label: "BAS", color: "#F57C00" };
    return { label: "OK", color: "#2E7D32" };
  };

  // ============================================
  // 📁 RENDU
  // ============================================

  const renderProduitItem = ({ item }: { item: Produit }) => {
    const status = getStockStatus(item.stock_actuel, item.stock_minimum);
    const estEnAlerte = item.stock_actuel <= item.stock_minimum;

    return (
      <TouchableOpacity
        style={[styles.productCard, estEnAlerte && styles.cardAlert]}
        onPress={() => {
          setSelectedProduit(item);
          setShowMouvements(true);
          loadMouvements(item.id);
        }}
        activeOpacity={0.7}
      >
        <View style={styles.productInfo}>
          <View style={styles.productHeader}>
            <Text style={styles.productName}>{item.nom}</Text>
            <View style={[styles.statusBadge, { backgroundColor: status.color + "20" }]}>
              <Text style={[styles.statusText, { color: status.color }]}>{status.label}</Text>
            </View>
          </View>

          <Text style={styles.productCategory}>
            <Ionicons name="folder-outline" size={12} color="#777" /> {item.categorie}
          </Text>

          {item.code_barre && (
            <Text style={styles.productBarcode}>
              <Ionicons name="barcode-outline" size={12} color="#777" /> {item.code_barre}
            </Text>
          )}

          <View style={styles.productPrices}>
            {!isMagasinier && (
              <Text style={styles.productPriceAchat}>
                Achat: {item.prix_achat.toFixed(2)} {devise}
              </Text>
            )}
            <Text style={styles.productPriceVente}>
              Vente: {item.prix_view.toFixed(2)} {devise}
            </Text>
            {!isMagasinier && item.prix_achat > 0 && (
              <Text style={styles.productMargin}>
                Marge: {(((item.prix_view - item.prix_achat) / item.prix_achat) * 100).toFixed(0)}%
              </Text>
            )}
          </View>
        </View>

        <View style={styles.stockActionArea}>
          <View style={styles.stockContainer}>
            <Text style={[styles.stockValue, estEnAlerte ? styles.redText : styles.greenText]}>
              {item.stock_actuel}
            </Text>
            <Text style={styles.stockUnit}>{item.unite_mesure || "u"}</Text>
          </View>
          <Text style={styles.stockMin}>Min: {item.stock_minimum}</Text>

          <TouchableOpacity
            style={styles.entryButton}
            onPress={() => {
              setSelectedProduit(item);
              setModalVisible(true);
            }}
          >
            <Ionicons name="add-circle-outline" size={16} color="#FFF" />
            <Text style={styles.entryButtonText}>Appro</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    );
  };

  const renderMouvementItem = ({ item }: { item: MouvementStock }) => {
    const isAppro = item.type_mouvement === "APPROVISIONNEMENT";
    const isVente = item.type_mouvement === "VENTE";

    return (
      <View style={styles.mouvementItem}>
        <View style={styles.mouvementLeft}>
          <View
            style={[
              styles.mouvementIcon,
              { backgroundColor: isAppro ? "#E8F5E9" : isVente ? "#FFEBEE" : "#FFF3E0" },
            ]}
          >
            <Ionicons
              name={isAppro ? "arrow-down" : isVente ? "arrow-up" : "swap-horizontal"}
              size={16}
              color={isAppro ? "#2E7D32" : isVente ? "#C62828" : "#EF6C00"}
            />
          </View>
          <View>
            <Text style={styles.mouvementType}>{item.type_mouvement}</Text>
            <Text style={styles.mouvementDate}>
              {new Date(item.date_mouvement).toLocaleString()}
            </Text>
            {item.commentaire && (
              <Text style={styles.mouvementComment}>{item.commentaire}</Text>
            )}
          </View>
        </View>
        <View style={styles.mouvementRight}>
          <Text
            style={[
              styles.mouvementQuantite,
              isAppro ? styles.positive : isVente ? styles.negative : styles.neutral,
            ]}
          >
            {isAppro ? "+" : ""}
            {item.quantite}
          </Text>
          <Text style={styles.mouvementStock}>
            {item.stock_avant} → {item.stock_apres}
          </Text>
        </View>
      </View>
    );
  };

  const filteredData = getFilteredProducts();

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#1565C0" />
        <Text style={styles.loadingText}>Chargement du catalogue...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* === EN-TÊTE === */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <Text style={styles.title}>📦 Catalogue & Inventaire</Text>
          <Text style={styles.productCount}>{filteredData.length} produits</Text>
        </View>

        <View style={styles.searchContainer}>
          <Ionicons name="search" size={20} color="#999" style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Rechercher par nom ou code-barre..."
            placeholderTextColor="#999"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery("")}>
              <Ionicons name="close-circle" size={20} color="#999" />
            </TouchableOpacity>
          )}
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filtersScroll}>
          {categories.map((cat) => (
            <TouchableOpacity
              key={cat}
              style={[styles.filterChip, selectedCategorie === cat && styles.filterChipActive]}
              onPress={() => setSelectedCategorie(cat)}
            >
              <Text style={[styles.filterChipText, selectedCategorie === cat && styles.filterChipTextActive]}>
                {cat}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* === STATS === */}
      <View style={styles.statsBar}>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{totalProduits}</Text>
          <Text style={styles.statLabel}>Produits</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{totalValeurStock.toFixed(0)} {devise}</Text>
          <Text style={styles.statLabel}>Valeur stock</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={[styles.statValue, alertesStock > 0 && styles.statValueDanger]}>
            {alertesStock}
          </Text>
          <Text style={styles.statLabel}>Alertes</Text>
        </View>
      </View>

      {/* === LISTE === */}
      <FlatList
        data={filteredData}
        keyExtractor={(item) => item.id.toString()}
        renderItem={renderProduitItem}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={loadStockData} />}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="cube-outline" size={64} color="#CCC" />
            <Text style={styles.emptyText}>Aucun produit trouvé</Text>
          </View>
        }
        contentContainerStyle={styles.listContent}
      />

      {/* === MODAL APPROVISIONNEMENT === */}
      <Modal visible={modalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>📦 Approvisionnement</Text>
              <TouchableOpacity onPress={resetApproModal}>
                <Ionicons name="close" size={24} color="#333" />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalSubtitle}>Produit: {selectedProduit?.nom}</Text>
            <Text style={styles.modalSubtitle}>
              Stock actuel: {selectedProduit?.stock_actuel} unités
            </Text>

            <TextInput
              style={styles.modalInput}
              placeholder="Quantité reçue *"
              keyboardType="numeric"
              value={quantiteEntree}
              onChangeText={setQuantiteEntree}
            />

            {!isMagasinier && (
              <TextInput
                style={styles.modalInput}
                placeholder="Prix d'achat (optionnel)"
                keyboardType="numeric"
                value={prixAchat}
                onChangeText={setPrixAchat}
              />
            )}

            <TextInput
              style={styles.modalInput}
              placeholder="Commentaire (optionnel)"
              value={commentaire}
              onChangeText={setCommentaire}
            />

            <View style={styles.modalActions}>
              <TouchableOpacity style={[styles.modalButton, styles.cancelButton]} onPress={resetApproModal}>
                <Text style={styles.cancelButtonText}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalButton, styles.confirmButton]} onPress={handleApprovisionner}>
                <Text style={styles.confirmButtonText}>Valider</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* === MODAL HISTORIQUE === */}
      <Modal visible={showMouvements} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, styles.mouvementModal]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>📋 Historique</Text>
              <TouchableOpacity
                onPress={() => {
                  setShowMouvements(false);
                  setMouvements([]);
                }}
              >
                <Ionicons name="close" size={24} color="#333" />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalSubtitle}>
              Produit: {selectedProduit?.nom}
            </Text>

            {mouvementsLoading ? (
              <ActivityIndicator size="large" color="#1565C0" style={styles.mouvementLoader} />
            ) : mouvements.length === 0 ? (
              <View style={styles.emptyMouvement}>
                <Ionicons name="time-outline" size={48} color="#CCC" />
                <Text style={styles.emptyText}>Aucun mouvement</Text>
              </View>
            ) : (
              <FlatList
                data={mouvements}
                keyExtractor={(item) => item.id.toString()}
                renderItem={renderMouvementItem}
                style={styles.mouvementList}
              />
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

// ============================================
// 📁 STYLES
// ============================================

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F5F5F5" },
  loadingContainer: { flex: 1, justifyContent: "center", alignItems: "center" },
  loadingText: { marginTop: 12, color: "#666", fontSize: 14 },

  header: {
    padding: 16,
    backgroundColor: "#1565C0",
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
  },
  headerTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  title: { color: "#FFF", fontSize: 20, fontWeight: "bold" },
  productCount: { color: "#FFF", fontSize: 13, opacity: 0.8 },

  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFF",
    borderRadius: 10,
    paddingHorizontal: 12,
    marginBottom: 12,
  },
  searchIcon: { marginRight: 8 },
  searchInput: { flex: 1, paddingVertical: 10, fontSize: 14, color: "#333" },

  filtersScroll: { flexDirection: "row", marginTop: 4 },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.2)",
    marginRight: 8,
  },
  filterChipActive: { backgroundColor: "#FFF" },
  filterChipText: { color: "#FFF", fontSize: 12, fontWeight: "500" },
  filterChipTextActive: { color: "#1565C0" },

  statsBar: {
    flexDirection: "row",
    backgroundColor: "#FFF",
    margin: 16,
    marginTop: 12,
    borderRadius: 12,
    padding: 12,
    elevation: 2,
  },
  statItem: { flex: 1, alignItems: "center" },
  statValue: { fontSize: 18, fontWeight: "bold", color: "#1565C0" },
  statValueDanger: { color: "#C62828" },
  statLabel: { fontSize: 11, color: "#999", marginTop: 2 },
  statDivider: { width: 1, backgroundColor: "#E0E0E0" },

  listContent: { paddingHorizontal: 12, paddingBottom: 20 },

  productCard: {
    flexDirection: "row",
    justifyContent: "space-between",
    backgroundColor: "#FFF",
    padding: 14,
    marginTop: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E0E0E0",
    elevation: 2,
  },
  cardAlert: { borderColor: "#FFCDD2", backgroundColor: "#FFF5F5" },

  productInfo: { flex: 2, marginRight: 10 },
  productHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  productName: { fontSize: 15, fontWeight: "bold", color: "#333", flex: 1 },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
  },
  statusText: { fontSize: 10, fontWeight: "bold" },

  productCategory: { fontSize: 12, color: "#777", marginBottom: 2 },
  productBarcode: { fontSize: 11, color: "#999", marginBottom: 4 },

  productPrices: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 2 },
  productPriceAchat: { fontSize: 12, color: "#E65100" },
  productPriceVente: { fontSize: 13, fontWeight: "600", color: "#1565C0" },
  productMargin: { fontSize: 11, color: "#2E7D32", fontWeight: "500" },

  stockActionArea: { flex: 1, alignItems: "flex-end", justifyContent: "space-between" },
  stockContainer: { flexDirection: "row", alignItems: "center", gap: 2 },
  stockValue: { fontSize: 22, fontWeight: "bold" },
  stockUnit: { fontSize: 10, color: "#999" },
  stockMin: { fontSize: 10, color: "#999" },
  greenText: { color: "#2E7D32" },
  redText: { color: "#C62828" },

  entryButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1565C0",
    borderRadius: 6,
    paddingVertical: 6,
    paddingHorizontal: 12,
    gap: 4,
  },
  entryButtonText: { color: "#FFF", fontSize: 12, fontWeight: "bold" },

  emptyContainer: { alignItems: "center", paddingVertical: 60 },
  emptyText: { fontSize: 16, color: "#999", marginTop: 12, fontWeight: "500" },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalContent: {
    backgroundColor: "#FFF",
    borderRadius: 16,
    padding: 24,
    width: "90%",
    maxWidth: 400,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  modalTitle: { fontSize: 18, fontWeight: "bold", color: "#1565C0" },
  modalSubtitle: { fontSize: 14, color: "#555", marginBottom: 4 },
  modalInput: {
    backgroundColor: "#F5F5F5",
    borderWidth: 1,
    borderColor: "#DDD",
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    marginTop: 10,
  },
  modalActions: { flexDirection: "row", gap: 10 },
  modalButton: { flex: 1, paddingVertical: 12, borderRadius: 8, alignItems: "center" },
  cancelButton: { backgroundColor: "#E0E0E0" },
  cancelButtonText: { color: "#333", fontWeight: "600" },
  confirmButton: { backgroundColor: "#2E7D32" },
  confirmButtonText: { color: "#FFF", fontWeight: "bold" },

  mouvementModal: { maxHeight: "80%" },
  mouvementLoader: { paddingVertical: 40 },
  mouvementList: { maxHeight: 400 },
  mouvementItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#F0F0F0",
  },
  mouvementLeft: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1 },
  mouvementIcon: { width: 32, height: 32, borderRadius: 16, justifyContent: "center", alignItems: "center" },
  mouvementType: { fontSize: 14, fontWeight: "500", color: "#333" },
  mouvementDate: { fontSize: 11, color: "#999" },
  mouvementComment: { fontSize: 11, color: "#666", fontStyle: "italic" },
  mouvementRight: { alignItems: "flex-end" },
  mouvementQuantite: { fontSize: 16, fontWeight: "bold" },
  positive: { color: "#2E7D32" },
  negative: { color: "#C62828" },
  neutral: { color: "#EF6C00" },
  mouvementStock: { fontSize: 11, color: "#999" },
  emptyMouvement: { alignItems: "center", paddingVertical: 40 },
});

export default StockScreen; 