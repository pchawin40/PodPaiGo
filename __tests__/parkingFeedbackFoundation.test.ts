import fs from 'fs';
import path from 'path';

const migrationPath = path.join(
  __dirname,
  '../supabase/migrations/20260604120000_parking_feedback_foundation.sql',
);

describe('parking feedback foundation migration', () => {
  const sql = fs.readFileSync(migrationPath, 'utf8');

  test('creates parking_validation_reports table with expected columns', () => {
    expect(sql).toContain('create table if not exists public.parking_validation_reports');
    expect(sql).toContain('report_type text not null');
    expect(sql).toContain('validation_status text');
    expect(sql).toContain('access_type text');
    expect(sql).toContain("status text not null default 'pending'");
  });

  test('enables RLS with anon/authenticated insert and own select only', () => {
    expect(sql).toContain('alter table public.parking_validation_reports enable row level security');
    expect(sql).toContain('parking_validation_reports_insert_anonymous');
    expect(sql).toContain('parking_validation_reports_insert_authenticated');
    expect(sql).toContain('parking_validation_reports_select_own');
    expect(sql).toMatch(/parking_validation_reports_insert_anonymous[\s\S]*with check \(user_id is null\)/);
    expect(sql).toMatch(/parking_validation_reports_select_own[\s\S]*using \(user_id = auth\.uid\(\)\)/);
  });
});

describe('/api/parking/validation-report route', () => {
  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  });

  test('validates required report_type and free_minutes', async () => {
    const { POST } = await import('../app/api/parking/validation-report/route');
    const { NextRequest } = await import('next/server');

    const missingType = new NextRequest('http://localhost/api/parking/validation-report', {
      method: 'POST',
      body: JSON.stringify({ notes: 'hello' }),
    });

    const missingTypeResponse = await POST(missingType);
    expect(missingTypeResponse.status).toBe(400);

    const invalidMinutes = new NextRequest('http://localhost/api/parking/validation-report', {
      method: 'POST',
      body: JSON.stringify({ report_type: 'free', free_minutes: -5 }),
    });

    const invalidMinutesResponse = await POST(invalidMinutes);
    expect(invalidMinutesResponse.status).toBe(400);
  });

  test('anonymous report insert allowed when database is not configured', async () => {
    const { POST } = await import('../app/api/parking/validation-report/route');
    const { NextRequest } = await import('next/server');

    const request = new NextRequest('http://localhost/api/parking/validation-report', {
      method: 'POST',
      body: JSON.stringify({
        report_type: 'validated',
        destination_text: 'Costco Wholesale',
        notes: 'Validated with receipt',
      }),
    });

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.stored).toBe(false);
  });

  test('does not trigger Google Places calls', async () => {
    const fetchMock = jest.spyOn(global, 'fetch');

    const { POST } = await import('../app/api/parking/validation-report/route');
    const { NextRequest } = await import('next/server');

    const request = new NextRequest('http://localhost/api/parking/validation-report', {
      method: 'POST',
      body: JSON.stringify({ report_type: 'free', destination_text: 'Safeway' }),
    });

    await POST(request);

    expect(
      fetchMock.mock.calls.filter(([url]) => String(url).includes('places.googleapis.com')),
    ).toHaveLength(0);

    fetchMock.mockRestore();
  });
});

describe('/api/ai/parse-trip entitlements', () => {
  beforeEach(() => {
    delete process.env.DISABLE_AI_ASSISTANT;
    delete process.env.OPENAI_API_KEY;
    delete process.env.ADMIN_USER_IDS;
    process.env.AI_ASSISTANT_PROVIDER = 'mock';
  });

  test('anonymous AI uses mock metadata', async () => {
    const { POST, resetAiParseBudgetForTests } = await import('../app/api/ai/parse-trip/route');
    resetAiParseBudgetForTests();
    const { NextRequest } = await import('next/server');

    const request = new NextRequest('http://localhost/api/ai/parse-trip', {
      method: 'POST',
      body: JSON.stringify({ userText: 'SEA to Vegas Nov 15 weekend' }),
    });

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.plan).toBe('anonymous');
    expect(json.providerUsed).toBe('mock');
    expect(json.assistantLabel).toBe('Basic assistant');
  });

  test('client cannot force live AI', async () => {
    const { POST } = await import('../app/api/ai/parse-trip/route');
    const { NextRequest } = await import('next/server');

    const request = new NextRequest('http://localhost/api/ai/parse-trip', {
      method: 'POST',
      body: JSON.stringify({
        userText: 'SEA to Vegas Nov 15 weekend',
        forceLive: true,
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
  });
});
