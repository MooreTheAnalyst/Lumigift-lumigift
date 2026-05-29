import { Client } from "pg";
import fs from "fs";
import path from "path";
import { serverConfig } from "../src/server/config";

async function runMigrations() {
  const client = new Client({
    connectionString: serverConfig.database.url,
  });

  try {
    await client.connect();
    console.log("Connected to database.");

    // Create migrations table if it doesn't exist
    await client.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        executed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    const migrationsDir = path.join(__dirname, "../migrations");
    const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort();

    for (const file of files) {
      const { rows } = await client.query("SELECT 1 FROM _migrations WHERE name = $1", [file]);
      if (rows.length === 0) {
        console.log(`Executing migration: ${file}`);
        const sql = fs.readFileSync(path.join(migrationsDir, file), "utf8");
        
        await client.query("BEGIN");
        try {
          await client.query(sql);
          await client.query("INSERT INTO _migrations (name) VALUES ($1)", [file]);
          await client.query("COMMIT");
          console.log(`Successfully executed ${file}`);
        } catch (err) {
          await client.query("ROLLBACK");
          console.error(`Error executing ${file}:`, err);
          process.exit(1);
        }
      } else {
        console.log(`Skipping already executed migration: ${file}`);
      }
    }

    console.log("All migrations completed.");
  } catch (err) {
    console.error("Migration failed:", err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

runMigrations();
