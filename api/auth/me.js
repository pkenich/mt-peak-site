import { readCustomer } from '../_lib/session.js';
import { handler } from '../_lib/util.js';

export default handler(['GET'], async (req, res) => {
  const s = readCustomer(req);
  res.json(s ? { user: { email: s.email, name: s.name } } : { user: null });
});
