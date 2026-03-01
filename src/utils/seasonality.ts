/**
 * Seasonality factors for hospital occupancy forecasting
 * Based on known busy periods throughout the year
 */

export interface SeasonalityFactor {
  date: Date;
  multiplier: number; // Multiplier for base forecast (e.g., 1.2 = 20% increase)
  name: string;
  durationDays: number; // How many days the effect lasts
}

/**
 * Get seasonality multiplier for a given date
 * Returns a multiplier that adjusts the base forecast
 */
export function getSeasonalityMultiplier(date: Date): number {
  const month = date.getMonth(); // 0-11
  const day = date.getDate();
  const year = date.getFullYear();
  
  // Major holidays and busy periods
  const factors: SeasonalityFactor[] = [
    // New Year's (Dec 31 - Jan 2) - Very busy
    {
      date: new Date(year, 11, 31),
      multiplier: 1.25,
      name: "New Year's Eve",
      durationDays: 3
    },
    {
      date: new Date(year, 0, 1),
      multiplier: 1.25,
      name: "New Year's Day",
      durationDays: 3
    },
    
    // Valentine's Day (Feb 14) - Slightly busier
    {
      date: new Date(year, 1, 14),
      multiplier: 1.10,
      name: "Valentine's Day",
      durationDays: 2
    },
    
    // Spring Break (varies, typically March-April) - Moderate increase
    // Using approximate dates - could be made more precise
    {
      date: new Date(year, 2, 15),
      multiplier: 1.15,
      name: "Spring Break",
      durationDays: 14
    },
    
    // Easter (varies, typically March-April) - Moderate increase
    {
      date: getEasterDate(year),
      multiplier: 1.15,
      name: "Easter",
      durationDays: 3
    },
    
    // Memorial Day (last Monday in May) - Moderate increase
    {
      date: getMemorialDay(year),
      multiplier: 1.12,
      name: "Memorial Day",
      durationDays: 4
    },
    
    // July 4th - Very busy
    {
      date: new Date(year, 6, 4),
      multiplier: 1.20,
      name: "Independence Day",
      durationDays: 3
    },
    
    // Labor Day (first Monday in September) - Moderate increase
    {
      date: getLaborDay(year),
      multiplier: 1.12,
      name: "Labor Day",
      durationDays: 4
    },
    
    // Halloween (Oct 31) - EXTREMELY BUSY
    {
      date: new Date(year, 9, 31),
      multiplier: 1.35,
      name: "Halloween",
      durationDays: 3
    },
    
    // Thanksgiving (4th Thursday in November) - EXTREMELY BUSY
    {
      date: getThanksgiving(year),
      multiplier: 1.40,
      name: "Thanksgiving",
      durationDays: 5 // Includes Black Friday weekend
    },
    
    // Christmas (Dec 24-26) - Very busy
    {
      date: new Date(year, 11, 24),
      multiplier: 1.30,
      name: "Christmas Eve",
      durationDays: 3
    },
    {
      date: new Date(year, 11, 25),
      multiplier: 1.30,
      name: "Christmas Day",
      durationDays: 3
    },
    
    // New Year's Eve (Dec 31) - Very busy
    {
      date: new Date(year, 11, 31),
      multiplier: 1.25,
      name: "New Year's Eve",
      durationDays: 2
    },
  ];
  
  // Check if date falls within any seasonality period
  for (const factor of factors) {
    const factorDate = factor.date;
    const daysDiff = Math.floor((date.getTime() - factorDate.getTime()) / (1000 * 60 * 60 * 24));
    
    if (daysDiff >= 0 && daysDiff < factor.durationDays) {
      // Apply gradual decay for multi-day effects
      const decayFactor = 1 - (daysDiff / factor.durationDays) * 0.3; // 30% decay over duration
      return 1 + (factor.multiplier - 1) * decayFactor;
    }
  }
  
  // Winter months (Dec-Feb) generally busier due to flu season
  if (month === 11 || month === 0 || month === 1) {
    return 1.08; // 8% baseline increase
  }
  
  // Summer months (June-Aug) slightly busier
  if (month >= 5 && month <= 7) {
    return 1.05; // 5% baseline increase
  }
  
  // Default: no adjustment
  return 1.0;
}

/**
 * Calculate Easter date (simplified - uses algorithm for Western Easter)
 */
function getEasterDate(year: number): Date {
  // Simplified Easter calculation (works for most years)
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31) - 1;
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month, day);
}

/**
 * Get Memorial Day (last Monday in May)
 */
function getMemorialDay(year: number): Date {
  const may31 = new Date(year, 4, 31);
  const dayOfWeek = may31.getDay();
  const daysToSubtract = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // Monday is 1
  return new Date(year, 4, 31 - daysToSubtract);
}

/**
 * Get Labor Day (first Monday in September)
 */
function getLaborDay(year: number): Date {
  const sep1 = new Date(year, 8, 1);
  const dayOfWeek = sep1.getDay();
  const daysToAdd = dayOfWeek === 0 ? 1 : 8 - dayOfWeek; // Monday is 1
  return new Date(year, 8, 1 + daysToAdd);
}

/**
 * Get Thanksgiving (4th Thursday in November)
 */
function getThanksgiving(year: number): Date {
  const nov1 = new Date(year, 10, 1);
  const dayOfWeek = nov1.getDay();
  // Thursday is 4, so we need to find the 4th Thursday
  const daysToAdd = dayOfWeek <= 4 
    ? (4 - dayOfWeek) + 21 // If Nov 1 is Mon-Thu, add to get to 4th Thursday
    : (4 - dayOfWeek + 7) + 21; // If Nov 1 is Fri-Sun, go to next week
  return new Date(year, 10, 1 + daysToAdd);
}

/**
 * Get all seasonality factors for a date range
 */
export function getSeasonalityFactorsForRange(startDate: Date, endDate: Date): Map<string, number> {
  const factors = new Map<string, number>();
  const current = new Date(startDate);
  
  while (current <= endDate) {
    const multiplier = getSeasonalityMultiplier(current);
    if (multiplier !== 1.0) {
      const dateKey = current.toISOString().split('T')[0];
      factors.set(dateKey, multiplier);
    }
    current.setDate(current.getDate() + 1);
  }
  
  return factors;
}

