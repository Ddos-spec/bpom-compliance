//! Tera Core Error Architecture
//! Menyediakan pemetaan error yang aman tanpa membocorkan trace internal ke client.

use axum::{
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde_json::json;
use thiserror::Error;

#[derive(Error, Debug)]
pub enum AppError {
    #[error("Autentikasi gagal: {0}")]
    Unauthorized(String),

    #[error("Akses ditolak: izin tidak mencukupi untuk peran ini")]
    Forbidden,

    #[error("Entitas tidak ditemukan: {0}")]
    NotFound(String),

    #[error("Validasi gagal: {0}")]
    BadRequest(String),

    #[error("Kesalahan database SQLite: {0}")]
    Database(#[from] sqlx::Error),

    #[error("Kesalahan kriptografi/hashing: {0}")]
    Crypto(String),

    #[error("Kesalahan internal server")]
    Internal(#[from] anyhow::Error),
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let (status, err_msg) = match self {
            Self::Unauthorized(msg) => (StatusCode::UNAUTHORIZED, msg),
            Self::Forbidden => (StatusCode::FORBIDDEN, "Akses ditolak.".to_string()),
            Self::NotFound(msg) => (StatusCode::NOT_FOUND, msg),
            Self::BadRequest(msg) => (StatusCode::BAD_REQUEST, msg),
            Self::Database(ref e) => {
                tracing::error!(target: "tera::db", error = %e, "Database query fault");
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "Kesalahan integritas basis data.".to_string(),
                )
            }
            Self::Crypto(ref e) => {
                tracing::error!(target: "tera::crypto", error = %e, "Crypto verification fault");
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "Gagal memproses verifikasi kriptografis.".to_string(),
                )
            }
            Self::Internal(ref e) => {
                tracing::error!(target: "tera::internal", error = %e, "Unhandled internal fault");
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "Terjadi kesalahan pada layanan Tera.".to_string(),
                )
            }
        };

        let body = Json(json!({
            "ok": false,
            "error": err_msg,
            "status_code": status.as_u16(),
        }));

        (status, body).into_response()
    }
}
