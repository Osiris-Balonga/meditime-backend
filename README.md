# MediTime Backend

API de gestion des disponibilités des médecins et des demandes de rendez-vous.

## Stack

Node.js, Express, Prisma ORM et PostgreSQL sur Neon. Le backend sera déployé sur Render.

Le dépôt est initialisé pour le développement en équipe. Le démarrage de l'application et le schéma Prisma sont à implémenter dans les issues du dépôt.

## Fonctionnalités prévues

- Authentification par code email et Google, sans mot de passe.
- Compte unique avec modes patient et médecin.
- Recherche de médecins et consultation des disponibilités.
- Planning hebdomadaire et exceptions ponctuelles.
- Envoi, suivi, confirmation et refus des demandes de rendez-vous.

## Contribution

Créer une branche `feature/*`, `fix/*`, `chore/*`, `docs/*` ou `refactor/*` depuis `dev`, puis ouvrir une pull request vers `dev`. Les mises en production passent par une pull request de `dev` vers `main`.

Les pushes directs, force pushes et suppressions de `dev` et `main` sont interdits. Les pull requests doivent provenir de ce dépôt.

Chaque issue précise le travail attendu et ses critères de recette manuelle. La validation se fait par lancement local, requêtes HTTP et parcours utilisateur, sans suite de tests automatisés.

Ne jamais ajouter de secrets ou de données de patients réels. Les fichiers `.env` restent locaux ; les données de démonstration sont fictives.
