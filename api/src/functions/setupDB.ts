import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { getDb } from '../db';

export async function setupDbHandler(
    request: HttpRequest,
    context: InvocationContext
): Promise<HttpResponseInit> {
    try {
        const db = getDb();
        
        await db.query(`
            CREATE INDEX IF NOT EXISTS idx_fmw_facility_update
            ON facility_metrics_wide (facility_id, update_utc DESC)
        `);

        await db.query(`
            CREATE INDEX IF NOT EXISTS idx_fmw_update_utc
            ON facility_metrics_wide (update_utc DESC)
        `);

        return {
            status: 200,
            jsonBody: { message: 'Indexes on facility_metrics_wide created successfully' },
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

