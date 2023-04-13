var express = require('express')

var router = express.Router()
const uuidv1 = require('uuid/v1');
const moment = require('moment')
var awsConfig = require('../../config/aws_S3_config');

var controller = require('./setting.controller')

const {verifyToken} = require('../../config/token');

router.post('/add-setting-data', verifyToken, controller.AddSettingData)
router.post('/get-setting-data', verifyToken, controller.GetSettingDetails)
router.post('/update-setting-data',verifyToken,controller.UpdateSettingData)
module.exports = router;