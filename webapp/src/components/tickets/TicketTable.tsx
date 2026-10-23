import { Link } from 'react-router'
import {
  displayName,
  formatDate,
  type Category,
  type Ticket,
  type User,
} from '../../services/client.ts'
import { PriorityBadge, StatusBadge } from './TicketBadges.tsx'

const ticketTableStyles = String.raw`
.ticket-link { display:grid; gap:4px; color:var(--ink); }.ticket-link strong { max-width:260px; overflow:hidden; font-size:12px; font-weight:650; text-overflow:ellipsis; }.ticket-link small { color:#9aa59f; font-size:10px; }
`

export const TicketTable = ({
  tickets,
  categories,
  users,
}: {
  tickets: Ticket[]
  categories: Category[]
  users: User[]
}) => {
  const userName = (id: string | null) => {
    if (!id) return '未分配'
    const user = users.find((candidate) => candidate.id === id)
    return user ? displayName(user) : id.slice(0, 8)
  }

  return (
    <div className="table-scroll">
      <style>{ticketTableStyles}</style>
      <table>
        <thead>
          <tr>
            <th>工单</th>
            <th>状态</th>
            <th>优先级</th>
            <th>分类</th>
            <th>提交人</th>
            <th>处理人</th>
            <th>创建时间</th>
          </tr>
        </thead>
        <tbody>
          {tickets.map((ticket) => (
            <tr key={ticket.id}>
              <td>
                <Link className="ticket-link" to={`/tickets/${ticket.id}`}>
                  <strong>{ticket.title}</strong>
                  <small>#{ticket.id.slice(0, 8)}</small>
                </Link>
              </td>
              <td>
                <StatusBadge status={ticket.status} />
              </td>
              <td>
                <PriorityBadge priority={ticket.priority} />
              </td>
              <td>
                {categories.find((category) => category.id === ticket.categoryId)?.name ?? '—'}
              </td>
              <td>{userName(ticket.requesterId)}</td>
              <td>{userName(ticket.handlerId)}</td>
              <td>{formatDate(ticket.createdAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
