import { useEffect, useState } from 'react'
import { Gauge, MapPin, Pencil, Plus, RefreshCw, Trash2, Wifi } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  useAddProxyProfile,
  useDeleteProxyProfile,
  useProxyProfiles,
  useUpdateProxyProfile,
  useTestProxyProfile,
} from '@/hooks/use-credentials'
import type { ProxyProfileStatus, ProxyTestResponse } from '@/types/api'

interface ProxyPoolDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ProxyPoolDialog({ open, onOpenChange }: ProxyPoolDialogProps) {
  const { data: profiles = [], isLoading } = useProxyProfiles()
  const addProxy = useAddProxyProfile()
  const updateProxy = useUpdateProxyProfile()
  const deleteProxy = useDeleteProxyProfile()
  const testProxy = useTestProxyProfile()
  const [editing, setEditing] = useState<ProxyProfileStatus | null>(null)
  const [name, setName] = useState('')
  const [proxyInput, setProxyInput] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [testResults, setTestResults] = useState<Record<number, ProxyTestResponse>>({})
  const [testingId, setTestingId] = useState<number | null>(null)

  useEffect(() => {
    if (!open) {
      setEditing(null)
      setName('')
      setProxyInput('')
      setUsername('')
      setPassword('')
    }
  }, [open])

  const startEdit = (profile: ProxyProfileStatus) => {
    setEditing(profile)
    setName(profile.name)
    setProxyInput(profile.url)
    setUsername(profile.username || '')
    setPassword('')
  }

  const resetForm = () => {
    setEditing(null)
    setName('')
    setProxyInput('')
    setUsername('')
    setPassword('')
  }

  const handleSave = async () => {
    const lines = proxyInput
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)

    if (!lines.length || (editing && lines.length !== 1)) {
      toast.error(editing ? '编辑时只能填写一条代理地址' : '请输入至少一条代理地址')
      return
    }

    if (editing) {
      updateProxy.mutate(
        {
          id: editing.id,
          request: {
            name: name.trim() || editing.name,
            proxy: lines[0],
            username: username.trim() || undefined,
            password: password || undefined,
          },
        },
        {
          onSuccess: (response) => {
            toast.success(response.message)
            resetForm()
          },
          onError: (error) => toast.error('代理保存失败: ' + (error as Error).message),
        }
      )
      return
    }

