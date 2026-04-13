module.exports = {
  apps: [
    {
      name: 'vcp-main',
      script: 'server.js',
      cwd: __dirname,
      autorestart: false,
      max_memory_restart: '1500M',
      kill_timeout: 15000,
    },
    {
      name: 'vcp-admin',
      script: 'adminServer.js',
      cwd: __dirname,
      autorestart: false,
      max_memory_restart: '512M',
      kill_timeout: 5000,
    },
  ],
};
