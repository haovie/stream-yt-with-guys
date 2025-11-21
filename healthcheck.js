const http = require('http');

const options = {
  hostname: 'localhost',
  port: process.env.PORT || 3000,
  path: '/',
  method: 'GET'
};

const req = http.request(options, (res) => {
  if (res.statusCode >= 200 && res.statusCode < 400) {
    console.log('Health check passed');
    process.exit(0);
  } else {
    console.log('Health check failed');
    process.exit(1);
  }
});

req.on('error', (err) => {
  console.log('Health check failed:', err.message);
  process.exit(1);
});

req.setTimeout(2000, () => {
  console.log('Health check timeout');
  req.destroy();
  process.exit(1);
});

req.end();
