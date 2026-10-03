# Profils de démonstration

Profils fictifs générés avec [Persona](https://github.com/Osiris-Balonga/persona), API v2 `https://persona-dev.onrender.com`. Nationalité et résidence : Congo (`CG`). La date de référence est le 3 octobre 2026 ; chaque enveloppe conserve les paramètres de replay et versions dans `meta`.

- Patients : 6 par groupe `child`, `teen`, `adult`, `senior`, avec 3 profils féminins et 3 masculins par groupe.
- Médecins : 12 profils, 6 féminins et 6 masculins. Chaque groupe sélectionne 2 profils de 28–40 ans, 2 de 41–55 ans et 2 de 56–70 ans parmi 30 résultats Persona. `selection` documente ce filtre local.
- Les portraits Persona sont synthétiques et correspondent à la sélection d'âge du générateur. Les adresses sont illustratives ; aucune adresse de cabinet réel n'est affirmée.

Le seed conserve les dates de naissance dans `User.birthDate`, les portraits dans `avatarUrl` et les villes des médecins. Les numéros Persona de repli peuvent être attribués à de vrais abonnés : ils restent dans les fixtures de source et ne sont pas importés dans `User.phone`. Persona utilise `--email-domain yopmail.com` pour permettre la récupération manuelle des OTP de démonstration. Ces boîtes sont publiques et réservées aux données fictives. Les enfants et adolescents sont uniquement des données de démonstration ; aucun parcours de représentant légal n'est implémenté.

Les comptes sont listés dans [docs/demo-accounts.md](../../docs/demo-accounts.md). La connexion nécessite un expéditeur Resend sur un domaine validé : `onboarding@resend.dev` ne peut pas envoyer aux adresses Yopmail. Aucun mécanisme ne contourne la vérification OTP.

`npm run db:seed` utilise normalement Neon development. En production, le seed exige le paramètre explicite `--production` après vérification de la base cible ; il n'est jamais lancé au build ou au démarrage Render. Il ajoute ou met à jour les profils des fixtures, conserve les autres comptes, crée les horaires et créneaux à venir, puis les scénarios de demandes. Une réexécution le même jour ne crée pas de doublons. Les scénarios existants ne sont pas remis à zéro ; relancer un autre jour ajoute les nouveaux créneaux nécessaires.

Pour une démonstration en production expressément autorisée, avec un fichier local `.env.production` qui pointe sur Neon production et contient `NODE_ENV=production` :

```sh
node --env-file=.env.production node_modules/prisma/build/index.js migrate deploy
node --env-file=.env.production prisma/seed.js --production
```

Pour régénérer une fixture, utiliser le CLI Persona local, sans l'ajouter aux dépendances de l'application :

```sh
persona people --count 3 --nationality CG --residence-country CG --age-group child --gender female --seed meditime-patients-child-female --as-of 2026-10-03 --email-domain yopmail.com --output prisma/fixtures/patients-child-female.json
```

Changer le groupe et le genre pour les autres patients. Pour les médecins, demander `--count 30 --age-group adult,senior`, puis conserver deux profils par tranche indiquée ci-dessus. Les comptes sont reconnus par leur identifiant Persona stable : changer uniquement le domaine de l'email conserve leur identifiant en base et leurs relations. Changer les paramètres qui déterminent l'identité peut créer de nouveaux comptes.
