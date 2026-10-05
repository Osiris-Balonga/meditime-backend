CREATE INDEX "WeeklyAvailability_doctorId_weekday_startMinute_endMinute_idx"
ON "WeeklyAvailability"("doctorId", "weekday", "startMinute", "endMinute");
