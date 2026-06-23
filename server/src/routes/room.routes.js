import { Router } from 'express';
import { asyncHandler } from '../middleware/error.js';
import { requireAuth } from '../middleware/auth.js';
import { create, get, join, leave } from '../controllers/room.controller.js';

const router = Router();

// All room routes require auth.
router.use(requireAuth);

router.post('/', asyncHandler(create));
router.get('/:id', asyncHandler(get));
router.post('/:id/join', asyncHandler(join));
router.post('/:id/leave', asyncHandler(leave));

export default router;
