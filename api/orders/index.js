import { sql, ensureSchema } from '../_lib/db.js';
import { requireCustomer } from '../_lib/session.js';
import { handler } from '../_lib/util.js';

export default handler(['GET'], async (req, res) => {
  await ensureSchema();
  const user = requireCustomer(req);
  const rows = await sql()`
    SELECT public_id, items, total_pence, currency, status, created_at
    FROM orders WHERE user_id = ${user.uid}
    ORDER BY created_at DESC LIMIT 50`;
  res.json({ orders: rows });
});
