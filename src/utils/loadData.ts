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

const FACILITY_INFO: Record<number, { location: string; beds: number; icuMax: number }> = {
    12345: { location: 'Denver, CO', beds: 500, icuMax: 50 },
    23456: { location: 'Austin, TX', beds: 768, icuMax: 80 },
    34567: { location: 'Brownsville, TX', beds: 400, icuMax: 40 },
    45678: { location: 'Hopewell, VA', beds: 132, icuMax: 20 },
    56789: { location: 'Orlando, FL', beds: 458, icuMax: 60 },
    67890: { location: 'Tampa, FL', beds: 664, icuMax: 66 },
    78901: { location: 'Salt Lake City, UT', beds: 468, icuMax: 74 },
    89012: { location: 'Myrtle Beach, SC', beds: 246, icuMax: 29 },
    90123: { location: 'Nashville, TN', beds: 321, icuMax: 40 },
    1234:  { location: 'Savannah, GA', beds: 381, icuMax: 45 },
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
    const res = await fetch(`/api/rawMetrics?facilityId=${facilityId}`);
    const data = await res.json();
    return data.map((r: any) => ({
        metric: r.metric,
        orgId: Number(r.facility_id),
        timestamp: new Date(r.source_update_date),
        value: Number(r.metric_value),
    }));
}