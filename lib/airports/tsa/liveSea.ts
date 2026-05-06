import { TsaWaitTimes } from './types';

const SEA_CWT_API_URL = 'https://www.portseattle.org/api/cwt/wait-times';

type SeaSecurityOption = 'standard' | 'precheck' | 'clear' | 'clear-precheck';

type SeaCwtOption = {
    Name: string;
    Availability: 'Available' | 'Not Available' | string;
};

type SeaCwtApiCheckpoint = {
    CheckpointID: number;
    Name: string;
    IsOpen: boolean;
    WaitTimeMinutes: number | null;
    Options: SeaCwtOption[];
    IsDataAvailable: boolean;
    MinutesTillInvalid?: number;
};

type SeaTsaResult = {
    waitTimes: TsaWaitTimes;
    bestCheckpoint: {
        name: string;
        minutes: number;
        reason: string;
    } | null;
};

function hasAvailableOption(checkpoint: SeaCwtApiCheckpoint, optionName: string): boolean {
    return checkpoint.Options.some(
        (option) =>
            option.Name.toLowerCase() === optionName.toLowerCase() &&
            option.Availability.toLowerCase() === 'available'
    );
}

function median(values: number[]): number | null {
    const clean = values.filter(Number.isFinite).sort((a, b) => a - b);
    if (clean.length === 0) return null;

    const mid = Math.floor(clean.length / 2);
    return clean.length % 2 === 0
        ? Math.round((clean[mid - 1] + clean[mid]) / 2)
        : clean[mid];
}

function laneLabel(securityOption: SeaSecurityOption): string {
    if (securityOption === 'precheck') return 'PreCheck';
    if (securityOption === 'clear') return 'CLEAR';
    if (securityOption === 'clear-precheck') return 'CLEAR + PreCheck';
    return 'General';
}

export async function getLiveSeaTsaWaitTimes(
    securityOption: SeaSecurityOption = 'standard'
): Promise<SeaTsaResult | null> {
    try {
        const res = await fetch(SEA_CWT_API_URL, {
            headers: { 'User-Agent': 'PodPaiGo/1.0' },
            next: { revalidate: 300 },
        });

        if (!res.ok) return null;

        const data = await res.json();
        if (!Array.isArray(data)) return null;

        const standard: number[] = [];
        const precheck: number[] = [];
        const clear: number[] = [];
        const clearPrecheck: number[] = [];

        let bestCheckpoint: SeaTsaResult['bestCheckpoint'] = null;
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
            const hasCombo = hasPre && hasClear;

            if (hasGeneral) standard.push(minutes);
            if (hasPre) precheck.push(minutes);
            if (hasClear) clear.push(minutes);
            if (hasCombo) clearPrecheck.push(minutes);

            if (securityOption === 'precheck' && !hasPre) continue;
            if (securityOption === 'clear' && !hasClear) continue;
            if (securityOption === 'clear-precheck' && !hasCombo) continue;
            if (securityOption === 'standard' && !hasGeneral) continue;

            let score = 100 - minutes * 2;

            if (securityOption === 'precheck' && hasPre) score += 30;
            if (securityOption === 'clear' && hasClear) score += 30;
            if (securityOption === 'clear-precheck' && hasCombo) score += 50;
            if (securityOption === 'standard' && hasGeneral) score += 20;

            if (hasPre) score += 5;
            if (hasClear) score += 5;
            if (hasGeneral) score += 3;

            if (score > bestScore) {
                bestScore = score;
                bestCheckpoint = {
                    name: `Checkpoint ${checkpoint.Name}`,
                    minutes,
                    reason: `${laneLabel(securityOption)} • fastest available`,
                };
            }
        }

        const standardMedian = median(standard);
        if (standardMedian == null) return null;

        const precheckMedian = median(precheck);
        const clearMedian = median(clear);
        const clearPrecheckMedian = median(clearPrecheck);

        const clearPrecheckEstimate =
            precheckMedian != null && clearMedian != null
                ? Math.min(precheckMedian, clearMedian, clearPrecheckMedian ?? Infinity)
                : clearPrecheckMedian ?? Math.max(3, Math.round(standardMedian * 0.3));

        return {
            waitTimes: {
                standard: standardMedian,
                precheck: precheckMedian ?? Math.max(5, Math.round(standardMedian * 0.45)),
                clear: clearMedian ?? Math.max(5, Math.round(standardMedian * 0.6)),
                clearPrecheck: median(clearPrecheck)
                    ?? Math.max(2, Math.round((median(precheck) ?? standardMedian) * 0.7)),
            },
            bestCheckpoint,
        };
    } catch {
        return null;
    }
}