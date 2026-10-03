# Authentification et profils

Préfixe `/api/v1`. Corps JSON stricts : les champs inconnus sont refusés. Les erreurs ont la forme `{ "error": { "code": "...", "message": "..." } }`, avec `fields` pour une entrée invalide. Aucun corps JSON ne contient le code OTP ni le jeton de session brut, transmis uniquement par cookie HttpOnly.

| Méthode et chemin | Corps | Résultat |
| --- | --- | --- |
| POST `/auth/email/request` | `email` | 202, message, `expiresIn: 600`, `resendAfter: 60` |
| POST `/auth/email/verify` | `email`, `code` (chaîne de six chiffres) | 200, session et profil |
| POST `/auth/google` | `credential` (ID token fourni par Google Identity Services) | 200, même session et profil |
| POST `/auth/logout` | `{}` | 204, révocation et suppression du cookie |
| GET `/me` | aucun | 200, profil, modes et `csrfToken` |
| PATCH `/me` | `firstName`, `lastName`, `phone` facultatif/null | 200, profil mis à jour |
| GET `/me/doctor-profile` | aucun | 200, `doctorProfile` du médecin connecté |
| PATCH `/me/doctor-profile` | champs ci-dessous | 200, `doctorProfile` mis à jour |

Une connexion retourne `user` (`id`, `email`, `firstName`, `lastName`, `phone`, `avatarUrl`, `profileCompleted`), `allowedModes`, `doctorProfileId`, `csrfToken` et `expiresAt`. `GET /me` retourne les mêmes informations sauf `expiresAt`. Compléter les deux noms via PATCH marque le profil comme terminé ; le téléphone reste facultatif.

Le cookie de session opaque est HttpOnly, valable sept jours et révocable. Il est nommé `meditime_session` en local et `__Host-meditime_session` en production. Aucun token n'est stocké dans localStorage. Utiliser `credentials: 'include'` et `Content-Type: application/json` côté frontend. Les origines des écritures sont contrôlées, en plus de CORS.

Sur les PATCH, logout et les nouvelles connexions effectuées alors qu'une session est déjà active, ajouter `X-CSRF-Token` avec la valeur reçue à la connexion ou via GET /me. Après une nouvelle connexion, remplacer cette valeur : l'ancienne session est révoquée. Un cookie expiré donne 401 sur les routes privées ; logout reste idempotent en l'absence de session.

OTP : expiration dix minutes, cinq tentatives par code, renvoi après soixante secondes et maximum cinq envois par email par heure. Un renvoi invalide le précédent code. Limites IP : dix demandes de code et trente vérifications/connexions Google en dix minutes. Les compteurs email sont persistés ; les compteurs IP sont en mémoire du service.

Google : la bibliothèque officielle vérifie signature, audience, émetteur et expiration. L'identité est liée par `sub`. Un email déjà présent ne fusionne jamais les comptes automatiquement : sur `EMAIL_VERIFICATION_REQUIRED`, se connecter d'abord par OTP à cette adresse, puis renvoyer `credential` avec le cookie et le header CSRF. Une identité déjà liée à un autre compte donne `GOOGLE_ACCOUNT_CONFLICT`. Une adresse Google externe à Gmail/Workspace exige aussi cette vérification OTP avant sa première liaison.

Le profil médecin accepte uniquement `specialtyId` (UUID existant), `practiceName`, `address`, `city`, `postalCode` facultatif/null, `timezone` (IANA), `consultationMinutes` (5–120, multiple de 5). Au moins un champ est nécessaire pour chaque PATCH. Les champs `userId`, `isApproved`, `published` ou les rôles ne sont pas modifiables par ces routes. Sans habilitation interne, elles donnent 403. Un changement de durée/fuseau avec des créneaux à venir donne 409 `PLANNING_CHANGE_REQUIRED` et ne déplace aucun rendez-vous.

Les routes privées des autres modules utilisent les middlewares dans cet ordre : `requireSession`, puis `requireDoctor` si nécessaire, puis `requireCsrf` pour une écriture. Le propriétaire provient de `req.auth`. Dans une transaction qui modifie planning ou demandes, appeler `lockDoctor(tx, doctorId)` avant de lire les créneaux.

Configuration Resend : utiliser une clé d'envoi et un expéditeur autorisé. En développement sans domaine validé, les destinataires possibles dépendent des restrictions du compte Resend. Ne pas publier de clé ni envoyer d'email à partir du seed. Les paramètres email/Google et le parcours navigateur réel doivent être validés avant la recette complète de #12.
