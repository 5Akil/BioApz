var express = require('express')
var router = express.Router()
const { verifyToken } = require('../../config/token');
const {commonRewardsView} = require('../gift-cards/gift-cards.controller')
const {authorize} = require('../../helpers/authorize');


// Loyalty Cards Section START
var controller = require('./loyalty-token-cardcontroller')
// var viewController = require('../gift-cards.controller')

// Loyalty Card Routes
router.post('/create', verifyToken, authorize([3]), controller.loyaltyTokenCardCreate)
router.delete('/delete/:id', verifyToken, authorize([3]), controller.loyaltyTokenCardDelete)
router.post('/update', verifyToken, authorize([3]), controller.loyaltyTokenCardUpdate)
router.post('/list',verifyToken,authorize([3]),controller.loyaltyTokenCardList)
router.get('/view/:id',verifyToken,authorize([3]),commonRewardsView)

router.post('/performance' , verifyToken , authorize([3]) , controller.loyaltyTokenCardPerformance)
router.get('/icons',verifyToken,authorize([3]) ,controller.getLoyaltyTokenCardIcon)

module.exports = router;