    const baseName = name.trim()
    const failures: string[] = []
    let created = 0
    for (const [index, line] of lines.entries()) {
      const itemName = baseName
        ? (lines.length === 1 ? baseName : `${baseName} ${index + 1}`)
        : `代理 ${index + 1}`
      try {
        await addProxy.mutateAsync({ name: itemName, proxy: line })
        created += 1
      } catch (error) {
        failures.push(`${itemName}: ${(error as Error).message}`)
      }
    }
    if (created) {
      toast.success(`成功添加 ${created} 条代理`)
      resetForm()
    }
    if (failures.length) {
      toast.error(`有 ${failures.length} 条代理添加失败：${failures.join('；')}`)
    }
  }

  const handleDelete = (profile: ProxyProfileStatus) => {
    if (!confirm(`确定删除代理“${profile.name}”吗？正在使用它的账号会阻止删除。`)) return
    deleteProxy.mutate(profile.id, {
      onSuccess: (response) => {
        toast.success(response.message)
        setTestResults((current) => {
          const next = { ...current }
          delete next[profile.id]
          return next
        })
      },
      onError: (error) => toast.error('代理删除失败: ' + (error as Error).message),
    })
  }

  const handleTest = (profile: ProxyProfileStatus) => {
    setTestingId(profile.id)
    testProxy.mutate(profile.id, {
      onSuccess: (response) => {
        setTestResults((current) => ({ ...current, [profile.id]: response }))
        if (response.success) {
          toast.success(`${profile.name}：${response.message}`)
        } else {
          toast.error(`${profile.name}：${response.message}`)
        }
      },
      onError: (error) => toast.error('代理测试失败: ' + (error as Error).message),
      onSettled: () => setTestingId(null),
    })
  }

  const pending = addProxy.isPending || updateProxy.isPending || deleteProxy.isPending

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>代理库</DialogTitle>
          <DialogDescription>
            代理保存后可被多个账号复用。支持单行或多行粘贴，格式为“用户名:密码@主机:端口”或“主机:端口:用户名:密码”，不带协议时默认 HTTP。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 max-h-64 overflow-y-auto">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">加载中...</p>
          ) : profiles.length === 0 ? (
            <p className="text-sm text-muted-foreground">还没有代理，请在下方添加。</p>
          ) : (
            profiles.map((profile) => {
              const result = testResults[profile.id]
              const isTesting = testingId === profile.id
              const location = [result?.countryCode || result?.country, result?.region, result?.city]
                .filter(Boolean)
                .join(' · ')
              return (
                <div key={profile.id} className="rounded-md border p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-medium truncate">{profile.name}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        {profile.url}{profile.username ? ` · ${profile.username}` : ''}{profile.hasPassword ? ' · 已设置密码' : ''}
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <Button size="sm" variant="outline" onClick={() => handleTest(profile)} disabled={pending || testingId !== null}>
                        {isTesting ? <RefreshCw className="h-4 w-4 mr-1 animate-spin" /> : <Wifi className="h-4 w-4 mr-1" />}
                        {isTesting ? '测试中' : '测试'}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => startEdit(profile)} disabled={pending || testingId !== null}>
                        <Pencil className="h-4 w-4 mr-1" />编辑
                      </Button>
                      <Button size="sm" variant="destructive" onClick={() => handleDelete(profile)} disabled={pending || testingId !== null}>
                        <Trash2 className="h-4 w-4 mr-1" />删除
                      </Button>
                    </div>
                  </div>
                  {result && (
                    <div className={`mt-2 rounded border px-2 py-1.5 text-xs ${result.success ? 'border-green-200 bg-green-50 text-green-800 dark:border-green-900 dark:bg-green-950 dark:text-green-200' : 'border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200'}`}>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span className="font-medium">{result.success ? '可用' : '不可用'}</span>
                        {result.latencyMs != null && <span className="inline-flex items-center gap-1"><Gauge className="h-3.5 w-3.5" />{result.latencyMs} ms</span>}
                        {result.ipAddress && <span>出口 IP：{result.ipAddress}</span>}
                        {location && <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{location}</span>}
                        {result.success && !location && <span>位置未知</span>}
                      </div>
                      {result.locationError && <div className="mt-1 opacity-80">{result.locationError}</div>}
                      {!result.success && <div className="mt-1">{result.message}</div>}
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>

        <div className="space-y-3 border-t pt-4">
          <div className="font-medium">{editing ? `编辑代理 #${editing.id}` : '添加代理'}</div>
          <Input placeholder="代理名称（多行时作为名称前缀，可留空）" value={name} onChange={(event) => setName(event.target.value)} disabled={pending} />
          <textarea
            className="flex min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            placeholder={'用户名:密码@主机:端口\n或 主机:端口:用户名:密码'}
            value={proxyInput}
            onChange={(event) => setProxyInput(event.target.value)}
            disabled={pending}
            rows={editing ? 1 : 4}
          />
          {editing && (
            <div className="grid grid-cols-2 gap-2">
              <Input placeholder="用户名（可选）" value={username} onChange={(event) => setUsername(event.target.value)} disabled={pending} />
              <Input type="password" placeholder="留空保留现有密码" value={password} onChange={(event) => setPassword(event.target.value)} disabled={pending} />
            </div>
          )}
        </div>

        <DialogFooter>
          {editing && (
            <Button variant="ghost" onClick={resetForm} disabled={pending}>取消编辑</Button>
          )}
          <Button onClick={handleSave} disabled={pending}>
            {editing ? '保存修改' : <><Plus className="h-4 w-4" />添加代理</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
