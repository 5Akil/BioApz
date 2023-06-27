var express = require('express')

var router = express.Router()

var controller = require('./wishlist.controller')

const {verifyToken} = require('../../config/token');

router.post('/add_to_wishlist', verifyToken, controller.AddToWishList)
router.post('/wishlist_data/:id', verifyToken, controller.wishlistData)
router.post('/remove_product_wishlist', verifyToken, controller.RemoveProductWishlist)
router.post('/add_to_cart', verifyToken, controller.AddToCart)

module.exports = router;