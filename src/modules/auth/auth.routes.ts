import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { login, refresh, logout } from './auth.controller';
import { register, verifyEmail, resendVerification } from './register.controller';

const router = Router();

// Configure Rate Limiter (10 requests per 15 minutes per IP)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 10, // Limit each IP to 10 requests per window
  standardHeaders: 'draft-7', // standard draft-7 headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  skip: () => process.env.NODE_ENV === 'development',
  message: {
    success: false,
    data: null,
    error: {
      message: 'Too many authentication attempts. Please try again after 15 minutes.',
      code: 'TOO_MANY_REQUESTS',
    },
    meta: {},
  },
});

// Apply rate limiting to all auth endpoints
router.post('/register', authLimiter, register);
router.get('/verify-email', verifyEmail);
router.post('/verify-email/resend', authLimiter, resendVerification);
router.post('/login', authLimiter, login);
router.post('/refresh', authLimiter, refresh);
router.post('/logout', authLimiter, logout);

export default router;
export { router as authRouter };
