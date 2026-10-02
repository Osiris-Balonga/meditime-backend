-- A pending request does not reserve the slot. Only one request can be confirmed.
CREATE UNIQUE INDEX "AppointmentRequest_one_confirmation_per_slot"
ON "AppointmentRequest" ("slotId") WHERE "status" = 'confirmed';

CREATE UNIQUE INDEX "AppointmentRequest_one_active_per_patient_slot"
ON "AppointmentRequest" ("patientId", "slotId") WHERE "status" IN ('pending', 'confirmed');

ALTER TABLE "Slot" ADD CONSTRAINT "Slot_positive_duration"
CHECK ("endsAt" > "startsAt");

ALTER TABLE "DoctorProfile" ADD CONSTRAINT "DoctorProfile_consultation_duration"
CHECK ("consultationMinutes" BETWEEN 5 AND 120 AND "consultationMinutes" % 5 = 0);

ALTER TABLE "WeeklyAvailability" ADD CONSTRAINT "WeeklyAvailability_valid_range"
CHECK ("weekday" BETWEEN 1 AND 7 AND "startMinute" >= 0
AND "endMinute" <= 1440 AND "startMinute" < "endMinute");

ALTER TABLE "AvailabilityException" ADD CONSTRAINT "AvailabilityException_valid_range"
CHECK (("type" = 'BLOCK_DAY' AND "startMinute" IS NULL AND "endMinute" IS NULL)
OR ("type" IN ('BLOCK_INTERVAL', 'ADD_INTERVAL') AND "startMinute" IS NOT NULL
AND "endMinute" IS NOT NULL AND "startMinute" >= 0 AND "endMinute" <= 1440
AND "startMinute" < "endMinute"));

ALTER TABLE "AvailabilityException" ADD CONSTRAINT "AvailabilityException_valid_duration"
CHECK ("consultationMinutes" IS NULL OR
("consultationMinutes" BETWEEN 5 AND 120 AND "consultationMinutes" % 5 = 0));

ALTER TABLE "EmailChallenge" ADD CONSTRAINT "EmailChallenge_valid_expiry"
CHECK ("expiresAt" > "createdAt" AND "attempts" >= 0);

ALTER TABLE "Session" ADD CONSTRAINT "Session_valid_expiry"
CHECK ("expiresAt" > "createdAt");
