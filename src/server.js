const { createApp } = require('./app');
const { logger } = require('./lib/logger');

const PORT = process.env.PORT || 3000;
const { app } = createApp();

app.listen(PORT, () => {
  logger.info({ port: PORT }, 'page-pulse listening');
});
