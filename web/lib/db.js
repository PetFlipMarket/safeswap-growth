import postgres from "postgres";

let sql;
export function db() {
  if (!sql) {
    sql = postgres(process.env.SAFESWAP_READONLY_DB_URL, { ssl: "require", max: 1, prepare: false, idle_timeout: 20 });
  }
  return sql;
}
