//! Basis Data SQLite Tertanam (Embedded SQLite Engine)
//! Menggunakan mode WAL (Write-Ahead Logging) untuk zero-maintenance dan konkurensi read-heavy tinggi.

use sqlx::{
    sqlite::{SqliteConnectOptions, SqliteJournalMode, SqlitePoolOptions, SqliteSynchronous},
    Pool, Sqlite,
};
use std::str::FromStr;
use std::time::Duration;
use tracing::info;

use crate::error::AppError;

pub type DbPool = Pool<Sqlite>;

pub async fn init_db(database_url: &str) -> Result<DbPool, AppError> {
    info!(target: "tera::db", "Menginisialisasi SQLite pool dengan WAL mode...");

    let options = SqliteConnectOptions::from_str(database_url)
        .map_err(|e| AppError::Internal(anyhow::anyhow!("Invalid DB URI: {}", e)))?
        .create_if_missing(true)
        .journal_mode(SqliteJournalMode::Wal)
        .synchronous(SqliteSynchronous::Normal)
        .busy_timeout(Duration::from_secs(5))
        .foreign_keys(true);

    let pool = SqlitePoolOptions::new()
        .max_connections(16)
        .min_connections(2)
        .acquire_timeout(Duration::from_secs(3))
        .connect_with(options)
        .await?;

    // Optimasi performa & keandalan jangka panjang (Set-and-Forget)
    sqlx::query(
        r#"
        PRAGMA cache_size = -64000; -- 64MB memory cache
        PRAGMA temp_store = MEMORY;
        PRAGMA mmap_size = 268435456; -- 256MB memory-mapped I/O
        "#,
    )
    .execute(&pool)
    .await?;

    migrate(&pool).await?;

    info!(target: "tera::db", "Basis data siap. Schema termigrasi 100%.");
    Ok(pool)
}

async fn migrate(pool: &DbPool) -> Result<(), AppError> {
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            email TEXT UNIQUE NOT NULL,
            name TEXT NOT NULL,
            nip TEXT NOT NULL,
            role TEXT NOT NULL CHECK(role IN ('petugas', 'auditor', 'admin')),
            password_hash TEXT NOT NULL,
            instansi TEXT NOT NULL,
            jabatan TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS products (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            owner TEXT NOT NULL,
            checked TEXT NOT NULL,
            stage TEXT NOT NULL CHECK(stage IN ('keputusan', 'perbaikan', 'selesai')),
            nie TEXT,
            label_text TEXT NOT NULL,
            image_blob TEXT,
            note TEXT NOT NULL DEFAULT '',
            created_by TEXT REFERENCES users(id),
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS audit_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
            actor_name TEXT NOT NULL,
            actor_nip TEXT NOT NULL,
            action TEXT NOT NULL,
            hash_signature TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS regulations (
            id_data TEXT PRIMARY KEY,
            jenis TEXT NOT NULL,
            no_peraturan TEXT NOT NULL,
            tahun INTEGER NOT NULL,
            judul TEXT NOT NULL,
            status TEXT NOT NULL,
            sumber TEXT NOT NULL,
            sha256_hash TEXT NOT NULL,
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE INDEX IF NOT EXISTS idx_products_stage ON products(stage);
        CREATE INDEX IF NOT EXISTS idx_audit_product ON audit_logs(product_id);
        "#,
    )
    .execute(pool)
    .await?;

    Ok(())
}
