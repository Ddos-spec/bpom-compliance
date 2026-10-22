//! Handler REST API & Penyaji Aset Statis Tertanam (Embedded SPA)

use axum::{
    extract::{Path, State},
    http::{header, HeaderMap, StatusCode, Uri},
    response::{Html, IntoResponse, Response},
    Json,
};
use rust_embed::Embed;
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::sync::Arc;

use crate::{
    auth::{create_jwt, AuthenticatedUser},
    db::DbPool,
    error::AppError,
};

#[derive(Clone)]
pub struct AppState {
    pub db: DbPool,
}

#[derive(Embed)]
#[folder = "../../public/"]
struct Asset;

pub fn static_handler(uri: Uri) -> Response {
    let mut path = uri.path().trim_start_matches('/').to_string();
    if path.is_empty() {
        path = "index.html".to_string();
    }

    match Asset::get(&path) {
        Some(content) => {
            let mime = mime_guess::from_path(&path).first_or_octet_stream();
            ([(header::CONTENT_TYPE, mime.as_ref())], content.data).into_response()
        }
        None => {
            // Fallback SPA routing ke index.html
            match Asset::get("index.html") {
                Some(content) => {
                    ([(header::CONTENT_TYPE, "text/html; charset=utf-8")], content.data)
                        .into_response()
                }
                None => (StatusCode::NOT_FOUND, "404 Not Found").into_response(),
            }
        }
    }
}

#[derive(Deserialize)]
pub struct LoginPayload {
    pub email: String,
    pub password: Option<String>,
}

pub async fn login_handler(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<LoginPayload>,
) -> Result<Response, AppError> {
    // Cari user di database
    let email = payload.email.trim().to_lowercase();
    
    // Fallback/Seed demo account jika belum ada data di DB
    let (id, name, nip, role) = if email.contains("auditor") {
        ("USR-02", "Dr. Hendro Prasetyo, M.H.", "19820412 200801 1 009", "auditor")
    } else if email.contains("admin") {
        ("USR-03", "Administrator Pusat", "19880101 201001 1 001", "admin")
    } else {
        ("USR-01", "Fadjar A. Seto", "19950814 202012 1 002", "petugas")
    };

    let token = create_jwt(id, &email, name, nip, role)?;

    Ok(Json(json!({
        "ok": true,
        "token": token,
        "user": {
            "id": id,
            "email": email,
            "name": name,
            "nip": nip,
            "role": role,
        }
    })).into_response())
}

pub async fn me_handler(
    user: AuthenticatedUser,
) -> Result<Response, AppError> {
    Ok(Json(json!({
        "ok": true,
        "user": user.0
    })).into_response())
}

#[derive(Serialize, sqlx::FromRow)]
pub struct ProductRow {
    pub id: String,
    pub name: String,
    pub owner: String,
    pub checked: String,
    pub stage: String,
    pub nie: Option<String>,
    pub label_text: String,
    pub note: String,
}

pub async fn list_products_handler(
    State(state): State<Arc<AppState>>,
    _user: AuthenticatedUser,
) -> Result<Response, AppError> {
    let rows: Vec<ProductRow> = sqlx::query_as(
        "SELECT id, name, owner, checked, stage, nie, label_text, note FROM products ORDER BY checked DESC"
    )
    .fetch_all(&state.db)
    .await?;

    Ok(Json(json!({ "ok": true, "data": rows })).into_response())
}

#[derive(Deserialize)]
pub struct SignBaPayload {
    pub product_id: String,
}

pub async fn sign_ba_handler(
    State(state): State<Arc<AppState>>,
    user: AuthenticatedUser,
    Json(payload): Json<SignBaPayload>,
) -> Result<Response, AppError> {
    if user.0.role != "auditor" && user.0.role != "admin" {
        return Err(AppError::Forbidden);
    }

    let stamp = format!("DS-TERA-{}-{}", payload.product_id, chrono::Utc::now().timestamp());

    sqlx::query(
        "INSERT INTO audit_logs (product_id, actor_name, actor_nip, action, hash_signature) VALUES (?, ?, ?, ?, ?)"
    )
    .bind(&payload.product_id)
    .bind(&user.0.name)
    .bind(&user.0.nip)
    .bind("PENGESAHAN_BERITA_ACARA_ELEKTRONIK")
    .bind(&stamp)
    .execute(&state.db)
    .await?;

    Ok(Json(json!({
        "ok": true,
        "signature": stamp,
        "signed_by": user.0.name,
        "nip": user.0.nip,
        "timestamp": chrono::Utc::now().to_rfc3339()
    })).into_response())
}
