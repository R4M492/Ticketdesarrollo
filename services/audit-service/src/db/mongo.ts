import { MongoClient, type Db } from "mongodb";

let client: MongoClient | null = null;
let db: Db | null = null;

/** Conexión perezosa y reutilizada a la base Mongo propia de audit-service (una conexión por proceso). */
export async function getDb(): Promise<Db> {
  if (db) return db;

  const uri = process.env.MONGO_URI;
  const dbName = process.env.MONGO_DB_NAME ?? "audit_db";
  if (!uri) throw new Error("Falta la variable de entorno MONGO_URI");

  client = new MongoClient(uri);
  await client.connect();
  db = client.db(dbName);
  return db;
}

export async function closeDb(): Promise<void> {
  await client?.close();
  client = null;
  db = null;
}
