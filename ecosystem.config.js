module.exports = {
  apps: [
    {
      name: 'vcp-toolbox-local',
      script: 'server.js',
      env: {
        CONFIG_PATH: 'config.local.env'
      },
      instances: 1,
      exec_mode: 'fork'
    }
  ]
};