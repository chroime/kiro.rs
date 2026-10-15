//! 凭据可复用的代理库。
//!
//! 代理库单独保存于 config 目录中的 `proxies.json`。凭据只保存代理 ID，
//! 请求时动态解析代理库，因此修改一个代理条目会立即作用于所有引用它的凭据。

use std::fs;
use std::path::PathBuf;
use std::sync::Arc;

use parking_lot::RwLock;
use serde::{Deserialize, Serialize};

use crate::http_client::ProxyConfig;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ParsedProxy {
    pub url: String,
    pub username: Option<String>,
    pub password: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProxyProfile {
    pub id: u64,
    pub name: String,
    pub url: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub username: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub password: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProxyProfileStatus {
    pub id: u64,
    pub name: String,
    pub url: String,
    pub username: Option<String>,
    pub has_password: bool,
}

pub struct ProxyPool {
    path: Option<PathBuf>,
    entries: RwLock<Vec<ProxyProfile>>,
}

impl ProxyPool {
    pub fn empty() -> Self {
        Self {
            path: None,
            entries: RwLock::new(Vec::new()),
        }
    }

    pub fn in_memory() -> Arc<Self> {
        Arc::new(Self::empty())
    }

    pub fn load(path: impl Into<PathBuf>) -> anyhow::Result<Arc<Self>> {
        let path = path.into();
        let entries = if path.exists() {
            let content = fs::read_to_string(&path)?;
            if content.trim().is_empty() {
                Vec::new()
            } else {
                serde_json::from_str(&content)?
            }
        } else {
            Vec::new()
        };
        validate_entries(&entries)?;
        Ok(Arc::new(Self {
            path: Some(path),
            entries: RwLock::new(entries),
        }))
    }

    pub fn status(&self) -> Vec<ProxyProfileStatus> {
        self.entries
            .read()
            .iter()
            .map(|entry| ProxyProfileStatus {
                id: entry.id,
                name: entry.name.clone(),
                url: entry.url.clone(),
                username: entry.username.clone(),
                has_password: entry.password.is_some(),
            })
            .collect()
    }

    pub fn get(&self, id: u64) -> Option<ProxyProfile> {
        self.entries.read().iter().find(|entry| entry.id == id).cloned()
    }

    pub fn contains(&self, id: u64) -> bool {
        self.entries.read().iter().any(|entry| entry.id == id)
    }

    pub fn to_config(&self, id: u64) -> Option<ProxyConfig> {
        let entry = self.get(id)?;
        let mut config = ProxyConfig::new(entry.url);
        if let (Some(username), Some(password)) = (entry.username, entry.password) {
            config = config.with_auth(username, password);
        }
        Some(config)
    }

    pub fn add(&self, name: String, proxy: String) -> anyhow::Result<u64> {
        let name = normalize_name(name)?;
        let parsed = parse_proxy_input(&proxy)?;
        let mut entries = self.entries.write();
        if entries.iter().any(|entry| {
            entry.url == parsed.url
                && entry.username == parsed.username
                && entry.password == parsed.password
        }) {
            anyhow::bail!("代理已存在");
        }
        let id = entries.iter().map(|entry| entry.id).max().unwrap_or(0) + 1;
        entries.push(ProxyProfile {
            id,
            name,
            url: parsed.url,
            username: parsed.username,
            password: parsed.password,
        });
        drop(entries);
        self.persist()?;
        Ok(id)
    }

    pub fn update(
        &self,
        id: u64,
        name: String,
        proxy: String,
        username: Option<String>,
        password: Option<String>,
    ) -> anyhow::Result<()> {
        let name = normalize_name(name)?;
        let parsed = parse_proxy_input(&proxy)?;
        let mut entries = self.entries.write();
        let entry = entries
            .iter_mut()
            .find(|entry| entry.id == id)
            .ok_or_else(|| anyhow::anyhow!("代理不存在: {}", id))?;
        entry.name = name;
        entry.url = parsed.url;
        if parsed.username.is_some() || username.is_some() {
            entry.username = username.or(parsed.username);
        }
        if parsed.password.is_some() || password.is_some() {
            entry.password = password.or(parsed.password);
        }
        drop(entries);
        self.persist()?;
        Ok(())
    }

    pub fn remove(&self, id: u64) -> anyhow::Result<()> {
        let mut entries = self.entries.write();
        let old_len = entries.len();
        entries.retain(|entry| entry.id != id);
        if entries.len() == old_len {
            anyhow::bail!("代理不存在: {}", id);
        }
        drop(entries);
        self.persist()?;
        Ok(())
    }

    fn persist(&self) -> anyhow::Result<()> {
        let Some(path) = &self.path else {
            return Ok(());
        };
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)?;
        }
        let json = serde_json::to_string_pretty(&*self.entries.read())?;
        fs::write(path, json)?;
        Ok(())
    }
}

fn normalize_name(name: String) -> anyhow::Result<String> {
    let name = name.trim().to_string();
    if name.is_empty() {
        anyhow::bail!("代理名称不能为空");
    }
    Ok(name)
}

fn validate_entries(entries: &[ProxyProfile]) -> anyhow::Result<()> {
    let mut ids = std::collections::HashSet::new();
    for entry in entries {
        if !ids.insert(entry.id) {
            anyhow::bail!("代理库存在重复 ID: {}", entry.id);
        }
        let parsed = parse_proxy_input(&entry.url)?;
        if parsed.url != entry.url {
            anyhow::bail!("代理 #{} 的 URL 未规范化", entry.id);
        }
    }
    Ok(())
}

