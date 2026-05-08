/* PM2 配置：在服务器上 cd /www/wwwroot/musiczh-api && pm2 start ecosystem.config.cjs */
module.exports = {
  apps: [
    {
      name: 'musiczh-api',
      script: 'node_modules/tsx/dist/cli.mjs',
      args: 'src/index.ts',
      cwd: __dirname,
      env: {
        NODE_ENV: 'production',
        PORT: 8787,
      },
      max_memory_restart: '256M',
      autorestart: true,
      watch: false,
      out_file: './logs/out.log',
      error_file: './logs/err.log',
      merge_logs: true,
      time: true,
    },
  ],
}
