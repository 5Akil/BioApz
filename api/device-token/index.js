var express = require('express')
var router = express.Router()
var controller = require('./device-token.controller')
const {verifyToken} = require('../../config/token');
const {authorize} = require('../../helpers/authorize');

router.post('/create', verifyToken,authorize([2,3]), controller.deviceToken);

module.exports = router;