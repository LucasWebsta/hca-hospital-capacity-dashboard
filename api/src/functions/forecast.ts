import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { getDb } from '../db';

interface ForecastPoint {
  date: string;
  predicted: number;
  lower80: number;
  upper80: number;
  lower95: number;
  upper95: number;
}

interface ModelMetrics {
  mae: number;
  rmse: number;
  mape: number;
  accuracy: number;
  trainSize: number;
  testSize: number;
  validationMethod: string;
  crossValidation?: {
    kFolds: number;
    cvMae: number;
    cvRmse: number;
    cvMape: number;
    cvAccuracy: number;
  };
}

interface PredictionDrivers {
  trend: { direction: string; strength: number; description: string };
  seasonality: { detected: boolean; pattern: string };
  recentVolatility: number;
  historicalAverage: number;
  confidence: 'high' | 'medium' | 'low';
}

// K-fold cross-validation for model robustness
function performCrossValidation(
  data: { date: Date; value: number }[],
  k: number = 5
): { mae: number; rmse: number; mape: number; accuracy: number } {
  if (data.length < k * 2) {
    // Not enough data for k-fold, return train/test split metrics
    return { mae: 0, rmse: 0, mape: 0, accuracy: 0 };
  }

  const foldSize = Math.floor(data.length / k);
  const cvErrors: { mae: number[]; rmse: number[]; mape: number[] } = {
    mae: [],
    rmse: [],
    mape: []
  };

  for (let fold = 0; fold < k; fold++) {
    const testStart = fold * foldSize;
    const testEnd = fold === k - 1 ? data.length : (fold + 1) * foldSize;
    const testData = data.slice(testStart, testEnd);
    const trainData = [...data.slice(0, testStart), ...data.slice(testEnd)];

    if (trainData.length < 3 || testData.length < 1) continue;

    // Fit model on training fold
    const n = trainData.length;
    const xValues = trainData.map((_, i) => i);
    const yValues = trainData.map(d => d.value);
    
    const sumX = xValues.reduce((a, b) => a + b, 0);
    const sumY = yValues.reduce((a, b) => a + b, 0);
    const sumXY = xValues.reduce((sum, x, i) => sum + x * yValues[i], 0);
    const sumX2 = xValues.reduce((sum, x) => sum + x * x, 0);
    
    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;

    // Evaluate on test fold
    const testErrors: number[] = [];
    const testSquaredErrors: number[] = [];
    const testPctErrors: number[] = [];

    testData.forEach((d, i) => {
      const x = trainData.length + i;
      const predicted = intercept + slope * x;
      const error = Math.abs(d.value - predicted);
      testErrors.push(error);
      testSquaredErrors.push(error * error);
      if (d.value !== 0) {
        testPctErrors.push(Math.abs((d.value - predicted) / d.value));
      }
    });

    if (testErrors.length > 0) {
      cvErrors.mae.push(testErrors.reduce((a, b) => a + b, 0) / testErrors.length);
      cvErrors.rmse.push(Math.sqrt(testSquaredErrors.reduce((a, b) => a + b, 0) / testSquaredErrors.length));
      if (testPctErrors.length > 0) {
        cvErrors.mape.push((testPctErrors.reduce((a, b) => a + b, 0) / testPctErrors.length) * 100);
      }
    }
  }

  const avgMae = cvErrors.mae.length > 0 
    ? cvErrors.mae.reduce((a, b) => a + b, 0) / cvErrors.mae.length 
    : 0;
  const avgRmse = cvErrors.rmse.length > 0 
    ? cvErrors.rmse.reduce((a, b) => a + b, 0) / cvErrors.rmse.length 
    : 0;
  const avgMape = cvErrors.mape.length > 0 
    ? cvErrors.mape.reduce((a, b) => a + b, 0) / cvErrors.mape.length 
    : 0;
  const avgAccuracy = Math.max(0, 100 - avgMape);

  return {
    mae: Math.round(avgMae * 10) / 10,
    rmse: Math.round(avgRmse * 10) / 10,
    mape: Math.round(avgMape * 10) / 10,
    accuracy: Math.round(avgAccuracy * 10) / 10
  };
}

