const fs = require('fs');
const path = require('path');
const serverPath = path.join(__dirname, 'src', 'server.ts');
let content = fs.readFileSync(serverPath, 'utf8');

const target = "app.use(express.json({ limit: '1mb' }));";

const middleware = `app.use(express.json({ limit: '1mb' }));

  // Global Maintenance Mode Middleware
  app.use(async (req, res, next) => {
    // Allow admin and status endpoints
    if (req.path.startsWith('/api/admin') || req.path === '/api/system/status') {
      return next();
    }
    try {
      const { data } = await supabase.from('system_config').select('value').eq('key', 'maintenanceMode').maybeSingle();
      if (data?.value === 'true') {
        return res.status(503).json({ error: 'Service is temporarily down for maintenance. Please check back soon.' });
      }
    } catch (e) {
      // Ignore errors so the app doesn't crash if DB fails
    }
    next();
  });`;

content = content.replace(target, middleware);

fs.writeFileSync(serverPath, content, 'utf8');
console.log('Successfully added maintenance middleware!');
