var express = require('express')

var router = express.Router()

var controller = require('./gift-card-template.controller')

const {verifyToken} = require('../../config/token');

router.get('/templates', verifyToken, controller.GetGiftCardTemplate)

module.exports = router;