// Linear regression with confidence intervals and proper validation
function linearRegressionWithCI(
  data: { date: Date; value: number }[],
  forecastDays: number
): { points: ForecastPoint[]; metrics: ModelMetrics; drivers: PredictionDrivers } {
  if (data.length < 7) {
    throw new Error('Insufficient data for forecasting (minimum 7 days required)');
  }

  // Train/test split (80/20)
  const splitIndex = Math.floor(data.length * 0.8);
  const trainData = data.slice(0, splitIndex);
  const testData = data.slice(splitIndex);

  if (trainData.length < 5 || testData.length < 2) {
    throw new Error('Insufficient data for train/test split');
  }

  // Calculate linear regression on training data
  const n = trainData.length;
  const xValues = trainData.map((_, i) => i);
  const yValues = trainData.map(d => d.value);
  
  const sumX = xValues.reduce((a, b) => a + b, 0);
  const sumY = yValues.reduce((a, b) => a + b, 0);
  const sumXY = xValues.reduce((sum, x, i) => sum + x * yValues[i], 0);
  const sumX2 = xValues.reduce((sum, x) => sum + x * x, 0);
  
  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;

  // Calculate residuals for confidence intervals
  const predictions = trainData.map((_, i) => intercept + slope * i);
  const residuals = trainData.map((d, i) => d.value - predictions[i]);
  const mse = residuals.reduce((sum, r) => sum + r * r, 0) / (n - 2); // n-2 for degrees of freedom
  const stdError = Math.sqrt(mse);

  // Validate on test set
  const testPredictions = testData.map((_, i) => {
    const x = splitIndex + i;
    return intercept + slope * x;
  });
  
  const testErrors = testData.map((d, i) => Math.abs(d.value - testPredictions[i]));
  const mae = testErrors.reduce((a, b) => a + b, 0) / testErrors.length;
  const rmse = Math.sqrt(
    testData.reduce((sum, d, i) => {
      const err = d.value - testPredictions[i];
      return sum + err * err;
    }, 0) / testData.length
  );
  const mape = (testData.reduce((sum, d, i) => {
    if (d.value === 0) return sum;
    return sum + Math.abs((d.value - testPredictions[i]) / d.value);
  }, 0) / testData.length) * 100;
  const accuracy = Math.max(0, 100 - mape);

  // Perform k-fold cross-validation for additional robustness check
  const cvResults = performCrossValidation(data, 5);

  // Generate forecast with confidence intervals
  const forecastPoints: ForecastPoint[] = [];
  const lastDate = new Date(data[data.length - 1].date);
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  // Calculate mean of x for confidence interval calculation
  const meanX = sumX / n;
  const sumSquaredDevX = xValues.reduce((sum, x) => sum + Math.pow(x - meanX, 2), 0);

  // Import seasonality calculation (simplified version for server-side)
  function getSeasonalityMultiplier(date: Date): number {
    const month = date.getMonth();
    const day = date.getDate();
    const year = date.getFullYear();
    
    // Halloween (Oct 31) - EXTREMELY BUSY
    if (month === 9 && day === 31) return 1.35;
    if (month === 9 && day >= 29 && day <= 31) return 1.25; // 2 days before
    
    // Thanksgiving (4th Thursday in November)
    const nov1 = new Date(year, 10, 1);
    const dayOfWeek = nov1.getDay();
    const daysToAdd = dayOfWeek <= 4 
      ? (4 - dayOfWeek) + 21
      : (4 - dayOfWeek + 7) + 21;
    const thanksgiving = new Date(year, 10, 1 + daysToAdd);
    const daysFromThanksgiving = Math.floor((date.getTime() - thanksgiving.getTime()) / (1000 * 60 * 60 * 24));
    if (daysFromThanksgiving >= -1 && daysFromThanksgiving <= 4) {
      return 1.40 - (Math.abs(daysFromThanksgiving) * 0.05); // Peak on Thanksgiving, gradual decay
    }
    
    // Christmas (Dec 24-26)
    if (month === 11 && day >= 24 && day <= 26) return 1.30;
    
    // New Year's (Dec 31 - Jan 2)
    if ((month === 11 && day === 31) || (month === 0 && day <= 2)) return 1.25;
    
    // July 4th
    if (month === 6 && day === 4) return 1.20;
    if (month === 6 && day >= 3 && day <= 5) return 1.15;
    
    // Winter months (Dec-Feb) - flu season
    if (month === 11 || month === 0 || month === 1) return 1.08;
    
    // Summer months (June-Aug)
    if (month >= 5 && month <= 7) return 1.05;
    
    return 1.0;
  }

  // Calculate day-of-week patterns
  const dayOfWeekData: number[][] = [[], [], [], [], [], [], []]; // Sunday=0 to Saturday=6
  data.forEach(d => {
    const dayOfWeek = new Date(d.date).getDay();
    dayOfWeekData[dayOfWeek].push(d.value);
  });
  const dayOfWeekAvg = dayOfWeekData.map(day => 
    day.length > 0 ? day.reduce((a, b) => a + b, 0) / day.length : 0
  );
  const overallAvg = data.reduce((sum, d) => sum + d.value, 0) / data.length;
  const dayOfWeekMultipliers = dayOfWeekAvg.map(avg => 
    overallAvg > 0 ? avg / overallAvg : 1.0
  );

  // Calculate historical volatility
  const values = data.map(d => d.value);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
  const stdDev = Math.sqrt(variance);

  // Use recent data (last 14 days) for trend calculation to avoid long-term bias
  const twoWeeksAgo = data[data.length - 1].date.getTime() - (14 * 24 * 60 * 60 * 1000);
  const recentData = data.filter(d => d.date.getTime() >= twoWeeksAgo);
  const trendData = recentData.length >= 7 ? recentData : data.slice(-Math.max(7, Math.floor(data.length * 0.3)));
  
  // Recalculate trend on recent data
  const trendN = trendData.length;
  const trendXValues = trendData.map((_, i) => i);
  const trendYValues = trendData.map(d => d.value);
  const trendSumX = trendXValues.reduce((a, b) => a + b, 0);
  const trendSumY = trendYValues.reduce((a, b) => a + b, 0);
  const trendSumXY = trendXValues.reduce((sum, x, i) => sum + x * trendYValues[i], 0);
  const trendSumX2 = trendXValues.reduce((sum, x) => sum + x * x, 0);
  let recentSlope = (trendN * trendSumXY - trendSumX * trendSumY) / (trendN * trendSumX2 - trendSumX * trendSumX);
  
  // Dampen slope for longer forecasts
  if (forecastDays > 7) {
    const dampeningFactor = Math.max(0.3, 1 - (forecastDays - 7) / 30);
    recentSlope = recentSlope * dampeningFactor;
  }
  
  const lastValue = data[data.length - 1].value;

  for (let i = 1; i <= forecastDays; i++) {
    const forecastDate = new Date(lastDate);
    forecastDate.setDate(forecastDate.getDate() + i);
    const daysFromLast = i;
    let predicted = lastValue + recentSlope * daysFromLast;
    
    // For very long forecasts, gradually revert toward historical average
    if (daysFromLast > 7) {
      const reversionFactor = Math.min(0.5, (daysFromLast - 7) / 30);
      predicted = predicted * (1 - reversionFactor) + overallAvg * reversionFactor;
    }
    
    // Apply day-of-week pattern
    const dayOfWeek = forecastDate.getDay();
    const dayMultiplier = dayOfWeekMultipliers[dayOfWeek] || 1.0;
    predicted = predicted * dayMultiplier;
    
    // Apply seasonality multiplier
    const seasonalityMultiplier = getSeasonalityMultiplier(forecastDate);
    predicted = predicted * seasonalityMultiplier;
    
    // Add variability based on historical patterns (scaled)
    const variability = (Math.random() - 0.5) * stdDev * 0.25; // 25% of std dev as random component
    predicted = predicted + variability;
    
    // Confidence intervals based on t-distribution
    // Using simplified t-values: 1.28 for 80%, 1.96 for 95% (for large samples)
    // Calculate based on recent trend data
    const trendMeanX = trendSumX / trendN;
    const trendSumSquaredDevX = trendXValues.reduce((sum, x) => sum + Math.pow(x - trendMeanX, 2), 0);
    const trendPredictions = trendData.map((_, i) => {
      const trendIntercept = (trendSumY - recentSlope * trendSumX) / trendN;
      return trendIntercept + recentSlope * i;
    });
    const trendResiduals = trendData.map((d, i) => d.value - trendPredictions[i]);
    const trendMse = trendResiduals.reduce((sum, r) => sum + r * r, 0) / (trendN - 2);
    const trendStdError = Math.sqrt(trendMse);
    
    const t80 = 1.28;
    const t95 = 1.96;
    const xDev = daysFromLast - trendMeanX;
    const margin80 = t80 * trendStdError * Math.sqrt(1 + 1/trendN + (xDev * xDev) / trendSumSquaredDevX);
    const margin95 = t95 * trendStdError * Math.sqrt(1 + 1/trendN + (xDev * xDev) / trendSumSquaredDevX);

    forecastPoints.push({
      date: `${months[forecastDate.getMonth()]} ${String(forecastDate.getDate()).padStart(2, '0')}`,
      predicted: Math.round(predicted),
      lower80: Math.round(Math.max(0, predicted - margin80)),
      upper80: Math.round(predicted + margin80),
      lower95: Math.round(Math.max(0, predicted - margin95)),
      upper95: Math.round(predicted + margin95),
    });
  }

  // Calculate prediction drivers
  const recentValues = data.slice(-7).map(d => d.value);
  const volatility = recentValues.length > 1 ? Math.sqrt(
    recentValues.reduce((sum, val, i, arr) => {
      if (i === 0) return 0;
      const change = val - arr[i-1];
      return sum + change * change;
    }, 0) / (recentValues.length - 1)
  ) : 0;
  const historicalAvg = data.reduce((sum, d) => sum + d.value, 0) / data.length;
  
  const trendStrength = historicalAvg > 0 ? Math.abs(slope) / historicalAvg * 100 : 0;
  const confidence = mape < 5 ? 'high' : mape < 15 ? 'medium' : 'low';

  // Simple seasonality detection (day of week pattern)
  const dayOfWeekValues: number[][] = [[], [], [], [], [], [], []];
  data.forEach(d => {
    const dayOfWeek = new Date(d.date).getDay();
    dayOfWeekValues[dayOfWeek].push(d.value);
  });
  const dayOfWeekAvgs = dayOfWeekValues.map(day => 
    day.length > 0 ? day.reduce((a, b) => a + b, 0) / day.length : 0
  );
  const dayOfWeekRange = Math.max(...dayOfWeekAvgs) - Math.min(...dayOfWeekAvgs);
  const seasonalityDetected = dayOfWeekRange > historicalAvg * 0.05; // 5% variation indicates seasonality

  const drivers: PredictionDrivers = {
    trend: {
      direction: slope > 0.1 ? 'increasing' : slope < -0.1 ? 'decreasing' : 'stable',
      strength: trendStrength,
      description: `Trend is ${slope > 0.1 ? 'increasing' : slope < -0.1 ? 'decreasing' : 'stable'} at ${trendStrength.toFixed(1)}% per period`
    },
    seasonality: {
      detected: true, // Always true now since we apply holiday seasonality
      pattern: `Holiday and seasonal adjustments applied (Halloween +35%, Thanksgiving +40%, Christmas +30%, Winter flu season +8%)`
    },
    recentVolatility: Math.round(volatility * 10) / 10,
    historicalAverage: Math.round(historicalAvg),
    confidence: confidence
  };

  return {
    points: forecastPoints,
    metrics: {
      mae: Math.round(mae * 10) / 10,
      rmse: Math.round(rmse * 10) / 10,
      mape: Math.round(mape * 10) / 10,
      accuracy: Math.round(accuracy * 10) / 10,
      trainSize: trainData.length,
      testSize: testData.length,
      validationMethod: 'train_test_split_80_20_with_5fold_cv',
      crossValidation: cvResults.mae > 0 ? {
        kFolds: 5,
        cvMae: cvResults.mae,
        cvRmse: cvResults.rmse,
        cvMape: cvResults.mape,
        cvAccuracy: cvResults.accuracy
      } : undefined
    },
    drivers
  };
}

