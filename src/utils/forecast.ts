import type { MetricRow } from './loadData';

export interface ForecastPoint {
    timestamp: Date;
    value: number;
    isForecast: boolean;
}

// Linear regression to project future values
function linearRegression(points: { x: number; y: number }[]): { slope: number; intercept: number } {
    const n = points.length;
    const sumX = points.reduce((a, p) => a + p.x, 0);
    const sumY = points.reduce((a, p) => a + p.y, 0);
    const sumXY = points.reduce((a, p) => a + p.x * p.y, 0);
    const sumX2 = points.reduce((a, p) => a + p.x * p.x, 0);
    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;
    return { slope, intercept };
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

    const base = filtered[0].timestamp.getTime();
    const points = filtered.map(r => ({
        x: (r.timestamp.getTime() - base) / (1000 * 60 * 15), // 15-min intervals
        y: r.value,
    }));

    const { slope, intercept } = linearRegression(points);

    const historical: ForecastPoint[] = filtered.map(r => ({
        timestamp: r.timestamp,
        value: r.value,
        isForecast: false,
    }));

    const lastX = points[points.length - 1].x;
    const lastTime = filtered[filtered.length - 1].timestamp.getTime();
    const stepsAhead = (hoursAhead * 60) / 15;

    const forecast: ForecastPoint[] = [];
    for (let i = 1; i <= stepsAhead; i++) {
        forecast.push({
            timestamp: new Date(lastTime + i * 15 * 60 * 1000),
            value: Math.max(0, Math.round(slope * (lastX + i) + intercept)),
            isForecast: true,
        });
    }

    return [...historical, ...forecast];
}