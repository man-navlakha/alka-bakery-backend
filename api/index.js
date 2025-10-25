import app from '../src/app.js';
import http from 'http';
const port = process.env.PORT || 3000;
const server = http.createServer(app);
server.listen(port, () => {
  console.log(`🍰 Alka Bakery API listening on port ${port}`);
});
// Keep default export for Vercel compatibility (if Vercel uses the exported app)
export default server;
