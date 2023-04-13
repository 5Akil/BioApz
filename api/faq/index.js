var express = require('express')

var router = express.Router()
const uuidv1 = require('uuid/v1');
const moment = require('moment')
var awsConfig = require('../../config/aws_S3_config');

var controller = require('./faq.controller')

const {verifyToken} = require('../../config/token');


router.post('/storeFaq', verifyToken, controller.StoreFaq)
router.post('/faqList', verifyToken, controller.GetFaqList)
router.get('/getFaqById/:id', verifyToken, controller.GetFaqById)
router.post('/updateFaq', verifyToken, controller.UpdateFaq)
router.delete('/removeFaq/:id', verifyToken, controller.RemoveFaq)

module.exports = router;