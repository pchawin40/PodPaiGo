describe('/api/monetization/outbound-click route', () => {
  test('returns ok even when supabase is not configured', async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    const { POST } = await import('../app/api/monetization/outbound-click/route');
    const { NextRequest } = await import('next/server');

    const request = new NextRequest('http://localhost/api/monetization/outbound-click', {
      method: 'POST',
      body: JSON.stringify({
        eventType: 'reserve_parking',
        destinationUrl: 'https://provider.example/book',
      }),
    });

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.ok).toBe(true);
  });
});
