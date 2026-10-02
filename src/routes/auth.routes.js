import { Router } from 'express';
import { google, logout, requestEmail, verifyEmail } from '../controllers/auth.controller.js';
import { csrfIfAuthenticated, optionalSession } from '../middlewares/auth.js';
import { authVerificationLimit, emailRequestLimit } from '../middlewares/request-security.js';
const router = Router();

router.post('/email/request', emailRequestLimit, requestEmail);
router.post('/email/verify', authVerificationLimit, optionalSession, csrfIfAuthenticated, verifyEmail);
router.post('/google', authVerificationLimit, optionalSession, csrfIfAuthenticated, google);
router.post('/logout', optionalSession, csrfIfAuthenticated, logout);

export default router;
