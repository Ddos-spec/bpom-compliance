//! ==============================================================================
//! TERA COMPLIANCE SERVER (Single Binary Edition)
//! Arsitektur Rust Standar Fanatik:
//! - Zero Unsafe Code
//! - Zero Memory Leak Guarantee
//! - Single Executable Deployment (HTML/JS/Fonts embedded di memori binary)
//! - SQLite Embedded dengan WAL Mode & Persistent Self-Healing Migration
//! ==============================================================================

#![forbid(unsafe_code)]

mod auth;
mod db;
mod error;
mod routes;

use axum::{
    routing::{get, post},
    Router,
};
use std::{net::SocketAddr, sync::Arc};
use tower_http::{
    compression::CompressionLayer,
    cors::{Any, CorsLayer},
    trace::TraceLayer,
};
use tracing::info;

use crate::{db::init_db, routes::AppState};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Inisialisasi Structured Tracing
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "tera_backend=info,tower_http=info".into()),
        )
        .compact()
        .init();

    info!(target: "tera::core", "Memulai Tera Compliance Server (Sekte Fanatik Rust Edition)...");

    let db_url = std::env::var("DATABASE_URL").unwrap_or_else(|_| "sqlite://tera.db".to_string());
    let pool = init_db(&db_url).await?;

    let state = Arc::new(AppState { db: pool });

    // Middleware Stack
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    // Assembly Router API & Embedded Static Handler
    let api_router = Router::new()
        .route("/auth/login", post(routes::login_handler))
        .route("/auth/me", get(routes::me_handler))
        .route("/products", get(routes::list_products_handler))
        .route("/products/sign", post(routes::sign_ba_handler))
        .with_state(state.clone());

    let app = Router::new()
        .nest("/api", api_router)
        .fallback(routes::static_handler)
        .layer(cors)
        .layer(TraceLayer::new_for_http())
        .layer(CompressionLayer::new().gzip(true).br(true));

    let port: u16 = std::env::var("PORT")
        .ok()
        .and_then(|p| p.parse().ok())
        .unwrap_or(4173);

    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    info!(target: "tera::core", "Server mendengarkan di http://{}", addr);

    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await?;

    info!(target: "tera::core", "Server Tera berhasil dimatikan secara bersih (Zero Leak).");
    Ok(())
}

async fn shutdown_signal() {
    let ctrl_c = async {
        tokio::signal::ctrl_c()
            .await
            .expect("gagal menangkap ctrl_c event");
    };

    #[cfg(unix)]
    let terminate = async {
        tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
            .expect("gagal menangkap signal terminate")
            .recv()
            .await;
    };

    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        _ = ctrl_c => { info!(target: "tera::core", "Menerima sinyal Ctrl+C, memulai graceful shutdown..."); },
        _ = terminate => { info!(target: "tera::core", "Menerima sinyal SIGTERM, memulai graceful shutdown..."); },
    }
}
