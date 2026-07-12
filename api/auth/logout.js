import { clearCustomer } from '../_lib/session.js';
import { handler } from '../_lib/util.js';

export default handler(['POST'], async (req, res) => {
  clearCustomer(res);
  res.json({ ok: true });
});
