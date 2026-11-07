import type { MetricRow } from './loadData';

export interface ForecastPoint {
    timestamp: Date;
    value: number;
    upper: number;
    lower: number;
    isForecast: boolean;
}

export interface ValidationMetrics {
    mae: number;
    rmse: number;
    trainSize: number;
    testSize: number;
}

function calculateTrendSlope(rows: MetricRow[]): number {
    const base = rows[0].timestamp.getTime();

    const points = rows.map(r => ({
        x: (r.timestamp.getTime() - base) / (1000 * 60 * 15),
        y: r.value,
    }));

    const n = points.length;
    const sumX = points.reduce((a, p) => a + p.x, 0);
    const sumY = points.reduce((a, p) => a + p.y, 0);
    const sumXY = points.reduce((a, p) => a + p.x * p.y, 0);
    const sumX2 = points.reduce((a, p) => a + p.x * p.x, 0);

    return (n * sumXY - sumX * sumY) /
           (n * sumX2 - sumX * sumX);
}

export function validateModel(
    rows: MetricRow[],
    orgId: number,
    metric: string
): ValidationMetrics {
    const filtered = rows
        .filter(r => r.orgId === orgId && r.metric === metric)
        .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    if (filtered.length < 10) return { mae: 0, rmse: 0, trainSize: 0, testSize: 0 };

    const splitIndex = Math.floor(filtered.length * 0.8);
    const trainData = filtered.slice(0, splitIndex);
    const testData = filtered.slice(splitIndex);

    const slope = calculateTrendSlope(trainData);

    const lastTrainTime = trainData[trainData.length - 1].timestamp.getTime();
    const oneDayMs = 24 * 60 * 60 * 1000;
    const oneDayAgo = lastTrainTime - oneDayMs;
    const recentTrain = trainData.filter(r => r.timestamp.getTime() >= oneDayAgo);
    const seasonalSource = recentTrain.length > 10 ? recentTrain : trainData.slice(-96);

    const errors: number[] = [];
    testData.forEach((actual, i) => {
        const futureMinuteOfDay = new Date(actual.timestamp).getHours() * 60 + new Date(actual.timestamp).getMinutes();
        const closest = seasonalSource.reduce((prev, curr) => {
            const currMinute = new Date(curr.timestamp).getHours() * 60 + new Date(curr.timestamp).getMinutes();
            const prevMinute = new Date(prev.timestamp).getHours() * 60 + new Date(prev.timestamp).getMinutes();
            return Math.abs(currMinute - futureMinuteOfDay) < Math.abs(prevMinute - futureMinuteOfDay)
                ? curr : prev;
        });

        const trendAdjustment = slope * (splitIndex + i);
        const predicted = Math.max(0, closest.value + trendAdjustment);
        errors.push(Math.abs(predicted - actual.value));
    });

    const mae = Math.round((errors.reduce((a, e) => a + e, 0) / errors.length) * 10) / 10;
    const rmse = Math.round(Math.sqrt(errors.reduce((a, e) => a + e * e, 0) / errors.length) * 10) / 10;

    return { mae, rmse, trainSize: trainData.length, testSize: testData.length };
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

    // Calculate std dev of recent errors for confidence interval
    const splitIndex = Math.floor(filtered.length * 0.8);
    const trainData = filtered.slice(0, splitIndex);
    const testData = filtered.slice(splitIndex);

    const slope = calculateTrendSlope(trainData);

    const lastTrainTime = trainData[trainData.length - 1].timestamp.getTime();
    const oneDayMs = 24 * 60 * 60 * 1000;
    const oneDayAgo = lastTrainTime - oneDayMs;
    const recentTrain = trainData.filter(r => r.timestamp.getTime() >= oneDayAgo);
    const trainSeasonal = recentTrain.length > 10 ? recentTrain : trainData.slice(-96);

    const errors: number[] = [];
    testData.forEach((actual, i) => {
        const futureMinuteOfDay = new Date(actual.timestamp).getHours() * 60 + new Date(actual.timestamp).getMinutes();
        const closest = trainSeasonal.reduce((prev, curr) => {
            const currMinute = new Date(curr.timestamp).getHours() * 60 + new Date(curr.timestamp).getMinutes();
            const prevMinute = new Date(prev.timestamp).getHours() * 60 + new Date(prev.timestamp).getMinutes();
            return Math.abs(currMinute - futureMinuteOfDay) < Math.abs(prevMinute - futureMinuteOfDay)
                ? curr : prev;
        });
        const trendAdjustment = slope * (splitIndex + i);
        const predicted = Math.max(0, closest.value + trendAdjustment);
        errors.push(Math.abs(predicted - actual.value));
    });

    const meanError = errors.reduce((a, e) => a + e, 0) / (errors.length || 1);
    const stdDev = Math.sqrt(errors.reduce((a, e) => a + Math.pow(e - meanError, 2), 0) / (errors.length || 1));
    const confidenceBand = meanError + 1.96 * stdDev; // 95% confidence interval

    const lastTime = filtered[filtered.length - 1].timestamp.getTime();
    const stepsAhead = (hoursAhead * 60) / 15;

    const lastOneDayAgo = lastTime - oneDayMs;
    const recentData = filtered.filter(r => r.timestamp.getTime() >= lastOneDayAgo);
    const seasonalSource = recentData.length > 10 ? recentData : filtered.slice(-96);

    const historical: ForecastPoint[] = filtered.map(r => ({
        timestamp: r.timestamp,
        value: r.value,
        upper: r.value,
        lower: r.value,
        isForecast: false,
    }));

    const forecast: ForecastPoint[] = [];
    for (let i = 1; i <= stepsAhead; i++) {
        const futureTime = lastTime + i * 15 * 60 * 1000;
        const futureMinuteOfDay = new Date(futureTime).getHours() * 60 + new Date(futureTime).getMinutes();
        const closest = seasonalSource.reduce((prev, curr) => {
            const currMinute = new Date(curr.timestamp).getHours() * 60 + new Date(curr.timestamp).getMinutes();
            const prevMinute = new Date(prev.timestamp).getHours() * 60 + new Date(prev.timestamp).getMinutes();
            return Math.abs(currMinute - futureMinuteOfDay) < Math.abs(prevMinute - futureMinuteOfDay)
                ? curr : prev;
        });

        const trendAdjustment = slope * i;
        const forecastValue = Math.max(0, Math.round(closest.value + trendAdjustment));

        forecast.push({
            timestamp: new Date(futureTime),
            value: forecastValue,
            upper: Math.round(forecastValue + confidenceBand),
            lower: Math.max(0, Math.round(forecastValue - confidenceBand)),
            isForecast: true,
        });
    }

    return [...historical, ...forecast];
}