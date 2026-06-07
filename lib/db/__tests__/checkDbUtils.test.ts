const {
  isPlaceholderUrl,
  resolveDatabaseUrl,
  sanitizeConnectionString,
} = require('../checkDbUtils');

describe('check-db helpers', () => {
  test('detects placeholder Supabase URLs', () => {
    expect(
      isPlaceholderUrl('postgresql://postgres:<PASSWORD>@postgres.<PROJECT_REF>.supabase.co:6543/postgres'),
    ).toBe(true);
    expect(isPlaceholderUrl('postgresql://postgres:secret@db.example.com:5432/postgres')).toBe(false);
    expect(isPlaceholderUrl('')).toBe(true);
  });

  test('prefers DATABASE_URL then LOCAL_DATABASE_URL', () => {
    expect(
      resolveDatabaseUrl({
        DATABASE_URL: 'postgresql://primary',
        LOCAL_DATABASE_URL: 'postgresql://local',
      }),
    ).toBe('postgresql://primary');

    expect(
      resolveDatabaseUrl({
        LOCAL_DATABASE_URL: 'postgresql://local',
      }),
    ).toBe('postgresql://local');
  });

  test('sanitizes password from connection string', () => {
    const sanitized = sanitizeConnectionString(
      'postgresql://postgres:supersecret@db.example.com:6543/postgres',
    );

    expect(sanitized).not.toContain('supersecret');
    expect(sanitized).toContain('***');
  });
});
