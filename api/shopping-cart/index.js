var express = require('express')

var router = express.Router()

var controller = require('./shopping-cart.controller')

const {verifyToken} = require('../../config/token');

router.post('/add_to_cart', verifyToken, controller.AddToCart)
router.post('/cart_list', verifyToken, controller.CartList)
router.post('/qty_update', verifyToken, controller.QtyUpdate)
router.post('/remove_product_cart', verifyToken, controller.RemoveProductCart)

module.exports = router;