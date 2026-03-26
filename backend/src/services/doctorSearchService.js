const { GOOGLE_MAPS_API_KEY, AI_MODE } = require("../config/env");

/**
 * [Module: src/services/doctorSearchService.js] getMockDoctors
 * Returns fallback doctor suggestions when Google Places is disabled.
 */
function getMockDoctors(specialist, near) {
  return [
    {
      name: `Cabinet ${specialist} Centre`,
      address: near ? `${near} - Centre` : "Centre-ville",
      phone: "+212 5 22 00 00 01",
      rating: 4.6,
    },
    {
      name: `Clinique ${specialist} Horizon`,
      address: near ? `${near} - Quartier Nord` : "Quartier Nord",
      phone: "+212 5 22 00 00 02",
      rating: 4.4,
    },
    {
      name: `Dr. ${specialist} Atlas`,
      address: near ? `${near} - Quartier Sud` : "Quartier Sud",
      phone: "+212 5 22 00 00 03",
      rating: 4.2,
    },
  ];
}

/**
 * [Module: src/services/doctorSearchService.js] searchDoctorsFromGoogle
 * Queries Google Places API for doctors near a location.
 */
async function searchDoctorsFromGoogle({ specialist, near }) {
  if (AI_MODE !== "live" || !GOOGLE_MAPS_API_KEY) {
    throw new Error("Google Places indisponible.");
  }

  const query = `${specialist} pres de ${near}`;

  const url = new URL("https://maps.googleapis.com/maps/api/place/textsearch/json");
  url.searchParams.set("query", query);
  url.searchParams.set("type", "doctor");
  url.searchParams.set("key", GOOGLE_MAPS_API_KEY);

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Google Places request failed (${response.status})`);
  }

  const payload = await response.json();
  if (!Array.isArray(payload?.results)) return [];

  return payload.results.slice(0, 6).map((place) => ({
    name: place.name,
    address: place.formatted_address,
    rating: place.rating,
    phone: null,
  }));
}

module.exports = { getMockDoctors, searchDoctorsFromGoogle };