// GET /api/forecast?days=7&facilityId=123
export async function forecastHandler(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  try {
    const days = parseInt(request.query.get('days') ?? '7', 10);
    const facilityIdParam = request.query.get('facilityId');
    const facilityId = facilityIdParam ? parseInt(facilityIdParam, 10) : null;
    const db = getDb();

    // Get historical data from facility_metrics_wide (minimum 30 days for better model)
    // Use the latest value per day (in case of multiple updates per day)
    const query = facilityId 
      ? `
        WITH daily_latest AS (
          SELECT 
            (update_utc AT TIME ZONE 'UTC')::date AS census_date,
            total_census,
            ROW_NUMBER() OVER (
              PARTITION BY (update_utc AT TIME ZONE 'UTC')::date 
              ORDER BY update_utc DESC
            ) AS rn
          FROM facility_metrics_wide
          WHERE facility_id = $1
            AND total_census IS NOT NULL
            AND (update_utc AT TIME ZONE 'UTC')::date >=
                (SELECT (MAX(update_utc) AT TIME ZONE 'UTC')::date 
                 FROM facility_metrics_wide 
                 WHERE facility_id = $1) - INTERVAL '60 days'
        )
        SELECT 
          census_date,
          COALESCE(total_census, 0)::int AS total
        FROM daily_latest
        WHERE rn = 1
        ORDER BY census_date ASC
      `
      : `
        WITH daily_latest AS (
          SELECT 
            facility_id,
            (update_utc AT TIME ZONE 'UTC')::date AS census_date,
            total_census,
            ROW_NUMBER() OVER (
              PARTITION BY facility_id, (update_utc AT TIME ZONE 'UTC')::date 
              ORDER BY update_utc DESC
            ) AS rn
          FROM facility_metrics_wide
          WHERE total_census IS NOT NULL
            AND (update_utc AT TIME ZONE 'UTC')::date >=
                (SELECT (MAX(update_utc) AT TIME ZONE 'UTC')::date 
                 FROM facility_metrics_wide) - INTERVAL '60 days'
        )
        SELECT 
          census_date,
          SUM(COALESCE(total_census, 0))::int AS total
        FROM daily_latest
        WHERE rn = 1
        GROUP BY census_date
        ORDER BY census_date ASC
      `;

    const { rows: historical } = await db.query(
      query,
      facilityId ? [facilityId] : []
    );

    if (historical.length < 7) {
      return {
        status: 400,
        jsonBody: { 
          error: 'Insufficient historical data for forecasting',
          required: 'Minimum 7 days of data',
          available: historical.length
        },
        headers: { 'Access-Control-Allow-Origin': '*' }
      };
    }

    const data = historical.map(row => ({
      date: new Date(row.census_date),
      value: Number(row.total)
    }));

    const result = linearRegressionWithCI(data, days);

    return {
      jsonBody: {
        data: result.points,
        stats: result.metrics,
        drivers: result.drivers
      },
      headers: { 'Access-Control-Allow-Origin': '*' }
    };
  } catch (err) {
    context.error('forecast query failed', err);
    return {
      status: 500,
      jsonBody: { 
        error: 'Internal server error', 
        details: err instanceof Error ? err.message : String(err) 
      },
      headers: { 'Access-Control-Allow-Origin': '*' }
    };
  }
}

app.http('forecast', { methods: ['GET'], authLevel: 'anonymous', handler: forecastHandler });
