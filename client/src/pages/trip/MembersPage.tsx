import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, Loader2, Users, Crown, Edit2, Eye } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";

const ROLES = [
  { value: "owner", label: "擁有者", icon: Crown, color: "bg-amber-100 text-amber-700", desc: "完整控制權" },
  { value: "editor", label: "編輯者", icon: Edit2, color: "bg-green-100 text-green-700", desc: "可編輯行程" },
  { value: "viewer", label: "觀看者", icon: Eye, color: "bg-muted text-muted-foreground", desc: "只可查看" },
];

export default function MembersPage({ tripId }: { tripId: number }) {
  const { user } = useAuth();
  const { data: members, refetch, isLoading } = trpc.members.list.useQuery({ tripId }, { refetchInterval: 15000 });
  const { data: trip } = trpc.trips.get.useQuery({ tripId });
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", role: "viewer" as "owner" | "editor" | "viewer" });

  const addMember = trpc.members.add.useMutation({
    onSuccess: () => { refetch(); setShowAdd(false); setForm({ name: "", email: "", role: "viewer" }); toast.success("成員已新增"); },
    onError: (e) => toast.error(e.message || "新增失敗"),
  });
  const updateRole = trpc.members.updateRole.useMutation({
    onSuccess: () => { refetch(); toast.success("角色已更新"); },
    onError: (e) => toast.error(e.message || "更新失敗"),
  });
  const removeMember = trpc.members.remove.useMutation({
    onSuccess: () => { refetch(); toast.success("成員已移除"); },
    onError: (e) => toast.error(e.message || "移除失敗"),
  });

  const myRole = trip?.memberRole;
  const canManage = myRole === "owner";

  const handleAdd = () => {
    if (!form.name) { toast.error("請填寫成員姓名"); return; }
    addMember.mutate({ tripId, ...form });
  };

  if (isLoading) return (
    <div className="flex items-center justify-center py-20">
      <Loader2 className="w-8 h-8 text-primary animate-spin" />
    </div>
  );

  return (
    <div className="px-4 sm:px-6 py-6 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-foreground">成員管理</h2>
          <p className="text-muted-foreground text-sm mt-0.5">{members?.length ?? 0} 位成員</p>
        </div>
        {canManage && (
          <Button onClick={() => setShowAdd(true)} size="sm" className="gap-1.5">
            <Plus className="w-4 h-4" />邀請成員
          </Button>
        )}
      </div>

      {/* Role legend */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        {ROLES.map(r => {
          const Icon = r.icon;
          return (
            <div key={r.value} className="bg-card rounded-xl border border-border p-3 text-center">
              <div className={`w-8 h-8 rounded-full ${r.color} flex items-center justify-center mx-auto mb-1.5`}>
                <Icon className="w-4 h-4" />
              </div>
              <p className="text-xs font-semibold text-foreground">{r.label}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">{r.desc}</p>
            </div>
          );
        })}
      </div>

      {/* Members list */}
      {!members || members.length === 0 ? (
        <div className="text-center py-16">
          <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
            <Users className="w-8 h-8 text-muted-foreground" />
          </div>
          <p className="text-muted-foreground">還沒有成員</p>
        </div>
      ) : (
        <div className="space-y-3">
          {members.map(member => {
            const roleInfo = ROLES.find(r => r.value === member.role) ?? ROLES[2];
            const RoleIcon = roleInfo.icon;
            const isMe = member.userId === user?.id;
            return (
              <div key={member.id} className="bg-card rounded-xl border border-border p-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold shrink-0">
                  {member.name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-foreground text-sm">{member.name}</p>
                    {isMe && <span className="px-1.5 py-0.5 rounded text-[10px] bg-primary/10 text-primary font-medium">你</span>}
                  </div>
                  {member.email && <p className="text-xs text-muted-foreground mt-0.5">{member.email}</p>}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {canManage && !isMe ? (
                    <Select
                      value={member.role}
                      onValueChange={(v) => updateRole.mutate({ memberId: member.id, tripId, role: v as any })}
                    >
                      <SelectTrigger className={`h-8 text-xs px-2 border-0 ${roleInfo.color}`}>
                        <div className="flex items-center gap-1">
                          <RoleIcon className="w-3 h-3" />
                          <SelectValue />
                        </div>
                      </SelectTrigger>
                      <SelectContent>
                        {ROLES.map(r => (
                          <SelectItem key={r.value} value={r.value}>
                            <div className="flex items-center gap-2">
                              <r.icon className="w-3.5 h-3.5" />
                              {r.label}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <span className={`px-2 py-1 rounded-full text-xs font-medium flex items-center gap-1 ${roleInfo.color}`}>
                      <RoleIcon className="w-3 h-3" />
                      {roleInfo.label}
                    </span>
                  )}
                  {canManage && !isMe && (
                    <button
                      onClick={() => removeMember.mutate({ memberId: member.id, tripId })}
                      className="p-1.5 rounded-lg hover:bg-destructive/10 transition-colors"
                    >
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add Member Dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>邀請成員</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div>
              <Label>姓名 *</Label>
              <Input className="mt-1.5" placeholder="成員姓名" value={form.name} onChange={e => setForm({...form, name: e.target.value})} />
            </div>
            <div>
              <Label>電郵（選填）</Label>
              <Input className="mt-1.5" type="email" placeholder="email@example.com" value={form.email} onChange={e => setForm({...form, email: e.target.value})} />
            </div>
            <div>
              <Label>角色</Label>
              <Select value={form.role} onValueChange={v => setForm({...form, role: v as any})}>
                <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ROLES.map(r => (
                    <SelectItem key={r.value} value={r.value}>
                      <div className="flex items-center gap-2">
                        <r.icon className="w-4 h-4" />
                        <div>
                          <span className="font-medium">{r.label}</span>
                          <span className="text-muted-foreground ml-2 text-xs">{r.desc}</span>
                        </div>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button className="w-full" onClick={handleAdd} disabled={addMember.isPending}>
              {addMember.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              邀請成員
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
