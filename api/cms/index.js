var express = require('express')

var router = express.Router()
const uuidv1 = require('uuid/v1');
const moment = require('moment')
var awsConfig = require('../../config/aws_S3_config');

var controller = require('./cms.controller')

const {verifyToken} = require('../../config/token');

router.post('/add-cms', verifyToken, controller.AddCms)
router.post('/get-cms-page-details', verifyToken, controller.GetPageDetails)
router.post('/update-cms-page-data',verifyToken,controller.UpdatePageData)

module.exports = router;