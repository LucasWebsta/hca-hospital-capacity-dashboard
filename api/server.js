// Simple Express server to run Azure Functions locally without 'func' command
// This is a development alternative when Azure Functions Core Tools is not installed

const express = require('express');
const cors = require('cors');
const app = express();
const port = 7071;

app.use(cors());
app.use(express.json());

// Import the compiled functions
const { censusHandler } = require('./dist/src/functions/census');
const { facilitiesHandler } = require('./dist/src/functions/facilities');
const { alertsHandler } = require('./dist/src/functions/alerts');
const { trendHandler } = require('./dist/src/functions/trend');
const { forecastHandler } = require('./dist/src/functions/forecast');
const { loginHandler, logoutHandler } = require('./dist/src/functions/auth');
const { getUsersHandler, addUserHandler, deleteUserHandler } = require('./dist/src/functions/users');
const { getActivityLogsHandler } = require('./dist/src/functions/activity');

// Mock HttpRequest and InvocationContext for Azure Functions
function createMockRequest(method, url, query = {}) {
  return {
    method,
    url,
    query: new Map(Object.entries(query)),
    headers: new Map(),
    body: null,
    json: async () => ({}),
  };
}

function createMockContext() {
  return {
    log: console.log,
    error: console.error,
    warn: console.warn,
    info: console.info,
  };
}

// Routes
app.get('/api/census', async (req, res) => {
  try {
    const mockRequest = createMockRequest('GET', '/api/census');
    const mockContext = createMockContext();
    const response = await censusHandler(mockRequest, mockContext);
    res.status(response.status || 200).json(response.jsonBody);
  } catch (error) {
    console.error('Census error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/facilities', async (req, res) => {
  try {
    const mockRequest = createMockRequest('GET', '/api/facilities');
    const mockContext = createMockContext();
    const response = await facilitiesHandler(mockRequest, mockContext);
    res.status(response.status || 200).json(response.jsonBody);
  } catch (error) {
    console.error('Facilities error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/alerts', async (req, res) => {
  try {
    const mockRequest = createMockRequest('GET', '/api/alerts');
    const mockContext = createMockContext();
    const response = await alertsHandler(mockRequest, mockContext);
    res.status(response.status || 200).json(response.jsonBody);
  } catch (error) {
    console.error('Alerts error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/trend', async (req, res) => {
  try {
    const mockRequest = createMockRequest('GET', '/api/trend', req.query);
    const mockContext = createMockContext();
    const response = await trendHandler(mockRequest, mockContext);
    res.status(response.status || 200).json(response.jsonBody);
  } catch (error) {
    console.error('Trend error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/forecast', async (req, res) => {
  try {
    const mockRequest = createMockRequest('GET', '/api/forecast', req.query);
    const mockContext = createMockContext();
    const response = await forecastHandler(mockRequest, mockContext);
    res.status(response.status || 200).json(response.jsonBody);
  } catch (error) {
    console.error('Forecast error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Auth endpoints
app.post('/api/auth/login', async (req, res) => {
  try {
    const mockRequest = {
      ...createMockRequest('POST', '/api/auth/login'),
      json: async () => req.body,
      headers: {
        get: (name) => req.headers[name.toLowerCase()] || null,
      },
    };
    const mockContext = createMockContext();
    const response = await loginHandler(mockRequest, mockContext);
    res.status(response.status || 200).json(response.jsonBody);
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/auth/logout', async (req, res) => {
  try {
    const mockRequest = {
      ...createMockRequest('POST', '/api/auth/logout'),
      json: async () => req.body,
      headers: {
        get: (name) => req.headers[name.toLowerCase()] || null,
      },
    };
    const mockContext = createMockContext();
    const response = await logoutHandler(mockRequest, mockContext);
    res.status(response.status || 200).json(response.jsonBody);
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Users endpoints
app.get('/api/users', async (req, res) => {
  try {
    const mockRequest = createMockRequest('GET', '/api/users');
    const mockContext = createMockContext();
    const response = await getUsersHandler(mockRequest, mockContext);
    res.status(response.status || 200).json(response.jsonBody);
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/users', async (req, res) => {
  try {
    const mockRequest = {
      ...createMockRequest('POST', '/api/users'),
      json: async () => req.body,
    };
    const mockContext = createMockContext();
    const response = await addUserHandler(mockRequest, mockContext);
    res.status(response.status || 201).json(response.jsonBody);
  } catch (error) {
    console.error('Add user error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.delete('/api/users/:id', async (req, res) => {
  try {
    const mockRequest = {
      ...createMockRequest('DELETE', `/api/users/${req.params.id}`),
      params: { id: req.params.id },
      query: new Map([['id', req.params.id]]),
    };
    const mockContext = createMockContext();
    const response = await deleteUserHandler(mockRequest, mockContext);
    res.status(response.status || 200).json(response.jsonBody);
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Activity logs endpoint
app.get('/api/activity', async (req, res) => {
  try {
    const mockRequest = createMockRequest('GET', '/api/activity', req.query);
    const mockContext = createMockContext();
    const response = await getActivityLogsHandler(mockRequest, mockContext);
    res.status(response.status || 200).json(response.jsonBody);
  } catch (error) {
    console.error('Get activity logs error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.listen(port, () => {
  console.log(`\n🚀 HCA Census API Server running on http://localhost:${port}`);
  console.log(`📡 Available endpoints:`);
  console.log(`   GET /api/census`);
  console.log(`   GET /api/facilities`);
  console.log(`   GET /api/alerts`);
  console.log(`   GET /api/trend?days=30`);
  console.log(`   GET /api/forecast?days=7`);
  console.log(`   POST /api/auth/login`);
  console.log(`   POST /api/auth/logout`);
  console.log(`   GET /api/users`);
  console.log(`   POST /api/users`);
  console.log(`   DELETE /api/users/:id`);
  console.log(`   GET /api/activity?action=signin&limit=50\n`);
});

