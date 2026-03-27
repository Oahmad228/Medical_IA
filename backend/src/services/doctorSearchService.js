const { normalize } = require("../utils/normalize");

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const OVERPASS_URL = "https://overpass-api.de/api/interpreter";
const USER_AGENT = "MedicalAI/1.0 (contact: support@medical-ai.local)";

/**
 * [Module: src/services/doctorSearchService.js] geocodeLocation
 * Resolves a human-readable location into lat/lon coordinates using Nominatim.
 */
async function geocodeLocation(near) {
  const url = new URL(NOMINATIM_URL);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "1");
  url.searchParams.set("q", String(near || "").trim());

  const response = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error(`Nominatim error (${response.status})`);
  }

  const payload = await response.json();
  const first = Array.isArray(payload) ? payload[0] : null;
  if (!first?.lat || !first?.lon) return null;

  return {
    lat: Number(first.lat),
    lon: Number(first.lon),
    label: first.display_name || null,
  };
}

/**
 * [Module: src/services/doctorSearchService.js] buildAddress
 * Formats an address string from OpenStreetMap tags.
 */
function buildAddress(tags, fallback) {
  const parts = [];
  if (tags["addr:housenumber"]) parts.push(tags["addr:housenumber"]);
  if (tags["addr:street"]) parts.push(tags["addr:street"]);
  if (tags["addr:city"]) parts.push(tags["addr:city"]);
  if (tags["addr:postcode"]) parts.push(tags["addr:postcode"]);
  const built = parts.filter(Boolean).join(" ").trim();
  return built || fallback || "Adresse non disponible";
}

/**
 * [Module: src/services/doctorSearchService.js] matchesSpecialist
 * Checks if an OSM element matches the requested specialist.
 */
function matchesSpecialist(tags, specialist) {
  const needle = normalize(specialist || "").trim();
  if (!needle) return true;

  const haystack = normalize(
    [
      tags.name,
      tags.amenity,
      tags.healthcare,
      tags.speciality,
      tags["healthcare:speciality"],
      tags["healthcare:provider"],
    ]
      .filter(Boolean)
      .join(" ")
  );

  return haystack.includes(needle);
}

/**
 * [Module: src/services/doctorSearchService.js] searchDoctorsFromOSM
 * Searches for nearby doctors using OpenStreetMap (Nominatim + Overpass).
 */
async function searchDoctorsFromOSM({ specialist, near, radiusMeters = 5000 }) {
  const geo = await geocodeLocation(near);
  if (!geo) return [];

  const query = [
    "[out:json][timeout:25];(",
    `  node["healthcare"~"doctor|clinic"](around:${radiusMeters},${geo.lat},${geo.lon});`,
    `  way["healthcare"~"doctor|clinic"](around:${radiusMeters},${geo.lat},${geo.lon});`,
    `  relation["healthcare"~"doctor|clinic"](around:${radiusMeters},${geo.lat},${geo.lon});`,
    `  node["amenity"~"doctors|clinic"](around:${radiusMeters},${geo.lat},${geo.lon});`,
    `  way["amenity"~"doctors|clinic"](around:${radiusMeters},${geo.lat},${geo.lon});`,
    `  relation["amenity"~"doctors|clinic"](around:${radiusMeters},${geo.lat},${geo.lon});`,
    ");",
    "out center 20;",
  ].join("\n");

  const response = await fetch(OVERPASS_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": USER_AGENT,
      Accept: "application/json",
    },
    body: `data=${encodeURIComponent(query)}`,
  });

  if (!response.ok) {
    throw new Error(`Overpass error (${response.status})`);
  }

  const payload = await response.json();
  const elements = Array.isArray(payload?.elements) ? payload.elements : [];

  const mapped = elements
    .map((el) => {
      const tags = el.tags || {};
      if (!matchesSpecialist(tags, specialist)) return null;

      const lat = el.lat ?? el.center?.lat;
      const lon = el.lon ?? el.center?.lon;
      const name = tags.name || "Cabinet medical";
      const address = buildAddress(tags, geo.label);
      const phone = tags.phone || tags["contact:phone"] || null;

      return {
        name,
        address,
        phone,
        rating: null,
        lat: typeof lat === "number" ? lat : null,
        lon: typeof lon === "number" ? lon : null,
      };
    })
    .filter(Boolean);

  return mapped.slice(0, 6);
}

module.exports = { searchDoctorsFromOSM };
