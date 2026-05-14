'use client';

import { useState } from 'react';
import ParkingPhotoGalleryModal from './ParkingPhotoGalleryModal';

type ParkingLike = {
    name?: string;
    type?: string;
    category?: string;
    images?: string[];
    imageUrl?: string;
    photoAttributions?: string[];
};

function getFallbackLabel(option: ParkingLike) {
    const text = `${option.name ?? ''} ${option.category ?? ''}`.toLowerCase();

    if (text.includes('park') && text.includes('ride')) return 'Park & Ride';
    if (text.includes('hotel')) return 'Hotel Parking';
    if (text.includes('garage') || text.includes('official')) return 'Airport Garage';
    if (text.includes('shuttle')) return 'Off-site Shuttle';

    return 'Airport Parking';
}

function getImageSrc(option: ParkingLike) {
    return option.images?.[0] || option.imageUrl || null;
}

function getImages(option: ParkingLike) {
    return Array.from(
        new Set(
            [
                ...(option.images || []),
                option.imageUrl,
            ].filter((value): value is string => Boolean(value))
        )
    ).slice(0, 4);
}

export default function ParkingLotVisual({ option }: { option: ParkingLike }) {
    const src = getImageSrc(option);
    const images = getImages(option);
    const hasPhotos = images.length > 0;
    const [failedSrc, setFailedSrc] = useState<string | null>(null);
    const [galleryOpen, setGalleryOpen] = useState(false);
    const label = getFallbackLabel(option);

    if (src && failedSrc !== src && hasPhotos) {
        return (
            <>
                <button
                    type="button"
                    onClick={() => setGalleryOpen(true)}
                    className="group relative h-36 w-full overflow-hidden rounded-2xl bg-slate-100 text-left shadow-sm outline-none ring-offset-2 focus-visible:ring-2 focus-visible:ring-blue-500 sm:h-40"
                    aria-label={`View ${option.name ?? 'parking lot'} photos`}
                >
                    <img
                        src={src}
                        alt={`${option.name ?? 'Parking lot'} photo`}
                        className="h-full w-full object-cover transition duration-200 group-hover:scale-[1.02]"
                        loading="lazy"
                        onError={() => setFailedSrc(src)}
                    />

                    <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 bg-gradient-to-t from-black/70 via-black/20 to-transparent p-3">
                        <span className="max-w-[60%] truncate rounded-full bg-white/95 px-2.5 py-1 text-xs font-semibold text-zinc-900 shadow-sm">
                            {label}
                        </span>
                        <span className="shrink-0 rounded-full bg-zinc-950/80 px-2.5 py-1 text-xs font-semibold text-white shadow-sm">
                            View photos
                        </span>
                    </div>
                </button>

                {galleryOpen && (
                    <ParkingPhotoGalleryModal
                        images={images}
                        attributions={option.photoAttributions}
                        title={option.name || label}
                        onClose={() => setGalleryOpen(false)}
                    />
                )}
            </>
        );
    }

    return (
        <div className="relative h-36 w-full overflow-hidden rounded-2xl border border-slate-200 bg-slate-900 sm:h-40">
            <div className="absolute inset-0 bg-[linear-gradient(135deg,#e5e7eb_0%,#f8fafc_45%,#cbd5e1_100%)]" />

            <div className="absolute inset-x-0 bottom-0 h-12 bg-slate-700/80" />

            <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-5">
                <div className="h-8 w-14 rounded-t-md bg-white/80 shadow-sm" />
                <div className="h-8 w-14 rounded-t-md bg-white/70 shadow-sm" />
                <div className="h-8 w-14 rounded-t-md bg-white/80 shadow-sm" />
            </div>

            <div className="absolute left-4 top-4 rounded-xl bg-white/90 px-3 py-2 shadow-sm">
                <div className="text-lg font-black text-slate-800">P</div>
            </div>

            <div className="absolute bottom-3 left-4 rounded-full bg-white/90 px-3 py-1 text-xs font-semibold text-slate-700 shadow-sm">
                {label}
            </div>
        </div>
    );
}
