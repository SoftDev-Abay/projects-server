const { Pool } = require("pg");

const pool = new Pool({
  user: "postgres",
  host: "localhost",
  database: "db_projects",
  password: "031216551248",
  port: 5432, // default PostgreSQL port
});

module.exports = pool;
