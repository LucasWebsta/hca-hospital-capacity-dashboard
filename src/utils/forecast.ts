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

    // Calculate linear trend
    const base = filtered[0].timestamp.getTime();
    const points = filtered.map(r => ({
        x: (r.timestamp.getTime() - base) / (1000 * 60 * 15),
        y: r.value,
    }));
    const n = points.length;
    const sumX = points.reduce((a, p) => a + p.x, 0);
    const sumY = points.reduce((a, p) => a + p.y, 0);
    const sumXY = points.reduce((a, p) => a + p.x * p.y, 0);
    const sumX2 = points.reduce((a, p) => a + p.x * p.x, 0);
    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);

    const lastTime = filtered[filtered.length - 1].timestamp.getTime();
    const stepsAhead = (hoursAhead * 60) / 15;
    const oneDayMs = 24 * 60 * 60 * 1000;

    // Only use last 7 days for seasonal pattern
const oneDayAgo = lastTime - oneDayMs;
const recentData = filtered.filter(r => r.timestamp.getTime() >= oneDayAgo);
const seasonalSource = recentData.length > 10 ? recentData : filtered.slice(-96);

    const forecast: ForecastPoint[] = [];
    for (let i = 1; i <= stepsAhead; i++) {
        const futureTime = lastTime + i * 15 * 60 * 1000;

        // Get seasonal value by matching time of day from last 7 days
        const futureDate = new Date(futureTime);
        const futureMinuteOfDay = futureDate.getHours() * 60 + futureDate.getMinutes();
        const closest = seasonalSource.reduce((prev, curr) => {
            const currMinute = new Date(curr.timestamp).getHours() * 60 + new Date(curr.timestamp).getMinutes();
            const prevMinute = new Date(prev.timestamp).getHours() * 60 + new Date(prev.timestamp).getMinutes();
            return Math.abs(currMinute - futureMinuteOfDay) < Math.abs(prevMinute - futureMinuteOfDay)
                ? curr : prev;
        });

        // Apply trend adjustment on top of seasonal value
        const trendAdjustment = slope * i;
        const forecastValue = Math.max(0, Math.round(closest.value + trendAdjustment));

        forecast.push({
            timestamp: new Date(futureTime),
            value: forecastValue,
            isForecast: true,
        });
    }

    return [...historical, ...forecast];
}