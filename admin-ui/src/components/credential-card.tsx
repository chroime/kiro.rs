import { useState } from 'react'
import { toast } from 'sonner'
import { RefreshCw, ChevronUp, ChevronDown, Wallet, Trash2, Loader2, Settings2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { CredentialStatusItem, BalanceResponse } from '@/types/api'
import {
  useSetDisabled,
  useSetPriority,
  useResetFailure,
  useDeleteCredential,
  useForceRefreshToken,
  useUpdateCredentialProxy,
  useProxyProfiles,
} from '@/hooks/use-credentials'

interface CredentialCardProps {
  credential: CredentialStatusItem
  onViewBalance: (id: number) => void
  selected: boolean
  onToggleSelect: () => void
  balance: BalanceResponse | null
  loadingBalance: boolean
}

function formatLastUsed(lastUsedAt: string | null): string {
  if (!lastUsedAt) return '从未使用'
  const date = new Date(lastUsedAt)
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  if (diff < 0) return '刚刚'
  const seconds = Math.floor(diff / 1000)
  if (seconds < 60) return `${seconds} 秒前`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes} 分钟前`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} 小时前`
  const days = Math.floor(hours / 24)
  return `${days} 天前`
}

export function CredentialCard({
  credential,
  onViewBalance,
  selected,
  onToggleSelect,
  balance,
  loadingBalance,
}: CredentialCardProps) {
  const displayName = credential.email?.trim() || credential.maskedApiKey || '未记录邮箱'
  const [editingPriority, setEditingPriority] = useState(false)
  const [priorityValue, setPriorityValue] = useState(String(credential.priority))
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [showProxyDialog, setShowProxyDialog] = useState(false)
  const [proxyUrl, setProxyUrl] = useState('')
  const [proxyId, setProxyId] = useState('')
  const [proxyUsername, setProxyUsername] = useState('')
  const [proxyPassword, setProxyPassword] = useState('')

  const setDisabled = useSetDisabled()
  const setPriority = useSetPriority()
  const resetFailure = useResetFailure()
  const deleteCredential = useDeleteCredential()
  const forceRefresh = useForceRefreshToken()
  const updateProxy = useUpdateCredentialProxy()
  const { data: proxyProfiles = [] } = useProxyProfiles()

  const openProxyDialog = () => {
    setProxyUrl(credential.proxyUrl || '')
    setProxyId(credential.proxyId ? String(credential.proxyId) : '')
    setProxyUsername('')
    setProxyPassword('')
    setShowProxyDialog(true)
  }

  const handleUpdateProxy = () => {
    if (!proxyId && !proxyUrl.trim()) {
      toast.error('请输入代理 URL；如需移除代理请点击“清除代理”')
      return
    }
    updateProxy.mutate(
      {
        id: credential.id,
        request: {
          proxyId: proxyId ? Number(proxyId) : undefined,
          proxyUrl: proxyId ? undefined : proxyUrl.trim(),
          proxyUsername: proxyId ? undefined : proxyUsername.trim() || undefined,
          // 留空表示保留服务器中已保存的密码
          proxyPassword: proxyId ? undefined : proxyPassword || undefined,
        },
      },
      {
        onSuccess: (res) => {
          toast.success(res.message)
          setShowProxyDialog(false)
        },
        onError: (err) => {
          toast.error('代理配置更新失败: ' + (err as Error).message)
        },
      }
    )
  }

  const handleClearProxy = () => {
    updateProxy.mutate(
      { id: credential.id, request: { clear: true } },
      {
        onSuccess: (res) => {
          toast.success(res.message)
          setShowProxyDialog(false)
        },
        onError: (err) => {
          toast.error('代理清除失败: ' + (err as Error).message)
        },
      }
    )
  }

  const handleToggleDisabled = () => {
    setDisabled.mutate(
      { id: credential.id, disabled: !credential.disabled },
      {
        onSuccess: (res) => {
          toast.success(res.message)
        },
        onError: (err) => {
          toast.error('操作失败: ' + (err as Error).message)
        },
      }
    )
  }

  const handlePriorityChange = () => {
    const newPriority = parseInt(priorityValue, 10)
    if (isNaN(newPriority) || newPriority < 0) {
      toast.error('优先级必须是非负整数')
      return
    }
    setPriority.mutate(
      { id: credential.id, priority: newPriority },
      {
        onSuccess: (res) => {
          toast.success(res.message)
          setEditingPriority(false)
        },
        onError: (err) => {
          toast.error('操作失败: ' + (err as Error).message)
        },
      }
    )
  }

  const handleReset = () => {
    resetFailure.mutate(credential.id, {
      onSuccess: (res) => {
        toast.success(res.message)
      },
      onError: (err) => {
        toast.error('操作失败: ' + (err as Error).message)
      },
    })
  }

  const handleForceRefresh = () => {
    forceRefresh.mutate(credential.id, {
      onSuccess: (res) => {
        toast.success(res.message)
      },
      onError: (err) => {
        toast.error('刷新失败: ' + (err as Error).message)
      },
    })
  }

  const handleDelete = () => {
    if (!credential.disabled) {
      toast.error('请先禁用凭据再删除')
      setShowDeleteDialog(false)
      return
    }

    deleteCredential.mutate(credential.id, {
      onSuccess: (res) => {
        toast.success(res.message)
        setShowDeleteDialog(false)
      },
      onError: (err) => {
        toast.error('删除失败: ' + (err as Error).message)
      },
    })
  }

  return (
    <>
      <Card className={credential.isCurrent ? 'ring-2 ring-primary' : ''}>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Checkbox
                checked={selected}
                onCheckedChange={onToggleSelect}
              />
              <CardTitle className="text-lg flex items-center gap-2">
                {displayName}
                {credential.isCurrent && (
                  <Badge variant="success">当前</Badge>
                )}
                {credential.disabled && (
                  <Badge variant="destructive">已禁用</Badge>
                )}
                {credential.disabled && credential.disabledReason && (
                  <Badge variant="outline">{credential.disabledReason}</Badge>
                )}
                {credential.authMethod && (
                  <Badge variant="secondary">
                    {credential.authMethod === 'api_key' ? 'API Key' :
                     credential.authMethod === 'idc' ? 'IdC' :
                     credential.authMethod === 'social' ? 'Social' :
                     credential.authMethod}
                  </Badge>
                )}
                {credential.endpoint && (
                  <Badge variant="outline">{credential.endpoint}</Badge>
                )}
              </CardTitle>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">启用</span>
              <Switch
                checked={!credential.disabled}
                onCheckedChange={handleToggleDisabled}
                disabled={setDisabled.isPending}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* 信息网格 */}
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">优先级：</span>
              {editingPriority ? (
                <div className="inline-flex items-center gap-1 ml-1">
                  <Input
                    type="number"
                    value={priorityValue}
                    onChange={(e) => setPriorityValue(e.target.value)}
                    className="w-16 h-7 text-sm"
                    min="0"
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 p-0"
                    onClick={handlePriorityChange}
                    disabled={setPriority.isPending}
                  >
                    ✓
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 p-0"
                    onClick={() => {
                      setEditingPriority(false)
                      setPriorityValue(String(credential.priority))
                    }}
                  >
                    ✕
                  </Button>
                </div>
              ) : (
                <span
                  className="font-medium cursor-pointer hover:underline ml-1"
                  onClick={() => setEditingPriority(true)}
                >
                  {credential.priority}
                  <span className="text-xs text-muted-foreground ml-1">(点击编辑)</span>
                </span>
              )}
            </div>
            <div>
              <span className="text-muted-foreground">失败次数：</span>
              <span className={credential.failureCount > 0 ? 'text-red-500 font-medium' : ''}>
                {credential.failureCount}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground">刷新失败：</span>
              <span className={credential.refreshFailureCount > 0 ? 'text-red-500 font-medium' : ''}>
                {credential.refreshFailureCount}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground">订阅等级：</span>
              <span className="font-medium">
                {loadingBalance ? (
                  <Loader2 className="inline w-3 h-3 animate-spin" />
                ) : balance?.subscriptionTitle || '未知'}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground">成功次数：</span>
              <span className="font-medium">{credential.successCount}</span>
            </div>
            <div className="col-span-2">
              <span className="text-muted-foreground">最后调用：</span>
              <span className="font-medium">{formatLastUsed(credential.lastUsedAt)}</span>
            </div>
            {credential.maskedApiKey && (
              <div className="col-span-2">
                <span className="text-muted-foreground">API Key：</span>
                <span className="font-mono font-medium">{credential.maskedApiKey}</span>
              </div>
            )}
            <div className="col-span-2">
              <span className="text-muted-foreground">剩余用量：</span>
              {loadingBalance ? (
                <span className="text-sm ml-1">
                  <Loader2 className="inline w-3 h-3 animate-spin" /> 加载中...
                </span>
              ) : balance ? (
                <span className="font-medium ml-1">
                  {balance.remaining.toFixed(2)} / {balance.usageLimit.toFixed(2)}
                  <span className="text-xs text-muted-foreground ml-1">
                    ({(100 - balance.usagePercentage).toFixed(1)}% 剩余)
                  </span>
                </span>
              ) : (
                <span className="text-sm text-muted-foreground ml-1">未知</span>
              )}
            </div>
            {credential.hasProxy && (
              <div className="col-span-2">
                <span className="text-muted-foreground">代理：</span>
                <span className="font-medium">{credential.proxyName || credential.proxyUrl}</span>
              </div>
            )}
            {credential.hasProfileArn && (
              <div className="col-span-2">
                <Badge variant="secondary">有 Profile ARN</Badge>
              </div>
            )}
          </div>

          {/* 操作按钮 */}
          <div className="flex flex-wrap gap-2 pt-2 border-t">
            <Button
              size="sm"
              variant="outline"
              onClick={handleReset}
              disabled={resetFailure.isPending || (credential.failureCount === 0 && credential.refreshFailureCount === 0)}
            >
              <RefreshCw className="h-4 w-4 mr-1" />
              重置失败
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handleForceRefresh}
              disabled={forceRefresh.isPending || credential.disabled || credential.authMethod === 'api_key'}
              title={credential.authMethod === 'api_key' ? 'API Key 凭据无需刷新 Token' : credential.disabled ? '已禁用的凭据无法刷新 Token' : '强制刷新 Token'}
            >
              <RefreshCw className={`h-4 w-4 mr-1 ${forceRefresh.isPending ? 'animate-spin' : ''}`} />
              刷新 Token
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                const newPriority = Math.max(0, credential.priority - 1)
                setPriority.mutate(
                  { id: credential.id, priority: newPriority },
                  {
                    onSuccess: (res) => toast.success(res.message),
                    onError: (err) => toast.error('操作失败: ' + (err as Error).message),
                  }
                )
              }}
              disabled={setPriority.isPending || credential.priority === 0}
            >
              <ChevronUp className="h-4 w-4 mr-1" />
              提高优先级
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                const newPriority = credential.priority + 1
                setPriority.mutate(
                  { id: credential.id, priority: newPriority },
                  {
                    onSuccess: (res) => toast.success(res.message),
                    onError: (err) => toast.error('操作失败: ' + (err as Error).message),
                  }
                )
              }}
              disabled={setPriority.isPending}
            >
              <ChevronDown className="h-4 w-4 mr-1" />
              降低优先级
            </Button>
            <Button
              size="sm"
              variant="default"
              onClick={() => onViewBalance(credential.id)}
            >
              <Wallet className="h-4 w-4 mr-1" />
              查看余额
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={openProxyDialog}
            >
              <Settings2 className="h-4 w-4 mr-1" />
              {credential.hasProxy ? '编辑代理' : '设置代理'}
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => setShowDeleteDialog(true)}
              disabled={!credential.disabled}
              title={!credential.disabled ? '需要先禁用凭据才能删除' : undefined}
            >
              <Trash2 className="h-4 w-4 mr-1" />
              删除
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* 删除确认对话框 */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确认删除凭据</DialogTitle>
            <DialogDescription>
              您确定要删除账号“{displayName}”吗？此操作无法撤销。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowDeleteDialog(false)}
              disabled={deleteCredential.isPending}
            >
              取消
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleteCredential.isPending || !credential.disabled}
            >
              确认删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 代理配置对话框 */}
      <Dialog open={showProxyDialog} onOpenChange={setShowProxyDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{credential.hasProxy ? '编辑代理配置' : '设置代理配置'}</DialogTitle>
            <DialogDescription>
              代理只对账号“{displayName}”生效，不会修改该账号的 Token。支持 HTTP、HTTPS、SOCKS5 和 direct。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <label htmlFor={`proxy-profile-${credential.id}`} className="text-sm font-medium">
                选择代理库
              </label>
              <select
                id={`proxy-profile-${credential.id}`}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={proxyId}
                onChange={(event) => {
                  setProxyId(event.target.value)
                  setProxyUrl('')
                  setProxyUsername('')
                  setProxyPassword('')
                }}
                disabled={updateProxy.isPending}
              >
                <option value="">不使用代理库，手动填写</option>
                {proxyProfiles.map((profile) => (
                  <option key={profile.id} value={profile.id}>
                    {profile.name}（{profile.url}）
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">
                选择后由代理库统一管理，修改代理库会同步影响引用此代理的账号。
              </p>
            </div>
            <div className="space-y-2">
              <label htmlFor={`proxy-url-${credential.id}`} className="text-sm font-medium">
                代理 URL
              </label>
              <Input
                id={`proxy-url-${credential.id}`}
                placeholder="用户名:密码@主机:端口 或 主机:端口:用户名:密码"
                value={proxyUrl}
                onChange={(event) => setProxyUrl(event.target.value)}
                disabled={updateProxy.isPending || Boolean(proxyId)}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-2">
                <label htmlFor={`proxy-user-${credential.id}`} className="text-sm font-medium">
                  用户名
                </label>
                <Input
                  id={`proxy-user-${credential.id}`}
                  placeholder="可选"
                  value={proxyUsername}
                  onChange={(event) => setProxyUsername(event.target.value)}
                  disabled={updateProxy.isPending || Boolean(proxyId)}
                />
              </div>
              <div className="space-y-2">
                <label htmlFor={`proxy-password-${credential.id}`} className="text-sm font-medium">
                  密码
                </label>
                <Input
                  id={`proxy-password-${credential.id}`}
                  type="password"
                  placeholder="留空保留现有密码"
                  value={proxyPassword}
                  onChange={(event) => setProxyPassword(event.target.value)}
                  disabled={updateProxy.isPending || Boolean(proxyId)}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="destructive"
              onClick={handleClearProxy}
              disabled={updateProxy.isPending || !credential.hasProxy}
            >
              清除代理
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowProxyDialog(false)}
              disabled={updateProxy.isPending}
            >
              取消
            </Button>
            <Button
              type="button"
              onClick={handleUpdateProxy}
              disabled={updateProxy.isPending}
            >
              {updateProxy.isPending ? '保存中...' : '保存代理'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
