import CustomerOrderDetail from '../../../../../components/Account/CustomerOrderDetail';

export const metadata = { title: 'Your receipt' };
export default async function CustomerOrderPage({ params }) {
  const { id } = await params;
  return <CustomerOrderDetail orderId={id} />;
}
