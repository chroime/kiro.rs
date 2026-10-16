use parking_lot::Mutex;
use sha2::{Digest, Sha256};
use std::{
    collections::HashMap,
    sync::Arc,
    time::{Duration, Instant},
};

use super::types::MessagesRequest;

/// Anthropic-compatible cache usage counters for one request.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct CacheUsage {
    pub cache_creation_input_tokens: i32,
    pub cache_read_input_tokens: i32,
}

#[derive(Debug)]
struct CacheEntry {
    cached_input_tokens: i32,
    last_used: Instant,
}

/// Process-local prefix cache accounting.
///
/// The cache stores token counts only. It deliberately does not retain request
/// content, so it can expose standard cache usage fields without retaining
/// user prompts in memory.
#[derive(Clone, Debug)]
pub struct VirtualInputCache {
    entries: Arc<Mutex<HashMap<String, CacheEntry>>>,
    ttl: Duration,
    max_entries: usize,
}

impl Default for VirtualInputCache {
    fn default() -> Self {
        Self::with_limits(Duration::from_secs(30 * 60), 10_000)
    }
}

impl VirtualInputCache {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn with_limits(ttl: Duration, max_entries: usize) -> Self {
        Self {
            entries: Arc::new(Mutex::new(HashMap::new())),
            ttl,
            max_entries: max_entries.max(1),
        }
    }

    fn previous_cached_tokens(
        &self,
        entries: &HashMap<String, CacheEntry>,
        key: &str,
        now: Instant,
    ) -> i32 {
        entries
            .get(key)
            .filter(|entry| now.duration_since(entry.last_used) <= self.ttl)
            .map(|entry| entry.cached_input_tokens)
            .unwrap_or(0)
    }

    /// Calculate counters without changing the cache entry.
    ///
    /// A live stream uses this for its initial event and records the
    /// authoritative input count when the upstream stream finishes.
    pub fn preview(&self, key: &str, input_tokens: i32) -> CacheUsage {
        let input_tokens = input_tokens.max(0);
        let entries = self.entries.lock();
        let cache_read = self
            .previous_cached_tokens(&entries, key, Instant::now())
            .min(input_tokens);
        CacheUsage {
            cache_creation_input_tokens: input_tokens - cache_read,
            cache_read_input_tokens: cache_read,
        }
    }

    /// Record the current request and return its cache usage counters.
    pub fn record(&self, key: impl Into<String>, input_tokens: i32) -> CacheUsage {
        let key = key.into();
        let input_tokens = input_tokens.max(0);
        let now = Instant::now();
        let mut entries = self.entries.lock();

        let cache_read = self
            .previous_cached_tokens(&entries, &key, now)
            .min(input_tokens);
        let usage = CacheUsage {
            cache_creation_input_tokens: input_tokens - cache_read,
            cache_read_input_tokens: cache_read,
        };

        if !entries.contains_key(&key) && entries.len() >= self.max_entries {
            if let Some(oldest_key) = entries
                .iter()
                .min_by_key(|(_, entry)| entry.last_used)
                .map(|(entry_key, _)| entry_key.clone())
            {
                entries.remove(&oldest_key);
            }
        }

        entries.insert(
            key,
            CacheEntry {
                cached_input_tokens: input_tokens,
                last_used: now,
            },
        );

        usage
    }
}

/// Build a stable cache key without retaining the request content.
pub fn cache_key(payload: &MessagesRequest) -> String {
    let first_user_message = payload
        .messages
        .iter()
        .find(|message| message.role.eq_ignore_ascii_case("user"))
        .map(|message| &message.content);
    let material = serde_json::json!({
        "model": payload.model,
        "user_id": payload.metadata.as_ref().and_then(|metadata| metadata.user_id.as_deref()),
        "system": payload.system,
        "tools": payload.tools,
        "first_user_message": first_user_message,
    });
    let serialized = serde_json::to_vec(&material).unwrap_or_default();
    let mut hasher = Sha256::new();
    hasher.update(serialized);
    format!("v1:{}", hex::encode(hasher.finalize()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn first_request_creates_cache_without_reading() {
        let cache = VirtualInputCache::with_limits(std::time::Duration::from_secs(60), 10);

        let usage = cache.record("conversation-1", 100);

        assert_eq!(usage.cache_read_input_tokens, 0);
        assert_eq!(usage.cache_creation_input_tokens, 100);
    }

    #[test]
    fn repeated_request_reads_previous_prefix_and_writes_only_new_tokens() {
        let cache = VirtualInputCache::with_limits(std::time::Duration::from_secs(60), 10);

        cache.record("conversation-1", 100);
        let usage = cache.record("conversation-1", 120);

        assert_eq!(usage.cache_read_input_tokens, 100);
        assert_eq!(usage.cache_creation_input_tokens, 20);
    }

    #[test]
    fn preview_does_not_consume_or_replace_the_cached_prefix() {
        let cache = VirtualInputCache::with_limits(std::time::Duration::from_secs(60), 10);

        cache.record("conversation-1", 100);
        let preview = cache.preview("conversation-1", 120);
        let recorded = cache.record("conversation-1", 120);

        assert_eq!(preview, recorded);
        assert_eq!(recorded.cache_read_input_tokens, 100);
        assert_eq!(recorded.cache_creation_input_tokens, 20);
    }

    #[test]
    fn shorter_request_never_reports_more_cache_than_input() {
        let cache = VirtualInputCache::with_limits(std::time::Duration::from_secs(60), 10);

        cache.record("conversation-1", 120);
        let usage = cache.record("conversation-1", 80);

        assert_eq!(usage.cache_read_input_tokens, 80);
        assert_eq!(usage.cache_creation_input_tokens, 0);
    }

    #[test]
    fn expired_entries_start_with_cache_creation_again() {
        let cache = VirtualInputCache::with_limits(std::time::Duration::from_millis(1), 10);

        cache.record("conversation-1", 100);
        std::thread::sleep(std::time::Duration::from_millis(5));
        let usage = cache.record("conversation-1", 100);

        assert_eq!(usage.cache_read_input_tokens, 0);
        assert_eq!(usage.cache_creation_input_tokens, 100);
    }

    #[test]
    fn cache_evicts_oldest_entry_when_capacity_is_reached() {
        let cache = VirtualInputCache::with_limits(std::time::Duration::from_secs(60), 1);

        cache.record("conversation-1", 100);
        cache.record("conversation-2", 200);
        let usage = cache.record("conversation-1", 100);

        assert_eq!(usage.cache_read_input_tokens, 0);
        assert_eq!(usage.cache_creation_input_tokens, 100);
    }

    #[test]
    fn cache_key_changes_for_model_or_stable_prompt_context() {
        let base = serde_json::from_value::<MessagesRequest>(serde_json::json!({
            "model": "claude-sonnet-4-5-20250929",
            "max_tokens": 100,
            "messages": [{"role": "user", "content": "hello"}],
            "stream": false
        }))
        .unwrap();
        let mut other_model = serde_json::from_value::<MessagesRequest>(serde_json::json!({
            "model": "claude-opus-4-6",
            "max_tokens": 100,
            "messages": [{"role": "user", "content": "hello"}],
            "stream": false
        }))
        .unwrap();
        other_model.metadata = base.metadata.clone();

        assert_ne!(cache_key(&base), cache_key(&other_model));
    }
}
