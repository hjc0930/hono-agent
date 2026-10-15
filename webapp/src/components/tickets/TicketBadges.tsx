import type { Priority, TicketStatus } from '../../apis/client.ts'

const badgeStyles = String.raw`
.badge { display:inline-flex; min-height:23px; align-items:center; padding:0 8px; border:1px solid transparent; border-radius:999px; font-size:10px; font-weight:700; white-space:nowrap; }
.status-pending { border-color:#f1e5c8; background:#fff9e9; color:#9a741f; }.status-in_progress { border-color:#d5e5f6; background:#eef6ff; color:#3971aa; }.status-resolved { border-color:#d4e9dc; background:#eef8f1; color:#368055; }.status-closed { border-color:#e1e5e3; background:#f4f6f5; color:#67736d; }.status-cancelled { border-color:#f1d9d6; background:#fff2f0; color:#ad554c; }
.priority-low { border-color:#e1e8e4; background:#f8faf9; color:#718078; }.priority-medium { border-color:#d7e8e0; background:#f0f8f4; color:#47836b; }.priority-high { border-color:#f1e5c8; background:#fff9e9; color:#a47a20; }.priority-urgent { border-color:#f0d3ce; background:#fff1ee; color:#b14f42; }
`

const statusLabels: Record<TicketStatus, string> = { pending: '待处理', in_progress: '处理中', resolved: '已解决', closed: '已关闭', cancelled: '已取消' }
const priorityLabels: Record<Priority, string> = { low: '低', medium: '中', high: '高', urgent: '紧急' }

export const TicketBadgeStyles = () => <style>{badgeStyles}</style>

export const StatusBadge = ({ status }: { status: TicketStatus }) => (
  <span className={`badge status-${status}`}><TicketBadgeStyles />{statusLabels[status]}</span>
)

export const PriorityBadge = ({ priority }: { priority: Priority }) => (
  <span className={`badge priority-${priority}`}><TicketBadgeStyles />{priorityLabels[priority]}</span>
)
