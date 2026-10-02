# MediTime Backend

API de gestion des disponibilités des médecins et des demandes de rendez-vous.

## Stack

Node.js, Express, Prisma ORM et PostgreSQL sur Neon. Le backend sera déployé sur Render.

Le socle Express, le client Prisma, les migrations et les données fictives sont disponibles. Les routes métier restent à implémenter dans les issues.

## Démarrer

Avec Node.js 24, depuis la branche `dev` :

```sh
npm ci
cp .env.example .env
# Renseigner les deux URL de la branche Neon development.
npm run db:generate
npm run db:deploy
npm run db:seed
npm run dev
```

API locale : `http://localhost:3001`. `GET /health` vérifie le serveur ; `GET /ready` vérifie aussi PostgreSQL. Les futures routes sont sous `/api/v1`.

`DATABASE_URL` utilise le host Neon avec `-pooler` ; `DIRECT_DATABASE_URL` utilise le host direct pour les migrations. Copier les URL depuis Neon avec leurs paramètres SSL. `FRONTEND_ORIGINS` contient les origines frontend autorisées, séparées par des virgules. Ne jamais utiliser la base de production en local.

## Organisation du code

- `src/routes/` : routes séparées par module ; ajouter les contrôleurs/services du même module dans `src/controllers/` et `src/services/`.
- `src/lib/prisma.js` : client partagé, à importer dans les services.
- `src/config/` et `src/middlewares/` : configuration et erreurs communes.
- `prisma/` : schéma, migrations versionnées et seed fictif réservé au développement.

Pour changer le schéma, se coordonner avec le responsable des migrations, puis utiliser `npm run db:migrate -- --name description`. Ne pas modifier une migration déjà appliquée et ne pas utiliser `db push` sur les bases partagées. Après récupération d'une branche : `npm run db:generate` puis `npm run db:deploy`. `npm run db:studio` permet de consulter la base locale configurée.

## Répartition à trois

| Personne | Branche | Issues |
| --- | --- | --- |
| 1 | `feature/auth-profiles` | #3 code email, #4 Google, #5 profils et habilitations |
| 2 | `feature/doctors-availability` | #6 recherche, #7 horaires, #8 exceptions |
| 3 | `feature/appointments-dashboard` | #9 demandes, #10 décisions, #11 tableaux de bord |

La personne 3 coordonne aussi les migrations et l'intégration frontend (#12), avec les deux autres. Valider ensemble les formats des endpoints avant de commencer. Chaque PR reste limitée à une issue.

Un profil médecin ne donne des droits que s'il est approuvé. Les dates des créneaux sont stockées en UTC ; les horaires hebdomadaires utilisent le fuseau du médecin et les jours 1=lundi à 7=dimanche. Plusieurs demandes peuvent être en attente sur un créneau ; une seule peut être confirmée. Les index SQL garantissent cette unicité ; les décisions et modifications du planning doivent utiliser une transaction. Les enums Prisma sont en majuscules, à convertir en statuts minuscules dans l'API. « Passé » se déduit de la date.

## Déploiement

Render déploie uniquement `main`, en région Frankfurt. Build : `npm ci && npm run build && npm run db:deploy` ; démarrage : `npm start`. Le fichier `render.yaml` décrit la configuration. La migration s'exécute au build sur l'offre gratuite.

Les secrets Render pointent vers Neon **production** ; le seed n'y est jamais exécuté. Après déploiement, vérifier `/ready`. Ajouter l'origine du frontend déployé à `FRONTEND_ORIGINS` lors de l'intégration. Les paramètres Google et email seront renseignés avec les modules d'authentification.

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