/// 解析：用户名:密码@主机:端口、主机:端口:用户名:密码，
/// 以及带协议的 http(s)/socks5 URL。
pub fn parse_proxy_input(input: &str) -> anyhow::Result<ParsedProxy> {
    let input = input.trim();
    if input.is_empty() {
        anyhow::bail!("代理地址不能为空");
    }

    let (scheme, authority) = if let Some((scheme, rest)) = input.split_once("://") {
        let scheme = scheme.to_ascii_lowercase();
        if !matches!(scheme.as_str(), "http" | "https" | "socks5" | "socks5h") {
            anyhow::bail!("代理协议必须是 http、https、socks5 或 socks5h");
        }
        (scheme, rest)
    } else {
        ("http".to_string(), input)
    };

    let (userinfo, host_port) = if let Some((userinfo, host_port)) = authority.split_once('@') {
        (Some(userinfo), host_port)
    } else {
        (None, authority)
    };

    let (host, port, username, password) = if let Some(userinfo) = userinfo {
        let (username, password) = userinfo
            .split_once(':')
            .ok_or_else(|| anyhow::anyhow!("代理认证必须是 用户名:密码"))?;
        let (host, port) = split_host_port(host_port)?;
        (host, port, Some(username.to_string()), Some(password.to_string()))
    } else {
        let parts: Vec<&str> = host_port.splitn(4, ':').collect();
        if parts.len() == 4 {
            let port = parts[1]
                .parse::<u16>()
                .map_err(|_| anyhow::anyhow!("代理端口无效"))?;
            validate_host(parts[0], port)?;
            (
                parts[0].to_string(),
                port,
                Some(parts[2].to_string()),
                Some(parts[3].to_string()),
            )
        } else {
            let (host, port) = split_host_port(host_port)?;
            (host, port, None, None)
        }
    };

    if username.as_deref().is_some_and(str::is_empty)
        || password.as_deref().is_some_and(str::is_empty)
    {
        anyhow::bail!("代理用户名和密码不能为空");
    }

    Ok(ParsedProxy {
        url: format!("{}://{}:{}", scheme, host, port),
        username,
        password,
    })
}

fn split_host_port(host_port: &str) -> anyhow::Result<(String, u16)> {
    let (host, port) = host_port
        .rsplit_once(':')
        .ok_or_else(|| anyhow::anyhow!("代理地址必须包含 主机:端口"))?;
    let port = port
        .parse::<u16>()
        .map_err(|_| anyhow::anyhow!("代理端口无效"))?;
    validate_host(host, port)?;
    Ok((host.to_string(), port))
}

fn validate_host(host: &str, port: u16) -> anyhow::Result<()> {
    if host.trim().is_empty() || port == 0 || host.contains('/') || host.contains('@') {
        anyhow::bail!("代理主机或端口无效");
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_userinfo_at_host_port_format() {
        let parsed = parse_proxy_input("stclFzVQAnKQN:stchOMi5pxSAz@72.245.138.160:7085").unwrap();
        assert_eq!(parsed.url, "http://72.245.138.160:7085");
        assert_eq!(parsed.username.as_deref(), Some("stclFzVQAnKQN"));
        assert_eq!(parsed.password.as_deref(), Some("stchOMi5pxSAz"));
    }

    #[test]
    fn parses_host_port_user_password_format() {
        let parsed = parse_proxy_input("72.245.138.160:7085:stclFzVQAnKQN:stchOMi5pxSAz").unwrap();
        assert_eq!(parsed.url, "http://72.245.138.160:7085");
        assert_eq!(parsed.username.as_deref(), Some("stclFzVQAnKQN"));
        assert_eq!(parsed.password.as_deref(), Some("stchOMi5pxSAz"));
    }

    #[test]
    fn parses_explicit_scheme_and_credentials() {
        let parsed = parse_proxy_input("https://alice:secret@example.com:8443").unwrap();
        assert_eq!(parsed.url, "https://example.com:8443");
        assert_eq!(parsed.username.as_deref(), Some("alice"));
        assert_eq!(parsed.password.as_deref(), Some("secret"));
    }

    #[test]
    fn accepts_socks5h_scheme() {
        let parsed = parse_proxy_input("socks5h://127.0.0.1:1080").unwrap();
        assert_eq!(parsed.url, "socks5h://127.0.0.1:1080");
        assert_eq!(parsed.username, None);
        assert_eq!(parsed.password, None);
    }

    #[test]
    fn rejects_incomplete_proxy_input() {
        assert!(parse_proxy_input("user:pass@72.245.138.160").is_err());
        assert!(parse_proxy_input("72.245.138.160:not-a-port").is_err());
    }

    #[test]
    fn proxy_pool_round_trip_keeps_password_private_in_status() {
        let pool = ProxyPool::in_memory();
        let id = pool.add("测试代理".to_string(), "user:pass@127.0.0.1:8080".to_string()).unwrap();
        let status = pool.status().into_iter().find(|item| item.id == id).unwrap();
        assert_eq!(status.name, "测试代理");
        assert!(status.has_password);
        assert!(!serde_json::to_string(&status).unwrap().contains("pass"));
        assert_eq!(pool.get(id).unwrap().username.as_deref(), Some("user"));
    }

    #[test]
    fn rejects_duplicate_proxy_credentials() {
        let pool = ProxyPool::in_memory();
        pool.add("代理一".to_string(), "user:pass@127.0.0.1:8080".to_string())
            .unwrap();
        let error = pool
            .add("代理二".to_string(), "http://user:pass@127.0.0.1:8080".to_string())
            .unwrap_err();
        assert!(error.to_string().contains("代理已存在"));
    }
}
