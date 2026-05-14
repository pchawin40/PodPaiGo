'use client';

type ParkingPhotoGalleryModalProps = {
  images: string[];
  attributions?: string[];
  title: string;
  onClose: () => void;
};

export default function ParkingPhotoGalleryModal({
  images,
  attributions,
  title,
  onClose,
}: ParkingPhotoGalleryModalProps) {

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-4 shadow-xl">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-slate-900">{title}</h2>

          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-slate-200 px-3 py-1 text-sm text-slate-700 hover:bg-slate-50"
          >
            Close
          </button>
        </div>

        {images.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {images.map((photo, index) => (
              <img
                key={`${photo}-${index}`}
                src={photo}
                alt={`${title} ${index + 1}`}
                className="h-48 w-full rounded-xl object-cover"
              />
            ))}
          </div>
        ) : (
          <p className="text-sm text-slate-600">No photos available.</p>
        )}
      </div>
    </div>
  );
}