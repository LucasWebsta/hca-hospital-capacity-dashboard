export interface Facility {
    facilityId: number;
    location: string;
    beds: number;
    icuMax: number;
    admissions: number;
    births: number;
    discharges: number;
    icuOccupancy: number;
    totalCensus: number;
}

export interface MetricRow {
    metric: string;
    orgId: number;
    timestamp: Date;
    value: number;
}

function parseCSV(text: string): string[][] {
    return text.trim().split("\n").map(row => {
        const result: string[] = [];
        let current = "";
        let inQuotes = false;
        for (const char of row) {
            if (char === '"') {
                inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
                result.push(current.trim());
                current = "";
            } else {
                current += char;
            }
        }
        result.push(current.trim());
        return result;
    });
}

export async function loadFacilities(): Promise<Facility[]> {
    const res = await fetch("/facilities.csv");
    const text = await res.text();
    const rows = parseCSV(text);

    return rows.map(r => ({
        facilityId: Number(r[0]),
        location: r[1],
        beds: Number(r[2]),
        icuMax: Number(r[3]),
        admissions: 0,
        births: 0,
        discharges: 0,
        icuOccupancy: 0,
        totalCensus: 0,
    }));
}

export async function loadMetrics(): Promise<MetricRow[]> {
    const res = await fetch("/metrics.csv");
    const text = await res.text();
    const [_header, ...rows] = parseCSV(text);

    return rows.map(r => ({
        metric: r[0].trim(),
        orgId: Number(r[1]),
        timestamp: new Date(r[2].trim()),
        value: Number(r[3]),
    }));
}