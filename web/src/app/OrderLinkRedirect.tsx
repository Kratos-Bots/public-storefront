import { Navigate, useParams } from 'react-router';
import { useSettings } from '@/app/settings.ts';
import { accountOrderPath } from '@/features/checkout/outcome.ts';

/**
 * `/order/:ref/:accessKey` used to be the order's own page. The backend still writes that address into order
 * emails and uses it as the return address of hosted payments, so it has to lead somewhere: the customer's
 * order page. The account guard sends a signed-out visitor through sign-in and back. A shop with accounts off
 * has no order page (the guard would answer 404), so there the link ends on the neutral order-placed page, which
 * shows the reference and the shop's contact links. The key is not used.
 */
export function OrderLinkRedirect() {
  const { ref } = useParams<{ ref: string }>();
  const { features } = useSettings();
  if (!ref) return <Navigate to="/account/orders" replace />;
  if (!features.accounts) return <Navigate to={`/order-placed?${new URLSearchParams({ order: ref })}`} replace />;
  return <Navigate to={accountOrderPath(ref)} replace />;
}
