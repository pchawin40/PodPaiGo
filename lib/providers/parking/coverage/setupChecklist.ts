export type SetupChecklistItem = {
  id: string;
  title: string;
  local: string[];
  production: string[];
  verify: string;
};

export type ProviderSetupChecklist = {
  title: string;
  items: SetupChecklistItem[];
};

export function getProviderSetupChecklist(): ProviderSetupChecklist {
  return {
    title: 'Parking provider activation checklist',
    items: [
      {
        id: 'google-maps-server-key',
        title: 'GOOGLE_MAPS_SERVER_API_KEY',
        local: [
          'Create/use a Google Cloud project with Places API (New) enabled.',
          'Create a server API key restricted to Places API + your dev origins/IP.',
          'Add to `.env.local`: GOOGLE_MAPS_SERVER_API_KEY=your_key',
          'Keep NEXT_PUBLIC_GOOGLE_MAPS_API_KEY separate (client map UI only).',
        ],
        production: [
          'Add GOOGLE_MAPS_SERVER_API_KEY to Vercel/hosting environment variables.',
          'Restrict key to server IPs or use API restrictions (Places API only).',
          'Redeploy after setting the variable.',
        ],
        verify: 'Diagnostics page shows Google Places status ≠ Missing Config; google provider returns results > 0.',
      },
      {
        id: 'database-url',
        title: 'DATABASE_URL',
        local: [
          'Use Supabase local Postgres or cloud project connection string.',
          'Add to `.env.local`: DATABASE_URL=postgresql://...',
          'Alternative for scripts: LOCAL_DATABASE_URL=postgresql://...',
          'Run migrations if parking tables are missing.',
        ],
        production: [
          'Use Supabase transaction pooler URL (port 6543) in DATABASE_URL.',
          'Set DATABASE_URL in production env; enable SSL (already configured in client).',
        ],
        verify: 'No "DATABASE_URL is not configured" warnings during coverage audit.',
      },
      {
        id: 'disable-parking-db-cache',
        title: 'DISABLE_PARKING_DB_CACHE',
        local: [
          'Set DISABLE_PARKING_DB_CACHE=false in `.env.local` once DATABASE_URL works.',
          'Remove the line entirely to default to enabled behavior.',
        ],
        production: [
          'Set DISABLE_PARKING_DB_CACHE=false (or unset) in production env.',
          '.env.example ships true for safe local dev without DB.',
        ],
        verify: 'Inventory and Snapshot providers show enabled + healthy on diagnostics page.',
      },
      {
        id: 'inventory-population',
        title: 'Inventory requirements',
        local: [
          'POST /api/parking/discover with {"airportCode":"SEA"} (requires GOOGLE_MAPS_SERVER_API_KEY).',
          'Repeat for hub airports: LAX, JFK, ORD, ATL, DFW, LAS, MCO, PAE.',
          'GET /api/parking/inventory?airportCode=SEA to confirm lot count.',
        ],
        production: [
          'Schedule cron: GET /api/cron/discover-parking (calls discover per configured airports).',
          'Or run manual discover POST after deploy.',
        ],
        verify: 'Coverage audit inventory count > 0 for discovered airports.',
      },
      {
        id: 'apr-requirements',
        title: 'APR requirements',
        local: [
          'DATABASE_URL + DISABLE_PARKING_DB_CACHE=false (same as inventory).',
          'Ensure DISABLE_APR_PARKING is unset or false.',
          'Refresh SEA APR cache: GET /api/admin/refresh-apr?checkInDate=YYYY-MM-DD&checkOutDate=YYYY-MM-DD',
        ],
        production: [
          'Run /api/admin/refresh-apr on schedule or before audits.',
          'APR is SEA-only; other airports will remain at apr=0.',
        ],
        verify: 'SEA coverage audit shows apr > 0 after cache refresh.',
      },
      {
        id: 'parkwhiz-dates',
        title: 'ParkWhiz requirements',
        local: [
          'No API key required.',
          'Ensure PARKING_DISCOVERY_PROVIDER=all (default) or parkwhiz.',
          'Coverage audit must pass checkInDate and checkOutDate (script does automatically).',
        ],
        production: [
          'Same as local; optional DATABASE_URL improves quote caching.',
        ],
        verify: 'parkwhiz results > 0 at major hubs in diagnostics probe.',
      },
      {
        id: 'discovery-provider-flag',
        title: 'PARKING_DISCOVERY_PROVIDER',
        local: [
          'Default: all (ParkWhiz + Google).',
          'Set to google or parkwhiz only for isolated testing.',
        ],
        production: [
          'Leave as all unless intentionally limiting providers.',
        ],
        verify: 'Both google and parkwhiz rows enabled on diagnostics when set to all.',
      },
    ],
  };
}

export function formatSetupChecklistMarkdown(checklist: ProviderSetupChecklist): string {
  const lines = [`# ${checklist.title}`, ''];

  for (const item of checklist.items) {
    lines.push(`## ${item.title}`);
    lines.push('');
    lines.push('**Local**');
    item.local.forEach((step) => lines.push(`- ${step}`));
    lines.push('');
    lines.push('**Production**');
    item.production.forEach((step) => lines.push(`- ${step}`));
    lines.push('');
    lines.push(`**Verify:** ${item.verify}`);
    lines.push('');
  }

  return lines.join('\n');
}
