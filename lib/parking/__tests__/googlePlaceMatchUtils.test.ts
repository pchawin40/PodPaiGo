import { deriveBusinessPhotoSearchName } from '../googlePlaceMatchUtils';

describe('deriveBusinessPhotoSearchName', () => {
  test('normalizes Residence Inn parking product names to the hotel business name', () => {
    expect(
      deriveBusinessPhotoSearchName('Residence Inn SeaTac Lot - Self Uncovered'),
    ).toBe('Residence Inn SeaTac');
  });

  test('removes generic parking suffixes without erasing the business name', () => {
    expect(
      deriveBusinessPhotoSearchName('Residence Inn by Marriott Seattle Sea-Tac Airport Parking'),
    ).toBe('Residence Inn by Marriott Seattle Sea-Tac');
  });
});
