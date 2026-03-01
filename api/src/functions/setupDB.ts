import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { getDb } from '../db';

export async function setupDbHandler(
    request: HttpRequest,
    context: InvocationContext
): Promise<HttpResponseInit> {
    try {
        const db = getDb();
        
        await db.query(`
            CREATE MATERIALIZED VIEW IF NOT EXISTS facility_metrics_recent AS
            SELECT facility_id, metric, source_update_date, metric_value
            FROM facility_metrics
            WHERE source_update_date >= NOW() - INTERVAL '60 days'
            ORDER BY facility_id, source_update_date ASC
        `);

        await db.query(`
            CREATE INDEX IF NOT EXISTS idx_facility_metrics_recent 
            ON facility_metrics_recent (facility_id, source_update_date)
        `);

        return {
            status: 200,
            jsonBody: { message: 'Materialized view created successfully' },
            headers: { 'Access-Control-Allow-Origin': '*' },
        };
    } catch (err) {
        context.error('setupDb error:', err);
        return {
            status: 500,
            jsonBody: { error: String(err) },
            headers: { 'Access-Control-Allow-Origin': '*' },
        };
    }
}

app.http('setupDb', {
    methods: ['GET'],
    authLevel: 'anonymous',
    route: 'setupDb',
    handler: setupDbHandler,
});

