import { clearAdmin } from '../_lib/session.js';
import { handler } from '../_lib/util.js';

export default handler(['POST'], async (req, res) => {
  clearAdmin(res);
  res.json({ ok: true });
});
