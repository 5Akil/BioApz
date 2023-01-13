var express = require('express')

var router = express.Router();

var controller = require('./common.controller');
const {verifyToken} = require('../../config/token');

router.post('/product-search', controller.ProductTableSearch);
router.post('/business-search', controller.RecommendedBusinessSearch);
router.post('/product-filter', controller.FilterProducts)
router.get('/chat-notification', controller.ChatNotification);
router.post('/searching', controller.Searching)
router.post('/delete', verifyToken, controller.DeleteProductOffers)

module.exports = router;