import { Component, Suspense, lazy, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'

const OrderForm = lazy(() => import('order_form/OrderForm'))

class Boundary extends Component<{ children: ReactNode }, { error: string | null }> {
  state = { error: null as string | null }
  static getDerivedStateFromError (e: Error) { return { error: e.message } }
  render () { return this.state.error ? <p role="alert">Order form unavailable: {this.state.error}</p> : this.props.children }
}

function Shell () {
  return (
    <main style={{ fontFamily: 'system-ui', maxWidth: 560, margin: '24px auto', padding: 16, display: 'grid', gap: 16 }}>
      <header>
        <h1 style={{ fontSize: 22, margin: 0 }}>Shell <small style={{ color: '#888', fontSize: 14 }}>(host)</small></h1>
        <p style={{ fontSize: 13, margin: '4px 0 0' }}>BFF-owned schemas, compiled into each MFE from the linked BFF repo.</p>
      </header>
      <Boundary><Suspense fallback={<p>Loading order form…</p>}><OrderForm /></Suspense></Boundary>
    </main>
  )
}

createRoot(document.getElementById('root')!).render(<Shell />)
