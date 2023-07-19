var express = require('express')

var router = express.Router()
var controller = require('./cms.controller')
const {verifyToken} = require('../../config/token');
const {authorize} = require('../../helpers/authorize');

router.post('/create', verifyToken, authorize([3]), controller.createCMS)
router.post('/view', verifyToken, authorize([2,3]), controller.viewCMS)
router.post('/update',verifyToken, authorize([3]),controller.updateCMS)

module.exports = router;