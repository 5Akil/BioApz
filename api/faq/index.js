var express = require('express')
var router = express.Router();
var controller = require('./faq.controller');
const {verifyToken} = require('../../config/token');
const {authorize} = require('../../helpers/authorize');


router.post('/create', verifyToken, authorize([3]), controller.StoreFaq)
router.post('/list', verifyToken, authorize([2,3]), controller.GetFaqList)
router.get('/view/:id', verifyToken, authorize([2,3]), controller.GetFaqById)
router.post('/update', verifyToken, authorize([3]), controller.UpdateFaq)
router.delete('/delete/:id', verifyToken, authorize([3]), controller.RemoveFaq)

module.exports = router;