var express = require('express')

var router = express.Router()

var controller = require('./order.controller')

const {verifyToken} = require('../../config/token');
const {authorize} = require('../../helpers/authorize');

router.post('/user/order_history',verifyToken,authorize([2]),controller.OrderHistory)
router.get('/user/order_details/:id',verifyToken,authorize([2]),controller.OrderDetail)
router.post('/business/order_history',verifyToken,authorize([3]),controller.BusinessOrderHistory)
router.get('/business/order_details/:id',verifyToken,authorize([3]),controller.BusinessOrderDetail)
router.post('/user/transaction',authorize([2]),controller.transactionDetails);
router.post('/business/transaction',authorize([3]),controller.businessTransactionDetails);
router.post('/create',authorize([2]),controller.orderCreate);
router.post('/update-status',authorize([3]),controller.updateOrderStatus);
module.exports = router;