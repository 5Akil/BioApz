var express = require('express')

var router = express.Router()

var controller = require('./order.controller')

const {verifyToken} = require('../../config/token');

router.post('/user/order_history', verifyToken, controller.OrderHistory)
router.get('/user/order_details/:id', verifyToken, controller.OrderDetail)
router.post('/business/order_history', verifyToken, controller.BusinessOrderHistory)
router.get('/business/order_details/:id', verifyToken, controller.BusinessOrderDetail)
module.exports = router;