import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { getDb } from '../db';

export async function rawMetricsHandler(
    request: HttpRequest,
    context: InvocationContext
): Promise<HttpResponseInit> {
    try {
        const facilityId = request.query.get('facilityId');
        if (!facilityId) {
            return {
                status: 400,
                jsonBody: { error: 'facilityId is required' },
                headers: { 'Access-Control-Allow-Origin': '*' },
            };
        }

        const db = getDb();
        const { rows } = await db.query(
            `SELECT facility_id, update_utc, admissions, discharges, births, icu_occupancy, total_census
             FROM facility_metrics_wide
             WHERE facility_id = $1
             AND update_utc >= NOW() - INTERVAL '60 days'
             ORDER BY update_utc ASC`,
            [facilityId]
        );
        return {
            status: 200,
            jsonBody: rows,
            headers: { 'Access-Control-Allow-Origin': '*' },
        };
    } catch (err) {
        context.error('rawMetrics error:', err);
        return {
            status: 500,
            jsonBody: { error: 'Internal server error' },
            headers: { 'Access-Control-Allow-Origin': '*' },
        };
    }
}

app.http('rawMetrics', {
    methods: ['GET'],
    authLevel: 'anonymous',
    route: 'rawMetrics',
    handler: rawMetricsHandler,
});