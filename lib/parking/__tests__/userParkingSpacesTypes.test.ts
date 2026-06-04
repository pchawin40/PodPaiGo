import { readFileSync } from 'fs';
import path from 'path';
import {
  isUserParkingEditable,
  validateUserParkingInput,
} from '../userParkingSpacesTypes';

describe('user parking submission model', () => {
  test('normalizes a valid signed-in parking submission', () => {
    const result = validateUserParkingInput({
      name: 'Safeway lot',
      address: '100 Main St, Monroe, WA',
      parking_type: 'retail_free',
      time_limit_minutes: '120',
      overnight_allowed: false,
      validation_required: true,
      evidence_url: 'https://example.com/sign-photo',
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toMatchObject({
        name: 'Safeway lot',
        parking_type: 'retail_free',
        time_limit_minutes: 120,
        overnight_allowed: false,
        validation_required: true,
      });
    }
  });

  test('own submissions are editable only while pending or needing info', () => {
    expect(isUserParkingEditable('pending')).toBe(true);
    expect(isUserParkingEditable('needs_more_info')).toBe(true);
    expect(isUserParkingEditable('verified')).toBe(false);
    expect(isUserParkingEditable('rejected')).toBe(false);
  });

  test('migration allows public reads only for verified parking', () => {
    const migration = readFileSync(
      path.join(
        process.cwd(),
        'supabase/migrations/20260607120000_user_parking_spaces.sql',
      ),
      'utf8',
    );

    expect(migration).toContain('enable row level security');
    expect(migration).toContain("status = 'verified'");
    expect(migration).toContain('for select');
  });
});
