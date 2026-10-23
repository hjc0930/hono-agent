import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import App from './App.tsx'

vi.mock('./hooks/useAuth.tsx', () => ({
  useAuth: () => ({
    session: { user: { id: 'test-user', username: 'test-user', role: 'user' } },
  }),
}))

const renderRoute = (path: string) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  try {
    return renderToStaticMarkup(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={[path]}>
          <App />
        </MemoryRouter>
      </QueryClientProvider>,
    )
  } finally {
    client.clear()
  }
}

describe('ticket page hierarchy', () => {
  it('keeps the ticket list and creation entry on the parent page', () => {
    const html = renderRoute('/tickets')

    expect(html).toContain('<h1>工单</h1>')
    expect(html).toContain('筛选工单')
    expect(html).toContain('href="/tickets/new"')
    expect(html).not.toContain('aria-label="面包屑"')
    expect(html).not.toContain('<h1>新建工单</h1>')
  })

  it('renders the creation child page with parent navigation and no list', () => {
    const html = renderRoute('/tickets/new')

    expect(html).toContain('<h1>新建工单</h1>')
    expect(html).toMatch(
      /<nav aria-label="面包屑"[^>]*>.*href="\/tickets".*工单.*aria-current="page">新建工单<\/span><\/nav>/,
    )
    expect(html).toMatch(/<a class="button button-secondary" href="\/tickets"[^>]*>← 返回工单<\/a>/)
    expect(html).toMatch(
      /<a[^>]*aria-current="page"[^>]*class="nav-link active"[^>]*href="\/tickets"/,
    )
    expect(html).not.toContain('筛选工单')
    expect(html).not.toContain('<h1>工单</h1>')
  })
})
