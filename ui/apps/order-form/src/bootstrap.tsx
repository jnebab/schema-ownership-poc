import { createRoot } from 'react-dom/client'
import OrderForm from './OrderForm'

createRoot(document.getElementById('root')!).render(<main style={{ fontFamily: 'system-ui', maxWidth: 560, margin: '24px auto' }}><OrderForm /></main>)
