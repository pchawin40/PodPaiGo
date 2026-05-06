import { TsaWaitTimes } from './types';

const SEA_CWT_API_URL = 'https://www.portseattle.org/api/cwt/wait-times';

type SeaCwtOption = {
    Name: string;
    Availability: 'Available' | 'Not Available' | string;
};

type SeaCwtApiCheckpoint = {
    CheckpointID: number;
    Name: string;
    IsOpen: boolean;
    WaitTimeMinutes: number | null;
    PreCheck: number;
    Options: SeaCwtOption[];
    IsDataAvailable: boolean;
    LastUpdated?: string;
    MinutesTillInvalid?: number;
    MinutesSinceLastUpdate?: number;
    QueueLength?: number;
};

function hasAvailableOption(checkpoint: SeaCwtApiCheckpoint, optionName: string): boolean {
    return checkpoint.Options.some((option) => {
        return (
            option.Name.toLowerCase() === optionName.toLowerCase() &&
            option.Availability.toLowerCase() === 'available'
        );
    });
}

function median(values: number[]): number | null {
    const clean = values.filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
    if (clean.length === 0) return null;

    const mid = Math.floor(clean.length / 2);
    return clean.length % 2 === 0
        ? Math.round((clean[mid - 1] + clean[mid]) / 2)
        : clean[mid];
}

type SeaTsaResult = {
    waitTimes: TsaWaitTimes;
    bestCheckpoint: {
        name: string;
        minutes: number;
        reason: string;
    } | null;
};

export async function getLiveSeaTsaWaitTimes(): Promise<{
    waitTimes: TsaWaitTimes;
    bestCheckpoint: {
        name: string;
        minutes: number;
        reason: string;
    } | null;
} | null> {
    try {
        const res = await fetch(SEA_CWT_API_URL, {
            headers: {
                'User-Agent': 'PodPaiGo/1.0',
            },
            next: { revalidate: 300 },
        });

        if (!res.ok) return null;

        const data = await res.json();
        if (!Array.isArray(data)) return null;

        const standard: number[] = [];
        const precheck: number[] = [];
        const clear: number[] = [];
        const clearPrecheck: number[] = [];

        let bestCheckpoint: {
            name: string;
            minutes: number;
            reason: string;
        } | null = null;

        let bestScore = -Infinity;

        for (const checkpoint of data as SeaCwtApiCheckpoint[]) {
            if (!checkpoint.IsOpen) continue;
            if (!checkpoint.IsDataAvailable) continue;
            if (checkpoint.MinutesTillInvalid != null && checkpoint.MinutesTillInvalid < 0) continue;
            if (typeof checkpoint.WaitTimeMinutes !== 'number') continue;

            const minutes = checkpoint.WaitTimeMinutes;

            const hasGeneral = hasAvailableOption(checkpoint, 'General');
            const hasPre = hasAvailableOption(checkpoint, 'Pre');
            const hasClear = hasAvailableOption(checkpoint, 'Clear');

            // Existing arrays (keep yours)
            if (hasGeneral) standard.push(minutes);
            if (hasPre) precheck.push(minutes);
            if (hasClear) clear.push(minutes);
            if (hasPre && hasClear) clearPrecheck.push(minutes);

            // 🔥 NEW: scoring logic
            let score = 100 - minutes * 2;

            if (hasPre) score += 10;
            if (hasClear) score += 10;
            if (hasGeneral) score += 5;

            // Pick best checkpoint
            if (score > bestScore) {
                bestScore = score;

                bestCheckpoint = {
                    name: `Checkpoint ${checkpoint.Name}`,
                    minutes,
                    reason: [
                        hasGeneral ? 'General' : null,
                        hasPre ? 'PreCheck' : null,
                        hasClear ? 'CLEAR' : null,
                    ]
                        .filter(Boolean)
                        .join(' + '),
                };
            }

            if (hasAvailableOption(checkpoint, 'General')) {
                standard.push(minutes);
            }

            if (hasAvailableOption(checkpoint, 'Pre')) {
                precheck.push(minutes);
            }

            if (hasAvailableOption(checkpoint, 'Clear')) {
                clear.push(minutes);
            }

            // SEA labels CLEAR + PreCheck imperfectly.
            // If a checkpoint has both Pre and Clear available, treat it as CLEAR + PreCheck-capable.
            if (hasAvailableOption(checkpoint, 'Pre') && hasAvailableOption(checkpoint, 'Clear')) {
                clearPrecheck.push(minutes);
            }
        }

        const standardMedian = median(standard);
        if (standardMedian == null) return null;

        return {
            waitTimes: {
                standard: standardMedian,
                precheck: median(precheck) ?? Math.max(5, Math.round(standardMedian * 0.45)),
                clear: median(clear) ?? Math.max(5, Math.round(standardMedian * 0.6)),
                clearPrecheck: median(clearPrecheck) ?? Math.max(3, Math.round(standardMedian * 0.3)),
            },
            bestCheckpoint,
        };
    } catch {
        return null;
    }
}