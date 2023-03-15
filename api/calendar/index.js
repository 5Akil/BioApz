var express = require('express')

var router = express.Router()
var multer = require('multer');
const multerS3 = require('multer-s3');
const uuidv1 = require('uuid/v1');
const moment = require('moment')
var awsConfig = require('../../config/aws_S3_config');

const uploadImage = multer({ dest: 'combos/' });

var controller = require('./calendar.controller')

const {verifyToken} = require('../../config/token');

router.post('/combos', verifyToken, uploadImage.array('images'), controller.ComboCalendar)
router.post('/getCombos', verifyToken, controller.GetComboOffers)
router.post('/updateCombos', verifyToken, uploadImage.array('images'), controller.UpdateComboOffer)
router.post('/removeImages', verifyToken, controller.removeImagesFromCombo);

module.exports = router;
