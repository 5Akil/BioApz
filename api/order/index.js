var express = require('express')

var router = express.Router()

var controller = require('./order.controller')

const {verifyToken} = require('../../config/token');

router.post('/user-order-history', verifyToken, controller.OrderHistory)
router.get('/order-details/:id', verifyToken, controller.OrderDetail)
router.post('/business-order-history', verifyToken, controller.BusinessOrderHistory)
router.get('/business-order-details/:id', verifyToken, controller.BusinessOrderDetail)
module.exports = router;