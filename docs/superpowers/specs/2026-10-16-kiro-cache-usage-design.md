# kiro.rs 缓存 usage 设计

## 目标

让通过 kiro.rs `/v1/messages` 和 `/cc/v1/messages` 的下游，在标准 Anthropic `usage` 字段中看到缓存创建和缓存读取 token 数量。实现只修改 kiro.rs，不要求 Sub 或其他下游修改。

## 方案

kiro.rs 增加进程内的虚拟前缀缓存统计器。缓存项只保存缓存键、最近一次已缓存 token 数和最后使用时间，不保存消息正文。

缓存键按以下优先级构造：

1. 请求 `metadata.user_id`（如果存在）；
2. 否则使用模型、系统提示词、工具定义和第一条用户消息的稳定指纹。

缓存键同时包含模型及系统/工具配置，避免不同模型或不同提示词共用缓存统计。缓存项设置空闲过期时间和最大数量上限。

对每次请求：

- 首次命中缓存键：`cache_read_input_tokens = 0`，`cache_creation_input_tokens = input_tokens`；
- 已有缓存：读取量为当前输入与上次缓存 token 数的较小值，写入量为当前输入减去读取量；
- 请求完成后将当前输入 token 数登记为该键的缓存前缀，供后续请求读取。

非流式响应在解析完上游 `contextUsageEvent` 后登记实际输入 token。普通流式响应先在 `message_start` 提供预览值，流结束时使用实际上下文 token 重新登记，并在最终 `message_delta.usage` 中发送校正值；Claude Code 缓冲流则在发送事件前直接使用校正值。

缓存读取和创建字段与 `input_tokens` 分开返回，普通输入 token 不重复累加缓存读取量。

## 响应位置

- 非流式 `/v1/messages`：顶层响应 `usage` 增加两个标准字段；
- 流式 `/v1/messages` 和 `/cc/v1/messages`：`message_start.message.usage` 增加两个标准字段；
- WebSearch 兼容路径沿用已有标准字段，并使用同一缓存统计器。

## 并发与生命周期

缓存统计器通过 `Arc` 放进 Anthropic `AppState`，请求之间共享。更新操作在同步锁内完成，单次请求只保存整数和时间戳。服务重启后缓存统计清空，第一轮请求重新产生缓存写入，这是预期行为。

## 验证

- 单元测试覆盖首次请求、同键第二次请求、输入增长、输入缩短、过期和容量淘汰；
- 响应构造测试覆盖非流式和流式 usage 字段；
- Rust 全量测试、管理端构建、线上容器健康检查和公开 Admin 页面检查。
