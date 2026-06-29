import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  Alert,
  SafeAreaView,
  ActivityIndicator,
  Modal,
  ScrollView,
  Vibration,
  RefreshControl,
} from "react-native";
import * as SQLite from "expo-sqlite";
import { Ionicons } from "@expo/vector-icons";
import { useUser } from "../context/UserContext";
import { BluetoothManager, BluetoothEscposPrinter } from "react-native-bluetooth-escpos-printer";

const DATABASE_NAME = "stockia_secure.db";

// === INTERFACES ===
interface Produit {
  id: number;
  code_barre: string;
  nom: string;
  categorie: string;
  prix_view: number;
  stock_actuel: number;
  stock_minimum: number;
}

interface ItemPanier {
  produit: Produit;
  quantite: number;
}

interface Client {
  id: number;
  nom: string;
  telephone: string;
  points_fidelite: number;
}

// ============================================
// 📁 COMPOSANT PRINCIPAL
// ============================================

const CaisseScreen: React.FC = () => {
  const { user, printEnabled } = useUser();

  // === ÉTATS PRINCIPAUX ===
  const [produits, setProduits] = useState<Produit[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [panier, setPanier] = useState<ItemPanier[]>([]);
  const [devise, setDevise] = useState("USD");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [factureNumero, setFactureNumero] = useState("");

  // === ÉTATS BLUETOOTH ===
  const [isPrinting, setIsPrinting] = useState(false);
  const [bluetoothConnected, setBluetoothConnected] = useState(false);

  // === ÉTATS CLIENTS ===
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [showClientModal, setShowClientModal] = useState(false);
  const [clientSearch, setClientSearch] = useState("");

  // === ÉTATS REMISE ===
  const [showDiscountModal, setShowDiscountModal] = useState(false);
  const [discountValue, setDiscountValue] = useState("");
  const [discountType, setDiscountType] = useState<"percentage" | "fixed">("percentage");
  const [appliedDiscount, setAppliedDiscount] = useState(0);

  // === ÉTATS PAIEMENT ===
  const [modePaiement, setModePaiement] = useState<"CASH" | "MOBILE_MONEY">("CASH");
  const [montantRecu, setMontantRecu] = useState("");
  const [showPaymentModal, setShowPaymentModal] = useState(false);

  // === RÉFÉRENCES ===
  const inputRef = useRef<TextInput>(null);
  const panierRef = useRef<FlatList>(null);

  // ============================================
  // 📁 INITIALISATION
  // ============================================

  useEffect(() => {
    initializeCaisse();
  }, []);

  useEffect(() => {
    if (panier.length > 0 && panierRef.current) {
      setTimeout(() => {
        panierRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [panier.length]);

  const initializeCaisse = async () => {
    try {
      setLoading(true);
      await loadInitialData();
      await checkBluetoothConnection();
      await generateInvoiceNumber();
      await loadClients();
    } catch (error) {
      console.error("[CaisseScreen] Erreur initialisation:", error);
      Alert.alert("Erreur", "Impossible d'initialiser la caisse.");
    } finally {
      setLoading(false);
    }
  };

  // ============================================
  // 📁 CHARGEMENT DES DONNÉES
  // ============================================

  const loadInitialData = async () => {
    try {
      const db = await SQLite.openDatabaseAsync(DATABASE_NAME);

      const paramDevise = await db.getFirstAsync<{ valeur: string }>(
        "SELECT valeur FROM parametres_systeme WHERE cle = 'devise_symbole';"
      );
      if (paramDevise) setDevise(paramDevise.valeur);

      const allProducts = await db.getAllAsync<Produit>(
        `SELECT id, code_barre, nom, categorie, prix_view, stock_actuel, stock_minimum
         FROM produits
         WHERE stock_actuel > 0
         ORDER BY nom ASC;`
      );
      setProduits(allProducts || []);
    } catch (error) {
      console.error("[CaisseScreen] Erreur chargement:", error);
      throw error;
    }
  };

  const generateInvoiceNumber = async () => {
    try {
      const db = await SQLite.openDatabaseAsync(DATABASE_NAME);
      const today = new Date();
      const dateStr = today.toISOString().slice(0, 10).replace(/-/g, "");

      const result = await db.getFirstAsync<{ count: number }>(
        "SELECT COUNT(*) as count FROM ventes WHERE date_vente LIKE ?;",
        [`${today.toISOString().slice(0, 10)}%`]
      );

      const count = (result?.count || 0) + 1;
      setFactureNumero(`FC-${dateStr}-${String(count).padStart(4, "0")}`);
    } catch (error) {
      console.error("[Facture] Erreur génération:", error);
      setFactureNumero(`FC-${Date.now()}`);
    }
  };

  const loadClients = async () => {
    try {
      const db = await SQLite.openDatabaseAsync(DATABASE_NAME);
      const allClients = await db.getAllAsync<Client>(
        "SELECT id, nom, telephone, points_fidelite FROM clients WHERE actif = 1 ORDER BY nom ASC;"
      );
      setClients(allClients || []);
    } catch (error) {
      console.error("[CaisseScreen] Erreur chargement clients:", error);
    }
  };

  // ============================================
  // 📁 BLUETOOTH
  // ============================================

  const checkBluetoothConnection = async () => {
    try {
      const isConnected = await BluetoothManager.isConnected();
      setBluetoothConnected(isConnected);
    } catch (error) {
      console.error("[Bluetooth] Erreur vérification:", error);
      setBluetoothConnected(false);
    }
  };

  // ============================================
  // 📁 GESTION DU PANIER
  // ============================================

  const ajouterAuPanier = (produit: Produit) => {
    const itemExistant = panier.find((item) => item.produit.id === produit.id);
    const qteActuelle = itemExistant ? itemExistant.quantite : 0;

    if (qteActuelle + 1 > produit.stock_actuel) {
      Alert.alert("Stock insuffisant", `Il ne reste que ${produit.stock_actuel} unités.`);
      Vibration.vibrate(100);
      return;
    }

    if (itemExistant) {
      setPanier(
        panier.map((item) =>
          item.produit.id === produit.id ? { ...item, quantite: item.quantite + 1 } : item
        )
      );
    } else {
      setPanier([...panier, { produit, quantite: 1 }]);
    }
    Vibration.vibrate(50);
  };

  const retirerDuPanier = (produitId: number) => {
    const item = panier.find((item) => item.produit.id === produitId);
    if (item) {
      if (item.quantite > 1) {
        setPanier(
          panier.map((i) =>
            i.produit.id === produitId ? { ...i, quantite: i.quantite - 1 } : i
          )
        );
      } else {
        setPanier(panier.filter((i) => i.produit.id !== produitId));
      }
    }
  };

  const viderPanier = () => {
    if (panier.length === 0) return;
    Alert.alert(
      "Vider le panier",
      "Êtes-vous sûr de vouloir vider tout le panier ?",
      [
        { text: "Annuler", style: "cancel" },
        { text: "Vider", style: "destructive", onPress: () => setPanier([]) },
      ]
    );
  };

  // ============================================
  // 📁 CALCULS
  // ============================================

  const calculerSousTotal = () => {
    return panier.reduce((sum, item) => sum + item.produit.prix_view * item.quantite, 0);
  };

  const calculerTotal = () => {
    return calculerSousTotal() - appliedDiscount;
  };

  const calculerNombreArticles = () => {
    return panier.reduce((sum, item) => sum + item.quantite, 0);
  };

  // ============================================
  // 📁 REMISE
  // ============================================

  const applyDiscount = () => {
    const value = parseFloat(discountValue);
    if (isNaN(value) || value <= 0) {
      Alert.alert("Erreur", "Veuillez entrer un montant valide.");
      return;
    }

    const sousTotal = calculerSousTotal();
    let discountAmount = 0;

    if (discountType === "percentage") {
      if (value > 100) {
        Alert.alert("Erreur", "Le pourcentage ne peut pas dépasser 100%.");
        return;
      }
      discountAmount = (sousTotal * value) / 100;
    } else {
      if (value > sousTotal) {
        Alert.alert("Erreur", "La remise ne peut pas dépasser le total.");
        return;
      }
      discountAmount = value;
    }

    setAppliedDiscount(discountAmount);
    setShowDiscountModal(false);
    setDiscountValue("");
    Vibration.vibrate(50);
  };

  const removeDiscount = () => {
    setAppliedDiscount(0);
  };

  // ============================================
  // 📁 CLIENTS
  // ============================================

  const selectClient = (client: Client) => {
    setSelectedClient(client);
    setShowClientModal(false);
    Vibration.vibrate(50);
  };

  const clearClient = () => {
    setSelectedClient(null);
  };

  // ============================================
  // 📁 IMPRESSION
  // ============================================

  const printReceipt = async (venteId: number, total: number) => {
    if (!printEnabled) return;

    try {
      setIsPrinting(true);

      const isConnected = await BluetoothManager.isConnected();
      if (!isConnected) {
        Alert.alert(
          "Imprimante hors-ligne",
          "L'imprimante thermique n'est pas connectée.",
          [{ text: "OK" }, { text: "Réessayer", onPress: checkBluetoothConnection }]
        );
        return;
      }

      await BluetoothEscposPrinter.printerInit();

      const dateStr = new Date().toLocaleString();

      await BluetoothEscposPrinter.printText("\n\n", { align: 1 });
      await BluetoothEscposPrinter.printText(" STOCKIA - TICKET\n", { fontBold: 1, align: 1 });
      await BluetoothEscposPrinter.printText("=".repeat(32) + "\n", { align: 1 });
      await BluetoothEscposPrinter.printText(`Facture: ${factureNumero}\n`, { align: 0 });
      await BluetoothEscposPrinter.printText(`Date: ${dateStr}\n`, { align: 0 });
      await BluetoothEscposPrinter.printText(`Vendeur: ${user?.nom || "Inconnu"}\n`, { align: 0 });

      if (selectedClient) {
        await BluetoothEscposPrinter.printText(`Client: ${selectedClient.nom}\n`, { align: 0 });
      }

      await BluetoothEscposPrinter.printText("-".repeat(32) + "\n", { align: 1 });
      await BluetoothEscposPrinter.printText("ARTICLES\n", { fontBold: 1, align: 0 });
      await BluetoothEscposPrinter.printText("-".repeat(32) + "\n", { align: 1 });

      for (const item of panier) {
        const nomTronque = item.produit.nom.substring(0, 16).padEnd(16);
        const qteStr = `x${item.quantite}`.padEnd(4);
        const totalLigne = (item.produit.prix_view * item.quantite).toFixed(2);
        const prixStr = `${totalLigne} ${devise}`.padStart(10);

        await BluetoothEscposPrinter.printText(`${nomTronque} ${qteStr} ${prixStr}\n`, { align: 0 });
      }

      await BluetoothEscposPrinter.printText("-".repeat(32) + "\n", { align: 1 });

      const sousTotal = calculerSousTotal();
      await BluetoothEscposPrinter.printText(
        `SOUS-TOTAL: ${sousTotal.toFixed(2)} ${devise}\n`,
        { align: 2 }
      );

      if (appliedDiscount > 0) {
        await BluetoothEscposPrinter.printText(
          `REMISE: -${appliedDiscount.toFixed(2)} ${devise}\n`,
          { align: 2 }
        );
      }

      await BluetoothEscposPrinter.printText("=".repeat(32) + "\n", { align: 1 });
      await BluetoothEscposPrinter.printText(
        `TOTAL: ${total.toFixed(2)} ${devise}\n`,
        { fontBold: 1, align: 2 }
      );
      await BluetoothEscposPrinter.printText(`PAIEMENT: ${modePaiement}\n`, { align: 0 });

      await BluetoothEscposPrinter.printText("-".repeat(32) + "\n", { align: 1 });
      await BluetoothEscposPrinter.printText("Merci de votre confiance !\n", { align: 1 });
      await BluetoothEscposPrinter.printText("Solution par Spirale Agence\n\n\n\n", { align: 1 });

      await BluetoothEscposPrinter.printCutPaper();

      Alert.alert("✅ Impression réussie", "Le ticket a été imprimé.");
    } catch (error) {
      console.error("[Impression] Erreur:", error);
      Alert.alert("Erreur d'impression", "Impossible d'imprimer le ticket.");
    } finally {
      setIsPrinting(false);
    }
  };

  // ============================================
  // 📁 VALIDATION DE LA VENTE
  // ============================================

  const handleValiderVente = async () => {
    if (panier.length === 0) {
      Alert.alert("Panier vide", "Veuillez ajouter au moins un produit.");
      return;
    }
    setShowPaymentModal(true);
  };

  const finaliserVente = async () => {
    try {
      const total = calculerTotal();
      const montantRecuNum = parseFloat(montantRecu);

      if (isNaN(montantRecuNum) || montantRecuNum < total) {
        Alert.alert("Erreur", "Le montant reçu est insuffisant.");
        return;
      }

      const monnaie = montantRecuNum - total;
      const db = await SQLite.openDatabaseAsync(DATABASE_NAME);
      const dateVente = new Date().toISOString();

      let venteId: number | null = null;

      await db.withTransactionAsync(async () => {
        const resultVente = await db.runAsync(
          `INSERT INTO ventes (
            facture_numero, client_id, utilisateur_id,
            montant_brut, remise, montant_net,
            montant_paye, mode_paiement, statut, date_vente
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'COMPLETEE', ?);`,
          [
            factureNumero,
            selectedClient?.id || null,
            user?.id || 1,
            calculerSousTotal(),
            appliedDiscount,
            total,
            montantRecuNum,
            modePaiement,
            dateVente,
          ]
        );

        venteId = Number(resultVente.lastInsertRowId);

        for (const item of panier) {
          await db.runAsync(
            `INSERT INTO details_ventes (
              vente_id, produit_id, quantite,
              prix_unitaire, remise_ligne, sous_total
            ) VALUES (?, ?, ?, ?, ?, ?);`,
            [
              venteId,
              item.produit.id,
              item.quantite,
              item.produit.prix_view,
              0,
              item.produit.prix_view * item.quantite,
            ]
          );

          const nouveauStock = item.produit.stock_actuel - item.quantite;
          await db.runAsync(
            "UPDATE produits SET stock_actuel = ? WHERE id = ?;",
            [nouveauStock, item.produit.id]
          );

          await db.runAsync(
            `INSERT INTO mouvements_stock (
              produit_id, type_mouvement, quantite,
              stock_avant, stock_apres, date_mouvement, commentaire
            ) VALUES (?, 'VENTE', ?, ?, ?, ?, ?);`,
            [
              item.produit.id,
              item.quantite,
              item.produit.stock_actuel,
              nouveauStock,
              dateVente,
              `Vente #${venteId} - ${factureNumero}`,
            ]
          );
        }

        if (selectedClient) {
          const pointsGagnes = Math.floor(total / 10);
          await db.runAsync(
            "UPDATE clients SET points_fidelite = points_fidelite + ?, total_achats = total_achats + ? WHERE id = ?;",
            [pointsGagnes, total, selectedClient.id]
          );
        }
      });

      const panierCopy = [...panier];
      const totalFinal = total;
      const venteIdFinal = venteId;

      setPanier([]);
      setMontantRecu("");
      setShowPaymentModal(false);
      setAppliedDiscount(0);
      await generateInvoiceNumber();

      Alert.alert(
        "✅ Vente Réussie",
        `Montant: ${totalFinal.toFixed(2)} ${devise}\nMonnaie: ${monnaie.toFixed(2)} ${devise}\n${
          selectedClient ? `Client: ${selectedClient.nom}` : ""
        }`,
        [
          {
            text: "OK",
            onPress: async () => {
              if (printEnabled && venteIdFinal) {
                await printReceipt(venteIdFinal, totalFinal);
              }
            },
          },
        ]
      );

      await loadInitialData();
    } catch (error) {
      console.error("[Vente] Erreur:", error);
      Alert.alert("Erreur", "Impossible de finaliser la transaction.");
    }
  };

  // ============================================
  // 📁 RENDU
  // ============================================

  const filteredProduits = produits.filter(
    (p) =>
      p.nom.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.code_barre && p.code_barre.includes(searchQuery))
  );

  const renderPanierItem = ({ item }: { item: ItemPanier }) => (
    <TouchableOpacity
      style={styles.cartItem}
      onPress={() => retirerDuPanier(item.produit.id)}
      activeOpacity={0.7}
    >
      <View style={styles.cartItemContent}>
        <Text style={styles.cartItemName}>{item.produit.nom}</Text>
        <Text style={styles.cartItemQuantity}>x{item.quantite}</Text>
        <Text style={styles.cartItemPrice}>
          {(item.produit.prix_view * item.quantite).toFixed(2)} {devise}
        </Text>
      </View>
    </TouchableOpacity>
  );

  const renderProduitItem = ({ item }: { item: Produit }) => {
    const enStock = item.stock_actuel > 0;

    return (
      <TouchableOpacity
        style={[styles.productItem, !enStock && styles.productItemOutOfStock]}
        onPress={() => enStock && ajouterAuPanier(item)}
        disabled={!enStock}
        activeOpacity={0.7}
      >
        <View>
          <Text style={styles.productName}>{item.nom}</Text>
          <Text style={styles.productCategory}>{item.categorie}</Text>
          {item.code_barre && <Text style={styles.productBarcode}>{item.code_barre}</Text>}
        </View>
        <View style={styles.productRight}>
          <Text style={styles.productPrice}>
            {item.prix_view.toFixed(2)} {devise}
          </Text>
          <Text style={[styles.productStock, !enStock && styles.productStockOut]}>
            {enStock ? `${item.stock_actuel} u` : "Rupture"}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#1565C0" />
        <Text style={styles.loadingText}>Chargement de la caisse...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Statut Bluetooth */}
      {printEnabled && (
        <View style={styles.bluetoothStatus}>
          <View style={[styles.statusDot, bluetoothConnected ? styles.connected : styles.disconnected]} />
          <Text style={styles.statusText}>
            {bluetoothConnected ? "✓ Imprimante prête" : "✗ Imprimante hors-ligne"}
          </Text>
        </View>
      )}

      {/* Recherche */}
      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color="#999" style={styles.searchIcon} />
        <TextInput
          ref={inputRef}
          style={styles.searchInput}
          placeholder="Rechercher un article..."
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

      {/* Liste produits */}
      <FlatList
        data={filteredProduits}
        keyExtractor={(item) => item.id.toString()}
        renderItem={renderProduitItem}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              await loadInitialData();
              setRefreshing(false);
            }}
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="cube-outline" size={64} color="#CCC" />
            <Text style={styles.emptyText}>Aucun produit trouvé</Text>
          </View>
        }
        contentContainerStyle={styles.productList}
      />

      {/* Panier */}
      <View style={styles.cartContainer}>
        <View style={styles.cartHeader}>
          <Text style={styles.cartTitle}>🛒 Panier</Text>
          <Text style={styles.cartCount}>{calculerNombreArticles()} articles</Text>
          <TouchableOpacity onPress={viderPanier}>
            <Ionicons name="trash-outline" size={20} color="#D32F2F" />
          </TouchableOpacity>
        </View>

        <FlatList
          data={panier}
          keyExtractor={(item) => item.produit.id.toString()}
          renderItem={renderPanierItem}
          style={styles.cartList}
          ref={panierRef}
          ListEmptyComponent={
            <View style={styles.emptyCartContainer}>
              <Text style={styles.emptyCartText}>Panier vide</Text>
            </View>
          }
        />

        {/* Client */}
        <View style={styles.clientSection}>
          {selectedClient ? (
            <TouchableOpacity style={styles.clientBadge} onPress={() => setShowClientModal(true)}>
              <Text style={styles.clientBadgeText}>{selectedClient.nom}</Text>
              <TouchableOpacity onPress={clearClient}>
                <Ionicons name="close" size={16} color="#F44336" />
              </TouchableOpacity>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={styles.clientButton} onPress={() => setShowClientModal(true)}>
              <Text style={styles.clientButtonText}>+ Ajouter un client</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Totaux */}
        <View style={styles.totalsContainer}>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Sous-total</Text>
            <Text style={styles.totalValue}>{calculerSousTotal().toFixed(2)} {devise}</Text>
          </View>
          {appliedDiscount > 0 && (
            <View style={styles.discountRow}>
              <Text style={styles.discountLabel}>Remise</Text>
              <TouchableOpacity onPress={removeDiscount}>
                <Ionicons name="close-circle" size={16} color="#F44336" />
              </TouchableOpacity>
              <Text style={styles.discountValue}>-{appliedDiscount.toFixed(2)} {devise}</Text>
            </View>
          )}
          <View style={[styles.totalRow, styles.grandTotalRow]}>
            <Text style={styles.grandTotalLabel}>Total à payer</Text>
            <Text style={styles.grandTotalValue}>{calculerTotal().toFixed(2)} {devise}</Text>
          </View>
        </View>

        {/* Actions */}
        <View style={styles.actionsContainer}>
          <TouchableOpacity style={styles.discountButton} onPress={() => setShowDiscountModal(true)}>
            <Text style={styles.discountButtonText}>🏷️ Remise</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.checkoutButton, isPrinting && styles.checkoutButtonDisabled]}
            onPress={handleValiderVente}
            disabled={isPrinting || panier.length === 0}
          >
            {isPrinting ? (
              <ActivityIndicator size="small" color="#FFF" />
            ) : (
              <Text style={styles.checkoutButtonText}>💵 Payer</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* Modal Paiement */}
      <Modal
        visible={showPaymentModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowPaymentModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>💳 Paiement</Text>
            <TouchableOpacity onPress={() => setShowPaymentModal(false)}>
              <Ionicons name="close" size={24} color="#333" />
            </TouchableOpacity>

            <View style={styles.paymentTotalDisplay}>
              <Text style={styles.paymentTotalLabel}>Total à payer</Text>
              <Text style={styles.paymentTotalValue}>
                {calculerTotal().toFixed(2)} {devise}
              </Text>
            </View>

            <View style={styles.paymentMethodContainer}>
              <Text style={styles.paymentMethodLabel}>Mode de paiement</Text>
              <View style={styles.paymentMethodButtons}>
                {["CASH", "MOBILE_MONEY"].map((mode) => (
                  <TouchableOpacity
                    key={mode}
                    style={[styles.paymentMethodButton, modePaiement === mode && styles.paymentMethodActive]}
                    onPress={() => setModePaiement(mode as any)}
                  >
                    <Text style={[styles.paymentMethodText, modePaiement === mode && styles.paymentMethodTextActive]}>
                      {mode === "CASH" ? "💵 Espèces" : "📱 Mobile"}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <TextInput
              style={styles.modalInput}
              placeholder="Montant reçu"
              keyboardType="numeric"
              value={montantRecu}
              onChangeText={setMontantRecu}
            />

            {parseFloat(montantRecu) >= calculerTotal() && parseFloat(montantRecu) > 0 && (
              <View style={styles.monnaieContainer}>
                <Text style={styles.monnaieLabel}>Monnaie à rendre</Text>
                <Text style={styles.monnaieValue}>
                  {(parseFloat(montantRecu) - calculerTotal()).toFixed(2)} {devise}
                </Text>
              </View>
            )}

            <TouchableOpacity style={styles.modalConfirmButton} onPress={finaliserVente}>
              <Text style={styles.modalConfirmText}>💰 Valider le paiement</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Modal Client */}
      <Modal
        visible={showClientModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowClientModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Sélectionner un client</Text>
            <TouchableOpacity onPress={() => setShowClientModal(false)}>
              <Ionicons name="close" size={24} color="#333" />
            </TouchableOpacity>

            <TextInput
              style={styles.modalSearch}
              placeholder="Rechercher un client..."
              value={clientSearch}
              onChangeText={setClientSearch}
            />

            <FlatList
              data={clients.filter((c) => c.nom.toLowerCase().includes(clientSearch.toLowerCase()))}
              keyExtractor={(item) => item.id.toString()}
              renderItem={({ item }) => (
                <TouchableOpacity style={styles.clientItem} onPress={() => selectClient(item)}>
                  <View>
                    <Text style={styles.clientItemName}>{item.nom}</Text>
                    <Text style={styles.clientItemPhone}>{item.telephone}</Text>
                  </View>
                  <Text style={styles.clientItemPoints}>⭐ {item.points_fidelite} pts</Text>
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>

      {/* Modal Remise */}
      <Modal
        visible={showDiscountModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowDiscountModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Appliquer une remise</Text>
            <TouchableOpacity onPress={() => setShowDiscountModal(false)}>
              <Ionicons name="close" size={24} color="#333" />
            </TouchableOpacity>

            <View style={styles.discountTypeContainer}>
              <TouchableOpacity
                style={[styles.discountTypeButton, discountType === "percentage" && styles.discountTypeActive]}
                onPress={() => setDiscountType("percentage")}
              >
                <Text style={[styles.discountTypeText, discountType === "percentage" && styles.discountTypeTextActive]}>
                  Pourcentage (%)
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.discountTypeButton, discountType === "fixed" && styles.discountTypeActive]}
                onPress={() => setDiscountType("fixed")}
              >
                <Text style={[styles.discountTypeText, discountType === "fixed" && styles.discountTypeTextActive]}>
                  Montant fixe
                </Text>
              </TouchableOpacity>
            </View>

            <TextInput
              style={styles.modalInput}
              placeholder={discountType === "percentage" ? "Entrer le %" : "Entrer le montant"}
              keyboardType="numeric"
              value={discountValue}
              onChangeText={setDiscountValue}
            />

            <TouchableOpacity style={styles.modalConfirmButton} onPress={applyDiscount}>
              <Text style={styles.modalConfirmText}>Appliquer la remise</Text>
            </TouchableOpacity>
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

  bluetoothStatus: {
    flexDirection: "row",
    alignItems: "center",
    padding: 8,
    backgroundColor: "#FFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E0E0E0",
    paddingHorizontal: 16,
  },
  statusDot: { width: 10, height: 10, borderRadius: 5, marginRight: 8 },
  connected: { backgroundColor: "#4CAF50" },
  disconnected: { backgroundColor: "#F44336" },
  statusText: { flex: 1, fontSize: 12, color: "#333" },

  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFF",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#DDD",
    margin: 12,
    paddingHorizontal: 12,
    paddingVertical: 2,
  },
  searchIcon: { marginRight: 8 },
  searchInput: { flex: 1, paddingVertical: 10, fontSize: 15, color: "#333" },

  productList: { paddingHorizontal: 12, paddingBottom: 20 },
  productItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    backgroundColor: "#FFF",
    padding: 14,
    borderRadius: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#EAEAEA",
    elevation: 1,
  },
  productItemOutOfStock: { opacity: 0.5, backgroundColor: "#F5F5F5" },
  productName: { fontSize: 15, fontWeight: "600", color: "#333" },
  productCategory: { fontSize: 12, color: "#999", marginTop: 2 },
  productBarcode: { fontSize: 11, color: "#BBB", marginTop: 2 },
  productRight: { alignItems: "flex-end" },
  productPrice: { fontSize: 16, color: "#1565C0", fontWeight: "700" },
  productStock: { fontSize: 12, color: "#666" },
  productStockOut: { color: "#C62828" },

  emptyContainer: { alignItems: "center", paddingVertical: 60 },
  emptyText: { fontSize: 16, color: "#999", marginTop: 12, fontWeight: "500" },

  cartContainer: {
    backgroundColor: "#FFF",
    borderTopWidth: 2,
    borderTopColor: "#1565C0",
    padding: 16,
    maxHeight: 350,
  },
  cartHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  cartTitle: { fontSize: 16, fontWeight: "bold", color: "#333" },
  cartCount: { fontSize: 12, color: "#999" },
  cartList: { maxHeight: 120, marginBottom: 10 },
  cartItem: { paddingVertical: 4 },
  cartItemContent: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: "#F0F0F0",
  },
  cartItemName: { fontSize: 14, color: "#555", flex: 1 },
  cartItemQuantity: { fontSize: 12, color: "#999", marginHorizontal: 8 },
  cartItemPrice: { fontSize: 14, fontWeight: "600", color: "#333" },
  emptyCartContainer: { alignItems: "center", paddingVertical: 20 },
  emptyCartText: { fontSize: 14, color: "#999" },

  clientSection: { marginBottom: 10 },
  clientButton: { paddingVertical: 6 },
  clientButtonText: { fontSize: 13, color: "#666" },
  clientBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#E3F2FD",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    alignSelf: "flex-start",
    gap: 8,
  },
  clientBadgeText: { fontSize: 13, color: "#1565C0", fontWeight: "500" },

  totalsContainer: { borderTopWidth: 1, borderTopColor: "#F0F0F0", paddingTop: 8, marginBottom: 10 },
  totalRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 2 },
  totalLabel: { fontSize: 14, color: "#666" },
  totalValue: { fontSize: 14, fontWeight: "500", color: "#333" },
  discountRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 2 },
  discountLabel: { fontSize: 14, color: "#D32F2F" },
  discountValue: { fontSize: 14, fontWeight: "500", color: "#D32F2F" },
  grandTotalRow: { borderTopWidth: 1, borderTopColor: "#EAEAEA", paddingTop: 8, marginTop: 4 },
  grandTotalLabel: { fontSize: 16, fontWeight: "bold", color: "#333" },
  grandTotalValue: { fontSize: 18, fontWeight: "bold", color: "#2E7D32" },

  actionsContainer: { flexDirection: "row", gap: 10 },
  discountButton: {
    flex: 1,
    backgroundColor: "#E3F2FD",
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: "center",
  },
  discountButtonText: { fontSize: 14, color: "#1565C0", fontWeight: "500" },
  checkoutButton: {
    flex: 2,
    backgroundColor: "#1565C0",
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
  },
  checkoutButtonDisabled: { backgroundColor: "#90CAF9" },
  checkoutButtonText: { color: "#FFF", fontSize: 15, fontWeight: "bold" },

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
  modalTitle: { fontSize: 18, fontWeight: "bold", color: "#333", marginBottom: 16 },
  modalInput: {
    backgroundColor: "#F5F5F5",
    borderWidth: 1,
    borderColor: "#DDD",
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
    marginBottom: 12,
  },
  modalConfirmButton: {
    backgroundColor: "#1565C0",
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: "center",
  },
  modalConfirmText: { color: "#FFF", fontWeight: "bold", fontSize: 15 },

  paymentTotalDisplay: { alignItems: "center", marginBottom: 16 },
  paymentTotalLabel: { fontSize: 14, color: "#666" },
  paymentTotalValue: { fontSize: 28, fontWeight: "bold", color: "#1565C0", marginTop: 4 },
  paymentMethodContainer: { marginBottom: 16 },
  paymentMethodLabel: { fontSize: 14, fontWeight: "500", color: "#333", marginBottom: 8 },
  paymentMethodButtons: { flexDirection: "row", gap: 8 },
  paymentMethodButton: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#DDD",
    alignItems: "center",
  },
  paymentMethodActive: { backgroundColor: "#1565C0", borderColor: "#1565C0" },
  paymentMethodText: { fontSize: 12, color: "#666" },
  paymentMethodTextActive: { color: "#FFF" },
  monnaieContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    backgroundColor: "#E8F5E9",
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  monnaieLabel: { fontSize: 14, color: "#2E7D32" },
  monnaieValue: { fontSize: 16, fontWeight: "bold", color: "#2E7D32" },

  discountTypeContainer: { flexDirection: "row", gap: 10, marginBottom: 12 },
  discountTypeButton: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#DDD",
    alignItems: "center",
  },
  discountTypeActive: { backgroundColor: "#1565C0", borderColor: "#1565C0" },
  discountTypeText: { fontSize: 13, color: "#666" },
  discountTypeTextActive: { color: "#FFF" },

  modalSearch: {
    backgroundColor: "#F5F5F5",
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
    fontSize: 14,
  },
  clientItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#F0F0F0",
  },
  clientItemName: { fontSize: 14, fontWeight: "500", color: "#333" },
  clientItemPhone: { fontSize: 12, color: "#999" },
  clientItemPoints: { fontSize: 13, color: "#F57C00", fontWeight: "500" },
});

export default CaisseScreen; 
