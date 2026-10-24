import { Component, Suspense, lazy, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'

const OrderForm = lazy(() => import('order_form/OrderForm'))

class Boundary extends Component<{ children: ReactNode }, { error: string | null }> {
  state = { error: null as string | null }
  static getDerivedStateFromError (e: Error) { return { error: e.message } }
  render () { return this.state.error ? <p role="alert">Order form unavailable: {this.state.error}</p> : this.props.children }
}

function Shell () {
  const mode = new URLSearchParams(location.search).get('validation') === 'server' ? 'server' : 'downloaded'
  return (
    <main style={{ fontFamily: 'system-ui', maxWidth: 560, margin: '24px auto', padding: 16, display: 'grid', gap: 16 }}>
      <header>
        <h1 style={{ fontSize: 22, margin: 0 }}>Shell <small style={{ color: '#888', fontSize: 14 }}>(host)</small></h1>
        <nav style={{ display: 'flex', gap: 12, fontSize: 14 }}>
          <a href="/?validation=downloaded" aria-current={mode === 'downloaded'}>Rules downloaded from the BFF</a>
          <a href="/?validation=server" aria-current={mode === 'server'}>Rules only in the BFF</a>
        </nav>
      </header>
      <Boundary><Suspense fallback={<p>Loading order form…</p>}><OrderForm /></Suspense></Boundary>
    </main>
  )
}

createRoot(document.getElementById('root')!).render(<Shell />)
