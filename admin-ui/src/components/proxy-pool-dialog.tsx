import { useEffect, useState } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'
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
} from '@/hooks/use-credentials'
import type { ProxyProfileStatus } from '@/types/api'

interface ProxyPoolDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ProxyPoolDialog({ open, onOpenChange }: ProxyPoolDialogProps) {
  const { data: profiles = [], isLoading } = useProxyProfiles()
  const addProxy = useAddProxyProfile()
  const updateProxy = useUpdateProxyProfile()
  const deleteProxy = useDeleteProxyProfile()
  const [editing, setEditing] = useState<ProxyProfileStatus | null>(null)
  const [name, setName] = useState('')
  const [proxyInput, setProxyInput] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')

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
      onSuccess: (response) => toast.success(response.message),
      onError: (error) => toast.error('代理删除失败: ' + (error as Error).message),
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
            profiles.map((profile) => (
              <div key={profile.id} className="flex items-center justify-between gap-3 rounded-md border p-3">
                <div className="min-w-0">
                  <div className="font-medium truncate">{profile.name}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {profile.url}{profile.username ? ` · ${profile.username}` : ''}{profile.hasPassword ? ' · 已设置密码' : ''}
                  </div>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button size="sm" variant="outline" onClick={() => startEdit(profile)} disabled={pending}>
                    <Pencil className="h-4 w-4 mr-1" />编辑
                  </Button>
                  <Button size="sm" variant="destructive" onClick={() => handleDelete(profile)} disabled={pending}>
                    <Trash2 className="h-4 w-4 mr-1" />删除
                  </Button>
                </div>
              </div>
            ))
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
