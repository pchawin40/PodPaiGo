'use client';

import { useState } from 'react';

type ParkingLike = {
    name?: string;
    category?: string;
    images?: string[];
    imageUrl?: string;
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

export default function ParkingLotVisual({ option }: { option: ParkingLike }) {
    const src = getImageSrc(option);
    const [failedSrc, setFailedSrc] = useState<string | null>(null);
    const label = getFallbackLabel(option);

    if (src && failedSrc !== src) {
        return (
            <div className="h-28 w-full overflow-hidden rounded-2xl bg-slate-100">
                <img
                    src={src}
                    alt={`${option.name ?? 'Parking lot'} photo`}
                    className="h-full w-full object-cover"
                    loading="lazy"
                    onError={() => setFailedSrc(src)}
                />
            </div>
        );
    }

    return (
        <div className="relative h-32 w-full overflow-hidden rounded-2xl border border-slate-200 bg-slate-900">
            <div className="absolute inset-0 bg-[linear-gradient(135deg,#e5e7eb_0%,#f8fafc_45%,#cbd5e1_100%)]" />

            <div className="absolute inset-x-0 bottom-0 h-12 bg-slate-700/80" />

            <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-5">
                <div className="h-8 w-14 rounded-t-md bg-white/80 shadow-sm" />
                <div className="h-8 w-14 rounded-t-md bg-white/70 shadow-sm" />
                <div className="h-8 w-14 rounded-t-md bg-white/80 shadow-sm" />
            </div>

            <div className="absolute left-4 top-4 rounded-xl bg-white/90 px-3 py-2 shadow-sm">
                <div className="text-lg">🅿️</div>
            </div>

            <div className="absolute bottom-3 left-4 rounded-full bg-white/90 px-3 py-1 text-xs font-semibold text-slate-700 shadow-sm">
                {label}
            </div>
        </div>
    );
}
