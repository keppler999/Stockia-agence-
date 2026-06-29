import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  Switch,
  Alert,
  Modal,
  TextInput,
  ActivityIndicator,
  Share,
  Linking,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";
import * as SQLite from "expo-sqlite";
import { useUser } from "../context/UserContext";
import { AuthService } from "../services/AuthService";
import { dbService } from "../services/DatabaseService";

const DATABASE_NAME = "stockia_secure.db";

// ============================================
// 📁 COMPOSANT PRINCIPAL
// ============================================

const SettingsScreen: React.FC = () => {
  const { user, printEnabled, setPrintEnabled, settings, updateSettings, logout } = useUser();

  // === ÉTATS ===
  const [loading, setLoading] = useState(true);
  const [dbSize, setDbSize] = useState("0 KB");
  const [backupLoading, setBackupLoading] = useState(false);
  const [showBackupModal, setShowBackupModal] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordLoading, setPasswordLoading] = useState(false);

  // ============================================
  // 📁 CHARGEMENT
  // ============================================

  useEffect(() => {
    loadSettingsData();
  }, []);

  const loadSettingsData = async () => {
    try {
      setLoading(true);
      await loadDatabaseSize();
    } catch (error) {
      console.error("[Settings] Erreur chargement:", error);
    } finally {
      setLoading(false);
    }
  };

  const loadDatabaseSize = async () => {
    try {
      const dbPath = `${FileSystem.documentDirectory}SQLite/${DATABASE_NAME}`;
      const info = await FileSystem.getInfoAsync(dbPath);
      if (info.exists) {
        const size = info.size / 1024;
        if (size < 1024) {
          setDbSize(`${size.toFixed(1)} KB`);
        } else {
          setDbSize(`${(size / 1024).toFixed(1)} MB`);
        }
      }
    } catch (error) {
      console.error("[Settings] Erreur taille DB:", error);
    }
  };

  // ============================================
  // 📁 SAUVEGARDE
  // ============================================

  const handleBackup = async () => {
    try {
      setBackupLoading(true);
      const backupInfo = await dbService.backup();

      Alert.alert(
        "✅ Sauvegarde Réussie",
        `Base de données sauvegardée.\nTaille: ${dbSize}`,
        [
          { text: "OK" },
          {
            text: "Partager",
            onPress: () => handleShareBackup(backupInfo.path),
          },
        ]
      );

      await loadDatabaseSize();
    } catch (error) {
      console.error("[Backup] Erreur:", error);
      Alert.alert("Erreur", "Impossible d'effectuer la sauvegarde.");
    } finally {
      setBackupLoading(false);
    }
  };

  const handleShareBackup = async (path: string) => {
    try {
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(path, {
          mimeType: "application/x-sqlite3",
          dialogTitle: "Partager la sauvegarde Stockia",
        });
      }
    } catch (error) {
      console.error("[Share] Erreur:", error);
      Alert.alert("Erreur", "Impossible de partager le fichier.");
    }
  };

  // ============================================
  // 📁 CHANGEMENT MOT DE PASSE
  // ============================================

  const handleChangePassword = async () => {
    if (!oldPassword || !newPassword || !confirmPassword) {
      Alert.alert("Erreur", "Veuillez remplir tous les champs.");
      return;
    }

    if (newPassword !== confirmPassword) {
      Alert.alert("Erreur", "Les mots de passe ne correspondent pas.");
      return;
    }

    if (newPassword.length < 6) {
      Alert.alert("Erreur", "Le mot de passe doit contenir au moins 6 caractères.");
      return;
    }

    try {
      setPasswordLoading(true);
      await AuthService.changePassword(user?.id || 0, oldPassword, newPassword);

      Alert.alert("✅ Succès", "Votre mot de passe a été modifié.");
      setShowPasswordModal(false);
      setOldPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (error: any) {
      Alert.alert("Erreur", error.message || "Impossible de modifier le mot de passe.");
    } finally {
      setPasswordLoading(false);
    }
  };

  // ============================================
  // 📁 CONTACT SUPPORT
  // ============================================

  const handleContactSupport = () => {
    const message = `📱 Support Stockia\n\nUtilisateur: ${user?.nom || "N/A"}\nRôle: ${user?.role || "N/A"}\n\nDescription du problème:`;

    const whatsappUrl = `whatsapp://send?phone=+24383009563&text=${encodeURIComponent(message)}`;

    Alert.alert(
      "Contact Support",
      "Choisissez un moyen de contact",
      [
        {
          text: "📱 WhatsApp",
          onPress: () => {
            Linking.openURL(whatsappUrl).catch(() => {
              Alert.alert("Erreur", "WhatsApp n'est pas installé.");
            });
          },
        },
        {
          text: "📧 Email",
          onPress: () => {
            Linking.openURL(
              `mailto:support@spiraleagence.com?subject=Support Stockia&body=${encodeURIComponent(message)}`
            ).catch(() => {
              Alert.alert("Erreur", "Aucune application email trouvée.");
            });
          },
        },
        { text: "Annuler", style: "cancel" },
      ]
    );
  };

  // ============================================
  // 📁 DÉCONNEXION
  // ============================================

  const handleLogout = () => {
    Alert.alert(
      "Déconnexion",
      "Êtes-vous sûr de vouloir vous déconnecter ?",
      [
        { text: "Annuler", style: "cancel" },
        { text: "Se déconnecter", style: "destructive", onPress: logout },
      ]
    );
  };

  // ============================================
  // 📁 RENDU
  // ============================================

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#1565C0" />
        <Text style={styles.loadingText}>Chargement des paramètres...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContainer} showsVerticalScrollIndicator={false}>
        {/* === PROFIL === */}
        <View style={styles.profileCard}>
          <View style={styles.profileAvatar}>
            <Text style={styles.profileAvatarText}>
              {user?.nom?.charAt(0).toUpperCase() || "U"}
            </Text>
          </View>
          <View style={styles.profileInfo}>
            <Text style={styles.profileName}>{user?.nom || "Utilisateur"}</Text>
            <View style={styles.profileRoleBadge}>
              <Text style={styles.profileRoleText}>{user?.role || "Invité"}</Text>
            </View>
            <Text style={styles.profileEmail}>{user?.email || "Aucun email"}</Text>
          </View>
        </View>

        {/* === PRÉFÉRENCES === */}
        <Text style={styles.sectionTitle}>⚙️ Préférences</Text>
        <View style={styles.card}>
          <View style={styles.settingItem}>
            <View style={styles.settingLeft}>
              <Ionicons name="print-outline" size={24} color="#1565C0" />
              <View style={styles.settingText}>
                <Text style={styles.settingLabel}>Imprimante Bluetooth</Text>
                <Text style={styles.settingDesc}>
                  {printEnabled ? "Activée - Tickets imprimés" : "Désactivée - Économie papier"}
                </Text>
              </View>
            </View>
            <Switch
              trackColor={{ false: "#E0E0E0", true: "#90CAF9" }}
              thumbColor={printEnabled ? "#1565C0" : "#f4f3f4"}
              onValueChange={setPrintEnabled}
              value={printEnabled}
            />
          </View>

          <View style={styles.settingItem}>
            <View style={styles.settingLeft}>
              <Ionicons name="moon-outline" size={24} color="#1565C0" />
              <View style={styles.settingText}>
                <Text style={styles.settingLabel}>Mode Sombre</Text>
                <Text style={styles.settingDesc}>Interface adaptée à la nuit</Text>
              </View>
            </View>
            <Switch
              trackColor={{ false: "#E0E0E0", true: "#90CAF9" }}
              thumbColor={settings.darkMode ? "#1565C0" : "#f4f3f4"}
              onValueChange={(value) => updateSettings({ darkMode: value })}
              value={settings.darkMode}
            />
          </View>

          <View style={styles.settingItem}>
            <View style={styles.settingLeft}>
              <Ionicons name="notifications-outline" size={24} color="#1565C0" />
              <View style={styles.settingText}>
                <Text style={styles.settingLabel}>Notifications</Text>
                <Text style={styles.settingDesc}>Alertes de stock et rapports</Text>
              </View>
            </View>
            <Switch
              trackColor={{ false: "#E0E0E0", true: "#90CAF9" }}
              thumbColor={settings.notifications ? "#1565C0" : "#f4f3f4"}
              onValueChange={(value) => updateSettings({ notifications: value })}
              value={settings.notifications}
            />
          </View>

          <View style={styles.settingItem}>
            <View style={styles.settingLeft}>
              <Ionicons name="cloud-upload-outline" size={24} color="#1565C0" />
              <View style={styles.settingText}>
                <Text style={styles.settingLabel}>Sauvegarde automatique</Text>
                <Text style={styles.settingDesc}>Journalière à 2h du matin</Text>
              </View>
            </View>
            <Switch
              trackColor={{ false: "#E0E0E0", true: "#90CAF9" }}
              thumbColor={settings.autoBackup ? "#1565C0" : "#f4f3f4"}
              onValueChange={(value) => updateSettings({ autoBackup: value })}
              value={settings.autoBackup}
            />
          </View>
        </View>

        {/* === DONNÉES === */}
        <Text style={styles.sectionTitle}>💾 Données</Text>
        <View style={styles.card}>
          <View style={styles.dbInfo}>
            <Text style={styles.dbLabel}>Taille de la base</Text>
            <Text style={styles.dbValue}>{dbSize}</Text>
          </View>

          <TouchableOpacity
            style={[styles.actionButton, styles.backupButton]}
            onPress={handleBackup}
            disabled={backupLoading}
          >
            {backupLoading ? (
              <ActivityIndicator size="small" color="#FFF" />
            ) : (
              <>
                <Ionicons name="save-outline" size={20} color="#FFF" />
                <Text style={styles.actionButtonText}>Sauvegarder</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {/* === SÉCURITÉ === */}
        <Text style={styles.sectionTitle}>🔒 Sécurité</Text>
        <View style={styles.card}>
          <TouchableOpacity style={styles.menuItem} onPress={() => setShowPasswordModal(true)}>
            <Ionicons name="key-outline" size={24} color="#1565C0" />
            <Text style={styles.menuItemText}>Changer le mot de passe</Text>
            <Ionicons name="chevron-forward" size={20} color="#CCC" />
          </TouchableOpacity>

          <TouchableOpacity style={[styles.menuItem, styles.menuItemDanger]} onPress={handleLogout}>
            <Ionicons name="log-out-outline" size={24} color="#D32F2F" />
            <Text style={[styles.menuItemText, styles.menuItemTextDanger]}>Déconnexion</Text>
            <Ionicons name="chevron-forward" size={20} color="#CCC" />
          </TouchableOpacity>
        </View>

        {/* === SUPPORT === */}
        <Text style={styles.sectionTitle}>📱 Support</Text>
        <View style={styles.card}>
          <TouchableOpacity style={styles.menuItem} onPress={handleContactSupport}>
            <Ionicons name="headset-outline" size={24} color="#1565C0" />
            <Text style={styles.menuItemText}>Contacter le support</Text>
            <Ionicons name="chevron-forward" size={20} color="#CCC" />
          </TouchableOpacity>

          <TouchableOpacity style={styles.menuItem}>
            <Ionicons name="information-circle-outline" size={24} color="#1565C0" />
            <Text style={styles.menuItemText}>Version 2.1.0</Text>
            <Ionicons name="chevron-forward" size={20} color="#CCC" />
          </TouchableOpacity>
        </View>

        <Text style={styles.footer}>Stockia - Propulsé par Spirale Agence</Text>
      </ScrollView>

      {/* === MODAL CHANGEMENT MOT DE PASSE === */}
      <Modal
        visible={showPasswordModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowPasswordModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Changer mot de passe</Text>
              <TouchableOpacity onPress={() => setShowPasswordModal(false)}>
                <Ionicons name="close" size={24} color="#333" />
              </TouchableOpacity>
            </View>

            <TextInput
              style={styles.modalInput}
              placeholder="Ancien mot de passe"
              secureTextEntry
              value={oldPassword}
              onChangeText={setOldPassword}
            />

            <TextInput
              style={styles.modalInput}
              placeholder="Nouveau mot de passe"
              secureTextEntry
              value={newPassword}
              onChangeText={setNewPassword}
            />

            <TextInput
              style={styles.modalInput}
              placeholder="Confirmer le mot de passe"
              secureTextEntry
              value={confirmPassword}
              onChangeText={setConfirmPassword}
            />

            <TouchableOpacity
              style={[styles.modalConfirmButton, passwordLoading && styles.modalButtonDisabled]}
              onPress={handleChangePassword}
              disabled={passwordLoading}
            >
              {passwordLoading ? (
                <ActivityIndicator size="small" color="#FFF" />
              ) : (
                <Text style={styles.modalConfirmText}>Modifier</Text>
              )}
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
  container: { flex: 1, backgroundColor: "#F8F9FA" },
  scrollContainer: { padding: 16, paddingBottom: 40 },
  loadingContainer: { flex: 1, justifyContent: "center", alignItems: "center" },
  loadingText: { marginTop: 12, color: "#666", fontSize: 14 },

  // === PROFIL ===
  profileCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFF",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#EAEAEA",
    elevation: 1,
  },
  profileAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#E3F2FD",
    justifyContent: "center",
    alignItems: "center",
  },
  profileAvatarText: { fontSize: 24, fontWeight: "bold", color: "#1565C0" },
  profileInfo: { marginLeft: 12, flex: 1 },
  profileName: { fontSize: 16, fontWeight: "bold", color: "#333" },
  profileRoleBadge: {
    backgroundColor: "#E3F2FD",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    alignSelf: "flex-start",
    marginTop: 2,
  },
  profileRoleText: { fontSize: 10, color: "#1565C0", fontWeight: "bold" },
  profileEmail: { fontSize: 12, color: "#666", marginTop: 2 },

  // === SECTIONS ===
  sectionTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#333",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 10,
    marginTop: 16,
  },

  card: {
    backgroundColor: "#FFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#EAEAEA",
    overflow: "hidden",
    marginBottom: 12,
  },

  // === SETTINGS ===
  settingItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#F0F0F0",
  },
  settingLeft: { flexDirection: "row", alignItems: "center", flex: 1 },
  settingText: { marginLeft: 12, flex: 1 },
  settingLabel: { fontSize: 14, fontWeight: "500", color: "#333" },
  settingDesc: { fontSize: 12, color: "#999", marginTop: 2 },

  // === DB ===
  dbInfo: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#F0F0F0",
  },
  dbLabel: { fontSize: 14, color: "#666" },
  dbValue: { fontSize: 14, fontWeight: "bold", color: "#1565C0" },

  // === ACTIONS ===
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: 14,
    gap: 8,
    margin: 14,
    borderRadius: 8,
  },
  backupButton: { backgroundColor: "#2E7D32" },
  actionButtonText: { color: "#FFF", fontSize: 14, fontWeight: "600" },

  // === MENU ===
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#F0F0F0",
    gap: 12,
  },
  menuItemDanger: { borderBottomWidth: 0 },
  menuItemText: { flex: 1, fontSize: 14, color: "#333" },
  menuItemTextDanger: { color: "#D32F2F" },

  // === MODAL ===
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
  modalTitle: { fontSize: 18, fontWeight: "bold", color: "#333" },
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
  modalButtonDisabled: { backgroundColor: "#90CAF9" },
  modalConfirmText: { color: "#FFF", fontWeight: "bold", fontSize: 15 },

  footer: { textAlign: "center", fontSize: 11, color: "#999", marginTop: 16 },
});

export default SettingsScreen; 