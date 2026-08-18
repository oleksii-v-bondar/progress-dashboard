import Knex from 'knex';

const db = Knex({
  client: 'pg',
  connection: {
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 5432,
    user: process.env.DB_USER || 'progress',
    password: process.env.DB_PASSWORD || 'progress',
    database: process.env.DB_NAME || 'progress',
  },
});

export default db;
