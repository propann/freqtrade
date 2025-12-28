const express = require('express');
const authRoutes = require('./auth');
const tenantRoutes = require('./tenants');
const subscriptionRoutes = require('./subscriptions');
const sessionRoutes = require('./sessions');
const auditRoutes = require('./audit');

const router = express.Router();

router.use('/auth', authRoutes);
router.use('/tenants', tenantRoutes);
router.use('/subscription', subscriptionRoutes);
router.use('/sessions', sessionRoutes);
router.use('/audit', auditRoutes);

module.exports = router;
