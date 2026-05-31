import { airportLookupService } from './lookupService';

/**
 * Server-only: refresh in-memory airport lookup from Postgres `airports` table.
 * Falls back silently when DATABASE_URL / LOCAL_DATABASE_URL is missing or query fails.
 */
export async function refreshFromDatabase(): Promise<boolean> {
  const connectionString =
    process.env.DATABASE_URL || process.env.LOCAL_DATABASE_URL;

  if (!connectionString) return false;

  try {
    const { Pool } = await import('pg');
    const pool = new Pool({
      connectionString,
      ssl: { rejectUnauthorized: false },
      max: 1,
    });

    const result = await pool.query<{
      airport_code: string;
      iata: string | null;
      icao: string | null;
      name: string;
      city: string | null;
      state: string | null;
      country: string;
      latitude: number;
      longitude: number;
      timezone: string | null;
      airport_type: string | null;
      keywords: string | null;
      is_active: boolean;
    }>(
      `
        select
          airport_code,
          iata,
          icao,
          name,
          city,
          state,
          country,
          latitude,
          longitude,
          timezone,
          airport_type,
          keywords,
          is_active
        from airports
        where is_active = true and country = 'US'
        order by airport_code
        `,
    );

    await pool.end();

    if (result.rows.length === 0) return false;

    airportLookupService.loadRecords(
      result.rows.map((row) => ({
        airportCode: row.airport_code,
        iata: row.iata,
        icao: row.icao,
        name: row.name,
        city: row.city,
        state: row.state,
        country: row.country,
        latitude: row.latitude,
        longitude: row.longitude,
        timezone: row.timezone,
        airportType: row.airport_type,
        keywords: row.keywords,
        isActive: row.is_active,
      })),
    );

    return true;
  } catch (error) {
    console.warn('AirportLookupService database refresh failed', error);
    return false;
  }
}
