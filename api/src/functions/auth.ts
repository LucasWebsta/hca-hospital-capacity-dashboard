import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { getDb } from '../db';

// POST /api/auth/login
export async function loginHandler(
    request: HttpRequest,
    context: InvocationContext
): Promise<HttpResponseInit> {
    try {
        const body = await request.json() as { email: string; password: string };
        const { email, password } = body;

        if (!email || !password) {
            return {
                status: 400,
                jsonBody: { error: 'Email and password are required' },
                headers: { 'Access-Control-Allow-Origin': '*' },
            };
        }

        const db = getDb();
        const { rows } = await db.query(
            `SELECT id, first_name, last_name, email, role, photo_url, password_hash
             FROM users
             WHERE email = $1`,
            [email.toLowerCase()]
        );

        if (rows.length === 0) {
            await db.query(
                `INSERT INTO activity_logs (user_name, action, ip_address)
                 VALUES ($1, 'signin', $2)`,
                [email, request.headers.get('x-forwarded-for') || 'unknown']
            );

            return {
                status: 401,
                jsonBody: { error: 'Invalid email or password' },
                headers: { 'Access-Control-Allow-Origin': '*' },
            };
        }

        const user = rows[0];

        if (user.password_hash !== password) {
            await db.query(
                `INSERT INTO activity_logs (user_name, action, ip_address)
                 VALUES ($1, 'signin', $2)`,
                [email, request.headers.get('x-forwarded-for') || 'unknown']
            );

            return {
                status: 401,
                jsonBody: { error: 'Invalid email or password' },
                headers: { 'Access-Control-Allow-Origin': '*' },
            };
        }

        await db.query(
            `INSERT INTO activity_logs (user_id, user_name, action, ip_address, user_agent)
             VALUES ($1, $2, 'signin', $3, $4)`,
            [
                user.id,
                `${user.first_name} ${user.last_name}`,
                request.headers.get('x-forwarded-for') || 'unknown',
                request.headers.get('user-agent') || 'unknown'
            ]
        );

        const canAccessAdmin = ['Super Admin', 'Regional Manager', 'Facility Administrator'].includes(user.role || '');
        return {
            status: 200,
            jsonBody: {
                user: {
                    id: user.id,
                    firstName: user.first_name,
                    lastName: user.last_name,
                    email: user.email,
                    role: user.role,
                    photoUrl: (user as { photo_url?: string }).photo_url ?? null,
                },
                canAccessAdmin,
            },
            headers: { 'Access-Control-Allow-Origin': '*' },
        };
    } catch (err) {
        context.error('Login error:', err);
        return {
            status: 500,
            jsonBody: { error: 'Internal server error' },
            headers: { 'Access-Control-Allow-Origin': '*' },
        };
    }
}

// POST /api/auth/logout
export async function logoutHandler(
    request: HttpRequest,
    context: InvocationContext
): Promise<HttpResponseInit> {
    try {
        const body = await request.json() as { userId?: number; userName?: string };
        const { userId, userName } = body;

        if (userId || userName) {
            const db = getDb();
            await db.query(
                `INSERT INTO activity_logs (user_id, user_name, action, ip_address, user_agent)
                 VALUES ($1, $2, 'signout', $3, $4)`,
                [
                    userId || null,
                    userName || 'Unknown',
                    request.headers.get('x-forwarded-for') || 'unknown',
                    request.headers.get('user-agent') || 'unknown'
                ]
            );
        }

        return {
            status: 200,
            jsonBody: { message: 'Logged out successfully' },
            headers: { 'Access-Control-Allow-Origin': '*' },
        };
    } catch (err) {
        context.error('Logout error:', err);
        return {
            status: 500,
            jsonBody: { error: 'Internal server error' },
            headers: { 'Access-Control-Allow-Origin': '*' },
        };
    }
}

app.http('auth-login', {
    methods: ['POST', 'OPTIONS'],
    authLevel: 'anonymous',
    route: 'auth/login',
    handler: loginHandler,
});

app.http('auth-logout', {
    methods: ['POST', 'OPTIONS'],
    authLevel: 'anonymous',
    route: 'auth/logout',
    handler: logoutHandler,
});
