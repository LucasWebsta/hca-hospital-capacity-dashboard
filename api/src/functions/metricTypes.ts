import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';

// GET /api/metricTypes — metric column names from facility_metrics_wide (for alerts dropdown)
export async function metricTypesHandler(
  _request: HttpRequest,
  _context: InvocationContext
): Promise<HttpResponseInit> {
  // Metrics are fixed columns in facility_metrics_wide — return the canonical display names
  const metrics = ['Admissions', 'Births', 'Discharges', 'ICU Occupancy', 'Total Census'];
  return {
    jsonBody: metrics,
    headers: { 'Access-Control-Allow-Origin': '*' },
  };
}

app.http('metricTypes', { methods: ['GET'], authLevel: 'anonymous', handler: metricTypesHandler });
