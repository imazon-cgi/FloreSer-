/** PM2 Ecosystem – FloreSer (Earth Engine + UTF-8 fix) */
module.exports = {
  apps: [
    {
      name: "floreser",
      script: "./server.js",
      cwd: __dirname,

      // 1 processo (EE não combina com cluster)
      exec_mode: "fork",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "600M",
      exp_backoff_restart_delay: 2000,
      log_date_format: "YYYY-MM-DD HH:mm:ss.SSS",

      // Se quiser logs dentro do projeto, descomente abaixo
      // out_file: "./logs/floreser-out.log",
      // error_file: "./logs/floreser-error.log",
      // combine_logs: true,

      env: {
        NODE_ENV: "development",
        PORT: 3003,

        // ⬇️ O server.js usa isto pra definir o charset dos arquivos de texto/CSV
        TEXT_CHARSET: "utf-8",

        // ⬇️ Como decodificar CSV/GeoJSON em disco ao ler (troque para 'latin1' se seu arquivo estiver em ISO-8859-1)
        CSV_SOURCE_ENCODING: "utf-8",

        // ⬇️ Credencial do Earth Engine (caminho relativo ao projeto)
        GOOGLE_APPLICATION_CREDENTIALS: "./privatekey.json",
        EE_ACCOUNT_EMAIL: "", // opcional: e-mail do service account, se você usar no server.js
        EE_PROJECT: ""        // opcional: ID do projeto GEE (se o server.js usar)
      },

      env_production: {
        NODE_ENV: "production",
        PORT: 3003,
        TEXT_CHARSET: "utf-8",
        CSV_SOURCE_ENCODING: "utf-8",
        GOOGLE_APPLICATION_CREDENTIALS: "./privatekey.json",
        EE_ACCOUNT_EMAIL: "",
        EE_PROJECT: ""
      }
    }
  ]
};
