import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const OURAIRPORTS_URL =
  "https://davidmegginson.github.io/ourairports-data/airports.csv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_PATH = path.join(__dirname, "../data/airports-us.generated.json");

const ALLOWED_TYPES = new Set([
  "large_airport",
  "medium_airport",
  "small_airport",
]);

function normalizeCode(value) {
  const code = String(value || "").trim().toUpperCase();
  return code.length > 0 ? code : null;
}

function parseStateFromRegion(isoRegion) {
  if (!isoRegion) return null;
  const parts = isoRegion.split("-");
  return parts.length >= 2 ? parts[1].toUpperCase() : null;
}

function splitCsvLine(line) {
  const result = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      result.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  result.push(current);
  return result;
}

function parseCsv(content) {
  const lines = content.split(/\r?\n/).filter(Boolean);
  if (lines.length === 0) return [];

  const headers = splitCsvLine(lines[0]);
  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    const values = splitCsvLine(lines[i]);
    const row = {};
    headers.forEach((header, index) => {
      row[header] = values[index] ?? "";
    });
    rows.push(row);
  }

  return rows;
}

function mapRow(row) {
  if (row.iso_country !== "US") return null;

  const type = row.type || "";
  const iata = normalizeCode(row.iata_code);

  if (!ALLOWED_TYPES.has(type)) return null;
  if (!iata && type === "small_airport") return null;

  const latitude = Number(row.latitude_deg);
  const longitude = Number(row.longitude_deg);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

  const airportCode = iata || row.ident?.toUpperCase();
  if (!airportCode) return null;

  return {
    airportCode,
    iata,
    icao: normalizeCode(row.gps_code) || normalizeCode(row.ident),
    name: row.name,
    city: row.municipality || null,
    state: parseStateFromRegion(row.iso_region),
    country: "US",
    latitude,
    longitude,
    timezone: null,
    airportType: type,
    keywords: row.keywords || null,
    isActive: true,
  };
}

function dedupeRecords(records) {
  const byCode = new Map();

  for (const record of records) {
    const existing = byCode.get(record.airportCode);
    if (!existing) {
      byCode.set(record.airportCode, record);
      continue;
    }

    const score = (r) =>
      (ri.iata ? 2 : 0) +
      (r.airportType === "large_airport"
        ? 3
        : r.airportType === "medium_airport"
          ? 2
          : 1);

    if (score(record) >= score(existing)) {
      byCode.set(record.airportCode, record);
    }
  }

  return [...byCode.values()].sort((a, b) =>
    a.airportCode.localeCompare(b.airportCode),
  );
}

async function main() {
  console.log("Downloading OurAirports CSV...");
  const response = await fetch(OURAIRPORTS_URL);
  if (!response.ok) {
    throw new Error(`Failed to download OurAirports CSV: HTTP ${response.status}`);
  }

  const csv = await response.text();
  const rows = parseCsv(csv);

  const mapped = rows
    .map((row) => mapRow(row))
    .filter((record) => record !== null);

  const records = dedupeRecords(mapped);

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(records, null, 2),);

  console.log(`Wrote ${records.length} US airports to ${OUTPUT_PATH}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});