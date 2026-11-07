export interface Facility {
    facilityId: number;
    location: string;
    beds: number;
    icuMax: number;
}

export interface MetricRow {
    metric: string;
    orgId: number;
    timestamp: Date;
    value: number;
}

const FACILITY_INFO: Record<number, {
  location: string;
  beds: number;
  icuMax: number;
}> = {
  1: { location: "Demo Hospital A", beds: 200, icuMax: 20 },
  2: { location: "Demo Hospital B", beds: 300, icuMax: 30 },
  3: { location: "Demo Hospital C", beds: 150, icuMax: 15 },
};

export async function loadFacilities(): Promise<Facility[]> {
    return Object.entries(FACILITY_INFO).map(([id, info]) => ({
        facilityId: Number(id),
        location: info.location,
        beds: info.beds,
        icuMax: info.icuMax,
    }));
}

export async function loadMetrics(facilityId: number): Promise<MetricRow[]> {
    try {
        const res = await fetch(`/api/rawMetrics?facilityId=${facilityId}`);
        if (!res.ok) {
            console.error(`Failed to load metrics: ${res.status} ${res.statusText}`);
            return [];
        }
        const data = await res.json();
        // Handle both array and object responses
        if (!Array.isArray(data)) {
            console.error('Expected array but got:', typeof data);
            return [];
        }
        return data.map((r: any) => ({
            metric: r.metric || 'Unknown',
            orgId: Number(r.facility_id || facilityId),
            timestamp: new Date(r.source_update_date || r.update_utc || new Date()),
            value: Number(r.metric_value || 0),
        }));
    } catch (err) {
        console.error('Error loading metrics:', err);
        return [];
    }
}