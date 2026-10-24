// Types for the components MFEs load from each other at runtime (Module Federation remotes).
// Declared by hand so every MFE builds and type-checks without the other MFEs running.
declare module 'bank_form/BankFields' {
  const BankFields: () => import('react').JSX.Element
  export default BankFields
}
declare module 'order_form/OrderForm' {
  const OrderForm: () => import('react').JSX.Element
  export default OrderForm
}
