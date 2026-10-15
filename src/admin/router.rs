//! Admin API 路由配置

use axum::{
    Router, middleware,
    routing::{delete, get, patch, post},
};

use super::{
    handlers::{
        add_credential, add_proxy, delete_credential, delete_proxy, force_refresh_token,
        get_all_credentials, get_credential_balance, get_load_balancing_mode, get_proxies,
        reset_failure_count, set_credential_disabled, set_credential_priority,
        set_load_balancing_mode, test_proxy, update_credential_proxy, update_proxy_profile,
    },
    middleware::{AdminState, admin_auth_middleware},
};

/// 创建 Admin API 路由
///
/// # 端点
/// - `GET /credentials` - 获取所有凭据状态
/// - `POST /credentials` - 添加新凭据
/// - `DELETE /credentials/:id` - 删除凭据
/// - `POST /credentials/:id/disabled` - 设置凭据禁用状态
/// - `POST /credentials/:id/priority` - 设置凭据优先级
/// - `POST /credentials/:id/reset` - 重置失败计数
/// - `POST /credentials/:id/refresh` - 强制刷新 Token
/// - `GET /credentials/:id/balance` - 获取凭据余额
/// - `PATCH /credentials/:id/proxy` - 为凭据选择代理库条目或设置内联代理
/// - `GET /proxies` - 获取代理库
/// - `POST /proxies` - 添加代理库条目
/// - `PATCH /proxies/:id` - 修改代理库条目
/// - `DELETE /proxies/:id` - 删除未被引用的代理库条目
/// - `POST /proxies/:id/test` - 测试代理连通性、延迟和出口位置
/// - `GET /config/load-balancing` - 获取负载均衡模式
/// - `PUT /config/load-balancing` - 设置负载均衡模式
///
/// # 认证
/// 需要 Admin API Key 认证，支持：
/// - `x-api-key` header
/// - `Authorization: Bearer <token>` header
pub fn create_admin_router(state: AdminState) -> Router {
    Router::new()
        .route(
            "/credentials",
            get(get_all_credentials).post(add_credential),
        )
        .route("/credentials/{id}", delete(delete_credential))
        .route("/credentials/{id}/disabled", post(set_credential_disabled))
        .route("/credentials/{id}/priority", post(set_credential_priority))
        .route("/credentials/{id}/proxy", patch(update_credential_proxy))
        .route("/credentials/{id}/reset", post(reset_failure_count))
        .route("/credentials/{id}/refresh", post(force_refresh_token))
        .route("/credentials/{id}/balance", get(get_credential_balance))
        .route("/proxies", get(get_proxies).post(add_proxy))
        .route(
            "/proxies/{id}",
            patch(update_proxy_profile).delete(delete_proxy),
        )
        .route("/proxies/{id}/test", post(test_proxy))
        .route(
            "/config/load-balancing",
            get(get_load_balancing_mode).put(set_load_balancing_mode),
        )
        .layer(middleware::from_fn_with_state(
            state.clone(),
            admin_auth_middleware,
        ))
        .with_state(state)
}
