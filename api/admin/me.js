import { readAdmin } from '../_lib/session.js';
import { handler } from '../_lib/util.js';

export default handler(['GET'], async (req, res) => {
  res.json({ admin: !!readAdmin(req) });
});
