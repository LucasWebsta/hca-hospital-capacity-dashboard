import type { MetricRow } from './loadData';
import { getSeasonalityMultiplier } from './seasonality';

export interface ForecastPoint {
    timestamp: Date;
    value: number;
    isForecast: boolean;
}

export interface ValidationMetrics {
    mae: number;
    rmse: number;
    trainSize: number;
    testSize: number;
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

    const base = trainData[0].timestamp.getTime();
    const points = trainData.map(r => ({
        x: (r.timestamp.getTime() - base) / (1000 * 60 * 15),
        y: r.value,
    }));
    const n = points.length;
    const sumX = points.reduce((a, p) => a + p.x, 0);
    const sumY = points.reduce((a, p) => a + p.y, 0);
    const sumXY = points.reduce((a, p) => a + p.x * p.y, 0);
    const sumX2 = points.reduce((a, p) => a + p.x * p.x, 0);
    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);

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

    const historical: ForecastPoint[] = filtered.map(r => ({
        timestamp: r.timestamp,
        value: r.value,
        isForecast: false,
    }));

    // Calculate trend using recent data (last 7 days) for more relevant short-term trend
    // This prevents long-term trends from dominating short-term forecasts
    const oneWeekAgo = filtered[filtered.length - 1].timestamp.getTime() - (7 * 24 * 60 * 60 * 1000);
    const recentData = filtered.filter(r => r.timestamp.getTime() >= oneWeekAgo);
    const trendData = recentData.length >= 10 ? recentData : filtered.slice(-Math.max(10, Math.floor(filtered.length * 0.3)));
    
    const base = trendData[0].timestamp.getTime();
    const points = trendData.map(r => ({
        x: (r.timestamp.getTime() - base) / (1000 * 60 * 60), // Use hours for better precision
        y: r.value,
    }));
    const n = points.length;
    const sumX = points.reduce((a, p) => a + p.x, 0);
    const sumY = points.reduce((a, p) => a + p.y, 0);
    const sumXY = points.reduce((a, p) => a + p.x * p.y, 0);
    const sumX2 = points.reduce((a, p) => a + p.x * p.x, 0);
    let slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    
    // Dampen the slope for longer forecasts to prevent unrealistic extrapolation
    // For forecasts beyond 7 days, reduce the trend impact
    const forecastDays = hoursAhead / 24;
    if (forecastDays > 7) {
        const dampeningFactor = Math.max(0.3, 1 - (forecastDays - 7) / 30); // Reduce trend by up to 70% for long forecasts
        slope = slope * dampeningFactor;
    }
    
    // Use the last value as the starting point instead of intercept
    const lastValue = filtered[filtered.length - 1].value;
    const lastTime = filtered[filtered.length - 1].timestamp.getTime();
    const intercept = lastValue - slope * ((lastTime - base) / (1000 * 60 * 60));

    // Calculate day-of-week patterns
    const dayOfWeekData: number[][] = [[], [], [], [], [], [], []]; // Sunday=0 to Saturday=6
    filtered.forEach(r => {
        const dayOfWeek = new Date(r.timestamp).getDay();
        dayOfWeekData[dayOfWeek].push(r.value);
    });
    const dayOfWeekAvg = dayOfWeekData.map(day => 
        day.length > 0 ? day.reduce((a, b) => a + b, 0) / day.length : 0
    );
    const overallAvg = filtered.reduce((sum, r) => sum + r.value, 0) / filtered.length;
    const dayOfWeekMultipliers = dayOfWeekAvg.map(avg => 
        overallAvg > 0 ? avg / overallAvg : 1.0
    );

    // Calculate hour-of-day patterns (for intraday variation)
    const hourOfDayData: number[][] = Array(24).fill(null).map(() => []);
    filtered.forEach(r => {
        const hour = new Date(r.timestamp).getHours();
        hourOfDayData[hour].push(r.value);
    });
    const hourOfDayAvg = hourOfDayData.map(hour => 
        hour.length > 0 ? hour.reduce((a, b) => a + b, 0) / hour.length : overallAvg
    );
    const hourOfDayMultipliers = hourOfDayAvg.map(avg => 
        overallAvg > 0 ? avg / overallAvg : 1.0
    );

    // Calculate historical volatility (standard deviation)
    const values = filtered.map(r => r.value);
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
    const stdDev = Math.sqrt(variance);

    const stepsAhead = (hoursAhead * 60) / 15;

    // Use a smoother random walk for variability instead of independent random values
    let randomWalk = 0;
    const randomWalkDecay = 0.95; // Decay factor to prevent drift

    const forecast: ForecastPoint[] = [];
    let prevDayOfWeek = -1;
    let prevHour = -1;
    let prevDayMultiplier = 1.0;
    let prevHourMultiplier = 1.0;
    
    for (let i = 1; i <= stepsAhead; i++) {
        const futureTime = lastTime + i * 15 * 60 * 1000;
        const futureDate = new Date(futureTime);
        const futureDayOfWeek = futureDate.getDay();
        const futureHour = futureDate.getHours();
        const futureMinutes = futureDate.getMinutes();
        
        // Base forecast from linear trend, starting from the last known value
        const hoursFromLast = (futureTime - lastTime) / (1000 * 60 * 60);
        let forecastValue = lastValue + slope * hoursFromLast;
        
        // For very long forecasts, gradually revert toward historical average
        if (hoursFromLast > 168) { // Beyond 7 days
            const overallAvg = filtered.reduce((sum, r) => sum + r.value, 0) / filtered.length;
            const daysAhead = hoursFromLast / 24;
            const reversionFactor = Math.min(0.5, (daysAhead - 7) / 30); // Gradually revert up to 50% toward average
            forecastValue = forecastValue * (1 - reversionFactor) + overallAvg * reversionFactor;
        }
        
        // Smooth day-of-week transitions (interpolate between days)
        let dayMultiplier = dayOfWeekMultipliers[futureDayOfWeek] || 1.0;
        if (prevDayOfWeek !== -1 && prevDayOfWeek !== futureDayOfWeek) {
            // Smooth transition over the first hour of the new day
            const transitionFactor = Math.min(1.0, futureHour / 1.0); // Smooth over first hour
            dayMultiplier = prevDayMultiplier + (dayMultiplier - prevDayMultiplier) * transitionFactor;
        }
        prevDayOfWeek = futureDayOfWeek;
        prevDayMultiplier = dayMultiplier;
        forecastValue = forecastValue * dayMultiplier;
        
        // Smooth hour-of-day transitions (interpolate between hours)
        let hourMultiplier = hourOfDayMultipliers[futureHour] || 1.0;
        if (prevHour !== -1 && prevHour !== futureHour) {
            // Smooth transition over the first 15 minutes of the new hour
            const transitionFactor = Math.min(1.0, futureMinutes / 15.0);
            hourMultiplier = prevHourMultiplier + (hourMultiplier - prevHourMultiplier) * transitionFactor;
        }
        prevHour = futureHour;
        prevHourMultiplier = hourMultiplier;
        forecastValue = forecastValue * (0.85 + 0.15 * hourMultiplier); // Reduced hour effect to 15%
        
        // Apply seasonality multiplier
        const seasonalityMultiplier = getSeasonalityMultiplier(futureDate);
        forecastValue = forecastValue * seasonalityMultiplier;
        
        // Use smoothed random walk for variability instead of independent random
        randomWalk = randomWalk * randomWalkDecay + (Math.random() - 0.5) * stdDev * 0.15;
        forecastValue = forecastValue + randomWalk;
        
        // Ensure non-negative
        forecastValue = Math.max(0, forecastValue);

        forecast.push({
            timestamp: new Date(futureTime),
            value: Math.round(forecastValue),
            isForecast: true,
        });
    }

    return [...historical, ...forecast];
}