export function aggregateDataByGranularity(
    data: Array<{
      timestamp: Date;
      value: number;
      upper: number;
      lower: number;
      isForecast: boolean;
    }>,
    granularity: "15min" | "hourly" | "12hour" | "daily",
  ): Array<{
    timestamp: Date;
    value: number;
    upper: number;
    lower: number;
    isForecast: boolean;
  }> {
    if (granularity === "15min") return data;

    const aggregated = new Map<
      string,
      {
        values: number[];
        uppers: number[];
        lowers: number[];
        timestamps: Date[];
        isForecast: boolean;
      }
    >();

    data.forEach((point) => {
      let key: string;
      const date = new Date(point.timestamp);
      if (granularity === "hourly") {
        date.setMinutes(0, 0, 0);
        key = date.toISOString();
      } else if (granularity === "12hour") {
        const hour = date.getHours();
        date.setHours(hour < 12 ? 0 : 12, 0, 0, 0);
        key = date.toISOString();
      } else {
        date.setHours(0, 0, 0, 0);
        key = date.toISOString();
      }

      if (!aggregated.has(key))
        aggregated.set(key, {
          values: [],
          uppers: [],
          lowers: [],
          timestamps: [],
          isForecast: point.isForecast,
        });
      const entry = aggregated.get(key)!;
      entry.values.push(point.value);
      entry.uppers.push(point.upper);
      entry.lowers.push(point.lower);
      entry.timestamps.push(point.timestamp);
    });

    return Array.from(aggregated.entries())
      .map(([, entry]) => {
        let avgValue: number;
        if (entry.isForecast && entry.values.length > 1) {
          const sorted = [...entry.values].sort((a, b) => a - b);
          const mid = Math.floor(sorted.length / 2);
          avgValue =
            sorted.length % 2 === 0
              ? (sorted[mid - 1] + sorted[mid]) / 2
              : sorted[mid];
        } else {
          avgValue =
            entry.values.reduce((a, b) => a + b, 0) / entry.values.length;
        }
        const avgUpper =
          entry.uppers.reduce((a, b) => a + b, 0) / entry.uppers.length;
        const avgLower =
          entry.lowers.reduce((a, b) => a + b, 0) / entry.lowers.length;
        const timestamps = entry.timestamps
          .map((t) => t.getTime())
          .sort((a, b) => a - b);
        return {
          timestamp: new Date(timestamps[Math.floor(timestamps.length / 2)]),
          value: Math.round(avgValue),
          upper: Math.round(avgUpper),
          lower: Math.round(avgLower),
          isForecast: entry.isForecast,
        };
      })
      .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }

