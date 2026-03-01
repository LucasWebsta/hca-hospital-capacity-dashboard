import type { MetricRow } from './loadData';
export interface ForecastPoint {
    timestamp: Date;
    value: number;
    isForecast: boolean;
}
export function forecastMetric(
    rows: MetricRow[],
    orgId: number,
    metric: string,
    hoursAhead: number = 24
): ForecastPoint[] {
    const filtered = rows
        .filter(r => r.orgId === orgId && r.metric === metric)
        .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    if (filtered.length < 2) return [];

    const historical: ForecastPoint[] = filtered.map(r => ({
        timestamp: r.timestamp,
        value: r.value,
        isForecast: false,
    }));

    const lastTime = filtered[filtered.length - 1].timestamp.getTime();
    const stepsAhead = (hoursAhead * 60) / 15;
    const oneDayMs = 168 * 60 * 60 * 1000;

    const forecast: ForecastPoint[] = [];
    for (let i = 1; i <= stepsAhead; i++) {
        const futureTime = lastTime + i * 15 * 60 * 1000;
        // Find the value from exactly 1 day ago
        const targetTime = futureTime - oneDayMs;
        const closest = filtered.reduce((prev, curr) =>
            Math.abs(curr.timestamp.getTime() - targetTime) < Math.abs(prev.timestamp.getTime() - targetTime)
                ? curr : prev
        );
        forecast.push({
            timestamp: new Date(futureTime),
            value: closest.value,
            isForecast: true,
        });
    }

    return [...historical, ...forecast];
}