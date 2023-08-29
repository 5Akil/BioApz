var express = require('express');
var router = express.Router();
const {verifyToken} = require('../../config/token');
const {authorize} = require('../../helpers/authorize');
var controller = require('./notification.controller');

router.post('/list', verifyToken, authorize([2,3]), controller.list);
router.post('/markAsRead', verifyToken, authorize([2,3]), controller.markAsRead);
router.post('/delete', verifyToken, authorize([2,3]), controller.delete);

module.exports = router;