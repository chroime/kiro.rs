// 凭据状态响应
export interface CredentialsStatusResponse {
  total: number
  available: number
  currentId: number
  credentials: CredentialStatusItem[]
}

// 单个凭据状态
export interface CredentialStatusItem {
  id: number
  priority: number
  disabled: boolean
  failureCount: number
  isCurrent: boolean
  expiresAt: string | null
  authMethod: string | null
  hasProfileArn: boolean
  email?: string
  refreshTokenHash?: string
  apiKeyHash?: string
  maskedApiKey?: string
  successCount: number
  lastUsedAt: string | null
  hasProxy: boolean
  proxyUrl?: string
  proxyId?: number
  proxyName?: string
  refreshFailureCount: number
  disabledReason?: string
  endpoint: string
}

// 余额响应
export interface BalanceResponse {
  id: number
  subscriptionTitle: string | null
  currentUsage: number
  usageLimit: number
  remaining: number
  usagePercentage: number
  nextResetAt: number | null
}

// 成功响应
export interface SuccessResponse {
  success: boolean
  message: string
}

// 错误响应
export interface AdminErrorResponse {
  error: {
    type: string
    message: string
  }
}

// 请求类型
export interface SetDisabledRequest {
  disabled: boolean
}

export interface SetPriorityRequest {
  priority: number
}

// 修改凭据级代理配置请求
export interface UpdateProxyRequest {
  proxyId?: number
  proxyUrl?: string
  proxyUsername?: string
  proxyPassword?: string
  clear?: boolean
}

export interface ProxyProfileStatus {
  id: number
  name: string
  url: string
  username?: string
  hasPassword: boolean
}

export interface ProxyTestResponse {
  proxyId: number
  success: boolean
  latencyMs?: number
  ipAddress?: string
  country?: string
  countryCode?: string
  region?: string
  city?: string
  locationError?: string
  message: string
}

export interface CreateProxyRequest {
  name: string
  proxy: string
}

export interface UpdateProxyProfileRequest {
  name: string
  proxy: string
  username?: string
  password?: string
}

export interface AddProxyResponse extends SuccessResponse {
  proxyId: number
}

// 添加凭据请求
export interface AddCredentialRequest {
  refreshToken?: string
  authMethod?: 'social' | 'idc' | 'api_key'
  clientId?: string
  clientSecret?: string
  priority?: number
  authRegion?: string
  apiRegion?: string
  machineId?: string
  proxyUrl?: string
  proxyUsername?: string
  proxyPassword?: string
  kiroApiKey?: string
  endpoint?: string
}

// 添加凭据响应
export interface AddCredentialResponse {
  success: boolean
  message: string
  credentialId: number
  email?: string
}
