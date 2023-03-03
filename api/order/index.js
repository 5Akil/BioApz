var express = require('express')

var router = express.Router()

var controller = require('./order.controller')

const {verifyToken} = require('../../config/token');

router.post('/order-history', verifyToken, controller.OrderHistory)
module.exports = router;