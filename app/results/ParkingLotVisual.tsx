'use client';

import { useState } from 'react';

type ParkingLike = {
    name?: string;
    type?: string;
    category?: string;
    images?: string[];
    imageUrl?: string;
    photoAttributions?: string[];
    transferType?: string;
};

type FallbackKind =
    | 'park-and-ride'
    | 'hotel-parking'
    | 'airport-garage'
    | 'off-site-shuttle'
    | 'airport-parking';

function getFallbackKind(option: ParkingLike): FallbackKind {
    const text = `${option.name ?? ''} ${option.category ?? ''} ${option.type ?? ''}`.toLowerCase();

    if (text.includes('park') && text.includes('ride')) return 'park-and-ride';
    if (option.transferType === 'transit') return 'park-and-ride';
    if (text.includes('hotel') || text.includes('inn') || text.includes('suites')) return 'hotel-parking';
    if (text.includes('garage') || text.includes('official') || option.type === 'official') {
        return 'airport-garage';
    }
    if (text.includes('shuttle') || text.includes('off-airport') || option.type === 'off-airport') {
        return 'off-site-shuttle';
    }

    return 'airport-parking';
}

function getFallbackLabel(option: ParkingLike) {
    const kind = getFallbackKind(option);

    if (kind === 'park-and-ride') return 'Park & Ride';
    if (kind === 'hotel-parking') return 'Hotel Parking';
    if (kind === 'airport-garage') return 'Airport Garage';
    if (kind === 'off-site-shuttle') return 'Off-site Shuttle';

    return 'Airport Parking';
}

function getFallbackImageSrc(option: ParkingLike): string {
    const kind = getFallbackKind(option);
    return `/assets/parking/${kind}.svg`;
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
    const label = getFallbackLabel(option);
    const fallbackSrc = getFallbackImageSrc(option);

    if (src && failedSrc !== src && hasPhotos) {
        return (
            <div
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
                </div>
            </div>
        );
    }

    return (
        <div className="relative h-36 w-full overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 sm:h-40">
            <img
                src={fallbackSrc}
                alt={`${label} illustration`}
                className="h-full w-full object-cover"
                loading="lazy"
            />

            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-3">
                <span className="rounded-full bg-white/95 px-3 py-1 text-xs font-semibold text-slate-800 shadow-sm">
                    {label}
                </span>
            </div>
        </div>
    );
}
