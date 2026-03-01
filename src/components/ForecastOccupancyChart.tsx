import { useState, useEffect } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { api } from '../api';
import type { ForecastResponse, PredictionDrivers } from '../api';
import { InfoTooltip } from './InfoTooltip';

// HCA Brand colors: Blue #092240 | Orange #E75925
const BRAND_BLUE = '#092240';
const BRAND_ORANGE = '#E75925';

type TimeWindow = 'past-week' | 'current-week' | 'next-week' | 'next-month';

export function ForecastOccupancyChart({ facilityId, tooltipsOn = true }: { facilityId?: number; tooltipsOn?: boolean }) {
  const [timeWindow, setTimeWindow] = useState<TimeWindow>('next-week');
  const [chartData, setChartData] = useState<{ d: string; val: number; lo80: number; hi80: number; lo95: number; hi95: number; isHistorical?: boolean }[]>([]);
  const [stats, setStats] = useState({ mae: 0, rmse: 0, mape: 0, accuracy: 0, trainSize: 0, testSize: 0, validationMethod: '' });
  const [drivers, setDrivers] = useState<PredictionDrivers | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const forecastDays = timeWindow === 'past-week' ? 0 : 
                        timeWindow === 'current-week' ? 7 :
                        timeWindow === 'next-week' ? 7 :
                        timeWindow === 'next-month' ? 30 : 7;
    
    if (timeWindow === 'past-week') {
      // Show only historical data
      api.getTrend(7, facilityId, 'overall')
        .then((data) => {
          const historicalPoints = data.map((item) => ({
            d: item.date,
            val: item.actual ?? item.forecast ?? 0,
            lo80: item.actual ?? item.forecast ?? 0,
            hi80: item.actual ?? item.forecast ?? 0,
            lo95: item.actual ?? item.forecast ?? 0,
            hi95: item.actual ?? item.forecast ?? 0,
            isHistorical: true
          }));
          setChartData(historicalPoints);
          setLoading(false);
        })
        .catch((err) => {
          console.error('Historical data error:', err);
          setLoading(false);
        });
      return;
    }

    // For current-week, load both historical and forecast
    if (timeWindow === 'current-week') {
      Promise.all([
        api.getTrend(7, facilityId, 'overall'),
        api.getForecast(7, facilityId)
      ])
        .then(([historical, forecast]) => {
          const historicalPoints = historical.slice(-7).map((item) => ({
            d: item.date,
            val: item.actual ?? item.forecast ?? 0,
            lo80: item.actual ?? item.forecast ?? 0,
            hi80: item.actual ?? item.forecast ?? 0,
            lo95: item.actual ?? item.forecast ?? 0,
            hi95: item.actual ?? item.forecast ?? 0,
            isHistorical: true
          }));
          const forecastPoints = forecast.data.map((item) => ({
            d: item.date as string,
            val: item.predicted ?? item.forecast ?? 0,
            lo80: item.lower80 ?? item.lower ?? 0,
            hi80: item.upper80 ?? item.upper ?? 0,
            lo95: item.lower95 ?? item.lower ?? 0,
            hi95: item.upper95 ?? item.upper ?? 0,
            isHistorical: false
          }));
          setChartData([...historicalPoints, ...forecastPoints]);
          setStats(forecast.stats);
          setDrivers(forecast.drivers ?? null);
          setLoading(false);
        })
        .catch((err) => {
          console.error('Data loading error:', err);
          setLoading(false);
        });
      return;
    }

    // For future windows, load forecast only
    api.getForecast(forecastDays, facilityId)
      .then((res: ForecastResponse) => {
        const forecastPoints = res.data.map((item) => ({
          d: item.date as string,
          val: item.predicted ?? item.forecast ?? 0,
          lo80: item.lower80 ?? item.lower ?? 0,
          hi80: item.upper80 ?? item.upper ?? 0,
          lo95: item.lower95 ?? item.lower ?? 0,
          hi95: item.upper95 ?? item.upper ?? 0,
          isHistorical: false
        }));
        setChartData(forecastPoints);
        setStats(res.stats);
        setDrivers(res.drivers ?? null);
        setLoading(false);
      })
      .catch((err) => {
        console.error('Forecast error:', err);
        setLoading(false);
      });
  }, [timeWindow, facilityId]);

  // Calculate dynamic Y-axis domain from data
  const allValues = chartData.flatMap(d => [d.val, d.lo95, d.hi95]).filter(v => v > 0);
  const minVal = allValues.length > 0 ? Math.max(0, Math.floor(Math.min(...allValues) * 0.95)) : 0;
  const maxVal = allValues.length > 0 ? Math.ceil(Math.max(...allValues) * 1.05) : 1000;

  const confidenceColor = drivers?.confidence === 'high' ? '#16a34a' : drivers?.confidence === 'medium' ? '#eab308' : '#ef4444';

  // Find divider date for current-week view (where historical ends and forecast begins)
  const dividerDate = timeWindow === 'current-week' && chartData.length > 0
    ? (() => {
        const firstForecastIdx = chartData.findIndex(d => !d.isHistorical);
        return firstForecastIdx > 0 ? chartData[firstForecastIdx - 1].d : null;
      })()
    : null;

  return (
    <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #edf0f5', padding: '20px 20px', boxShadow: '0 1px 4px rgba(0,0,0,0.05), 0 4px 12px rgba(0,0,0,0.03)' }}>

      {/* Header */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 14 }}>
        {/* Title row */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13.5, fontWeight: 700, color: BRAND_BLUE }}>Forecast Occupancy</span>
            {tooltipsOn && (
              <InfoTooltip text="Linear regression model with 80% and 95% confidence intervals. Validated using 80/20 train/test split and 5-fold cross-validation. MAE, RMSE, and MAPE show prediction accuracy. Cross-validation metrics provide additional robustness assessment." />
            )}
          </div>
          <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 1, display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
            <span>Linear Regression · CI 80% & 95% · {(stats.validationMethod || 'train_test_split_80_20').replace('train_test_split_', '').replace('_', '/')} split</span>
            {(stats as any).crossValidation && <span>· {(stats as any).crossValidation.kFolds}-fold CV</span>}
            {tooltipsOn && (
              <InfoTooltip 
                text="Model Details: This forecast uses a linear regression model that finds trends in historical data. The model was validated by training on 80% of data and testing on 20%, plus 5-fold cross-validation for extra reliability. Confidence intervals show the range of likely outcomes." 
                minWidth={320} 
                maxWidth={420} 
              />
            )}
          </div>
        </div>
        {/* Tab row — full width so tabs never overflow */}
        <div style={{ display: 'flex', gap: 3, background: '#f8fafc', borderRadius: 7, padding: 3, border: '1px solid #edf0f5' }}>
          {([
            { id: 'past-week', label: 'Past Wk' },
            { id: 'current-week', label: 'This Wk' },
            { id: 'next-week', label: 'Next Wk' },
            { id: 'next-month', label: 'Next Mo' }
          ] as { id: TimeWindow; label: string }[]).map(w => (
            <button key={w.id} onClick={() => setTimeWindow(w.id)} style={{
              flex: 1, fontSize: 11, fontWeight: 600, padding: '4px 6px', borderRadius: 5,
              border: 'none', cursor: 'pointer',
              background: timeWindow === w.id ? BRAND_BLUE : 'transparent',
              color: timeWindow === w.id ? '#fff' : '#94a3b8',
              boxShadow: timeWindow === w.id ? `0 1px 4px rgba(9,34,64,0.25)` : 'none',
              whiteSpace: 'nowrap'
            }}>{w.label}</button>
          ))}
        </div>
      </div>

      {/* Performance Metrics */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        {[
          [
            'MAE', 
            (stats.mae ?? 0).toFixed(1), 
            'Mean Absolute Error: The average difference between predicted and actual values. Lower is better. For example, an MAE of 5.8 means predictions are off by about 6 beds on average.'
          ],
          [
            'RMSE', 
            (stats.rmse ?? 0).toFixed(1), 
            'Root Mean Squared Error: Similar to MAE but gives more weight to larger errors. A higher RMSE means there were some predictions that were significantly off. Lower is better.'
          ],
          [
            'MAPE', 
            ((stats.mape ?? 0).toFixed(1) + '%'), 
            'Mean Absolute Percentage Error: Shows the average percentage difference between predictions and actuals. A MAPE of 5% means predictions are typically within 5% of the actual value.'
          ],
          [
            'Accuracy', 
            ((stats.accuracy ?? 0).toFixed(1) + '%'), 
            'Model Accuracy: Calculated as 100% minus MAPE. This shows how close predictions are to actual values. Higher is better - 95% accuracy means predictions are very reliable.'
          ]
        ].map(([k, v, desc]) => (
          <div key={k} style={{ background: '#e8eef8', borderRadius: 7, padding: '5px 10px', border: `1px solid rgba(9,34,64,0.1)`, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 10, fontWeight: 600, color: '#94a3b8', marginRight: 4 }}>{k}</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: BRAND_BLUE }}>{v}</span>
            {tooltipsOn && <InfoTooltip text={desc} minWidth={320} maxWidth={420} />}
          </div>
        ))}
        {(stats.trainSize ?? 0) > 0 && (
          <div style={{ background: '#f0f9ff', borderRadius: 7, padding: '5px 10px', border: `1px solid rgba(9,34,64,0.1)`, fontSize: 10, color: '#64748b', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span>Train: {stats.trainSize} | Test: {stats.testSize}</span>
            {(stats as any).crossValidation && <span>| CV: {(stats as any).crossValidation.kFolds}-fold</span>}
            {tooltipsOn && (
              <InfoTooltip 
                text="Data Split: The model was trained on the 'Train' portion of historical data and tested on the 'Test' portion to measure accuracy. Cross-validation (CV) further validates the model by testing it on different subsets of data." 
                minWidth={320} 
                maxWidth={420} 
              />
            )}
          </div>
        )}
        {(stats as any).crossValidation && (
          <div style={{ background: '#fefce8', borderRadius: 7, padding: '5px 10px', border: `1px solid rgba(234,179,8,0.2)`, fontSize: 10, color: '#64748b', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontWeight: 600, color: '#ca8a04' }}>Cross-Validation:</span> 
            <span>MAE {(stats as any).crossValidation.cvMae.toFixed(1)} | RMSE {(stats as any).crossValidation.cvRmse.toFixed(1)} | Accuracy {(stats as any).crossValidation.cvAccuracy.toFixed(1)}%</span>
            {tooltipsOn && (
              <InfoTooltip 
                text="Cross-Validation Metrics: These metrics come from testing the model on 5 different subsets of data. This provides a more robust assessment of model performance by ensuring the model works well across different time periods, not just one test set." 
                minWidth={320} 
                maxWidth={420} 
              />
            )}
          </div>
        )}
      </div>

      {/* Model Confidence & Accuracy */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 32, fontWeight: 800, color: BRAND_BLUE, letterSpacing: -1 }}>
            {loading ? '—' : (stats.accuracy ?? 0).toFixed(1)}%
          </span>
          {tooltipsOn && (
            <InfoTooltip 
              text="Overall Model Accuracy: This percentage shows how reliable the forecast is. It's calculated by comparing predictions to actual historical values. Higher percentages mean more trustworthy predictions. This accuracy is based on testing the model on data it hasn't seen before." 
              minWidth={320} 
              maxWidth={420} 
            />
          )}
        </div>
        {drivers && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ 
              fontSize: 12.5, 
              color: confidenceColor, 
              fontWeight: 700, 
              background: drivers.confidence === 'high' ? '#f0fdf4' : drivers.confidence === 'medium' ? '#fefce8' : '#fef2f2', 
              padding: '3px 7px', 
              borderRadius: 5,
              border: `1px solid ${confidenceColor}33`
            }}>
              {drivers.confidence.toUpperCase()} Confidence
            </span>
            {tooltipsOn && (
              <InfoTooltip 
                text={`Confidence Level: ${drivers.confidence === 'high' ? 'High confidence means predictions are typically within 5% of actual values. Very reliable for planning.' : drivers.confidence === 'medium' ? 'Medium confidence means predictions are typically within 5-15% of actual values. Generally reliable but consider wider ranges.' : 'Low confidence means predictions may vary by more than 15%. Use with caution and consider broader planning ranges.'}`}
                minWidth={320} 
                maxWidth={420} 
              />
            )}
          </div>
        )}
      </div>

      {/* Chart */}
      {!loading && chartData.length > 0 && (
        <ResponsiveContainer width="100%" height={140}>
          <AreaChart data={chartData} margin={{ top: 4, right: 4, left: -28, bottom: 0 }}>
            <defs>
              <linearGradient id="confBand95" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={BRAND_BLUE} stopOpacity={0.15} />
                <stop offset="100%" stopColor={BRAND_BLUE} stopOpacity={0.03} />
              </linearGradient>
              <linearGradient id="confBand80" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={BRAND_BLUE} stopOpacity={0.25} />
                <stop offset="100%" stopColor={BRAND_BLUE} stopOpacity={0.08} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
            <XAxis dataKey="d" tick={{ fontSize: 9.5, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
            <YAxis domain={[minVal, maxVal]} tick={{ fontSize: 9.5, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
            <Tooltip 
              contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #edf0f5', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}
              formatter={(value: number, name: string, props: any) => {
                const isHistorical = props?.payload?.isHistorical;
                if (name === 'val') return [`${value} beds`, isHistorical ? 'Actual' : 'Predicted'];
                if (name === 'hi95') return [`${value} beds`, '95% Upper'];
                if (name === 'lo95') return [`${value} beds`, '95% Lower'];
                if (name === 'hi80') return [`${value} beds`, '80% Upper'];
                if (name === 'lo80') return [`${value} beds`, '80% Lower'];
                return value;
              }}
            />
            {/* Divider line between historical and forecast (for current-week view) */}
            {dividerDate && (
              <ReferenceLine 
                x={dividerDate} 
                stroke="#94a3b8" 
                strokeWidth={1.5} 
                strokeDasharray="3 3" 
                label={{ value: 'Today', position: 'top', fill: '#64748b', fontSize: 10 }}
              />
            )}
            {/* 95% Confidence Band (only for forecasts) */}
            {chartData.some(d => !d.isHistorical) && (
              <>
                <Area type="monotone" dataKey="hi95" stroke="none" fill="url(#confBand95)" fillOpacity={1} />
                <Area type="monotone" dataKey="lo95" stroke="none" fill="#fff" fillOpacity={1} />
                {/* 80% Confidence Band */}
                <Area type="monotone" dataKey="hi80" stroke="none" fill="url(#confBand80)" fillOpacity={1} />
                <Area type="monotone" dataKey="lo80" stroke="none" fill="#fff" fillOpacity={1} />
              </>
            )}
            {/* Predicted/Historical Line */}
            <Area 
              type="monotone" 
              dataKey="val" 
              stroke={chartData.some(d => d.isHistorical) ? (timeWindow === 'current-week' ? BRAND_BLUE : '#64748b') : BRAND_BLUE} 
              strokeWidth={2.5} 
              strokeDasharray={chartData.some(d => d.isHistorical && timeWindow === 'past-week') ? '5 5' : 'none'}
              fill="none" 
              dot={false} 
            />
          </AreaChart>
        </ResponsiveContainer>
      )}

      {/* Prediction Drivers */}
      {drivers && (
        <div style={{ marginTop: 16, padding: 12, background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: BRAND_BLUE, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
            Prediction Drivers & Model Explanation
            {tooltipsOn && (
              <InfoTooltip 
                text="This section explains what factors the model uses to make predictions. Understanding these drivers helps you interpret the forecast and know when to trust it more or less." 
                minWidth={280} 
                maxWidth={380} 
              />
            )}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: 10.5, color: '#64748b', display: 'flex', alignItems: 'center', gap: 6 }}>
              <strong style={{ color: BRAND_BLUE }}>Model Type:</strong> 
              <span>Linear Regression with trend extrapolation</span>
              {tooltipsOn && (
                <InfoTooltip 
                  text="Linear Regression: The model finds the best straight line through historical data and extends it forward. It assumes the current trend (increasing or decreasing) will continue. Simple but effective for short-term forecasts." 
                  minWidth={320} 
                  maxWidth={420} 
                />
              )}
            </div>
            <div style={{ fontSize: 10.5, color: '#64748b', display: 'flex', alignItems: 'center', gap: 6 }}>
              <strong style={{ color: BRAND_BLUE }}>Trend:</strong> 
              <span>{drivers.trend.description}</span>
              {tooltipsOn && (
                <InfoTooltip 
                  text="Trend: Shows whether occupancy is generally going up, down, or staying stable. The strength shows how fast the change is happening. A strong increasing trend means you should expect higher occupancy in the future." 
                  minWidth={320} 
                  maxWidth={420} 
                />
              )}
            </div>
            <div style={{ fontSize: 10.5, color: '#64748b', display: 'flex', alignItems: 'center', gap: 6 }}>
              <strong style={{ color: BRAND_BLUE }}>Seasonality:</strong> 
              <span>{drivers.seasonality.pattern}</span>
              {tooltipsOn && (
                <InfoTooltip 
                  text="Seasonality: Looks for patterns that repeat weekly. For example, if occupancy is typically higher on certain days of the week, the model accounts for that. If detected, it means there's a predictable weekly rhythm to your data." 
                  minWidth={320} 
                  maxWidth={420} 
                />
              )}
            </div>
            <div style={{ fontSize: 10.5, color: '#64748b', display: 'flex', alignItems: 'center', gap: 6 }}>
              <strong style={{ color: BRAND_BLUE }}>Volatility:</strong> 
              <span>{(drivers.recentVolatility ?? 0).toFixed(1)} beds/day (recent 7-day standard deviation)</span>
              {tooltipsOn && (
                <InfoTooltip 
                  text="Volatility: Measures how much the occupancy has been jumping around recently. Higher volatility means less predictable patterns - the forecast may be less reliable. Lower volatility means more stable patterns and more reliable predictions." 
                  minWidth={320} 
                  maxWidth={420} 
                />
              )}
            </div>
            <div style={{ fontSize: 10.5, color: '#64748b', display: 'flex', alignItems: 'center', gap: 6 }}>
              <strong style={{ color: BRAND_BLUE }}>Historical Average:</strong> 
              <span>{drivers.historicalAverage} beds (baseline reference)</span>
              {tooltipsOn && (
                <InfoTooltip 
                  text="Historical Average: The typical occupancy level over the past 60 days. This provides context - if the forecast is much higher or lower than this average, it indicates a significant change from normal operations." 
                  minWidth={320} 
                  maxWidth={420} 
                />
              )}
            </div>
            <div style={{ fontSize: 10.5, color: '#64748b', display: 'flex', alignItems: 'center', gap: 6 }}>
              <strong style={{ color: BRAND_BLUE }}>Confidence Level:</strong> 
              <span>{drivers.confidence} (based on MAPE: {drivers.confidence === 'high' ? '<5%' : drivers.confidence === 'medium' ? '5-15%' : '>15%'})</span>
              {tooltipsOn && (
                <InfoTooltip 
                  text="Confidence Level: Based on how accurate the model has been when tested on historical data. High confidence means the model has been very accurate in the past, so you can trust these predictions more. Lower confidence means use the forecast as a rough guide." 
                  minWidth={320} 
                  maxWidth={420} 
                />
              )}
            </div>
          </div>
        </div>
      )}

      {/* Legend */}
      {!loading && chartData.length > 0 && (
        <div style={{ display: 'flex', gap: 12, marginTop: 12, fontSize: 10, color: '#64748b', justifyContent: 'center', flexWrap: 'wrap' }}>
          {chartData.some(d => d.isHistorical) && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <div style={{ width: 12, height: 12, background: '#64748b', borderRadius: 2 }} />
              <span>Historical</span>
              {tooltipsOn && (
                <InfoTooltip 
                  text="Historical Data: Actual occupancy values from the past. This shows what really happened, which helps you understand how accurate the forecast model is." 
                  minWidth={280} 
                  maxWidth={380} 
                />
              )}
            </div>
          )}
          {chartData.some(d => !d.isHistorical) && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <div style={{ width: 12, height: 12, background: BRAND_BLUE, borderRadius: 2 }} />
                <span>Predicted</span>
                {tooltipsOn && (
                  <InfoTooltip 
                    text="Predicted Line: The most likely occupancy value for each future day, based on the linear trend from historical data. This is the model's best guess." 
                    minWidth={280} 
                    maxWidth={380} 
                  />
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <div style={{ width: 12, height: 12, background: 'rgba(9,34,64,0.25)' }} />
                <span>80% CI</span>
                {tooltipsOn && (
                  <InfoTooltip 
                    text="80% Confidence Interval: There's an 80% chance the actual occupancy will fall within this range. The darker band shows where occupancy is most likely to be. Use this for planning with moderate confidence." 
                    minWidth={320} 
                    maxWidth={420} 
                  />
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <div style={{ width: 12, height: 12, background: 'rgba(9,34,64,0.15)' }} />
                <span>95% CI</span>
                {tooltipsOn && (
                  <InfoTooltip 
                    text="95% Confidence Interval: There's a 95% chance the actual occupancy will fall within this wider range. The lighter band shows the full range of likely outcomes. Use this for conservative planning and worst-case scenarios." 
                    minWidth={320} 
                    maxWidth={420} 
                  />
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
