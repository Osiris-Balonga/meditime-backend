# Annuaire, planning et rendez-vous

Préfixe `/api/v1`. Dates/heures de créneaux ISO UTC, dates de planning `YYYY-MM-DD` dans le fuseau du médecin. Les routes privées utilisent le cookie de session ; écritures avec `X-CSRF-Token`. Aucun identifiant de patient ou de médecin arbitraire ne remplace la session.

| Route | Entrée | Réponse |
| --- | --- | --- |
| GET `/specialties` | — | `{specialties:[{id,slug,name}]}` |
| GET `/doctors` | `q`, `city`, `specialtyId`, `page=1`, `limit=20` (max 50), `availableBefore` ISO facultatif | `{doctors, pagination:{page,limit,total}}` |
| GET `/doctors/:id` | UUID | `{doctor}` |
| GET `/doctors/:id/slots` | `from`, `to` dates inclusives ; max 56 jours, 7 par défaut | `{timezone,slots}` |
| GET `/me/doctor/availability` | — | `{timezone,consultationMinutes,ranges}` |
| PUT `/me/doctor/availability` | `{ranges:[{weekday:1..7,startMinute,endMinute}]}` ; lundi=1, dimanche=7 | Même réponse que GET ; génération sur huit semaines |
| GET `/me/doctor/planning` | `from`, `to` dates | `{timezone,slots,exceptions}` ; données privées du médecin |
| POST `/me/doctor/exceptions` | `{date,type,startMinute?,endMinute?,consultationMinutes?}` | 201 `{exception}` |
| DELETE `/me/doctor/exceptions/:id` | — | 204 |
| POST `/appointments` | `{slotId,reason?}` ; motif max 1000 caractères | 201 `{appointment}` |
| GET `/me/appointments` | `status`, `from`, `to` ISO ; `page`, `limit` | `{appointments,pagination}` |
| GET `/me/doctor/appointments` | Mêmes filtres | Même enveloppe, médecin propriétaire seulement |
| GET `/appointments/:id` | UUID | `{appointment}`, patient ou médecin concerné |
| POST `/appointments/:id/accept` ou `/decline` | `{}` | `{appointment}` |
| PATCH `/appointments/:id/cancel` | `{}` | `{appointment}` ; patient propriétaire, pending uniquement |
| GET `/me/dashboard` | `mode=patient|doctor` | `{mode,timezone,date,counts:{pending,confirmed,declined,cancelled,past,today},upcoming}` |

Un médecin public contient `id`, cabinet/adresse/ville, `timezone`, `consultationMinutes`, `specialty:{id,slug,name}`, `user:{firstName,lastName,avatarUrl}`. La recherche ajoute `nextAvailableSlot` ou null. Aucune note ou distance fabriquée.

Créneau : `{id,startsAt,endsAt,status,source}`, statut `available|blocked|occupied`. Le planning privé ajoute `appointment` ou null, avec nom patient et motif. Une demande pending ne réserve pas le créneau.

Demande : `{id,status,reason,decisionCode,createdAt,decidedAt,patient:{id,firstName,lastName,avatarUrl},slot:{id,startsAt,endsAt,doctor},isPast}`. Statuts JSON minuscules `pending|confirmed|declined|cancelled`. Le filtre `past` sélectionne les confirmations terminées ; `confirmed` les confirmations non terminées. Une pending expirée devient cancelled avec `REQUEST_EXPIRED` lors de la lecture ou décision.

Exceptions : `BLOCK_DAY` sans minutes ; `BLOCK_INTERVAL` avec début/fin ; `ADD_INTERVAL` avec début/fin et durée facultative. Les exceptions sont limitées aux huit semaines futures. Les chevauchements sont refusés. Un blocage décline les pending avec `SLOT_BLOCKED` mais ne touche pas une confirmed ; une reconfiguration ne déplace aucune demande existante. Suppression/reconfiguration et décisions utilisent un verrou commun du médecin.

Les anciennes URLs `/appointments/me`, `/doctor/appointments`, PATCH `/appointments/:id/confirm|decline`, `/dashboard/patient|doctor` et `/doctor/exceptions` sont conservées comme adaptations du même service métier. Leurs réponses sont enveloppées dans `data` (sauf l'annulation). Les nouveaux clients utilisent le tableau ci-dessus ; les anciennes formes de données ne sont pas garanties. Le suivi reste réservé aux comptes authentifiés, sans code de suivi anonyme.

Erreurs utiles : 400 `INVALID_INPUT`, `INVALID_DATE_RANGE`, `INTERVAL_TOO_SHORT` ; 403 `DOCTOR_ACCESS_REQUIRED` ; 404 ressources inaccessibles ; 409 `PROFILE_INCOMPLETE`, `DUPLICATE_REQUEST`, `SLOT_UNAVAILABLE`, `APPOINTMENT_CONFLICT`, `SLOT_TAKEN`, `OVERLAPPING_INTERVALS`, `PLANNING_HAS_APPOINTMENTS`, `AMBIGUOUS_LOCAL_TIME`. Recharger créneaux/listes après un conflit ou une mutation. La durée habituelle se modifie par PATCH `/me/doctor-profile`, uniquement lorsque le planning existant permet ce changement.
