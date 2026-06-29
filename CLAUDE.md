# 🏪 Stockia - Gestion Commerciale Intelligente

[![Version](https://img.shields.io/badge/version-2.1.0-blue.svg)](https://github.com/yourusername/stockia)
[![Platform](https://img.shields.io/badge/platform-Android%20%7C%20iOS-green.svg)](https://expo.dev)
[![License](https://img.shields.io/badge/license-Proprietary-red.svg)](./LICENSE)
[![Build](https://github.com/yourusername/stockia/actions/workflows/build-android.yml/badge.svg)](https://github.com/yourusername/stockia/actions)

---

## 📋 Description

**Stockia** est une application de gestion commerciale intelligente conçue pour les **boutiques, magasins, pharmacies, supérettes et commerces de proximité**. Elle offre une solution complète pour la gestion des ventes, du stock, des clients et des statistiques, le tout en **mode hors-ligne**.

---

## ✨ Fonctionnalités Principales

### 💰 Gestion de Caisse
- Panier d'achat intuitif avec ajout/retrait de produits
- Scan de codes-barres pour une saisie rapide
- Plusieurs modes de paiement (Espèces, Mobile Money, Carte, Chèque)
- Gestion des remises (Pourcentage ou montant fixe)
- Promotions automatiques sur les produits
- Points de fidélité pour les clients
- **Impression de tickets via Bluetooth**
- Monnaie rendue calculée automatiquement
- Facturation avec numéro de facture unique

### 📦 Gestion de Stock
- Catalogue produits complet (nom, catégorie, prix, stock)
- Approvisionnement avec saisie de lots et dates d'expiration
- Alertes de stock minimum (seuil personnalisable)
- Historique des mouvements (entrées, sorties, ajustements)
- Ajustement de stock pour corrections
- Gestion des emplacements de rangement
- Valeur totale du stock calculée en temps réel
- Export/Import des produits en CSV

### 📊 Tableau de Bord & Analytique
- Indicateurs de performance (CA, bénéfices, ventes)
- Graphiques d'évolution des ventes
- Top produits les plus vendus
- Top clients les plus fidèles
- Répartition des ventes par catégorie
- Taux de conversion clients/ventes
- Objectif journalier avec barre de progression
- Alertes personnalisées (stock, activités)

### 👤 Gestion des Clients
- Fiche client complète (nom, téléphone, email, adresse)
- Points de fidélité automatiques
- Historique des achats par client
- Gestion des dettes et suivi des paiements
- Top clients par montant d'achat
- Export de la base clients

### 🔐 Gestion des Utilisateurs (RBAC)
- 4 rôles : Admin, Gérant, Caissier, Magasinier
- Permissions granulaires par rôle
- Authentification biométrique (empreinte / Face ID)
- Sessions sécurisées avec tokens
- Journal des activités (audit logs)
- Changement de mot de passe sécurisé

### 📈 Rapports & Statistiques
- Rapports de ventes personnalisables
- Rapports de stock (inventaire, mouvements)
- Rapports financiers (CA, bénéfices, marges)
- Export JSON des rapports
- Filtres par période, catégorie, client

### 🖨️ Impression Bluetooth
- Impression de tickets de caisse
- Format 58mm/80mm personnalisable
- Aperçu du ticket avant impression
- Impression de test pour vérifier la connexion
- Sauvegarde des tickets en PDF
- Partage des tickets via WhatsApp/Email

### 💳 Gestion des Crédits
- Création de dettes pour les clients
- Suivi des paiements échelonnés
- Historique des remboursements
- Alertes de dettes impayées
- Intérêts et pénalités configurables

### 🔧 Paramètres & Configuration
- Sauvegarde/Restauration de la base de données
- Nettoyage des données obsolètes
- Gestion de la licence logicielle
- Contact support via WhatsApp
- Mode sombre/clair
- Notifications configurables
- Devise personnalisable

---

## 🛠️ Technologies Utilisées

| Technologie | Version | Description |
|-------------|---------|-------------|
| **React Native** | 0.79.6 | Framework mobile |
| **Expo** | ~53.0.0 | Plateforme de développement |
| **TypeScript** | 5.8.3 | Langage typé |
| **SQLite** | ~15.2.0 | Base de données locale |
| **React Navigation** | ^7.0.0 | Navigation |
| **Chart Kit** | ^6.12.0 | Graphiques |
| **Bluetooth** | ^0.0.8 | Impression ESC/POS |

---

## 📱 Prérequis

- Node.js 18+
- npm ou yarn
- Expo CLI
- Android Studio (pour l'émulateur)
- Git

---

## 🚀 Installation

### 1️⃣ Cloner le projet

```bash
git clone https://github.com/yourusername/stockia.git
cd stockia
