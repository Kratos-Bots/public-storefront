import { Navigate, useParams } from 'react-router';
import { accountOrderPath } from '@/features/checkout/outcome.ts';

/**
 * `/order/:ref/:accessKey` used to be the order's own page. The backend still writes that address into order
 * emails and uses it as the return address of hosted payments, so it has to lead somewhere: the customer's
 * order page. The account guard sends a signed-out visitor through sign-in and back. The key is not used.
 */
export function OrderLinkRedirect() {
  const { ref } = useParams<{ ref: string }>();
  return <Navigate to={ref ? accountOrderPath(ref) : '/account/orders'} replace />;
}
