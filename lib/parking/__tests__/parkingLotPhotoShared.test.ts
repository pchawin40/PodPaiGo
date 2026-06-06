import {
  isPlaceholderParkingPhotoUrl,
  parkingPhotoPriorityForMoreParkingRank,
  selectBestParkingPhotoFields,
} from '../parkingLotPhotoShared';

describe('parkingPhotoPriorityForMoreParkingRank', () => {
  test('keeps initial lower cards background and newly expanded rows visible', () => {
    expect(parkingPhotoPriorityForMoreParkingRank(1, 6)).toBe('top');
    expect(parkingPhotoPriorityForMoreParkingRank(3, 6)).toBe('top');
    expect(parkingPhotoPriorityForMoreParkingRank(4, 6)).toBe('background');
    expect(parkingPhotoPriorityForMoreParkingRank(6, 6)).toBe('background');
    expect(parkingPhotoPriorityForMoreParkingRank(7, 6)).toBe('visible');
  });
});

describe('selectBestParkingPhotoFields', () => {
  test('keeps provider image ahead of placeholder image', () => {
    const selected = selectBestParkingPhotoFields(
      {
        imageUrl: '/assets/parking/hotel-parking.svg',
        images: ['/assets/parking/hotel-parking.svg'],
        photoSource: 'placeholder',
      },
      {
        imageUrl: 'https://provider.example.com/quality-inn.jpg',
        images: ['https://provider.example.com/quality-inn.jpg'],
        photoSource: 'provider',
        photoAttribution: 'ParkWhiz',
      },
    );

    expect(selected.imageUrl).toBe('https://provider.example.com/quality-inn.jpg');
    expect(selected.photoSource).toBe('provider');
    expect(selected.photoAttribution).toBe('ParkWhiz');
  });

  test('detects local parking illustration placeholders', () => {
    expect(isPlaceholderParkingPhotoUrl('/assets/parking/hotel-parking.svg')).toBe(true);
    expect(isPlaceholderParkingPhotoUrl('https://provider.example.com/quality-inn.jpg')).toBe(false);
  });
});
