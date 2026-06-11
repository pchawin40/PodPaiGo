import {
  resolveWeatherDestinationLabel,
  weatherNearDestinationTitle,
} from '../destinationLabel';

describe('destinationLabel', () => {
  test('prefers destination name when provided', () => {
    expect(
      resolveWeatherDestinationLabel('Franklin Barbecue, Austin TX', 'Franklin Barbecue'),
    ).toBe('Franklin Barbecue');
  });

  test('extracts city from comma-separated destination', () => {
    expect(resolveWeatherDestinationLabel('Franklin Barbecue, Austin TX')).toBe('Austin');
  });

  test('does not use country tail as destination label', () => {
    expect(
      resolveWeatherDestinationLabel(
        'Franklin Barbecue, East 11th Street, Austin, TX, USA',
      ),
    ).toBe('Austin');
  });

  test('builds weather near title', () => {
    expect(weatherNearDestinationTitle('Austin')).toBe('Weather near Austin');
  });
});
