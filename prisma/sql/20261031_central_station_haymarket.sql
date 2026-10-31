-- Central Station events were stored as Glebe because the City of Sydney
-- event suburb tag disagrees with the venue. The venue record on
-- whatson.cityofsydney.nsw.gov.au says "Central, Haymarket NSW 2000".
-- The venue pin reverse-geocodes to the North-South concourse, Haymarket NSW 2000
-- (Nominatim), which is the same point the venue publishes.
UPDATE "Event"
SET
  "venueAddress" = 'Central, Haymarket NSW 2000',
  suburb = 'Haymarket',
  latitude = -33.883581,
  longitude = 151.206008
WHERE source = 'cityofsydney'
  AND "venueName" = 'Central Station'
  AND (
    "venueAddress" = 'Glebe, NSW'
    OR suburb = 'Glebe'
    OR suburb IS NULL
  );
