import { Router } from 'express';
import { requireSession } from '../middlewares/auth.js';
import { dashboard } from '../services/dashboard.service.js';
const router = Router();
router.get('/me/dashboard', requireSession, async (req, res) => res.json(await dashboard(req.auth, req.query)));
export default router;
