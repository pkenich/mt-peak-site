import { sql, ensureSchema } from '../_lib/db.js';
import { requireCustomer } from '../_lib/session.js';
import { handler } from '../_lib/util.js';

/* Full order history for the customer dashboard, with each order's review
   and latest refund-request status folded in. */
export default handler(['GET'], async (req, res) => {
  await ensureSchema();
  const user = requireCustomer(req);
  const rows = await sql()`
    SELECT o.id, o.public_id, o.items, o.total_pence, o.discount_pence, o.currency,
           o.status, o.created_at, o.shipping, o.gift_note,
           r.rating, r.shipping_rating, r.body AS review_body,
           rf.status AS refund_status
    FROM orders o
    LEFT JOIN reviews r ON r.order_id = o.id
    LEFT JOIN LATERAL (
      SELECT status FROM refunds WHERE order_id = o.id ORDER BY created_at DESC LIMIT 1
    ) rf ON true
    WHERE o.user_id = ${user.uid}
    ORDER BY o.created_at DESC LIMIT 100`;
  res.json({ orders: rows });
});
