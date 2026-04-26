type AprAvailabilityResult = {
    available: boolean;
    status: 'available' | 'unavailable' | 'unknown';
    statusCode?: number;
};

const APR_LOT_IDS: Record<string, number> = {
    'doubletree seattle airport': 231,
    'extra car airport parking': 97,
    'masterpark lot b': 117,
    'top spot airport parking': 2350,
};

function formatAprDate(dateString: string): string {
    const d = new Date(`${dateString}T12:00:00`);
    return d.toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
    });
}

export async function checkAprLotAvailability(args: {
    lotName: string;
    checkInDate?: string;
    checkOutDate?: string;
}): Promise<AprAvailabilityResult> {
    if (!args.checkInDate || !args.checkOutDate) {
        return { available: false, status: 'unknown' };
    }

    const key = Object.keys(APR_LOT_IDS).find((name) =>
        args.lotName.toLowerCase().includes(name)
    );

    if (!key) return { available: false, status: 'unknown' };

    const lotId = APR_LOT_IDS[key];

    try {
        console.log('APR CHECK', {
            lotName: args.lotName,
            lotId,
            checkInDate: args.checkInDate,
            checkOutDate: args.checkOutDate,
        });

        const res = await fetch(`https://airportparkingreservations.com/parkinglot/${lotId}/search`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json',
                'User-Agent': 'Mozilla/5.0 PodPaiGoBot/0.1',
            },
            body: JSON.stringify({
                checkindate: formatAprDate(args.checkInDate),
                checkoutdate: formatAprDate(args.checkOutDate),
            }),
        });

        console.log('APR RESPONSE', {
            lotName: args.lotName,
            status: res.status,
        });

        if (res.status === 422 || res.status === 404) {
            return { available: false, status: 'unavailable', statusCode: res.status };
        }

        if (!res.ok) {
            return { available: false, status: 'unknown', statusCode: res.status };
        }

        return { available: true, status: 'available', statusCode: res.status };
    } catch {
        return { available: false, status: 'unknown' };
    }
}